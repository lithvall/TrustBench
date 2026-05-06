// src/rankings-html.ts — P4-2 second delivery: polished HTML for /rankings.
//
// Companion to the JSON path in src/index.ts /rankings. When the request's
// Accept header prefers text/html (browsers, link unfurlers), this module
// produces a self-contained page with:
//   - Capability tabs (search / inference / data / media / infra) — server-
//     side links that re-fetch with ?capability=X. Bookmarkable, shareable.
//   - Filter pills (All / Verified x402 / Coinbase 1P / Coinbase 3P) —
//     client-side toggle, hides non-matching rows in-page.
//   - Search input — client-side substring filter on provider name + URL.
//   - Sortable-by-default table (score desc), columns: rank, provider, score,
//     latency p50/p95, uptime 7d, verified badges, last updated.
//
// Same dark-theme aesthetic as /methodology and /receipts. Single-file Hono
// pattern: HTML + inline CSS + ~30 lines of vanilla JS for the filter UX.
// No SPA, no build step.
//
// JSON contract is unchanged; this module is consumer-side rendering only.

import type { Capability } from './provider-selection.js';

// Shape of a row returned by getRankings() in src/scorer.ts. Duck-typed here
// because scorer.ts doesn't export a formal type. If scorer's shape drifts,
// adjust here — TypeScript will surface it as a property-access error in the
// renderer.
export type RankingRow = {
  provider_id: string;          // URL (used as both key and display)
  capability: string;
  name: string;
  score: number;
  latency_p50: number;
  latency_p95: number;
  uptime_7d: number;
  last_updated: string;
  x402_verified: boolean;
  integration_type: '1P' | '3P' | null;
};

// All routable capabilities, in the order shown on the tab strip. Mirrors
// ROUTABLE_CAPABILITIES in provider-selection.ts (5-cat alignment with
// Coinbase Agentic Market, P4-1c). Adding a capability there should add it
// here too.
const CAPABILITY_TABS: ReadonlyArray<{ key: Capability; label: string }> = [
  { key: 'search', label: 'Search' },
  { key: 'inference', label: 'Inference' },
  { key: 'data', label: 'Data' },
  { key: 'media', label: 'Media' },
  { key: 'infra', label: 'Infra' },
];

// ---------------------------------------------------------------------------
// Public renderer
// ---------------------------------------------------------------------------

export function renderRankingsHtml(rankings: RankingRow[], capability: string): string {
  const safeCapability = String(capability || 'search').toLowerCase();
  const verifiedCount = rankings.filter(r => r.x402_verified).length;
  const oneP = rankings.filter(r => r.integration_type === '1P').length;
  const threeP = rankings.filter(r => r.integration_type === '3P').length;

  const desc = `${rankings.length} ${escapeHtml(safeCapability)} provider${rankings.length === 1 ? '' : 's'} on TrustBench, ranked by liveness telemetry. ${verifiedCount} x402-verified.`;

  const tabsHtml = renderCapabilityTabs(safeCapability);
  const pillsHtml = renderFilterPills(rankings.length, verifiedCount, oneP, threeP);
  const tableHtml = renderTable(rankings);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(capitalize(safeCapability))} rankings · TrustBench</title>
  <meta name="description" content="${escapeHtml(desc)}">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta property="og:type" content="website">
  <meta property="og:title" content="TrustBench ${escapeHtml(capitalize(safeCapability))} Rankings">
  <meta property="og:description" content="${escapeHtml(desc)}">
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="TrustBench ${escapeHtml(capitalize(safeCapability))} Rankings">
  <meta name="twitter:description" content="${escapeHtml(desc)}">
  <style>
    :root { color-scheme: dark; }
    body {
      font-family: system-ui, -apple-system, sans-serif;
      max-width: 1080px;
      margin: 40px auto;
      padding: 0 20px 80px;
      background: #0f0f0f;
      color: #ddd;
      line-height: 1.55;
    }
    a { color: #22c55e; text-decoration: none; }
    a:hover { text-decoration: underline; }
    code {
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      background: #1f1f1f; color: #fff;
      border-radius: 4px; padding: 2px 6px; font-size: 0.92em;
      word-break: break-all;
    }
    .crumb { color: #888; font-size: 0.9em; margin-bottom: 8px; }
    .crumb a { color: #888; }
    h1 { color: #22c55e; margin: 0 0 4px; font-size: 1.6em; }
    .subtitle { color: #888; font-size: 0.95em; margin: 0 0 24px; }

    /* Capability tabs */
    nav.cap-tabs {
      display: flex; flex-wrap: wrap; gap: 4px;
      margin: 16px 0 16px;
      border-bottom: 1px solid #1f1f1f;
    }
    .cap-tab {
      padding: 10px 18px; color: #888; border-radius: 6px 6px 0 0;
      border: 1px solid transparent; border-bottom: none;
      transition: background 0.1s;
    }
    .cap-tab:hover { background: #1a1a1a; color: #ddd; text-decoration: none; }
    .cap-tab.active {
      color: #22c55e; background: #052e16;
      border-color: #14532d;
      position: relative; bottom: -1px;
    }

    /* Filter row */
    .filter-row {
      display: flex; flex-wrap: wrap; gap: 10px;
      align-items: center; margin: 12px 0 20px;
    }
    .pill {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 6px 14px; border-radius: 999px; font-size: 0.9em;
      border: 1px solid #2a2a2a; background: #1a1a1a; color: #aaa;
      cursor: pointer; user-select: none;
      transition: border-color 0.1s, background 0.1s;
    }
    .pill:hover { border-color: #14532d; }
    .pill.active {
      color: #22c55e; border-color: #14532d; background: #052e16;
    }
    .pill .count { color: #666; font-size: 0.85em; }
    .pill.active .count { color: #22c55e; }
    .search-wrap { flex: 1; min-width: 200px; }
    .search-wrap input {
      width: 100%; padding: 8px 14px; border-radius: 999px;
      border: 1px solid #2a2a2a; background: #1a1a1a; color: #ddd;
      font-size: 0.95em; outline: none;
      transition: border-color 0.1s;
    }
    .search-wrap input:focus { border-color: #22c55e; }

    /* Table */
    table {
      width: 100%; border-collapse: collapse;
      margin: 8px 0;
    }
    th, td {
      padding: 12px 8px; text-align: left;
      border-bottom: 1px solid #1f1f1f;
      font-size: 0.93em; vertical-align: middle;
    }
    th {
      color: #888; font-weight: normal; text-transform: uppercase;
      letter-spacing: 0.05em; font-size: 0.78em;
    }
    tbody tr { transition: background 0.05s; }
    tbody tr:hover { background: #141414; }
    td.rank { color: #666; font-variant-numeric: tabular-nums; width: 40px; }
    td.provider { min-width: 220px; }
    td.provider .name { color: #ddd; font-weight: 500; }
    td.provider .url { color: #666; font-size: 0.82em; word-break: break-all; }
    td.score-cell {
      font-variant-numeric: tabular-nums; font-weight: 600;
      width: 70px;
    }
    td.score-cell.high { color: #22c55e; }
    td.score-cell.med { color: #fbbf24; }
    td.score-cell.low { color: #999; }
    td.num { font-variant-numeric: tabular-nums; color: #aaa; width: 80px; }
    td.badges { width: 140px; }
    .badge-mini {
      display: inline-block; font-size: 0.72em;
      padding: 2px 8px; border-radius: 999px;
      border: 1px solid #2a2a2a; margin-right: 4px;
      vertical-align: middle;
    }
    .badge-mini.green { color: #22c55e; border-color: #14532d; background: #052e16; }
    .badge-mini.blue { color: #93c5fd; border-color: #1e3a8a; background: #0a1733; }
    .badge-mini.muted { color: #888; }
    td.updated { color: #666; font-size: 0.85em; width: 130px; }

    .empty {
      padding: 60px 20px; text-align: center;
      color: #888; font-size: 0.95em;
      background: #141414; border-radius: 8px;
      margin: 20px 0;
    }
    .meta-footer {
      display: flex; justify-content: space-between;
      flex-wrap: wrap; gap: 12px;
      margin-top: 12px; color: #666; font-size: 0.85em;
    }
    footer.page-foot {
      margin-top: 50px; padding-top: 20px;
      border-top: 1px solid #1f1f1f; color: #666; font-size: 0.85em;
    }
    footer.page-foot a { color: #888; margin-right: 14px; }

    @media (max-width: 720px) {
      table, thead, tbody, th, td, tr { display: block; }
      thead { display: none; }
      tr { border-bottom: 1px solid #1f1f1f; padding: 10px 0; }
      td { border-bottom: none; padding: 4px 0; }
      td:before { content: attr(data-label); color: #666; display: inline-block; width: 110px; font-size: 0.8em; text-transform: uppercase; }
    }
  </style>
</head>
<body>
  <div class="crumb"><a href="/">TrustBench</a> · <a href="/methodology">Methodology</a> · Rankings</div>
  <h1>${escapeHtml(capitalize(safeCapability))} rankings</h1>
  <p class="subtitle">${escapeHtml(desc)} <a href="/methodology">How is this measured?</a></p>

  ${tabsHtml}

  ${pillsHtml}

  ${rankings.length === 0
    ? `<div class="empty">No providers registered for <code>${escapeHtml(safeCapability)}</code> yet. <a href="/methodology">Methodology</a> · <a href="?format=json">JSON</a></div>`
    : tableHtml}

  <div class="meta-footer">
    <div>
      <span id="visibleCount">${rankings.length}</span> of ${rankings.length} providers shown
    </div>
    <div>
      <a href="?capability=${encodeURIComponent(safeCapability)}&format=json">View as JSON</a>
    </div>
  </div>

  <footer class="page-foot">
    <a href="/methodology">Methodology</a>
    <a href="/.well-known/trustbench-pubkey">Public key</a>
    <a href="/health">Health</a>
    <a href="https://github.com/lithvall/TrustBench" target="_blank" rel="noopener noreferrer">GitHub</a>
  </footer>

  <script>
    // Filter + search behaviour. Pure vanilla JS, no framework. Visibility is
    // toggled by row.style.display rather than a CSS class because each row
    // has independent visibility from BOTH the active pill AND the search
    // box, and combining via classes gets fiddly. Direct style is cleanest.
    (function () {
      const rows = Array.from(document.querySelectorAll('tbody tr.row'));
      const search = document.getElementById('search');
      const pills = Array.from(document.querySelectorAll('.pill'));
      const visibleCounter = document.getElementById('visibleCount');
      let activeFilter = 'all';

      function applyFilters() {
        const q = (search && search.value || '').toLowerCase().trim();
        let visible = 0;
        rows.forEach(function (row) {
          const text = row.getAttribute('data-search') || '';
          const verified = row.getAttribute('data-x402-verified') === 'true';
          const itype = row.getAttribute('data-integration-type') || '';
          let show = true;
          if (activeFilter === 'verified' && !verified) show = false;
          if (activeFilter === '1p' && itype !== '1P') show = false;
          if (activeFilter === '3p' && itype !== '3P') show = false;
          if (q && text.indexOf(q) === -1) show = false;
          row.style.display = show ? '' : 'none';
          if (show) visible += 1;
        });
        if (visibleCounter) visibleCounter.textContent = String(visible);
      }

      if (search) search.addEventListener('input', applyFilters);
      pills.forEach(function (p) {
        p.addEventListener('click', function (e) {
          e.preventDefault();
          pills.forEach(function (pp) { pp.classList.remove('active'); });
          p.classList.add('active');
          activeFilter = p.getAttribute('data-filter') || 'all';
          applyFilters();
        });
      });
    })();
  </script>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Section renderers
// ---------------------------------------------------------------------------

function renderCapabilityTabs(activeCapability: string): string {
  const tabs = CAPABILITY_TABS.map(t => {
    const isActive = t.key === activeCapability;
    return `<a class="cap-tab${isActive ? ' active' : ''}" href="?capability=${encodeURIComponent(t.key)}">${escapeHtml(t.label)}</a>`;
  }).join('');
  return `<nav class="cap-tabs" aria-label="Capability">${tabs}</nav>`;
}

function renderFilterPills(total: number, verified: number, oneP: number, threeP: number): string {
  return `<div class="filter-row">
    <div class="pill active" data-filter="all">All <span class="count">${total}</span></div>
    <div class="pill" data-filter="verified">✅ Verified (x402) <span class="count">${verified}</span></div>
    <div class="pill" data-filter="1p">🪪 Coinbase 1P <span class="count">${oneP}</span></div>
    <div class="pill" data-filter="3p">🔗 Coinbase 3P <span class="count">${threeP}</span></div>
    <div class="search-wrap"><input id="search" type="search" placeholder="Search by name or URL…" autocomplete="off"></div>
  </div>`;
}

function renderTable(rankings: RankingRow[]): string {
  const rows = rankings.map((r, i) => renderRow(r, i + 1)).join('');
  return `<table>
    <thead>
      <tr>
        <th>#</th>
        <th>Provider</th>
        <th>Score</th>
        <th>p50 ms</th>
        <th>p95 ms</th>
        <th>Uptime 7d</th>
        <th>Verified</th>
        <th>Updated</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function renderRow(r: RankingRow, rank: number): string {
  const search = `${r.name} ${r.provider_id}`.toLowerCase();
  const itype = r.integration_type || '';
  const scoreClass = r.score >= 85 ? 'high' : (r.score >= 65 ? 'med' : 'low');

  const verifiedBadge = r.x402_verified
    ? `<span class="badge-mini green" title="TrustBench live-probe-confirmed x402 challenge">✅ x402</span>`
    : `<span class="badge-mini muted" title="Not yet probed for x402 wire compliance">—</span>`;
  const integrationBadge =
    itype === '1P'
      ? `<span class="badge-mini blue" title="Coinbase Agentic Market: 1st-party native x402 integration">1P</span>`
      : itype === '3P'
        ? `<span class="badge-mini muted" title="Coinbase Agentic Market: proxied (3rd-party) integration">3P</span>`
        : '';

  return `<tr class="row"
    data-search="${escapeHtml(search)}"
    data-x402-verified="${r.x402_verified ? 'true' : 'false'}"
    data-integration-type="${escapeHtml(itype)}">
    <td class="rank" data-label="#">${rank}</td>
    <td class="provider" data-label="Provider">
      <div class="name">${escapeHtml(r.name)}</div>
      <div class="url"><code>${escapeHtml(r.provider_id)}</code></div>
    </td>
    <td class="score-cell ${scoreClass}" data-label="Score">${escapeHtml(formatNum(r.score))}</td>
    <td class="num" data-label="p50 ms">${escapeHtml(formatNum(r.latency_p50))}</td>
    <td class="num" data-label="p95 ms">${escapeHtml(formatNum(r.latency_p95))}</td>
    <td class="num" data-label="Uptime 7d">${escapeHtml(formatNum(r.uptime_7d))}%</td>
    <td class="badges" data-label="Verified">${verifiedBadge} ${integrationBadge}</td>
    <td class="updated" data-label="Updated">${escapeHtml(formatRelativeTime(r.last_updated))}</td>
  </tr>`;
}

// ---------------------------------------------------------------------------
// Format helpers
// ---------------------------------------------------------------------------

function formatNum(n: unknown): string {
  if (typeof n === 'number' && Number.isFinite(n)) {
    // Integer when whole, otherwise 1 decimal — keeps tabular numerics tidy
    // without introducing precision drift in the display.
    if (Number.isInteger(n)) return n.toString();
    return n.toFixed(1);
  }
  return '—';
}

// Best-effort relative time. ISO timestamps from the DB; render as "2h ago"
// when recent, otherwise "May 6, 2026". Locale-free for determinism — every
// visitor sees the same text.
function formatRelativeTime(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso;
  const ageMs = Date.now() - t;
  const min = 60_000, hr = 3_600_000, day = 86_400_000;
  if (ageMs < min) return 'just now';
  if (ageMs < hr) return `${Math.floor(ageMs / min)}m ago`;
  if (ageMs < day) return `${Math.floor(ageMs / hr)}h ago`;
  if (ageMs < 7 * day) return `${Math.floor(ageMs / day)}d ago`;
  // Older than a week — show absolute date.
  const d = new Date(t);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Defense-in-depth HTML escape. Provider names + URLs come from registry data
// (controlled by the crawler), but defensive escaping is cheap.
function escapeHtml(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
