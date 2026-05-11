// src/pricing-html.ts — Phase 4 v0.1.0 paywall pricing page.
//
// Public, honest pricing display per phase4-paywall-design.md § Q7.
// Content-negotiated companion to the JSON path in src/index.ts /pricing.
//
// Design constraints (per CLAUDE.md + design doc):
//   - Anchors, not contracts. Reviewable; not silently changed. The page
//     literally says so in the disclaimer.
//   - Honest about what's live (v0.1.0: /route only) vs coming (v0.2.0+).
//     Every row labels its status. No "vapor" rows that look shipping.
//   - Compose framing. Strata / Infopunks / Aggelos integrations get a
//     callout pointing at partner-volume credit (not pre-priced).
//   - No em-dashes in user-visible copy. Internal/code comments still allow
//     them per feedback_no_em_dashes_outreach.md (outreach-only rule), but
//     /pricing reads as outreach-adjacent to first-time integrators, so the
//     same prose discipline applies.
//
// Companion JSON shape (served by the same /pricing route when Accept is
// application/json or ?format=json). Shape:
//   {
//     version: "0.1.0",
//     base_currency: "USDC",
//     network: "Base (eip155:8453)",
//     facilitator: "Coinbase CDP facilitator",
//     facilitator_url: "https://api.cdp.coinbase.com/platform/v2/x402",
//     facilitator_docs: "https://docs.cdp.coinbase.com/x402/welcome",
//     tiers: [
//       { name, price_usdc, endpoints[], status, available_in? },
//       ...
//     ],
//     disclaimer: "...",
//     last_updated: "2026-05-11"
//   }
//
// The JSON shape is the agent-consumable view; if an agent crawls /pricing
// with Accept: application/json it gets a stable, programmatic version.

import { siteHead, renderNav, renderFooter, escapeHtml } from './site-chrome.js';

// Canonical anchor — every other field references this. Bump on table changes.
export const PRICING_VERSION = '0.1.0';
export const PRICING_LAST_UPDATED = '2026-05-11';

// Tier shape. status describes shipping state; `available_in` is the version
// tag for not-yet-shipped tiers (purely informational; not a release commitment).
export type TierStatus = 'live' | 'planned';

export type PricingTier = {
  name: string;                  // human label, e.g. "Score-provider"
  slug: string;                  // mono-readable id, e.g. "score-provider"
  price_usdc: string;            // human price, e.g. "$0.005" or "Quote on request"
  amount_atomic: string | null;  // atomic units (6-decimal USDC), null when negotiated
  endpoints: { path: string; description: string }[];
  status: TierStatus;
  available_in?: string;         // for planned tiers, e.g. "v0.2.0"
  notes?: string;                // optional one-liner shown under the tier name
};

// Anchored from phase4-paywall-design.md § Q7. Treat this array as the
// source of truth — both HTML and JSON read from it. Update both in the same
// commit.
export const PRICING_TIERS: PricingTier[] = [
  {
    name: 'Score-provider',
    slug: 'score-provider',
    price_usdc: '$0.005',
    amount_atomic: '5000',
    endpoints: [
      { path: 'POST /route', description: 'Non-custodial routing decision with Ed25519-signed routing receipt.' },
      { path: 'POST /score-provider', description: 'Returns the registry score and risk annotations for any registered URL.' },
    ],
    status: 'live',
    notes: 'v0.1.0 ships /route at this tier. /score-provider is in active design.',
  },
  {
    name: 'Verify',
    slug: 'verify',
    price_usdc: '$0.002',
    amount_atomic: '2000',
    endpoints: [
      { path: 'POST /verify', description: 'Hosted verifier for externally-provided TrustBench receipts. Same logic as the @trustbench/verify-receipt npm package, no peer-dependency setup.' },
    ],
    status: 'planned',
    available_in: 'v0.2.0',
  },
  {
    name: 'Audit-replay',
    slug: 'audit-replay',
    price_usdc: '$0.01',
    amount_atomic: '10000',
    endpoints: [
      { path: 'GET /receipts/:id?replay=true', description: 'Re-verifies receipt signature plus on-chain settlement against the current chain state. Returns a fresh signed audit packet.' },
    ],
    status: 'planned',
    available_in: 'v0.2.0',
  },
  {
    name: 'Read (JSON above free-tier quota)',
    slug: 'read',
    price_usdc: '$0.0005',
    amount_atomic: '500',
    endpoints: [
      { path: 'GET /rankings (JSON)', description: 'Programmatic access to ranked provider list. Free under quota, paid above.' },
      { path: 'GET /receipts/:id (JSON)', description: 'Programmatic receipt envelope. Free under quota, paid above.' },
    ],
    status: 'planned',
    available_in: 'v0.2.0',
    notes: 'HTML responses on both endpoints stay free permanently. JSON paywall only kicks in above the 60 req/IP/min quota.',
  },
  {
    name: 'Compliance-export (single)',
    slug: 'compliance-export-single',
    price_usdc: '$0.50',
    amount_atomic: '500000',
    endpoints: [
      { path: 'POST /compliance-export?bundle=false', description: 'Signed single-receipt export in CSV or JSON. Tamper-evident.' },
    ],
    status: 'planned',
    available_in: 'v0.3.0',
  },
  {
    name: 'Compliance-export (bundle, up to 100)',
    slug: 'compliance-export-bundle',
    price_usdc: '$2.00',
    amount_atomic: '2000000',
    endpoints: [
      { path: 'POST /compliance-export?bundle=true', description: 'Signed multi-receipt bundle up to 100 receipts. CSV or JSON.' },
    ],
    status: 'planned',
    available_in: 'v0.3.0',
  },
  {
    name: 'Compliance-export (negotiated, over 100)',
    slug: 'compliance-export-negotiated',
    price_usdc: 'Quote on request',
    amount_atomic: null,
    endpoints: [
      { path: 'POST /compliance-export?bundle=true (>100)', description: 'Large bundle pricing is volume-negotiated. Reach out for a quote.' },
    ],
    status: 'planned',
    available_in: 'v0.3.0',
  },
];

// ---------------------------------------------------------------------------
// JSON view (agent-consumable)
// ---------------------------------------------------------------------------
export function buildPricingJson(): unknown {
  return {
    version: PRICING_VERSION,
    base_currency: 'USDC',
    network: 'Base (eip155:8453)',
    facilitator: 'Coinbase CDP facilitator',
    facilitator_url: 'https://api.cdp.coinbase.com/platform/v2/x402',
    facilitator_docs: 'https://docs.cdp.coinbase.com/x402/welcome',
    last_updated: PRICING_LAST_UPDATED,
    disclaimer:
      'Prices are anchors, not contracts. They may change with public notice on this page. Existing partner agreements override the table for that partner. Read /methodology for what TrustBench actually measures.',
    receipt_spec: 'https://github.com/lithvall/TrustBench/blob/main/receipt-spec-v1.md',
    verifier_npm: 'https://www.npmjs.com/package/@trustbench/verify-receipt',
    tiers: PRICING_TIERS.map((t) => ({
      name: t.name,
      slug: t.slug,
      price_usdc: t.price_usdc,
      amount_atomic: t.amount_atomic,
      endpoints: t.endpoints,
      status: t.status,
      ...(t.available_in ? { available_in: t.available_in } : {}),
      ...(t.notes ? { notes: t.notes } : {}),
    })),
  };
}

// ---------------------------------------------------------------------------
// HTML view (browser-consumable)
// ---------------------------------------------------------------------------
export function renderPricingHtml(): string {
  const title = 'Pricing — TrustBench';
  const description =
    'TrustBench paywalled endpoints, priced in USDC on Base via x402. v0.1.0 ships /route at $0.005 per call. Read endpoints stay free below quota. Anchors, not contracts.';

  const tierRows = PRICING_TIERS.map((t) => renderTierRow(t)).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
${siteHead(title, description, 'pricing')}
</head>
<body class="bg-bg text-ink">
${renderNav('pricing')}

<main class="max-w-7xl mx-auto px-6 py-12">
  <div class="lg:grid lg:grid-cols-12 lg:gap-12">
    <!-- Main doc column -->
    <article class="lg:col-span-9 max-w-[760px]">
      <div class="label-caps text-faint mb-2">Documentation</div>
      <h1 class="text-4xl font-semibold tracking-tight text-ink mb-4">Pricing</h1>
      <p class="text-lg text-muted leading-relaxed">
        TrustBench paywalled endpoints settle in USDC on Base via x402. Pay per call, no subscriptions,
        no contracts. v0.1.0 ships <span class="mono text-sm bg-mono px-1.5 py-0.5 rounded">POST /route</span>
        at the score-provider tier; the remaining tiers are designed and listed below but ship in v0.2.0
        and v0.3.0 as actual paid traffic justifies them.
      </p>

      <!-- Honest disclaimer box -->
      <div class="mt-6 bg-amber-soft border border-amber rounded p-5">
        <div class="label-caps text-amber-ink mb-2">Anchors, not contracts</div>
        <p class="text-sm text-amber-ink leading-relaxed">
          The prices below are reviewable and may change with public notice on this page.
          Existing partner agreements override the table for that partner.
          Read <a href="/methodology" class="underline">/methodology</a> for what TrustBench actually
          measures behind the priced endpoints.
        </p>
      </div>

      <!-- Section: The protocol -->
      <section id="how-payment-works" class="mt-12">
        <h2 class="text-2xl font-semibold tracking-tight text-ink pb-3 border-b-2 border-primary inline-block mb-6">How payment works</h2>
        <ul class="space-y-3 text-ink">
          <li class="flex gap-3"><span class="text-primary mt-1">▸</span><span>Paid endpoints respond <span class="mono text-sm bg-mono px-1.5 py-0.5 rounded">402 Payment Required</span> with x402 payment requirements pointing at TrustBench's revenue wallet on Base.</span></li>
          <li class="flex gap-3"><span class="text-primary mt-1">▸</span><span>Agents sign an EIP-3009 <span class="mono text-sm bg-mono px-1.5 py-0.5 rounded">transferWithAuthorization</span> for the listed price and retry with an <span class="mono text-sm bg-mono px-1.5 py-0.5 rounded">X-PAYMENT</span> header.</span></li>
          <li class="flex gap-3"><span class="text-primary mt-1">▸</span><span>The <a href="https://docs.cdp.coinbase.com/x402/welcome" target="_blank" rel="noopener noreferrer" class="text-primary underline">Coinbase CDP facilitator</a> verifies the signature and submits the transfer on-chain. TrustBench never holds agent funds.</span></li>
          <li class="flex gap-3"><span class="text-primary mt-1">▸</span><span>Differentiated-work endpoints (routing, scoring, verification, audit replay) return an Ed25519-signed response envelope. Verify it with the public <a href="https://www.npmjs.com/package/@trustbench/verify-receipt" target="_blank" rel="noopener noreferrer" class="text-primary underline">@trustbench/verify-receipt</a> npm package or the reference verifier in the GitHub repo.</span></li>
          <li class="flex gap-3"><span class="text-primary mt-1">▸</span><span><span class="mono text-sm bg-mono px-1.5 py-0.5 rounded">Idempotency-Key</span> headers are honored. Same key plus same body within 24 hours replays the cached response without re-charging.</span></li>
        </ul>
      </section>

      <!-- Section: Tier table -->
      <section id="tiers" class="mt-12">
        <h2 class="text-2xl font-semibold tracking-tight text-ink pb-3 border-b-2 border-primary inline-block mb-6">Tiers</h2>
        <div class="space-y-6">
          ${tierRows}
        </div>
      </section>

      <!-- Section: Compose with partners -->
      <section id="compose" class="mt-12">
        <h2 class="text-2xl font-semibold tracking-tight text-ink pb-3 border-b-2 border-primary inline-block mb-6">Integrating with a stack</h2>
        <p class="text-ink leading-relaxed">
          TrustBench composes with other agent-infrastructure providers. If you are wiring TrustBench into
          a stack that already includes Strata for pre-call trust signals, Infopunks for cognition, or a
          client-side payment library like QBT-Labs/x402, partner-volume credit is on the table before
          per-call billing locks in. Reach out at the GitHub repo and describe your integration shape.
        </p>
      </section>

      <!-- Section: Refunds + disputes -->
      <section id="refunds" class="mt-12">
        <h2 class="text-2xl font-semibold tracking-tight text-ink pb-3 border-b-2 border-primary inline-block mb-6">Refunds and disputes</h2>
        <p class="text-ink leading-relaxed">
          v0.1.0 does not ship a refund path. Retries through the <span class="mono text-sm bg-mono px-1.5 py-0.5 rounded">Idempotency-Key</span> header
          recover the cached response without double-charging, which covers the common failure mode (partial
          timeout). If a paid response is wrong or stale, the methodology page describes what the underlying
          measurement does and does not represent; the priced endpoints inherit those caveats.
        </p>
        <p class="text-ink leading-relaxed mt-4">
          If dispute volume justifies it, an off-chain credit-ledger refund path lands in a future paywall version.
          Until then, treat per-call payments as final.
        </p>
      </section>

      <!-- Section: References -->
      <section id="references" class="mt-12">
        <h2 class="text-2xl font-semibold tracking-tight text-ink pb-3 border-b-2 border-primary inline-block mb-6">References</h2>
        <ul class="space-y-2 text-ink">
          <li class="flex gap-3"><span class="text-primary mt-1">▸</span><a href="https://github.com/lithvall/TrustBench/blob/main/receipt-spec-v1.md" target="_blank" rel="noopener noreferrer" class="text-primary underline">Receipt spec v1 (envelope format, signing scheme)</a></li>
          <li class="flex gap-3"><span class="text-primary mt-1">▸</span><a href="https://www.npmjs.com/package/@trustbench/verify-receipt" target="_blank" rel="noopener noreferrer" class="text-primary underline">@trustbench/verify-receipt on npm</a></li>
          <li class="flex gap-3"><span class="text-primary mt-1">▸</span><a href="/.well-known/trustbench-pubkey" class="text-primary underline">TrustBench public key</a></li>
          <li class="flex gap-3"><span class="text-primary mt-1">▸</span><a href="/methodology" class="text-primary underline">Methodology (what we measure, what we don't)</a></li>
          <li class="flex gap-3"><span class="text-primary mt-1">▸</span><a href="/pricing?format=json" class="text-primary underline">Pricing as JSON (agent-consumable)</a></li>
        </ul>
      </section>

      <div class="mt-12 text-sm text-faint">
        <span class="mono">Pricing version ${PRICING_VERSION} · Last updated ${PRICING_LAST_UPDATED}</span>
      </div>
    </article>

    <!-- Right-side TOC -->
    <aside class="hidden lg:block lg:col-span-3">
      <nav class="sticky top-24 space-y-3 text-sm">
        <div class="label-caps text-faint">On this page</div>
        <a href="#how-payment-works" class="block text-muted hover:text-primary">How payment works</a>
        <a href="#tiers" class="block text-muted hover:text-primary">Tiers</a>
        <a href="#compose" class="block text-muted hover:text-primary">Integrating with a stack</a>
        <a href="#refunds" class="block text-muted hover:text-primary">Refunds and disputes</a>
        <a href="#references" class="block text-muted hover:text-primary">References</a>
      </nav>
    </aside>
  </div>
</main>

${renderFooter()}
</body>
</html>`;
}

// Renders a single tier card with status badge and endpoint list.
function renderTierRow(t: PricingTier): string {
  const isLive = t.status === 'live';
  const badge = isLive
    ? `<span class="inline-flex items-center gap-1 bg-soft-green text-primary-dark border border-primary rounded px-2 py-0.5 text-xs font-medium label-caps">Live in v${PRICING_VERSION}</span>`
    : `<span class="inline-flex items-center gap-1 bg-mono text-muted border border-border rounded px-2 py-0.5 text-xs font-medium label-caps">Available in ${escapeHtml(t.available_in ?? 'a future version')}</span>`;

  const endpointList = t.endpoints
    .map(
      (e) => `
        <div class="border-l-2 border-border pl-4 py-1">
          <div class="mono text-sm text-ink">${escapeHtml(e.path)}</div>
          <div class="text-sm text-muted leading-relaxed mt-1">${escapeHtml(e.description)}</div>
        </div>`,
    )
    .join('');

  const notesBlock = t.notes
    ? `<p class="text-sm text-muted leading-relaxed mt-3"><span class="label-caps text-faint mr-1">Note:</span>${escapeHtml(t.notes)}</p>`
    : '';

  return `<div class="bg-surface border border-border rounded p-6">
  <div class="flex items-start justify-between gap-4 flex-wrap">
    <div>
      <h3 class="text-xl font-semibold text-ink">${escapeHtml(t.name)}</h3>
      <div class="text-2xl font-semibold text-primary mt-1 mono">${escapeHtml(t.price_usdc)} <span class="text-sm text-muted font-normal">per call</span></div>
    </div>
    ${badge}
  </div>
  <div class="mt-4 space-y-2">
    ${endpointList}
  </div>
  ${notesBlock}
</div>`;
}
