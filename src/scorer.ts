import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import Redis from 'ioredis';   // ← This is the correct ESM import

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const redis = new Redis(process.env.UPSTASH_REDIS_URL!, {
  maxRetriesPerRequest: 3,
  retryStrategy: (times) => Math.min(times * 50, 2000),
});

// Simple in-memory fallback if Redis fails
let cache: Map<string, any> = new Map();

export async function getRankings(capability: string = 'search', limit: number = 10) {
  const cacheKey = `rankings:${capability}:${limit}`;

  // Try Redis first
  try {
    const cached = await redis.get(cacheKey);
    if (cached) return JSON.parse(cached);
  } catch (e) {
    console.warn('Redis cache miss, using memory fallback');
  }

  // Fallback to Supabase
  const { data, error } = await supabase
    .from('scorecards')
    .select('*')
    .eq('capability', capability)
    .order('score', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Supabase error:', error);
    throw error;
  }

  const results = data || [];

  // Cache for 5 minutes
  try {
    await redis.setex(cacheKey, 300, JSON.stringify(results));
  } catch (e) {
    // Memory fallback
    cache.set(cacheKey, results);
    setTimeout(() => cache.delete(cacheKey), 300000);
  }

  return results;
}

export async function getProviderScore(providerId: string, capability: string) {
  const { data } = await supabase
    .from('scorecards')
    .select('score, latency_p50, uptime_7d')
    .eq('provider_id', providerId)
    .eq('capability', capability)
    .single();

  return data || { score: 0, latency_p50: 999, uptime_7d: 0 };
}