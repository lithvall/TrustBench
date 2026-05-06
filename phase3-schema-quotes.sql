-- ============================================================================
-- TrustBench Phase 3 — quotes table (Step 6: x402 construction)
-- ============================================================================
-- Apply on top of phase3-schema.sql. Stores x402 quotes returned by
-- POST /route (Step 1) and looked up by POST /route/settle (Step 2). Spec
-- in phase3-x402-construction.md.
--
-- One quote per (agent_id, idempotency_key) on Step 1; the agent then
-- comes back with route_id + signature on Step 2 to settle. Quotes
-- expire after min(provider.valid_before, now() + 5 minutes).
-- ============================================================================

create table quotes (
  route_id text primary key,                         -- "qt_<26-char-ULID>"
  agent_id uuid not null references agents(id) on delete cascade,
  idempotency_key text not null,                     -- echo of Step 1 Idempotency-Key

  capability text not null,
  max_price_atomic text not null,                    -- agent-supplied ceiling
  payer_address text not null,                       -- agent's EOA (will sign)

  -- Provider + payment details captured during Step 1 probe
  provider_id text not null,                         -- matches scorecards.provider_id (url-as-key)
  provider_url text not null,                        -- the URL we'll re-call at settle
  recipient text not null,                           -- payee wallet (provider's)
  amount_atomic text not null,                       -- provider-quoted price (≤ max_price)
  asset_address text not null,                       -- USDC contract on Base
  chain text not null default 'base',
  scheme text not null default 'eip3009',
  nonce text not null,                               -- EIP-3009 nonce from provider's challenge
  valid_after bigint not null,                       -- epoch seconds (from provider)
  valid_before bigint not null,                      -- epoch seconds (from provider)

  -- Routing context — surfaced into the receipt at settle time
  score_at_decision int,
  alternatives_considered int,
  selection_reason text,

  -- Hash of the canonical payment_required payload — used as the request_hash
  -- for the settle-lock row in idempotency_keys (composite namespacing
  -- '_settle:' + route_id is handled in the application layer)
  payload_hash text not null,

  created_at timestamptz not null default now(),
  valid_until timestamptz not null,                  -- min(provider.valid_before, now() + 5min)
  expires_at timestamptz not null default now() + interval '24 hours'
);

create index idx_quotes_agent on quotes(agent_id);
create index idx_quotes_expires on quotes(expires_at);

alter table quotes enable row level security;

create policy "Service role full" on quotes
  for all using (auth.role() = 'service_role');

select '✅ Phase 3 quotes table ready' as status;
