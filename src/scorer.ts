import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function getRankings(capability: string = 'search', limit: number = 10) {
  console.log(`📊 [TrustBench] Getting rankings for ${capability}, limit ${limit}`);

  const { data, error } = await supabase
    .from('scorecards')
    .select('*')
    .eq('capability', capability)
    .order('score', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('❌ Supabase rankings error:', error);
    throw error;
  }

  return data || [];
}

export async function getProviderScore(providerId: string, capability: string) {
  const { data } = await supabase
    .from('scorecards')
    .select('score, latency_p50, uptime_7d, last_updated')
    .eq('provider_id', providerId)
    .eq('capability', capability)
    .single();

  return data || {
    score: 0,
    latency_p50: 999,
    uptime_7d: 0,
    last_updated: new Date().toISOString()
  };
}