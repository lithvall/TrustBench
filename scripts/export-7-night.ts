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
// Probed-only filter (added 2026-05-14): only providers with ≥1 probe sample
// in the 7-day window are emitted. Providers in the registry with no 7-day
// probe data are skipped — the probe sampler is the implicit curation layer
// (~500 providers/night × 3 samples = ~3.5k unique providers in any 7-day
// window). This keeps the export dense and aligned with Paddock's stated ask
// for liveness data, and avoids republishing Coinbase Agentic Market catalog
// noise (per-resource enumeration and reconnaissance probe URLs that landed
// in providers via the crawler but were never probed). The skipped-count is
// logged to stderr so the curation is visible in the workflow log.
//
// Missing scorecard yields an empty `score` and `last_probed_at` cell for
// that row (rare; usually a brand-new probed provider). Partner can filter
// or impute on their side.
//
// Failure mode: an empty providers list, or providers with zero matching
// probes in the 7-day window, yields a CSV with header only.
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
// Runaway backstop, raised 100 -> 500 on 2026-08-14.
//
// Why it was raised. MAX_PAGES=100 caps a fetch at 100k rows. Measured
// 2026-08-14: the `providers` table is at 79,480 rows and growing ~320/day
// (it was ~50k on 2026-05-14). That put the ceiling roughly 64 days out, at
// which point this script would have started throwing every night, the
// workflow would have gone red, and Paddock's feed would have frozen at the
// last good CSV. Failing loud is the correct design (see fetchAllPaged), but
// failing loud on a *predictable* schedule is just a scheduled outage.
//
// Why the growth is unbounded. Only ~6.5k of those 79k providers are actually
// probed and exported; the other ~73k are catalog accumulation that no longer
// resolves (per-resource URL enumeration, reconnaissance paths, dead hosts).
// Nothing prunes them. Raising the ceiling buys ~3.5 years of headroom but
// does NOT fix that — a retention policy on unprobed providers is the real
// fix and is deliberately not done here, because deleting provider rows is
// destructive and needs Johan's explicit call.
const MAX_PAGES = 500;
// Soft alarm, well below the backstop, so the accumulation problem surfaces in
// the nightly workflow log with ~7 months of lead time instead of arriving as
// a hard failure. ~1.9x the 2026-08-14 providers count.
const WARN_ROWS = 150_000;

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
  // Soft alarm: visible in the nightly workflow log long before MAX_PAGES.
  // If this fires for `providers`, the fix is a retention policy on unprobed
  // rows, not another ceiling bump — see the MAX_PAGES comment.
  if (out.length >= WARN_ROWS) {
    console.error(
      `[export-7-night] WARN ${label}: ${out.length} rows >= WARN_ROWS (${WARN_ROWS}). ` +
      `MAX_PAGES backstop is ${MAX_PAGES} pages (${MAX_PAGES * PAGE_SIZE} rows). ` +
      `Consider pruning unprobed providers rather than raising the ceiling again.`,
    );
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
  let skipped = 0;
  for (const p of providers) {
    // PROBED-ONLY FILTER (added 2026-05-14 for the Paddock deliverable).
    //
    // Without this filter the providers table dumps the full Agentic Market
    // catalog crawl into the CSV (~50k rows on 2026-05-14, 88% concentrated
    // in two domains that enumerate per-resource URLs like
    // https://lowpaymentfee.com/api/endpoint-1..100+ and reconnaissance
    // probe paths like https://lowpaymentfee.com/_dot_git/config). That's
    // catalog noise, not endpoint discovery, and shipping it to Paddock as
    // "the 7-night rollup" would misrepresent what TrustBench actually
    // tracks.
    //
    // The probe sampler is the implicit curation layer: it hits ~500
    // providers/night × 3 samples = the ~3.5k unique providers we consider
    // real enough to actively measure. Filtering to "has ≥1 probe sample in
    // the 7-day window" gives Paddock dense, honest liveness data — which
    // is exactly what he asked for ("every day's snapshot includes that
    // morning's liveness data alongside the spend data").
    //
    // Trade-off: providers with no 7-day probe samples (long-tail catalog
    // accumulation, just-crawled, or temporarily un-probed) are invisible
    // in this export. Acceptable for the Paddock-shaped deliverable. A
    // separate "full registry" export can be added later if a different
    // partner needs the long tail.
    const agg = probeAgg.get(p.url);
    if (!agg || agg.samples === 0) {
      skipped += 1;
      continue;
    }

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

    // Compute aggregated probe stats. agg.samples > 0 is guaranteed by the
    // filter above, so the if-guard collapses but stays defensive — keeps
    // the type narrowing clean for the percentile helpers.
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
  console.error(
    `[export-7-night] Done. Wrote ${written} rows, skipped ${skipped} unprobed providers in ${elapsedMs}ms.`,
  );

  // ---------------------------------------------------------------------
  // Exit-code semantics (added 2026-05-20 per lessons.md 2026-05-19 entry
  // "Internal probes can fail 100% for 8 days while CI shows green").
  // ---------------------------------------------------------------------
  // Failure modes the existing main().catch(exit 1) DOES catch:
  //   - Supabase fetchAllPaged throws on any non-2xx (env missing, RLS
  //     denial, table renamed, etc.)
  //   - paged-overflow MAX_PAGES guard fires
  //   - any unhandled Promise rejection in main()
  //
  // Failure mode the existing main().catch does NOT catch (silent-failure
  // shape this block fixes):
  //   - Supabase responds 200 with providers.length > 0 but the 7-day
  //     probes window is empty (e.g. the nightly-pipeline workflow has
  //     been red for >7 days, or `probes` table was truncated, or the
  //     prober regressed silently per the 2026-05-19 incident).
  //
  //   In that case every provider gets skipped by the probed-only filter,
  //   `written` is 0, the script exits 0, and the workflow then commits
  //   a header-only `exports/rollup-latest.csv` and pushes it. Railway
  //   redeploys, and Paddock's 00:05 UTC poll fetches a CSV with the
  //   12-column header and zero data rows. The "last successful rollup
  //   stays in place" failure-mode comment in the workflow YAML is only
  //   true if THIS script fails-loud; silent-success with empty output
  //   produces exactly the partner-data-corruption Paddock's pipeline
  //   is supposed to be protected against.
  //
  // Rule:
  //   - providers.length === 0: empty registry. This is observational
  //     (e.g. brand-new DB, schema migration in flight). Exit 0 with
  //     a warning so the operator sees it but the workflow doesn't go
  //     red on a known empty state.
  //   - providers.length > 0 AND written === 0: every provider was
  //     skipped for lack of 7-day probe data. That is the silent-failure
  //     shape — probes pipeline is broken upstream. Exit 1 so the
  //     workflow goes red and the prior CSV stays in place. Recovery is
  //     the same as any other workflow failure: re-run after probes
  //     pipeline is fixed.
  //   - written > 0: at least one provider produced a real row. Success.
  //     Even if it's just one, the partner gets meaningful liveness
  //     data and prior-day continuity is preserved.
  //
  // Failure mode if this is wrong: a legitimately empty 7-day window
  // (e.g. first run after a long pause) goes red. Acceptable — same
  // trade-off as prober.ts. Re-run after the pipeline catches up.
  if (providers.length === 0) {
    console.error('[export-7-night] WARN providers table empty; exiting 0 (header-only CSV)');
    return;
  }
  if (written === 0) {
    throw new Error(
      `[export-7-night] all ${providers.length} providers skipped for lack of 7-day probe data — probes pipeline likely regressed upstream; refusing to emit header-only CSV`,
    );
  }
}

main().catch((err) => {
  console.error('[export-7-night] failed:', err?.message || err);
  process.exit(1);
});
