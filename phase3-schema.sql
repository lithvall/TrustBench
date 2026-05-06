-- ============================================================================
-- TrustBench Phase 3 — Schema additions
-- ============================================================================
-- Apply on top of schema.sql. These tables add the substrate for the four
-- Phase 3 primitives (idempotency, hard spend caps, signed receipts, queryable
-- audit) plus the agent identity model decided in phase3-agent-identity.md.
--
-- Conventions inherited from schema.sql:
--   - uuid PKs via gen_random_uuid() where the ID is internal/system-issued
--   - text PKs where the ID is presentation-facing (matches scorecards.provider_id
--     using url-as-key, and receipts.id using the full prefixed ULID)
--   - timestamptz with default now()
--   - RLS enabled with "Public read" (where safe) + "Service role full"
--   - bigserial for high-volume append-only tables (matches probes)
--
-- Apply order: agents → api_keys → idempotency_keys → receipts.
-- Receipts has no FK from idempotency_keys (the FK goes the other way) so the
-- order is enforced by FK direction, not by this comment.
-- ============================================================================

create extension if not exists "uuid-ossp";

-- ----------------------------------------------------------------------------
-- 1. agents
-- ----------------------------------------------------------------------------
-- One row per builder/agent. The unit that spend caps and rate limits attach
-- to. Agents may have multiple api_keys (graceful rotation).
--
-- Spend caps are stored as atomic-unit strings (USDC has 6 decimals; a $0.10
-- cap is "100000"). String storage avoids JS number-precision issues and
-- matches the receipt wire format.
-- ----------------------------------------------------------------------------
create table agents (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,                          -- billing/contact
  display_name text,                                   -- shown in dashboards
  mode text not null default 'test'
    check (mode in ('live', 'test')),                  -- gates routing pool

  -- Spend caps (NULL = no cap; cap-per-call is in addition to the per-request
  -- max_price the agent supplies on /route).
  spend_cap_per_call_atomic text,                      -- e.g. "10000" = $0.01
  spend_cap_rolling_atomic text,                       -- e.g. "1000000" = $1.00
  spend_cap_rolling_window_minutes int not null default 60,
  spend_cap_currency text not null default 'USDC',

  -- Rate limit (per active api_key). 60/min is the default starting point.
  rate_limit_per_min int not null default 60,

  metadata jsonb default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_agents_email on agents(email);

-- ----------------------------------------------------------------------------
-- 2. api_keys
-- ----------------------------------------------------------------------------
-- Hashed API keys. Plaintext is shown to the user once at creation and never
-- stored. Lookup path is prefix-indexed → argon2id-verify candidates.
--
-- Format of the plaintext key: tb_live_<32-char-base32-Crockford>  (40 total)
--                              tb_test_<32-char-base32-Crockford>
-- key_prefix stores the first 8 characters (tb_live_ or tb_test_ + 0 of body).
-- Actually we store the FIRST 12 chars so the prefix carries enough entropy
-- to make collision lookups O(1) in practice without revealing the secret.
-- ----------------------------------------------------------------------------
create table api_keys (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references agents(id) on delete cascade,
  key_prefix text not null,                            -- first 12 chars, plaintext, indexed
  key_hash text not null,                              -- argon2id(full_key)
  mode text not null check (mode in ('live', 'test')),
  label text,                                          -- e.g. "production-1", "ci"
  created_at timestamptz default now(),
  last_used_at timestamptz,
  revoked_at timestamptz                               -- NULL = active
);

create index idx_api_keys_prefix on api_keys(key_prefix) where revoked_at is null;
create index idx_api_keys_agent on api_keys(agent_id);

-- ----------------------------------------------------------------------------
-- 3. idempotency_keys
-- ----------------------------------------------------------------------------
-- Postgres write-through for the idempotency layer. Redis is the hot cache
-- (sub-ms lookup); Postgres is the source of truth so a Redis flush cannot
-- enable a double-charge.
--
-- PK is composite (agent_id, key) — different agents can use overlapping
-- key strings without colliding.
--
-- status lifecycle:
--   'in_flight'  -- request accepted, side effects pending. Locks the slot.
--   'completed'  -- side effects done; response_* + receipt_id populated.
--   'errored'    -- side effects failed; response_* populated, receipt_id null.
--
-- A retry with the same key replays the cached response when status is
-- terminal ('completed' / 'errored'). A retry that arrives during 'in_flight'
-- waits or rejects (see phase3-idempotency-design.md for the policy).
--
-- expires_at: rows older than 24h are GC'd. The retry window is much shorter
-- than this (most retries land within seconds), so 24h is generous.
-- ----------------------------------------------------------------------------
create table idempotency_keys (
  agent_id uuid not null references agents(id) on delete cascade,
  key text not null,                                   -- client-supplied, ULID-shaped recommended
  request_hash text not null,                          -- sha256 of canonical request body
  status text not null default 'in_flight'
    check (status in ('in_flight', 'completed', 'errored')),
  response_status_code int,                            -- cached HTTP status
  response_body jsonb,                                 -- cached response body
  receipt_id text,                                     -- FK populated post-settlement
  created_at timestamptz default now(),
  completed_at timestamptz,
  expires_at timestamptz default now() + interval '24 hours',
  primary key (agent_id, key)
);

-- Janitor index: cheap lookup for expired rows.
create index idx_idem_expires on idempotency_keys(expires_at);

-- ----------------------------------------------------------------------------
-- 4. receipts
-- ----------------------------------------------------------------------------
-- Persisted, signed receipts. id is the user-visible "rcpt_<ULID>" string so
-- it round-trips through the API and the JSON receipt without translation.
--
-- We store the full canonical receipt body in receipt_json so /receipts/:id
-- can return the exact signed object that was generated, without any
-- reconstruction risk (canonicalization mismatch = signature failure on the
-- consumer side).
--
-- Many of the columns are denormalized projections of receipt_json. They
-- exist so we can query without unmarshalling JSONB: spend cap aggregation
-- (agent_id + issued_at + total_paid_atomic), audit lookups by tx_hash, and
-- reverse lookup from idempotency_keys.receipt_id.
-- ----------------------------------------------------------------------------
create table receipts (
  id text primary key,                                 -- "rcpt_<26-char ULID>"
  agent_id uuid not null references agents(id) on delete restrict,
  capability text not null,
  provider_id text not null,                           -- matches scorecards.provider_id (url-as-key)
  idempotency_key text,                                -- echo of the client-supplied key
  request_hash text not null,
  response_hash text not null,

  -- Settlement projection
  chain text not null,
  tx_hash text not null,
  payer_address text not null,
  payee_address text not null,
  amount_atomic text not null,                         -- string for precision
  currency text not null default 'USDC',
  decimals int not null default 6,
  settled_at timestamptz not null,

  -- Pricing projection
  provider_price_atomic text not null,
  trustbench_fee_atomic text not null,
  total_paid_atomic text not null,
  fee_model text not null default 'flat_per_tx',

  -- Routing projection
  score_at_decision int,
  alternatives_considered int,
  selection_reason text,

  -- Signature projection
  signature text not null,                             -- base64url Ed25519
  signature_alg text not null default 'ed25519',
  key_id text not null,

  -- Source-of-truth blob for replay/verification
  receipt_json jsonb not null,

  issued_at timestamptz not null default now()
);

-- Indexes
create index idx_receipts_agent_issued on receipts(agent_id, issued_at desc); -- spend-cap window queries
create index idx_receipts_tx_hash on receipts(tx_hash);                       -- reverse lookup
create index idx_receipts_capability on receipts(capability);

-- Add the FK from idempotency_keys.receipt_id now that receipts exists.
alter table idempotency_keys
  add constraint fk_idem_receipt
  foreign key (receipt_id) references receipts(id) on delete set null;

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------
-- Receipts are "public read" by id only — anyone with the receipt_id can GET
-- /receipts/:id (the id is unguessable enough — 26-char ULID + prefix). This
-- matches the audit-trail goal: a holder of a receipt can verify it without
-- being authenticated.
--
-- agents, api_keys, idempotency_keys are NOT public-read. Service role only.
-- ----------------------------------------------------------------------------
alter table agents enable row level security;
alter table api_keys enable row level security;
alter table idempotency_keys enable row level security;
alter table receipts enable row level security;

create policy "Service role full" on agents
  for all using (auth.role() = 'service_role');
create policy "Service role full" on api_keys
  for all using (auth.role() = 'service_role');
create policy "Service role full" on idempotency_keys
  for all using (auth.role() = 'service_role');

create policy "Public read by id" on receipts
  for select using (true);                             -- id is unguessable; fine to allow
create policy "Service role full" on receipts
  for all using (auth.role() = 'service_role');

-- ----------------------------------------------------------------------------
-- Spend cap query reference
-- ----------------------------------------------------------------------------
-- The rolling-window spend check used by the policy engine. Run before
-- constructing the x402 tx. If the result + max_price would exceed
-- agents.spend_cap_rolling_atomic, reject the request.
--
-- Note: under high concurrency this is approximately enforced — multiple
-- parallel calls may all pass the check before any of them write a receipt.
-- Acceptable trade-off for solo-founder Phase 3; revisit with row-level
-- locking on agents if it becomes a real problem.
-- ----------------------------------------------------------------------------
-- example:
--   select coalesce(sum(total_paid_atomic::numeric), 0) as spent_atomic
--   from receipts
--   where agent_id = $1
--     and issued_at > now() - (
--       select spend_cap_rolling_window_minutes from agents where id = $1
--     ) * interval '1 minute';

-- ============================================================================
-- Migration 2026-05-04 — block_number on receipts (closeout #3)
-- ============================================================================
-- Adds the on-chain block number to settlement projections so independent
-- verifiers can confirm via JSON-RPC that the receipt's tx_hash actually
-- landed in the named block. Closes the "TrustBench could lie about chain"
-- gap from phase3-valeo-stress-test.md without forcing a hard schema break.
--
-- bigint is sized for any production chain (Base ~32M blocks today, ETH
-- ~22M, Solana ~315M slots — all well under 2^63).
--
-- NULLABLE — receipts issued before this migration won't have a value.
-- The receipt-generator emits `block_number` in the settlement block of
-- receipt_json only when present, preserving canonical-byte stability for
-- old receipts that were already signed.
--
-- Idempotent: rerun-safe via IF NOT EXISTS.
-- ============================================================================
alter table receipts
  add column if not exists block_number bigint;

select '✅ Phase 3 schema additions ready' as status;
