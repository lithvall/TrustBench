// scripts/export-7-night.ts
// =============================================================================
// 7-night rollup CSV — one row per provider, last 7 days of probe data.
// =============================================================================
//
// Committed in the Paddock 2026-05-06 DM as the join-payload for our partnership
// exchange (Paddock supplies CDP Bazaar; we supply our 7-night probe rollup).
// Output is CSV to stdout so you can pipe to a file, e.g.:
//
//   npm run export-7-night -- > rollup-2026-05-06.csv
//
// Status messages go to stderr to keep stdout clean for redirection.
//
// Columns (locked in the DM thread, 2026-05-06):
//   endpoint_url      — full path, e.g. https://host/path
//   domain            — parsed hostname, for partner side that aggregates by domain
//   network           — "base" (Phase 4 single-network); semicolon-joined if multi
//   capability        — search/inference/data/media/infra (canonical) or 'other'
//   integration_type  — "1P" / "3P" (Coinbase Agentic Market) or empty
//   x402_verified     — "true" if we have live-confirmed a 402 challenge
//   success_rate_7d   — fraction (e.g. 0.9833) over 7-day probe samples
//   latency_p50_7d    — milliseconds (integer)
//   latency_p95_7d    — milliseconds (integer)
//   samples_7d        — count of probe attempts in window
//   score             — current cached score from scorecards
//   last_probed_at    — ISO 8601 timestamp of last scorecard refresh
//
// No DB writes. Read-only over `providers`, `scorecards`, `probes`. Safe to
// run any time, including against production.
//
// Failure mode: an empty providers list yields a CSV with header only.
// Missing scorecard or no probes in the 7-day window yield empty cells for
// the relevant columns. Partner can filter / impute on their side.
// =============================================================================

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

type ProviderRow = {
  url: string;
  capability: string;
  metadata: Record<string, unknown> | null;
};

type ScorecardRow = {
  provider_id: string;
  score: number | null;
  latency_p50: number | null;
  latency_p95: number | null;
  last_updated: string | null;
};

type ProbeRow = {
  provider_id: string;
  timestamp: string;
  latency_ms: number | null;
  success: boolean | null;
};

// Minimal CSV escape: quote fields that contain comma, quote, or newline.
function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function parseDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

// p50/p95 over a sorted ascending array of integers. Returns null when empty.
// Uses linear interpolation between the two adjacent samples; matches the
// percentile semantics in src/prober.ts (Phase 1 percentile fix).
function percentile(sortedAsc: number[], p: number): number | null {
  if (sortedAsc.length === 0) return null;
  if (sortedAsc.length === 1) return sortedAsc[0];
  const rank = (p / 100) * (sortedAsc.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return sortedAsc[lo];
  const frac = rank - lo;
  return Math.round(sortedAsc[lo] * (1 - frac) + sortedAsc[hi] * frac);
}

// Paginate over a Supabase / PostgREST query. The default response cap is
// 1000 rows per request — without explicit pagination, larger tables get
// silently truncated. We hit this on 2026-05-14 when the first nightly
// rollup-latest.csv exported only 1000 of ~10,791 probes in a 7-day window
// (Paddock would have received a Swiss-cheese aggregation: success_rate,
// p50, p95, samples columns mostly empty because most providers' probes
// fell outside the truncated 1000-row probe window). Bounded by MAX_PAGES
// (100 = 100k rows) as a defensive ceiling: if a table grows beyond that
// we throw rather than loop silently, so we notice loudly.
const PAGE_SIZE = 1000;
const MAX_PAGES = 100;

async function fetchAllPaged<T>(
  label: string,
  build: (from: number, to: number) => any,
): Promise<T[]> {
  const out: T[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await build(from, to);
    if (error) throw error;
    if (!data || data.length === 0) break;
    out.push(...(data as T[]));
    if (data.length < PAGE_SIZE) break;
    if (page === MAX_PAGES - 1) {
      throw new Error(
        `[export-7-night] ${label}: hit MAX_PAGES (${MAX_PAGES}) ceiling at ${out.length} rows — raise the ceiling or add filtering`,
      );
    }
  }
  return out;
}

async function main() {
  const startedAt = Date.now();
  console.error('[export-7-night] Pulling providers...');
  // .order('url') makes pagination stable. Without it, PostgREST without an
  // explicit ORDER BY can return overlapping rows on adjacent .range() pages —
  // observed 2026-05-14 as 8 duplicate URLs / 49,668 in the first paginated
  // run. URL is unique per provider so it's the natural stable sort key.
  const providers = await fetchAllPaged<ProviderRow>(
    'providers',
    (from, to) =>
      supabase
        .from('providers')
        .select('url, capability, metadata')
        .order('url')
        .range(from, to),
  );

  console.error(`[export-7-night] ${providers.length} providers; pulling scorecards...`);
  // Same stability discipline. provider_id is the FK to providers.url and
  // unique per scorecard row, so it's the right stable sort key.
  const scorecards = await fetchAllPaged<ScorecardRow>(
    'scorecards',
    (from, to) =>
      supabase
        .from('scorecards')
        .select('provider_id, score, latency_p50, latency_p95, last_updated')
        .order('provider_id')
        .range(from, to),
  );
  const scorecardByUrl = new Map<string, ScorecardRow>(
    scorecards.map((s) => [s.provider_id, s]),
  );

  // Probes are append-only and large; restrict to last 7 days at the SQL layer.
  // Paginated because a 7-day window over ~2000 endpoints with ~5 samples
  // each is ~10k rows — well past the 1000-row PostgREST default cap.
  const sevenDaysAgo = new Date(Date.now() - SEVEN_DAYS_MS).toISOString();
  console.error(`[export-7-night] Pulling probes since ${sevenDaysAgo}...`);
  // Stable sort across (timestamp, provider_id) so adjacent pages can't
  // overlap. The (provider_id, timestamp) primary key on probes (or the
  // natural insert order if no PK) tends to be timestamp-correlated, so
  // ordering by timestamp first keeps the sort cheap.
  const probes = await fetchAllPaged<ProbeRow>(
    'probes',
    (from, to) =>
      supabase
        .from('probes')
        .select('provider_id, timestamp, latency_ms, success')
        .gte('timestamp', sevenDaysAgo)
        .order('timestamp')
        .order('provider_id')
        .range(from, to),
  );

  console.error(`[export-7-night] Aggregating ${probes?.length ?? 0} probe samples...`);
  type Agg = { samples: number; successes: number; latencies: number[] };
  const probeAgg = new Map<string, Agg>();
  for (const probe of probes ?? []) {
    const agg = probeAgg.get(probe.provider_id) ?? { samples: 0, successes: 0, latencies: [] };
    agg.samples += 1;
    if (probe.success === true) agg.successes += 1;
    if (typeof probe.latency_ms === 'number' && probe.latency_ms >= 0) {
      agg.latencies.push(probe.latency_ms);
    }
    probeAgg.set(probe.provider_id, agg);
  }

  // ---- Emit CSV ---------------------------------------------------------
  const cols = [
    'endpoint_url',
    'domain',
    'network',
    'capability',
    'integration_type',
    'x402_verified',
    'success_rate_7d',
    'latency_p50_7d',
    'latency_p95_7d',
    'samples_7d',
    'score',
    'last_probed_at',
  ] as const;
  process.stdout.write(cols.join(',') + '\n');

  let written = 0;
  for (const p of providers ?? []) {
    const meta =
      p.metadata && typeof p.metadata === 'object' && !Array.isArray(p.metadata)
        ? (p.metadata as Record<string, unknown>)
        : {};

    // Networks: prefer the metadata.networks array (set by the Agentic Market
    // crawler), fall back to "base" for verified seed rows that don't carry
    // an explicit list. Multi-network gets semicolon-joined for partner clarity.
    const networksRaw = Array.isArray(meta.networks) ? (meta.networks as string[]) : null;
    const network =
      networksRaw && networksRaw.length > 0
        ? networksRaw.join(';')
        : 'base';

    const integrationTypeRaw = meta.integration_type;
    const integrationType =
      integrationTypeRaw === '1P' || integrationTypeRaw === '3P'
        ? integrationTypeRaw
        : '';

    const x402Verified = meta.x402_verified === true ? 'true' : 'false';

    const sc = scorecardByUrl.get(p.url);
    const score = sc?.score ?? '';
    const lastUpdated = sc?.last_updated ?? '';

    const agg = probeAgg.get(p.url);
    let successRate: string | number = '';
    let p50: string | number = '';
    let p95: string | number = '';
    let samples: string | number = 0;
    if (agg && agg.samples > 0) {
      samples = agg.samples;
      successRate = (agg.successes / agg.samples).toFixed(4);
      const sorted = [...agg.latencies].sort((a, b) => a - b);
      const v50 = percentile(sorted, 50);
      const v95 = percentile(sorted, 95);
      if (v50 !== null) p50 = v50;
      if (v95 !== null) p95 = v95;
    }

    const cells: Record<(typeof cols)[number], unknown> = {
      endpoint_url: p.url,
      domain: parseDomain(p.url),
      network,
      capability: p.capability,
      integration_type: integrationType,
      x402_verified: x402Verified,
      success_rate_7d: successRate,
      latency_p50_7d: p50,
      latency_p95_7d: p95,
      samples_7d: samples,
      score,
      last_probed_at: lastUpdated,
    };

    process.stdout.write(cols.map((c) => csvEscape(cells[c])).join(',') + '\n');
    written += 1;
  }

  const elapsedMs = Date.now() - startedAt;
  console.error(`[export-7-night] Done. Wrote ${written} rows in ${elapsedMs}ms.`);
}

main().catch((err) => {
  console.error('[export-7-night] failed:', err?.message || err);
  process.exit(1);
});
