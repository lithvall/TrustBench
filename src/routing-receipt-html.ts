// src/routing-receipt-html.ts — Phase 4 routing-receipt detail page.
//
// Companion to receipt-html.ts. receipt-html.ts handles Phase 3 settlement
// receipts (`kind: 'paid_response.settle'`, stored in the `receipts` table).
// This file handles Phase 4 routing receipts (`kind: 'paid_response.route'`,
// stored in paid_requests.response_body). The two receipt shapes diverge
// enough that a single parameterized renderer would be uglier than two
// parallel files; if a third kind ever appears, factor a shared base.
//
// Field-shape diffs from Phase 3:
//   - Phase 3 has `receipt.settlement.{...}` block; Phase 4 has `receipt.paid.{...}`.
//     Fields mostly overlap (chain, tx_hash, payer_address, payee_address,
//     amount_atomic, currency, decimals, settled_at) but Phase 4 paid block
//     has no block_number.
//   - Phase 3 has `receipt.routing.{...}` + `receipt.call.{capability,
//     provider_id, latency_ms}` + `receipt.pricing.{...}` for the
//     provider-price / TrustBench-fee / total split. Phase 4 routing receipt
//     is FEE-ONLY: paid.amount_atomic IS the TrustBench routing fee
//     ($0.005). Provider payment is a separate x402 transaction. There is
//     no pricing block on Phase 4 routing receipts.
//   - Phase 3 receipt.call has capability + provider_id + latency_ms. Phase 4
//     receipt.call has idempotency_key + request_hash; capability+provider
//     have moved into receipt.routing.
//
// Signature verification: kind-agnostic. The signature is over canonical
// receipt bytes regardless of which kind; we delegate to receipt-html.ts's
// `verifyReceiptSignatureInProcess` which only inspects envelope.signature.
//
// On-chain verification: needs to target receipt.paid.* (not settlement.*).
// New function `verifyRoutingReceiptOnChainInProcess` mirrors the Phase 3
// version but reads from the paid block. Same USDC + selector + decoded-args
// check; block_number check skipped (paid block doesn't include it).
//
// Cache: separate map from receipt-html.ts to avoid envelope-type confusion.

import 'dotenv/config';
import { createPublicClient, decodeFunctionData, http } from 'viem';
import { base } from 'viem/chains';
import { verifyReceiptSignatureInProcess } from './receipt-html.js';
import { siteHead, renderNav, renderFooter, escapeHtml } from './site-chrome.js';
import type { TrustSignal } from './trust-signals.js';

// ---------------------------------------------------------------------------
// Type for the SignedRoutingResponse subset we accept (matches paywall-handler.ts).
// We intentionally type loosely (any) for inner blocks so future schema additions
// don't require coordinated edits here. Defensive accessors below assume only
// the fields we actually read.
// ---------------------------------------------------------------------------

export type SignedRoutingEnvelope = {
  receipt: {
    kind: 'paid_response.route';
    version: string;
    receipt_id: string;
    issued_at: string;
    issuer: string;
    paid: {
      chain: string;
      tx_hash: string;
      payer_address: string;
      payee_address: string;
      amount_atomic: string;
      currency: string;
      decimals: number;
      settled_at: string;
    };
    routing: {
      capability: string;
      provider_id: string;
      provider_url: string;
      score_at_decision: number;
      alternatives_considered: number;
      selection_reason: string;
    };
    call: {
      idempotency_key: string | null;
      request_hash: string;
    };
    // Optional trust-signal annotations. Each entry is the verbatim parsed
    // payload from a partner (e.g. Strata). Absent on receipts issued before
    // Change 2 (2026-05-13) or when no X-Trust-Signals header was sent.
    trust_signals?: TrustSignal[];
  };
  signature: {
    alg: 'ed25519';
    value: string;
    key_id: string;
    public_key_url: string;
  };
};

// ---------------------------------------------------------------------------
// Constants — same as receipt-html.ts so a verification mismatch surfaces
// the same way.
// ---------------------------------------------------------------------------

const BASE_USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as const;
const TRANSFER_WITH_AUTH_SELECTOR = '0xe3ee160e';

const basePublicClient = createPublicClient({
  chain: base,
  transport: http(process.env.BASE_RPC_URL || 'https://mainnet.base.org'),
});

// ---------------------------------------------------------------------------
// Verify result types — reuse the same shape contract as receipt-html.ts so
// the badge/banner renderers can stay structurally identical.
// ---------------------------------------------------------------------------

type SigVerifyResult =
  | { kind: 'valid' }
  | { kind: 'invalid'; reason: string }
  | { kind: 'unverifiable'; reason: string };

type ChainVerifyResult =
  | { kind: 'verified'; block_number: number; payer: string; payee: string; amount: string }
  | { kind: 'mismatch'; reason: string }
  | { kind: 'unavailable'; reason: string };

export type RoutingVerifyCache = {
  sig: SigVerifyResult;
  chain: ChainVerifyResult;
};

// Independent in-memory cache so we don't collide with Phase 3's verifyCache.
// Receipts are immutable, so once verified the verdict is cached forever (until
// process restart). First render pays ~200-500ms for chain RPC; subsequent <5ms.
const routingVerifyCache = new Map<string, RoutingVerifyCache>();

// ---------------------------------------------------------------------------
// On-chain verification for routing receipts.
//
// Mirrors verifyReceiptOnChainInProcess in receipt-html.ts but reads from
// receipt.paid.* (Phase 4) instead of receipt.settlement.* (Phase 3). The
// underlying check is the same: tx exists at the USDC contract on Base,
// calls transferWithAuthorization, decoded (from, to, value) match the
// receipt. block_number check is skipped because routing receipts don't
// include a block_number field.
// ---------------------------------------------------------------------------

export async function verifyRoutingReceiptOnChainInProcess(
  envelope: SignedRoutingEnvelope,
): Promise<ChainVerifyResult> {
  const paid = envelope.receipt.paid;
  if (!paid) {
    return { kind: 'mismatch', reason: 'receipt has no paid block' };
  }
  if (paid.chain !== 'base') {
    return { kind: 'unavailable', reason: `unsupported chain "${paid.chain}" — only "base" is implemented` };
  }
  const txHash = paid.tx_hash;
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
  const recPayer = paid.payer_address.toLowerCase();
  const recPayee = paid.payee_address.toLowerCase();
  const recAmount = BigInt(paid.amount_atomic);
  if (chainFrom.toLowerCase() !== recPayer) {
    return { kind: 'mismatch', reason: `payer mismatch: chain=${chainFrom} receipt=${paid.payer_address}` };
  }
  if (chainTo.toLowerCase() !== recPayee) {
    return { kind: 'mismatch', reason: `payee mismatch: chain=${chainTo} receipt=${paid.payee_address}` };
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
  // No block_number check — routing receipts don't store it. The successful
  // status + matching tx args + matching contract address are sufficient.

  return {
    kind: 'verified',
    block_number: Number(txReceipt.blockNumber),
    payer: chainFrom,
    payee: chainTo,
    amount: chainValue.toString(),
  };
}

// ---------------------------------------------------------------------------
// Cached entry point. Signature verification reuses the Phase 3 implementation
// (kind-agnostic). On-chain verification uses the Phase 4 implementation above.
// ---------------------------------------------------------------------------

export async function getOrComputeRoutingVerifyResults(
  envelope: SignedRoutingEnvelope,
): Promise<RoutingVerifyCache> {
  const id = envelope.receipt.receipt_id;
  const cached = routingVerifyCache.get(id);
  if (cached) return cached;
  // verifyReceiptSignatureInProcess accepts any envelope with .receipt + .signature
  // — kind-agnostic, signs the canonical bytes of envelope.receipt.
  const sig = verifyReceiptSignatureInProcess(envelope as any);
  const chain = await verifyRoutingReceiptOnChainInProcess(envelope);
  const result: RoutingVerifyCache = { sig, chain };
  routingVerifyCache.set(id, result);
  return result;
}

// ---------------------------------------------------------------------------
// Render. Mirrors the layout/visual posture of renderReceiptHtml so partners
// landing on either kind of receipt see a consistent visual language.
//
// Differences from Phase 3:
//   - Block row in Settlement table shows "—" (paid block doesn't have it).
//   - No Pricing section. Replaced with a single-row "Routing fee" note that
//     explicitly clarifies provider payment is separate.
//   - Routing table reads from receipt.routing (which includes capability +
//     provider_url in Phase 4, vs receipt.call.capability in Phase 3).
//   - Call table is replaced with an "Audit" mini-section showing
//     idempotency_key + request_hash (the routing receipt's call block).
// ---------------------------------------------------------------------------

export function renderRoutingReceiptHtml(
  envelope: SignedRoutingEnvelope,
  verify: RoutingVerifyCache,
): string {
  const r = envelope.receipt;
  const s = envelope.signature;
  const overall = overallVerdict(verify.sig, verify.chain);
  const basescanUrl = `https://basescan.org/tx/${r.paid.tx_hash}`;
  const txHashShort = `${r.paid.tx_hash.slice(0, 10)}...${r.paid.tx_hash.slice(-4)}`;

  const title = `Receipt ${r.receipt_id} · TrustBench`;
  const desc = `${formatUsdc(r.paid.amount_atomic, r.paid.decimals)} ${r.paid.currency} routing fee for ${r.routing.capability} routed by TrustBench. ${verify.sig.kind === 'valid' ? 'Signature verified.' : ''} ${verify.chain.kind === 'verified' ? 'On-chain confirmed.' : ''}`.trim();

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
    Routing receipt · issued ${escapeHtml(formatTimestamp(r.issued_at))} by <span class="mono text-ink">${escapeHtml(r.issuer)}</span>
  </p>

  <!-- Two-column content grid -->
  <div class="mt-10 grid grid-cols-1 lg:grid-cols-12 gap-8">
    <!-- Left column: data tables -->
    <div class="lg:col-span-7 space-y-6">
      ${renderTable('Settlement', [
        ['Tx hash', `<a href="${escapeHtml(basescanUrl)}" target="_blank" rel="noopener noreferrer" class="mono text-primary hover:underline break-all">${escapeHtml(txHashShort)} <span class="text-xs">↗ Basescan</span></a>`],
        ['Block', verify.chain.kind === 'verified' ? `<span class="mono">${verify.chain.block_number.toLocaleString('en-US')}</span> <span class="text-faint text-xs">(from on-chain verify)</span>` : '<span class="text-faint">—</span>'],
        ['Payer', `<span class="mono text-xs break-all">${escapeHtml(r.paid.payer_address)}</span>`],
        ['Payee', `<span class="mono text-xs break-all">${escapeHtml(r.paid.payee_address)}</span>`],
        ['Routing fee', `<span class="font-semibold text-ink">${escapeHtml(formatUsdc(r.paid.amount_atomic, r.paid.decimals))} ${escapeHtml(r.paid.currency)}</span> <span class="text-faint text-xs">on ${escapeHtml(r.paid.chain)} · TrustBench fee only; provider payment is a separate x402 tx</span>`],
        ['Settled at', `<span class="mono text-sm">${escapeHtml(formatTimestamp(r.paid.settled_at))}</span>`],
      ])}

      ${renderTable('Routing decision', [
        ['Capability', `<span class="mono">${escapeHtml(r.routing.capability)}</span>`],
        ['Provider', `<a href="${escapeHtml(r.routing.provider_url)}" target="_blank" rel="noopener noreferrer" class="mono text-sm text-primary hover:underline break-all">${escapeHtml(r.routing.provider_url)}</a>`],
        ['Score at decision', `<span class="mono">${escapeHtml(String(r.routing.score_at_decision))} / 100</span>`],
        ['Alternatives considered', `<span class="mono">${escapeHtml(String(r.routing.alternatives_considered))}</span>`],
        ['Selection reason', `<span class="mono">${escapeHtml(r.routing.selection_reason)}</span>`],
      ])}

      ${renderTable('Audit', [
        ['Idempotency key', r.call.idempotency_key ? `<span class="mono text-xs break-all">${escapeHtml(r.call.idempotency_key)}</span>` : '<span class="text-faint">—</span>'],
        ['Request hash', `<span class="mono text-xs break-all">${escapeHtml(r.call.request_hash)}</span>`],
      ])}

      ${renderTrustSignalsSection(r.trust_signals)}
    </div>

    <!-- Right column: verification logic + verify commands -->
    <div class="lg:col-span-5 space-y-6">
      <section class="bg-mono border border-border rounded-lg p-5">
        <h3 class="label-caps text-faint mb-4 flex items-center gap-2"><span>🛡️</span> Verification logic</h3>
        <div class="space-y-4">
          ${renderCheckRow(verify.sig.kind === 'valid', 'Signature valid', `Ed25519 detached signature verified against ${escapeHtml(s.key_id)} public key`)}
          ${renderCheckRow(verify.chain.kind === 'verified', 'On-chain verified', verify.chain.kind === 'verified' ? `Tx confirmed on Base block ${(verify.chain as any).block_number?.toLocaleString('en-US')} — payer/payee/amount match receipt` : 'reason' in verify.chain ? (verify.chain as any).reason : 'check unavailable')}
          ${renderCheckRow(true, 'Issuer attested', `Issued by ${escapeHtml(r.issuer)}`)}
        </div>
      </section>

      <section>
        <h3 class="label-caps text-faint mb-3">Verify yourself</h3>
        <p class="text-sm text-muted mb-3">The signature is detached and verifiable by anyone with the published Ed25519 public key. <code class="mono text-xs">@trustbench/verify-receipt</code> on npm is the one-line third-party verifier.</p>
        <div class="space-y-2">
          <div class="bg-mono border border-border rounded p-3 mono text-xs break-all">npx @trustbench/verify-receipt ${escapeHtml(r.receipt_id)}</div>
          <div class="bg-mono border border-border rounded p-3 mono text-xs break-all">npx @trustbench/verify-receipt ${escapeHtml(r.receipt_id)} --check-chain</div>
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
// Local section/row renderers — identical in shape to receipt-html.ts so the
// two pages render in the same visual language. Kept local rather than
// exported from receipt-html.ts to avoid coupling future Phase 3 visual
// tweaks to Phase 4 (and vice-versa).
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Trust-signals section (Change 2, 2026-05-13).
//
// Renders partner-supplied pre-call trust posture (e.g. Strata's runtime score)
// captured at /route time and embedded inside the signed receipt body.
//
// Visual posture: subordinate to Settlement + Routing decision. This is
// supplementary context, not the headline artifact — the headline is the
// signed-+-on-chain-verified routing decision above. The signals section sits
// at the bottom of the left column under Audit.
//
// Signature semantics (this is the LOAD-BEARING copy on this page):
// The Ed25519 signature attests "TrustBench observed exactly these bytes at
// issued_at." It does NOT attest "these bytes are truthful." A Strata-aware
// downstream verifier knows to re-fetch via the `ref` URL to confirm the score
// is real. Strata's 2026-05-12 reply endorsed this semantic explicitly. This
// distinction matters because the rendered page is publicly viewable, and we
// must not let a reader over-interpret the cryptographic binding.
//
// Failure mode if this render is wrong:
//   (a) Render omits a present trust_signals → public artifact is incomplete,
//       integration partner can't point to the rendered receipt as proof.
//       Mitigation: this function unconditionally renders when the array is
//       non-empty; the conditional in the caller is "is it present?", not
//       "should we render it?".
//   (b) Render leaks an XSS payload from a malicious signal field → public
//       page execution context. Mitigation: every interpolation goes through
//       escapeHtml, including the `ref` URL (rendered inside href + as text).
//       Tested by visual inspection on a payload with <script> in source/kind.
//   (c) Render shows untrustworthy data without the disambiguation copy → a
//       reader assumes TrustBench has verified the signal contents.
//       Mitigation: the "Signature attests observation, not truth" subline
//       below the section header makes the semantic explicit.
function renderTrustSignalsSection(signals: TrustSignal[] | undefined): string {
  if (!signals || signals.length === 0) return '';

  const rows = signals.map((sig, idx) => renderTrustSignalRow(sig, idx)).join('');

  return `<section>
    <h3 class="label-caps text-faint mb-3">Trust signals</h3>
    <p class="text-xs text-muted mb-3 leading-relaxed">
      Partner-supplied pre-call posture observed at the moment of payment, embedded verbatim in the signed receipt.
      <span class="font-medium text-ink">Signature attests observation, not truth</span> — verify the source via the linked <code class="mono">ref</code> URL for each entry.
    </p>
    <div class="bg-surface border border-border rounded-lg p-5 space-y-5">
      ${rows}
    </div>
  </section>`;
}

// Render a single trust_signals[] entry. The locked §3 shape from
// strata-integration-sketch-SEND.md has four required fields (source, kind,
// captured_at, ref) and several optional partner-specific fields. We render
// the required quartet first, then the well-known optionals if present, then
// nothing for the long tail (unknown future-Strata fields stay in the signed
// JSON but don't clutter the rendered page).
function renderTrustSignalRow(sig: TrustSignal, idx: number): string {
  // The four required-field renders. Order: source → kind → captured_at → ref.
  const base: Array<[string, string]> = [
    ['Source', `<span class="mono text-sm">${escapeHtml(sig.source)}</span>`],
    ['Kind', `<span class="mono text-sm">${escapeHtml(sig.kind)}</span>`],
    ['Captured at', `<span class="mono text-sm">${escapeHtml(formatTimestamp(sig.captured_at))}</span>`],
    ['Reference', renderRefLink(sig.ref)],
  ];

  // Well-known optional fields from Strata's locked §3 shape. Render only when
  // present + non-null; unknown future fields are signed but not rendered.
  const optionals: Array<[string, string]> = [];
  if (typeof sig.trusted === 'boolean') {
    optionals.push(['Trusted', renderBoolPill(sig.trusted)]);
  }
  if (typeof sig.security_score === 'number') {
    optionals.push(['Security score', `<span class="mono text-sm">${escapeHtml(String(sig.security_score))}</span> <span class="text-faint text-xs">/ 100</span>`]);
  }
  if (typeof sig.risk_level === 'string' && sig.risk_level.length > 0) {
    optionals.push(['Risk level', renderRiskPill(sig.risk_level)]);
  }
  if (Array.isArray(sig.actionable_flags) && sig.actionable_flags.length > 0) {
    optionals.push(['Actionable flags', renderFlagList(sig.actionable_flags as unknown[])]);
  }
  if (sig.payment_endpoint && typeof sig.payment_endpoint === 'object') {
    optionals.push(['Payment endpoint', renderPaymentEndpoint(sig.payment_endpoint as Record<string, unknown>)]);
  }

  const allRows = [...base, ...optionals];
  const tbody = allRows.map(([k, v]) => `
    <tr class="border-b border-border last:border-0">
      <td class="label-caps text-faint py-2 pr-4 align-top whitespace-nowrap">${escapeHtml(k)}</td>
      <td class="py-2 text-sm">${v}</td>
    </tr>`).join('');

  // Multi-entry header: only show the index counter when there are 2+ entries.
  // For the single-entry case (today's Strata-only world) the counter would be
  // noise.
  const header = idx === 0 ? '' : `<p class="label-caps text-faint pt-3 border-t border-border">Signal ${idx + 1}</p>`;

  return `<div>
    ${header}
    <table class="w-full"><tbody>${tbody}</tbody></table>
  </div>`;
}

// Render a ref URL: linked when http(s), inert otherwise. Both interpolations
// (href + visible text) go through escapeHtml so a hostile signal carrying
// `<script>` or `javascript:` URLs can't break out of the attribute.
function renderRefLink(ref: string): string {
  const safe = escapeHtml(ref);
  // Only treat as a hyperlink when the URL parses as http(s). Other schemes
  // (javascript:, data:, file:, etc.) render as plain text — same defensive
  // posture as receipt-html.ts URL handling.
  const isHttp = /^https?:\/\//i.test(ref);
  if (isHttp) {
    return `<a href="${safe}" target="_blank" rel="noopener noreferrer" class="mono text-xs text-primary hover:underline break-all">${safe} <span class="text-xs">↗</span></a>`;
  }
  return `<span class="mono text-xs break-all">${safe}</span>`;
}

function renderBoolPill(v: boolean): string {
  if (v) {
    return `<span class="inline-flex items-center gap-1 bg-soft-green text-primary-dark border border-primary/30 px-2 py-0.5 rounded text-xs font-medium">✓ true</span>`;
  }
  return `<span class="inline-flex items-center gap-1 bg-amber-soft text-amber-ink border border-amber/30 px-2 py-0.5 rounded text-xs font-medium">⚠ false</span>`;
}

function renderRiskPill(level: string): string {
  const lower = level.toLowerCase();
  // Defensive: only style when we recognize the value. Unknown values render
  // as plain mono text to avoid asserting a severity color we don't know.
  if (lower === 'low') {
    return `<span class="inline-flex items-center gap-1 bg-soft-green text-primary-dark border border-primary/30 px-2 py-0.5 rounded text-xs font-medium">${escapeHtml(level)}</span>`;
  }
  if (lower === 'medium') {
    return `<span class="inline-flex items-center gap-1 bg-amber-soft text-amber-ink border border-amber/30 px-2 py-0.5 rounded text-xs font-medium">${escapeHtml(level)}</span>`;
  }
  if (lower === 'high' || lower === 'critical') {
    return `<span class="inline-flex items-center gap-1 bg-red-soft text-red-ink border border-red-ink/30 px-2 py-0.5 rounded text-xs font-medium">${escapeHtml(level)}</span>`;
  }
  return `<span class="mono text-sm">${escapeHtml(level)}</span>`;
}

function renderFlagList(flags: unknown[]): string {
  // Each flag is rendered as a small pill. Non-string flag entries (which the
  // locked §3 shape doesn't define but the passthrough types allow) get
  // string-coerced + escaped so the render can never crash on bad data.
  const pills = flags
    .map((f) => `<span class="inline-flex items-center bg-amber-soft text-amber-ink border border-amber/30 px-2 py-0.5 rounded text-xs font-medium mono">${escapeHtml(String(f))}</span>`)
    .join(' ');
  return `<div class="flex flex-wrap gap-1">${pills}</div>`;
}

function renderPaymentEndpoint(pe: Record<string, unknown>): string {
  // Render the locked §3 payment_endpoint shape (amount_usd, currency, network)
  // when present; unknown fields are signed but not rendered. Defensive against
  // a future Strata schema that changes the inner shape.
  const parts: string[] = [];
  if (typeof pe.amount_usd === 'number') {
    parts.push(`<span class="font-medium">${escapeHtml(String(pe.amount_usd))}</span> <span class="text-faint">USD</span>`);
  } else if (typeof pe.amount_usd === 'string') {
    parts.push(`<span class="font-medium">${escapeHtml(pe.amount_usd)}</span> <span class="text-faint">USD</span>`);
  }
  if (typeof pe.currency === 'string') {
    parts.push(`<span class="mono text-xs">${escapeHtml(pe.currency)}</span>`);
  }
  if (typeof pe.network === 'string') {
    parts.push(`<span class="text-faint text-xs">on ${escapeHtml(pe.network)}</span>`);
  }
  if (parts.length === 0) return '<span class="text-faint">—</span>';
  return `<span class="text-sm">${parts.join(' ')}</span>`;
}

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
        <h1 class="text-xl font-semibold text-primary-dark">Verified routing receipt — signature valid AND on-chain settlement matches</h1>
        <p class="text-sm text-primary-dark/80 mt-1">Cryptographically verifiable by anyone with the published Ed25519 public key. Provider payment is a separate x402 transaction not covered by this receipt.</p>
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
// Format helpers — copied from receipt-html.ts. Tiny enough to duplicate;
// keeping them local avoids accidental Phase 3 ↔ Phase 4 import coupling.
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
