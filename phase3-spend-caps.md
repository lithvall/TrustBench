# Phase 3 — Spend Caps Design

**Status:** Design draft. Implementation pending (Grok writes, Claude reviews).
**Decision date:** 2026-05-01

## Why this is the highest-stakes piece after idempotency

Phase 2 r/AI_Agents conversation, verbatim:

> *"Spend control and idempotency, not signing. The ugly bug is duplicate pay-retry paths under partial timeouts; one missing request fingerprint and your agent buys the tool three times."*

Idempotency makes the duplicate-pay scenario rare. Spend caps are the backstop when something *else* goes wrong — a buggy agent loop, a runaway tool-call chain, a compromised key. The cap is a hard ceiling on damage. If a builder can't tell their boss "the worst case is $X over Y minutes," they will not run TrustBench in production. This is the second of the four primitives Phase 2 validation surfaced (idempotency, hard caps, signed receipts, queryable audit).

## Contract

The agent supplies, on every `POST /route`:

- `capability` — string, the routing capability key (e.g. `"search"`).
- `max_price` — string, atomic-unit upper bound the agent is willing to pay for this single call. **Required.** No default; absence is a 400.
- (Phase 4 additions: `currency`, `chain` — Phase 3 is USDC-only on a single chain, and we hardcode that.)

We enforce, in order:

1. `max_price` is well-formed (numeric string, > 0).
2. Currency the agent's cap is denominated in matches the call currency. Phase 3: must be `USDC`.
3. `max_price` ≤ `agents.spend_cap_per_call_atomic` (if cap is set).
4. `sum(receipts.total_paid_atomic) over the rolling window` + `max_price` ≤ `agents.spend_cap_rolling_atomic` (if cap is set).

If any check fails, return a 4xx with a stable error code; the idempotency layer caches it, so retries with the same idempotency key replay the rejection.

## The three layers of cap and how they compose

There are three numbers, each the conservative bound at its layer:

1. **`max_price` (per-request).** What the agent says it'll spend on *this* call. Comes from the request body. Bounds the worst-case for this one transaction.
2. **`spend_cap_per_call_atomic` (per-agent).** A hard ceiling on any single transaction the agent can ever make, regardless of what they pass in `max_price`. NULL = no cap. Use case: "no single tool call should ever exceed $0.10."
3. **`spend_cap_rolling_atomic` over `spend_cap_rolling_window_minutes` (per-agent).** Sum of `total_paid_atomic` across `receipts` issued in the last N minutes. NULL = no cap. Use case: "this agent should never spend more than $5 in any 60-minute window."

Composition: a call is allowed only if **all three** pass. Any failing layer shorts the call.

The per-call cap is conservative: we compare it to `max_price`, not actual paid amount, so even if the provider quotes lower we never breach the per-call ceiling. Same logic for the rolling cap — we add `max_price` (not actual) to the rolling sum during the check. After settlement, `total_paid_atomic` lands in the receipt and the rolling sum updates from there. This is intentionally conservative: agents may rejected slightly earlier than strictly necessary, but the cap is never breached.

## Source of truth: the `receipts` table — no `spend_log`

The rolling-window query is:

```sql
select coalesce(sum(total_paid_atomic::numeric), 0) as spent_atomic
from receipts
where agent_id = $1
  and issued_at > now() - ($2 * interval '1 minute');
```

Indexed by `idx_receipts_agent_issued (agent_id, issued_at desc)` — already in `phase3-schema.sql`, no new index needed.

**Why no `spend_log` table:** every receipt already records `total_paid_atomic`, `agent_id`, and `issued_at`. A separate spend log would either duplicate that data (and drift) or require a transactional write across two tables on the hot path. The receipt is the source of truth for "did this call settle, and for how much." Aggregating from receipts means the cap math always agrees with what the audit endpoint shows. **Locked decision** (CLAUDE.md, phase3-handoff.md).

## Atomic units only, BigInt math, no floats

Every cap value, every `max_price`, every `total_paid_atomic` is stored as a **string of atomic units**. USDC has 6 decimals, so `"100000"` = $0.10 and `"1000000"` = $1.00.

Math:

- Convert each string to `BigInt` at the boundary: `BigInt(agentCaps.spend_cap_per_call_atomic ?? '0')`.
- Compare with `>`, `<`, `+`. Never with `parseFloat` or arithmetic in `Number`.
- Postgres aggregates with `::numeric` (arbitrary precision), then we read the result as a string and `BigInt` it.

Reject `max_price` strings that don't match `/^\d+$/` and are non-zero. No scientific notation, no leading `+`, no decimals.

## Where the cap check sits in the request lifecycle

```
client → requireAgent → withIdempotency.claim → requireWithinSpendCap → handler:
                                                         │
                                                         ├─ provider selection
                                                         ├─ x402 challenge + tx construction
                                                         ├─ agent-sign + submit
                                                         ├─ upstream call
                                                         └─ receipt emit
                                       → withIdempotency.persist → response
```

**Critical ordering: cap check goes AFTER idempotency-claim, BEFORE x402 construction.**

If we put the cap check *before* idempotency, a retry of a call that already paid could be rejected on the second attempt because the receipt from the first attempt has just pushed the agent over the cap. That violates the idempotency contract — same key must always replay the original outcome. By putting the cap check after idempotency-claim, retries of completed calls replay through the idempotency cache and never re-evaluate the cap.

If we put it *after* x402 challenge, we've already burned a provider round-trip for a request we were always going to reject. Wasteful and noisy.

Idempotency consequence: a rejected request is cached as the rejection. The same idempotency key cannot "retry into success" once the rolling window opens up. Document this in the API docs and in the error response — the agent must use a fresh idempotency key after waiting out the window.

## Race conditions, named

### Race 1: parallel requests both pass the cap, sum exceeds it after both settle

**Scenario:** rolling cap is `$1.00`, current spend is `$0.95`, two concurrent requests with `max_price = $0.05` each. Both pass the pre-flight check (`$0.95 + $0.05 = $1.00`, ≤ cap). Both proceed. Both settle. Final spend is `$1.05`.

**Resolution: approximately enforced** — locked Phase 3 trade-off (CLAUDE.md, phase3-handoff.md).

The realistic exposure is bounded by `(parallelism − 1) × max_price`. An agent running 5 parallel calls at `max_price = $0.10` could overshoot a `$1.00` rolling cap by up to `$0.40`. For Phase 3 this is acceptable because:

- Builders running cap-relevant traffic should already have other guards. Idempotency at the very least collapses retries-of-the-same-logical-call to one execution.
- Per-call caps still hold strictly (each individual call respects them).
- The breach is bounded and observable — every receipt is signed and queryable, so an agent can audit overshoots after the fact.

**Phase 4 mitigation (out of scope here):** either a row-level lock on the `agents` row across the cap-check + receipt-write window, or a separate `pending_spend` table that increments at cap-check and finalizes at receipt-write. Both add latency and complexity not justified at Phase 3 traffic levels.

### Race 2: receipt rolls out of window mid-check

**Scenario:** the cap query reads receipts at time T. By the time we'd have written *our* receipt, the oldest in-window receipt has rolled out, freeing budget we didn't credit ourselves with.

**Resolution:** ignore. The check is conservative; missing a tiny budget recovery is fine. The agent retries with the same key (replay) or a new key (re-evaluates).

### Race 3: cap value changed mid-call

**Scenario:** an admin tightens `spend_cap_rolling_atomic` from `$10` to `$1` while a request is mid-flight. Our agent_caps were loaded against the old cap.

**Resolution:** the in-flight call uses the cap value loaded at the start of the request. Subsequent calls pick up the new cap. Cap changes are not retroactively applied to in-flight requests. Document.

## HTTP semantics and error response shapes

| Failure | Status | `error` code | Notes |
|---|---|---|---|
| `max_price` missing | 400 | `max_price_required` | Always required on /route. |
| `max_price` malformed (negative, non-numeric, decimal) | 400 | `max_price_invalid` | Includes received value in `detail`. |
| Currency mismatch (Phase 3: not USDC) | 400 | `currency_mismatch` | Won't succeed as-is; agent fix required. |
| Per-call cap exceeded (`max_price > spend_cap_per_call_atomic`) | 400 | `per_call_cap_exceeded` | Won't succeed as-is; agent must lower max_price. |
| Rolling cap would be exceeded | 429 | `rolling_cap_exceeded` | `Retry-After: <seconds>` set to time until oldest in-window receipt rolls out. |

Body shape (consistent across all five):

```json
{
  "error": "rolling_cap_exceeded",
  "detail": "agent rolling spend cap would be exceeded",
  "cap_atomic": "1000000",
  "spent_atomic": "950000",
  "requested_atomic": "100000",
  "window_minutes": 60,
  "currency": "USDC"
}
```

The numeric fields are atomic-unit strings. The agent can compute their own retry strategy from `spent_atomic` and `cap_atomic`.

## Where the cap fields are loaded

**Decision: extend the auth middleware's agent-row select.**

`src/auth.ts` already does a `.single()` on `agents` to fetch `id, mode, metadata`. Add the four cap columns to that select:

```ts
.select('id, mode, metadata, spend_cap_per_call_atomic, spend_cap_rolling_atomic, spend_cap_rolling_window_minutes, spend_cap_currency')
```

Stash the resulting cap object on the Hono context as `agent_caps`:

```ts
type AgentCaps = {
  per_call_atomic: string | null;
  rolling_atomic: string | null;
  rolling_window_minutes: number;
  currency: string;
};
c.set('agent_caps', { ... });
```

This adds zero round-trips on the hot path: the auth middleware was already going to do that select. The spend-cap middleware reads from context (in-memory) and only does the rolling-sum query when needed.

The `AgentContext.Variables` type in `auth.ts` should be extended to include `agent_caps`.

## Pseudocode

`src/spend-caps.ts` — new middleware. Mount as the third middleware on `/route`:

```ts
app.post('/route', requireAgent, withIdempotency, requireWithinSpendCap, async (c) => { ... });
```

```typescript
import { createMiddleware } from 'hono/factory';
import type { AgentContext } from './auth.js';

const PHASE_3_CURRENCY = 'USDC';

export const requireWithinSpendCap = createMiddleware<AgentContext>(async (c, next) => {
  const agentId = c.get('agent_id');
  const caps = c.get('agent_caps');

  // ---- Parse + validate body's max_price ----------------------------------
  // c.req.json() is cached; idempotency middleware already parsed it.
  const body = await c.req.json().catch(() => ({} as Record<string, unknown>));
  const rawMaxPrice = body.max_price;

  if (typeof rawMaxPrice !== 'string' || rawMaxPrice.length === 0) {
    return c.json({ error: 'max_price_required', detail: 'max_price (atomic-unit string) is required on POST /route' }, 400);
  }
  if (!/^\d+$/.test(rawMaxPrice)) {
    return c.json({ error: 'max_price_invalid', detail: 'max_price must be a non-negative integer atomic-unit string', received: rawMaxPrice }, 400);
  }

  let maxPrice: bigint;
  try { maxPrice = BigInt(rawMaxPrice); }
  catch { return c.json({ error: 'max_price_invalid', detail: 'max_price could not be parsed as BigInt', received: rawMaxPrice }, 400); }
  if (maxPrice <= 0n) {
    return c.json({ error: 'max_price_invalid', detail: 'max_price must be > 0', received: rawMaxPrice }, 400);
  }

  // ---- Currency: Phase 3 is USDC-only -------------------------------------
  if (caps.currency !== PHASE_3_CURRENCY) {
    return c.json({
      error: 'currency_mismatch',
      detail: `Phase 3 supports only ${PHASE_3_CURRENCY}; agent cap is denominated in ${caps.currency}`,
      agent_cap_currency: caps.currency,
      call_currency: PHASE_3_CURRENCY,
    }, 400);
  }

  // ---- Per-call cap -------------------------------------------------------
  if (caps.per_call_atomic !== null) {
    const perCallCap = BigInt(caps.per_call_atomic);
    if (maxPrice > perCallCap) {
      return c.json({
        error: 'per_call_cap_exceeded',
        detail: 'requested max_price exceeds the agent per-call spend cap',
        cap_atomic: perCallCap.toString(),
        requested_atomic: maxPrice.toString(),
        currency: caps.currency,
      }, 400);
    }
  }

  // ---- Rolling cap --------------------------------------------------------
  if (caps.rolling_atomic !== null) {
    const rollingCap = BigInt(caps.rolling_atomic);
    const windowMinutes = caps.rolling_window_minutes;
    const windowStartIso = new Date(Date.now() - windowMinutes * 60_000).toISOString();

    // Pull receipts in window. Index idx_receipts_agent_issued covers this.
    // Sum in JS — Phase 3 traffic is low enough that O(N) per request is fine.
    // If receipts-per-window per agent exceeds ~1k, switch to a Postgres RPC.
    const { data: rows, error } = await supabase
      .from('receipts')
      .select('total_paid_atomic, issued_at')
      .eq('agent_id', agentId)
      .gte('issued_at', windowStartIso);

    if (error) {
      console.error('[spend-caps] rolling-spend lookup failed:', error.message);
      return c.json({ error: 'spend_cap_unavailable' }, 503);
    }

    const spent = (rows ?? []).reduce(
      (sum, r) => sum + BigInt(r.total_paid_atomic as string),
      0n
    );

    if (spent + maxPrice > rollingCap) {
      // Retry-After: time until the OLDEST in-window receipt rolls out.
      // Best-effort hint; the agent might still need to wait longer if
      // multiple receipts roll out only one-at-a-time.
      let retryAfterSec = 60;
      if (rows && rows.length > 0) {
        const oldest = rows.reduce(
          (acc, r) => (r.issued_at as string) < acc ? (r.issued_at as string) : acc,
          rows[0].issued_at as string
        );
        const oldestRollOutMs = new Date(oldest).getTime() + windowMinutes * 60_000;
        retryAfterSec = Math.max(1, Math.ceil((oldestRollOutMs - Date.now()) / 1000));
      }

      return c.json({
        error: 'rolling_cap_exceeded',
        detail: 'agent rolling spend cap would be exceeded by this call',
        cap_atomic: rollingCap.toString(),
        spent_atomic: spent.toString(),
        requested_atomic: maxPrice.toString(),
        window_minutes: windowMinutes,
        currency: caps.currency,
      }, 429, { 'Retry-After': String(retryAfterSec) });
    }
  }

  // ---- Stash for the handler ---------------------------------------------
  // The /route handler will need max_price for x402 construction; stash here
  // so the handler doesn't re-parse and re-validate.
  c.set('max_price_atomic', maxPrice.toString());

  await next();
});
```

`AgentContext.Variables` extension (in `auth.ts`):

```ts
export type AgentContext = {
  Variables: {
    agent_id: string;
    agent_mode: AgentMode;
    agent_metadata: Record<string, unknown>;
    api_key_id: string;
    agent_caps: {
      per_call_atomic: string | null;
      rolling_atomic: string | null;
      rolling_window_minutes: number;
      currency: string;
    };
    max_price_atomic: string;   // set by requireWithinSpendCap
  };
};
```

## Test scenarios (for Grok to implement)

Integration tests against real Postgres + the auth/idempotency stack:

1. **No caps configured.** Agent has all four cap columns NULL → all calls pass regardless of `max_price`.
2. **Per-call cap allows.** `max_price ≤ spend_cap_per_call_atomic` → passes.
3. **Per-call cap exceeded.** `max_price > spend_cap_per_call_atomic` → 400 `per_call_cap_exceeded`.
4. **Rolling cap allows.** No prior receipts in window → first call passes.
5. **Rolling cap allows after partial spend.** Prior receipts in window summing to less than cap, current `max_price` still fits → passes.
6. **Rolling cap exceeded by current call.** `sum + max_price > spend_cap_rolling_atomic` → 429 `rolling_cap_exceeded` with `Retry-After`.
7. **Rolling cap window boundary — receipt just outside window** is excluded; receipt just inside is included.
8. **Rolling cap rolls open.** Receipt at age `window_minutes - 0.1m` blocks the call; same call after the receipt ages past the window → passes.
9. **Currency mismatch.** Agent cap currency is `USDT` (artificially) → 400 `currency_mismatch`.
10. **`max_price` missing.** No field in body → 400 `max_price_required`.
11. **`max_price` malformed.** Empty string, `"0"`, `"-100"`, `"1.5"`, `"1e6"`, `"abc"` → 400 `max_price_invalid`.
12. **Approximate enforcement under concurrency.** Five parallel calls each at `max_price` such that any one fits but two together don't. Expected: more than one passes; total spend may exceed cap by up to `(parallelism − 1) × max_price`. Document the observed overshoot.
13. **Idempotent replay of rejection.** Cap-rejected request returns 4xx; same idempotency key + same body returns the *same* 4xx (replayed by the idempotency layer). Same key + different body returns idempotency's 409, not the cap rejection.
14. **Cap rejection does not write a receipt.** After a cap rejection, the receipts table has no new row for that request.
15. **Cap rejection persists in idempotency_keys.** The idempotency row is in terminal state `errored` (or `completed` with the 4xx body — pick one and document). Retries replay correctly.

For scenario 15: the 4xx response is a deliberate rejection, not a server error. The idempotency middleware decides terminal status based on `response.status >= 500`. A 400 or 429 will be cached as `completed`. That's correct: the rejection is the canonical answer for that (agent, key, body) tuple.

## Locked decisions (Phase 3)

1. **Source of truth: `receipts` table only.** No `spend_log`. Rolling sum is computed from receipts at cap-check time.
2. **Atomic units everywhere.** Strings on the wire and at rest, BigInt in math. No floats.
3. **Conservative pre-check using `max_price`,** not actual paid. Actual lands in the receipt and feeds future checks.
4. **Cap check after idempotency-claim, before x402 construction.** Retries of completed calls replay through idempotency without re-evaluating caps.
5. **Approximate enforcement under concurrency.** Documented trade-off; Phase 4 may add row-locks or a pending_spend table.
6. **`max_price` is required on /route.** No default.
7. **Phase 3 is USDC-only.** Currency mismatch is a 400.
8. **NULL means "no cap."** Both `spend_cap_per_call_atomic` and `spend_cap_rolling_atomic` independently nullable.
9. **Cap fields loaded by `requireAgent`,** stashed on context as `agent_caps`. No extra DB round-trip.
10. **Rolling-sum aggregation in JS,** not via Postgres RPC. Move to RPC if any agent's per-window receipt count exceeds ~1k.
11. **HTTP status codes:** 400 for permanent rejections (per-call, currency, malformed), 429 + `Retry-After` for rolling-window rejections.

## Out of scope (Phase 4+)

- Per-capability caps (e.g. "$1 on inference, $0.10 on search").
- Daily / monthly caps (currently only one rolling window per agent).
- Cap denomination in non-USDC currencies, or multi-currency caps.
- Strict (non-approximate) concurrency enforcement.
- Webhook on cap-approach (e.g. "you're at 90% of your daily cap").
- Per-API-key caps (currently caps are per-agent; all keys for an agent share).
- Cap policy expressed as code or rules (only flat numeric caps in Phase 3).

## Files this spec touches

| Path | Change |
|---|---|
| `src/spend-caps.ts` | New. `requireWithinSpendCap` middleware as in the pseudocode. |
| `src/auth.ts` | Extend agent select with the 4 cap columns; stash `agent_caps` on context; extend `AgentContext.Variables`. |
| `src/index.ts` | Mount `requireWithinSpendCap` between `withIdempotency` and the handler on `POST /route`. |
| `phase3-handoff.md` | Mark step 5 done. |
| `scripts/create-agent.ts` | Optional: accept `--per-call-cap`, `--rolling-cap`, `--rolling-window` flags so test agents can be provisioned with caps without manual SQL. |

No schema changes. The four cap columns and `idx_receipts_agent_issued` are already in `phase3-schema.sql`.
