# Phase 4 — P4-7 Reservation Cap Smoke (C1–C4)

**Pairs with:** `phase3-closeout.md` § "Phase A/B smoke" (manual runbook for A1–A5/B1–B4 against dev server + mock provider).

**Goal:** prove that with `SPEND_CAP_RESERVATION_ENABLED=true`:
1. Pending is debited correctly at quote (C1).
2. Pending is credited back at settle (C2).
3. **Cap is honored to the byte under concurrency (C3 — load-bearing).**
4. Pending is released by the sweep on quote expiry (C4).
5. The existing A1–A5 / B1–B4 smokes still pass (regression).

The C3 concurrency test is the reason this work exists — it directly targets the documented Phase 3 race where N parallel quotes could overshoot the cap by `(N − 1) × max_price`.

---

## Pre-flight

Apply the schema migration first (one-time, in Supabase SQL editor):
```sql
\i phase4-schema-spend-cap-reservation.sql
-- or paste the file contents into the SQL editor and run.
```

Verify the new column + functions exist:
```sql
select column_name, data_type from information_schema.columns
 where table_name = 'agents' and column_name = 'pending_spend_atomic';
-- → numeric

select column_name from information_schema.columns
 where table_name = 'quotes' and column_name = 'pending_released_at';
-- → timestamptz

select proname from pg_proc
 where proname in (
  'claim_spend_reservation', 'release_spend_reservation',
  'sweep_expired_reservations', 'refund_pending_reservation',
  'reconcile_pending_spend'
);
-- → 5 rows
```

Provision a test agent with a tight rolling cap. The C3 test uses `rolling_cap = 2 × max_price` to make the breach window small and the failure deterministic.

```sql
-- Test agent: $0.02 rolling cap (2x the per-call max_price below) over 60 min.
update agents
   set spend_cap_rolling_atomic = '20000',         -- $0.02
       spend_cap_rolling_window_minutes = 60,
       spend_cap_per_call_atomic = null
 where email = 'smoke-c1-c4@trustbench.io';

-- If the agent doesn't exist yet, create via npm run create-agent first
-- (matches phase3-paid-probing.md § Probe agent provisioning style).
```

Reset the agent's pending counter to 0 before running the smoke (in case a prior run leaked):
```sql
update agents set pending_spend_atomic = 0 where email = 'smoke-c1-c4@trustbench.io';
```

Set env locally for the dev server (or in `.env`):
```
SPEND_CAP_RESERVATION_ENABLED=true
```

Boot the local stack:
```powershell
# Terminal 1 — mock provider (port 3001)
npm run mock-provider

# Terminal 2 — dev server (port 3000)
npm run dev
```

Watch for the boot log line `[pending-sweep] starting (interval=60000ms)`. Absence = flag isn't being read; double-check `.env`.

Common request body for C1–C4:
```powershell
$BASE = "http://localhost:3000"
$KEY  = "tb_test_<smoke-agent-key>"
$AGENT_EMAIL = "smoke-c1-c4@trustbench.io"
'{"capability":"search","max_price":"10000","payer_address":"0x0000000000000000000000000000000000000001"}' `
  | Set-Content -NoNewline -Path body-c.json
```

---

## C1 — reservation debit at quote

**Setup.** Reset pending to 0 (see pre-flight).

**Run.**
```powershell
$IDEM_C1 = "smoke-c1-" + [guid]::NewGuid().ToString("N")
curl.exe -X POST "$BASE/route" `
  -H "Authorization: Bearer $KEY" `
  -H "Content-Type: application/json" `
  -H "Idempotency-Key: $IDEM_C1" `
  --data-binary "@body-c.json" -i
```

**Pass:** 200 OK with `route_id` (save as `$ROUTE_ID_C1`). Then check pending in Postgres:

```sql
select pending_spend_atomic
  from agents
 where email = 'smoke-c1-c4@trustbench.io';
-- → 10000 (=$0.01, the max_price)
```

**Fail signal:** pending is 0 → the `claim_spend_reservation` RPC isn't firing. Likely causes: (a) flag not set, (b) function not deployed, (c) Postgres function returned NULL because cap was hit (unlikely with `2 × max_price` = `20000` cap and `0` spent).

---

## C2 — credit-back at settle

**Setup.** Use C1's quote (pending = 10000 from C1).

**Run.**
```powershell
$FAKE_SIG = "0x" + ("ab" * 65)
@{ route_id = $ROUTE_ID_C1; signature = $FAKE_SIG } | ConvertTo-Json -Compress | Set-Content -NoNewline -Path settle-c2.json
curl.exe -X POST "$BASE/route/settle" `
  -H "Authorization: Bearer $KEY" `
  -H "Content-Type: application/json" `
  --data-binary "@settle-c2.json" -i
```

**Pass:** 200 OK with `X-Receipt-Id`. Then check pending and quotes:

```sql
select pending_spend_atomic from agents where email = 'smoke-c1-c4@trustbench.io';
-- → 0  (credited back)

select pending_released_at, valid_until from quotes where route_id = '<C1 route_id>';
-- → pending_released_at NOT NULL, near now()
```

**Receipt sanity:**
```sql
select total_paid_atomic from receipts where id = '<C2 receipt_id>';
-- → 10000  (the actual settled amount from the mock provider)
```

**Fail signal:**
- Pending stays at 10000 → `release_spend_reservation` not firing. Check `[settle] release_spend_reservation failed` log line.
- `pending_released_at` is null → quote release UPDATE missed. Likely race with sweep, but at this scale shouldn't happen.

---

## C3 — concurrency cap honored to the byte (LOAD-BEARING)

This is the test that proves we closed the Phase 3 race. With `rolling_cap = 2 × max_price`, three parallel quotes should produce **exactly 2 successes + 1 rolling_cap_exceeded**. Today (without the reservation flag) all 3 would succeed and overshoot the cap.

**Setup.** Reset state.
```sql
update agents set pending_spend_atomic = 0 where email = 'smoke-c1-c4@trustbench.io';
delete from quotes where agent_id = (select id from agents where email = 'smoke-c1-c4@trustbench.io');
delete from receipts where agent_id = (select id from agents where email = 'smoke-c1-c4@trustbench.io');
delete from idempotency_keys where agent_id = (select id from agents where email = 'smoke-c1-c4@trustbench.io');
```

**Run** (uses the dedicated harness — easier to fire 3 concurrent requests cleanly than from PowerShell):
```powershell
$env:TRUSTBENCH_BASE_URL = $BASE
$env:SMOKE_AGENT_KEY = $KEY
npx tsx scripts/smoke-c3-concurrency.ts
```

**Pass:** harness prints something like:
```
[c3] firing 3 concurrent quotes against rolling_cap=2x...
[c3] result: status=200 (route_id=qt_...)
[c3] result: status=200 (route_id=qt_...)
[c3] result: status=429 (error=rolling_cap_exceeded)
[c3] PASS — exactly 2 successes + 1 429
```

Plus check pending in Postgres:
```sql
select pending_spend_atomic from agents where email = 'smoke-c1-c4@trustbench.io';
-- → 20000  (=2 × max_price; both successful quotes' reservations are outstanding)
```

**Fail signal:**
- All 3 succeed → reservation pattern not actually preventing the breach. Check the `claim_spend_reservation` SQL function's WHERE clause + the JS RPC call.
- 0 or 1 succeed → cap math wrong or stale state from prior runs (re-run pre-flight cleanup).
- The harness exits with `FAIL — got N successes`, that's the symptom message.

**Why this is load-bearing.** The whole reservation pattern exists for this case. C3 green = the documented Phase 3 race is fixed.

---

## C4 — expiry release via sweep

**Setup.** Reset pending. Force-shorten the quote's validity so we don't have to wait 5 minutes:
```sql
update agents set pending_spend_atomic = 0 where email = 'smoke-c1-c4@trustbench.io';
```

**Run.**
```powershell
$IDEM_C4 = "smoke-c4-" + [guid]::NewGuid().ToString("N")
curl.exe -X POST "$BASE/route" `
  -H "Authorization: Bearer $KEY" `
  -H "Content-Type: application/json" `
  -H "Idempotency-Key: $IDEM_C4" `
  --data-binary "@body-c.json" -i
$ROUTE_ID_C4 = "qt_<paste>"
```

Manipulate `valid_until` to 1 minute in the past:
```sql
update quotes set valid_until = now() - interval '1 minute'
 where route_id = '<C4 route_id>';
```

Confirm pending is still elevated (sweep hasn't run yet):
```sql
select pending_spend_atomic from agents where email = 'smoke-c1-c4@trustbench.io';
-- → 10000
```

Wait ≤60 seconds for the next sweep tick (or call the function manually):
```sql
select sweep_expired_reservations();
-- → 1  (one quote released)
```

**Pass:**
```sql
select pending_spend_atomic from agents where email = 'smoke-c1-c4@trustbench.io';
-- → 0

select pending_released_at from quotes where route_id = '<C4 route_id>';
-- → NOT NULL, near now()
```

**Fail signal:** pending stays at 10000 after sweep → `sweep_expired_reservations()` not finding the row. Check the function's WHERE clause filters (`pending_released_at IS NULL`, `valid_until < now()`).

---

## Regression — A1–A5 + B1–B4 with reservation flag on

After C1–C4 pass, re-run the existing A1–A5 (`phase3-closeout.md` § "Phase A smoke") and B1–B4 (§ "Phase B idempotency edge cases") with `SPEND_CAP_RESERVATION_ENABLED=true`. They should pass identically. The reservation pattern is additive — it intercepts the rolling-cap branch only and shouldn't change quote/settle/audit behavior on the happy path.

If A1 fails with `rolling_cap_exceeded` immediately → either the test agent's cap is too low for the smoke max_price, or pending leaked from a prior run. Reset `pending_spend_atomic = 0` and retry.

---

## Daily reconciliation (manual sanity check)

After running C1–C4, run the reconciliation function once and confirm it reports 0 changed (everything should already be consistent):
```sql
select reconcile_pending_spend();
-- → 0  (no drift detected)
```

If it returns >0, the per-request hot path drifted from authoritative state. Investigate:
```sql
-- Per-agent expected vs actual:
select a.email,
       a.pending_spend_atomic as actual,
       coalesce((
         select sum(q.max_price_atomic::numeric)
           from quotes q
          where q.agent_id = a.id
            and q.pending_released_at is null
            and q.valid_until > now()
       ), 0) as expected
  from agents a;
```

Daily-cron wiring is a Phase 4 follow-up (P4-7-cron) — for now run `reconcile_pending_spend()` manually if anything looks off.
