// @trustbench/verify-receipt
//
// Standalone third-party verifier for TrustBench Ed25519-signed receipts.
//
// No dependency on TrustBench infrastructure beyond fetching the published
// public key from the URL embedded in the receipt envelope. The signature
// itself can be checked offline with no network calls if the public key is
// already cached.
//
// Mirrors scripts/verify-receipt.js in the TrustBench repo byte-for-byte
// for the JCS canonicalization + Ed25519 verify steps. If the in-repo
// reference verifier says VALID, this package says VALID.
//
// Usage (programmatic):
//
//   import { verifyReceipt } from '@trustbench/verify-receipt';
//
//   // By receipt id (fetches from https://trustbench.io/receipts/<id>)
//   const result = await verifyReceipt('rcpt_01KQY7C44GAPSXZPFQYRZ1D10C');
//   console.log(result.signatureValid); // true | false
//
//   // From an already-fetched envelope object
//   const result = await verifyReceipt(envelope);
//
//   // From a full receipt URL
//   const result = await verifyReceipt('https://trustbench.io/receipts/rcpt_...');
//
//   // With on-chain verification (requires viem peer dependency)
//   const result = await verifyReceipt('rcpt_...', { checkChain: true });

import crypto from 'node:crypto';
import fs from 'node:fs';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_BASE_URL = 'https://trustbench.io';
const DEFAULT_BASE_RPC = 'https://mainnet.base.org';

// USDC on Base — per TrustBench receipt-generator.ts. EIP-3009
// transferWithAuthorization is invoked on this token contract for every
// settled receipt today.
const BASE_USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

// First 4 bytes of keccak256("transferWithAuthorization(address,address,uint256,uint256,uint256,bytes32,uint8,bytes32,bytes32)")
const TRANSFER_WITH_AUTH_SELECTOR = '0xe3ee160e';

// Two receipt-id prefixes are recognized:
//   - rcpt_   Phase 3 settlement receipts (envelope shape: receipt.settlement.{tx_hash, block_number, …})
//   - rrcpt_  Phase 4 paywall routing receipts (envelope shape: receipt.paid.{tx_hash, …};
//             block_number is sometimes absent — handled gracefully by verifyOnChain)
// Both prefixes route to the same /receipts/:id endpoint on the issuer host.
const RCPT_ID_PATTERN = /^rr?cpt_[0-9A-HJKMNP-TV-Z]{26}$/;

// ---------------------------------------------------------------------------
// JCS canonicalization (RFC 8785-style)
//
// Identical to src/idempotency.ts jcsCanonicalize in the TrustBench repo and
// to scripts/verify-receipt.js. Inlined here so this package has zero runtime
// dependencies for the signature-only verify path.
// ---------------------------------------------------------------------------
export function jcsCanonicalize(obj) {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return '[' + obj.map(jcsCanonicalize).join(',') + ']';
  const keys = Object.keys(obj).sort();
  return '{' + keys
    .map(k => JSON.stringify(k) + ':' + jcsCanonicalize(obj[k]))
    .join(',') + '}';
}

// ---------------------------------------------------------------------------
// Public API: verifyReceipt
// ---------------------------------------------------------------------------

/**
 * Verify a TrustBench receipt's Ed25519 signature, optionally also confirming
 * on-chain settlement via viem.
 *
 * @param {Object|string} input - Receipt envelope object, receipt id
 *   ("rcpt_..."), full receipt URL, or path to a JSON file.
 * @param {Object} [options]
 * @param {string} [options.baseUrl] - Override base URL when input is an id.
 *   Default: https://trustbench.io
 * @param {string} [options.pubkeyUrl] - Override the public_key_url from the
 *   envelope. Useful for verifying locally-issued receipts whose published
 *   URL isn't reachable from the verifier's network.
 * @param {boolean} [options.checkChain] - Also verify the receipt's tx_hash
 *   matches an on-chain transferWithAuthorization on the named chain.
 *   Requires viem (peer dependency).
 * @param {string} [options.rpcUrl] - RPC URL for chain verification.
 *   Default: https://mainnet.base.org (use your own for >1 call/sec).
 *
 * @returns {Promise<VerifyResult>}
 */
export async function verifyReceipt(input, options = {}) {
  const result = {
    ok: false,
    signatureValid: false,
    onChainVerified: undefined,
    receipt: null,
    keyId: null,
    publicKeyUrl: null,
    publicKeyUrlUsed: null,
    canonicalLength: null,
    chain: null,
    errors: [],
  };

  // 1. Resolve to envelope
  let envelope;
  try {
    envelope = await loadEnvelope(input, options);
  } catch (e) {
    result.errors.push(`fetch_failed: ${e.message}`);
    return result;
  }

  if (!envelope || typeof envelope !== 'object') {
    result.errors.push('envelope_not_object');
    return result;
  }
  if (!envelope.receipt || !envelope.signature) {
    result.errors.push('envelope_missing_receipt_or_signature');
    return result;
  }

  result.receipt = envelope.receipt;
  result.keyId = envelope.signature.key_id || null;
  result.publicKeyUrl = envelope.signature.public_key_url || null;

  // 2. Verify signature
  const sigCheck = await verifySignature(envelope, options.pubkeyUrl);
  result.signatureValid = sigCheck.ok;
  result.publicKeyUrlUsed = sigCheck.publicKeyUrlUsed;
  result.canonicalLength = sigCheck.canonicalLength;
  if (!sigCheck.ok) {
    result.errors.push(...sigCheck.errors);
    return result;
  }

  // 3. Optional: chain verification
  if (options.checkChain) {
    const rpcUrl = options.rpcUrl || process.env.BASE_RPC_URL || DEFAULT_BASE_RPC;
    try {
      const chainResult = await verifyOnChain(envelope, rpcUrl);
      result.chain = chainResult;
      result.onChainVerified = chainResult.ok;
      if (!chainResult.ok) {
        result.errors.push(`onchain_mismatch: ${chainResult.reason}`);
      }
    } catch (e) {
      result.errors.push(`chain_check_error: ${e.message}`);
      result.onChainVerified = false;
    }
  }

  result.ok = result.signatureValid && (options.checkChain ? !!result.onChainVerified : true);
  return result;
}

// ---------------------------------------------------------------------------
// Internal: load envelope from various input shapes
// ---------------------------------------------------------------------------
async function loadEnvelope(input, options) {
  // Already-decoded envelope
  if (input && typeof input === 'object') {
    if (input.receipt && input.signature) return input;
    throw new Error('object input is not a receipt envelope ({receipt, signature})');
  }

  if (typeof input !== 'string') {
    throw new Error('input must be receipt envelope, id, URL, or .json file path');
  }

  // Receipt id — fetch from base URL
  if (RCPT_ID_PATTERN.test(input)) {
    const baseUrl = (options.baseUrl || DEFAULT_BASE_URL).replace(/\/$/, '');
    return fetchJson(`${baseUrl}/receipts/${input}`);
  }

  // Full URL
  if (input.startsWith('http://') || input.startsWith('https://')) {
    return fetchJson(input);
  }

  // File path
  if (input.endsWith('.json') && fs.existsSync(input)) {
    return JSON.parse(fs.readFileSync(input, 'utf8'));
  }

  throw new Error(`unrecognized input: ${input.substring(0, 60)}`);
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  return res.json();
}

// ---------------------------------------------------------------------------
// Internal: verify Ed25519 signature over JCS-canonical bytes of receipt
// ---------------------------------------------------------------------------
async function verifySignature(envelope, pubkeyUrlOverride) {
  const errors = [];
  const sig = envelope.signature;

  if (sig.alg !== 'ed25519') {
    errors.push(`unsupported_signature_alg: ${sig.alg}`);
    return { ok: false, errors, publicKeyUrlUsed: null, canonicalLength: 0 };
  }
  if (!sig.value) {
    errors.push('signature_value_missing');
    return { ok: false, errors, publicKeyUrlUsed: null, canonicalLength: 0 };
  }
  if (!sig.public_key_url && !pubkeyUrlOverride) {
    errors.push('public_key_url_missing_no_override');
    return { ok: false, errors, publicKeyUrlUsed: null, canonicalLength: 0 };
  }

  const pubkeyUrl = pubkeyUrlOverride || sig.public_key_url;
  let pubPem;
  try {
    const res = await fetch(pubkeyUrl);
    if (!res.ok) {
      errors.push(`pubkey_fetch_failed: HTTP ${res.status} from ${pubkeyUrl}`);
      return { ok: false, errors, publicKeyUrlUsed: pubkeyUrl, canonicalLength: 0 };
    }
    pubPem = await res.text();
  } catch (e) {
    errors.push(`pubkey_fetch_error: ${e.message}`);
    return { ok: false, errors, publicKeyUrlUsed: pubkeyUrl, canonicalLength: 0 };
  }

  let publicKey;
  try {
    publicKey = crypto.createPublicKey({ key: pubPem, format: 'pem' });
  } catch (e) {
    errors.push(`pubkey_parse_error: ${e.message}`);
    return { ok: false, errors, publicKeyUrlUsed: pubkeyUrl, canonicalLength: 0 };
  }

  const canonical = jcsCanonicalize(envelope.receipt);
  const canonicalBytes = Buffer.from(canonical, 'utf8');
  const sigBuf = Buffer.from(sig.value, 'base64url');

  const ok = crypto.verify(null, canonicalBytes, publicKey, sigBuf);
  if (!ok) errors.push('signature_invalid');

  return { ok, errors, publicKeyUrlUsed: pubkeyUrl, canonicalLength: canonical.length };
}

// ---------------------------------------------------------------------------
// On-chain verification (requires viem peer dep)
// ---------------------------------------------------------------------------

/**
 * Verify the receipt's tx_hash actually landed on chain with calldata
 * matching transferWithAuthorization(payer, payee, amount).
 *
 * @param {Object} envelope - The full receipt envelope
 * @param {string} [rpcUrl] - RPC URL (defaults to public Base mainnet)
 * @returns {Promise<{ok: boolean, reason?: string, ...}>}
 */
export async function verifyOnChain(envelope, rpcUrl) {
  let viem;
  try {
    viem = await import('viem');
  } catch (e) {
    throw new Error(
      "verifyOnChain requires the 'viem' peer dependency. Install with: npm install viem"
    );
  }

  // Two envelope shapes carry the on-chain settlement reference under
  // different field names:
  //   - Phase 3 settlement receipts (rcpt_…):       receipt.settlement
  //   - Phase 4 paywall routing receipts (rrcpt_…): receipt.paid
  // Probe both; whichever is present is the settlement data. Field SHAPE is
  // the same (chain, tx_hash, payer_address, payee_address, amount_atomic);
  // only block_number is sometimes missing on the paywall path (handled
  // gracefully below by the optional-block_number branch).
  const settlement = envelope?.receipt?.settlement || envelope?.receipt?.paid;
  if (!settlement) return { ok: false, reason: 'receipt has neither receipt.settlement nor receipt.paid' };
  if (settlement.chain !== 'base') {
    return {
      ok: false,
      reason: `unsupported chain "${settlement.chain}" — only "base" is implemented in this version`,
    };
  }

  const txHash = settlement.tx_hash;
  if (!/^0x[0-9a-f]{64}$/i.test(txHash)) {
    return { ok: false, reason: `malformed tx_hash: ${txHash}` };
  }

  const url = rpcUrl || process.env.BASE_RPC_URL || DEFAULT_BASE_RPC;
  const client = viem.createPublicClient({ transport: viem.http(url) });

  let tx;
  try {
    tx = await client.getTransaction({ hash: txHash });
  } catch (e) {
    return { ok: false, reason: `tx not found on chain: ${e.shortMessage || e.message}` };
  }
  if (!tx) return { ok: false, reason: `tx not found: ${txHash}` };

  if (!tx.to || tx.to.toLowerCase() !== BASE_USDC_ADDRESS.toLowerCase()) {
    return { ok: false, reason: `tx.to is ${tx.to} — expected USDC contract ${BASE_USDC_ADDRESS}` };
  }

  const selector = tx.input.slice(0, 10).toLowerCase();
  if (selector !== TRANSFER_WITH_AUTH_SELECTOR) {
    return {
      ok: false,
      reason: `tx selector ${selector} — expected transferWithAuthorization ${TRANSFER_WITH_AUTH_SELECTOR}`,
    };
  }

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
    return { ok: false, reason: `payer mismatch: chain=${chainFrom} receipt=${settlement.payer_address}` };
  }
  if (chainTo.toLowerCase() !== recPayee) {
    return { ok: false, reason: `payee mismatch: chain=${chainTo} receipt=${settlement.payee_address}` };
  }
  if (chainValue !== recAmount) {
    return { ok: false, reason: `amount mismatch: chain=${chainValue} receipt=${recAmount}` };
  }

  const txReceipt = await client.getTransactionReceipt({ hash: txHash });
  if (!txReceipt) return { ok: false, reason: 'tx exists but has no receipt yet (still pending)' };
  if (txReceipt.status !== 'success') {
    return { ok: false, reason: `tx mined but reverted (status=${txReceipt.status})` };
  }

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
