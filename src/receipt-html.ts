// src/receipt-html.ts — P4-2 polished HTML render of /receipts/:id
//
// Companion to the JSON path in src/index.ts /receipts/:id. When the request's
// Accept header prefers text/html (browsers, link unfurlers), this module
// produces a self-contained HTML page that displays the receipt with:
//   - ✅ Server-side Ed25519 signature verification badge (in-process; we are
//     the signer, no HTTP round-trip needed for our own public key).
//   - ✅ On-chain verification badge via Base RPC (mirrors the logic in
//     scripts/verify-receipt.js verifyOnChain — confirms tx exists, calls
//     transferWithAuthorization on USDC contract, payer/payee/amount/block
//     match the receipt).
//   - Basescan link for the tx_hash, copy-paste reference verifier command,
//     issuer/key_id metadata, and a dark-theme single-file render that
//     matches /methodology's aesthetic.
//
// In-memory cache: receipts are immutable, so once verified for any request
// the {sig, chain} verdict is cached on receipt_id forever (until process
// restart). First render pays ~200-500ms for chain RPC; every subsequent
// render is <5ms. Cache key is just receipt_id since envelope content can't
// change for a given id.
//
// This module is NOT a high-risk surface — we're consuming/displaying an
// existing signature, not signing anything new. Standard discipline applies.
// The reference verifier scripts/verify-receipt.js stays the canonical
// third-party tool; this module mirrors its logic in-process for speed.

import 'dotenv/config';
import crypto from 'crypto';
import { createPublicClient, decodeFunctionData, http } from 'viem';
import { base } from 'viem/chains';
import type { SignedReceipt } from './receipt-generator.js';
import { jcsCanonicalize } from './idempotency.js';
import { getPublicKeyPem } from './scorer.js';

// ---------------------------------------------------------------------------
// Constants — kept identical to scripts/verify-receipt.js so any drift here
// surfaces as a verification mismatch rather than silent rot.
// ---------------------------------------------------------------------------

// USDC v2 on Base. Per phase3-x402-construction.md.
const BASE_USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as const;

// transferWithAuthorization selector (first 4 bytes of keccak256 of the sig).
// Verified against verify-receipt.js, kept as a const to avoid recomputing.
const TRANSFER_WITH_AUTH_SELECTOR = '0xe3ee160e';

// Module-local viem client. Matches the per-module pattern in route-handlers.ts.
// Public Base RPC by default; override via BASE_RPC_URL env when prod traffic
// warrants a higher-throughput provider. Read-only; no signing.
const basePublicClient = createPublicClient({
  chain: base,
  transport: http(process.env.BASE_RPC_URL || 'https://mainnet.base.org'),
});

// ---------------------------------------------------------------------------
// In-memory verification cache
// ---------------------------------------------------------------------------
// Receipts are immutable per receipt-generator.ts (signed at issue time, never
// re-signed). So the verdict for a given receipt_id never changes — caching is
// trivially safe. Process-lifetime only; restart re-verifies on demand.

type SigVerifyResult =
  | { kind: 'valid' }
  | { kind: 'invalid'; reason: string }
  | { kind: 'unverifiable'; reason: string };  // HMAC fallback or key not loaded

type ChainVerifyResult =
  | { kind: 'verified'; block_number: number; payer: string; payee: string; amount: string }
  | { kind: 'mismatch'; reason: string }
  | { kind: 'unavailable'; reason: string };  // RPC error, transient

type VerifyCache = {
  sig: SigVerifyResult;
  chain: ChainVerifyResult;
};

const verifyCache = new Map<string, VerifyCache>();

// ---------------------------------------------------------------------------
// Signature verification (in-process, mirrors verify-receipt.js verifyEnvelope)
// ---------------------------------------------------------------------------
// Steps must EXACTLY match src/receipt-generator.ts step 5 (sign) and
// scripts/verify-receipt.js verifyEnvelope (third-party verify):
//   1. JCS-canonicalize envelope.receipt
//   2. Encode UTF-8
//   3. crypto.verify(null, canonicalBytes, publicKey, signatureBytes)
// Any drift here produces a silent mismatch (we'd report INVALID against
// receipts that are actually fine).

export function verifyReceiptSignatureInProcess(envelope: SignedReceipt): SigVerifyResult {
  const sig = envelope.signature;
  if (!sig || sig.alg !== 'ed25519') {
    return { kind: 'unverifiable', reason: `unsupported algorithm: ${sig?.alg ?? 'missing'}` };
  }

  const pubPem = getPublicKeyPem();
  if (!pubPem) {
    // HMAC fallback mode or keys not configured. Page should render with a
    // muted ⚠ badge rather than red — the receipt isn't necessarily invalid,
    // we just can't verify it from this server's keyring.
    return {
      kind: 'unverifiable',
      reason: 'this instance is in HMAC fallback mode; receipt requires Ed25519 verification',
    };
  }

  let publicKey: crypto.KeyObject;
  try {
    publicKey = crypto.createPublicKey({ key: pubPem, format: 'pem' });
  } catch (err: any) {
    return { kind: 'unverifiable', reason: `public key parse failed: ${err.message}` };
  }

  // Canonical bytes — must reproduce receipt-generator.ts's exact pipeline.
  const canonical = jcsCanonicalize(envelope.receipt);
  const canonicalBytes = Buffer.from(canonical, 'utf8');

  // Signature is base64 (or base64url; both decode to the same bytes via
  // Buffer.from with the standard 'base64' codec on Node.js).
  let sigBuf: Buffer;
  try {
    sigBuf = Buffer.from(sig.value, 'base64');
  } catch (err: any) {
    return { kind: 'invalid', reason: `signature decode failed: ${err.message}` };
  }

  let ok: boolean;
  try {
    ok = crypto.verify(null, canonicalBytes, publicKey, sigBuf);
  } catch (err: any) {
    return { kind: 'invalid', reason: `crypto.verify error: ${err.message}` };
  }

  return ok ? { kind: 'valid' } : { kind: 'invalid', reason: 'signature does not match canonical receipt bytes' };
}

// ---------------------------------------------------------------------------
// On-chain verification (mirrors verify-receipt.js verifyOnChain)
// ---------------------------------------------------------------------------
// Confirms:
//   1. Tx exists on Base.
//   2. tx.to is the USDC contract.
//   3. Calldata selector is transferWithAuthorization.
//   4. Decoded (from, to, value) matches receipt's (payer, payee, amount).
//   5. Tx mined successfully.
//   6. If receipt has block_number, it matches the chain's blockNumber.

export async function verifyReceiptOnChainInProcess(envelope: SignedReceipt): Promise<ChainVerifyResult> {
  const settlement = envelope.receipt.settlement;
  if (!settlement) {
    return { kind: 'mismatch', reason: 'receipt has no settlement block' };
  }
  if (settlement.chain !== 'base') {
    return { kind: 'unavailable', reason: `unsupported chain "${settlement.chain}" — only "base" is implemented` };
  }
  const txHash = settlement.tx_hash;
  if (!/^0x[0-9a-f]{64}$/i.test(txHash)) {
    return { kind: 'mismatch', reason: `malformed tx_hash: ${txHash}` };
  }

  let tx: any;
  try {
    tx = await basePublicClient.getTransaction({ hash: txHash as `0x${string}` });
  } catch (err: any) {
    // viem throws TransactionNotFoundError when the hash isn't on chain.
    // That's a strong signal the receipt is fabricated — flag as mismatch,
    // not unavailable (this isn't a transient failure).
    if (err?.name === 'TransactionNotFoundError') {
      return { kind: 'mismatch', reason: `tx not found on chain: ${txHash}` };
    }
    return { kind: 'unavailable', reason: `RPC error: ${err?.shortMessage || err?.message || String(err)}` };
  }
  if (!tx) {
    return { kind: 'mismatch', reason: `tx not found: ${txHash}` };
  }

  // Tx must call the USDC contract — transferWithAuthorization is on the token.
  if (!tx.to || tx.to.toLowerCase() !== BASE_USDC_ADDRESS.toLowerCase()) {
    return { kind: 'mismatch', reason: `tx.to is ${tx.to} — expected USDC contract ${BASE_USDC_ADDRESS}` };
  }

  // Selector must match transferWithAuthorization. transfer / transferFrom
  // would mean the payer signed a different intent than the receipt claims.
  const selector = (tx.input as string).slice(0, 10).toLowerCase();
  if (selector !== TRANSFER_WITH_AUTH_SELECTOR) {
    return { kind: 'mismatch', reason: `tx selector ${selector} — expected ${TRANSFER_WITH_AUTH_SELECTOR}` };
  }

  // Decode args. ABI fragment is local; no contract registry lookup.
  let decoded: any;
  try {
    decoded = decodeFunctionData({
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
      data: tx.input as `0x${string}`,
    });
  } catch (err: any) {
    return { kind: 'mismatch', reason: `calldata decode failed: ${err.message}` };
  }

  const [chainFrom, chainTo, chainValue] = decoded.args as [string, string, bigint];
  const recPayer = settlement.payer_address.toLowerCase();
  const recPayee = settlement.payee_address.toLowerCase();
  const recAmount = BigInt(settlement.amount_atomic);

  if (chainFrom.toLowerCase() !== recPayer) {
    return { kind: 'mismatch', reason: `payer mismatch: chain=${chainFrom} receipt=${settlement.payer_address}` };
  }
  if (chainTo.toLowerCase() !== recPayee) {
    return { kind: 'mismatch', reason: `payee mismatch: chain=${chainTo} receipt=${settlement.payee_address}` };
  }
  if (chainValue !== recAmount) {
    return { kind: 'mismatch', reason: `amount mismatch: chain=${chainValue} receipt=${recAmount}` };
  }

  // Tx must be mined and successful.
  let txReceipt: any;
  try {
    txReceipt = await basePublicClient.getTransactionReceipt({ hash: txHash as `0x${string}` });
  } catch (err: any) {
    return { kind: 'unavailable', reason: `tx receipt RPC error: ${err?.shortMessage || err?.message || String(err)}` };
  }
  if (!txReceipt) {
    return { kind: 'mismatch', reason: 'tx exists but has no receipt yet (still pending)' };
  }
  if (txReceipt.status !== 'success') {
    return { kind: 'mismatch', reason: `tx mined but reverted (status=${txReceipt.status})` };
  }

  // Block-number match (only when the receipt asserted one — pre-closeout-#3
  // receipts don't have block_number, in which case skip this check).
  if (typeof settlement.block_number === 'number') {
    if (Number(txReceipt.blockNumber) !== settlement.block_number) {
      return { kind: 'mismatch', reason: `block mismatch: chain=${txReceipt.blockNumber} receipt=${settlement.block_number}` };
    }
  }

  return {
    kind: 'verified',
    block_number: Number(txReceipt.blockNumber),
    payer: chainFrom,
    payee: chainTo,
    amount: chainValue.toString(),
  };
}

// ---------------------------------------------------------------------------
// Cached entry point — verify both layers, memoize per receipt_id
// ---------------------------------------------------------------------------

export async function getOrComputeVerifyResults(envelope: SignedReceipt): Promise<VerifyCache> {
  const id = envelope.receipt.receipt_id;
  const cached = verifyCache.get(id);
  if (cached) return cached;

  // Signature verify is fast (~ms) and independent of network. Run it first
  // synchronously; if it fails, still attempt chain verify (information value
  // for the rendered page; "signature invalid AND chain matches" is a
  // different story than "signature invalid, chain confirms tampering").
  const sig = verifyReceiptSignatureInProcess(envelope);
  const chain = await verifyReceiptOnChainInProcess(envelope);

  const result: VerifyCache = { sig, chain };
  verifyCache.set(id, result);
  return result;
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

export function renderReceiptHtml(envelope: SignedReceipt, verify: VerifyCache): string {
  const r = envelope.receipt;
  const s = envelope.signature;

  const sigBadge = renderSigBadge(verify.sig);
  const chainBadge = renderChainBadge(verify.chain);
  const overallBadge = renderOverallBadge(verify.sig, verify.chain);

  const basescanUrl = `https://basescan.org/tx/${r.settlement.tx_hash}`;
  const blockExplorerLine = typeof r.settlement.block_number === 'number'
    ? `<tr><th>Block</th><td><code>${escapeHtml(String(r.settlement.block_number))}</code></td></tr>`
    : '';

  const verifierCmd = `npm run verify-receipt -- ${r.receipt_id}`;
  const verifierWithChain = `npm run verify-receipt -- ${r.receipt_id} --check-chain`;

  // Description for OG/Twitter cards. Short, factual, no marketing language.
  const desc = `${formatUsdc(r.settlement.amount_atomic, r.settlement.decimals)} ${escapeHtml(r.settlement.currency)} settlement for ${escapeHtml(r.call.capability)} routed by TrustBench. ${verify.sig.kind === 'valid' ? 'Signature verified.' : ''} ${verify.chain.kind === 'verified' ? 'On-chain confirmed.' : ''}`.trim();

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Receipt ${escapeHtml(r.receipt_id)} · TrustBench</title>
  <meta name="description" content="${escapeHtml(desc)}">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta property="og:type" content="article">
  <meta property="og:title" content="TrustBench Receipt ${escapeHtml(r.receipt_id)}">
  <meta property="og:description" content="${escapeHtml(desc)}">
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="TrustBench Receipt ${escapeHtml(r.receipt_id)}">
  <meta name="twitter:description" content="${escapeHtml(desc)}">
  <style>
    :root { color-scheme: dark; }
    body {
      font-family: system-ui, -apple-system, sans-serif;
      max-width: 760px;
      margin: 40px auto;
      padding: 0 20px 80px;
      background: #0f0f0f;
      color: #ddd;
      line-height: 1.55;
    }
    a { color: #22c55e; text-decoration: none; }
    a:hover { text-decoration: underline; }
    code, pre {
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      background: #1f1f1f;
      color: #fff;
      border-radius: 4px;
    }
    code { padding: 2px 6px; word-break: break-all; }
    pre {
      padding: 12px 16px;
      overflow-x: auto;
      white-space: pre-wrap;
      word-break: break-all;
      border-left: 3px solid #22c55e;
    }
    .crumb { color: #888; font-size: 0.9em; margin-bottom: 8px; }
    .crumb a { color: #888; }
    h1 { color: #22c55e; margin: 0 0 4px; font-size: 1.6em; }
    h2 { color: #22c55e; margin: 32px 0 8px; font-size: 1.05em; text-transform: uppercase; letter-spacing: 0.06em; }
    .receipt-id { font-size: 0.95em; }
    .badges { display: flex; flex-wrap: wrap; gap: 8px; margin: 16px 0 8px; }
    .badge {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 6px 12px; border-radius: 999px; font-size: 0.9em;
      border: 1px solid #2a2a2a; background: #1a1a1a;
    }
    .badge.green { color: #22c55e; border-color: #14532d; background: #052e16; }
    .badge.red { color: #fca5a5; border-color: #7f1d1d; background: #2a0a0a; }
    .badge.amber { color: #fbbf24; border-color: #78350f; background: #2a1a00; }
    .badge.muted { color: #888; }
    .overall {
      padding: 14px 18px; border-radius: 8px; margin: 20px 0 24px;
      font-size: 1.05em; display: flex; align-items: center; gap: 10px;
    }
    .overall.green { background: #052e16; border: 1px solid #14532d; color: #22c55e; }
    .overall.red { background: #2a0a0a; border: 1px solid #7f1d1d; color: #fca5a5; }
    .overall.amber { background: #2a1a00; border: 1px solid #78350f; color: #fbbf24; }
    .meta { color: #888; font-size: 0.9em; margin-top: 4px; }
    table { width: 100%; border-collapse: collapse; margin: 8px 0; }
    th, td {
      padding: 10px 0; text-align: left; vertical-align: top;
      border-bottom: 1px solid #1f1f1f; font-size: 0.95em;
    }
    th { color: #888; font-weight: normal; width: 140px; }
    td code { font-size: 0.92em; }
    .reason { color: #fca5a5; font-size: 0.85em; margin-top: 6px; font-style: italic; }
    footer {
      margin-top: 60px; padding-top: 20px;
      border-top: 1px solid #1f1f1f; color: #666; font-size: 0.85em;
    }
    footer a { color: #888; margin-right: 14px; }
    .key-meta { color: #666; font-size: 0.85em; margin-top: 8px; }
    .key-meta code { background: transparent; padding: 0; color: #aaa; }
  </style>
</head>
<body>
  <div class="crumb"><a href="/">TrustBench</a> · <a href="/methodology">Methodology</a> · Receipt</div>
  <h1>Receipt</h1>
  <code class="receipt-id">${escapeHtml(r.receipt_id)}</code>

  ${overallBadge}

  <div class="badges">
    ${sigBadge}
    ${chainBadge}
  </div>
  <div class="meta">
    Issued ${escapeHtml(formatTimestamp(r.issued_at))} by <code>${escapeHtml(r.issuer)}</code>
  </div>

  <h2>Settlement</h2>
  <table>
    <tr><th>Tx hash</th><td><a href="${escapeHtml(basescanUrl)}" target="_blank" rel="noopener noreferrer"><code>${escapeHtml(r.settlement.tx_hash)}</code></a> <a href="${escapeHtml(basescanUrl)}" target="_blank" rel="noopener noreferrer">↗ Basescan</a></td></tr>
    ${blockExplorerLine}
    <tr><th>Payer</th><td><code>${escapeHtml(r.settlement.payer_address)}</code></td></tr>
    <tr><th>Payee</th><td><code>${escapeHtml(r.settlement.payee_address)}</code></td></tr>
    <tr><th>Amount</th><td>${escapeHtml(formatUsdc(r.settlement.amount_atomic, r.settlement.decimals))} ${escapeHtml(r.settlement.currency)} on ${escapeHtml(r.settlement.chain)}</td></tr>
    <tr><th>Settled at</th><td>${escapeHtml(formatTimestamp(r.settlement.settled_at))}</td></tr>
  </table>

  <h2>Routing</h2>
  <table>
    <tr><th>Capability</th><td>${escapeHtml(r.call.capability)}</td></tr>
    <tr><th>Provider</th><td><code>${escapeHtml(r.call.provider_id)}</code></td></tr>
    <tr><th>Score at decision</th><td>${escapeHtml(String(r.routing.score_at_decision))} / 100</td></tr>
    <tr><th>Alternatives considered</th><td>${escapeHtml(String(r.routing.alternatives_considered))}</td></tr>
    <tr><th>Selection reason</th><td>${escapeHtml(r.routing.selection_reason)}</td></tr>
    <tr><th>Latency</th><td>${escapeHtml(String(r.call.latency_ms))} ms</td></tr>
  </table>

  <h2>Pricing</h2>
  <table>
    <tr><th>Provider price</th><td>${escapeHtml(formatUsdc(r.pricing.provider_price_atomic, r.settlement.decimals))} ${escapeHtml(r.settlement.currency)}</td></tr>
    <tr><th>TrustBench fee</th><td>${escapeHtml(formatUsdc(r.pricing.trustbench_fee_atomic, r.settlement.decimals))} ${escapeHtml(r.settlement.currency)} <span class="meta">(${escapeHtml(r.pricing.fee_model)})</span></td></tr>
    <tr><th>Total paid</th><td>${escapeHtml(formatUsdc(r.pricing.total_paid_atomic, r.settlement.decimals))} ${escapeHtml(r.settlement.currency)}</td></tr>
  </table>

  <h2>Verify yourself</h2>
  <p>The signature is detached and verifiable by anyone with the published Ed25519 public key. Try it:</p>
  <pre>${escapeHtml(verifierCmd)}</pre>
  <p>Or check the receipt against Base on-chain settlement:</p>
  <pre>${escapeHtml(verifierWithChain)}</pre>
  <div class="key-meta">
    Signed with Ed25519 · key_id <code>${escapeHtml(s.key_id)}</code> · public key at <a href="${escapeHtml(s.public_key_url)}">${escapeHtml(s.public_key_url)}</a>
  </div>

  <footer>
    <a href="/methodology">Methodology</a>
    <a href="/.well-known/trustbench-pubkey">Public key</a>
    <a href="?format=json">View as JSON</a>
    <a href="https://github.com/lithvall/TrustBench/blob/main/scripts/verify-receipt.js" target="_blank" rel="noopener noreferrer">Reference verifier</a>
  </footer>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Badge renderers — small, focused, easy to swap visual states
// ---------------------------------------------------------------------------

function renderSigBadge(sig: SigVerifyResult): string {
  if (sig.kind === 'valid') {
    return `<span class="badge green">✅ Signature valid</span>`;
  }
  if (sig.kind === 'invalid') {
    return `<span class="badge red">❌ Signature invalid<div class="reason">${escapeHtml(sig.reason)}</div></span>`;
  }
  // unverifiable
  return `<span class="badge amber">⚠ Signature not verifiable<div class="reason">${escapeHtml(sig.reason)}</div></span>`;
}

function renderChainBadge(chain: ChainVerifyResult): string {
  if (chain.kind === 'verified') {
    return `<span class="badge green">✅ On-chain verified</span>`;
  }
  if (chain.kind === 'mismatch') {
    return `<span class="badge red">❌ On-chain mismatch<div class="reason">${escapeHtml(chain.reason)}</div></span>`;
  }
  // unavailable (transient)
  return `<span class="badge amber">⏳ On-chain check unavailable<div class="reason">${escapeHtml(chain.reason)}</div></span>`;
}

function renderOverallBadge(sig: SigVerifyResult, chain: ChainVerifyResult): string {
  // Overall verdict drives the big visual at top of page.
  // Both green = headline green. Any red = headline red. Otherwise amber.
  if (sig.kind === 'valid' && chain.kind === 'verified') {
    return `<div class="overall green">✅ <strong>Verified receipt</strong> · signature valid AND on-chain settlement matches</div>`;
  }
  if (sig.kind === 'invalid' || chain.kind === 'mismatch') {
    return `<div class="overall red">❌ <strong>Receipt verification failed</strong> · see details below</div>`;
  }
  return `<div class="overall amber">⚠ <strong>Partial verification</strong> · see details below</div>`;
}

// ---------------------------------------------------------------------------
// Format helpers
// ---------------------------------------------------------------------------

// Convert atomic-unit string to a decimal display string. BigInt-aware so
// USDC amounts (6 decimals) and any other integer-decimal currency render
// without precision loss. Trailing zeros after the decimal point are trimmed
// for cleaner display: "10000" / 6 → "0.01" not "0.010000".
function formatUsdc(atomic: string, decimals: number): string {
  if (!/^\d+$/.test(atomic)) return atomic;
  const big = BigInt(atomic);
  if (decimals === 0) return big.toString();
  const divisor = BigInt(10) ** BigInt(decimals);
  const whole = big / divisor;
  const frac = big % divisor;
  if (frac === 0n) return whole.toString();
  const fracStr = frac.toString().padStart(decimals, '0').replace(/0+$/, '');
  return fracStr ? `${whole}.${fracStr}` : whole.toString();
}

// Format an ISO timestamp as "May 6 2026 09:30:25 UTC". Hand-formatted for
// determinism (no locale dependence — every visitor sees the same text).
function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const yyyy = d.getUTCFullYear();
    const mm = months[d.getUTCMonth()];
    const dd = d.getUTCDate();
    const hh = String(d.getUTCHours()).padStart(2, '0');
    const mi = String(d.getUTCMinutes()).padStart(2, '0');
    const ss = String(d.getUTCSeconds()).padStart(2, '0');
    return `${mm} ${dd} ${yyyy} ${hh}:${mi}:${ss} UTC`;
  } catch {
    return iso;
  }
}

// Defensive HTML escaping. Receipt fields like `capability` and
// `idempotency_key` originate from agent-supplied input; we don't trust them
// to be safe HTML. Static labels and addresses don't strictly need it but
// defense-in-depth is cheap.
function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
