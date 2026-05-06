// scripts/verify-receipt.js
// Reference implementation: how to verify a signed TrustBench receipt
// without trusting TrustBench. Copy/adapt freely — this is the whole
// point of publishing the Ed25519 public key.
//
// Mirrors the signing pipeline in src/receipt-generator.ts exactly:
//   1. JCS-canonicalize the receipt object (RFC 8785-style: sorted keys
//      at every depth, no whitespace, JSON.stringify for primitives)
//   2. Encode to UTF-8 bytes
//   3. Verify the Ed25519 signature against those bytes using the public
//      key fetched from signature.public_key_url
//
// Usage:
//   node scripts/verify-receipt.js <path-to-json> [base-url] [--pubkey-url <url>]
//   node scripts/verify-receipt.js <rcpt_...id>   [base-url] [--pubkey-url <url>]
//
// Examples:
//   node scripts/verify-receipt.js ./my-receipt.json
//   node scripts/verify-receipt.js rcpt_01HV3K8M5C9X2ZBFYR4QWP8ND1
//   node scripts/verify-receipt.js rcpt_01HV3K8M5C9X2ZBFYR4QWP8ND1 \
//       https://trustbench.io
//
// Use --pubkey-url to override signature.public_key_url. Useful when verifying
// locally-issued receipts whose public_key_url points at a public domain that
// isn't reachable from your machine. The override does NOT affect the bytes
// being verified — the signature is over envelope.receipt only, and
// public_key_url lives in envelope.signature, which is not signed.
//
// Use --check-chain to additionally verify that the receipt's tx_hash actually
// landed on chain and matches the receipt's payer/payee/amount. Requires
// `viem` (devDependency). Reads RPC URL from --rpc-url or env BASE_RPC_URL.
// On mismatch, prints ❌ ON-CHAIN MISMATCH with diagnostic detail and exits 3.
// On signature-valid + chain-verified, prints both ✅ banners.
//
// Examples:
//   node scripts/verify-receipt.js rcpt_01HV3K... --check-chain
//   node scripts/verify-receipt.js rcpt_01HV3K... --check-chain --rpc-url https://mainnet.base.org
//   node scripts/verify-receipt.js ./mock-receipt.json --check-chain   # will fail (mock tx_hash)

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const DEFAULT_BASE = 'https://trustbench.io';

// ---------------------------------------------------------------------------
// Constants — chain verification
// ---------------------------------------------------------------------------
// Default Base RPC. Public, rate-limited; configure your own for >1 call/sec.
const DEFAULT_BASE_RPC = 'https://mainnet.base.org';

// USDC on Base — per receipt-generator.ts and phase3-x402-construction.md.
// transferWithAuthorization is the only EIP-3009 method we route to.
const BASE_USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

// transferWithAuthorization(address from, address to, uint256 value,
//   uint256 validAfter, uint256 validBefore, bytes32 nonce,
//   uint8 v, bytes32 r, bytes32 s)
// — function selector for verifying calldata. Computed as the first 4 bytes
// of keccak256("transferWithAuthorization(address,address,uint256,uint256,uint256,bytes32,uint8,bytes32,bytes32)").
const TRANSFER_WITH_AUTH_SELECTOR = '0xe3ee160e';

// ---------------------------------------------------------------------------
// JCS canonicalization — MUST match src/idempotency.ts jcsCanonicalize
// (which the receipt generator imports). One source of truth, two copies
// (TS module + this reference verifier).
// ---------------------------------------------------------------------------
function jcsCanonicalize(obj) {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return '[' + obj.map(jcsCanonicalize).join(',') + ']';
  const keys = Object.keys(obj).sort();
  return '{' + keys
    .map(k => JSON.stringify(k) + ':' + jcsCanonicalize(obj[k]))
    .join(',') + '}';
}

// ---------------------------------------------------------------------------
// Resolve input — file path or receipt id
// ---------------------------------------------------------------------------
async function loadEnvelope(arg, baseUrl) {
  // Heuristic: argument that exists on disk and ends in .json is a file.
  if (arg.endsWith('.json') || arg.startsWith('./') || arg.startsWith('/') || arg.match(/^[a-zA-Z]:\\/)) {
    const absPath = path.resolve(arg);
    if (!fs.existsSync(absPath)) {
      throw new Error(`File not found: ${absPath}`);
    }
    return JSON.parse(fs.readFileSync(absPath, 'utf8'));
  }

  // Otherwise treat as a receipt id (rcpt_<26-char-Crockford>)
  if (!/^rcpt_[0-9A-HJKMNP-TV-Z]{26}$/.test(arg)) {
    throw new Error(`Argument is neither a .json file path nor a valid receipt id: ${arg}`);
  }

  const url = `${baseUrl}/receipts/${arg}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Could not fetch ${url}: HTTP ${res.status}`);
  }
  return await res.json();
}

// ---------------------------------------------------------------------------
// Verify
// ---------------------------------------------------------------------------
async function verifyEnvelope(envelope, pubkeyUrlOverride) {
  if (!envelope || typeof envelope !== 'object') {
    throw new Error('Envelope is not a JSON object');
  }
  if (!envelope.receipt || !envelope.signature) {
    throw new Error('Envelope missing receipt or signature');
  }

  const sig = envelope.signature;
  if (sig.alg !== 'ed25519') {
    throw new Error(`Unsupported signature algorithm: ${sig.alg}`);
  }
  if (!sig.value) {
    throw new Error('signature.value missing');
  }
  if (!sig.public_key_url && !pubkeyUrlOverride) {
    throw new Error('signature.public_key_url missing and no --pubkey-url override provided');
  }

  // 1. Fetch the published public key.
  // The override is for local-dev convenience — receipts persist their
  // canonical public_key_url, but a verifier on a different network may not
  // be able to reach it. Override does NOT affect signed bytes.
  const pubkeyUrl = pubkeyUrlOverride || sig.public_key_url;
  const pubRes = await fetch(pubkeyUrl);
  if (!pubRes.ok) {
    throw new Error(`Could not fetch public key from ${pubkeyUrl}: HTTP ${pubRes.status}`);
  }
  const pubPem = await pubRes.text();
  const publicKey = crypto.createPublicKey({ key: pubPem, format: 'pem' });

  // 2. Reconstruct the canonical bytes that were signed.
  // This MUST exactly match src/receipt-generator.ts step 5:
  //     const canonical = jcsCanonicalize(receiptObject);
  //     signWithEd25519(Buffer.from(canonical, 'utf8'));
  // Any difference here = silent verifier failure.
  const canonical = jcsCanonicalize(envelope.receipt);
  const canonicalBytes = Buffer.from(canonical, 'utf8');

  // 3. Decode the signature. Generator emits base64url; verify accepts
  //    standard base64 too as a defensive read.
  const sigBuf = Buffer.from(sig.value, 'base64url');

  // 4. Ed25519 verify (algorithm is implicit in the key type).
  const ok = crypto.verify(null, canonicalBytes, publicKey, sigBuf);

  return {
    ok,
    receipt_id: envelope.receipt.receipt_id,
    issuer: envelope.receipt.issuer,
    issued_at: envelope.receipt.issued_at,
    key_id: sig.key_id,
    public_key_url: sig.public_key_url,
    public_key_url_used: pubkeyUrl,
    canonical_length: canonical.length,
  };
}

// ---------------------------------------------------------------------------
// On-chain verification (--check-chain)
// ---------------------------------------------------------------------------
// Confirms the receipt's tx_hash actually landed on the named chain and that
// its calldata is `transferWithAuthorization(payer, payee, amount, ...)`
// matching the receipt's settlement projection.
//
// Independent gut-check: even if TrustBench's signature were valid, this
// function would catch a fabricated tx_hash that doesn't exist on chain or
// a real tx that paid the wrong party / wrong amount.
//
// Returns:
//   { ok: true, ... }    — chain matches receipt
//   { ok: false, reason } — mismatch or RPC error; reason is human-readable
//
// Throws if viem isn't installed (we let the caller produce a clean error).
async function verifyOnChain(envelope, rpcUrl) {
  // Lazy-load viem so the script still works without it for default
  // (signature-only) verification. If --check-chain is requested but viem
  // is missing, we throw with an actionable message.
  let viem;
  try {
    viem = await import('viem');
  } catch (e) {
    throw new Error(
      "Could not import 'viem'. Install with `npm install --save-dev viem`. " +
      'It is in package.json devDependencies as of closeout #4.'
    );
  }

  const settlement = envelope.receipt.settlement;
  if (!settlement) return { ok: false, reason: 'receipt has no settlement block' };
  if (settlement.chain !== 'base') {
    // Phase 3 is Base-only. Phase 4 P4-3 will add Solana — this branch should
    // grow at that time. For now, refuse rather than guess.
    return {
      ok: false,
      reason: `unsupported chain "${settlement.chain}" — only "base" is implemented`,
    };
  }

  const txHash = settlement.tx_hash;
  if (!/^0x[0-9a-f]{64}$/i.test(txHash)) {
    return { ok: false, reason: `malformed tx_hash: ${txHash}` };
  }

  const client = viem.createPublicClient({
    transport: viem.http(rpcUrl),
  });

  // 1. Fetch the transaction. A null result means tx_hash doesn't exist
  // on this chain (the most damning signal — receipt is fabricated).
  let tx;
  try {
    tx = await client.getTransaction({ hash: txHash });
  } catch (e) {
    // viem throws TransactionNotFoundError when the hash doesn't exist.
    return {
      ok: false,
      reason: `tx not found on chain — RPC says: ${e.shortMessage || e.message}`,
    };
  }
  if (!tx) {
    return { ok: false, reason: `tx not found: ${txHash}` };
  }

  // 2. The 'to' field of the tx must be the USDC contract. EIP-3009
  // transferWithAuthorization is invoked on the token contract, never
  // on the payer/payee directly.
  if (!tx.to || tx.to.toLowerCase() !== BASE_USDC_ADDRESS.toLowerCase()) {
    return {
      ok: false,
      reason: `tx.to is ${tx.to} — expected USDC contract ${BASE_USDC_ADDRESS}`,
    };
  }

  // 3. Verify selector + decode calldata. We only accept the EIP-3009
  // transferWithAuthorization signature; transfer/transferFrom would mean
  // the payer signed a different intent than the receipt claims.
  const selector = tx.input.slice(0, 10).toLowerCase();
  if (selector !== TRANSFER_WITH_AUTH_SELECTOR) {
    return {
      ok: false,
      reason: `tx selector ${selector} — expected transferWithAuthorization ${TRANSFER_WITH_AUTH_SELECTOR}`,
    };
  }

  // Decode the args using viem's decoder. The ABI fragment is local — no
  // contract registry lookup needed.
  let decoded;
  try {
    decoded = viem.decodeFunctionData({
      abi: [{
        name: 'transferWithAuthorization',
        type: 'function',
        inputs: [
          { name: 'from', type: 'address' },
          { name: 'to', type: 'address' },
          { name: 'value', type: 'uint256' },
          { name: 'validAfter', type: 'uint256' },
          { name: 'validBefore', type: 'uint256' },
          { name: 'nonce', type: 'bytes32' },
          { name: 'v', type: 'uint8' },
          { name: 'r', type: 'bytes32' },
          { name: 's', type: 'bytes32' },
        ],
      }],
      data: tx.input,
    });
  } catch (e) {
    return { ok: false, reason: `calldata decode failed: ${e.message}` };
  }

  const [chainFrom, chainTo, chainValue] = decoded.args;
  const recPayer = settlement.payer_address.toLowerCase();
  const recPayee = settlement.payee_address.toLowerCase();
  const recAmount = BigInt(settlement.amount_atomic);

  if (chainFrom.toLowerCase() !== recPayer) {
    return {
      ok: false,
      reason: `payer mismatch: chain=${chainFrom} receipt=${settlement.payer_address}`,
    };
  }
  if (chainTo.toLowerCase() !== recPayee) {
    return {
      ok: false,
      reason: `payee mismatch: chain=${chainTo} receipt=${settlement.payee_address}`,
    };
  }
  if (chainValue !== recAmount) {
    return {
      ok: false,
      reason: `amount mismatch: chain=${chainValue} receipt=${recAmount}`,
    };
  }

  // 4. Confirm tx is mined and (optionally) at the claimed block_number.
  const txReceipt = await client.getTransactionReceipt({ hash: txHash });
  if (!txReceipt) {
    return { ok: false, reason: 'tx exists but has no receipt yet (still pending)' };
  }
  if (txReceipt.status !== 'success') {
    return { ok: false, reason: `tx mined but reverted (status=${txReceipt.status})` };
  }

  // block_number is optional in the receipt object (added in closeout #3 — pre-#3
  // receipts don't have it). When present, must match exactly.
  let blockCheck = 'block_number not in receipt';
  if (typeof settlement.block_number === 'number') {
    if (Number(txReceipt.blockNumber) !== settlement.block_number) {
      return {
        ok: false,
        reason: `block mismatch: chain=${txReceipt.blockNumber} receipt=${settlement.block_number}`,
      };
    }
    blockCheck = `block ${settlement.block_number} confirmed on chain`;
  }

  return {
    ok: true,
    chain: settlement.chain,
    tx_hash: txHash,
    block_number: Number(txReceipt.blockNumber),
    block_check: blockCheck,
    payer: chainFrom,
    payee: chainTo,
    amount: chainValue.toString(),
  };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
async function main() {
  // Parse args: positional [arg, baseUrl?] + flags --pubkey-url <url> /
  // --check-chain / --rpc-url <url>.
  const args = process.argv.slice(2);
  const positional = [];
  let pubkeyUrlOverride = null;
  let checkChain = false;
  let rpcUrl = process.env.BASE_RPC_URL || DEFAULT_BASE_RPC;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--pubkey-url') {
      pubkeyUrlOverride = args[++i];
    } else if (args[i] === '--check-chain') {
      checkChain = true;
    } else if (args[i] === '--rpc-url') {
      rpcUrl = args[++i];
    } else {
      positional.push(args[i]);
    }
  }
  const arg = positional[0];
  const baseUrl = positional[1] || DEFAULT_BASE;

  if (!arg) {
    console.error('Usage: node scripts/verify-receipt.js <path-to-json | rcpt_id> [base-url] [--pubkey-url <url>] [--check-chain [--rpc-url <url>]]');
    console.error(`Default base-url: ${DEFAULT_BASE}`);
    console.error(`Default Base RPC (with --check-chain): ${DEFAULT_BASE_RPC}  (override with --rpc-url or env BASE_RPC_URL)`);
    process.exit(1);
  }

  const envelope = await loadEnvelope(arg, baseUrl);
  const result = await verifyEnvelope(envelope, pubkeyUrlOverride);

  console.log('');
  console.log('Receipt:', result.receipt_id);
  console.log('Issuer :', result.issuer);
  console.log('Issued :', result.issued_at);
  console.log('Key id :', result.key_id);
  console.log('Pubkey :', result.public_key_url);
  if (result.public_key_url_used !== result.public_key_url) {
    console.log('  (overridden via --pubkey-url:', result.public_key_url_used + ')');
  }
  console.log('Canon. :', result.canonical_length, 'bytes signed');
  console.log('');

  if (!result.ok) {
    console.log('❌ SIGNATURE INVALID — receipt has been tampered with, or the');
    console.log('   public key at the URL above does not match the signing key.');
    process.exit(2);
  }

  console.log('✅ SIGNATURE VALID — receipt is authentic.');

  // Signature step is independent of the chain step. The signature alone tells
  // you "TrustBench claims this happened with these parameters." --check-chain
  // tells you "the chain agrees with TrustBench's claim." Both together is the
  // strongest assurance an external party can get without trusting either side.
  if (checkChain) {
    console.log('');
    console.log('Checking chain…');
    console.log('  RPC:', rpcUrl);
    let chainResult;
    try {
      chainResult = await verifyOnChain(envelope, rpcUrl);
    } catch (e) {
      console.log('');
      console.log(`❌ CHAIN CHECK ERROR — ${e.message}`);
      process.exit(4);
    }
    if (chainResult.ok) {
      console.log(`  Block: ${chainResult.block_number}  (${chainResult.block_check})`);
      console.log(`  Payer: ${chainResult.payer}`);
      console.log(`  Payee: ${chainResult.payee}`);
      console.log(`  Amount: ${chainResult.amount} (atomic units)`);
      console.log('');
      console.log('✅ ON-CHAIN VERIFIED — the receipt matches the actual transaction.');
      process.exit(0);
    } else {
      console.log('');
      console.log(`❌ ON-CHAIN MISMATCH — ${chainResult.reason}`);
      process.exit(3);
    }
  }

  process.exit(0);
}


main().catch((err) => {
  console.error('Verification error:', err.message);
  process.exit(1);
});
