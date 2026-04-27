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

interface ProbeSample {
  provider_id: string;
  capability: string;
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
    results.push({
      provider_id: targetUrl,
      capability: provider.capability,
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
  const idx = Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p));
  return sorted[idx];
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

    await supabase.from('probes').insert(results);

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

    await supabase.from('scorecards').upsert({
      provider_id: p.url,
      capability: p.capability,
      score,
      latency_p50: p50,
      latency_p95: p95,
      uptime_7d: Math.round(successRate * 100),
      last_updated: new Date().toISOString()
    }, { onConflict: 'provider_id' });
  }

  console.log('Probe + scoring pipeline complete.');
}

runFullProbeAndScore().catch(console.error);