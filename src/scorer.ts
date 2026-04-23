import 'dotenv/config';
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

const redis = new Redis(process.env.UPSTASH_REDIS_URL!, {
  maxRetriesPerRequest: null,
  retryStrategy: (times: number) => (times > 5 ? null : Math.min(times * 100, 3000)),
  enableReadyCheck: false,
  lazyConnect: true,
});

redis.on('error', (err: any) => {
  console.warn('⚠️ Redis warning (fallback active):', err.message);
});

export async function getRankings(capability: 'search' | 'inference' | 'data', limit = 10) {
  const cacheKey = `rankings:${capability}:${limit}`;

  let cached: string | null = null;
  try {
    cached = await redis.get(cacheKey);
  } catch {}

  if (cached) {
    try { return JSON.parse(cached); } catch {}
  }

  const { data, error } = await supabase
    .from('scorecards')
    .select('*')
    .eq('capability', capability)
    .order('score', { ascending: false })
    .limit(limit);

  if (error) throw error;

  try {
    await redis.setex(cacheKey, 300, JSON.stringify(data));
  } catch {}

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