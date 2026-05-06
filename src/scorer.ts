// src/scorer.ts — rankings cache + scorecard signing.
//
// Signing strategy (Phase 1 of TrustBench-strategy.md):
//   - When TRUSTBENCH_SIGNING_PRIVATE_KEY + TRUSTBENCH_SIGNING_PUBLIC_KEY are set
//     (PEM, with newlines escaped as \n in the env var), scorecards are signed with
//     Ed25519 and the public key is published at /.well-known/trustbench-pubkey.
//     Anyone in the world can verify a TrustBench scorecard without ever contacting
//     us — that's the point: a scorecard signature must be a public reputation
//     primitive, not internal-integrity-only.
//   - When those env vars are not set, we fall back to HMAC-SHA256 with a
//     SIGNING_SECRET. HMAC is fine for local dev, but in production it proves
//     nothing to third parties (anyone with the secret can forge), and we log a
//     warning at boot saying so. Generate a key pair with `npm run keygen`.

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { Redis } from 'ioredis';
import crypto from 'crypto';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const redis = new Redis(process.env.UPSTASH_REDIS_URL!, {
  maxRetriesPerRequest: null,
  retryStrategy: (times) => Math.min(times * 50, 2000)
});

redis.on('error', () => console.log('⚠️ Redis connection lost – falling back to DB'));

// ---------------------------------------------------------------------------
// Key loading — lazy, runs once on first sign call so a missing key doesn't
// crash boot for unrelated routes (e.g. /health) on a fresh deployment.
type SigningMethod = 'ed25519' | 'hmac';
let _privateKey: crypto.KeyObject | null = null;
let _publicKeyPem: string | null = null;
let _signingMethod: SigningMethod | null = null;

function loadKeys(): SigningMethod {
  if (_signingMethod !== null) return _signingMethod;

  const privEnv = process.env.TRUSTBENCH_SIGNING_PRIVATE_KEY;
  const pubEnv = process.env.TRUSTBENCH_SIGNING_PUBLIC_KEY;

  if (privEnv && pubEnv) {
    try {
      // Env vars don't preserve newlines — accept either real \n or escaped \\n.
      const privPem = privEnv.replace(/\\n/g, '\n');
      const pubPem = pubEnv.replace(/\\n/g, '\n');

      _privateKey = crypto.createPrivateKey({ key: privPem, format: 'pem' });
      _publicKeyPem = pubPem;
      _signingMethod = 'ed25519';
      console.log('🔐 Scorecard signing: Ed25519 (publicly verifiable)');
      return _signingMethod;
    } catch (e) {
      console.warn('⚠️ Failed to load Ed25519 keys, falling back to HMAC:', (e as Error).message);
    }
  }

  _signingMethod = 'hmac';
  console.warn(
    '⚠️ Scorecard signing: HMAC-SHA256 fallback (server-internal only). ' +
    'Set TRUSTBENCH_SIGNING_PRIVATE_KEY + TRUSTBENCH_SIGNING_PUBLIC_KEY for ' +
    'publicly verifiable Ed25519 signatures. Generate with `npm run keygen`.'
  );
  return _signingMethod;
}

// ---------------------------------------------------------------------------
// Public API
export async function getRankings(capability: string) {
  // Cache key bumped to v3 (2026-05-05) to add `integration_type` per row
  // (Coinbase Agentic Market 1P/3P signal, alongside our existing x402_verified
  // empirical bit). The v2 keys age out within 5 minutes; harmless orphan data.
  // Bumping the version on schema additions avoids stale-shape rows leaking
  // into clients that expect the new fields.
  const cacheKey = `rankings:v3:${capability}`;
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached);

  // Pull metadata so we can derive x402_verified (the bit set by
  // crawler.ts seedKnownX402Endpoints() for providers we've live-confirmed
  // emit a v2 x402 challenge body). The router's selectProvider prefers
  // verified providers over unverified ones at routing time.
  const { data: providers } = await supabase
    .from('providers')
    .select('url, name, capability, metadata')
    .eq('capability', capability);

  const { data: scorecards } = await supabase
    .from('scorecards')
    .select('*')
    .eq('capability', capability);

  const scorecardMap = new Map(scorecards?.map(s => [s.provider_id, s]) || []);

  const processed = providers?.map(p => {
    const s = scorecardMap.get(p.url) || {};
    // Defensive coercion — metadata might be null, an array, or have a
    // non-boolean x402_verified. Only `=== true` qualifies as verified.
    const meta = (p.metadata && typeof p.metadata === 'object' && !Array.isArray(p.metadata))
      ? (p.metadata as Record<string, unknown>)
      : {};
    const x402_verified = meta.x402_verified === true;
    // P4-verify-tier (2026-05-05): two-bit verification stack.
    //   x402_verified — empirical: TrustBench probed the endpoint and it
    //     emitted a valid x402 challenge.
    //   integration_type — curatorial: Coinbase Agentic Market certified the
    //     service as '1P' (first-party native x402) or '3P' (proxied).
    // Both signals together are stronger than either alone; clients can
    // surface them independently. Neither field is part of the signed
    // scorecard payload (signScorecard()) — those stable signed bytes still
    // cover only {provider_id, capability, score, latency_p50, last_updated}.
    const rawIntegrationType = meta.integration_type;
    const integration_type =
      rawIntegrationType === '1P' || rawIntegrationType === '3P'
        ? (rawIntegrationType as '1P' | '3P')
        : null;
    return {
      id: s.id || null,
      provider_id: p.url,
      capability: p.capability,
      name: p.name || 'Unknown',
      score: s.score ?? 40,
      latency_p50: s.latency_p50 ?? 9999,
      latency_p95: s.latency_p95 ?? 9999,
      uptime_7d: s.uptime_7d ?? 50,
      last_updated: s.last_updated || new Date().toISOString(),
      signature: s.signature || null,
      x402_verified,
      integration_type,
    };
  }).sort((a, b) => b.score - a.score) || [];

  await redis.set(cacheKey, JSON.stringify(processed), 'EX', 300);
  return processed;
}

/**
 * Sign a scorecard. Returns the original scorecard plus:
 *   - signed_payload: canonical JSON string that was actually signed
 *   - signature: base64 (Ed25519) or hex (HMAC fallback)
 *   - signature_alg: 'ed25519' or 'hmac-sha256'
 *
 * The signed_payload is included verbatim so third-party verifiers can hash
 * exactly the same bytes we did, regardless of any field ordering surprises.
 */
export function signScorecard(scorecard: any) {
  const method = loadKeys();

  // Canonical payload: only the fields a verifier should rely on. Keep this
  // stable — changing field order or names invalidates every existing signature.
  const payload = JSON.stringify({
    provider_id: scorecard.provider_id,
    capability: scorecard.capability,
    score: scorecard.score,
    latency_p50: scorecard.latency_p50,
    last_updated: scorecard.last_updated
  });

  if (method === 'ed25519' && _privateKey) {
    const sig = crypto.sign(null, Buffer.from(payload), _privateKey);
    return {
      ...scorecard,
      signed_payload: payload,
      signature: sig.toString('base64'),
      signature_alg: 'ed25519'
    };
  }

  // HMAC fallback — server-internal integrity only.
  const sig = crypto
    .createHmac('sha256', process.env.SIGNING_SECRET || 'trustbench-default-key')
    .update(payload)
    .digest('hex');

  return {
    ...scorecard,
    signed_payload: payload,
    signature: sig,
    signature_alg: 'hmac-sha256'
  };
}

/**
 * Returns the PEM-encoded Ed25519 public key, or null if signing is in HMAC
 * fallback mode. Used by the /.well-known/trustbench-pubkey route.
 */
export function getPublicKeyPem(): string | null {
  loadKeys();
  return _publicKeyPem;
}

/**
 * True when the live signing method is publicly verifiable.
 */
export function isPublicVerifiable(): boolean {
  return loadKeys() === 'ed25519';
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Phase 3 receipt-generator helpers
// ---------------------------------------------------------------------------
// src/receipt-generator.ts uses signWithEd25519() to sign canonical receipt
// JSON. The Ed25519 keypair is the SAME one loaded by signScorecard() —
// single keypair, single public-key endpoint at /.well-known/trustbench-pubkey.

/**
 * Sign a payload with the Ed25519 private key. Returns base64-encoded
 * signature string, or null if Ed25519 keys aren't configured.
 *
 * Strict policy — this function does NOT fall back to HMAC. Receipts must
 * be third-party verifiable, and HMAC requires sharing the secret with
 * verifiers, which defeats the purpose. The caller (issueReceipt in
 * receipt-generator.ts) treats null as "refuse to issue receipt with
 * a `signing_unavailable` error" rather than emitting an HMAC-signed
 * receipt that can't be independently verified.
 *
 * Failure mode if this is wrong:
 *   - returns null when keys ARE configured: caller refuses to issue a
 *     receipt that should have been issued. Surface as `signing_unavailable`
 *     in /route/settle response. Recoverable by fixing the env vars.
 *   - returns a non-base64 string: verifier-side decode fails, audit
 *     reports "signature invalid". No money-loss path.
 *   - returns a signature over the wrong bytes: same as above; verifier
 *     fails on hash mismatch.
 */
export function signWithEd25519(payload: Buffer): string | null {
  const method = loadKeys();
  if (method !== 'ed25519' || !_privateKey) {
    return null;
  }
  const sig = crypto.sign(null, payload, _privateKey);
  return sig.toString('base64');
}
