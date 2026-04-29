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
// ---------------------------------------------------------------------------

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
// ---------------------------------------------------------------------------

export async function getRankings(capability: string) {
  const cacheKey = `rankings:${capability}`;
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached);

  const { data: providers } = await supabase
    .from('providers')
    .select('url, name, capability')
    .eq('capability', capability);

  const { data: scorecards } = await supabase
    .from('scorecards')
    .select('*')
    .eq('capability', capability);

  const scorecardMap = new Map(scorecards?.map(s => [s.provider_id, s]) || []);

  const processed = providers?.map(p => {
    const s = scorecardMap.get(p.url) || {};
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
      signature: s.signature || null
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
