-- ============================================================================
-- TrustBench Phase 4 — P4-7 spend-cap reservation
-- ============================================================================
-- Apply on top of phase3-schema.sql + phase3-schema-quotes.sql.
--
-- Adds the substrate for strict reservation-based spend caps:
--   - agents.pending_spend_atomic   numeric counter, atomically debited at
--                                   /route quote and credited back at
--                                   /route/settle (or expiry sweep).
--   - quotes.pending_released_at    timestamptz marking when the reservation
--                                   was released, so the sweep is idempotent
--                                   and the daily reconciliation can recompute
--                                   pending from authoritative quote state.
--
-- Type choice (intentional inconsistency with caps):
--   - spend_cap_*_atomic columns are TEXT (string of digits, BigInt-parsed in JS).
--     They're read once into JS BigInt; SQL never does arithmetic on them.
--   - pending_spend_atomic is NUMERIC(78, 0). The reservation logic requires
--     atomic SQL-side arithmetic in a conditional UPDATE WHERE clause
--     (`spent + pending + requested <= cap`), which TEXT can't express.
--   - 78 digits matches uint256 (2^256 ≈ 1.16e77) so any plausible atomic-unit
--     value fits without overflow.
--
-- Failure modes if this migration is wrong (or runs partially):
--   - Column missing on agents row → spend-caps middleware's UPDATE returns 0
--     rows for every quote, every quote 429s. Loud, easy to catch in logs.
--   - Column missing on quotes row → settle handler's release UPDATE on
--     pending_released_at fails, gets logged, settle proceeds. Pending
--     stays elevated until the daily reconciliation cron picks it up.
--     Cap is NEVER breached; just over-allocated for ≤24h.
--
-- Idempotent: rerun-safe via IF NOT EXISTS / DO blocks for the constraint.
-- ============================================================================

-- 1. agents.pending_spend_atomic
alter table agents
  add column if not exists pending_spend_atomic numeric(78, 0) not null default 0;

-- 2. agents.pending_spend_atomic non-negative check
-- Wrapped in a DO block so we don't re-add an existing constraint on rerun.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'pending_spend_nonneg'
      and conrelid = 'agents'::regclass
  ) then
    alter table agents
      add constraint pending_spend_nonneg check (pending_spend_atomic >= 0);
  end if;
end$$;

-- 3. quotes.pending_released_at
alter table quotes
  add column if not exists pending_released_at timestamptz;

-- 4. Index for the sweep query: lock-free scan of unreleased expired quotes.
-- The sweep filters on (pending_released_at IS NULL AND valid_until < now()),
-- so a partial index on pending_released_at IS NULL keeps the touch set tiny
-- and avoids a full scan as the quotes table grows.
create index if not exists idx_quotes_pending_release
  on quotes(valid_until)
  where pending_released_at is null;

-- ============================================================================
-- 5. claim_spend_reservation — atomic cap-check + pending debit
-- ============================================================================
-- Called from spend-caps.ts middleware on every /route quote attempt.
--
-- The function's WHERE clause is the load-bearing piece: it ensures the cap
-- is enforced TO THE BYTE under concurrency. Two concurrent quotes at the
-- cap edge: the first UPDATE commits, raising pending_spend_atomic; the
-- second UPDATE's WHERE clause sees the raised pending and rejects.
-- Postgres serializes UPDATEs on the same row, so this is correct.
--
-- p_rolling_cap is null → skip cap check (agent has no rolling cap configured),
-- pending still increments so the credit-back at settle is symmetric.
--
-- Returns the new pending_spend_atomic when the cap check passes, NULL when
-- it fails (cap would be breached). Caller maps NULL → 429 rolling_cap_exceeded.
--
-- Failure modes if this function is wrong:
--   - WHERE clause too loose: cap breached under concurrency (same as today's
--     Phase 3 race; we'd see (pending + spent) > cap in observed receipts).
--   - WHERE clause too tight: legitimate quotes 429'd. Recoverable; agent
--     retries or waits out the window.
--   - Function not deployed: spend-caps.ts catches the RPC error and falls
--     back to the legacy JS-side check via the SPEND_CAP_RESERVATION_ENABLED
--     feature flag.
-- ============================================================================
create or replace function claim_spend_reservation(
  p_agent_id uuid,
  p_max_price numeric,
  p_rolling_cap numeric,
  p_spent_recent numeric
) returns numeric
language sql
as $$
  update agents
     set pending_spend_atomic = pending_spend_atomic + p_max_price
   where id = p_agent_id
     and (
       p_rolling_cap is null
       or coalesce(p_spent_recent, 0) + pending_spend_atomic + p_max_price <= p_rolling_cap
     )
  returning pending_spend_atomic;
$$;

-- ============================================================================
-- 6. release_spend_reservation — credit-back at settle
-- ============================================================================
-- Called from settleHandler just before the merchant fetch. Two-step:
--   (a) atomically mark the quote's pending_released_at = now() if still null
--   (b) decrement the agent's pending_spend_atomic by the quote's max_price
-- The marker on the quote is the idempotency guard: if the sweep released this
-- quote first (race), step (a) finds 0 rows and step (b) is skipped, avoiding
-- double-credit. Self-contained — only needs route_id since agent_id and
-- max_price are stored on the quote.
--
-- Returns true when the credit-back ran, false when the quote was already
-- released (sweep got there first, or the quote doesn't exist).
--
-- Failure modes if this function is wrong:
--   - Step (a) fails: pending stays elevated; daily reconciliation cron
--     (sweep_expired_reservations + reconcile script) will recover within 24h.
--     Cap is over-allocated for that window; never breached.
--   - Step (b) fails after step (a) succeeded: quote is marked released but
--     agent's pending is not decremented. Pending under-counts spent.
--     This is the same trade-off as the merchant-call window (documented in
--     phase4-spend-caps-reservation.md § Failure-mode analysis).
-- ============================================================================
create or replace function release_spend_reservation(p_route_id text)
returns boolean
language plpgsql
as $$
declare
  v_agent_id uuid;
  v_max_price numeric;
begin
  -- Mark released; capture (agent_id, max_price) atomically. If the WHERE
  -- finds 0 rows (already released or route_id unknown), found = false.
  update quotes
     set pending_released_at = now()
   where route_id = p_route_id
     and pending_released_at is null
  returning agent_id, max_price_atomic::numeric
    into v_agent_id, v_max_price;

  if not found then
    return false;
  end if;

  update agents
     set pending_spend_atomic = greatest(0::numeric, pending_spend_atomic - v_max_price)
   where id = v_agent_id;

  return true;
end$$;

-- ============================================================================
-- 7a. refund_pending_reservation — compensating refund (no quote row)
-- ============================================================================
-- Called from quoteHandler when the spend-caps middleware debited pending
-- but the subsequent quote insert (or any pre-insert failure) prevented a
-- quote row from being created. There is no route_id to release through
-- release_spend_reservation, so we just decrement pending unconditionally.
--
-- Idempotent UPDATE via greatest(0, ...) — re-running won't drive pending
-- below zero. Safe to fire even if the original debit was somehow lost.
--
-- Failure mode if this is wrong:
--   - Function not deployed → quoteHandler logs the RPC error and returns
--     to the agent. Pending stays elevated until daily reconciliation
--     (≤24h). Cap is over-allocated for that window, never breached.
-- ============================================================================
create or replace function refund_pending_reservation(
  p_agent_id uuid,
  p_max_price numeric
) returns void
language sql
as $$
  update agents
     set pending_spend_atomic = greatest(0::numeric, pending_spend_atomic - p_max_price)
   where id = p_agent_id;
$$;

-- ============================================================================
-- 7b. sweep_expired_reservations — periodic release of expired quotes
-- ============================================================================
-- Called from src/pending-sweep.ts every 60s. Finds quotes whose validity
-- window has elapsed without a settle and releases their reservations.
--
-- One UPDATE on quotes (atomic mark-released) + one UPDATE per affected
-- agent (decrement pending). The CTE GROUP BY collapses multiple expired
-- quotes from the same agent into a single agent row touch.
--
-- Returns the number of quotes released (useful for monitoring; logged on
-- every sweep tick).
--
-- Idempotent: re-running is harmless. Quotes already released are excluded
-- by the WHERE on pending_released_at IS NULL.
-- ============================================================================
create or replace function sweep_expired_reservations()
returns int
language plpgsql
as $$
declare
  v_quotes_released int := 0;
begin
  with released as (
    update quotes
       set pending_released_at = now()
     where pending_released_at is null
       and valid_until < now()
    returning agent_id, max_price_atomic
  ),
  per_agent as (
    select agent_id,
           sum(max_price_atomic::numeric) as amt,
           count(*)::int as n
      from released
     group by agent_id
  ),
  decremented as (
    update agents a
       set pending_spend_atomic = greatest(0::numeric, a.pending_spend_atomic - per_agent.amt)
      from per_agent
     where a.id = per_agent.agent_id
    returning per_agent.n
  )
  select coalesce(sum(n), 0)::int into v_quotes_released from decremented;

  return v_quotes_released;
end$$;

-- ============================================================================
-- 8. reconcile_pending_spend — daily ground-truth recompute
-- ============================================================================
-- Called nightly (or from scripts/reconcile-pending-spend.ts ad-hoc). Recomputes
-- agents.pending_spend_atomic from the authoritative state (sum of unreleased
-- in-validity quotes). Used to recover from any drift the per-request hot path
-- may have accumulated (crash mid-debit, RPC failure mid-credit, etc.).
--
-- Returns a count of agents whose pending was changed.
-- ============================================================================
create or replace function reconcile_pending_spend()
returns int
language plpgsql
as $$
declare
  v_changed int;
begin
  with expected as (
    select a.id as agent_id,
           coalesce((
             select sum(q.max_price_atomic::numeric)
               from quotes q
              where q.agent_id = a.id
                and q.pending_released_at is null
                and q.valid_until > now()
           ), 0) as expected_pending
      from agents a
  ),
  changed as (
    update agents a
       set pending_spend_atomic = e.expected_pending
      from expected e
     where a.id = e.agent_id
       and a.pending_spend_atomic <> e.expected_pending
    returning a.id
  )
  select count(*)::int into v_changed from changed;

  return v_changed;
end$$;

select '✅ Phase 4 P4-7 spend-cap reservation schema ready' as status;
