// src/crawler.ts
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { Provider } from './types.js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const providers: Provider[] = [
  // Search
  { provider_id: "openai-search", capability: "search", name: "OpenAI Search", url: "https://api.openai.com/v1" },
  { provider_id: "perplexity-search", capability: "search", name: "Perplexity Search", url: "https://api.perplexity.ai" },
  { provider_id: "groq-search", capability: "search", name: "Groq Search", url: "https://api.groq.com" },
  { provider_id: "anthropic-search", capability: "search", name: "Anthropic Search", url: "https://api.anthropic.com" },
  { provider_id: "exa-search", capability: "search", name: "Exa Search", url: "https://api.exa.ai" },
  { provider_id: "tavily-search", capability: "search", name: "Tavily Search", url: "https://api.tavily.com" },
  { provider_id: "brave-search", capability: "search", name: "Brave Search", url: "https://api.search.brave.com" },

  // Inference
  { provider_id: "groq-inference", capability: "inference", name: "Groq Inference", url: "https://api.groq.com" },
  { provider_id: "openai-inference", capability: "inference", name: "OpenAI Inference", url: "https://api.openai.com" },
  { provider_id: "anthropic-inference", capability: "inference", name: "Anthropic Inference", url: "https://api.anthropic.com" },
  { provider_id: "fireworks-inference", capability: "inference", name: "Fireworks Inference", url: "https://api.fireworks.ai" },
  { provider_id: "together-inference", capability: "inference", name: "Together Inference", url: "https://api.together.ai" },
  { provider_id: "deepinfra-inference", capability: "inference", name: "DeepInfra Inference", url: "https://api.deepinfra.com" },
  { provider_id: "replicate-inference", capability: "inference", name: "Replicate Inference", url: "https://api.replicate.com" },

  // Data
  { provider_id: "perplexity-data", capability: "data", name: "Perplexity Data", url: "https://api.perplexity.ai" },
  { provider_id: "exa-data", capability: "data", name: "Exa Data", url: "https://api.exa.ai" },
  { provider_id: "tavily-data", capability: "data", name: "Tavily Data", url: "https://api.tavily.com" },
  { provider_id: "serpapi-data", capability: "data", name: "SerpAPI Data", url: "https://serpapi.com" },
  { provider_id: "jina-data", capability: "data", name: "Jina Data", url: "https://api.jina.ai" },
  { provider_id: "you-data", capability: "data", name: "You.com Data", url: "https://api.you.com" },
];

async function crawlAndUpsertProviders() {
  console.log(`🔄 Crawling ${providers.length} real x402 providers...`);

  const { error } = await supabase
    .from('providers')
    .upsert(providers, { onConflict: 'provider_id' });

  if (error) console.error('❌ Upsert error:', error);
  else console.log(`✅ Upserted ${providers.length} providers`);
}

crawlAndUpsertProviders().catch(console.error);