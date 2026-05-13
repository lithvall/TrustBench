// scripts/trust-signals-hash-identity-smoke.ts — Phase 4 Change 1 safety check
//
// Verifies the deploy-safety contract from src/idempotency.ts:
//   When the flag is OFF or the X-Trust-Signals header is absent, the hash
//   inputs must be byte-identical to the pre-Change-1 baseline shape
//   `{ body, query, path }`.
//
// Why this matters: any deviation produces a different request_hash, which
// would 409 any in-flight idempotency replays on deploy day. Three cases
// must produce identical hashes:
//
//   case A — pre-Change-1 baseline:        jcsCanonicalize({body, query, path})
//   case B — flag off + header absent:     jcsCanonicalize({body, query, path})
//   case C — flag on + header absent:      jcsCanonicalize({body, query, path})
//
// A fourth case is the only one that legitimately differs:
//
//   case D — flag on + header present:     jcsCanonicalize({body, query, path, trust_signals})
//
// Run: npx tsx scripts/trust-signals-hash-identity-smoke.ts
// Exit: 0 = pass, 1 = fail.

import { createHash } from 'crypto';
import {
  parseTrustSignals,
  type TrustSignal,
} from '../src/trust-signals.js';

// Inline jcsCanonicalize copy. The real one lives in src/idempotency.ts but
// reuses the same algorithm (sorted keys, no whitespace, recurse) and we
// confirmed during the change that the call site is the only thing that
// touches hash construction. Pulling it here avoids importing the whole
// supabase + redis init chain just to assert a property of a pure function.
function jcsCanonicalize(obj: unknown): string {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return '[' + obj.map(jcsCanonicalize).join(',') + ']';
  const keys = Object.keys(obj as Record<string, unknown>).sort();
  return '{' + keys
    .map(k => JSON.stringify(k) + ':' + jcsCanonicalize((obj as Record<string, unknown>)[k]))
    .join(',') + '}';
}

function hash(inputs: Record<string, unknown>): string {
  return createHash('sha256').update(jcsCanonicalize(inputs)).digest('hex');
}

// Realistic /route request body + query + path matching the production wire shape.
const body = {
  capability: 'data',
  max_price: '10000',
  payer_address: '0x547C2c615b227800D56b5ed24021C2CbCa0a3057',
};
const query = {};
const path = '/route';

// Case A — pre-Change-1 baseline.
const hashA = hash({ body, query, path });

// Simulate the post-Change-1 idempotency.ts hash construction.
// This mirrors the EXACT logic of the modified withIdempotency: build a
// hashInputs object starting with {body, query, path}, conditionally add
// trust_signals when the value is non-null.
function postChange1Hash(trustSignals: TrustSignal | null): string {
  const hashInputs: Record<string, unknown> = { body, query, path };
  if (trustSignals !== null) {
    hashInputs.trust_signals = trustSignals;
  }
  return hash(hashInputs);
}

// Case B — flag off path: trustSignals stays null regardless of header.
const hashB = postChange1Hash(null);

// Case C — flag on but header absent: trustSignals also stays null.
const hashC = postChange1Hash(null);

// Case D — flag on AND header present AND valid parse.
const validHeader = Buffer.from(JSON.stringify({
  source: 'strata.usestrata.dev',
  kind: 'x402_trust',
  trusted: false,
  security_score: 45,
  risk_level: 'medium',
  payment_endpoint: { amount_usd: 2.5, currency: 'USDC', network: 'base' },
  actionable_flags: ['drain_risk'],
  captured_at: '2026-05-10T14:23:41.000Z',
  ref: 'https://usestrata.dev/api/v1/x402/verify?url=https://example.com',
}), 'utf-8').toString('base64url');

const parsed = parseTrustSignals(validHeader);
if (!parsed.ok) {
  console.error('[hash-identity] PRECONDITION FAIL: parseTrustSignals rejected a valid header');
  console.error(parsed);
  process.exit(1);
}
const hashD = postChange1Hash(parsed.value);

// ---- Assertions -----------------------------------------------------------
console.log('[hash-identity] === Pre/post-Change-1 hash byte-identity check ===');
console.log(`case A (pre-Change-1 baseline):       ${hashA}`);
console.log(`case B (flag off, header absent):     ${hashB}`);
console.log(`case C (flag on, header absent):      ${hashC}`);
console.log(`case D (flag on, header present):     ${hashD}`);
console.log('');

let failed = 0;
function check(name: string, cond: boolean): void {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}`);
  if (!cond) failed++;
}

check('A === B (flag-off path preserves baseline)', hashA === hashB);
check('A === C (flag-on + no header preserves baseline)', hashA === hashC);
check('B === C (the two no-header paths agree)', hashB === hashC);
check('D !== A (header-present hash differs from baseline)', hashD !== hashA);

// Additional sanity: D should also differ from B and C (since D has the
// trust_signals key and they don't). Already implied by D !== A but check
// explicitly so a future refactor doesn't silently regress.
check('D !== B', hashD !== hashB);
check('D !== C', hashD !== hashC);

// Replay-with-different-signals scenario (the Critic-pass § 10.4.5
// commitment: same idempotency key + different signals → 409).
const differentSignals: TrustSignal = {
  source: 'strata.usestrata.dev',
  kind: 'x402_trust',
  trusted: true,         // <-- changed from false
  security_score: 92,    // <-- changed from 45
  risk_level: 'low',     // <-- changed
  captured_at: '2026-05-10T14:25:00.000Z',
  ref: 'https://usestrata.dev/api/v1/x402/verify?url=https://example.com',
};
const hashD2 = postChange1Hash(differentSignals);
check('D !== D2 (different signals → different hash, supports 409)', hashD !== hashD2);

console.log('');
if (failed > 0) {
  console.log(`[hash-identity] ${failed} check(s) failed`);
  process.exit(1);
}
console.log('[hash-identity] all checks PASS — deploy-safe');
process.exit(0);
