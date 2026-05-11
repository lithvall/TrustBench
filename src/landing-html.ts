// src/landing-html.ts — Phase 4 public landing page (V2 "Data-Forward").
//
// Strategy alignment: surfaces live registry telemetry above the fold to
// prove the registry is real and used. Three-tile stat strip is the key
// differentiator over a static marketing hero — numbers come from
// /metrics/registry-summary in src/index.ts and are honest at any scale
// (small numbers are still real; the page hides a tile if its query fails).
//
// Honest-framing rules baked in (per CLAUDE.md):
//   - No "benchmark", "ranking authority", "trust score", "10x", etc.
//   - Probe behavior described accurately ("HEAD-based, three samples per
//     provider per day, sampled across 3 region tags from one host today").
//   - Pay-to-list / never pay-to-rank surfaced as a soft-green strip.
//   - Non-custodial language throughout.
//
// All copy was validated by Stitch as Variant 2 (Data-Forward) in project
// 2707301026214116946 and reviewed against the seven-point high-risk-surface
// checklist in memory before shipping.
//
// 2026-05-06 cross-network reframe: hero h1 now leads with "Cross-network
// registry"; description + Registry card cite Base (via Coinbase Agentic
// Market) and Solana (via Heurist Mesh, Pay.sh skills) explicitly. Routing
// is still Base-only today (P4-3 Solana settlement is pending).

import { siteHead, renderNav, renderFooter, escapeHtml } from './site-chrome.js';

export type LandingStats = {
  endpointCount: number | null;
  receiptsLast30Days: number | null;
  medianLatencyMs: number | null;
};

export function renderLandingHtml(stats: LandingStats): string {
  const title = 'TrustBench — Cross-network registry + live telemetry for x402 endpoints';
  const description = 'Non-custodial routing and audit layer for x402: signed receipts with on-chain settlement evidence, fail-safe paywall, hard spend caps. Cross-network registry of endpoints across Base and Solana, with nightly liveness telemetry. Multi-protocol on the roadmap (x402, p402, MPP).';

  const stat = (label: string, value: string) => `
    <div class="p-6">
      <div class="label-caps text-muted mb-2">${escapeHtml(label)}</div>
      <div class="text-4xl font-semibold text-primary tabular-nums">${escapeHtml(value)}</div>
    </div>`;

  const fmt = (n: number | null, suffix = '') => n == null ? '—' : `${n.toLocaleString('en-US')}${suffix}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
${siteHead(title, description, 'home')}
</head>
<body class="bg-bg text-ink">
${renderNav('home')}

<main>
  <section class="max-w-6xl mx-auto px-6 pt-16 pb-12 text-center">
    <!-- h1 sized to fit each <br>-separated line on one visual line at desktop.
         The third line is the longest (~67 chars) so we cap at text-4xl rather
         than text-5xl to avoid mid-phrase wrapping. -->
    <h1 class="text-3xl md:text-4xl font-semibold tracking-tight leading-[1.2] text-ink">
      Cross-network registry + live telemetry for x402 endpoints.<br>
      Non-custodial smart router for agent payments.<br>
      Base today, Solana next; protocol-agnostic across x402, p402, MPP.
    </h1>
    <p class="mt-6 text-lg text-muted max-w-2xl mx-auto leading-relaxed">
      Signed receipts with on-chain settlement evidence, fail-safe paywall, hard spend caps. Honest measurement. Built solo, useful for any agent builder.
    </p>
    <div class="mt-8 flex flex-wrap justify-center gap-3">
      <a href="/rankings?capability=search" class="bg-primary hover:bg-primary-dark text-white px-6 py-3 rounded font-medium transition-colors">View rankings</a>
      <a href="/methodology" class="border border-border bg-surface hover:border-primary text-ink px-6 py-3 rounded font-medium transition-colors">How it's measured</a>
      <a href="/skill.md" class="border border-border bg-surface hover:border-primary text-ink px-6 py-3 rounded font-medium transition-colors">Read the docs</a>
    </div>
  </section>

  <section class="max-w-7xl mx-auto px-6">
    <div class="grid grid-cols-1 md:grid-cols-3 bg-surface border border-border rounded-lg divide-y md:divide-y-0 md:divide-x divide-border">
      ${stat('x402 endpoints registered', fmt(stats.endpointCount))}
      ${stat('Receipts issued last 30 days', fmt(stats.receiptsLast30Days))}
      ${stat('Median live probe latency', stats.medianLatencyMs == null ? '—' : `${stats.medianLatencyMs} ms`)}
    </div>
  </section>

  <section class="max-w-7xl mx-auto px-6 mt-16">
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <div class="bg-surface border border-border rounded-lg p-6">
        <div class="label-caps text-primary mb-3">Registry</div>
        <p class="text-sm text-ink leading-relaxed">Public list of x402-style endpoints across Base (Coinbase Agentic Market) and Solana (Heurist Mesh, Pay.sh skills), refreshable nightly. Pay-to-list with refundable bond, never pay-to-rank.</p>
      </div>
      <div class="bg-surface border border-border rounded-lg p-6">
        <div class="label-caps text-primary mb-3">Live Telemetry</div>
        <p class="text-sm text-ink leading-relaxed">HEAD-based liveness sampled three times per provider per day. p50, p95, uptime, scored 40-98.</p>
      </div>
      <div class="bg-surface border border-border rounded-lg p-6">
        <div class="label-caps text-primary mb-3">Signed Receipts</div>
        <p class="text-sm text-ink leading-relaxed">Every routed call returns an Ed25519-signed receipt with on-chain settlement reference. Verifiable by anyone.</p>
      </div>
      <div class="bg-surface border border-border rounded-lg p-6">
        <div class="label-caps text-primary mb-3">Fail-Safe Paywall</div>
        <p class="text-sm text-ink leading-relaxed">Hard server-side spend caps per agent and per call. Idempotency keys protect retries from double-charging. If the upstream merchant is non-conformant, the agent isn't charged: money never moves on bad routes.</p>
      </div>
    </div>
  </section>

  <section class="max-w-7xl mx-auto px-6 mt-12 pt-8 border-t border-border">
    <div class="text-center">
      <div class="label-caps text-faint mb-4">Agent discovery surfaces</div>
      <div class="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 mono text-sm">
        <a href="/skill.md" class="text-muted hover:text-primary">/skill.md</a>
        <span class="text-faint">.</span>
        <a href="/llms.txt" class="text-muted hover:text-primary">/llms.txt</a>
        <span class="text-faint">.</span>
        <a href="/.well-known/trustbench.json" class="text-muted hover:text-primary">/.well-known/trustbench.json</a>
        <span class="text-faint">.</span>
        <a href="/rankings?capability=search&format=json" class="text-muted hover:text-primary">/rankings.json</a>
        <span class="text-faint">.</span>
        <a href="https://github.com/lithvall/TrustBench" target="_blank" rel="noopener noreferrer" class="text-muted hover:text-primary">github.com/lithvall/TrustBench</a>
      </div>
    </div>
  </section>

  <section class="bg-soft-green border-y border-border mt-16">
    <div class="max-w-5xl mx-auto px-6 py-10 text-center">
      <p class="text-xl text-primary-dark font-medium leading-relaxed">
        Pay-to-list (refundable bond), never pay-to-rank. Routing decisions are measurement-based.
      </p>
    </div>
  </section>
</main>

${renderFooter()}
</body>
</html>`;
}
