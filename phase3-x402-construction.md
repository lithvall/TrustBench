# Phase 3 — x402 Construction & Settlement

**Status:** Design draft. Implementation pending (Claude scaffolds, Grok fills mechanical bits, Claude reviews — per phase3-handoff.md workflow rule).
**Decision date:** 2026-05-01

## Why this is the highest-stakes piece in Phase 3

Three things go wrong here and the project's positioning collapses:

1. **TrustBench accidentally becomes custodial.** The single non-negotiable claim of the product. If a single code path ever holds an agent's USDC for even a microsecond, we have to register as a money transmitter, the legal model breaks, and "non-custodial smart router" becomes false advertising in pitch decks.
2. **A double-charge bug ships.** The Phase 2 r/AI_Agents validation conversation explicitly named this: *"one missing request fingerprint and your agent buys the tool three times."* Idempotency (step 3 in the build order) is the first line of defense; this memo is the second — the actual payment construction must be re-entrant.
3. **The receipt's `tx_hash` is wrong, missing, or doesn't match what settled.** Then the audit endpoint returns receipts that don't verify on-chain, and the trust pitch ("queryable, signed audit trail") is gone.

This memo locks the wire protocol, the failure-mode matrix, and the interface to the receipt generator (step 8) so each can be implemented in isolation.

## The non-custodial line

**TrustBench never holds funds. TrustBench never holds an agent's private key. TrustBench never submits an on-chain transaction.**

The agent's wallet signs an EIP-3009 `transferWithAuthorization` payload. The signed payload authorizes the *provider* (not TrustBench) to pull a specific amount of USDC from the agent's wallet to the provider's wallet. The provider submits the transferWithAuthorization to Base, paying gas, getting a tx hash. TrustBench is a pure HTTP middleware: probe + relay + receipt. We never see the chain.

Two consequences for this design:

- **TrustBench has no signing key for x402.** The Ed25519 keypair we keep is for *receipt* signing only — that's TrustBench attesting "this call happened, here's the proof." It has no on-chain authority.
- **The settlement check is observational, not transactional.** TrustBench reads `tx_hash` from the provider's response and records it in the receipt. Whether the tx confirms is verifiable later by anyone with the receipt. We don't block the agent's response on confirmation.

If at any point a future Phase 4 design needs TrustBench to hold an allowance, broker a session key, or operate a router contract that escrows funds — that's a strategic decision that goes back to the user (and probably to legal). It is not a technical optimization to be made silently.

## Wire protocol — two-step

The agent's wallet signs once per call. The signature is over a payload that names a specific provider, a specific amount, and a short expiry. To produce that signature the agent has to know what they're signing. So the protocol is two steps:

```
┌──────────┐   1. POST /route                  ┌────────────┐
│  Agent   │ ──────────────────────────────▶  │ TrustBench │
│          │   { capability, max_price,        │            │
│          │     payer_address, ... }          │            │
│          │                                   │            │
│          │   1. response: 200                │            │
│          │ ◀──────────────────────────────   │            │
│          │   { route_id, payment_required }  │            │
│          │                                   │            │
│          │ ─── (agent signs locally) ───     │            │
│          │                                   │            │
│          │   2. POST /route/settle           │            │
│          │ ──────────────────────────────▶  │            │
│          │   { route_id, signature }         │            │
│          │                                   │            │
│          │                                   │   GET /api/...      ┌──────────┐
│          │                                   │   X-PAYMENT: ...   ─▶│ Provider │
│          │                                   │                      │          │
│          │                                   │   200 + tx_hash    ◀─│          │
│          │                                   │                      └──────────┘
│          │   2. response: 200                │            │
│          │ ◀──────────────────────────────   │            │
│          │   { response, receipt }           │            │
└──────────┘                                   └────────────┘
```

**Step 1 is read-mostly.** No on-chain action, no payment. We probe the provider, capture its 402 challenge, persist a quote, return it to the agent. The only side effect is reserving a `route_id` and writing a `quotes` row.

**Step 2 is the payment.** Lookup the quote, validate not expired, build the `X-PAYMENT` header from the agent's signature + the quoted payload, forward the original request to the provider, parse the tx_hash from the provider's response, hand off to the receipt generator. Provider does the on-chain submit.

The two steps are deliberately separate HTTP calls. An SDK can paper over them so the agent's user-facing API is one method, but the underlying wire is two requests because the agent can't sign a payload they haven't seen.

## Step 1 — Quote

### Request

```
POST /route
Authorization: Bearer tb_test_<...>
Idempotency-Key: <client-supplied, 16–128 chars>
Content-Type: application/json

{
  "capability": "search",
  "max_price": "10000",
  "payer_address": "0x1234..."
}
```

`payer_address` is the agent's wallet address (the EOA that will sign the transferWithAuthorization). It MUST be a 0x-prefixed 40-hex-char Ethereum address. Validate: `/^0x[0-9a-fA-F]{40}$/`. Reject 400 `payer_address_required` / `payer_address_invalid` if missing or malformed.

### Middleware chain (already wired)

`requireAgent → withIdempotency → requireWithinSpendCap → quoteHandler`

The cap check uses `max_price` as the conservative pre-flight bound. If it passes, we proceed to probe the provider.

### Quote handler logic

1. Read `capability`, `max_price`, `payer_address` from the body. (`max_price_atomic` is already on context from `requireWithinSpendCap`.)
2. **Provider selection** — out of scope for this memo (see `phase3-provider-selection.md`, step 7). Returns a chosen `provider_id` + `provider_url` plus the second-best fallback.
3. **Probe the chosen provider** for the capability endpoint. Send `GET <provider_url>` (or whatever the provider expects per its registry entry) with no `X-PAYMENT` header. Expect a `402 Payment Required` response.
4. **Parse the provider's 402 challenge.** The x402 spec returns the payment requirements in the response body as JSON. Required fields: `scheme` (must be `"eip3009"`), `network` (must be `"base"`), `asset_address` (must be Base USDC `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`), `recipient`, `amount`, `valid_after`, `valid_before`, `nonce`. Reject any provider that returns a non-conforming challenge (currency mismatch, wrong chain, schema violation) — return `502 provider_invalid_challenge` and try the fallback.
5. **Validate the quote against the agent's caps.** Provider's `amount` must be ≤ `max_price` (otherwise the provider is asking for more than the agent authorized — return `502 provider_overpriced` and try fallback). Provider's `recipient` must be a valid Ethereum address. `valid_before` must be at least 60 seconds in the future.
6. **Compute `valid_until`** = `min(provider.valid_before, now() + 5 minutes)`. Use the smaller of provider's expiry or our cap. Quotes never live longer than 5 minutes regardless.
7. **Generate `route_id`** = `"qt_" + ULID(26)`. Insert into `quotes` table (see Storage below).
8. **Return 200** with the route_id + provider's challenge + our expiry.

### Response

```
HTTP/1.1 200 OK
Content-Type: application/json

{
  "route_id": "qt_01HVAB...",
  "payment_required": {
    "scheme": "eip3009",
    "chain": "base",
    "asset": "USDC",
    "asset_address": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    "decimals": 6,
    "recipient": "0xPROVIDER...",
    "amount_atomic": "10000",
    "valid_after": 1714560000,
    "valid_before": 1714560300,
    "nonce": "0x<64-hex>"
  },
  "expires_at": "2026-05-01T17:00:00Z",
  "fallback_provider": {
    "provider_id": "...",
    "score_at_decision": 87
  }
}
```

`fallback_provider` is informational only — the agent doesn't act on it. It's there so downstream tooling can know what would have been picked next.

### Step 1 error responses

| Status | `error` | Cause |
|---|---|---|
| 400 | `max_price_required` / `max_price_invalid` | spend-cap middleware (already shipped) |
| 400 | `payer_address_required` / `payer_address_invalid` | not 0x + 40 hex chars |
| 400 | `currency_mismatch` / `per_call_cap_exceeded` | spend-cap middleware |
| 429 | `rolling_cap_exceeded` | spend-cap middleware |
| 502 | `provider_unavailable` | probe timed out / network error |
| 502 | `provider_invalid_challenge` | non-conforming 402 (wrong scheme/chain/asset) |
| 502 | `provider_overpriced` | provider quoted > max_price |
| 503 | `no_provider_for_capability` | provider selection returned empty |

## Step 2 — Settle

### Request

```
POST /route/settle
Authorization: Bearer tb_test_<...>
Content-Type: application/json

{
  "route_id": "qt_01HVAB...",
  "signature": "0x<130-hex>"
}
```

`signature` is the agent's EIP-3009 signature over the payment payload from Step 1. Validate shape: `/^0x[0-9a-fA-F]{130}$/` (65 bytes: r || s || v). We do NOT verify the signature ourselves — the provider does that on receipt of the X-PAYMENT header. We only sanity-check the shape.

### Middleware chain

`requireAgent → settleHandler`

Note: Step 2 does **not** mount `withIdempotency` or `requireWithinSpendCap`.

- The cap was approved at Step 1 against the `max_price` the agent committed to. Re-checking at Step 2 is wrong: the agent has signed an authorization based on the Step 1 quote, and rejecting at Step 2 would leave them with a signed authorization they can't redeem and no resolution path.
- Idempotency for Step 2 is keyed on `route_id`, server-enforced inside the handler (not on a client-supplied header). See "Step 2 deduplication" below.

### Settle handler logic

1. **Parse + validate** `route_id` and `signature` from the body.
2. **Lookup quote** by `route_id` in the `quotes` table. Reject:
   - Not found → 404 `route_id_not_found`
   - `valid_until < now()` → 410 `route_id_expired`
   - `agent_id != c.get('agent_id')` → 403 `route_id_owner_mismatch` (a different agent attempting to settle another agent's quote)
3. **Step 2 deduplication** (see below): try to insert a settle-lock row in `idempotency_keys` keyed on `(agent_id, '_settle:' + route_id)`. On conflict:
   - existing in_flight → 409 `settle_in_flight` + `Retry-After: 5`
   - existing completed → return cached response (replay)
   - existing errored → return cached response (replay; do NOT re-attempt)
4. **Build the X-PAYMENT header.** Per the x402 spec, the X-PAYMENT value is a base64 encoding of `{ payload: <quote.payment_required>, signature: <agent's signature> }`. The exact JSON shape follows the live x402 protocol version we lock to in `phase3-handoff.md` (currently x402 v0.x — the version published by Coinbase as of the date this memo was written).
5. **Forward to the provider.** Replay the original capability request (the same probe URL from Step 1) with `X-PAYMENT: <base64>`. Use a 30-second timeout. Provider validates signature, submits transferWithAuthorization to Base (paying gas with provider's wallet), and returns the service response.
6. **Parse the provider's response.** Expected:
   - `200 OK` + body = service response
   - `X-PAYMENT-RESPONSE` header containing `{ tx_hash, settled_at_block?, ... }` (or wherever the live x402 spec puts the settlement reference)
7. **Validate the settlement reference.** `tx_hash` must be a 0x-prefixed 64-hex-char string. Missing or malformed → 502 `provider_settlement_missing` (we don't issue a receipt without a valid tx_hash).
8. **Hand off to the receipt generator** (see `phase3-receipt-generator.md`, step 8) with the inputs:
   ```ts
   {
     agent_id, capability, provider_id, idempotency_key (from Step 1's row),
     request_hash, response_body, response_hash,
     chain: 'base', tx_hash, payer_address: quote.payer_address,
     payee_address: quote.recipient, amount_atomic: quote.amount_atomic,
     currency: 'USDC', decimals: 6, settled_at: now(),
     provider_price_atomic: quote.amount_atomic,
     trustbench_fee_atomic: '0',  // Phase 3 fee model TBD; see step 4
     total_paid_atomic: quote.amount_atomic,
     fee_model: 'flat_per_tx',
     score_at_decision, alternatives_considered, selection_reason
   }
   ```
   The receipt generator persists the receipt and returns the signed receipt object.
9. **Persist the settle-lock row** as `completed` with `response_body = { response, receipt }` (so retries replay).
10. **Return 200** with `{ response, receipt }`.

### Step 2 error responses

| Status | `error` | Cause |
|---|---|---|
| 400 | `route_id_required` / `route_id_invalid` | not `qt_<26-char-ulid>` |
| 400 | `signature_required` / `signature_invalid` | not 0x + 130 hex chars |
| 403 | `route_id_owner_mismatch` | agent_id mismatch on lookup |
| 404 | `route_id_not_found` | no quote with that id |
| 409 | `settle_in_flight` | concurrent settle, Retry-After: 5 |
| 410 | `route_id_expired` | quote past valid_until |
| 502 | `provider_error` | provider returned non-200 to X-PAYMENT |
| 502 | `provider_settlement_missing` | provider 200 but no/malformed tx_hash |
| 502 | `provider_signature_rejected` | provider returned 402 again (signature didn't validate on their end) |

## Step 2 deduplication

Server-enforced, not relying on the agent supplying an `Idempotency-Key` header. Implementation:

- The `idempotency_keys` table already exists. Insert a row with `(agent_id, key='_settle:' + route_id, request_hash=quote.payload_hash, status='in_flight')`.
- The `'_settle:'` prefix namespaces these rows so they cannot collide with agent-supplied idempotency keys.
- The same state machine as `withIdempotency`: `in_flight → completed | errored`, 60s abandonment threshold, etc.
- A duplicate `/route/settle` for the same route_id falls through to the same lookup-existing-row path. If completed, replay. If in_flight, 409.

This means Step 2 inherits all the idempotency invariants we just validated end-to-end (scenarios 1, 2, 4, 5, 6 from the idempotency suite) without writing new state-machine code. We just call into the same primitives.

## Quote storage

New table. Schema addition (call it `phase3-schema-quotes.sql`, applied alongside the existing `phase3-schema.sql`):

```sql
create table quotes (
  route_id text primary key,                          -- "qt_<26-char-ULID>"
  agent_id uuid not null references agents(id) on delete cascade,
  idempotency_key text not null,                      -- echo of Step 1 Idempotency-Key
  capability text not null,
  max_price_atomic text not null,                     -- agent-supplied ceiling
  payer_address text not null,

  provider_id text not null,                          -- matches scorecards.provider_id
  provider_url text not null,                         -- the URL we'll re-probe at settle
  recipient text not null,                            -- payee wallet (provider's)
  amount_atomic text not null,                        -- provider-quoted price (≤ max_price)
  asset_address text not null,
  chain text not null default 'base',
  scheme text not null default 'eip3009',
  nonce text not null,                                -- EIP-3009 nonce from provider's challenge
  valid_after bigint not null,
  valid_before bigint not null,                       -- epoch seconds; from provider

  -- Routing context for the eventual receipt
  score_at_decision int,
  alternatives_considered int,
  selection_reason text,

  payload_hash text not null,                         -- sha256(JCS canonical payment_required)
                                                       -- used as request_hash in the settle-lock row
  created_at timestamptz not null default now(),
  valid_until timestamptz not null,                   -- min(provider.valid_before, now() + 5min)
  expires_at timestamptz not null default now() + interval '24 hours'
);

create index idx_quotes_agent on quotes(agent_id);
create index idx_quotes_expires on quotes(expires_at);

alter table quotes enable row level security;
create policy "Service role full" on quotes
  for all using (auth.role() = 'service_role');
```

Quotes GC: same 24-hour TTL as `idempotency_keys`. Daily janitor deletes expired rows.

## Settlement verification

We do NOT block the agent's response on tx confirmation. The flow:

1. Provider's response arrives with tx_hash.
2. We trust the tx_hash and persist the receipt immediately.
3. The receipt's `settled_at` is the timestamp we received the provider's response (not when the tx confirmed on-chain).
4. The receipt's `tx_hash` is verifiable on-chain by anyone with a Base RPC. The audit endpoint (`/receipts/:id`) can re-verify on demand.

**Why not wait for confirmation:** Base block times are ~2 seconds, so a single confirmation would add ~2s latency on the happy path. Phase 2 builders consistently flagged latency as a sensitivity. The audit-after-the-fact model is well-precedented (every payment processor does this) and the cryptographic audit chain stays intact.

**What we do verify before issuing the receipt:**

- `tx_hash` is 0x + 64 hex chars (shape only)
- Provider returned a 200 (not 402, not 4xx, not 5xx)
- Provider's response body deserialized cleanly

**What we do NOT verify:**

- Whether the tx actually confirmed
- Whether the tx reverted
- Whether the amount transferred matches `quote.amount_atomic`
- Whether `from == payer_address` and `to == recipient` on-chain

Phase 4 add: an async confirmation worker that polls Base for each receipt's tx_hash, flags reverts in the audit endpoint, optionally webhooks the agent on a confirmed-revert.

## Failure modes — named matrix

| When | What went wrong | Receipt? | Agent sees |
|---|---|---|---|
| Step 1 | Provider doesn't respond | No | 502 provider_unavailable; agent retries (idempotent) |
| Step 1 | Provider returns non-x402 (200, 500, etc.) | No | 502 provider_invalid_challenge |
| Step 1 | Provider quotes > max_price | No | 502 provider_overpriced |
| Step 1 → Step 2 gap | Agent never returns signature; quote expires | No | Next settle attempt → 410 route_id_expired |
| Step 2 | Agent submits malformed signature | No | 400 signature_invalid |
| Step 2 | Provider rejects signature (returns 402) | No | 502 provider_signature_rejected |
| Step 2 | Provider returns 200 + tx_hash | **Yes** | 200 + receipt |
| Step 2 | Provider returns 200, no tx_hash | No | 502 provider_settlement_missing |
| Step 2 | Provider 200 + tx_hash, but tx reverts on-chain | **Yes (with the bad tx_hash)** | 200 + receipt; reverts surface in `/receipts/:id` audit |
| Step 2 | TrustBench crashes mid-settle (after provider 200, before receipt write) | No | Settle-lock row stays in_flight; abandonment takeover at 60s; retry replays request to provider, may double-charge if provider doesn't dedup tx_hash |

That last row is the residual hazard. The provider's tx_hash from the first attempt is still on-chain; if our retry calls the provider again, the provider will reject the second X-PAYMENT (the EIP-3009 nonce is consumed). So in practice the second attempt fails with `provider_signature_rejected`, no double-charge, but the receipt is lost. This is the documented "Race 3" from `phase3-idempotency-design.md` adapted to x402: payment confirmed, receipt missing — agent has on-chain proof via Base explorer + their wallet history, audit endpoint shows nothing. Acceptable Phase 3 trade-off; Phase 4 fix is a settlement-recovery worker that polls for orphan tx hashes per agent.

## Idempotency interaction

- Step 1 uses `withIdempotency` with the agent's `Idempotency-Key`. A retry of Step 1 with the same key replays the same quote (same `route_id`, same `payment_required`).
- Step 2 has its own dedup keyed on `route_id`, namespaced as `'_settle:' + route_id` in `idempotency_keys`. Two concurrent settles → one wins, other gets 409.
- Step 1 and Step 2 share zero state outside `quotes` and `idempotency_keys`. The two locks are independent.

## Spend-cap interaction

- Step 1 runs the cap check (`requireWithinSpendCap`) against `max_price`. Pass → proceed to probe and quote. Fail → 400/429.
- Step 2 does NOT re-check the cap. The contract is: once Step 1 returns a quote, the agent has authorization to settle it within the validity window.
- Edge case: between Step 1 and Step 2, another request settles and pushes the agent over the cap. The Step 2 settle still proceeds. Total spend exceeds the cap by up to `max_price` per outstanding quote. This is the documented "approximate enforcement" trade-off, consistent with `phase3-spend-caps.md`.

## Chain + currency lock for Phase 3

| Field | Phase 3 value | Lock reason |
|---|---|---|
| Chain | Base mainnet (chain_id 8453) | x402 reference implementation, low gas, fast blocks |
| Asset | USDC | x402's de facto asset; matches our spend-cap currency |
| Asset address | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` | canonical Base USDC |
| Decimals | 6 | matches USDC standard, matches our atomic-unit math |
| Payment scheme | EIP-3009 `transferWithAuthorization` | x402 v0.x default; gas paid by provider |
| Confirmations to verify before responding | 0 | observation-only model, see "Settlement verification" |
| x402 protocol version | locked at the version live in production on the date the first paid call ships | revisit if Coinbase ships a breaking spec change |

Phase 4 multi-chain / multi-asset is a separate design memo. Don't generalize early.

## Wallet model for the agent

The agent provides `payer_address` in Step 1. This is their EOA. It must:

- Hold sufficient USDC at the time the provider submits the transferWithAuthorization (otherwise the tx reverts and the receipt's tx_hash points to a failed tx).
- Be controlled by the agent (so they can sign the EIP-3009 authorization).

We do NOT verify the address actually holds USDC — that's a runtime concern resolved on-chain. We do NOT support smart accounts (ERC-4337) in Phase 3; that's a Phase 4 add.

The agent's signing happens entirely client-side. The agent's SDK (or the agent itself) computes the EIP-712 hash of the EIP-3009 payload from Step 1's response and signs with the EOA's private key. TrustBench never sees the key.

## Pseudocode

`src/route-handlers.ts` — to be created. Two handlers, mounted as:

```ts
app.post('/route', requireAgent, withIdempotency, requireWithinSpendCap, quoteHandler);
app.post('/route/settle', requireAgent, settleHandler);
```

```typescript
// ---- Step 1: quote ------------------------------------------------------
async function quoteHandler(c: Context<AgentContext>) {
  const agentId = c.get('agent_id');
  const maxPriceAtomic = c.get('max_price_atomic');     // string, validated by spend-cap mw
  const body = await c.req.json();
  const capability = body.capability as string;
  const payerAddress = body.payer_address as string;

  if (!/^0x[0-9a-fA-F]{40}$/.test(payerAddress)) {
    return c.json({ error: 'payer_address_invalid', detail: '...' }, 400);
  }

  // Provider selection — see phase3-provider-selection.md
  const selection = await selectProvider(capability);
  if (!selection.primary) {
    return c.json({ error: 'no_provider_for_capability' }, 503);
  }

  // Probe primary, fall back to secondary on failure
  const probeResult = await probeFor402Challenge(selection.primary.url);
  // ... fallback logic, validation of challenge fields ...

  if (BigInt(challenge.amount) > BigInt(maxPriceAtomic)) {
    return c.json({ error: 'provider_overpriced', ... }, 502);
  }

  const validUntil = new Date(Math.min(
    challenge.valid_before * 1000,
    Date.now() + 5 * 60 * 1000
  ));

  const routeId = 'qt_' + ulid();
  const payloadHash = sha256Hex(jcs(challenge));

  await supabase.from('quotes').insert({
    route_id: routeId,
    agent_id: agentId,
    idempotency_key: c.req.header('Idempotency-Key'),
    capability,
    max_price_atomic: maxPriceAtomic,
    payer_address: payerAddress,
    provider_id: selection.primary.id,
    provider_url: selection.primary.url,
    recipient: challenge.recipient,
    amount_atomic: challenge.amount,
    asset_address: challenge.asset_address,
    chain: 'base',
    scheme: 'eip3009',
    nonce: challenge.nonce,
    valid_after: challenge.valid_after,
    valid_before: challenge.valid_before,
    score_at_decision: selection.primary.score,
    alternatives_considered: selection.alternatives_count,
    selection_reason: selection.reason,
    payload_hash: payloadHash,
    valid_until: validUntil.toISOString(),
  });

  return c.json({
    route_id: routeId,
    payment_required: { ...challenge, amount_atomic: challenge.amount },
    expires_at: validUntil.toISOString(),
    fallback_provider: selection.secondary
      ? { provider_id: selection.secondary.id, score_at_decision: selection.secondary.score }
      : null,
  }, 200);
}

// ---- Step 2: settle ------------------------------------------------------
async function settleHandler(c: Context<AgentContext>) {
  const agentId = c.get('agent_id');
  const body = await c.req.json();
  const routeId = body.route_id as string;
  const signature = body.signature as string;

  if (!/^qt_[0-9A-HJKMNP-TV-Z]{26}$/.test(routeId)) {
    return c.json({ error: 'route_id_invalid' }, 400);
  }
  if (!/^0x[0-9a-fA-F]{130}$/.test(signature)) {
    return c.json({ error: 'signature_invalid' }, 400);
  }

  // 1. Lookup quote
  const { data: quote, error: lookupErr } = await supabase
    .from('quotes')
    .select('*')
    .eq('route_id', routeId)
    .maybeSingle();
  if (lookupErr) return c.json({ error: 'settle_unavailable' }, 503);
  if (!quote) return c.json({ error: 'route_id_not_found' }, 404);
  if (quote.agent_id !== agentId) return c.json({ error: 'route_id_owner_mismatch' }, 403);
  if (new Date(quote.valid_until) < new Date()) return c.json({ error: 'route_id_expired' }, 410);

  // 2. Settle-lock (Step 2 deduplication)
  const settleKey = '_settle:' + routeId;
  const { data: claim, error: claimErr } = await supabase
    .from('idempotency_keys')
    .insert({ agent_id: agentId, key: settleKey, request_hash: quote.payload_hash, status: 'in_flight' })
    .select('agent_id')
    .maybeSingle();

  if (claimErr && claimErr.code !== '23505') {
    return c.json({ error: 'settle_unavailable' }, 503);
  }

  if (!claim) {
    // Lost race — replay or 409
    const { data: existing } = await supabase
      .from('idempotency_keys')
      .select('status, response_status_code, response_body')
      .eq('agent_id', agentId)
      .eq('key', settleKey)
      .maybeSingle();
    if (!existing) return c.json({ error: 'settle_unavailable' }, 503);
    if (existing.status === 'in_flight') {
      return c.json({ error: 'settle_in_flight' }, 409, { 'Retry-After': '5' });
    }
    // completed or errored — replay
    return c.json(existing.response_body, existing.response_status_code as any, {
      'X-Idempotent-Replay': 'true',
    });
  }

  // 3. We won the lock. Build X-PAYMENT, forward to provider.
  try {
    const xPayment = buildXPaymentHeader(quote, signature);  // base64 encode per x402 spec
    const providerResp = await fetch(quote.provider_url, {
      method: 'GET',
      headers: { 'X-PAYMENT': xPayment },
      signal: AbortSignal.timeout(30_000),
    });

    if (providerResp.status === 402) {
      return await persistSettleResult(agentId, settleKey, 502,
        { error: 'provider_signature_rejected' }, null);
    }
    if (!providerResp.ok) {
      return await persistSettleResult(agentId, settleKey, 502,
        { error: 'provider_error', detail: `provider returned ${providerResp.status}` }, null);
    }

    const txHash = parseTxHashFromResponse(providerResp);  // X-PAYMENT-RESPONSE header
    if (!/^0x[0-9a-fA-F]{64}$/.test(txHash || '')) {
      return await persistSettleResult(agentId, settleKey, 502,
        { error: 'provider_settlement_missing' }, null);
    }

    const providerBody = await providerResp.json();
    const responseHash = sha256Hex(jcs(providerBody));

    // Hand off to receipt generator (phase3-receipt-generator.md)
    const receipt = await issueReceipt({
      agent_id: agentId,
      capability: quote.capability,
      provider_id: quote.provider_id,
      idempotency_key: quote.idempotency_key,
      request_hash: quote.payload_hash,
      response_body: providerBody,
      response_hash: responseHash,
      chain: 'base',
      tx_hash: txHash,
      payer_address: quote.payer_address,
      payee_address: quote.recipient,
      amount_atomic: quote.amount_atomic,
      currency: 'USDC',
      decimals: 6,
      settled_at: new Date(),
      provider_price_atomic: quote.amount_atomic,
      trustbench_fee_atomic: '0',
      total_paid_atomic: quote.amount_atomic,
      fee_model: 'flat_per_tx',
      score_at_decision: quote.score_at_decision,
      alternatives_considered: quote.alternatives_considered,
      selection_reason: quote.selection_reason,
    });

    return await persistSettleResult(agentId, settleKey, 200,
      { response: providerBody, receipt }, receipt.id);
  } catch (err) {
    return await persistSettleResult(agentId, settleKey, 502,
      { error: 'provider_unavailable', detail: String(err) }, null);
  }
}

async function persistSettleResult(agentId, settleKey, status, body, receiptId) {
  await supabase.from('idempotency_keys').update({
    status: status >= 500 ? 'errored' : 'completed',
    response_status_code: status,
    response_body: body,
    receipt_id: receiptId,
    completed_at: new Date().toISOString(),
  }).eq('agent_id', agentId).eq('key', settleKey);
  return c.json(body, status as any);
}
```

(Pseudocode. Real code lands in step 10 of the build order, with the receipt generator wired in once step 8 is designed.)

## Test scenarios

For Grok (or whoever implements step 10) to write integration tests against:

**Step 1 — Quote**

1. **Happy path.** Valid request → 200 with route_id, payment_required, expires_at, fallback_provider.
2. **Missing payer_address.** → 400 `payer_address_required`.
3. **Malformed payer_address.** Non-hex, wrong length, missing 0x → 400 `payer_address_invalid`.
4. **Provider unreachable.** Probe times out → falls back to secondary; if secondary also fails → 502 `provider_unavailable`.
5. **Provider returns non-402.** Returns 200 → 502 `provider_invalid_challenge`. Returns 500 → same.
6. **Provider quote > max_price.** Provider says amount=20000, agent's max_price=10000 → 502 `provider_overpriced` (try fallback first).
7. **Provider returns wrong chain.** challenge.network = "ethereum" → 502 `provider_invalid_challenge`.
8. **Provider returns wrong asset.** asset_address != Base USDC → 502 `provider_invalid_challenge`.
9. **valid_before too soon.** challenge.valid_before is 30s from now → 502 `provider_invalid_challenge` (we want ≥60s headroom).
10. **route_id ULID format.** Verify generated ids match `qt_<26-char-Crockford>`.

**Step 2 — Settle**

11. **Happy path.** Valid route_id + signature → 200 with response + receipt; receipt.tx_hash matches what provider returned.
12. **route_id not found.** → 404.
13. **route_id expired.** valid_until < now → 410.
14. **route_id owned by different agent.** → 403.
15. **Malformed signature.** → 400 signature_invalid.
16. **Provider rejects signature.** Provider returns 402 to our X-PAYMENT → 502 `provider_signature_rejected`.
17. **Provider returns no tx_hash.** Body 200 but X-PAYMENT-RESPONSE missing → 502 `provider_settlement_missing`.
18. **Provider returns malformed tx_hash.** "not_a_hash" → 502 `provider_settlement_missing`.
19. **Concurrent settles.** Two simultaneous /route/settle for same route_id → exactly one writes a receipt, the other gets 409 `settle_in_flight` + Retry-After: 5.
20. **Settle replay.** After successful settle, second /route/settle with same route_id → returns same response/receipt with `X-Idempotent-Replay: true`.
21. **Settle replay after error.** First settle errored → second settle replays the error response (does NOT re-attempt).
22. **Provider crashes mid-call.** TrustBench has the X-PAYMENT submitted but provider connection drops → settle-lock stays in_flight → 60s abandonment takeover → retry hits provider; provider already consumed nonce → returns 402 → 502 `provider_signature_rejected`. (No double-charge.)

## Locked decisions

1. **Two-step protocol.** `/route` (quote) + `/route/settle` (settle). Single-call session-key designs are deferred to Phase 4.
2. **TrustBench is HTTP middleware only.** No on-chain submit. Provider submits the transferWithAuthorization with their own gas wallet.
3. **No signature verification on TrustBench's side.** Sanity-check shape only. Cryptographic verify is the provider's job and the on-chain tx's job.
4. **No on-chain confirmation wait before responding.** tx_hash is recorded; verification is observational and audit-after-the-fact.
5. **Quote validity ≤ 5 minutes,** `min(provider.valid_before, now() + 5 minutes)`.
6. **Phase 3 chain/asset:** Base mainnet, USDC at `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`, EIP-3009 transferWithAuthorization, 6 decimals.
7. **Step 2 dedup is server-enforced** on route_id (namespaced `'_settle:' + route_id` in `idempotency_keys`). The agent does NOT need an Idempotency-Key header on Step 2.
8. **No spend-cap re-check at Step 2.** Quote is the contract.
9. **Receipt is issued on provider 200 + valid tx_hash.** Other states do not produce a receipt.
10. **No refund/retry path for paid-but-no-receipt cases.** Documented as residual hazard; agent has on-chain proof via Base explorer regardless. Phase 4 adds a settlement-recovery worker.
11. **Schema addition: `quotes` table.** Applied via `phase3-schema-quotes.sql`. RLS service-role-only. 24h GC.

## Out of scope (Phase 4+)

- Multi-chain / multi-currency support.
- Smart accounts (ERC-4337) and session keys.
- Async on-chain confirmation worker + revert webhook.
- Settlement-recovery worker for orphan tx hashes.
- Refund flows (we don't hold funds, so we have no refund authority).
- TrustBench-as-paymaster / TrustBench-as-router-contract.
- Single-call protocol via wallet allowance (custodial-adjacent).
- Real-time price discovery (Phase 3 takes the provider's quote at face value; Phase 4 may compare quotes across providers).
- Receipt-of-receipts batching for high-throughput agents.

## Files this spec touches

| Path | Change |
|---|---|
| `phase3-schema-quotes.sql` | New. CREATE TABLE quotes + indexes + RLS. |
| `src/route-handlers.ts` | New. quoteHandler + settleHandler per pseudocode. |
| `src/x402.ts` | New. probeFor402Challenge, parseProviderChallenge, buildXPaymentHeader, parseTxHashFromResponse — pure functions, easy to unit-test. |
| `src/index.ts` | Mount /route handler change (already mounted; replace stub) and add `app.post('/route/settle', requireAgent, settleHandler)`. |
| `phase3-handoff.md` | Mark step 6 done. Step 10 (the real /route handler) is now mostly a wiring exercise once steps 7 + 8 are also designed. |
| `scripts/test-x402.ps1` | Optional. End-to-end smoke test against a local mock provider. Step 10 implementer can decide whether to ship. |

No changes to `auth.ts`, `idempotency.ts`, or `spend-caps.ts`. The chain-of-middleware they implement remains unchanged; this memo just adds two handlers and a new helper module on top.
