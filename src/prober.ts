// src/prober.ts - realistic x402 scoring with proper percentiles
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

console.log('🚀 PROBER VERSION: v2-percentile-scoring');

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

// These are sample slots, not true geo regions. We probe 3 times per run
// from this single host to capture variance. Be honest about it in docs.
const REGIONS = ['us-east', 'eu-west', 'asia-southeast'];
const TIMEOUT_MS = 8000;

// Status codes we treat as "the endpoint is alive and reachable".
// 2xx = OK, 401/402/403 = auth/payment required (still proves the endpoint
// is up), 404/405 = wrong path/method but server responded.
const ALIVE_STATUSES = new Set([200, 201, 204, 401, 402, 403, 404, 405, 429]);

// Shape MUST match the probes table columns in schema.sql exactly.
// Probes table has: id (bigserial, auto), provider_id, timestamp,
// latency_ms, success, region. Any field not in that list will cause
// Supabase to reject the insert with "column does not exist".
//
// 2026-05-11: removed `capability` from this interface. It was present
// in the in-memory shape but absent from the table schema, so every
// probe insert was being silently rejected since this version of the
// prober shipped. The error was swallowed because the insert call
// didn't capture the return value. probes table was empty as a result.
// Fixed alongside adding error capture below at the insert/upsert sites.
interface ProbeSample {
  provider_id: string;
  region: string;
  latency_ms: number;
  success: boolean;
  timestamp: string;
}

async function probeOnce(url: string): Promise<{ latency: number; success: boolean }> {
  const start = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    // Try HEAD first — faster, less likely to trip rate limits.
    let res = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
      headers: { 'User-Agent': 'TrustBench-Prober/1.0' }
    });

    // Some servers reject HEAD with 405 — fall back to GET.
    if (res.status === 405) {
      res = await fetch(url, {
        method: 'GET',
        signal: controller.signal,
        headers: { 'User-Agent': 'TrustBench-Prober/1.0' }
      });
    }

    clearTimeout(timer);
    return {
      latency: Date.now() - start,
      success: ALIVE_STATUSES.has(res.status)
    };
  } catch {
    clearTimeout(timer);
    return { latency: TIMEOUT_MS, success: false };
  }
}

async function probeProvider(provider: any): Promise<ProbeSample[]> {
  const results: ProbeSample[] = [];
  const targetUrl = provider.url;
  if (!targetUrl) return results;

  console.log(`Probing ${provider.name || 'Unknown'} (${provider.capability}) -> ${targetUrl}`);

  for (const region of REGIONS) {
    const { latency, success } = await probeOnce(targetUrl);
    // Note: provider.capability is intentionally NOT included — the probes
    // table doesn't have a capability column. Capability is read off the
    // provider row at scoring time, not duplicated per-sample.
    results.push({
      provider_id: targetUrl,
      region,
      latency_ms: latency,
      success,
      timestamp: new Date().toISOString()
    });
    console.log(`  ${success ? 'OK' : 'FAIL'} ${region}: ${latency}ms`);
  }
  return results;
}

// ---- statistics helpers ----

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const rank = (sorted.length - 1) * p;
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  return lo === hi
    ? sorted[lo]
    : sorted[lo] + (sorted[hi] - sorted[lo]) * (rank - lo);
}

function stddev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

// ---- the new scoring formula ----
//
// score = base(15) + reliability(0..45) + latency(0..35) + consistency(0..3)
//
// Reliability is the dominant factor (success rate is what agents care about).
// Latency uses real p50 of *successful* probes only — timeouts already hit
// reliability, we don't double-count them in latency.
// Consistency rewards low jitter across the 3 samples.
function computeScore(opts: {
  successRate: number;     // 0..1
  p50: number;             // ms, of successful probes only
  jitterRatio: number;     // stddev / mean, of successful probes
}): number {
  const { successRate, p50, jitterRatio } = opts;

  const base = 15;

  // Reliability: linear, 0..45. Success rate is king.
  const reliability = 45 * successRate;

  // Latency: linear decay, 0ms -> 35, 2000ms -> 0. Capped both ends.
  // Only meaningful when we have at least one successful probe.
  const latencyHealth = Math.max(0, Math.min(1, 1 - p50 / 2000));
  const latency = successRate > 0 ? 35 * latencyHealth : 0;

  // Consistency: small bonus for tight, predictable response times.
  // jitterRatio 0 -> +3, jitterRatio >= 1.0 -> 0.
  const consistency = successRate > 0
    ? 3 * Math.max(0, Math.min(1, 1 - jitterRatio))
    : 0;

  const raw = base + reliability + latency + consistency;
  return Math.max(40, Math.min(98, Math.round(raw)));
}

async function runFullProbeAndScore() {
  console.log('Starting x402 probe + scoring pipeline...');

  const { data: providers } = await supabase
    .from('providers')
    .select('url, name, capability');

  console.log(`Found ${providers?.length || 0} providers to probe`);

  for (const p of providers || []) {
    const results = await probeProvider(p);
    if (results.length === 0) continue;

    // Error capture: previously this call discarded its return value, so any
    // schema mismatch or RLS denial was invisible (CI runs went green while
    // the table stayed empty). Now we log and throw — better to fail loud
    // and have the workflow turn red than silently accumulate zero data.
    const { error: probeInsertError } = await supabase.from('probes').insert(results);
    if (probeInsertError) {
      console.error(`[prober] probes insert failed for ${p.url}: ${probeInsertError.message}`);
      throw probeInsertError;
    }

    // --- compute real stats ---
    const successCount = results.filter(r => r.success).length;
    const successRate = successCount / results.length;

    // Latency percentiles use *successful* probes only.
    const okLatencies = results
      .filter(r => r.success)
      .map(r => r.latency_ms)
      .sort((a, b) => a - b);

    const p50 = okLatencies.length > 0 ? percentile(okLatencies, 0.5) : TIMEOUT_MS;
    const p95 = okLatencies.length > 0 ? percentile(okLatencies, 0.95) : TIMEOUT_MS;

    // Jitter as coefficient of variation, on successful probes.
    const meanOk = okLatencies.length > 0
      ? okLatencies.reduce((a, b) => a + b, 0) / okLatencies.length
      : 0;
    const jitterRatio = meanOk > 0 ? stddev(okLatencies) / meanOk : 1;

    const score = computeScore({ successRate, p50, jitterRatio });

    console.log(
      `  -> score=${score} succ=${(successRate * 100).toFixed(0)}% ` +
      `p50=${p50}ms p95=${p95}ms jitter=${jitterRatio.toFixed(2)}`
    );

    // Same defensive error capture as the probes insert above. Scorecards
    // writes have been landing — this is a symmetry/future-proofing fix.
    const { error: scorecardUpsertError } = await supabase.from('scorecards').upsert({
      provider_id: p.url,
      capability: p.capability,
      score,
      latency_p50: p50,
      latency_p95: p95,
      uptime_7d: Math.round(successRate * 100),
      last_updated: new Date().toISOString()
    }, { onConflict: 'provider_id' });
    if (scorecardUpsertError) {
      console.error(`[prober] scorecards upsert failed for ${p.url}: ${scorecardUpsertError.message}`);
      throw scorecardUpsertError;
    }
  }

  console.log('Probe + scoring pipeline complete.');
}

// Exit-code semantics (added 2026-05-20 per lessons.md 2026-05-19 entry
// "Internal probes can fail 100% for 8 days while CI shows green").
// -----------------------------------------------------------------------
// Previously: `runFullProbeAndScore().catch(console.error)` logged any
// thrown error (e.g. Supabase probes-insert RLS denial, scorecards-upsert
// schema mismatch) to stderr and then exited 0 by default. The nightly-
// pipeline workflow stayed green even when every insert was rejected —
// the same silent-failure shape that hid the 2026-05-11→2026-05-19 paid-
// probe regression. The 2026-05-11 fix that added `throw probeInsertError`
// (described in the file header comment around line 32) was load-bearing
// only if the top-level promise rejection also surfaced as a non-zero
// exit. It did not.
//
// New behavior: log the error, then exit 1 so GitHub Actions goes red on
// any thrown error inside the pipeline. Functional success for this
// script = "every provider's probe samples landed in `probes` AND its
// scorecard landed in `scorecards`." Both are guarded by `throw` already;
// this just propagates that signal to the process layer.
//
// Failure mode if this is wrong: the workflow goes red on a transient
// Supabase blip that would have self-recovered the next night. Acceptable
// trade-off — false-positive red is a known noise; silent-green-while-
// broken is the failure class we're systematically eliminating per the
// lessons.md entry.
//
// What this does NOT change: a probe run where every endpoint returns
// `success: false` (e.g. registry full of dead URLs) still exits 0. That
// is observational data, not a probe-script failure — the data lands,
// downstream consumers (`/rankings`, paid-probe canary) see the zero
// success rate. The probe script's job is to *measure honestly*, not to
// fail when the underlying registry is unhealthy.
runFullProbeAndScore().catch((err) => {
  console.error('[prober] pipeline failed:', err && err.message ? err.message : err);
  process.exit(1);
});