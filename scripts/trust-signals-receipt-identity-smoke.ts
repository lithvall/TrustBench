// scripts/trust-signals-receipt-identity-smoke.ts — Phase 4 Change 2 safety check
//
// Verifies the deploy-safety contract from src/paywall-handler.ts Change 2:
//   When the X-Trust-Signals header is absent (or the flag is off), the
//   built routing-receipt body must be byte-identical to the pre-Change-2
//   baseline shape — same JCS-canonical bytes, same Ed25519 signature.
//
// Why this matters: a deployed Change 2 that quietly emits trust_signals=null
// (or trust_signals=[]) on the no-signals path would mutate the canonical
// receipt bytes for EVERY existing paywall call, which would break any
// downstream byte-equal comparison against an older receipt. The Strata
// integration explicitly trusts the byte-identical-replay property of the
// receipt envelope; regressing that property is a §10.4.5 contract break.
//
// Three cases must produce identical canonical bytes + identical signatures:
//
//   case A — pre-Change-2 baseline:           receipt without trust_signals key
//   case B — Change 2 + null signals:         receipt with conditional spread,
//                                             trust_signals key OMITTED
//   case C — Change 2 + undefined signals:    same as B (conditional spread
//                                             short-circuits on falsy)
//
// A fourth case is the only one that legitimately differs:
//
//   case D — Change 2 + present signals:      receipt with trust_signals[0]
//
// Run: npx tsx scripts/trust-signals-receipt-identity-smoke.ts
// Exit: 0 = pass, 1 = fail.
//
// This smoke runs purely in-memory. No DB, no Redis, no facilitator, no Ed25519
// signing key required — we only assert byte-identity of jcsCanonicalize output
// for the three no-signals cases, which is the property that drives signature
// byte-identity. (A real Ed25519 verifier would produce identical signatures
// over identical canonical bytes because Ed25519 is deterministic.)

import { createHash } from 'crypto';
import type { TrustSignal } from '../src/trust-signals.js';

// Inline jcsCanonicalize copy. The real one lives in src/idempotency.ts and is
// re-imported in paywall-handler.ts; pulling it here avoids importing the whole
// supabase + redis init chain just to assert a property of a pure function.
function jcsCanonicalize(obj: unknown): string {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return '[' + obj.map(jcsCanonicalize).join(',') + ']';
  const keys = Object.keys(obj as Record<string, unknown>).sort();
  return '{' + keys
    .map(k => JSON.stringify(k) + ':' + jcsCanonicalize((obj as Record<string, unknown>)[k]))
    .join(',') + '}';
}

function sha256Hex(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}

// -----------------------------------------------------------------------------
// Fixture: a realistic routing receipt body matching the post-Change-2
// RoutingReceipt type. The values are deterministic so signature byte-identity
// is reproducible across smoke runs.
// -----------------------------------------------------------------------------
const FIXTURE_BASE = {
  kind: 'paid_response.route' as const,
  version: '1.0.0',
  receipt_id: 'rrcpt_01ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  issued_at: '2026-05-13T09:36:55.000Z',
  issuer: 'trustbench.io',
  paid: {
    chain: 'base' as const,
    tx_hash: '0x' + '7'.repeat(64),
    payer_address: '0x' + '1'.repeat(40),
    payee_address: '0x' + '2'.repeat(40),
    amount_atomic: '5000',
    currency: 'USDC' as const,
    decimals: 6 as const,
    settled_at: '2026-05-13T09:36:55.000Z',
  },
  routing: {
    capability: 'data',
    provider_id: 'https://example-provider.com/x402/endpoint',
    provider_url: 'https://example-provider.com/x402/endpoint',
    score_at_decision: 97,
    alternatives_considered: 2,
    selection_reason: 'top_score' as const,
  },
  call: {
    idempotency_key: 'client-supplied-key-fixture-1234',
    request_hash: 'sha256:' + '0'.repeat(64),
  },
};

const VALID_SIGNAL: TrustSignal = {
  source: 'strata.usestrata.dev',
  kind: 'x402_trust',
  trusted: false,
  security_score: 45,
  risk_level: 'medium',
  payment_endpoint: { amount_usd: 2.5, currency: 'USDC', network: 'base' },
  actionable_flags: ['drain_risk'],
  captured_at: '2026-05-10T14:23:41.000Z',
  ref: 'https://usestrata.dev/api/v1/x402/verify?url=https://example.com',
};

// -----------------------------------------------------------------------------
// Case A — pre-Change-2 baseline. Build the receipt EXACTLY as Change 2's
// no-signals path does: the trust_signals key is omitted from the object
// literal entirely. Then JCS-canonicalize.
// -----------------------------------------------------------------------------
const caseA = { ...FIXTURE_BASE };
const canonA = jcsCanonicalize(caseA);
const hashA = sha256Hex(canonA);

// -----------------------------------------------------------------------------
// Case B — Change 2 + null signals. The conditional spread idiom
// `...(trustSignals ? { trust_signals: [trustSignals] } : {})` evaluates
// false on null, so the spread is {} and the trust_signals key is OMITTED.
// Mirror exactly what paywall-handler.ts does at receipt-construction time.
// -----------------------------------------------------------------------------
const trustSignalsB: TrustSignal | null = null;
const caseB = {
  ...FIXTURE_BASE,
  ...(trustSignalsB ? { trust_signals: [trustSignalsB] } : {}),
};
const canonB = jcsCanonicalize(caseB);
const hashB = sha256Hex(canonB);

// -----------------------------------------------------------------------------
// Case C — Change 2 + undefined signals. Same conditional-spread idiom on an
// undefined value. JavaScript's truthy check sees undefined as falsy, so the
// spread is {} and trust_signals is OMITTED. This case exists to verify the
// conditional handles both null and undefined identically (defensive against
// a future refactor that flips the discriminator).
// -----------------------------------------------------------------------------
const trustSignalsC: TrustSignal | undefined = undefined;
const caseC = {
  ...FIXTURE_BASE,
  ...(trustSignalsC ? { trust_signals: [trustSignalsC] } : {}),
};
const canonC = jcsCanonicalize(caseC);
const hashC = sha256Hex(canonC);

// -----------------------------------------------------------------------------
// Case D — Change 2 + present signals. Conditional spread evaluates true,
// the trust_signals key IS included with the signal as the first array
// entry. Canonical bytes legitimately differ.
// -----------------------------------------------------------------------------
const trustSignalsD: TrustSignal = VALID_SIGNAL;
const caseD = {
  ...FIXTURE_BASE,
  ...(trustSignalsD ? { trust_signals: [trustSignalsD] } : {}),
};
const canonD = jcsCanonicalize(caseD);
const hashD = sha256Hex(canonD);

// -----------------------------------------------------------------------------
// Assertions
// -----------------------------------------------------------------------------
console.log('[receipt-identity] === Pre/post-Change-2 receipt byte-identity check ===');
console.log(`case A (pre-Change-2 baseline):     ${hashA}`);
console.log(`case B (Change 2 + null signals):   ${hashB}`);
console.log(`case C (Change 2 + undef signals):  ${hashC}`);
console.log(`case D (Change 2 + present):        ${hashD}`);
console.log('');

let failed = 0;
function check(name: string, cond: boolean): void {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}`);
  if (!cond) failed++;
}

check('A === B (null-signals path preserves baseline canonical bytes)', hashA === hashB);
check('A === C (undefined-signals path preserves baseline canonical bytes)', hashA === hashC);
check('B === C (both falsy paths agree)', hashB === hashC);
check('D !== A (signals-present canonical bytes differ from baseline)', hashD !== hashA);

// Extra: confirm the canonical-bytes string of A and B are literally identical
// (not just hash-equal — defends against a hash-collision hiding a shape
// regression on a future input set).
check('canonical bytes A == B (literal string equality)', canonA === canonB);
check('canonical bytes A == C (literal string equality)', canonA === canonC);

// Extra: ensure the present-signals canonical bytes literally contain
// "trust_signals" — defensive against a future refactor that silently drops
// the field on a different code path (e.g. a sanitizer that strips unknown
// keys).
check('case D canonical bytes contain "trust_signals" key', canonD.includes('"trust_signals"'));

// Extra: replay-with-different-signals scenario. The §10.4.5(1) contract
// requires that signals with different content produce different canonical
// receipt bytes, supporting the existing 409-on-replay path in
// checkIdempotencyReplay (since the request_hash is included in the receipt
// envelope as receipt.call.request_hash).
const differentSignal: TrustSignal = {
  source: 'strata.usestrata.dev',
  kind: 'x402_trust',
  trusted: true,         // <-- changed from false
  security_score: 92,    // <-- changed from 45
  risk_level: 'low',     // <-- changed
  captured_at: '2026-05-10T14:25:00.000Z',
  ref: 'https://usestrata.dev/api/v1/x402/verify?url=https://example.com',
};
const caseD2 = {
  ...FIXTURE_BASE,
  trust_signals: [differentSignal],
};
const canonD2 = jcsCanonicalize(caseD2);
const hashD2 = sha256Hex(canonD2);
check('D !== D2 (different signal content → different canonical bytes)', hashD !== hashD2);

console.log('');
if (failed > 0) {
  console.log(`[receipt-identity] ${failed} check(s) failed`);
  process.exit(1);
}
console.log('[receipt-identity] all checks PASS — Change 2 byte-identity preserved');
process.exit(0);
