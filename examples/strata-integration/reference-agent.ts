// examples/strata-integration/reference-agent.ts
// =============================================================================
// Strata × TrustBench reference agent.
//
// Implements the end-to-end flow described in
// `strata-integration-sketch-SEND.md` § 10.2:
//
//   1. GET Strata `/x402/verify?url=<merchant>` to capture pre-call trust posture
//   2. POST TrustBench `/route` (quote) — read the 402 payment requirements
//   3. Sign an EIP-3009 transferWithAuthorization X-PAYMENT for the routing fee
//   4. POST TrustBench `/route` (settle) with `X-PAYMENT` + `X-Trust-Signals` +
//      `Idempotency-Key`. TrustBench verifies, settles via CDP facilitator,
//      and returns a signed routing receipt whose `trust_signals[0]` is the
//      verbatim Strata payload covered by the same Ed25519 signature that
//      covers the routing decision.
//   5. (Optional, default ON) Sign a second X-PAYMENT for the merchant and
//      call `next_step.provider_url` so the round-trip is honest end-to-end.
//
// The artifact this script produces is the public URL printed at the end:
//
//   https://trustbench.io/receipts/<receipt_id>
//
// It's immutable, content-negotiated (HTML for browsers, JSON for agents),
// Cache-Control immutable for 24h, and verifiable offline against TrustBench's
// published Ed25519 public key:
//
//   npx @trustbench/verify-receipt <receipt_id> --check-chain
//
// =============================================================================
// HIGH-RISK SURFACE per CLAUDE.md (the script signs EIP-3009 X-PAYMENTs).
// Canonical design: strata-integration-sketch-SEND.md § 10.2-10.5 +
//   src/paywall-handler.ts (wire shape) + scripts/paywall-smoke.ts (the
//   signing/envelope pattern this script mirrors).
//
// Non-custodial property: the agent's private key only ever lives in this
// process. TrustBench never sees it. CDP's facilitator submits the on-chain
// transfer and pays gas; the merchant's facilitator does the same for the
// merchant call. The script is a thin orchestration layer.
//
// Failure mode if this is wrong: an agent might pay TrustBench the routing
// fee but receive a malformed receipt, OR sign a merchant X-PAYMENT against
// the wrong PaymentRequirements (signature recovery fails on the merchant
// side, agent's nonce is still unused on-chain). We notice via: non-200
// HTTP status + clear error logs at each step. No silent failures.
// =============================================================================

import 'dotenv/config';
import { privateKeyToAccount } from 'viem/accounts';
import { ulid } from 'ulid';
import { ExactEvmScheme } from '@x402/evm';
import type { PaymentRequirements, PaymentPayload } from '@x402/core/types';

// -----------------------------------------------------------------------------
// Config + env validation
// -----------------------------------------------------------------------------
function required(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === '') {
    console.error(`[strata-ref] FATAL: env var ${name} missing`);
    process.exit(1);
  }
  return v.trim();
}
function optional(name: string, fallback: string): string {
  const v = process.env[name];
  return v && v.trim() !== '' ? v.trim() : fallback;
}

// Per §10.5: CoinMarketCap's x402 dex/search is the first-pick merchant,
// promoted to `x402_verified=true` in the TrustBench registry 2026-05-12.
// Fallback chain: QuickNode `x402.quicknode.com/mat` → Exa Search. Swap
// MERCHANT_URL by env var; nothing else changes.
const TRUSTBENCH_BASE_URL = optional('TRUSTBENCH_BASE_URL', 'https://trustbench.io');
const STRATA_VERIFY_BASE = optional(
  'STRATA_VERIFY_BASE',
  'https://usestrata.dev/api/v1/x402/verify',
);
const MERCHANT_URL = optional(
  'MERCHANT_URL',
  'https://pro-api.coinmarketcap.com/x402/v1/dex/search',
);
const CAPABILITY = optional('CAPABILITY', 'data');
const MAX_PRICE_ATOMIC = optional('MAX_PRICE_ATOMIC', '10000'); // $0.01 USDC budget for the merchant call
const AGENT_WALLET_PK = required('AGENT_WALLET_PK');
const SKIP_MERCHANT = process.argv.includes('--skip-merchant');

if (!/^0x[0-9a-fA-F]{64}$/.test(AGENT_WALLET_PK)) {
  console.error('[strata-ref] FATAL: AGENT_WALLET_PK must be 0x + 64 hex chars');
  process.exit(1);
}
const agent = privateKeyToAccount(AGENT_WALLET_PK as `0x${string}`);

// -----------------------------------------------------------------------------
// Step 1 — Strata pre-call trust verification.
//
// Strata's `/x402/verify` is plain JSON over HTTPS, no artifact-level signing
// (per § 3, resolved 2026-05-11). We capture Strata's raw response and pass
// it through `toLockedTrustSignals` (below) before encoding into the
// X-Trust-Signals header.
// -----------------------------------------------------------------------------
async function fetchStrataPosture(merchantUrl: string): Promise<{
  raw: Record<string, unknown>;
  refUrl: string;
}> {
  const refUrl = `${STRATA_VERIFY_BASE}?url=${encodeURIComponent(merchantUrl)}`;
  console.log(`[strata-ref] 1. GET ${refUrl}`);
  const res = await fetch(refUrl, { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    console.error(`[strata-ref] Strata returned ${res.status}: ${await res.text()}`);
    process.exit(2);
  }
  const raw = (await res.json()) as Record<string, unknown>;
  console.log(`[strata-ref]    ← Strata posture captured (${JSON.stringify(raw).length} bytes)`);
  return { raw, refUrl };
}

// -----------------------------------------------------------------------------
// Step 1b — Adapter: Strata's current `/x402/verify` response → locked §3 shape.
//
// As of 2026-05-13, Strata's live API returns flat fields (e.g. `flags`,
// `payment_amount_usd`, `last_checked_at`) that do NOT match the locked
// annotation shape negotiated in `strata-integration-sketch-SEND.md` §3.
// The locked shape was an agreed-upon CONTRACT for what TrustBench writes
// into the signed receipt — Strata's "ship them" reply on 2026-05-12
// acknowledged the shape and committed to mirroring `payment_endpoint` in
// a future API revision, but the four required envelope fields
// (`source`, `kind`, `captured_at`, `ref`) are not yet emitted.
//
// This adapter performs a deterministic, auditable transformation. Every
// output field derives from either:
//   - a verbatim Strata field (trusted, security_score, risk_level),
//   - a 1:1 rename of a Strata field (captured_at ← last_checked_at),
//   - a nesting/aggregation of Strata fields (payment_endpoint ← three
//     flat payment_* fields), or
//   - an agent-side constant (source, kind) or request-context value (ref).
//
// A downstream verifier reading the TrustBench receipt can hit `ref`,
// re-fetch Strata's response, and confirm this derivation independently.
// Nothing is invented; the adapter is removable the moment Strata ships
// the matching schema (auto-detect: the forward-compat branch below
// passes Strata's response through verbatim if all four required fields
// are already present).
//
// The `actionable_flags` field applies the §3 resolved-item-5 filter:
// `unverified_domain` is dropped because Strata's WHOIS is a v1 stub and
// the flag appears on almost every endpoint, meaning "unverifiable" not
// "suspicious." Filtering avoids baking a noisy v1-stub signal into an
// immutable receipt artifact. Strata confirmed the `actionable_flags`
// field name 2026-05-12.
//
// Failure mode if this is wrong:
//   (a) Adapter produces a field shape that doesn't match Strata's future
//       schema → when Strata ships the locked shape natively, our adapter
//       might silently mis-translate. Mitigation: the forward-compat
//       branch detects native locked-shape responses (source + kind +
//       captured_at + ref all present) and passes them through verbatim.
//   (b) Strata's `last_checked_at` is missing → captured_at is undefined,
//       JSON.stringify drops it, TrustBench 400s with `missing_fields`
//       on captured_at. Loud failure, easy to diagnose.
//   (c) An attacker controls the merchant URL the agent passes in and
//       fabricates a fake `ref` → the receipt's `ref` field is derived
//       from the agent's own request URL (not Strata's response), so a
//       downstream verifier hitting `ref` either gets a real Strata
//       response or a clear 4xx. Cannot be poisoned by the merchant.
// -----------------------------------------------------------------------------
type LockedTrustSignal = {
  source: 'strata.usestrata.dev';
  kind: 'x402_trust';
  trusted?: unknown;
  security_score?: unknown;
  risk_level?: unknown;
  payment_endpoint?: {
    amount_usd: unknown;
    currency: unknown;
    network: unknown;
  };
  actionable_flags?: string[];
  captured_at?: unknown;
  ref: string;
};

function toLockedTrustSignals(
  strataRaw: Record<string, unknown>,
  refUrl: string,
): LockedTrustSignal {
  // Forward-compat: if Strata has shipped the locked-shape schema natively,
  // the response already has all four required fields. Pass through
  // verbatim — the adapter becomes a no-op the day Strata ships, with no
  // further code change on our side.
  if (
    typeof strataRaw.source === 'string' &&
    typeof strataRaw.kind === 'string' &&
    typeof strataRaw.captured_at === 'string' &&
    typeof strataRaw.ref === 'string'
  ) {
    console.log('[strata-ref]    ← (Strata already emits the locked shape; adapter no-op)');
    return strataRaw as unknown as LockedTrustSignal;
  }

  // §3 resolved-item-5 filter: drop unverified_domain (WHOIS v1 stub noise).
  const rawFlags = Array.isArray(strataRaw.flags) ? (strataRaw.flags as unknown[]) : [];
  const actionableFlags = rawFlags
    .filter((f): f is string => typeof f === 'string')
    .filter((f) => f !== 'unverified_domain');

  // Nest the three flat payment_* fields. Preserve null when Strata returns
  // null (unverified merchants today have all three null) — receipt embeds
  // the truth, not a fabricated "$0" or "USD" default.
  const paymentEndpoint = {
    amount_usd: strataRaw.payment_amount_usd ?? null,
    currency: strataRaw.payment_currency ?? null,
    network: strataRaw.payment_network ?? null,
  };

  const locked: LockedTrustSignal = {
    source: 'strata.usestrata.dev',
    kind: 'x402_trust',
    trusted: strataRaw.trusted,
    security_score: strataRaw.security_score,
    risk_level: strataRaw.risk_level,
    payment_endpoint: paymentEndpoint,
    actionable_flags: actionableFlags,
    captured_at: strataRaw.last_checked_at,
    ref: refUrl,
  };
  console.log(
    `[strata-ref]    ← adapter: locked shape built (trusted=${locked.trusted}, ` +
      `security_score=${locked.security_score}, risk_level=${locked.risk_level}, ` +
      `actionable_flags=[${actionableFlags.join(',')}])`,
  );
  return locked;
}

// base64url-encode the locked-shape annotation. TrustBench's
// `parseTrustSignals` (src/trust-signals.ts) decodes via
// `Buffer.from(headerValue, 'base64url')`, so we must encode the same way
// — NOT plain base64 (which would have `+` `/` `=` chars rejected as
// malformed by some HTTP stacks). Buffer's `'base64url'` output drops `=`
// padding and uses URL-safe alphabet.
function encodeTrustSignalsHeader(payload: LockedTrustSignal): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

// -----------------------------------------------------------------------------
// Step 2 — POST /route (quote). No X-PAYMENT yet. Expect 402.
// -----------------------------------------------------------------------------
async function quoteRoute(trustSignalsHeader: string): Promise<{
  requirements: PaymentRequirements;
  rawBody: unknown;
}> {
  console.log(`[strata-ref] 2. POST ${TRUSTBENCH_BASE_URL}/route (quote, no X-PAYMENT)`);
  // Note: we send X-Trust-Signals on the quote call too, per § 10.2 step 4.
  // TrustBench's paywallGate Branch 3 (no X-PAYMENT, no Bearer) ignores this
  // header — parsing happens only inside `handlePaidRoute()` on the settle
  // call. Sending it on both is harmless and matches the documented flow.
  const res = await fetch(`${TRUSTBENCH_BASE_URL}/route`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-Trust-Signals': trustSignalsHeader,
    },
    body: JSON.stringify({
      capability: CAPABILITY,
      max_price: MAX_PRICE_ATOMIC,
      payer_address: agent.address,
    }),
  });
  if (res.status !== 402) {
    console.error(`[strata-ref] expected 402, got ${res.status}: ${await res.text()}`);
    process.exit(2);
  }
  const body = (await res.json()) as {
    x402Version: number;
    accepts: PaymentRequirements[];
  };
  if (!Array.isArray(body.accepts) || body.accepts.length === 0) {
    console.error('[strata-ref] 402 body missing accepts[]');
    process.exit(2);
  }
  const reqs = body.accepts[0];
  console.log(
    `[strata-ref]    ← 402 routing fee=${reqs.amount} atomic (${reqs.scheme}/${reqs.network}) payTo=${reqs.payTo.slice(0, 10)}…`,
  );
  return { requirements: reqs, rawBody: body };
}

// -----------------------------------------------------------------------------
// Step 3 — Sign EIP-3009 transferWithAuthorization. Build the X-PAYMENT
// envelope.
//
// Mirrors scripts/paywall-smoke.ts buildXPaymentHeader exactly. The
// `resource` field on PaymentPayload is OPTIONAL per @x402/core but is the
// documented surface CDP's catalog scanner reads to associate the payment
// with a URL (see paywall-smoke.ts P4-followup comment). We include it for
// indexing parity even though signature recovery would succeed without it.
// -----------------------------------------------------------------------------
async function signXPayment(reqs: PaymentRequirements): Promise<string> {
  console.log(`[strata-ref] 3. Sign EIP-3009 X-PAYMENT for routing fee`);
  const scheme = new ExactEvmScheme(agent as any);
  const inner = await scheme.createPaymentPayload(2, reqs);
  const envelope: PaymentPayload = {
    ...inner,
    accepted: reqs,
    resource: {
      url: `${TRUSTBENCH_BASE_URL}/route`,
      description:
        'TrustBench: non-custodial routing and audit layer for x402. Returns a signed routing receipt with on-chain settlement reference, verifiable offline against a published Ed25519 key.',
      mimeType: 'application/json',
    },
  };
  const encoded = Buffer.from(JSON.stringify(envelope), 'utf8').toString('base64');
  console.log(`[strata-ref]    ← X-PAYMENT envelope built (${encoded.length} bytes)`);
  return encoded;
}

// -----------------------------------------------------------------------------
// Step 4 — POST /route (settle). X-PAYMENT + X-Trust-Signals +
// Idempotency-Key. Expect 200 + signed routing receipt with
// trust_signals[0] = the Strata payload.
//
// Per § 10.4.5(1): the X-Trust-Signals header IS part of the body hash, so a
// future replay with the same Idempotency-Key but different (or absent)
// signals would 409. We send a fresh ULID per run to avoid replay collisions.
// -----------------------------------------------------------------------------
async function settleRoute(
  xPayment: string,
  trustSignalsHeader: string,
  idemKey: string,
): Promise<{
  receiptId: string;
  receiptUrl: string;
  signedReceipt: unknown;
  nextStep: { provider_url: string; payment_requirements_v2: PaymentRequirements };
}> {
  console.log(`[strata-ref] 4. POST ${TRUSTBENCH_BASE_URL}/route (settle, X-PAYMENT + X-Trust-Signals)`);
  const res = await fetch(`${TRUSTBENCH_BASE_URL}/route`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-PAYMENT': xPayment,
      'X-Trust-Signals': trustSignalsHeader,
      'Idempotency-Key': idemKey,
    },
    body: JSON.stringify({
      capability: CAPABILITY,
      max_price: MAX_PRICE_ATOMIC,
      payer_address: agent.address,
    }),
  });
  if (res.status !== 200) {
    console.error(`[strata-ref] expected 200, got ${res.status}: ${await res.text()}`);
    process.exit(2);
  }
  const body = (await res.json()) as {
    receipt: {
      receipt_id: string;
      paid: { tx_hash: string };
      routing: { provider_id: string; provider_url: string };
      trust_signals?: unknown[];
    };
    signature: { alg: string; value: string };
    next_step: { provider_url: string; payment_requirements_v2: PaymentRequirements };
  };
  const receiptId = body.receipt.receipt_id;
  if (!receiptId || !receiptId.startsWith('rrcpt_')) {
    console.error(`[strata-ref] malformed receipt_id in response: ${receiptId}`);
    process.exit(2);
  }
  if (body.signature.alg !== 'ed25519' || typeof body.signature.value !== 'string') {
    console.error('[strata-ref] receipt is not Ed25519-signed');
    process.exit(2);
  }
  // Sanity: TrustBench should have embedded the Strata payload as trust_signals[0].
  // If it didn't, the integration is broken — either the env flag is off in prod
  // or the parse failed silently (it shouldn't — flag-on + valid header is
  // covered by trust-signals-receipt-identity-smoke.ts).
  if (!Array.isArray(body.receipt.trust_signals) || body.receipt.trust_signals.length === 0) {
    console.error(
      '[strata-ref] receipt.trust_signals[] missing or empty; TRUSTBENCH_TRUST_SIGNALS_ENABLED may be off on the server',
    );
    process.exit(2);
  }
  const receiptUrl = `${TRUSTBENCH_BASE_URL}/receipts/${receiptId}`;
  console.log(`[strata-ref]    ← 200 receipt=${receiptId} tx=${body.receipt.paid.tx_hash.slice(0, 14)}…`);
  console.log(`[strata-ref]      provider=${body.receipt.routing.provider_id}`);
  console.log(`[strata-ref]      trust_signals[0] embedded (${JSON.stringify(body.receipt.trust_signals[0]).length} bytes)`);
  return {
    receiptId,
    receiptUrl,
    signedReceipt: body,
    nextStep: body.next_step,
  };
}

// -----------------------------------------------------------------------------
// Step 5 (optional) — Call the merchant directly with a second X-PAYMENT.
//
// Per § 10.2 steps 9-10. The merchant is whichever provider TrustBench
// selected (in next_step.provider_url), which under capability=data on a
// healthy registry should be the same merchant we asked Strata about
// (CMC after the 2026-05-12 promotion). If TrustBench picked something
// else, we still call whatever it returned — that's the routing decision
// the agent is paying TrustBench to make.
//
// Default HTTP method: GET. CMC's dex/search is GET-shaped; QuickNode and
// Exa Search are also GET-shaped per their public docs. If a future merchant
// is POST-only, this is the one line to change.
//
// Failure mode: the merchant may reject the X-PAYMENT (price drift between
// TrustBench's probe and the live merchant call, nonce reuse, etc.). We log
// the non-200 status and exit 2 — but the TrustBench receipt URL is already
// the artifact, so even on merchant failure the §10 deliverable is in hand.
// -----------------------------------------------------------------------------
async function callMerchant(
  next: { provider_url: string; payment_requirements_v2: PaymentRequirements },
): Promise<void> {
  console.log(`[strata-ref] 5. Sign merchant X-PAYMENT and GET ${next.provider_url}`);
  const scheme = new ExactEvmScheme(agent as any);
  const inner = await scheme.createPaymentPayload(2, next.payment_requirements_v2);
  const envelope: PaymentPayload = {
    ...inner,
    accepted: next.payment_requirements_v2,
    resource: {
      url: next.provider_url,
      description: 'Merchant payment via TrustBench routing decision.',
      mimeType: 'application/json',
    },
  };
  const xPayment = Buffer.from(JSON.stringify(envelope), 'utf8').toString('base64');
  const res = await fetch(next.provider_url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      'X-PAYMENT': xPayment,
    },
  });
  console.log(`[strata-ref]    ← merchant status=${res.status}`);
  if (res.status !== 200) {
    // Non-fatal in terms of the §10 artifact — log and continue. The
    // TrustBench receipt is already produced.
    const text = await res.text();
    console.warn(`[strata-ref]      merchant response (truncated): ${text.slice(0, 200)}`);
    return;
  }
  const xPayResp = res.headers.get('x-payment-response');
  if (xPayResp) console.log(`[strata-ref]      X-PAYMENT-RESPONSE: ${xPayResp.slice(0, 80)}…`);
}

// -----------------------------------------------------------------------------
// Main
// -----------------------------------------------------------------------------
async function main() {
  console.log('[strata-ref] === Strata × TrustBench reference agent ===');
  console.log(`[strata-ref] agent       : ${agent.address}`);
  console.log(`[strata-ref] trustbench  : ${TRUSTBENCH_BASE_URL}`);
  console.log(`[strata-ref] merchant    : ${MERCHANT_URL}`);
  console.log(`[strata-ref] capability  : ${CAPABILITY}`);
  console.log(`[strata-ref] mode        : ${SKIP_MERCHANT ? '--skip-merchant (stop at TrustBench receipt)' : 'full §10.2 flow'}`);
  console.log('');

  const { raw: strataRaw, refUrl } = await fetchStrataPosture(MERCHANT_URL);
  const lockedSignals = toLockedTrustSignals(strataRaw, refUrl);
  const trustSignalsHeader = encodeTrustSignalsHeader(lockedSignals);

  const { requirements } = await quoteRoute(trustSignalsHeader);
  const xPayment = await signXPayment(requirements);

  const idemKey = `strata-ref-${ulid()}`;
  const settled = await settleRoute(xPayment, trustSignalsHeader, idemKey);

  if (!SKIP_MERCHANT) {
    await callMerchant(settled.nextStep);
  } else {
    console.log('[strata-ref] 5. (skipped via --skip-merchant)');
  }

  console.log('');
  console.log('[strata-ref] === ARTIFACT ===');
  console.log(`[strata-ref] receipt URL : ${settled.receiptUrl}`);
  console.log(`[strata-ref] verify      : npx @trustbench/verify-receipt ${settled.receiptId} --check-chain`);
  console.log('[strata-ref] === DONE ===');
}

main().catch((e) => {
  console.error('[strata-ref] uncaught error:', e);
  process.exit(99);
});
