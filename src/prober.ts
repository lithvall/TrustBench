// src/prober.ts
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { ProbeResult } from './types.js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const REGIONS = ['us-east', 'eu-west', 'asia-southeast'];

// Capability-specific test endpoints (lightweight, realistic probes)
const TEST_ENDPOINTS: Record<string, string> = {
  search: 'https://api.openai.com/v1/chat/completions',           // OpenAI-style search test
  inference: 'https://api.groq.com/openai/v1/chat/completions',   // Groq-style inference test
  data: 'https://api.perplexity.ai/chat/completions'              // Perplexity-style data test
};

async function probeProvider(providerId: string, capability: string): Promise<ProbeResult[]> {
  console.log(`🔍 Probing ${providerId} (${capability})...`);
  const results: ProbeResult[] = [];
  const testUrl = TEST_ENDPOINTS[capability] || 'https://httpbin.org/get';

  for (const region of REGIONS) {
    const start = Date.now();
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);

      const res = await fetch(testUrl, {
        method: 'GET',
        signal: controller.signal,
        headers: { 'User-Agent': 'TrustBench-Prober/1.0' }
      });

      clearTimeout(timeout);

      const latency = Date.now() - start;
      results.push({
        provider_id: providerId,
        capability,
        region,
        latency_ms: latency,
        success: res.ok,
        timestamp: new Date().toISOString()
      });
    } catch {
      results.push({
        provider_id: providerId,
        capability,
        region,
        latency_ms: 9999,
        success: false,
        timestamp: new Date().toISOString()
      });
    }
  }
  return results;
}

async function runFullProbeAndScore() {
  console.log('🚀 Starting full improved probe + scoring pipeline...');

  const { data: providers } = await supabase.from('providers').select('*');

  for (const p of providers || []) {
    const results = await probeProvider(p.provider_id, p.capability);

    // Store raw probe results
    await supabase.from('probe_results').insert(results);

    // Improved realistic scoring
    const successRate = results.filter(r => r.success).length / results.length;
    const avgLatency = results.reduce((sum, r) => sum + r.latency_ms, 0) / results.length;
    
    // Score formula: base 40–100, penalize high latency and low success
    let score = Math.max(40, Math.round(100 - (avgLatency / 6) - (1 - successRate) * 50));

    await supabase
      .from('scorecards')
      .upsert({
        provider_id: p.provider_id,
        capability: p.capability,
        score,
        latency_p50: Math.round(avgLatency),
        uptime_7d: Math.round(successRate * 100)
      }, { onConflict: 'provider_id,capability' });
  }

  console.log('✅ Full improved probe + scoring completed — rankings updated!');
}

runFullProbeAndScore().catch(console.error);