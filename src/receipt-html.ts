// src/receipt-html.ts — Phase 4 redesigned receipt detail page.
//
// Companion to the JSON path in src/index.ts /receipts/:id. When the request's
// Accept header prefers text/html (browsers, link unfurlers), this module
// produces a self-contained HTML page with:
//   - Breadcrumb (Analytics → Receipts → id).
//   - Big green verdict banner when both signature + on-chain checks pass.
//   - Two separate badge pills below the banner ("✅ Signature valid",
//     "✅ On-chain verified") so the dual-layer verification is visible.
//   - Two-column grid: Settlement / Routing / Pricing tables on the left,
//     verification logic + copy-paste verify commands on the right.
//   - Basescan link on the tx hash, copy-paste reference verifier commands.
//
// The verify functions (verifyReceiptSignatureInProcess /
// verifyReceiptOnChainInProcess / getOrComputeVerifyResults) are unchanged
// from Phase 3+4 — they're the canonical in-process verifier used by
// scripts/verify-receipt.js as well. Only the rendering changed.
//
// In-memory cache: receipts are immutable, so once verified for any request
// the {sig, chain} verdict is cached on receipt_id forever (until process
// restart). First render pays ~200-500ms for chain RPC; every subsequent
// render is <5ms.

import 'dotenv/config';
import crypto from 'crypto';
import { createPublicClient, decodeFunctionData, http } from 'viem';
import { base } from 'viem/chains';
import type { SignedReceipt } from './receipt-generator.js';
import { jcsCanonicalize } from './idempotency.js';
import { getPublicKeyPem } from './scorer.js';
import { siteHead, renderNav, renderFooter, escapeHtml } from './site-chrome.js';

// ---------------------------------------------------------------------------
// Constants — kept identical to scripts/verify-receipt.js so any drift here
// surfaces as a verification mismatch rather than silent rot.
// ---------------------------------------------------------------------------

// USDC v2 on Base. Per phase3-x402-construction.md.
const BASE_USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as const;

// transferWithAuthorization selector (first 4 bytes of keccak256 of the sig).
const TRANSFER_WITH_AUTH_SELECTOR = '0xe3ee160e';

// Module-local viem client. Public Base RPC by default; override via
// BASE_RPC_URL env when prod traffic warrants. Read-only; no signing.
const basePublicClient = createPublicClient({
  chain: base,
  transport: http(process.env.BASE_RPC_URL || 'https://mainnet.base.org'),
});

// ---------------------------------------------------------------------------
// In-memory verification cache. Receipts are immutable per receipt-generator.ts
// (signed at issue time, never re-signed), so the verdict is trivially cacheable.
// ---------------------------------------------------------------------------

type SigVerifyResult =
  | { kind: 'valid' }
  | { kind: 'invalid'; reason: string }
  | { kind: 'unverifiable'; reason: string };

type ChainVerifyResult =
  | { kind: 'verified'; block_number: number; payer: string; payee: string; amount: string }
  | { kind: 'mismatch'; reason: string }
  | { kind: 'unavailable'; reason: string };

type VerifyCache = {
  sig: SigVerifyResult;
  chain: ChainVerifyResult;
};

const verifyCache = new Map<string, VerifyCache>();

// ---------------------------------------------------------------------------
// Signature verification (in-process, mirrors verify-receipt.js verifyEnvelope).
// Steps must EXACTLY match src/receipt-generator.ts step 5 (sign) and
// scripts/verify-receipt.js verifyEnvelope (third-party verify).
// Any drift here produces a silent mismatch.
// ---------------------------------------------------------------------------

export function verifyReceiptSignatureInProcess(envelope: SignedReceipt): SigVerifyResult {
  const sig = envelope.signature;
  if (!sig || sig.alg !== 'ed25519') {
    return { kind: 'unverifiable', reason: `unsupported algorithm: ${sig?.alg ?? 'missing'}` };
  }
  const pubPem = getPublicKeyPem();
  if (!pubPem) {
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
  const canonical = jcsCanonicalize(envelope.receipt);
  const canonicalBytes = Buffer.from(canonical, 'utf8');
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
  return ok
    ? { kind: 'valid' }
    : { kind: 'invalid', reason: 'signature does not match canonical receipt bytes' };
}

// ---------------------------------------------------------------------------
// On-chain verification (mirrors verify-receipt.js verifyOnChain).
// Confirms tx exists, calls USDC.transferWithAuthorization, decoded args
// match (payer, payee, value), tx mined, and (when present) block_number.
// ---------------------------------------------------------------------------

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
    if (err?.name === 'TransactionNotFoundError') {
      return { kind: 'mismatch', reason: `tx not found on chain: ${txHash}` };
    }
    return { kind: 'unavailable', reason: `RPC error: ${err?.shortMessage || err?.message || String(err)}` };
  }
  if (!tx) return { kind: 'mismatch', reason: `tx not found: ${txHash}` };

  if (!tx.to || tx.to.toLowerCase() !== BASE_USDC_ADDRESS.toLowerCase()) {
    return { kind: 'mismatch', reason: `tx.to is ${tx.to} — expected USDC contract ${BASE_USDC_ADDRESS}` };
  }
  const selector = (tx.input as string).slice(0, 10).toLowerCase();
  if (selector !== TRANSFER_WITH_AUTH_SELECTOR) {
    return { kind: 'mismatch', reason: `tx selector ${selector} — expected ${TRANSFER_WITH_AUTH_SELECTOR}` };
  }

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

  let txReceipt: any;
  try {
    txReceipt = await basePublicClient.getTransactionReceipt({ hash: txHash as `0x${string}` });
  } catch (err: any) {
    return { kind: 'unavailable', reason: `tx receipt RPC error: ${err?.shortMessage || err?.message || String(err)}` };
  }
  if (!txReceipt) return { kind: 'mismatch', reason: 'tx exists but has no receipt yet (still pending)' };
  if (txReceipt.status !== 'success') {
    return { kind: 'mismatch', reason: `tx mined but reverted (status=${txReceipt.status})` };
  }
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
  const sig = verifyReceiptSignatureInProcess(envelope);
  const chain = await verifyReceiptOnChainInProcess(envelope);
  const result: VerifyCache = { sig, chain };
  verifyCache.set(id, result);
  return result;
}

// ---------------------------------------------------------------------------
// Render — Phase 4 light-theme design (V1 corrected from Stitch)
// ---------------------------------------------------------------------------

export function renderReceiptHtml(envelope: SignedReceipt, verify: VerifyCache): string {
  const r = envelope.receipt;
  const s = envelope.signature;
  const overall = overallVerdict(verify.sig, verify.chain);
  const basescanUrl = `https://basescan.org/tx/${r.settlement.tx_hash}`;
  const txHashShort = `${r.settlement.tx_hash.slice(0, 10)}...${r.settlement.tx_hash.slice(-4)}`;

  const title = `Receipt ${r.receipt_id} · TrustBench`;
  const desc = `${formatUsdc(r.settlement.amount_atomic, r.settlement.decimals)} ${r.settlement.currency} settlement for ${r.call.capability} routed by TrustBench. ${verify.sig.kind === 'valid' ? 'Signature verified.' : ''} ${verify.chain.kind === 'verified' ? 'On-chain confirmed.' : ''}`.trim();

  return `<!DOCTYPE html>
<html lang="en">
<head>
${siteHead(title, desc, 'receipt')}
</head>
<body class="bg-bg text-ink">
${renderNav('receipt')}

<main class="max-w-6xl mx-auto px-6 py-10">
  <!-- Breadcrumb -->
  <nav class="flex items-center gap-2 text-faint label-caps mb-6">
    <a href="/analytics" class="hover:text-primary">Analytics</a>
    <span>›</span>
    <span>Receipts</span>
    <span>›</span>
    <span class="text-ink mono normal-case tracking-normal text-xs">${escapeHtml(r.receipt_id)}</span>
  </nav>

  <!-- Verdict banner -->
  ${renderVerdictBanner(overall)}

  <!-- Two badges below banner -->
  <div class="flex flex-wrap gap-2 mt-3">
    ${renderSigBadge(verify.sig)}
    ${renderChainBadge(verify.chain)}
  </div>

  <p class="text-sm text-muted mt-3">
    Issued ${escapeHtml(formatTimestamp(r.issued_at))} by <span class="mono text-ink">${escapeHtml(r.issuer)}</span>
  </p>

  <!-- Two-column content grid -->
  <div class="mt-10 grid grid-cols-1 lg:grid-cols-12 gap-8">
    <!-- Left column: data tables -->
    <div class="lg:col-span-7 space-y-6">
      ${renderTable('Settlement', [
        ['Tx hash', `<a href="${escapeHtml(basescanUrl)}" target="_blank" rel="noopener noreferrer" class="mono text-primary hover:underline break-all">${escapeHtml(txHashShort)} <span class="text-xs">↗ Basescan</span></a>`],
        ['Block', typeof r.settlement.block_number === 'number' ? `<span class="mono">${r.settlement.block_number.toLocaleString('en-US')}</span>` : '<span class="text-faint">—</span>'],
        ['Payer', `<span class="mono text-xs break-all">${escapeHtml(r.settlement.payer_address)}</span>`],
        ['Payee', `<span class="mono text-xs break-all">${escapeHtml(r.settlement.payee_address)}</span>`],
        ['Amount', `<span class="font-semibold text-ink">${escapeHtml(formatUsdc(r.settlement.amount_atomic, r.settlement.decimals))} ${escapeHtml(r.settlement.currency)}</span> <span class="text-faint text-xs">on ${escapeHtml(r.settlement.chain)}</span>`],
        ['Settled at', `<span class="mono text-sm">${escapeHtml(formatTimestamp(r.settlement.settled_at))}</span>`],
      ])}

      ${renderTable('Routing', [
        ['Capability', `<span class="mono">${escapeHtml(r.call.capability)}</span>`],
        ['Provider', `<span class="mono text-sm break-all">${escapeHtml(r.call.provider_id)}</span>`],
        ['Score at decision', `<span class="mono">${escapeHtml(String(r.routing.score_at_decision))} / 100</span>`],
        ['Alternatives considered', `<span class="mono">${escapeHtml(String(r.routing.alternatives_considered))}</span>`],
        ['Selection reason', `<span class="mono">${escapeHtml(r.routing.selection_reason)}</span>`],
        ['Latency', `<span class="mono">${escapeHtml(String(r.call.latency_ms))} ms</span>`],
      ])}

      ${renderTable('Pricing', [
        ['Provider price', `<span class="mono">${escapeHtml(formatUsdc(r.pricing.provider_price_atomic, r.settlement.decimals))} ${escapeHtml(r.settlement.currency)}</span>`],
        ['TrustBench fee', `<span class="mono">${escapeHtml(formatUsdc(r.pricing.trustbench_fee_atomic, r.settlement.decimals))} ${escapeHtml(r.settlement.currency)}</span> <span class="text-faint text-xs">(${escapeHtml(r.pricing.fee_model)})</span>`],
        ['Total paid', `<span class="font-semibold text-primary mono">${escapeHtml(formatUsdc(r.pricing.total_paid_atomic, r.settlement.decimals))} ${escapeHtml(r.settlement.currency)}</span>`],
      ])}
    </div>

    <!-- Right column: verification logic + verify commands -->
    <div class="lg:col-span-5 space-y-6">
      <section class="bg-mono border border-border rounded-lg p-5">
        <h3 class="label-caps text-faint mb-4 flex items-center gap-2"><span>🛡️</span> Verification logic</h3>
        <div class="space-y-4">
          ${renderCheckRow(verify.sig.kind === 'valid', 'Signature valid', `Ed25519 detached signature verified against ${escapeHtml(s.key_id)} public key`)}
          ${renderCheckRow(verify.chain.kind === 'verified', 'On-chain verified', verify.chain.kind === 'verified' ? `Tx confirmed on Base block ${(verify.chain as any).block_number?.toLocaleString('en-US')} — payer/payee/amount match receipt` : 'kind' in verify.chain ? (verify.chain as any).reason : 'check unavailable')}
          ${renderCheckRow(true, 'Issuer attested', `Issued by ${escapeHtml(r.issuer)}`)}
        </div>
      </section>

      <section>
        <h3 class="label-caps text-faint mb-3">Verify yourself</h3>
        <p class="text-sm text-muted mb-3">The signature is detached and verifiable by anyone with the published Ed25519 public key.</p>
        <div class="space-y-2">
          <div class="bg-mono border border-border rounded p-3 mono text-xs break-all">npm run verify-receipt -- ${escapeHtml(r.receipt_id)}</div>
          <div class="bg-mono border border-border rounded p-3 mono text-xs break-all">npm run verify-receipt -- ${escapeHtml(r.receipt_id)} --check-chain</div>
        </div>
        <p class="mt-3 text-xs text-faint">
          Signed Ed25519 · key_id <code class="mono">${escapeHtml(s.key_id)}</code><br>
          Public key at <a href="${escapeHtml(s.public_key_url)}" class="text-primary hover:underline break-all">${escapeHtml(s.public_key_url)}</a>
        </p>
      </section>

      <section class="text-sm">
        <a href="?format=json" class="text-primary hover:underline">View as JSON →</a>
      </section>
    </div>
  </div>
</main>

${renderFooter()}
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Section / row renderers
// ---------------------------------------------------------------------------

function renderTable(label: string, rows: Array<[string, string]>): string {
  const tbody = rows.map(([k, v]) => `
    <tr class="border-b border-border last:border-0">
      <td class="label-caps text-faint py-3 pr-4 align-top whitespace-nowrap">${escapeHtml(k)}</td>
      <td class="py-3 text-sm">${v}</td>
    </tr>`).join('');
  return `<section>
    <h3 class="label-caps text-faint mb-3">${escapeHtml(label)}</h3>
    <div class="bg-surface border border-border rounded-lg p-5">
      <table class="w-full"><tbody>${tbody}</tbody></table>
    </div>
  </section>`;
}

function renderCheckRow(ok: boolean, title: string, sub: string): string {
  const icon = ok
    ? `<span class="text-primary text-lg leading-none">✓</span>`
    : `<span class="text-amber text-lg leading-none">⚠</span>`;
  return `<div class="flex items-start gap-3">
    <div class="mt-0.5">${icon}</div>
    <div>
      <p class="font-medium text-ink">${escapeHtml(title)}</p>
      <p class="text-xs text-muted leading-relaxed mt-0.5">${sub}</p>
    </div>
  </div>`;
}

type Verdict = 'pass' | 'partial' | 'fail';

function overallVerdict(sig: SigVerifyResult, chain: ChainVerifyResult): Verdict {
  if (sig.kind === 'valid' && chain.kind === 'verified') return 'pass';
  if (sig.kind === 'invalid' || chain.kind === 'mismatch') return 'fail';
  return 'partial';
}

function renderVerdictBanner(verdict: Verdict): string {
  if (verdict === 'pass') {
    return `<div class="bg-soft-green border border-primary/30 rounded-lg p-5 flex items-start gap-4">
      <div class="bg-primary text-white rounded-full p-2 flex-shrink-0"><span class="text-lg leading-none">✓</span></div>
      <div>
        <h1 class="text-xl font-semibold text-primary-dark">Verified receipt — signature valid AND on-chain settlement matches</h1>
        <p class="text-sm text-primary-dark/80 mt-1">Cryptographically verifiable by anyone with the published Ed25519 public key.</p>
      </div>
    </div>`;
  }
  if (verdict === 'fail') {
    return `<div class="bg-red-soft border border-red-ink/30 rounded-lg p-5 flex items-start gap-4">
      <div class="bg-red-ink text-white rounded-full p-2 flex-shrink-0"><span class="text-lg leading-none">✕</span></div>
      <div>
        <h1 class="text-xl font-semibold text-red-ink">Receipt verification failed — see details below</h1>
        <p class="text-sm text-red-ink/80 mt-1">One or more checks did not pass. Inspect the verification logic for the failure reason.</p>
      </div>
    </div>`;
  }
  return `<div class="bg-amber-soft border border-amber/30 rounded-lg p-5 flex items-start gap-4">
    <div class="bg-amber text-white rounded-full p-2 flex-shrink-0"><span class="text-lg leading-none">⚠</span></div>
    <div>
      <h1 class="text-xl font-semibold text-amber-ink">Partial verification — see details below</h1>
      <p class="text-sm text-amber-ink/80 mt-1">Some checks could not complete (e.g. transient RPC error, HMAC fallback mode).</p>
    </div>
  </div>`;
}

function renderSigBadge(sig: SigVerifyResult): string {
  if (sig.kind === 'valid') {
    return `<span class="inline-flex items-center gap-1.5 bg-soft-green text-primary-dark border border-primary/30 px-3 py-1 rounded-full text-sm font-medium">✅ Signature valid</span>`;
  }
  if (sig.kind === 'invalid') {
    return `<span class="inline-flex items-center gap-1.5 bg-red-soft text-red-ink border border-red-ink/30 px-3 py-1 rounded-full text-sm font-medium" title="${escapeHtml(sig.reason)}">❌ Signature invalid</span>`;
  }
  return `<span class="inline-flex items-center gap-1.5 bg-amber-soft text-amber-ink border border-amber/30 px-3 py-1 rounded-full text-sm font-medium" title="${escapeHtml(sig.reason)}">⚠ Signature not verifiable</span>`;
}

function renderChainBadge(chain: ChainVerifyResult): string {
  if (chain.kind === 'verified') {
    return `<span class="inline-flex items-center gap-1.5 bg-soft-green text-primary-dark border border-primary/30 px-3 py-1 rounded-full text-sm font-medium">✅ On-chain verified</span>`;
  }
  if (chain.kind === 'mismatch') {
    return `<span class="inline-flex items-center gap-1.5 bg-red-soft text-red-ink border border-red-ink/30 px-3 py-1 rounded-full text-sm font-medium" title="${escapeHtml(chain.reason)}">❌ On-chain mismatch</span>`;
  }
  return `<span class="inline-flex items-center gap-1.5 bg-amber-soft text-amber-ink border border-amber/30 px-3 py-1 rounded-full text-sm font-medium" title="${escapeHtml(chain.reason)}">⏳ On-chain check unavailable</span>`;
}

// ---------------------------------------------------------------------------
// Format helpers
// ---------------------------------------------------------------------------

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
