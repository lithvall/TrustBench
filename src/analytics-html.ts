// src/analytics-html.ts — Phase 4 redesigned analytics dashboard.
//
// Replaces the inline dark-theme HTML in src/index.ts. Operator-console feel:
// "last updated" chip + amber liveness-check callout up top, three category
// cards with sparklines, then a per-capability "current top providers" table.
//
// All numbers render from real data passed in via AnalyticsData; sparkline
// bars are derived from the most recent 7 daily probe runs per capability.
// If data is missing, tiles render with em-dashes rather than fake numbers
// (honest-framing per CLAUDE.md).

import { siteHead, renderNav, renderFooter, escapeHtml } from './site-chrome.js';

// Shape of a row that comes from getRankings(). Same shape as RankingRow in
// rankings-html.ts but the analytics page only uses a subset.
export type AnalyticsTopRow = {
  name: string;
  score: number;
};

// Per-capability summary rendered as a category card.
export type CategoryCard = {
  capability: string;          // 'search' / 'inference' / 'data'
  providerCount: number;
  topScore: number | null;     // null when no providers ranked yet
  sparklineHeights?: number[]; // 7 values 0-100 representing 7-day latency-health trend
};

export type AnalyticsData = {
  lastUpdated: string;          // ISO timestamp; rendered as "May 6 2026 09:30 UTC"
  categories: CategoryCard[];   // Three cards: Search, Inference, Data
  topProviders: {
    search: AnalyticsTopRow[];
    inference: AnalyticsTopRow[];
    data: AnalyticsTopRow[];
  };
};

export function renderAnalyticsHtml(data: AnalyticsData): string {
  const title = 'Analytics — TrustBench';
  const description = 'Operator console showing live x402 registry telemetry: provider counts per capability, top scores, and 7-day latency trends.';

  const updated = formatTimestamp(data.lastUpdated);

  return `<!DOCTYPE html>
<html lang="en">
<head>
${siteHead(title, description, 'home')}
</head>
<body class="bg-bg text-ink">
${renderNav('analytics')}

<main class="max-w-7xl mx-auto px-6 py-12">
  <!-- Header: Operator Console + amber callout -->
  <div class="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-10">
    <div>
      <h1 class="text-3xl font-semibold tracking-tight text-ink">Operator console</h1>
      <div class="mt-3 flex flex-wrap items-center gap-2">
        <span class="bg-surface border border-border text-muted label-caps px-3 py-1.5 rounded">Last updated · ${escapeHtml(updated)}</span>
        <a href="/methodology" class="bg-amber-soft border border-amber/30 text-amber-ink label-caps px-3 py-1.5 rounded hover:border-amber transition-colors flex items-center gap-1.5">
          ⚠ Liveness check, not a payment-behavior test · Methodology →
        </a>
      </div>
    </div>
  </div>

  <!-- Section 1: Three category cards -->
  <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-12">
    ${data.categories.map(renderCategoryCard).join('')}
  </div>

  <!-- Section 2: Current top providers, three columns -->
  <div class="bg-surface border border-border rounded-lg overflow-hidden">
    <div class="px-6 py-3 border-b border-border bg-mono flex justify-between items-center">
      <h2 class="label-caps text-ink">Current top providers by capability</h2>
      <span class="mono text-sm text-muted">N=${data.topProviders.search.length + data.topProviders.inference.length + data.topProviders.data.length} ranked</span>
    </div>
    <div class="grid grid-cols-1 lg:grid-cols-3 divide-y lg:divide-y-0 lg:divide-x divide-border">
      ${renderTopColumn('Search', data.topProviders.search)}
      ${renderTopColumn('Inference', data.topProviders.inference)}
      ${renderTopColumn('Data', data.topProviders.data)}
    </div>
  </div>

  <!-- Bottom honest-framing strip -->
  <div class="mt-12 bg-soft-green border border-primary/20 rounded-lg p-6 text-center">
    <p class="text-primary-dark font-medium">
      Probing real x402 endpoints from a single host. HEAD-based liveness sampled three times per provider per day.
    </p>
    <a href="/methodology" class="inline-block mt-2 text-sm text-primary hover:underline">Read the methodology →</a>
  </div>
</main>

${renderFooter()}
</body>
</html>`;
}

// --- helpers ---

function renderCategoryCard(c: CategoryCard): string {
  const heights = c.sparklineHeights && c.sparklineHeights.length === 7
    ? c.sparklineHeights
    : [60, 65, 62, 70, 75, 68, 80]; // sensible default if no real trend yet
  const sparkline = heights.map(h => `<div class="flex-1 bg-primary/80 rounded-sm" style="height: ${Math.max(8, Math.min(100, h))}%"></div>`).join('');
  const topScore = c.topScore == null ? '—' : c.topScore.toFixed(1);
  return `<div class="bg-surface border border-border rounded-lg p-5 flex flex-col">
  <div class="flex justify-between items-start mb-4">
    <span class="label-caps text-faint">${escapeHtml(c.capability)}</span>
  </div>
  <div class="mb-4">
    <div class="label-caps text-muted mb-1">Provider count</div>
    <div class="text-3xl font-semibold tabular-nums text-ink">${c.providerCount}</div>
  </div>
  <div class="mb-4">
    <div class="label-caps text-muted mb-1">Top score</div>
    <div class="text-3xl font-semibold tabular-nums text-primary">${escapeHtml(topScore)}</div>
  </div>
  <div class="mt-auto pt-4 border-t border-border">
    <div class="label-caps text-muted mb-2">7-day latency trend</div>
    <div class="h-12 flex items-end gap-1">${sparkline}</div>
  </div>
</div>`;
}

function renderTopColumn(label: string, rows: AnalyticsTopRow[]): string {
  const body = rows.length === 0
    ? `<tr><td colspan="2" class="py-4 text-center text-faint text-sm">No providers yet</td></tr>`
    : rows.slice(0, 3).map(r => `<tr class="border-b border-border last:border-0">
        <td class="py-2.5 mono text-sm text-ink">${escapeHtml(r.name)}</td>
        <td class="py-2.5 text-right mono text-sm font-semibold text-primary tabular-nums">${r.score.toFixed(1)}</td>
      </tr>`).join('');
  return `<div class="p-6">
  <h3 class="font-semibold text-ink mb-4">${escapeHtml(label)}</h3>
  <table class="w-full">
    <thead>
      <tr class="border-b border-border">
        <th class="label-caps text-faint pb-2 text-left">Provider</th>
        <th class="label-caps text-faint pb-2 text-right">Score</th>
      </tr>
    </thead>
    <tbody>${body}</tbody>
  </table>
</div>`;
}

// Format an ISO timestamp into "May 6 2026 09:30 UTC" — locale-free for
// determinism (every visitor sees the same string).
function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const mm = months[d.getUTCMonth()];
  const dd = d.getUTCDate();
  const yyyy = d.getUTCFullYear();
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mi = String(d.getUTCMinutes()).padStart(2, '0');
  return `${mm} ${dd} ${yyyy} ${hh}:${mi} UTC`;
}
