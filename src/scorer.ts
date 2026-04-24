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

  const { data } = await supabase
    .from('scorecards')
    .select('*')
    .eq('capability', capability)
    .order('score', { ascending: false });

  // Sign every scorecard for tamper-proofing
  const signedData = data?.map(scorecard => signScorecard(scorecard)) || [];

  await redis.set(cacheKey, JSON.stringify(signedData), 'EX', 300); // 5 min cache
  return signedData;
}

// Simple HMAC signature for compliance / tamper-evidence
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