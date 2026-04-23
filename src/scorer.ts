import { createClient } from '@supabase/supabase-js';
import Redis from 'ioredis';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }
);

// Robust Redis client optimized for Upstash (free tier works perfectly)
const redis = new Redis(process.env.UPSTASH_REDIS_URL!, {
  maxRetriesPerRequest: null,        // ← stops the MaxRetriesPerRequestError spam
  retryStrategy: (times: number) => {
    if (times > 5) return null;      // give up after 5 attempts
    return Math.min(times * 100, 3000); // backoff: 100ms → 200ms → ...
  },
  enableReadyCheck: false,
  lazyConnect: true,                 // connect only when first used
});

// Graceful error handling so Redis issues never crash the server
redis.on('error', (err) => {
  if (err.message.includes('ECONNRESET') || err.message.includes('ENOTFOUND')) {
    console.warn('⚠️ Redis connection warning (will fallback to Supabase):', err.message);
  } else {
    console.error('Redis error:', err);
  }
});

export async function getRankings(capability: 'search' | 'inference' | 'data', limit = 10) {
  const cacheKey = `rankings:${capability}:${limit}`;

  // Try Redis first with fallback
  let cached: string | null = null;
  try {
    cached = await redis.get(cacheKey);
  } catch (err) {
    console.warn('Redis get failed, falling back to Supabase');
  }

  if (cached) {
    try {
      return JSON.parse(cached);
    } catch {}
  }

  // Fallback: direct Supabase query (always works)
  const { data, error } = await supabase
    .from('scorecards')
    .select('*')
    .eq('capability', capability)
    .order('score', { ascending: false })
    .limit(limit);

  if (error) throw error;

  // Cache only if Redis is healthy
  try {
    await redis.setex(cacheKey, 300, JSON.stringify(data));
  } catch {
    // silent fail - we already have the data
  }

  return data;
}

export async function getProviderScore(providerId: string) {
  const { data } = await supabase
    .from('scorecards')
    .select('*')
    .eq('provider_id', providerId)
    .single();
  
  return data;
}