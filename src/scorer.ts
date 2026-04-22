import { createClient } from '@supabase/supabase-js';
import Redis from 'ioredis';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const redis = new Redis(process.env.UPSTASH_REDIS_URL!);

export async function getRankings(capability: string, limit = 10) {
  const cacheKey = `rankings:${capability}:${limit}`;
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached);

  const { data, error } = await supabase
    .from('scorecards')
    .select('*')
    .eq('capability', capability)
    .order('score', { ascending: false })
    .limit(limit);

  if (error) throw error;

  await redis.setex(cacheKey, 300, JSON.stringify(data || []));
  return data || [];
}