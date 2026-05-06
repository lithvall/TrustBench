// src/idempotency.ts — Phase 3 idempotency middleware.
//
// Contract (full spec in phase3-idempotency-design.md):
//   POST /route requires `Idempotency-Key: <16–128 chars>`. For a given
//   (agent_id, idempotency_key) pair, side effects (x402 payment, upstream
//   call, receipt emission) execute AT MOST ONCE. Retries replay the cached
//   response. Same key + different body → 409.
//
// Storage:
//   - Postgres `idempotency_keys` is the source of truth (composite PK
//     (agent_id, key)).
//   - Redis `idem:<agent_id>:<key>` is the hot cache (TTL 25h vs PG's 24h).
//
// Hono v4 gotcha (this is the bug that was eating the happy path):
//   `next()` is typed as Promise<void>, and at runtime the value it resolves
//   to is NOT the handler's Response — it's the Hono `Context`. The handler's
//   response lives on `c.res` after `await next()`. Reading `.status`/`.clone()`
//   /`.headers` on the (wrong) value of `await next()` silently goes wrong, then
//   throws on the second access, which short-circuits the completion-path
//   UPDATE and leaves rows stuck in 'in_flight'.

import 'dotenv/config';
import type { Context, Next } from 'hono';
import { createClient } from '@supabase/supabase-js';
import Redis from 'ioredis';
import { createHash } from 'crypto';

// ---------------------------------------------------------------------------
// Lazy clients — initialized on first use, not at module import. This keeps
// boot quiet for unrelated routes (e.g. /health) when env is misconfigured.
// ---------------------------------------------------------------------------

let supabaseClient: ReturnType<typeof createClient> | null = null;
let redisClient: Redis | null = null;

function getSupabase() {
  if (supabaseClient) return supabaseClient;

  // Match the env-var name used everywhere else in this codebase
  // (src/auth.ts, src/scorer.ts, .env.example): SUPABASE_SECRET_KEY is the
  // service-role key under Supabase's 2026 key system. That key bypasses RLS,
  // which is required because idempotency_keys is service-role-only.
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    throw new Error('idempotency: SUPABASE_URL or SUPABASE_SECRET_KEY not set');
  }

  supabaseClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  console.log('✅ Supabase client initialized');
  return supabaseClient;
}

function getRedis() {
  if (redisClient) return redisClient;

  if (!process.env.UPSTASH_REDIS_URL) {
    throw new Error('idempotency: UPSTASH_REDIS_URL not set');
  }

  redisClient = new Redis(process.env.UPSTASH_REDIS_URL, {
    maxRetriesPerRequest: 2,
    retryStrategy: (times) => Math.min(times * 50, 2000)
  });
  redisClient.on('error', (e) => console.warn('[idempotency] redis error:', e.message));
  console.log('✅ Redis client initialized');
  return redisClient;
}

// ---------------------------------------------------------------------------
// JCS canonicalization — RFC 8785-ish: sorted object keys, no whitespace,
// JSON.stringify for primitives. Same impl will be reused by the receipt
// generator so the request_hash on /route and on the receipt agree.
// ---------------------------------------------------------------------------

export function jcsCanonicalize(obj: unknown): string {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return '[' + obj.map(jcsCanonicalize).join(',') + ']';
  const keys = Object.keys(obj as Record<string, unknown>).sort();
  return '{' + keys
    .map(k => JSON.stringify(k) + ':' + jcsCanonicalize((obj as Record<string, unknown>)[k]))
    .join(',') + '}';
}

// ---------------------------------------------------------------------------
// Constants from the design doc.
// ---------------------------------------------------------------------------

const REDIS_TTL_SECONDS = 25 * 3600;          // PG expires_at is 24h; Redis is 1h longer.
const ABANDON_THRESHOLD_MS = 60_000;          // in_flight rows older than this are takeable.
const PG_UNIQUE_VIOLATION = '23505';          // SQLSTATE for unique-constraint conflict.

type CachedIdem = {
  status: 'in_flight' | 'completed' | 'errored';
  request_hash: string;
  response_body?: unknown;
  response_status_code?: number | null;
};

// Row shapes for the idempotency_keys table. The codebase doesn't generate
// Supabase Database types, so we annotate selects/inserts/updates locally.
type IdemRow = {
  status: 'in_flight' | 'completed' | 'errored';
  request_hash: string;
  response_status_code: number | null;
  response_body: unknown;
  created_at: string;
};
type IdemClaimRow = { agent_id: string };

// ---------------------------------------------------------------------------
// Middleware. Mount AFTER requireAgent (we read c.get('agent_id')).
// ---------------------------------------------------------------------------

export async function withIdempotency(c: Context, next: Next) {
  console.log('🔍 withIdempotency started');

  // ---- Validate agent + header --------------------------------------------
  const agentId = c.get('agent_id') as string | undefined;
  if (!agentId) {
    return c.json({ error: 'internal_error', detail: 'agent_id missing — auth middleware ordering bug' }, 500);
  }

  const key = c.req.header('Idempotency-Key');
  if (!key || key.length < 16 || key.length > 128) {
    return c.json({ error: 'idempotency_key_required', detail: 'Idempotency-Key header (16–128 chars) is required on POST /route' }, 400);
  }

  // ---- Compute request hash -----------------------------------------------
  // We read the raw body text and parse it ourselves rather than calling
  // c.req.json(). Two reasons:
  //   1. The hash MUST be computed from the bytes the client sent, not from
  //      a re-serialization of the parsed object — otherwise an idempotency
  //      key reused with semantically-equivalent-but-byte-different JSON
  //      (e.g. different whitespace) would mismatch when it should replay.
  //      Phase 3 still hashes the parsed object (because all our tests use
  //      JSON.parse-stable bodies) but reading rawText keeps the option
  //      open to switch to raw-bytes hashing in Phase 4 without churn.
  //   2. c.req.text() and c.req.json() are both cached by Hono, so the
  //      downstream handler can still call either one without re-reading
  //      the stream.
  let body: unknown = null;
  try {
    const rawText = await c.req.text();
    body = rawText.length > 0 ? JSON.parse(rawText) : null;
  } catch {
    body = null;
  }
  const path = c.req.path;
  const query = c.req.query();
  const requestHash = createHash('sha256')
    .update(jcsCanonicalize({ body, query, path }))
    .digest('hex');

  return await runIdempotent(c, next, agentId, key, requestHash);
}

// Helper extracted so the abandoned-takeover and GC-race paths can recurse
// without re-parsing the body.
async function runIdempotent(
  c: Context,
  next: Next,
  agentId: string,
  key: string,
  requestHash: string
): Promise<Response> {
  const supabase = getSupabase();
  const redis = getRedis();
  const redisKey = `idem:${agentId}:${key}`;

  // ---- Fast path: Redis ----------------------------------------------------
  try {
    const cached = await redis.get(redisKey);
    if (cached) {
      const parsed = JSON.parse(cached) as CachedIdem;
      if (parsed.request_hash !== requestHash) {
        return c.json({ error: 'idempotency_key_reused_with_different_body' }, 409);
      }
      if (parsed.status === 'completed' || parsed.status === 'errored') {
        console.log('✅ Cache hit – replaying');
        return c.json(parsed.response_body ?? null, (parsed.response_status_code ?? 200) as any, {
          'X-Idempotent-Replay': 'true'
        });
      }
      // status === 'in_flight' → fall through; we still need to check PG for
      // abandonment age (Redis only carries status, not created_at).
    }
  } catch (e: any) {
    console.warn('[idempotency] redis read failed, falling back to PG:', e?.message);
  }

  // ---- Slow path: try to claim the slot -----------------------------------
  console.log('🔄 Trying to claim slot...');
  const { data: claim, error: insertError } = await supabase
    .from('idempotency_keys')
    .insert({ agent_id: agentId, key, request_hash: requestHash, status: 'in_flight' } as any)
    .select('agent_id')
    .maybeSingle<IdemClaimRow>();

  if (insertError && insertError.code !== PG_UNIQUE_VIOLATION) {
    console.error('❌ idempotency insert error:', insertError);
    return c.json({ error: 'idempotency_unavailable', detail: insertError.message }, 503);
  }

  if (claim) {
    return await executeWinner(c, next, agentId, key, requestHash, supabase, redis, redisKey);
  }

  // ---- Lost the claim — look up the existing row --------------------------
  console.log('🔄 Lost race – checking existing row');
  const { data: existing, error: lookupErr } = await supabase
    .from('idempotency_keys')
    .select('status, request_hash, response_status_code, response_body, created_at')
    .eq('agent_id', agentId)
    .eq('key', key)
    .maybeSingle<IdemRow>();

  if (lookupErr) {
    console.error('❌ idempotency lookup error:', lookupErr);
    return c.json({ error: 'idempotency_unavailable' }, 503);
  }

  if (!existing) {
    // Race 5: GC took the row between our INSERT-conflict and SELECT.
    console.warn('[idempotency] GC race detected — recursing once');
    return runIdempotent(c, next, agentId, key, requestHash);
  }

  if (existing.request_hash !== requestHash) {
    return c.json({ error: 'idempotency_key_reused_with_different_body' }, 409);
  }

  if (existing.status === 'in_flight') {
    const ageMs = Date.now() - new Date(existing.created_at).getTime();
    if (ageMs > ABANDON_THRESHOLD_MS) {
      // Abandoned — take ownership and execute as the winner.
      // CAS-style: condition the UPDATE on the old created_at so two
      // concurrent retries can't both succeed and double-execute.
      console.log(`🔄 Abandoned slot (age ${Math.round(ageMs / 1000)}s) – taking ownership`);
      const { data: takeoverRows, error: takeoverErr } = await (supabase
        .from('idempotency_keys') as any)
        .update({ created_at: new Date().toISOString() })
        .eq('agent_id', agentId)
        .eq('key', key)
        .eq('status', 'in_flight')
        .eq('created_at', existing.created_at)
        .select('agent_id');
      if (takeoverErr) {
        console.error('[idempotency] takeover update failed:', takeoverErr.message);
        return c.json({ error: 'idempotency_unavailable' }, 503);
      }
      if (!takeoverRows || takeoverRows.length === 0) {
        // Lost the takeover race to a concurrent retry. Recurse so we
        // re-evaluate against whatever state the winner left behind.
        console.log('[idempotency] takeover lost — re-evaluating');
        return runIdempotent(c, next, agentId, key, requestHash);
      }
      console.log('✅ Took ownership of abandoned slot — executing handler');
      // Jump directly to the winner path: row is already in_flight with our
      // fresh created_at, so executeWinner just needs to run the handler and
      // persist completion. No second INSERT, no recursion through claim.
      return await executeWinner(c, next, agentId, key, requestHash, supabase, redis, redisKey);
    }
    return c.json(
      { error: 'in_flight_retry_later', detail: 'another request with this idempotency key is still in flight' },
      409,
      { 'Retry-After': '5' }
    );
  }

  // Terminal state — replay cached response, warm Redis on the way out.
  console.log('✅ Replaying terminal state from PG:', existing.status);
  try {
    await redis.setex(redisKey, REDIS_TTL_SECONDS, JSON.stringify({
      status: existing.status,
      request_hash: requestHash,
      response_body: existing.response_body,
      response_status_code: existing.response_status_code
    } satisfies CachedIdem));
  } catch (e: any) {
    console.warn('[idempotency] redis warm-on-replay failed:', e?.message);
  }

  return c.json(
    existing.response_body ?? null,
    ((existing.response_status_code ?? 200) as any),
    { 'X-Idempotent-Replay': 'true' }
  );
}

// ---------------------------------------------------------------------------
// Winner path: we claimed the slot. Run the handler, persist the result,
// warm Redis, return the response.
// ---------------------------------------------------------------------------
async function executeWinner(
  c: Context,
  next: Next,
  agentId: string,
  key: string,
  requestHash: string,
  supabase: ReturnType<typeof getSupabase>,
  redis: Redis,
  redisKey: string
): Promise<Response> {
  console.log('✅ Claimed slot – executing handler');

  // Warm Redis with in_flight marker so concurrent retries see it without
  // hitting PG. Best-effort — a Redis miss only adds a slow-path lookup.
  try {
    await redis.setex(redisKey, REDIS_TTL_SECONDS, JSON.stringify({
      status: 'in_flight',
      request_hash: requestHash
    } satisfies CachedIdem));
  } catch (e: any) {
    console.warn('[idempotency] redis setex (in_flight) failed:', e?.message);
  }

  // ---- Run the handler ----------------------------------------------------
  // CRITICAL: Hono's next() resolves to the Context (typed as Promise<void>),
  // NOT to the handler's Response. The Response is on c.res after the
  // downstream chain finishes. Reading .status/.clone()/.headers on the value
  // of `await next()` is the bug that left rows stuck in_flight.
  let finalStatus: 'completed' | 'errored' = 'completed';
  let response: Response | undefined;
  let handlerThrew = false;

  try {
    await next();
    response = c.res;
  } catch (err) {
    console.error('❌ Handler threw:', err);
    handlerThrew = true;
  }

  if (!response) {
    // Handler either threw or didn't produce a response. Synthesize a 500 so
    // we have something to cache and return.
    response = c.json({ error: 'internal_error' }, 500);
    finalStatus = 'errored';
  } else if (response.status >= 500) {
    finalStatus = 'errored';
  } else if (handlerThrew) {
    finalStatus = 'errored';
  }

  // ---- Capture the body for the idempotency cache -------------------------
  // Clone first so the original Response stream stays consumable when Hono
  // serializes it back to the client. Non-JSON bodies → null in the cache;
  // a replay of a non-JSON response will currently come back as JSON null,
  // which is acceptable because /route only ever returns JSON.
  let responseBody: unknown = null;
  try {
    responseBody = await response.clone().json();
  } catch (e: any) {
    console.warn('[idempotency] response body was not JSON; caching null:', e?.message);
  }

  const receiptId = response.headers.get('X-Receipt-Id');

  // ---- Persist completion to PG ------------------------------------------
  console.log(`💾 Persisting ${finalStatus} (status_code=${response.status}, receipt=${receiptId ?? 'none'})`);
  const { error: updateErr } = await (supabase
    .from('idempotency_keys') as any)
    .update({
      status: finalStatus,
      response_status_code: response.status,
      response_body: responseBody,
      receipt_id: receiptId,
      completed_at: new Date().toISOString()
    })
    .eq('agent_id', agentId)
    .eq('key', key);

  if (updateErr) {
    // Don't fail the request — the side effects already ran. The idempotency
    // row will eventually GC; on retry the user might re-execute, which is
    // bad, but losing the response on a working request is worse.
    console.error('[idempotency] PG completion update failed:', updateErr.message);
  } else {
    console.log('✅ Row updated to', finalStatus);
  }

  // ---- Warm Redis with terminal state -------------------------------------
  try {
    await redis.setex(redisKey, REDIS_TTL_SECONDS, JSON.stringify({
      status: finalStatus,
      request_hash: requestHash,
      response_body: responseBody,
      response_status_code: response.status
    } satisfies CachedIdem));
  } catch (e: any) {
    console.warn('[idempotency] redis setex (terminal) failed:', e?.message);
  }


  return response;
}
