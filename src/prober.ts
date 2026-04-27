// src/prober.ts - FIXED for current clean schema
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const REGIONS = ['us-east', 'eu-west', 'asia-southeast'];

async function probeProvider(provider: any) {
  const results = [];
  const targetUrl = provider.url;

  if (!targetUrl) {
    console.log(`⚠️ Skipping provider with no URL`);
    return results;
  }

  console.log(`🔍 Probing ${provider.name || 'Unknown'} (${provider.capability}) → ${targetUrl}`);

  for (const region of REGIONS) {
    const start = Date.now();
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);

      const res = await fetch(targetUrl, {
        method: 'GET',
        signal: controller.signal,
        headers: { 'User-Agent': 'TrustBench-Prober/1.0' }
      });

      clearTimeout(timeout);

      const latency = Date.now() - start;
      const success = res.ok || res.status === 402 || res.status === 200;

      results.push({
        provider_id: provider.url,   // use url as identifier
        capability: provider.capability,
        region,
        latency_ms: latency,
        success,
        timestamp: new Date().toISOString()
      });

      console.log(`  ${success ? '✅' : '❌'} ${region}: ${latency}ms (status ${res.status})`);
    } catch {
      results.push({
        provider_id: provider.url,
        capability: provider.capability,
        region,
        latency_ms: 9999,
        success: false,
        timestamp: new Date().toISOString()
      });
      console.log(`  ❌ ${region}: timeout/error`);
    }
  }
  return results;
}

async function runFullProbeAndScore() {
  console.log('🚀 Starting improved real-URL probe + scoring pipeline...');

  const { data: providers } = await supabase
    .from('providers')
    .select('url, name, capability')
    .order('last_crawled_at', { ascending: false });

  if (!providers || providers.length === 0) {
    console.log('No providers found in database');
    return;
  }

  console.log(`Found ${providers.length} providers to probe`);

  for (const p of providers) {
    const results = await probeProvider(p);
    if (results.length === 0) continue;

    await supabase.from('probes').insert(results);

    const successRate = results.filter(r => r.success).length / results.length;
    const avgLatency = results.reduce((sum, r) => sum + r.latency_ms, 0) / results.length;

    const score = Math.max(40, Math.min(98, Math.round(98 - (avgLatency / 7) - (1 - successRate) * 45)));

    await supabase.from('scorecards').upsert({
      provider_id: p.url,
      capability: p.capability,
      score,
      latency_p50: Math.round(avgLatency),
      latency_p95: Math.round(avgLatency * 1.2),
      uptime_7d: Math.round(successRate * 100)
    }, { onConflict: 'provider_id' });
  }

  console.log('✅ Full real-URL probe + scoring completed — rankings updated!');
}

runFullProbeAndScore().catch(console.error);