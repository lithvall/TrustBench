// src/crawler.ts
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
);

export async function crawlBazaar() {
  console.log('🕷️ Crawling ALL x402 providers from Coinbase Bazaar...');

  const res = await fetch('https://api.cdp.coinbase.com/platform/v2/x402/discovery/resources?limit=1000');
  const data = await res.json();
  const resources = data.resources || [];

  let inserted = 0;
  for (const r of resources) {
    if (!r.url) continue;
    const { error } = await supabase.from('providers').upsert({
      provider_id: r.id || r.url,
      capability: r.capability || 'other',
      name: r.name || 'Unknown',
      url: r.url,
      description: r.description || '',
      pay_to: r.payTo || null,
      metadata: r.metadata || {},
      last_crawled_at: new Date().toISOString()
    }, { onConflict: 'provider_id' });
    if (!error) inserted++;
  }

  console.log(`✅ Auto-discovered and upserted ${inserted} x402 providers`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  crawlBazaar().catch(console.error);
}