// src/methodology-html.ts — Phase 4 redesigned methodology page.
//
// Replaces the inline dark-theme HTML that previously lived in src/index.ts.
// New layout: single-column 720px doc + sticky right-side TOC, light theme,
// h2s with green-bottom-border accents, code blocks with green left-border.
// Same content as the old page but reformatted for the new design system.
//
// Honest-framing constraints applied (per CLAUDE.md):
//   - No "benchmark", "ranking authority", etc.
//   - Probe behavior described accurately (HEAD/8s/GET-fallback/3-samples).
//   - Real scoring formula from prober.ts (15 + 45·success + 35·latency + 3·consistency, clamped [40,98]).
//   - "What this measurement does NOT tell you" callout in amber, mandatory
//     reading before anyone tries to interpret the data.
//
// The roadmap section reflects current strategy (Phase 0–5 with real dates
// from CLAUDE.md). Update when phases close out.

import { siteHead, renderNav, renderFooter, escapeHtml } from './site-chrome.js';

export function renderMethodologyHtml(): string {
  const title = 'Methodology — TrustBench';
  const description = 'How TrustBench probes x402 endpoints, computes liveness scores, and signs scorecards. HEAD-based liveness from a single host, three samples per day, scored 40-98.';

  return `<!DOCTYPE html>
<html lang="en">
<head>
${siteHead(title, description)}
</head>
<body class="bg-bg text-ink">
${renderNav('methodology')}

<main class="max-w-7xl mx-auto px-6 py-12">
  <div class="lg:grid lg:grid-cols-12 lg:gap-12">
    <!-- Main doc column -->
    <article class="lg:col-span-9 max-w-[720px]">
      <div class="label-caps text-faint mb-2">Documentation</div>
      <h1 class="text-4xl font-semibold tracking-tight text-ink mb-4">Methodology</h1>
      <p class="text-lg text-muted leading-relaxed">
        TrustBench is a public registry of x402-style endpoints with nightly liveness telemetry and
        Ed25519-signed scorecards. This page documents exactly how data is collected, how scores are
        computed, and what each metric represents — so anyone integrating against the registry knows
        what they're working with.
      </p>

      <!-- Section: Data collection -->
      <section id="data-collection" class="mt-12">
        <h2 class="text-2xl font-semibold tracking-tight text-ink pb-3 border-b-2 border-primary inline-block mb-6">Data collection</h2>
        <ul class="space-y-3 text-ink">
          <li class="flex gap-3"><span class="text-primary mt-1">▸</span><span>A scheduled job runs once per day on a single cloud host.</span></li>
          <li class="flex gap-3"><span class="text-primary mt-1">▸</span><span>For each provider URL, the prober sends <strong>three sequential requests</strong> per run, sampled across <span class="mono text-sm bg-mono px-1.5 py-0.5 rounded">us-east / eu-west / asia-southeast</span> tags. Single host today; multi-host is on the roadmap.</span></li>
          <li class="flex gap-3"><span class="text-primary mt-1">▸</span><span>Each request is <span class="mono text-sm bg-mono px-1.5 py-0.5 rounded">HEAD</span> with an 8-second timeout, falling back to <span class="mono text-sm bg-mono px-1.5 py-0.5 rounded">GET</span> if the server returns 405.</span></li>
          <li class="flex gap-3"><span class="text-primary mt-1">▸</span><span>HTTP status codes <span class="mono text-sm">200, 201, 204, 401, 402, 403, 404, 405, 429</span> are recorded as "endpoint is alive". Other statuses, connection errors, and timeouts are recorded as failures.</span></li>
        </ul>
      </section>

      <!-- Section: Scoring -->
      <section id="scoring" class="mt-12">
        <h2 class="text-2xl font-semibold tracking-tight text-ink pb-3 border-b-2 border-primary inline-block mb-6">Scoring</h2>
        <div class="bg-mono border border-border border-l-4 border-l-primary rounded p-5 mono text-sm leading-relaxed overflow-x-auto">
<pre class="text-ink">score = 15
      + 45 · successRate
      + 35 · latencyHealth        // max(0, min(1, 1 - p50 / 2000))
      +  3 · consistencyBonus     // max(0, min(1, 1 - jitter))
clamped to [40, 98]</pre>
        </div>
        <p class="mt-4 text-muted leading-relaxed">
          <span class="mono text-sm text-ink">p50</span> and <span class="mono text-sm text-ink">p95</span>
          latency are computed over successful probes only, using linear-interpolation percentiles.
          Timeouts contribute to reliability but are excluded from the latency calculation, so a single
          failure does not distort the latency number.
        </p>
      </section>

      <!-- Section: What this measurement does NOT tell you (amber callout, mandatory) -->
      <section id="metrics" class="mt-12">
        <h2 class="text-2xl font-semibold tracking-tight text-ink pb-3 border-b-2 border-primary inline-block mb-6">What this measurement does NOT tell you</h2>
        <div class="bg-amber-soft border-l-4 border-amber rounded p-5">
          <ul class="space-y-3 text-amber-ink leading-relaxed">
            <li class="flex gap-2"><span>•</span><span><strong>Score reflects reachability and response time, not capability quality.</strong> A 4xx or 429 response confirms the endpoint is up and responding, but does not confirm the underlying API behaves correctly when authenticated and paid.</span></li>
            <li class="flex gap-2"><span>•</span><span><strong>Latency is single-origin.</strong> All measurements come from one host today. Real-world latency from an agent's location will differ.</span></li>
            <li class="flex gap-2"><span>•</span><span><strong>Payment behavior is not yet measured.</strong> The current probe does NOT execute x402 payments, observe settlement latency, or validate payment-gated responses. A capability-aware paid-probe layer ships alongside the router.</span></li>
            <li class="flex gap-2"><span>•</span><span><strong>Scorecards are signed with Ed25519.</strong> The public key is served at <a href="/.well-known/trustbench-pubkey" class="underline hover:text-primary">/.well-known/trustbench-pubkey</a> for any third party to verify a TrustBench scorecard independently.</span></li>
          </ul>
        </div>
      </section>

      <!-- Section: Verifying -->
      <section id="verifying" class="mt-12">
        <h2 class="text-2xl font-semibold tracking-tight text-ink pb-3 border-b-2 border-primary inline-block mb-6">Verifying a scorecard or receipt</h2>
        <p class="text-muted leading-relaxed mb-4">
          Every scorecard returned by <span class="mono text-sm text-ink">/rankings/paid</span> and every
          receipt at <span class="mono text-sm text-ink">/receipts/:id</span> carries an Ed25519 signature
          you can verify offline using the published public key.
        </p>
        <div class="space-y-2">
          <div class="bg-mono border border-border rounded p-3 mono text-sm">npm run verify-scorecard</div>
          <div class="bg-mono border border-border rounded p-3 mono text-sm">npm run verify-receipt -- &lt;receipt_id&gt;</div>
          <div class="bg-mono border border-border rounded p-3 mono text-sm">npm run verify-receipt -- &lt;receipt_id&gt; --check-chain</div>
        </div>
        <p class="mt-4">
          <a href="https://github.com/lithvall/TrustBench/blob/main/scripts/verify-scorecard.js" target="_blank" rel="noopener noreferrer" class="text-primary hover:underline font-medium">Reference verifier in scripts/verify-scorecard.js →</a>
        </p>
      </section>

      <!-- Section: Roadmap -->
      <section id="roadmap" class="mt-12">
        <h2 class="text-2xl font-semibold tracking-tight text-ink pb-3 border-b-2 border-primary inline-block mb-6">Roadmap</h2>
        <div class="space-y-3">
          ${roadmapRow('Phase 0', 'done', 'Honest framing', 'Public registry positioning + measurement-honest copy')}
          ${roadmapRow('Phase 1', 'done', 'Ed25519 scorecard signing', 'Ed25519 keys generated, public key published, reference verifier shipped')}
          ${roadmapRow('Phase 2', 'done', 'Builder validation', 'Three real conversations + written expressions of interest (closed 2026-04-30)')}
          ${roadmapRow('Phase 3', 'done', 'Non-custodial router', 'Idempotency, hard spend caps, signed receipts, /receipts/:id audit (closed 2026-05-04)')}
          ${roadmapRow('Phase 4', 'current', 'Policy firewall, paid-probe, agent-discovery surfaces', 'In progress: reservation caps, /skill.md, /llms.txt, /.well-known')}
          ${roadmapRow('Phase 5', 'future', 'p402 / Canton expansion', 'Multi-protocol settlement (after x402 path is stable)')}
        </div>
      </section>

      <!-- Phase 3 callout -->
      <section class="mt-12 bg-soft-green border border-primary/30 rounded-lg p-6 flex items-center justify-between gap-4">
        <div>
          <h3 class="text-lg font-semibold text-primary-dark">Phase 3 router shipped 2026-05-04</h3>
          <p class="text-sm text-primary-dark/80 mt-1">First paid x402 receipt: <span class="mono">rcpt_01KQY7C44GAPSXZPFQYRZ1D10C</span> — verifiable on-chain.</p>
        </div>
        <a href="/receipts/rcpt_01KQY7C44GAPSXZPFQYRZ1D10C" class="bg-primary hover:bg-primary-dark text-white px-4 py-2 rounded font-medium text-sm whitespace-nowrap">View receipt →</a>
      </section>
    </article>

    <!-- Sticky TOC sidebar -->
    <aside class="hidden lg:block lg:col-span-3">
      <nav class="sticky top-24 border-l border-border pl-4 flex flex-col gap-2">
        <span class="label-caps text-faint mb-1">On this page</span>
        <a href="#data-collection" class="text-sm text-muted hover:text-primary">Data collection</a>
        <a href="#scoring" class="text-sm text-muted hover:text-primary">Scoring</a>
        <a href="#metrics" class="text-sm text-muted hover:text-primary">What this does NOT tell you</a>
        <a href="#verifying" class="text-sm text-muted hover:text-primary">Verifying a scorecard</a>
        <a href="#roadmap" class="text-sm text-muted hover:text-primary">Roadmap</a>
      </nav>
    </aside>
  </div>
</main>

${renderFooter()}
</body>
</html>`;
}

// Helper: render a roadmap row. Status drives the pill colour.
//   - done    → green soft fill, primary-dark text
//   - current → amber, "in progress" feel
//   - future  → faint grey
function roadmapRow(phase: string, status: 'done' | 'current' | 'future', title: string, sub: string): string {
  const pill =
    status === 'done'
      ? 'bg-soft-green text-primary-dark border border-primary/20'
      : status === 'current'
        ? 'bg-amber-soft text-amber-ink border border-amber/20'
        : 'bg-mono text-faint border border-border';
  const statusLabel = status === 'done' ? 'DONE' : status === 'current' ? 'CURRENT' : 'FUTURE';
  return `<div class="flex gap-4 items-start">
  <span class="${pill} rounded label-caps px-2.5 py-1 whitespace-nowrap">${escapeHtml(phase)} · ${statusLabel}</span>
  <div class="flex-1">
    <div class="font-medium text-ink">${escapeHtml(title)}</div>
    <div class="text-sm text-muted mt-0.5">${escapeHtml(sub)}</div>
  </div>
</div>`;
}
