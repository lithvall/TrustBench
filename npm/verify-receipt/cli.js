#!/usr/bin/env node
// trustbench-verify-receipt CLI
//
// Wraps verifyReceipt() with positional + flag args, human-readable output,
// and meaningful exit codes.

import { verifyReceipt } from './index.js';

const HELP = `
trustbench-verify-receipt — verify a TrustBench Ed25519-signed receipt.

Usage:
  trustbench-verify-receipt <receipt-id | URL | path/to.json> [base-url] [options]

Options:
  --check-chain          Also verify the on-chain settlement (requires viem).
  --pubkey-url <url>     Override the public_key_url from the envelope.
  --rpc-url <url>        RPC URL for chain verification (default: public Base mainnet).
  --json                 Print verification result as JSON instead of human-readable.
  -h, --help             Show this help.

Two receipt-id prefixes are accepted:
  rcpt_    Phase 3 settlement receipts
  rrcpt_   Phase 4 paywall routing receipts (signed routing decision + on-chain anchor)

Examples:
  trustbench-verify-receipt rcpt_01KQY7C44GAPSXZPFQYRZ1D10C
  trustbench-verify-receipt rcpt_01KQY7C44GAPSXZPFQYRZ1D10C --check-chain
  trustbench-verify-receipt rrcpt_01KRN8HYPPRD1MS9JE7045S77Q --check-chain
  trustbench-verify-receipt ./my-receipt.json
  trustbench-verify-receipt https://trustbench.io/receipts/rrcpt_...

Exit codes:
  0  signature valid (and chain verified, if --check-chain was used)
  1  bad arguments / unrecoverable error
  2  signature invalid (bytes don't match — possible tampering)
  3  signature valid but on-chain mismatch
  4  signature valid but chain check threw an error (RPC failure etc.)
  5  signature could not be verified (couldn't fetch the receipt or public key)
`;

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes('-h') || args.includes('--help')) {
    console.log(HELP);
    process.exit(args.length === 0 ? 1 : 0);
  }

  const positional = [];
  const options = {};
  let outputJson = false;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--check-chain') options.checkChain = true;
    else if (a === '--pubkey-url') options.pubkeyUrl = args[++i];
    else if (a === '--rpc-url') options.rpcUrl = args[++i];
    else if (a === '--base-url') options.baseUrl = args[++i];
    else if (a === '--json') outputJson = true;
    else positional.push(a);
  }

  const input = positional[0];
  if (!input) {
    console.error('Error: receipt id, URL, or .json file path is required.');
    console.error(HELP);
    process.exit(1);
  }
  if (positional[1]) options.baseUrl = positional[1];

  let result;
  try {
    result = await verifyReceipt(input, options);
  } catch (e) {
    console.error(`Verification error: ${e.message}`);
    process.exit(1);
  }

  if (outputJson) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printHumanReadable(result, options);
  }

  // Exit code policy (v0.1.2+):
  //   0  valid signature (+ chain verified if requested)
  //   2  signature invalid — bytes were checked and don't match (tamper signal)
  //   3  signature valid but on-chain claim disagrees
  //   4  signature valid but chain check threw (RPC error)
  //   5  signature could not be checked at all — fetch failed for receipt or
  //      pubkey URL. This is a connectivity/availability failure, NOT a tamper
  //      signal. CI policies that auto-retry on flakiness but alert on tamper
  //      should branch on this code.
  if (result.verificationStatus === 'unavailable') process.exit(5);
  if (!result.signatureValid) process.exit(2);
  if (options.checkChain) {
    if (result.chain && !result.chain.ok) process.exit(3);
    if (result.onChainVerified === false && (!result.chain || result.chain.ok === undefined)) {
      // chain check threw an error before producing a chain result
      process.exit(4);
    }
  }
  process.exit(0);
}

function printHumanReadable(result, options) {
  console.log('');
  if (result.receipt) {
    console.log('Receipt:', result.receipt.receipt_id || '(no id)');
    console.log('Issuer :', result.receipt.issuer || '(unknown)');
    console.log('Issued :', result.receipt.issued_at || '(unknown)');
  }
  if (result.keyId) console.log('Key id :', result.keyId);
  if (result.publicKeyUrl) console.log('Pubkey :', result.publicKeyUrl);
  if (result.publicKeyUrlUsed && result.publicKeyUrlUsed !== result.publicKeyUrl) {
    console.log('  (overridden via --pubkey-url:', result.publicKeyUrlUsed + ')');
  }
  if (result.canonicalLength) console.log('Canon. :', result.canonicalLength, 'bytes signed');
  console.log('');

  // Three terminal states (added v0.1.2). The 'unavailable' branch exists to
  // stop misdiagnosing connectivity failures as tampering — a partner DM
  // (Strata, 2026-05-15) flagged that a first-run user behind a flaky network
  // or sandbox sees "SIGNATURE INVALID — receipt has been tampered with" and
  // assumes the worst. The real issue is that the verifier never reached the
  // public key URL to do the math.
  if (result.verificationStatus === 'valid') {
    console.log('✅ SIGNATURE VALID — receipt is authentic.');
  } else if (result.verificationStatus === 'unavailable') {
    console.log('⚠️  VERIFICATION UNAVAILABLE — could not fetch the receipt or public');
    console.log('   key needed to verify the signature. This is NOT a tamper signal;');
    console.log('   the verifier never reached the math. Retry once your network can');
    console.log('   reach the URLs below.');
    if (result.errors.length) {
      console.log('');
      console.log('Details:');
      for (const err of result.errors) console.log(`  - ${err}`);
    }
    return;
  } else {
    console.log('❌ SIGNATURE INVALID — bytes were checked and do not match. The receipt');
    console.log('   has been tampered with, the envelope is structurally malformed, or');
    console.log('   the public key at the URL above does not match the signing key.');
    if (result.errors.length) {
      console.log('');
      console.log('Errors:');
      for (const err of result.errors) console.log(`  - ${err}`);
    }
    return;
  }

  if (options.checkChain) {
    console.log('');
    if (result.chain && result.chain.ok) {
      console.log(`Chain  : ${result.chain.chain}`);
      console.log(`Block  : ${result.chain.block_number}  (${result.chain.block_check})`);
      console.log(`Payer  : ${result.chain.payer}`);
      console.log(`Payee  : ${result.chain.payee}`);
      console.log(`Amount : ${result.chain.amount} (atomic units)`);
      console.log('');
      console.log('✅ ON-CHAIN VERIFIED — receipt matches the actual transaction.');
    } else if (result.chain && result.chain.ok === false) {
      console.log(`❌ ON-CHAIN MISMATCH — ${result.chain.reason}`);
    } else {
      console.log('❌ CHAIN CHECK ERROR — see errors below.');
      for (const err of result.errors) console.log(`  - ${err}`);
    }
  }
}

main().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
