# Phase 4 — Spend Caps: Reservation/Release Pattern (P4-7)

**Status:** Design sketch. Implementation pending. Lands after P4-1b ships.
**Sketch date:** 2026-05-06
**Supersedes (partially):** the Phase 3 race-trade-off documented in `phase3-spend-caps.md` § "Race 1". Phase 3's three cap layers stay; this doc replaces only the rolling-window check with an atomic reservation.

## Why this exists

Phase 3's spend cap is approximately enforced under concurrency. Today's check (`requireWithinSpendCap` middleware) reads `sum(receipts.total_paid_atomic)` over the rolling window, adds `max_price`, compares against `spend_cap_rolling_atomic`, and rejects if over. Under N concurrent in-flight quotes for the same agent, all N can pass the check before any of them settle and write a receipt. Total spend can overshoot the cap by up to `(N − 1) × max_price`.

`CLAUDE.md` already calls this out as a Phase 3 deferred limit. Two independent external signals validated the priority bump:

1. **Infopunks** (Phase 2 conversations + 2026-05-04 cognition launch): "the audit tail is where teams slip." Receipts and idempotency aren't enough on their own; spend control is the third leg.
2. **CLU_AGENT** (X reply 2026-05-06, op @Logik185): named "per-call timeout reversion" as a relay-layer gap. Direct mapping to this work.

See `phase4-clu-agent-handoff.md` and `project_clu_agent_signal.md` (memory).

## Contract change

The cap formula moves from "spent + requested ≤ cap" to "spent + pending + requested ≤ cap":

| | Phase 3 (today) | Phase 4 (this doc) |
| --- | --- | --- |
| Spent | `sum(receipts.total_paid_atomic)` over window | Same |
| Pending | _(not modeled)_ | `agents.pending_spend_atomic` counter |
| Requested | `max_price` | Same |
| Decision | `spent + requested > cap` → 429 | `spent + pending + requested > cap` → 429 |

The other two layers (per-request `max_price` and per-agent `spend_cap_per_call_atomic`) are unchanged and ordered the same way in the chain.

## Schema change — one column on `agents`

```sql
alter table agents
  add column pending_spend_atomic numeric(78, 0) not null default 0,
  add constraint pending_spend_nonneg check (pending_spend_atomic >= 0);
```

`numeric(78, 0)` matches Postgres's wide enough to hold any 256-bit integer; we treat it as a non-negative integer in atomic units, same units as `spend_cap_*_atomic` and `total_paid_atomic`. Default 0 means existing rows migrate cleanly with no app-side change to handle null.

No new index needed — every read is `where id = $agent_id`, already the primary key.

**No new table.** The receipts table stays the source of truth for settled spend. The pending counter is an in-flight bookkeeping number, not an audit record. If pending ever drifts (via crash mid-settle or expired-quote leak), the recovery is a periodic reconciliation against open quotes; see § "Recovery".

## Lifecycle — debit at quote, credit-back at settle or expiry

Three lifecycle points.

**1. At quote issuance** (inside `quoteHandler`, after the cap check passes):

```sql
update agents
   set pending_spend_atomic = pending_spend_atomic + $max_price
 where id = $agent_id;
```

This runs **after** the cap check, **inside the same transaction as the quote insert**, so a quote row never lands without its corresponding pending debit, and a pending debit never lands without a matching quote.

The cap check itself becomes a single conditional update that fails the request if the constraint would breach:

```sql
update agents
   set pending_spend_atomic = pending_spend_atomic + $max_price
 where id = $agent_id
   and (
     -- spent_recent is computed in JS just before this UPDATE, same as today
     coalesce($spent_recent, 0) + pending_spend_atomic + $max_price <= $rolling_cap
   )
returning pending_spend_atomic;
```

If `returning` yields zero rows, the UPDATE was rejected by the `where` clause — the agent is at-or-over cap. Return 429 `rolling_cap_exceeded` with the same shape as today (cap_atomic, spent_atomic, requested_atomic, window_minutes, currency, plus a new `pending_atomic` field for transparency).

**2. At settle** (inside `settleHandler`, just before the receipt is issued and before the on-chain settlement is observed):

```sql
update agents
   set pending_spend_atomic = greatest(0, pending_spend_atomic - $max_price)
 where id = $agent_id;
```

`greatest(0, ...)` is defense-in-depth against double-credit. The `not null check >= 0` constraint catches it loudly otherwise. The release happens *before* the merchant call so a slow merchant doesn't consume reservation budget any longer than the on-chain settle takes.

The receipt write that follows replaces the pending counter with a real audit record. Net: the rolling spend (spent + pending) returns to its pre-quote level, then the receipt's `total_paid_atomic` re-adds the actual settled amount on the next rolling-window scan.

**3. At quote expiry** (5-minute validity window per `phase3-x402-construction.md`):

The quote table already has an `expires_at` column. Add a periodic sweep that releases pending for any quote that has expired without settling:

```sql
-- Run every 60 seconds via a small in-process timer (or the existing
-- nightly cron with a more aggressive interval). Lock-free: each row is
-- touched at most once because the 'released' transition is atomic.
with expired as (
  select agent_id, max_price_atomic
    from quotes
   where expires_at < now()
     and pending_released_at is null
     and status = 'active'
)
update agents a
   set pending_spend_atomic = greatest(0, a.pending_spend_atomic - e.max_price_atomic)
  from expired e
 where a.id = e.agent_id;

-- Mark released so we don't double-release on the next sweep:
update quotes
   set pending_released_at = now()
 where expires_at < now()
   and pending_released_at is null
   and status = 'active';
```

Adds one column to `quotes`: `pending_released_at timestamptz`. Defaults null, set to `now()` on either settle or expiry. The sweep is idempotent (re-running is harmless).

Trade-off: the sweep job is one more cron-like timer to run. We already have `setInterval` patterns in the codebase; not new infrastructure. If we want zero new timers, do the sweep lazily inside `requireWithinSpendCap` itself — every cap check first releases anything expired for the current agent. Slightly slower path, no cron. Recommend the in-process timer approach for simplicity and lower per-request cost.

## Failure-mode analysis

| Scenario | Behavior with reservation pattern | Worst-case impact |
| --- | --- | --- |
| Quote → settle happy path | Debit at quote, credit-back at settle, receipt records actual spend. | Cap is honored exactly. |
| Quote issued, server crashes before settle | pending_spend stays elevated; next sweep (≤60s later) finds the unexpired-but-server-side-lost quote and releases. | Up to `max_price × 1` of "phantom pending" for ≤ 60s. Not a real cap breach. |
| Quote issued, agent never settles (intentional or buggy) | Sweep at expires_at + sweep_interval releases. | Up to `max_price × 1` of phantom pending for the quote validity window (5 min) + sweep latency. |
| Settle handler decrements pending, then fails before receipt write | Pending is released early; the in-flight settle never lands a receipt. | Possible *under-counting* of spend. The merchant either succeeds (but TrustBench has no record) or fails (no money moves). The receipt-not-issued branch is already a 502 today; the pending decrement happens regardless because we'd rather under-count than over-block. **Trade-off documented**: settle path is allowed to be lossy on the bookkeeping, never on the user money. |
| Pending counter drifts negative (impossible per `>= 0` constraint, but check defense) | DB constraint rejects the UPDATE; we'd see a constraint-violation error in logs. | Loud, easy to catch. |
| Concurrent quote at the cap edge | First UPDATE with `where … <= cap` succeeds; second UPDATE's `where` is now false because the first commit raised pending_spend_atomic. Second is rejected with 429. | Cap is honored to the byte. |
| Long-running merchant call between settle-decrement and merchant-response | Pending was released, receipt not yet written. Cap is *under-counted* for the duration of the merchant call. Real spend hasn't happened on-chain yet either; this is the same window the user already accepts under "TrustBench is non-custodial; the merchant submits the on-chain tx." | Bounded by merchant response time. Documented limit. |

## Recovery — periodic reconciliation

Even with the sweep, drift is theoretically possible (a settle decrement that succeeds plus a sweep release that succeeds = double-decrement = under-counting; or a sweep that fails + manual mark + bug = over-counting). Once a day (e.g. nightly cron alongside the prober), reconcile the pending counter against open quotes:

```sql
-- For each agent, recompute pending from authoritative state:
update agents a
   set pending_spend_atomic = coalesce(t.expected, 0)
  from (
    select q.agent_id, sum(q.max_price_atomic::numeric) as expected
      from quotes q
     where q.status = 'active'
       and q.expires_at > now()
       and q.pending_released_at is null
     group by q.agent_id
  ) t
 where a.id = t.agent_id;
```

Also a one-shot script: `scripts/reconcile-pending-spend.ts` that prints diffs without writing — useful for spot-checking before promoting to a cron.

## Implementation pointer

- `src/spend-caps.ts:151–204` is where the rolling-cap check lives today. Replace the JS-side `if (spent + maxPrice > rollingCap)` with the conditional UPDATE shown above. Move the receipts SUM read just above it (so JS knows `spent_recent` to plug into the WHERE clause).
- `src/route-handlers.ts settleHandler` gets a single new SQL call right before the merchant-response is processed: the credit-back UPDATE.
- New file: `src/pending-sweep.ts`. Runs every 60s in-process. ~30 lines. Mounts in `src/index.ts` boot alongside the Hono server.
- Schema migration: one new column on `agents`, one new column on `quotes` (`pending_released_at`). Both nullable on existing rows (default 0 / null). No data backfill needed because Phase 3 has no in-flight quotes at the moment of upgrade (quote validity is 5 min).

Estimated effort: **~1 day** of focused work end-to-end, including the smoke harness below. The change is small but the test bar is high because this is a high-risk surface (payment construction adjacent — same care as `signEip3009`).

## Smoke test plan

Three new tests on top of the existing A1–A5 / B1–B4 series:

- **C1: reservation debit at quote.** Issue quote → query `agents.pending_spend_atomic` → expect equal to `max_price`.
- **C2: credit-back at settle.** C1 + settle → expect pending back to 0 → expect a receipt with `total_paid_atomic = max_price` in receipts.
- **C3: cap honored under concurrency.** Set rolling cap to `2 × max_price`. Fire 3 concurrent /route quotes → expect exactly 2 to succeed and 1 to 429 with `rolling_cap_exceeded`. Today this would all-pass with the cap breached by `(3 − 2) × max_price`.
- **C4: expiry release.** Issue quote → don't settle → wait > 5 min → run sweep → expect pending back to 0.

Concurrency test C3 is the load-bearing one — it's what proves the reservation actually fixes the Phase 3 race. Worth running in CI on every PR that touches `src/spend-caps.ts`.

## Out of scope (deliberately)

- **Per-call cap stays JS-side.** The per-call ceiling (`spend_cap_per_call_atomic`) doesn't have a race because it compares against `max_price` only, no aggregate. No reservation needed there.
- **Multi-currency.** Phase 4 stays USDC-only. Multi-currency reservation requires a per-currency pending counter and is a Phase 5 decision.
- **Receipt schema change.** Receipts continue to record `total_paid_atomic`. Reservation state is internal bookkeeping, not part of the audit envelope. **Important:** this means receipt-spec-v1.md does NOT change with this work, and existing scorecard / receipt signatures stay valid forever.
- **Cross-agent fairness.** If the global cap is exhausted by one agent, others are unaffected (caps are per-agent). Multi-tenant fairness pricing is a separate Phase 5+ topic.

## Pre-implementation checklist (for the Claude session that picks this up)

- [ ] Read `phase3-spend-caps.md` end-to-end. The composition rules ("all three layers must pass") survive.
- [ ] Read `src/spend-caps.ts` end-to-end. The change is to the rolling-cap section, not to per-call or currency layers.
- [ ] Read `src/route-handlers.ts settleHandler` to see where the credit-back UPDATE goes (before the merchant call, so we don't hold reservation budget across slow merchant settles).
- [ ] Sanity-check the schema migration in `schema.sql` against the live deployment. Add the new columns.
- [ ] Land the change behind a feature flag (`SPEND_CAP_RESERVATION_ENABLED`) for a few hours of canary traffic before flipping default-on. Solo-founder lens: easy to roll back if a real-world quirk surfaces.
- [ ] After landing, append a `lessons.md` entry capturing what was tricky.

That's it. The reservation pattern is small in code and large in correctness. Worth doing right after P4-1b.
