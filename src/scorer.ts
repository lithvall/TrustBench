// src/scorer.ts
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { Redis } from 'ioredis';
import crypto from 'crypto';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const redis = new Redis(process.env.UPSTASH_REDIS_URL!, {
  maxRetriesPerRequest: null,
  retryStrategy: (times) => Math.min(times * 50, 2000)
});

redis.on('error', () => console.log('⚠️ Redis connection lost – falling back to DB'));

export async function getRankings(capability: string) {
  const cacheKey = `rankings:${capability}`;
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached);

  // Join ALL seeded providers with their latest scorecard (if any)
  const { data } = await supabase
    .from('providers')
    .select(`
      provider_id,
      capability,
      name,
      scorecards!left (
        score,
        latency_p50,
        latency_p95,
        uptime_7d,
        last_updated
      )
    `)
    .eq('capability', capability);

  const processed = data?.map(p => {
    const scorecard = p.scorecards?.[0] || {};
    return {
      id: scorecard.id || null,
      provider_id: p.provider_id,
      capability: p.capability,
      name: p.name,
      score: scorecard.score ?? 40,           // default fallback
      latency_p50: scorecard.latency_p50 ?? 9999,
      latency_p95: scorecard.latency_p95 ?? 9999,
      uptime_7d: scorecard.uptime_7d ?? 50,
      last_updated: scorecard.last_updated || new Date().toISOString(),
      signature: scorecard.score ? signScorecard(scorecard).signature : null
    };
  }).sort((a, b) => b.score - a.score) || [];

  await redis.set(cacheKey, JSON.stringify(processed), 'EX', 300);
  return processed;
}

export function signScorecard(scorecard: any) {
  const payload = JSON.stringify({
    provider_id: scorecard.provider_id,
    capability: scorecard.capability,
    score: scorecard.score,
    latency_p50: scorecard.latency_p50,
    last_updated: scorecard.last_updated
  });

  const signature = crypto
    .createHmac('sha256', process.env.SIGNING_SECRET || 'trustbench-default-key')
    .update(payload)
    .digest('hex');

  return { ...scorecard, signature };
}