// smoke-unavailable.js
// =============================================================================
// Pins the v0.1.2 classification contract: fetch failures (receipt URL or
// public key URL unreachable) MUST classify as verificationStatus === 'unavailable',
// NOT 'invalid'. Misclassifying a tampered receipt as unavailable would let an
// attacker mask a forgery as a connectivity hiccup. This smoke is the load-bearing
// guard for that distinction.
//
// Run with: node smoke-unavailable.js
// =============================================================================

import { verifyReceipt } from './index.js';

let passed = 0;
let failed = 0;

function check(label, condition, detail) {
  if (condition) {
    console.log(`  PASS  ${label}`);
    passed++;
  } else {
    console.log(`  FAIL  ${label}` + (detail ? `  -> ${detail}` : ''));
    failed++;
  }
}

// ---------------------------------------------------------------------------
// Case 1: receipt URL unreachable (bogus base URL).
// Expected: verificationStatus === 'unavailable', errors include fetch_failed:.
// ---------------------------------------------------------------------------
console.log('Case 1: receipt URL unreachable');
{
  const r = await verifyReceipt('rrcpt_01ZZZZZZZZZZZZZZZZZZZZZZZZ', {
    baseUrl: 'https://this-host-does-not-resolve.invalid',
  });
  check('verificationStatus === unavailable', r.verificationStatus === 'unavailable', r.verificationStatus);
  check('signatureValid === false', r.signatureValid === false, String(r.signatureValid));
  check('errors include fetch_failed:', r.errors.some((e) => e.startsWith('fetch_failed:')), JSON.stringify(r.errors));
  check('ok === false', r.ok === false, String(r.ok));
}

// ---------------------------------------------------------------------------
// Case 2: receipt reachable but public key URL unreachable.
// We fabricate an envelope with a valid-looking shape but a bogus pubkey URL.
// Expected: verificationStatus === 'unavailable', errors include
//           pubkey_fetch_error: or pubkey_fetch_failed:.
// ---------------------------------------------------------------------------
console.log('');
console.log('Case 2: public key URL unreachable');
{
  const envelope = {
    receipt: {
      receipt_id: 'rrcpt_01YYYYYYYYYYYYYYYYYYYYYYY',
      issuer: 'trustbench.io',
      issued_at: '2026-05-15T00:00:00.000Z',
    },
    signature: {
      alg: 'ed25519',
      key_id: 'fake-key',
      // Bogus host that won't resolve. The verifier should fail to fetch and
      // classify as 'unavailable', NOT decide the signature is bad.
      public_key_url: 'https://this-host-does-not-resolve.invalid/pubkey',
      value: 'AAAA',
    },
  };
  const r = await verifyReceipt(envelope);
  check('verificationStatus === unavailable', r.verificationStatus === 'unavailable', r.verificationStatus);
  check('signatureValid === false', r.signatureValid === false, String(r.signatureValid));
  check(
    'errors include pubkey_fetch_error or pubkey_fetch_failed',
    r.errors.some((e) => e.startsWith('pubkey_fetch_error:') || e.startsWith('pubkey_fetch_failed:')),
    JSON.stringify(r.errors),
  );
}

// ---------------------------------------------------------------------------
// Case 3 (negative test): structurally malformed envelope.
// A receipt with no signature object MUST classify as 'invalid', NOT
// 'unavailable'. If we got this wrong, an attacker could submit malformed
// receipts and have them pass as connectivity issues in CI policy.
// ---------------------------------------------------------------------------
console.log('');
console.log('Case 3 (negative): malformed envelope must be invalid, not unavailable');
{
  const r = await verifyReceipt({ receipt: { receipt_id: 'foo' } });
  check('verificationStatus === invalid', r.verificationStatus === 'invalid', r.verificationStatus);
  check('signatureValid === false', r.signatureValid === false, String(r.signatureValid));
  check('errors include envelope_missing_receipt_or_signature',
    r.errors.includes('envelope_missing_receipt_or_signature'), JSON.stringify(r.errors));
}

// ---------------------------------------------------------------------------
// Case 4 (negative test): unsupported signature alg must be 'invalid', NOT
// 'unavailable'. A receipt whose signature.alg is something other than
// ed25519 is a structural defect, not a connectivity issue.
// ---------------------------------------------------------------------------
console.log('');
console.log('Case 4 (negative): unsupported sig alg must be invalid');
{
  const envelope = {
    receipt: { receipt_id: 'foo', issuer: 'trustbench.io' },
    signature: {
      alg: 'rsa-pss',
      public_key_url: 'https://trustbench.io/.well-known/trustbench-pubkey',
      value: 'AAAA',
    },
  };
  const r = await verifyReceipt(envelope);
  check('verificationStatus === invalid', r.verificationStatus === 'invalid', r.verificationStatus);
  check('errors include unsupported_signature_alg', r.errors.some((e) => e.startsWith('unsupported_signature_alg')), JSON.stringify(r.errors));
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log('');
console.log(`Result: ${passed} pass, ${failed} fail`);
if (failed > 0) process.exit(1);
