# Phase 3 — Idempotency Middleware Design

**Status:** Design complete. Implementation pending (Grok writes, Claude reviews).
**Decision date:** 2026-04-30

## Why this is the highest-stakes piece in Phase 3

From the Phase 2 r/AI_Agents conversation (verbatim):

> *"Spend control and idempotency, not signing. The ugly bug is duplicate pay-retry paths under partial timeouts; one missing request fingerprint and your agent buys the tool three times."*

Idempotency is the difference between "router demo" and "router that builders will trust with production agent traffic." It must be designed before code, not iterated on after a double-charge incident.

## Contract

**Header:** `Idempotency-Key: <client-supplied string, 16-128 chars>`. Required on `POST /route`. Missing or out-of-range → `400 Bad Request`.

**Promise:** for a given `(agent_id, idempotency_key)` pair, side effects (x402 payment, upstream call, receipt emission) execute *at most once*. A retry returns the cached response of the original.

**Same key + different body → 409.** A reused key with a different request body is a client bug; failing loud is safer than silently routing.

## Storage layout

Two layers, both required:

- **Postgres `idempotency_keys` (source of truth).** Composite PK `(agent_id, key)`. Schema in `phase3-schema.sql`.
- **Redis `idem:<agent_id>:<key>` (hot cache).** Sub-ms reads on the happy path. TTL 25 hours (Postgres expires at 24h; Redis is slightly longer to avoid Redis-fresher-than-PG races).

**Why both:** Postgres-only is too slow for hot-path retries (~5–20ms per lookup adds up under load). Redis-only is unsafe — Upstash can drop state on the free tier, and a Redis flush would re-enable double-charge. Postgres is the lock; Redis is the cache.

## State machine

```
                 ┌─────────────────┐
        insert   │                 │   handler succeeds
        ──────▶  │   in_flight     │  ────────────────▶  completed
                 │                 │
                 │                 │   handler errors
                 │                 │  ────────────────▶  errored
                 └─────────────────┘
                         │
                         │ created_at > 60s ago
                         ▼
                   abandonable
                  (next retry takes ownership)
```

Terminal states (`completed`, `errored`) are immutable until GC at 24h.

## Decision matrix on retry

For each retry, after looking up `(agent_id, key)`:

| Found state | Body hash matches? | Response |
|---|---|---|
| Not found | n/a | Claim the slot via `INSERT ... ON CONFLICT DO NOTHING`. If we won, execute. If we lost, fall through to "found" path below. |
| `in_flight` (≤60s old) | matches | `409` with `Retry-After: 5`. Original is mid-flight; client backs off. |
| `in_flight` (>60s old) | matches | Take ownership: bump `created_at = now()` and re-execute. Original is presumed abandoned. |
| `in_flight` (any age) | mismatches | `409 Conflict` — key reused with different body. |
| `completed` | matches | Return cached `response_body` + `response_status_code`. |
| `completed` | mismatches | `409 Conflict`. |
| `errored` | matches | Return cached error response (do NOT re-execute — clients should not get a different result on retry). |
| `errored` | mismatches | `409 Conflict`. |

## Body canonicalization

The `request_hash` is `sha256(JCS-canonical bytes)` of:

- The request JSON body
- The query string (sorted keys)
- The path

**NOT included:** the `Authorization` header (key rotation shouldn't invalidate idempotency), `Idempotency-Key` itself (circular), `X-Request-ID` and similar trace headers, `User-Agent`.

Canonicalization MUST match the receipt's `request_hash` so a consumer can verify both refer to the same request.

## The race conditions, named

### Race 1: two parallel requests with the same key
**Scenario:** client sends the same request twice in quick succession (e.g. due to a UI double-click or a buggy retry library).
**Resolution:** atomic `INSERT ... ON CONFLICT (agent_id, key) DO NOTHING RETURNING agent_id`. The winner gets a row back; the loser gets zero rows and falls through to the "found" path. No double execution.

### Race 2: server crash mid-flight
**Scenario:** handler accepted the request, wrote `in_flight`, started the x402 flow, then crashed.
**Resolution:** 60s abandonment timeout. The next retry sees `in_flight` older than 60s and takes ownership. Trade-off: if the original is still genuinely running at 61s, we double-execute. Acceptable because /route latency budget is ~5s typical (payment + upstream); 60s is a generous abandonment threshold.
**Future improvement (Phase 4):** heartbeat — the running handler updates `created_at` every 10s so abandonment is detected only when the heartbeat actually stops. Skipped for Phase 3 simplicity.

### Race 3: side effects partially complete on crash
**Scenario:** handler crashed *after* x402 payment confirmed but *before* receipt persisted.
**Resolution:** the receipt is the source of truth for "did this call succeed." If no receipt was written, we treat the call as not-yet-completed and the retry proceeds. The on-chain payment is sunk cost from the agent's perspective — but the agent will see *no receipt* for it, so they can dispute via the audit endpoint. **Document this in the API docs.** It's the one case where idempotency cannot fully save us; honesty about the failure mode beats pretending it's solved.
**Mitigation:** persist the receipt in the *same DB transaction* as the idempotency row's transition to `completed`, so a crash leaves both in `in_flight` (clean rollback). Then on next retry, since no settlement exists, the worst case is: x402 payment reaches the chain but our state shows in_flight → abandonable → retry. The retry will *not* re-pay if we check on-chain settlement state for the original tx hash before constructing a new tx. (See `phase3-x402-construction.md` — TBD.)

### Race 4: Redis fresher than Postgres
**Scenario:** we wrote Redis after a successful UPDATE in Postgres, but the UPDATE was actually rolled back due to a transaction failure further up the stack.
**Resolution:** Postgres is the source of truth. On Redis miss, always check Postgres. On Redis hit, trust it (the write order is PG-then-Redis, so Redis-fresher means PG was definitely fresher first). The only failure mode is Postgres-rolled-back-but-Redis-set, which leaves a stale Redis entry that will TTL out in 25h. Document the 24h potential staleness window for misconfigured deploys; in normal operation it never occurs.

### Race 5: GC-during-lookup
**Scenario:** janitor deletes an expired row between the failed `INSERT ... ON CONFLICT` and the follow-up `SELECT`.
**Resolution:** if the SELECT returns zero rows, recurse the whole idempotency check (it'll succeed on the second pass since the slot is now free). Log the recursion as a warning.

## Pseudocode

```typescript
// withIdempotency wraps a handler with the full idempotency contract.
// Caller is responsible for setting agent_id on the context via auth middleware.
async function withIdempotency(
  c: Context,
  rawBody: unknown,
  handler: () => Promise<Response>
): Promise<Response> {
  const agentId = c.get('agent_id');
  const key = c.req.header('Idempotency-Key');

  // ---- Header validation ---------------------------------------------------
  if (!key || key.length < 16 || key.length > 128) {
    return c.json({ error: 'Idempotency-Key header required (16–128 chars)' }, 400);
  }

  const requestHash = sha256Hex(jcsCanonicalize({
    body: rawBody,
    query: sortedQueryString(c.req.query()),
    path: c.req.path,
  }));

  // ---- Fast path: Redis read ----------------------------------------------
  const redisHit = await redis.get(`idem:${agentId}:${key}`);
  if (redisHit) {
    const cached = JSON.parse(redisHit) as CachedIdem;
    if (cached.request_hash !== requestHash) {
      return c.json({ error: 'Idempotency-Key reused with different body' }, 409);
    }
    if (cached.status === 'in_flight') {
      // Check Postgres for abandonment (Redis doesn't carry created_at fresh).
      // Falls through to slow path.
    } else {
      return new Response(JSON.stringify(cached.response_body), {
        status: cached.response_status_code,
        headers: { 'X-Idempotent-Replay': 'true' },
      });
    }
  }

  // ---- Slow path: try to claim the slot -----------------------------------
  const claim = await db.query<{ agent_id: string }>(
    `INSERT INTO idempotency_keys (agent_id, key, request_hash, status)
     VALUES ($1, $2, $3, 'in_flight')
     ON CONFLICT (agent_id, key) DO NOTHING
     RETURNING agent_id`,
    [agentId, key, requestHash]
  );

  if (claim.rows.length > 0) {
    // We won the lock. Warm Redis, execute, persist on completion.
    await redis.setex(
      `idem:${agentId}:${key}`,
      25 * 3600,
      JSON.stringify({ status: 'in_flight', request_hash: requestHash })
    );

    let response: Response;
    let finalStatus: 'completed' | 'errored' = 'completed';
    try {
      response = await handler();
      if (response.status >= 500) finalStatus = 'errored';
    } catch (err) {
      logError('handler-threw', err);
      response = c.json({ error: 'Internal error' }, 500);
      finalStatus = 'errored';
    }

    // Capture body for caching. Clone the response so the original can still be returned.
    const cloned = response.clone();
    const responseBody = await cloned.json().catch(() => null);

    // Persist final state. The /route handler is responsible for setting
    // X-Receipt-Id if a receipt was emitted; we capture it here for the FK.
    const receiptId = response.headers.get('X-Receipt-Id');

    await db.query(
      `UPDATE idempotency_keys
         SET status = $1, response_status_code = $2, response_body = $3,
             receipt_id = $4, completed_at = now()
       WHERE agent_id = $5 AND key = $6`,
      [finalStatus, response.status, responseBody, receiptId, agentId, key]
    );

    await redis.setex(
      `idem:${agentId}:${key}`,
      25 * 3600,
      JSON.stringify({
        status: finalStatus,
        request_hash: requestHash,
        response_body: responseBody,
        response_status_code: response.status,
      })
    );

    return response;
  }

  // ---- We lost the claim. Look up the existing row. -----------------------
  const existing = await db.query<IdempotencyRow>(
    `SELECT status, request_hash, response_status_code, response_body,
            extract(epoch from (now() - created_at)) as age_seconds
     FROM idempotency_keys
     WHERE agent_id = $1 AND key = $2`,
    [agentId, key]
  );

  if (existing.rows.length === 0) {
    // Race 5: GC took the row between our INSERT-conflict and SELECT.
    logWarn('idempotency-gc-race', { agentId, key });
    return withIdempotency(c, rawBody, handler);
  }

  const row = existing.rows[0];

  if (row.request_hash !== requestHash) {
    return c.json({ error: 'Idempotency-Key reused with different body' }, 409);
  }

  if (row.status === 'in_flight') {
    if (row.age_seconds > 60) {
      // Race 2: abandoned. Take ownership and recurse.
      await db.query(
        `UPDATE idempotency_keys SET created_at = now()
         WHERE agent_id = $1 AND key = $2 AND status = 'in_flight'`,
        [agentId, key]
      );
      logWarn('idempotency-abandoned-takeover', { agentId, key, ageSeconds: row.age_seconds });
      return withIdempotency(c, rawBody, handler);
    }
    return c.json(
      { error: 'Original request still in flight; retry shortly' },
      409,
      { 'Retry-After': '5' }
    );
  }

  // status is 'completed' or 'errored' — return the cached response.
  // Warm Redis on the way out so future replays hit the fast path.
  await redis.setex(
    `idem:${agentId}:${key}`,
    25 * 3600,
    JSON.stringify({
      status: row.status,
      request_hash: requestHash,
      response_body: row.response_body,
      response_status_code: row.response_status_code,
    })
  );

  return new Response(JSON.stringify(row.response_body), {
    status: row.response_status_code,
    headers: { 'X-Idempotent-Replay': 'true' },
  });
}
```

## GC

A separate cron (daily, GitHub Action) deletes expired rows:

```sql
DELETE FROM idempotency_keys WHERE expires_at < now();
```

Receipts referenced by deleted idempotency rows are unaffected (FK is `ON DELETE SET NULL` on `idempotency_keys.receipt_id`, but here we're deleting the idempotency row not the receipt — receipts persist forever).

## Test scenarios (for Grok to implement)

Grok should write at least these as integration tests against a real Postgres + Redis:

1. **Happy path.** New key + new body → 200 + receipt; no duplicate execution on second call.
2. **Replay completed.** Same key + same body, after first request finished → 200 + cached response, `X-Idempotent-Replay: true`, no second receipt written.
3. **Replay errored.** First request errors → cached error returned on retry; no re-execution.
4. **Body mismatch.** Same key + different body → 409.
5. **Concurrent same-key requests.** Two simultaneous requests → exactly one executes, the other gets 409 with `Retry-After`.
6. **Abandoned in_flight takeover.** Mark a row `in_flight` with `created_at` 90s ago → next request takes ownership and executes.
7. **Missing header.** No `Idempotency-Key` → 400.
8. **Out-of-range header.** Empty / 15-char / 129-char key → 400.
9. **Redis flush mid-flight.** Drop Redis between `in_flight` write and completion → next request hits Postgres directly and behaves correctly.
10. **GC race.** Delete the row between conflict and SELECT → recurse and proceed.

## Resolutions (2026-04-30)

The four design questions above were resolved jointly with Grok before implementation began. Decisions:

1. **Abandonment threshold:** 60s, **global default, not per-agent**. Per-agent configuration is a Phase 4 paid-policy feature; adding it to the schema in Phase 3 would violate "minimum production-ready primitive."
2. **Concurrent retry behavior:** **409 + `Retry-After: 5`** (the simpler option). Wait-and-return is deferred to Phase 4 if real traffic justifies the complexity. Error string for the abandonment-takeover case should read *"another request with this idempotency key was abandoned and is being retried"* — NOT "expired" (the key isn't expired; the prior attempt was orphaned).
3. **Body canonicalization library:** **same JCS implementation as the receipt generator.** One source of truth; future receipt-vs-idempotency-hash divergence bugs are too easy to introduce otherwise.
4. **`response_body` storage:** **JSONB.** The parse cost is dominated by upstream-call latency anyway, and queryability is worth it for debugging.

These decisions are locked for Phase 3. Re-open in Phase 4 if real builder traffic surfaces a reason to.
