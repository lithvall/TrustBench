// scripts/mark-verified.ts
//
// One-off operational script to flip `x402_verified=true` on a single
// provider row in the registry, then invalidate the corresponding rankings
// cache key so the change is immediately visible to /route's provider
// selector.
//
// Why this exists (2026-05-12): the registry-conformance v0.2.0 work has
// not shipped yet, so providers in the live registry are scored by HEAD-probe
// liveness only — the empirical bit `x402_verified` (set via direct POST {}
// probe confirming a valid x402 v2 challenge body) is only flipped at
// crawler-seed time. CoinMarketCap's `/x402/v1/dex/search` was live-probed
// 2026-05-12 during Path P (phase4-bazaar-handoff-2026-05-11.md § Step P2)
// and confirmed conformant (402 + valid accepts[0] on Base/eip155:8453 with
// USDC payTo). This script captures that ground truth in the registry so
// the selector promotes CMC to rank 1 in the `data` capability and Path P3
// (real /route settle) can proceed.
//
// Usage (from PowerShell, on Windows side):
//   $env:SUPABASE_URL='...'
//   $env:SUPABASE_SERVICE_ROLE_KEY='...'
//   $env:UPSTASH_REDIS_URL='...'
//   npx tsx scripts/mark-verified.ts <url> <capability> <verified_method>
//
// Or read env from .env (default behavior):
//   npx tsx scripts/mark-verified.ts <url> <capability> <verified_method>
//
// Example for today's Path P:
//   npx tsx scripts/mark-verified.ts `
//     "https://pro-api.coinmarketcap.com/x402/v1/dex/search" `
//     "data" `
//     "manual-post-probe-2026-05-12"
//
// Safety: this is reversible. To clear the bit, run with verified_method='unset'
// — handler below treats that as a clear-flag signal.

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { Redis } from 'ioredis';

const args = process.argv.slice(2);
if (args.length < 3) {
  console.error('Usage: tsx scripts/mark-verified.ts <url> <capability> <verified_method>');
  console.error('       verified_method="unset" to clear the flag.');
  process.exit(1);
}
const [url, capability, verifiedMethod] = args;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const UPSTASH_REDIS_URL = process.env.UPSTASH_REDIS_URL;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !UPSTASH_REDIS_URL) {
  console.error('Missing env: need SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY + UPSTASH_REDIS_URL');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

async function main() {
  // 1. Read current metadata so we merge correctly (don't clobber other keys).
  const { data: existing, error: readErr } = await supabase
    .from('providers')
    .select('url, capability, metadata')
    .eq('url', url)
    .single();

  if (readErr || !existing) {
    console.error(`Failed to find provider with url=${url}:`, readErr?.message || 'not found');
    process.exit(1);
  }

  console.log(`Found provider: url=${existing.url} capability=${existing.capability}`);
  console.log(`  Current metadata keys: ${Object.keys(existing.metadata || {}).join(', ') || '(none)'}`);
  console.log(`  Current x402_verified: ${existing.metadata?.x402_verified ?? '(unset)'}`);

  // 2. Build the updated metadata jsonb.
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  let newMetadata: Record<string, unknown>;
  if (verifiedMethod === 'unset') {
    // Clear the flag triplet but keep other metadata keys intact.
    const { x402_verified, x402_verified_at, x402_verified_method, ...rest } = existing.metadata || {};
    newMetadata = rest;
    console.log(`  → Clearing x402_verified triplet.`);
  } else {
    newMetadata = {
      ...(existing.metadata || {}),
      x402_verified: true,
      x402_verified_at: today,
      x402_verified_method: verifiedMethod,
    };
    console.log(`  → Setting x402_verified=true, x402_verified_at=${today}, x402_verified_method=${verifiedMethod}`);
  }

  // 3. Update the row.
  const { error: writeErr } = await supabase
    .from('providers')
    .update({ metadata: newMetadata })
    .eq('url', url);

  if (writeErr) {
    console.error(`Update failed:`, writeErr.message);
    process.exit(1);
  }
  console.log(`  ✓ providers row updated.`);

  // 4. Invalidate the rankings cache for the affected capability so the
  //    change is immediately visible to /route. Cache key per scorer.ts:86.
  const redis = new Redis(UPSTASH_REDIS_URL, { lazyConnect: false });
  const cacheKey = `rankings:v5:${capability}`;
  const deleted = await redis.del(cacheKey);
  console.log(`  ✓ Redis cache invalidated: del ${cacheKey} → ${deleted} key(s) removed.`);

  await redis.quit();

  console.log(`\nDone. Next call to /rankings?capability=${capability} will rebuild the cache from DB.`);
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
