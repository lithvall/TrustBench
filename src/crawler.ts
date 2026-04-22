import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function crawlBazaar() {
  console.log('🔍 Starting Bazaar crawl...');

  // Real Bazaar discovery endpoint (placeholder for now - we'll connect to live API soon)
  const mockProviders = [
    { id: 'coingecko', name: 'CoinGecko', url: 'https://api.coingecko.com', capability: 'data', description: 'Crypto market data' },
    { id: 'exa', name: 'Exa', url: 'https://api.exa.ai', capability: 'search', description: 'AI-powered web search' },
    { id: 'perplexity', name: 'Perplexity', url: 'https://api.perplexity.ai', capability: 'search', description: 'Search + reasoning' },
  ];

  for (const p of mockProviders) {
    await supabase.from('providers').upsert(p, { onConflict: 'id' });
  }

  console.log('✅ Crawled and stored', mockProviders.length, 'providers');
}
