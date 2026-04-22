import 'dotenv/config';
import { crawlBazaar } from './src/crawler.js';
import { probeProvider } from './src/prober.js';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function runFullCrawlCycle() {
  console.log('🚀 [TrustBench Crawler] Starting full crawl + probe cycle...');

  try {
    await crawlBazaar();

    const { data: providers } = await supabase
      .from('providers')
      .select('*');

    if (!providers || providers.length === 0) {
      console.log('No providers found to probe');
      return;
    }

    console.log(`Probing ${providers.length} providers...`);

    for (const provider of providers) {
      const result = await probeProvider(provider);
      const score = result.status === 'success' ? 85 : 30;

      await supabase.from('scorecards').upsert({
        provider_id: provider.id,
        capability: provider.capability || 'search',
        score: score,
        latency_p50: result.latency_ms || 0,
        latency_p95: result.latency_ms || 0,
        uptime_7d: 100,
        last_updated: new Date().toISOString()
      }, { onConflict: 'provider_id,capability' });
    }

    console.log('✅ [TrustBench Crawler] Full cycle completed successfully!');
  } catch (error) {
    console.error('❌ [TrustBench Crawler] Error during cycle:', error);
  }
}

// Run immediately
runFullCrawlCycle();

// Then every hour
setInterval(runFullCrawlCycle, 60 * 60 * 1000);

console.log('🔄 [TrustBench Crawler] Background worker started — will run every hour');