import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { Provider } from './types.js';

// Supabase admin client
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

export async function crawlAgenticMarket() {
  console.log('🚀 Starting Agentic.Market crawl...');

  // TODO: Replace with real Agentic.Market / Bazaar API when public
  // For MVP we seed + update known high-quality x402 providers
  const sampleProviders: Provider[] = [
    {
      id: 'openai-search',
      url: 'https://api.openai.com/v1',
      capability: 'search',
      name: 'OpenAI Search',
      description: 'Official OpenAI endpoint'
    },
    {
      id: 'groq-inference',
      url: 'https://api.groq.com',
      capability: 'inference',
      name: 'Groq Inference',
      description: 'Fastest inference provider'
    },
    {
      id: 'perplexity-data',
      url: 'https://api.perplexity.ai',
      capability: 'data',
      name: 'Perplexity Data',
      description: 'Real-time web data'
    }
  ];

  const { error } = await supabase
    .from('providers')
    .upsert(sampleProviders, { onConflict: 'id' });

  if (error) throw error;

  console.log(`✅ Crawled and upserted ${sampleProviders.length} providers`);
  return sampleProviders.length;
}

// Run directly with: npm run crawl
if (import.meta.url === `file://${process.argv[1]}`) {
  crawlAgenticMarket().catch(console.error);
}