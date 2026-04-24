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

  // Get ALL seeded providers for this capability
  const { data: providers } = await supabase
    .from('providers')
    .select('provider_id, capability, name')
    .eq('capability', capability);

  // Get existing scorecards for this capability
  const { data: scorecards } = await supabase
    .from('scorecards')
    .select('*')
    .eq('capability', capability);

  const scorecardMap = new Map(scorecards?.map(s => [s.provider_id, s]) || []);

  const processed = providers?.map(p => {
    const s = scorecardMap.get(p.provider_id) || {};
    return {
      id: s.id || null,
      provider_id: p.provider_id,
      capability: p.capability,
      name: p.name || p.provider_id,
      score: s.score ?? 40,
      latency_p50: s.latency_p50 ?? 9999,
      latency_p95: s.latency_p95 ?? 9999,
      uptime_7d: s.uptime_7d ?? 50,
      last_updated: s.last_updated || new Date().toISOString(),
      signature: s.score ? signScorecard(s).signature : null
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