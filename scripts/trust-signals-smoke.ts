// scripts/trust-signals-smoke.ts — Phase 4 Change 1 unit smoke
//
// Exercises src/trust-signals.ts parseTrustSignals() across the parse-result
// discriminator (absent / oversized / malformed / missing_fields / ok) and
// confirms that the locked § 3 shape from strata-integration-sketch-SEND.md
// passes through verbatim.
//
// Run: npx tsx scripts/trust-signals-smoke.ts
// Exit: 0 = all pass, 1 = any case failed.
//
// Why this exists as a standalone smoke and not a vitest file: the project
// doesn't currently ship a test runner; the existing pattern (scripts/
// paywall-smoke.ts, smoke-c3-concurrency.ts) is "standalone tsx scripts
// that exit 0 on green." Match the pattern rather than introduce a new one.

import {
  parseTrustSignals,
  MAX_HEADER_BYTES,
  REQUIRED_FIELDS,
} from '../src/trust-signals.js';

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(name: string, cond: boolean, detail?: string): void {
  if (cond) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? `  —  ${detail}` : ''}`);
  }
}

// base64url-encode a JSON object for use as a header value.
function encode(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj), 'utf-8').toString('base64url');
}

const VALID_MINIMAL = {
  source: 'strata.usestrata.dev',
  kind: 'x402_trust',
  captured_at: '2026-05-10T14:23:41.000Z',
  ref: 'https://usestrata.dev/api/v1/x402/verify?url=https://example.com',
};

const VALID_FULL_STRATA = {
  source: 'strata.usestrata.dev',
  kind: 'x402_trust',
  trusted: false,
  security_score: 45,
  risk_level: 'medium',
  payment_endpoint: {
    amount_usd: 2.5,
    currency: 'USDC',
    network: 'base',
  },
  actionable_flags: ['drain_risk'],
  captured_at: '2026-05-10T14:23:41.000Z',
  ref: 'https://usestrata.dev/api/v1/x402/verify?url=https://example.com',
};

console.log('[trust-signals-smoke] === parseTrustSignals discriminator coverage ===');

// 1. absent
{
  const r = parseTrustSignals(undefined);
  check(
    '1. undefined → ok=false, reason=absent',
    !r.ok && r.reason === 'absent',
  );
}
{
  const r = parseTrustSignals('');
  check(
    '2. empty string → ok=false, reason=absent',
    !r.ok && r.reason === 'absent',
  );
}

// 3. oversized — generate a header larger than MAX_HEADER_BYTES
{
  const bigPayload = { ...VALID_MINIMAL, padding: 'x'.repeat(MAX_HEADER_BYTES * 2) };
  const encoded = encode(bigPayload);
  const r = parseTrustSignals(encoded);
  check(
    '3. oversized header → ok=false, reason=oversized',
    !r.ok && r.reason === 'oversized',
    !r.ok ? `got reason=${r.reason}` : 'got ok=true',
  );
}

// 4. malformed — bad base64 (contains chars not in base64url alphabet)
{
  const r = parseTrustSignals('!!!not-base64!!!');
  check(
    '4. non-base64 input → ok=false, reason=malformed',
    !r.ok && r.reason === 'malformed',
    !r.ok ? `got reason=${r.reason}` : 'got ok=true',
  );
}

// 5. malformed — valid base64url but not valid JSON
{
  const encoded = Buffer.from('this is not json{', 'utf-8').toString('base64url');
  const r = parseTrustSignals(encoded);
  check(
    '5. base64url-decoded-but-not-JSON → ok=false, reason=malformed',
    !r.ok && r.reason === 'malformed',
  );
}

// 6. malformed — valid JSON but not an object (array)
{
  const r = parseTrustSignals(encode([VALID_MINIMAL]));
  check(
    '6. JSON array → ok=false, reason=malformed',
    !r.ok && r.reason === 'malformed',
  );
}

// 7. malformed — valid JSON but null
{
  const r = parseTrustSignals(encode(null));
  check(
    '7. JSON null → ok=false, reason=malformed',
    !r.ok && r.reason === 'malformed',
  );
}

// 8. malformed — valid JSON but string primitive
{
  const r = parseTrustSignals(encode('hello'));
  check(
    '8. JSON string primitive → ok=false, reason=malformed',
    !r.ok && r.reason === 'malformed',
  );
}

// 9. malformed — valid JSON but number primitive
{
  const r = parseTrustSignals(encode(42));
  check(
    '9. JSON number primitive → ok=false, reason=malformed',
    !r.ok && r.reason === 'malformed',
  );
}

// 10-13. missing_fields — drop each required field one at a time
for (const field of REQUIRED_FIELDS) {
  const broken: any = { ...VALID_MINIMAL };
  delete broken[field];
  const r = parseTrustSignals(encode(broken));
  check(
    `10/${field}. missing "${field}" → ok=false, reason=missing_fields, detail names the field`,
    !r.ok &&
      r.reason === 'missing_fields' &&
      'detail' in r &&
      r.detail.includes(field),
  );
}

// 14. missing_fields — required field present but empty string
{
  const broken = { ...VALID_MINIMAL, source: '' };
  const r = parseTrustSignals(encode(broken));
  check(
    '14. empty-string required field → ok=false, reason=missing_fields',
    !r.ok && r.reason === 'missing_fields',
  );
}

// 15. missing_fields — required field present but not a string
{
  const broken = { ...VALID_MINIMAL, captured_at: 1234567890 };
  const r = parseTrustSignals(encode(broken));
  check(
    '15. non-string required field → ok=false, reason=missing_fields',
    !r.ok && r.reason === 'missing_fields',
  );
}

// 16. ok — minimal valid payload (only the 4 required fields)
{
  const r = parseTrustSignals(encode(VALID_MINIMAL));
  check(
    '16. valid minimal payload → ok=true',
    r.ok,
    !r.ok ? `reason=${r.reason}` : undefined,
  );
  if (r.ok) {
    check(
      '16a. minimal payload preserves all required fields verbatim',
      r.value.source === VALID_MINIMAL.source &&
        r.value.kind === VALID_MINIMAL.kind &&
        r.value.captured_at === VALID_MINIMAL.captured_at &&
        r.value.ref === VALID_MINIMAL.ref,
    );
  }
}

// 17. ok — full Strata-shaped payload, passthrough of optional fields
{
  const r = parseTrustSignals(encode(VALID_FULL_STRATA));
  check(
    '17. valid full-Strata payload → ok=true',
    r.ok,
    !r.ok ? `reason=${r.reason}` : undefined,
  );
  if (r.ok) {
    check(
      '17a. trusted passed through',
      r.value.trusted === false,
    );
    check(
      '17b. security_score passed through',
      r.value.security_score === 45,
    );
    check(
      '17c. risk_level passed through',
      r.value.risk_level === 'medium',
    );
    check(
      '17d. payment_endpoint passed through as object',
      typeof r.value.payment_endpoint === 'object' &&
        r.value.payment_endpoint !== null &&
        (r.value.payment_endpoint as any).network === 'base',
    );
    check(
      '17e. actionable_flags passed through as array',
      Array.isArray(r.value.actionable_flags) &&
        (r.value.actionable_flags as string[])[0] === 'drain_risk',
    );
  }
}

// 18. ok — payload with extra unknown field (forward-compat)
{
  const payload = { ...VALID_MINIMAL, future_field_strata_adds_later: { x: 1 } };
  const r = parseTrustSignals(encode(payload));
  check(
    '18. payload with unknown field → ok=true (forward-compat)',
    r.ok,
  );
  if (r.ok) {
    check(
      '18a. unknown field passed through verbatim',
      typeof (r.value as any).future_field_strata_adds_later === 'object' &&
        (r.value as any).future_field_strata_adds_later.x === 1,
    );
  }
}

// ---- Summary ---------------------------------------------------------------
console.log('');
console.log(`[trust-signals-smoke] ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log('[trust-signals-smoke] failures:');
  for (const name of failures) console.log(`  - ${name}`);
  process.exit(1);
}
process.exit(0);
