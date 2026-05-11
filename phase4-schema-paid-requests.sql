-- ============================================================================
-- TrustBench Phase 4 v0.1.0 paywall — paid_requests table
-- ============================================================================
-- Apply on top of phase3-schema.sql + phase3-schema-quotes.sql +
-- phase4-schema-spend-cap-reservation.sql.
--
-- Sprint Day 1 deliverable per phase4-listing-plan.md § 2 Day 1.
-- Schema anchored on phase4-paywall-design.md § Q10. Two intentional
-- deviations from the design doc, justified below.
--
-- Purpose: revenue tracking for paywalled /route calls. Every successful
-- paid call (TrustBench fee settled on-chain via x402 facilitator) writes
-- one row. This table is ALSO the dogfood for the future /compliance-export
-- endpoint (v0.3.0): same data + signed-bundle format that integrators will
-- eventually pay for.
--
-- Deviation 1 — idempotency index is COMPOUND (agent_address, idempotency_key),
-- not single-column (idempotency_key). Q10 specifies the single-column
-- variant but Q4's security reasoning and § 7's first failure-mode mitigation
-- both explicitly require the compound namespacing: "idempotency table key is
-- (agent_address, idempotency_key), not idempotency_key alone. Keys are
-- namespaced per paying wallet." Going with the security-driven shape — a
-- single-column index would let two different paying wallets collide on the
-- same key and one could see the other's cached response. Documented in the
-- design doc at Q4 ("edge case to design around") and § 7 ("Idempotency key
-- collision" mitigation).
--
-- Deviation 3 — added `response_body jsonb` column not in Q10's spec. Required
-- for the Q4 idempotency-key replay flow: "same key + same body hash within
-- 24h → return cached response." Without response_body persisted, the cached
-- "response" would be only the side-info we already store (tx_hash, signature),
-- not the byte-identical envelope the agent originally received. A re-derived
-- response could diverge if rankings shifted between the original call and the
-- retry — that's an idempotency-contract violation. Cost is small: the routing
-- envelope is ~1-2 KB, stored as jsonb. RLS still gates anon access.
--
-- Deviation 2 — RLS is service-role-only, NOT the JWT-claim-wallet policy
-- shown in Q10. Reason: Q10's `current_setting('request.jwt.claim.wallet')`
-- policy assumes Supabase's PostgREST + JWT auth with a wallet claim.
-- TrustBench's Phase 3 stack uses argon2id-hashed API keys, not Supabase JWTs.
-- The Q10 policy would compile and apply but enforce nothing — no JWT means
-- the policy's USING clause always returns false → no rows readable → the
-- policy is dead code. Worse: it would falsely *look* secure to a reviewer.
-- Conservative shape: service-role-full (matches phase3-schema.sql's pattern
-- for every other agent-scoped table). Public read of paid_requests is
-- deferred until either (a) SIWx session JWTs land, or (b) /compliance-export
-- ships as the curated read endpoint and exposes a service-role-mediated view.
--
-- Failure modes if this migration is wrong (or runs partially):
--   - Table missing → paywall middleware INSERT fails → middleware should
--     refuse to settle and return 500. NEVER settle without being able to
--     write the audit row.
--   - Index missing → idempotency lookup falls back to full table scan.
--     Performance degrades but no correctness/security regression.
--   - RLS not enabled → paid_requests rows would be readable by anon role.
--     For v0.1.0 the table is service-role-only-written anyway, but RLS
--     left off would mean any future direct-Supabase-client read could leak
--     cross-agent data. Belt-and-suspenders: enable RLS even though the
--     practical readers all go through the TrustBench server.
--
-- Idempotent: rerun-safe via IF NOT EXISTS guards.
-- ============================================================================

-- 1. paid_requests table
create table if not exists paid_requests (
  id uuid primary key default gen_random_uuid(),
  endpoint text not null,                  -- e.g. '/route'
  agent_address text not null,             -- the x402 paying wallet (lowercase 0x...)
  tx_hash text,                            -- on-chain settlement tx (Base)
  block_number bigint,                     -- best-effort enrichment
  amount_usdc numeric(20, 6) not null,     -- the fee paid (USD-denominated, 6 decimals)
  request_payload_hash text,               -- sha256 of canonical request body (we do NOT store the body)
  response_signature text,                 -- Ed25519 signature when the response is signed, null otherwise
  response_body jsonb,                     -- full response envelope (jsonb), cached for idempotency-key replay (see header Deviation 3)
  idempotency_key text,                    -- nullable; only set when the caller provided Idempotency-Key
  created_at timestamptz default now()
);

-- 2. Indexes for the queries we'll actually run.
--
-- (a) per-agent history, newest-first. Drives /compliance-export's agent
-- filter AND any future per-agent rate or anomaly check.
create index if not exists paid_requests_agent_created_idx
  on paid_requests (agent_address, created_at desc);

-- (b) per-endpoint history, newest-first. Drives the operator/dashboard
-- view "what's been paid for on /route in the last N days" and the daily
-- reconciliation report ("how many rows in the last 24h, how many cents
-- of revenue").
create index if not exists paid_requests_endpoint_created_idx
  on paid_requests (endpoint, created_at desc);

-- (c) idempotency-key dedup lookup. COMPOUND (agent_address, idempotency_key)
-- per Q4 + § 7 — single-column would allow cross-agent cache-hit collision.
-- Partial on idempotency_key IS NOT NULL because the column is nullable and
-- most rows will have a key but a small minority won't (degenerate clients
-- that omit the header). Partial index keeps the touch set tight.
create index if not exists paid_requests_idempotency_idx
  on paid_requests (agent_address, idempotency_key)
  where idempotency_key is not null;

-- 3. RLS — service-role-only (see header comment Deviation 2).
alter table paid_requests enable row level security;

create policy "Service role full" on paid_requests
  for all using (auth.role() = 'service_role');

select '✅ Phase 4 v0.1.0 paid_requests schema ready' as status;
