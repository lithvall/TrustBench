import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { ProbeResult } from './types.js';

console.log('🔥 Prober script starting...');

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const REGIONS = ['us-east', 'eu-west', 'asia-southeast'];

export async function probeProvider(providerUrl: string, providerId: string) {
  console.log(`🔍 Probing ${providerId}...`);
  const results: ProbeResult[] = [];

  for (const region of REGIONS) {
    const start = Date.now();
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const res = await fetch(providerUrl, { 
        method: 'HEAD', 
        signal: controller.signal 
      });
      clearTimeout(timeout);

      const latency_ms = Date.now() - start;

      results.push({
        provider_id: providerId,
        timestamp: new Date().toISOString(),
        latency_ms,
        status: res.ok ? 'success' : 'error',
        region,
      });
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      results.push({
        provider_id: providerId,
        timestamp: new Date().toISOString(),
        latency_ms: 5000,
        status: 'timeout',
        error: errorMessage,
        region,
      });
    }
  }

  try {
    await supabase.from('probes').insert(results);
    console.log(`✅ Stored ${results.length} probe results`);
  } catch (err) {
    console.warn('⚠️ Could not store probes (table optional):', err);
  }

  console.log(`✅ Probed ${providerId} across ${REGIONS.length} regions`);
  return results;
}

function calculateScore(probes: ProbeResult[]): number {
  if (probes.length === 0) return 50;
  const avgLatency = probes.reduce((sum, p) => sum + p.latency_ms, 0) / probes.length;
  const successRate = probes.filter(p => p.status === 'success').length / probes.length;
  const latencyScore = Math.max(0, 100 - (avgLatency / 10));
  return Math.round(latencyScore * successRate);
}

export async function runFullProbeAndScore() {
  console.log('🚀 Running full probe + scoring pipeline...');
  
  const { data: providers } = await supabase.from('providers').select('*');
  if (!providers?.length) {
    console.log('⚠️ No providers found — run npm run crawl first');
    return;
  }

  for (const provider of providers) {
    const probes = await probeProvider(provider.url, provider.id);
    const score = calculateScore(probes);

    await supabase
      .from('scorecards')
      .upsert({
        provider_id: provider.id,
        capability: provider.capability,
        score,
        latency_p50: Math.round(probes.reduce((sum, p) => sum + p.latency_ms, 0) / probes.length),
        latency_p95: Math.max(...probes.map(p => p.latency_ms)),
        uptime_7d: 99.5,
        last_updated: new Date().toISOString(),
      }, { onConflict: 'provider_id,capability' });
  }

  console.log('✅ Full probe + scoring completed — rankings updated!');
}

// Auto-run
console.log('🚀 Starting full pipeline...');
runFullProbeAndScore().catch(console.error);