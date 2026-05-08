// src/rankings-html.ts — Phase 4 redesign (light theme + left sidebar).
//
// Companion to the JSON path in src/index.ts /rankings. When the request's
// Accept header prefers text/html (browsers, link unfurlers), this module
// produces a self-contained page with:
//   - Top nav + footer (shared chrome).
//   - Left sidebar: capability list (Search/Inference/Data/Media/Infra),
//     Verification filter pills (All / ✅ Verified x402 / 🪪 Coinbase 1P /
//     🔗 Coinbase 3P), and a search input.
//   - Main: hero (capability h1 + sub), summary bar, sortable table, footer.
//
// JSON contract is unchanged; this is consumer-side rendering only. The
// existing callers (paid-probe, /rankings/paid, MCP tools) all hit the JSON
// path and don't see this module.

import { siteHead, renderNav, renderFooter, escapeHtml } from './site-chrome.js';
import type { Capability } from './provider-selection.js';

// Shape of a row returned by getRankings() in src/scorer.ts. Duck-typed here
// because scorer.ts doesn't export a formal type.
export type RankingRow = {
  provider_id: string;          // URL — used as both key and display
  capability: string;
  name: string;
  network?: 'base' | 'solana'; // Phase 4b (2026-05-08): added to surface non-Base inventory
  score: number;
  latency_p50: number;
  latency_p95: number;
  uptime_7d: number;
  last_updated: string;
  x402_verified: boolean;
  integration_type: '1P' | '3P' | null;
};

// All routable capabilities, in the order shown on the sidebar. Mirrors
// ROUTABLE_CAPABILITIES in provider-selection.ts (5-cat alignment with
// Coinbase Agentic Market). Add a capability there → add it here too.
const CAPABILITY_TABS: ReadonlyArray<{ key: Capability; label: string; icon: string }> = [
  { key: 'search',    label: 'Search',    icon: '🔍' },
  { key: 'inference', label: 'Inference', icon: '⚡' },
  { key: 'data',      label: 'Data',      icon: '🗄️' },
  { key: 'media',     label: 'Media',     icon: '🎬' },
  { key: 'infra',     label: 'Infra',     icon: '⚙️' },
];

// ---------------------------------------------------------------------------
// Public renderer
// ---------------------------------------------------------------------------

export function renderRankingsHtml(rankings: RankingRow[], capability: string): string {
  const safeCapability = String(capability || 'search').toLowerCase();
  const verifiedCount = rankings.filter(r => r.x402_verified).length;
  const oneP = rankings.filter(r => r.integration_type === '1P').length;
  const threeP = rankings.filter(r => r.integration_type === '3P').length;

  const desc = `${rankings.length} ${escapeHtml(safeCapability)} provider${rankings.length === 1 ? '' : 's'} on TrustBench, ranked by liveness telemetry.`;
  const title = `${capitalize(safeCapability)} rankings · TrustBench`;

  // Last-probe relative time — pick the most recent last_updated across rows.
  const lastProbe = rankings.length > 0
    ? formatRelativeTime(rankings.reduce((acc, r) => r.last_updated > acc ? r.last_updated : acc, rankings[0].last_updated))
    : '—';

  return `<!DOCTYPE html>
<html lang="en">
<head>
${siteHead(title, desc)}
</head>
<body class="bg-bg text-ink">
${renderNav('rankings')}

<main class="max-w-7xl mx-auto px-6 py-10">
  <div class="grid grid-cols-1 lg:grid-cols-12 gap-8">
    <!-- Sidebar -->
    <aside class="lg:col-span-3">
      <div class="lg:sticky lg:top-24 space-y-6">
        <!-- Search input -->
        <div class="relative">
          <input id="search" type="search" placeholder="Search by name or URL…" autocomplete="off"
                 class="w-full bg-surface border border-border rounded px-3 py-2 text-sm focus:border-primary focus:outline-none transition-colors">
        </div>

        <!-- Capability list -->
        <section>
          <h3 class="label-caps text-faint mb-3">Capability</h3>
          <div class="space-y-1">
            ${CAPABILITY_TABS.map(t => renderCapabilityLink(t, safeCapability)).join('')}
          </div>
        </section>

        <!-- Verification filter pills -->
        <section>
          <h3 class="label-caps text-faint mb-3">Verification</h3>
          <div class="space-y-1">
            ${pill('all',      'All',                rankings.length, true)}
            ${pill('verified', '✅ Verified (x402)', verifiedCount,   false)}
            ${pill('1p',       '🪪 Coinbase 1P',     oneP,            false)}
            ${pill('3p',       '🔗 Coinbase 3P',     threeP,          false)}
          </div>
        </section>
      </div>
    </aside>

    <!-- Main -->
    <div class="lg:col-span-9">
      <!-- Hero -->
      <div class="mb-6">
        <div class="label-caps text-faint mb-2">Capability rankings</div>
        <h1 class="text-3xl font-semibold tracking-tight text-ink">${escapeHtml(capitalize(safeCapability))} rankings</h1>
        <p class="text-muted mt-2">${escapeHtml(desc)} <a href="/methodology" class="text-primary hover:underline">How is this measured?</a></p>
      </div>

      <!-- Summary bar -->
      <div class="bg-surface border border-border rounded-lg grid grid-cols-2 md:grid-cols-4 divide-x divide-border mb-6">
        ${stat('Providers',      String(rankings.length))}
        ${stat('Verified (x402)', String(verifiedCount))}
        ${stat('Coinbase 1P',     String(oneP))}
        ${stat('Last probe',      lastProbe, true)}
      </div>

      <!-- Table -->
      ${rankings.length === 0
        ? `<div class="bg-surface border border-border rounded-lg py-16 text-center text-muted">
             No providers registered for <code class="mono bg-mono px-1.5 py-0.5 rounded">${escapeHtml(safeCapability)}</code> yet.
             <div class="mt-2 text-sm"><a href="/methodology" class="text-primary hover:underline">Methodology</a> · <a href="?capability=${encodeURIComponent(safeCapability)}&format=json" class="text-primary hover:underline">JSON</a></div>
           </div>`
        : renderTable(rankings)}

      <!-- Footer of section -->
      <div class="mt-4 pt-4 border-t border-border flex justify-between items-center">
        <span class="label-caps text-faint"><span id="visibleCount">${rankings.length}</span> of ${rankings.length} shown · capability=${escapeHtml(safeCapability)}</span>
        <a href="?capability=${encodeURIComponent(safeCapability)}&format=json" class="text-sm text-primary hover:underline">View as JSON →</a>
      </div>
    </div>
  </div>
</main>

${renderFooter()}

<script>
// Sidebar filter + search behaviour. Pure vanilla JS, no framework.
// Visibility is toggled via row.style.display because each row depends on
// BOTH the active pill AND the search box; combining via CSS classes gets
// fiddly.
(function () {
  var rows = Array.from(document.querySelectorAll('tbody tr.row'));
  var search = document.getElementById('search');
  var pills = Array.from(document.querySelectorAll('.pill'));
  var counter = document.getElementById('visibleCount');
  var activeFilter = 'all';

  function applyFilters() {
    var q = (search && search.value || '').toLowerCase().trim();
    var visible = 0;
    rows.forEach(function (row) {
      var text = row.getAttribute('data-search') || '';
      var verified = row.getAttribute('data-x402-verified') === 'true';
      var itype = row.getAttribute('data-integration-type') || '';
      var show = true;
      if (activeFilter === 'verified' && !verified) show = false;
      if (activeFilter === '1p' && itype !== '1P') show = false;
      if (activeFilter === '3p' && itype !== '3P') show = false;
      if (q && text.indexOf(q) === -1) show = false;
      row.style.display = show ? '' : 'none';
      if (show) visible += 1;
    });
    if (counter) counter.textContent = String(visible);
  }

  if (search) search.addEventListener('input', applyFilters);
  pills.forEach(function (p) {
    p.addEventListener('click', function (e) {
      e.preventDefault();
      pills.forEach(function (pp) { pp.classList.remove('pill-active'); });
      p.classList.add('pill-active');
      activeFilter = p.getAttribute('data-filter') || 'all';
      applyFilters();
    });
  });
})();
</script>
<style>
  .pill { display: flex; align-items: center; justify-content: space-between; padding: 6px 10px; border-radius: 6px; cursor: pointer; transition: background-color 0.1s; color: #5C6963; font-size: 14px; }
  .pill:hover { background: #F4F6F4; }
  .pill-active { background: #E8F3EC; color: #0F4D24; font-weight: 500; }
  .pill .count { font-family: 'JetBrains Mono', monospace; font-size: 11px; color: #8A938E; padding: 1px 6px; background: #F4F6F4; border-radius: 999px; }
  .pill-active .count { background: #FFFFFF; color: #1F7A3A; }
  .cap-link { display: flex; align-items: center; gap: 8px; padding: 6px 10px; border-radius: 6px; color: #5C6963; font-size: 14px; transition: background-color 0.1s, color 0.1s; }
  .cap-link:hover { background: #F4F6F4; color: #0F1A14; }
  .cap-link.cap-active { background: #E8F3EC; color: #0F4D24; font-weight: 500; }
</style>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Renderers
// ---------------------------------------------------------------------------

function renderCapabilityLink(t: { key: string; label: string; icon: string }, active: string): string {
  const isActive = t.key === active;
  return `<a href="?capability=${encodeURIComponent(t.key)}" class="cap-link${isActive ? ' cap-active' : ''}">
    <span>${t.icon}</span>
    <span>${escapeHtml(t.label)}</span>
  </a>`;
}

function pill(filter: string, label: string, count: number, active: boolean): string {
  return `<div class="pill${active ? ' pill-active' : ''}" data-filter="${filter}">
    <span>${label}</span>
    <span class="count">${count}</span>
  </div>`;
}

function stat(label: string, value: string, accent = false): string {
  const valueClass = accent ? 'text-primary' : 'text-ink';
  return `<div class="px-5 py-4">
    <div class="label-caps text-faint mb-1">${escapeHtml(label)}</div>
    <div class="mono text-base font-semibold ${valueClass} tabular-nums">${escapeHtml(value)}</div>
  </div>`;
}

function renderTable(rankings: RankingRow[]): string {
  const rows = rankings.map((r, i) => renderRow(r, i + 1)).join('');
  return `<div class="bg-surface border border-border rounded-lg overflow-hidden">
    <div class="overflow-x-auto">
      <table class="w-full">
        <thead>
          <tr class="border-b border-border bg-mono">
            <th class="label-caps text-faint py-3 px-4 text-left">#</th>
            <th class="label-caps text-faint py-3 px-4 text-left">Provider</th>
            <th class="label-caps text-faint py-3 px-4 text-left">Score</th>
            <th class="label-caps text-faint py-3 px-4 text-right">p50 ms</th>
            <th class="label-caps text-faint py-3 px-4 text-right">p95 ms</th>
            <th class="label-caps text-faint py-3 px-4 text-right">Uptime 7d</th>
            <th class="label-caps text-faint py-3 px-4 text-center">Verified</th>
            <th class="label-caps text-faint py-3 px-4 text-right">Updated</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  </div>`;
}

function renderRow(r: RankingRow, rank: number): string {
  const search = `${r.name} ${r.provider_id}`.toLowerCase();
  const itype = r.integration_type || '';
  // Score colour: ≥85 brand-green, 65-84 amber, <65 grey
  const scoreColor = r.score >= 85 ? 'text-primary' : r.score >= 65 ? 'text-amber' : 'text-faint';
  const uptimeColor = r.uptime_7d >= 99 ? 'text-primary' : r.uptime_7d >= 97 ? 'text-amber' : 'text-red-ink';

  const verifiedBadge = r.x402_verified
    ? `<span class="text-sm" title="TrustBench live-probe-confirmed x402 challenge">✅ x402</span>`
    : `<span class="text-faint">—</span>`;
  const integrationBadge =
    itype === '1P'
      ? `<span class="text-sm ml-1" title="Coinbase Agentic Market: 1st-party native">🪪 1P</span>`
      : itype === '3P'
        ? `<span class="text-sm ml-1" title="Coinbase Agentic Market: proxied (3rd-party)">🔗 3P</span>`
        : '';

  // Phase 4b (2026-05-08): Solana visibility unblock. Solana inventory is
  // surfaced in /rankings but not routable until P4-3 ships settlement.
  // The badge tells consumers explicitly so they don't try to /route to it.
  const networkBadge =
    r.network === 'solana'
      ? `<span class="ml-2 inline-block px-1.5 py-0.5 rounded bg-amber-soft text-amber-ink text-[10px] font-semibold uppercase tracking-wide" title="Solana inventory — registered but not routable until P4-3 (Solana settlement) ships. Routing today is Base only.">Solana · registry only</span>`
      : '';

  return `<tr class="row border-b border-border last:border-0 hover:bg-mono/40 transition-colors"
    data-search="${escapeHtml(search)}"
    data-x402-verified="${r.x402_verified ? 'true' : 'false'}"
    data-integration-type="${escapeHtml(itype)}"
    data-network="${escapeHtml(r.network || 'base')}">
    <td class="py-4 px-4 mono text-sm font-semibold text-ink">${String(rank).padStart(2, '0')}</td>
    <td class="py-4 px-4">
      <div class="font-medium text-ink">${escapeHtml(r.name)}${networkBadge}</div>
      <div class="mono text-xs text-faint break-all">${escapeHtml(r.provider_id)}</div>
    </td>
    <td class="py-4 px-4">
      <span class="mono text-base font-semibold ${scoreColor} tabular-nums">${escapeHtml(formatNum(r.score))}</span>
    </td>
    <td class="py-4 px-4 text-right mono text-sm text-muted tabular-nums">${escapeHtml(formatNum(r.latency_p50))}</td>
    <td class="py-4 px-4 text-right mono text-sm text-muted tabular-nums">${escapeHtml(formatNum(r.latency_p95))}</td>
    <td class="py-4 px-4 text-right mono text-sm font-semibold ${uptimeColor} tabular-nums">${escapeHtml(formatNum(r.uptime_7d))}%</td>
    <td class="py-4 px-4 text-center whitespace-nowrap">${verifiedBadge}${integrationBadge}</td>
    <td class="py-4 px-4 text-right text-xs text-faint">${escapeHtml(formatRelativeTime(r.last_updated))}</td>
  </tr>`;
}

// ---------------------------------------------------------------------------
// Format helpers
// ---------------------------------------------------------------------------

function formatNum(n: unknown): string {
  if (typeof n === 'number' && Number.isFinite(n)) {
    if (Number.isInteger(n)) return n.toString();
    return n.toFixed(1);
  }
  return '—';
}

function formatRelativeTime(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso;
  const ageMs = Date.now() - t;
  const min = 60_000, hr = 3_600_000, day = 86_400_000;
  if (ageMs < min) return 'just now';
  if (ageMs < hr) return `${Math.floor(ageMs / min)}m ago`;
  if (ageMs < day) return `${Math.floor(ageMs / hr)}h ago`;
  if (ageMs < 7 * day) return `${Math.floor(ageMs / day)}d ago`;
  const d = new Date(t);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}
