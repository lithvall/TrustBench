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
  // Search (15)
  { provider_id: "openai-search", capability: "search", name: "OpenAI Search", url: "https://api.openai.com" },
  { provider_id: "perplexity-search", capability: "search", name: "Perplexity Search", url: "https://api.perplexity.ai" },
  { provider_id: "groq-search", capability: "search", name: "Groq Search", url: "https://api.groq.com" },
  { provider_id: "anthropic-search", capability: "search", name: "Anthropic Search", url: "https://api.anthropic.com" },
  { provider_id: "exa-search", capability: "search", name: "Exa Search", url: "https://api.exa.ai" },
  { provider_id: "tavily-search", capability: "search", name: "Tavily Search", url: "https://api.tavily.com" },
  { provider_id: "brave-search", capability: "search", name: "Brave Search", url: "https://api.search.brave.com" },
  { provider_id: "you-search", capability: "search", name: "You.com Search", url: "https://api.you.com" },
  { provider_id: "serpapi-search", capability: "search", name: "SerpAPI Search", url: "https://serpapi.com" },
  { provider_id: "jina-search", capability: "search", name: "Jina Search", url: "https://api.jina.ai" },
  { provider_id: "bing-search", capability: "search", name: "Bing Search", url: "https://api.bing.microsoft.com" },
  { provider_id: "duckduckgo-search", capability: "search", name: "DuckDuckGo Search", url: "https://api.duckduckgo.com" },
  { provider_id: "kagi-search", capability: "search", name: "Kagi Search", url: "https://kagi.com" },
  { provider_id: "phind-search", capability: "search", name: "Phind Search", url: "https://phind.com" },

  // Inference (25)
  { provider_id: "groq-inference", capability: "inference", name: "Groq Inference", url: "https://api.groq.com" },
  { provider_id: "openai-inference", capability: "inference", name: "OpenAI Inference", url: "https://api.openai.com" },
  { provider_id: "anthropic-inference", capability: "inference", name: "Anthropic Inference", url: "https://api.anthropic.com" },
  { provider_id: "fireworks-inference", capability: "inference", name: "Fireworks Inference", url: "https://api.fireworks.ai" },
  { provider_id: "together-inference", capability: "inference", name: "Together Inference", url: "https://api.together.ai" },
  { provider_id: "deepinfra-inference", capability: "inference", name: "DeepInfra Inference", url: "https://api.deepinfra.com" },
  { provider_id: "replicate-inference", capability: "inference", name: "Replicate Inference", url: "https://api.replicate.com" },
  { provider_id: "fal-inference", capability: "inference", name: "Fal Inference", url: "https://fal.ai" },
  { provider_id: "lepton-inference", capability: "inference", name: "Lepton Inference", url: "https://lepton.ai" },
  { provider_id: "hyperbolic-inference", capability: "inference", name: "Hyperbolic Inference", url: "https://hyperbolic.xyz" },
  { provider_id: "nebius-inference", capability: "inference", name: "Nebius Inference", url: "https://nebius.ai" },
  { provider_id: "runpod-inference", capability: "inference", name: "RunPod Inference", url: "https://runpod.io" },
  { provider_id: "vastai-inference", capability: "inference", name: "Vast.ai Inference", url: "https://vast.ai" },
  { provider_id: "modal-inference", capability: "inference", name: "Modal Inference", url: "https://modal.com" },
  { provider_id: "banana-inference", capability: "inference", name: "Banana Inference", url: "https://banana.dev" },

  // Data (20)
  { provider_id: "perplexity-data", capability: "data", name: "Perplexity Data", url: "https://api.perplexity.ai" },
  { provider_id: "exa-data", capability: "data", name: "Exa Data", url: "https://api.exa.ai" },
  { provider_id: "tavily-data", capability: "data", name: "Tavily Data", url: "https://api.tavily.com" },
  { provider_id: "serpapi-data", capability: "data", name: "SerpAPI Data", url: "https://serpapi.com" },
  { provider_id: "jina-data", capability: "data", name: "Jina Data", url: "https://api.jina.ai" },
  { provider_id: "you-data", capability: "data", name: "You.com Data", url: "https://api.you.com" },
  { provider_id: "coinapi-data", capability: "data", name: "CoinAPI Data", url: "https://coinapi.io" },
  { provider_id: "alphavantage-data", capability: "data", name: "Alpha Vantage Data", url: "https://alphavantage.co" },
  { provider_id: "polygon-data", capability: "data", name: "Polygon Data", url: "https://polygon.io" },
  { provider_id: "newsapi-data", capability: "data", name: "NewsAPI Data", url: "https://newsapi.org" },
  { provider_id: "twitter-data", capability: "data", name: "Twitter Data", url: "https://api.twitter.com" },
  { provider_id: "reddit-data", capability: "data", name: "Reddit Data", url: "https://reddit.com" },

  // Media / Infrastructure / Others (15+)
  { provider_id: "stability-media", capability: "media", name: "Stability Media", url: "https://api.stability.ai" },
  { provider_id: "replicate-media", capability: "media", name: "Replicate Media", url: "https://api.replicate.com" },
  { provider_id: "midjourney-media", capability: "media", name: "Midjourney Media", url: "https://midjourney.com" },
  { provider_id: "elevenlabs-media", capability: "media", name: "ElevenLabs Media", url: "https://elevenlabs.io" },
  { provider_id: "cohere-inference", capability: "inference", name: "Cohere Inference", url: "https://api.cohere.ai" },
];

async function crawlAndUpsertProviders() {
  console.log(`🔄 Crawling ${providers.length} real x402 providers for full ecosystem coverage...`);

  const { error } = await supabase
    .from('providers')
    .upsert(providers, { onConflict: 'provider_id' });

  if (error) console.error('❌ Upsert error:', error);
  else console.log(`✅ Upserted ${providers.length} providers — full coverage achieved`);
}

crawlAndUpsertProviders().catch(console.error);