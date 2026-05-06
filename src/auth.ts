// src/auth.ts — API-key auth middleware for Phase 3 protected routes.
//
// Header convention:
//   Authorization: Bearer tb_live_<32-char-base32-Crockford>
//   Authorization: Bearer tb_test_<...>
//
// Verification path (decided in phase3-agent-identity.md):
//   1. Parse the Bearer token. Reject 401 on missing / wrong scheme / wrong shape.
//   2. Take the first 12 chars as `key_prefix` (indexed in api_keys).
//      The prefix is plaintext — it leaks ~60 bits but the rest of the key
//      stays secret and the prefix is what makes O(1) lookup possible without
//      scanning the table or revealing the secret.
//   3. Pull every active candidate (revoked_at IS NULL) with that prefix.
//      In practice prefix collisions are ~impossible (the secret body has
//      ~140 bits of entropy after the 8-char `tb_*_` prefix), so the candidate
//      set is almost always size 1. We loop anyway for correctness.
//   4. argon2id-verify the full token against each candidate's key_hash.
//      Constant-time per verify, and we early-return on first match.
//   5. On match: attach { agent_id, mode, agent_metadata, agent_caps } to the
//      Hono context, fire-and-forget bump last_used_at, then `await next()`.
//   6. On no match / revoked / verify-throws: 401.
//
// Security notes:
//   - We never log the plaintext token or the full hash.
//   - We never branch fast on prefix-collision count — that would expose a
//     timing oracle for prefix existence. The key_prefix lookup is already
//     a public-leak by design (it's the index), so this is a defense in depth.
//   - Argon2id is memory-hard. With one or two candidates per request the
//     extra cost is bounded; if a deployment ever sees high prefix-collision
//     traffic we'd add per-prefix rate limiting upstream.

import { createMiddleware } from 'hono/factory';
import { createClient } from '@supabase/supabase-js';
import * as argon2 from '@node-rs/argon2';

// Reuse the same env-var convention the rest of the codebase uses (see
// src/scorer.ts). SUPABASE_SECRET_KEY is the service-role key in the new
// Supabase 2026 key system — it bypasses RLS, which we need because the
// api_keys table is service-role-only.
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

// ---------------------------------------------------------------------------
// Hono context typing — declares the variables this middleware sets so route
// handlers downstream get type-safe c.get('agent_id') etc.
// ---------------------------------------------------------------------------

export type AgentMode = 'live' | 'test';

// Spend-cap snapshot loaded once per request alongside the agent row.
// Read by `requireWithinSpendCap` (src/spend-caps.ts). All atomic-unit
// fields are strings — see phase3-spend-caps.md for the BigInt-only rule.
export type AgentCaps = {
  per_call_atomic: string | null;            // null = no per-call cap
  rolling_atomic: string | null;             // null = no rolling cap
  rolling_window_minutes: number;            // window for the rolling cap
  currency: string;                          // Phase 3: must be 'USDC'
};

export type AgentContext = {
  Variables: {
    agent_id: string;
    agent_mode: AgentMode;
    agent_metadata: Record<string, unknown>;
    api_key_id: string;
    agent_caps: AgentCaps;                   // set by requireAgent
    max_price_atomic: string;                // set by requireWithinSpendCap
  };
};

// ---------------------------------------------------------------------------
// Token shape validation. Cheap rejection so we don't pay an argon2 verify
// for obvious garbage (`Bearer hello`, `Bearer ` + an empty string, etc).
// ---------------------------------------------------------------------------

const KEY_RE = /^tb_(live|test)_[0-9A-HJKMNP-TV-Z]{32}$/;
//                       ^^^^^^^^^^^^^^^^^^^^^^^^^^^^
// Crockford Base32 alphabet (uppercase): 0-9, A-Z minus I, L, O, U.
// 32 chars body + 8 chars prefix = 40 chars total.

function parseBearer(authHeader: string | undefined): string | null {
  if (!authHeader) return null;
  const m = /^Bearer\s+(\S+)$/.exec(authHeader);
  if (!m) return null;
  const token = m[1];
  return KEY_RE.test(token) ? token : null;
}

// ---------------------------------------------------------------------------
// Middleware. Use `requireAgent` on any route that should be agent-scoped.
// ---------------------------------------------------------------------------

type ApiKeyRow = {
  id: string;
  agent_id: string;
  key_hash: string;
  mode: AgentMode;
  // revoked_at not selected — the WHERE clause already filters it.
};

type AgentRow = {
  id: string;
  mode: AgentMode;
  metadata: Record<string, unknown> | null;
  spend_cap_per_call_atomic: string | null;
  spend_cap_rolling_atomic: string | null;
  spend_cap_rolling_window_minutes: number;
  spend_cap_currency: string;
};

export const requireAgent = createMiddleware<AgentContext>(async (c, next) => {
  const token = parseBearer(c.req.header('authorization'));
  if (!token) {
    return c.json({ error: 'unauthorized', detail: 'missing or malformed Bearer token' }, 401);
  }

  const keyPrefix = token.slice(0, 12);

  // 1. Pull active candidates by prefix. Index `idx_api_keys_prefix` is
  //    partial on `where revoked_at is null`, so this is one index probe.
  const { data: candidates, error: lookupErr } = await supabase
    .from('api_keys')
    .select('id, agent_id, key_hash, mode')
    .eq('key_prefix', keyPrefix)
    .is('revoked_at', null)
    .returns<ApiKeyRow[]>();

  if (lookupErr) {
    console.error('[auth] api_keys lookup failed:', lookupErr.message);
    return c.json({ error: 'auth_unavailable' }, 503);
  }
  if (!candidates || candidates.length === 0) {
    return c.json({ error: 'unauthorized' }, 401);
  }

  // 2. argon2id-verify against each candidate. Early return on first match.
  //    `argon2.verify` is constant-time per call.
  let matched: ApiKeyRow | null = null;
  for (const row of candidates) {
    try {
      const ok = await argon2.verify(row.key_hash, token);
      if (ok) {
        matched = row;
        break;
      }
    } catch (e) {
      // A malformed hash should not blow up the request; log and treat as no-match.
      console.error('[auth] argon2 verify threw for api_keys.id=%s:', row.id, e);
    }
  }

  if (!matched) {
    return c.json({ error: 'unauthorized' }, 401);
  }

  // 3. Pull the agent row to get metadata + the canonical mode + spend caps.
  //    We trust api_keys.mode for routing-pool selection (so a leaked test
  //    key cannot suddenly hit live providers if its agent is flipped to
  //    live), but we still need agents.metadata for downstream policy and
  //    the four cap columns for src/spend-caps.ts. One round-trip — the
  //    spend-cap middleware does NOT re-read this row.
  const { data: agent, error: agentErr } = await supabase
    .from('agents')
    .select('id, mode, metadata, spend_cap_per_call_atomic, spend_cap_rolling_atomic, spend_cap_rolling_window_minutes, spend_cap_currency')
    .eq('id', matched.agent_id)
    .single<AgentRow>();

  if (agentErr || !agent) {
    console.error('[auth] agent lookup failed for api_key.id=%s:', matched.id, agentErr?.message);
    return c.json({ error: 'auth_unavailable' }, 503);
  }

  // 4. Attach to context. agent_caps is a denormalized snapshot of the four
  //    spend-cap columns; src/spend-caps.ts reads from this, not the DB.
  c.set('agent_id', agent.id);
  c.set('agent_mode', matched.mode); // mode is keyed off the api_key, not the agent
  c.set('agent_metadata', agent.metadata ?? {});
  c.set('api_key_id', matched.id);
  c.set('agent_caps', {
    per_call_atomic: agent.spend_cap_per_call_atomic,
    rolling_atomic: agent.spend_cap_rolling_atomic,
    rolling_window_minutes: agent.spend_cap_rolling_window_minutes,
    currency: agent.spend_cap_currency,
  });

  // 5. Fire-and-forget last_used_at bump. We don't await — a slow write
  //    shouldn't add latency to the route, and a failure is a metrics blip,
  //    not a security failure.
  void supabase
    .from('api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', matched.id)
    .then(({ error }) => {
      if (error) console.warn('[auth] last_used_at bump failed:', error.message);
    });

  await next();
});
