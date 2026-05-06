// scripts/verify-scorecard.js
// Reference implementation: how to verify a signed TrustBench scorecard
// without trusting TrustBench. Copy/adapt freely — this is the whole point
// of publishing the Ed25519 public key.
//
// Usage:
//   node scripts/verify-scorecard.js [base_url]
//   # default base_url is https://trustbench.io

import crypto from 'crypto';

const BASE = process.argv[2] || 'https://trustbench.io';

async function main() {
  // 1. Fetch the published public key.
  const pubRes = await fetch(`${BASE}/.well-known/trustbench-pubkey`);
  if (!pubRes.ok) {
    console.error(`Could not fetch public key: HTTP ${pubRes.status}`);
    console.error(await pubRes.text());
    process.exit(1);
  }
  const pubPem = await pubRes.text();
  const publicKey = crypto.createPublicKey({ key: pubPem, format: 'pem' });

  // 2. Fetch a signed rankings page.
  const cap = 'search';
  const rankingsRes = await fetch(`${BASE}/rankings/paid?capability=${cap}`);
  const { data } = await rankingsRes.json();

  if (!Array.isArray(data) || data.length === 0) {
    console.error('No scorecards returned.');
    process.exit(1);
  }

  // 3. Verify each scorecard.
  let ok = 0;
  let bad = 0;
  for (const sc of data) {
    if (sc.signature_alg !== 'ed25519') {
      console.warn(`SKIP ${sc.provider_id}: signature_alg=${sc.signature_alg} (not ed25519)`);
      continue;
    }
    if (!sc.signed_payload || !sc.signature) {
      console.warn(`SKIP ${sc.provider_id}: missing signed_payload/signature`);
      continue;
    }
    const valid = crypto.verify(
      null,
      Buffer.from(sc.signed_payload),
      publicKey,
      Buffer.from(sc.signature, 'base64')
    );
    if (valid) {
      ok++;
      console.log(`OK   ${sc.provider_id} score=${sc.score}`);
    } else {
      bad++;
      console.log(`BAD  ${sc.provider_id} (signature does not verify)`);
    }
  }

  console.log('');
  console.log(`Verified ${ok} / ${ok + bad} scorecards from ${BASE}`);
  process.exit(bad === 0 ? 0 : 2);
}

main().catch((err) => {
  console.error('Verification script error:', err);
  process.exit(1);
});
