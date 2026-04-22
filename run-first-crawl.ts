import 'dotenv/config';
import { crawlBazaar } from './src/crawler.js';
import { probeProvider } from './src/prober.js';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function runFirstCrawl() {
  console.log('🚀 Starting first TrustBench crawl + probe...');

  await crawlBazaar();

  // Get providers we just crawled
  const { data: providers } = await supabase.from('providers').select('*');

  if (!providers || providers.length === 0) {
    console.log('No providers found');
    return;
  }

  console.log('Probing', providers.length, 'providers...');

  for (const provider of providers) {
    const result = await probeProvider(provider);
    
    // Simple scoring for MVP (we'll make this smarter later)
    const score = result.status === 'success' ? 85 : 30;

    await supabase.from('scorecards').insert({
      provider_id: provider.id,
      capability: provider.capability,
      score: score,
      latency_p50: result.latency_ms,
      latency_p95: result.latency_ms,
      uptime_7d: 100,
      last_updated: new Date().toISOString()
    });
  }

  console.log('✅ First crawl + probe completed!');
}

runFirstCrawl().catch(console.error);
