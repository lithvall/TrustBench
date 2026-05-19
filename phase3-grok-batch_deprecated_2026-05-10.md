# [DEPRECATED 2026-05-10] Phase 3 — Steps 9–15: Grok's Work Batch

> **DEPRECATED 2026-05-10.** Phase 3 closed 2026-05-04 (see `phase3-closeout.md` for what shipped). The workflow rule changed 2026-05-04 — Grok no longer touches code, schemas, or signing logic; Claude implements directly with high-risk-surface self-review. This file was the work batch handoff to Grok during the previous workflow and has no live use. Kept for reference only.

**Owner of this doc (historical):** Claude. **Audience (historical):** Grok.
**Source of truth:** `phase3-handoff.md` (build order, workflow rule), plus the four design memos (`phase3-idempotency-design.md`, `phase3-spend-caps.md`, `phase3-x402-construction.md`, `phase3-provider-selection.md`, `phase3-receipt-generator.md`). Read those before touching code.

## Batch status (updated 2026-05-02)

All five steps in this batch are now landed locally — Steps 9, 13, 14, 15 in full, and the parts of Step 10 that needed Claude's authorship (the three x402 wire helpers) per the workflow rule. Nothing in this doc still requires Grok action.

What's outstanding for Phase 3:
- Apply `phase3-schema-quotes.sql` in the Supabase SQL editor before testing the live `/route` flow.
- Step 11 design memo (`phase3-paid-probing.md`) — Claude is shipping next.
- First end-to-end smoke test against a real or mock x402 provider.

The three TODO(grok) markers in `src/route-handlers.ts` are gone — replaced with the three live implementations Claude shipped 2026-05-02 after rejecting Grok's `buildXPaymentHeader` proposal (had a `quote.authorization ?? quote` fallback bug that would have produced malformed X-PAYMENT headers — see chat log for details).

## Status snapshot

What's already shipped, validated, and locked. **Do not modify these files.** Read them, build on top of them.

| Layer | File | State |
|---|---|---|
| Schema | `phase3-schema.sql` | Applied. Tables: `agents`, `api_keys`, `idempotency_keys`, `receipts`. |
| Schema (quotes) | `phase3-schema-quotes.sql` | **Apply in Supabase SQL editor before testing the live flow.** Creates the `quotes` table for Step 1→2 handoff. |
| Auth middleware | `src/auth.ts` | Working — argon2id verifier, attaches `agent_id` + `agent_caps` + others to context. |
| Idempotency middleware | `src/idempotency.ts` | Working — full state machine, validated end-to-end (8 scenarios). |
| Spend-cap middleware | `src/spend-caps.ts` | Working — validation paths verified including `max_price_required` / `max_price_invalid` rejections. |
| Provider selection | `src/provider-selection.ts` | Implemented by Claude. Reuses `getRankings()` from `scorer.ts`. |
| Receipt generator | `src/receipt-generator.ts` | Implemented by Claude. Sign-first persist-second, Ed25519 only, sum invariant. |
| Route handlers | `src/route-handlers.ts` | **Implemented end-to-end** — Claude wrote the architectural plumbing AND the three x402 wire helpers (probeFor402Challenge, buildXPaymentHeader, parseTxHashFromResponse). No `TODO(grok)` markers remain. |
| Verify-receipt script | `scripts/verify-receipt.js` | Implemented by Claude. `npm run verify-receipt -- <id-or-path>`. |
| Route mount + audit endpoint | `src/index.ts` | `POST /route` → `quoteHandler`, `POST /route/settle` → `settleHandler`, `GET /receipts/:id` → audit (Step 9). MCP manifest updated with `trustbench_route_quote` + `trustbench_route_settle` (Step 14). Methodology HTML restored with Phase 3 router section. |
| README | `README.md` | Step 13 applied — Phase 3 framing, no forbidden words. |
| `.env.example` | `.env.example` | Step 15 applied — three `TRUSTBENCH_*` vars appended. |
| scorer.ts | `src/scorer.ts` | Exports `signWithEd25519()` for the receipt generator. `signScorecard()` behavior unchanged. |
| Receipt schema | `phase3-schema.sql` | `receipts` table with denormalized cols + `receipt_json` JSONB. RLS public-read by id. |

## Workflow rule — non-negotiable

Per `phase3-handoff.md`:

> Anything where a bug enables double-charge, custody, signature forgery, or wrong-router-decision-under-load → Claude. Anything where a bug means an extra render or a typo in a string → Grok.

In this batch:

- **Pure-Grok (you implement, Claude reviews diff):** Steps 9, 13, 14, 15.
- **Collaborative (Claude has scaffolded; you fill the marked `// TODO(grok)` blocks; Claude reviews):** Step 10.
- **Not in this batch (Claude does first, then you):** Step 11 (needs a budget design memo from Claude before code), Step 12 (Claude implements verify-receipt.js — cryptographic correctness must mirror the generator exactly).

If anything in this doc looks ambiguous, ask Johan in the chat instead of guessing. The recurring pattern from prior rounds is *plausible-sounding spec that breaks the product* — see "Recurring failure modes" below.

## Recurring failure modes — do not repeat

These are the patterns that have surfaced across the spend-caps, idempotency, and x402 design rounds. Avoid them on this batch:

1. **Wrong Supabase env var.** The codebase uses `SUPABASE_SECRET_KEY` everywhere (`src/auth.ts`, `src/scorer.ts`, `src/spend-caps.ts`, `src/idempotency.ts`, `.env.example`). Do not write `SUPABASE_SERVICE_ROLE_KEY` — it's not the env var name. Two prior rounds had to be patched for this.
2. **Inventing dependencies.** `package.json` has 7 deps: `@hono/node-server`, `@node-rs/argon2`, `@supabase/supabase-js`, `dotenv`, `hono`, `ioredis`, `ulid`. **Do not** import `ethers`, `@x402/hono`, or any other package without explicit approval — they are not installed and CLAUDE.md forbids new heavy deps without authorization. The empty `node_modules/@x402/` directory is a stale leftover, not a usable package.
3. **Hallucinating schema columns.** `agents` has: `id, email, display_name, mode, spend_cap_per_call_atomic, spend_cap_rolling_atomic, spend_cap_rolling_window_minutes, spend_cap_currency, rate_limit_per_min, metadata, created_at, updated_at`. There is **no** `wallet_address` column. Wallet attribution comes from x402 payment authorization (per `phase3-agent-identity.md`), not a stored field.
4. **Replacing working code with stubs.** Don't refactor `auth.ts`, `idempotency.ts`, or `spend-caps.ts` in this batch. They're verified end-to-end. If you think a refactor is needed, surface to Johan + Claude first.
5. **Crossing the non-custodial line.** TrustBench does NOT operate hot wallets, does NOT submit on-chain transactions, does NOT act as an x402 facilitator, does NOT hold agent funds. The acid-test question for any payment-touching code: *"Who pays the provider, from which wallet, submitted by whom?"* If your answer involves a TrustBench wallet — it's wrong. Re-read `phase3-x402-construction.md` § "The non-custodial line".
6. **`x402 v2` does not exist.** The x402 spec is at v0.x. Headers are `X-PAYMENT` and `X-PAYMENT-RESPONSE`, not `PAYMENT-REQUIRED` / `PAYMENT-SIGNATURE` / `PAYMENT-RESPONSE`.

---

## Step 9 — `GET /receipts/:id`

**Goal:** A public-read endpoint that returns a stored signed receipt by id, for third-party verification.

**Constraints:**

- No auth. Receipts are public-by-id (RLS policy `"Public read by id"` already configured in `phase3-schema.sql`). The id is unguessable enough (26-char ULID) to act as the audit token.
- Validate `:id` matches `^rcpt_[0-9A-HJKMNP-TV-Z]{26}$` before any DB call. Malformed → 400.
- Look up `receipts WHERE id = :id`. Return `receipt_json` field as the response body. Not found → 404.
- Set `Content-Type: application/json`.
- Set `Cache-Control: public, max-age=86400, immutable`. Receipts never change after issuance — full-day caching is safe and reduces load on the audit endpoint.
- Set `Access-Control-Allow-Origin: *` (already set globally by `cors()` middleware in index.ts; just verify it's coming through).

**Where it goes:** Add to `src/index.ts`. Mount on the existing `app` instance, after the existing routes, before the `serve(...)` call. Suggested position: right after the `app.get('/.well-known/trustbench-pubkey', ...)` block — both are "verifier-facing" public endpoints.

**Code shape (you write this; ~30 lines):**

```ts
// GET /receipts/:id — public audit endpoint.
//
// Returns the signed receipt envelope ({ receipt, signature }) exactly as
// generated and stored. The id is unguessable (26-char ULID), so this is
// safe to expose publicly — anyone with the id can verify, no one can
// enumerate. Cache-Control is aggressive because receipts are immutable.
const RECEIPT_ID_RE = /^rcpt_[0-9A-HJKMNP-TV-Z]{26}$/;

app.get('/receipts/:id', async (c) => {
  const id = c.req.param('id');
  if (!RECEIPT_ID_RE.test(id)) {
    return c.json({ error: 'receipt_id_invalid' }, 400);
  }

  // Use the same Supabase client pattern as auth.ts / idempotency.ts.
  // SUPABASE_SECRET_KEY (NOT _SERVICE_ROLE_KEY).
  const { data, error } = await supabase
    .from('receipts')
    .select('receipt_json')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    console.error('[receipts] lookup failed:', error.message);
    return c.json({ error: 'receipt_unavailable' }, 503);
  }
  if (!data || !data.receipt_json) {
    return c.json({ error: 'receipt_not_found' }, 404);
  }

  return c.json(data.receipt_json, 200, {
    'Cache-Control': 'public, max-age=86400, immutable',
  });
});
```

If `index.ts` doesn't already have a top-level Supabase client, you can either (a) reuse the pattern from `src/auth.ts` (instantiate a client at module top with `createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } })`), or (b) lazily initialize on first request like `src/idempotency.ts` does. Either is fine; pick one and document briefly with a comment.

**Acceptance criteria:**

- ✅ `GET /receipts/rcpt_<26-char-ulid>` for an existing receipt returns the full `{ receipt, signature }` JSON envelope, status 200.
- ✅ `GET /receipts/garbage` returns 400 `{"error":"receipt_id_invalid"}`.
- ✅ `GET /receipts/rcpt_aaaaaaaaaaaaaaaaaaaaaaaaaa` (well-formed but non-existent id) returns 404 `{"error":"receipt_not_found"}`.
- ✅ Response includes `Cache-Control: public, max-age=86400, immutable`.
- ✅ `tsc --noEmit` passes with zero errors in `src/index.ts`.

**Acceptance test (Johan will run after merge):**

```powershell
$BASE = "http://localhost:3000"
# 400 — malformed id
curl.exe -i "$BASE/receipts/garbage"
# 404 — well-formed but absent
curl.exe -i "$BASE/receipts/rcpt_aaaaaaaaaaaaaaaaaaaaaaaaaa"
# 200 — once a real receipt exists in the table (after step 10 ships, or via manual SQL insert)
```

---

## Step 10 — `POST /route` (real handler) + `POST /route/settle`

**Status:** Claude has scaffolded `src/route-handlers.ts` and wired both routes into `src/index.ts`. The architectural plumbing is done. Three `TODO(grok)` functions remain — pure I/O glue around the live x402 spec.

**Your three TODO functions** (all in `src/route-handlers.ts`):

| Function | Line | What it does |
|---|---|---|
| `probeFor402Challenge(providerUrl)` | 632 | GET the provider URL, parse its 402 body, return an `X402Challenge` object (or null). 10s timeout. Field-name mapping is yours — confirm against the live x402 v0.x spec. |
| `buildXPaymentHeader(quote, signature)` | 664 | Build the `X-PAYMENT` header value: base64 encoding of a JSON object combining the EIP-3009 authorization struct (from `quote`) and the agent's `signature`. Confirm shape against the live spec. |
| `parseTxHashFromResponse(providerResp)` | 688 | Extract `tx_hash` from the `X-PAYMENT-RESPONSE` header (base64-encoded JSON). Return null if missing/malformed. |

There are also three inline `TODO(grok)` comments at lines 426, 437, 473 inside `settleHandler` — they reference the three functions above and provide additional implementation context. Read them when you implement, but you don't need to add new functions for them.

**What Claude has already done — DON'T reimplement:**

- All validation logic (`payer_address`, `signature`, `route_id`, `capability` shape checks)
- All error-response shapes (every `error` code matches `phase3-x402-construction.md` § "Step 1/2 error responses" exactly)
- The settle-lock claim/replay/in-flight state machine (`'_settle:' + route_id` namespacing in `idempotency_keys`)
- Integration with `selectProvider()` (primary + fallback handling, score validation, freshness floor)
- Integration with `issueReceipt()` (all the input fields populated correctly, including the sum invariant `total = price + fee`)
- The challenge-validation layer (`validateChallenge()`) that checks scheme/network/asset/recipient/amount/valid_before
- The `quotes` table insert at the end of `quoteHandler`
- The full top-of-file comment block — read it carefully, especially the "facts to NOT assume during implementation" list

**Constraints (from `phase3-x402-construction.md`, repeated here for emphasis):**

- TrustBench is **HTTP middleware only.** No on-chain submit. No hot wallet. No facilitator role.
- Headers are `X-PAYMENT` and `X-PAYMENT-RESPONSE`. **NOT** `PAYMENT-REQUIRED` / `PAYMENT-SIGNATURE` / `PAYMENT-RESPONSE` (those are hallucinated from a prior review round — don't use).
- Phase 3 chain is Base mainnet, asset is USDC at `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`, scheme is EIP-3009 transferWithAuthorization. These are locked.
- **Do not import `ethers`, `viem`, or any chain client.** TrustBench does no on-chain interaction. The only library you might need is the standard `fetch` (already global in Node 18+) and `Buffer.from(..., 'base64')` for the X-PAYMENT encoding.

**Acceptance test (Johan + Claude will run after merge):**

1. Apply `phase3-schema-quotes.sql` in Supabase SQL editor.
2. Restart dev server (`npm run dev`).
3. Send a `POST /route` with a valid auth header, idempotency key, and `{capability, max_price, payer_address}`. Expected: 200 with `route_id` + `payment_required` block.
4. Sign the payment_required payload off-server (or skip and use a known-good signature for a local mock provider).
5. Send `POST /route/settle` with `{route_id, signature}`. Expected: 200 with `{response, receipt}` and `X-Receipt-Id` header.
6. `GET /receipts/<id>` returns the same receipt envelope (validates step 9 too).
7. `npm run verify-receipt -- <id>` returns "SIGNATURE VALID".

For local testing without an actual x402 provider, set up a tiny mock that returns a 402 with the canonical body shape on probe, and a 200 + X-PAYMENT-RESPONSE on settle. The mock can be in-process or a separate Node script — your call.

**`tsc --noEmit` requirement:** Your changes must keep the typecheck clean. The current code passes (zero errors across all 8 src files); confirm before claiming done.

---

## Step 11 — Real paid probing

**Status: NOT in this batch.** Claude needs to design the scope + budget cap first. CLAUDE.md authorizes $10–20/mo for real API calls; the design memo will lock which capabilities, which providers, what frequency, and how the per-month cap is enforced (probably a Postgres counter + GitHub Action soft-stop).

When the design memo (`phase3-paid-probing.md`) lands, you'll get a separate work-batch doc for it. Don't start any paid-probe code before that doc exists.

---

## Step 12 — `scripts/verify-receipt.js`

**Status: NOT in this batch.** Claude implements this directly per the workflow rule. The verifier's JCS canonicalization and Ed25519 verification logic must mirror the generator's exactly — even a 1-byte canonicalization difference produces silent verifier failures, which is a worse outcome than a loud crash.

Claude will ship this once `src/receipt-generator.ts` lands, so the round-trip can be tested in the same commit.

If Johan asks you to write a wrapper or example script that calls `verify-receipt.js`, that's fine — but the cryptographic primitive itself is Claude's work.

---

## Step 13 — README + methodology page updates

**Goal:** Update public copy to reflect the Phase 3 framing without overpromising. Honest measurement framing is a hard rule (CLAUDE.md § Rules).

### `README.md`

Current state: still references the older "best x402 providers" framing in places. Rewrite the top of the README so it leads with what TrustBench actually is *today* — a registry + live telemetry — and previews the router as **"shipping in Phase 3"** without claiming it's live.

**Key constraints:**

- **Don't** use the words "benchmark," "ranking authority," or "reputation oracle." CLAUDE.md bans them until the underlying measurement justifies them.
- **Do** describe the prober honestly: HEAD-based liveness check from one host, 3 sequential samples per provider per night, 4xx/429 treated as alive. (Same wording as the `/methodology` page.)
- **Do** mention Ed25519-signed scorecards and the public key URL.
- **Do** mention the upcoming router with the four primitives (idempotency, spend caps, signed receipts, queryable audit) — but frame as *"in Phase 3 build, not yet live."*
- **Don't** mention TrustBench operating any wallet, submitting any transaction, or holding any funds. We are middleware.

Suggested sections:

```
# TrustBench

A non-custodial smart router and payment-plumbing layer for x402 agents.

## What's live today
- Public registry of x402 endpoints (~20 providers across search/inference/data)
- Nightly liveness probe (HEAD requests from a single cloud host, 3 samples per
  provider, statuses 200/201/204/401/402/403/404/405/429 treated as alive)
- Score derivation: 15 + 45·successRate + 35·latencyHealth + 3·consistency,
  clamped to [40, 98], via linear-interpolation percentiles
- Ed25519-signed scorecards, public key at /.well-known/trustbench-pubkey
- Methodology disclosure at /methodology

## What's in Phase 3 build (not yet live)
- Authenticated POST /route endpoint with API-key auth (argon2id), idempotency
  keys, hard spend caps, and Ed25519-signed receipts
- /route/settle endpoint forwarding agent-signed EIP-3009 authorizations
- Queryable audit at /receipts/:id

## What we don't do
- We never hold agent funds, never submit transactions on-chain, never act as
  a payment facilitator. Agents sign EIP-3009 transferWithAuthorization
  payloads; providers submit them on-chain and pay gas. TrustBench observes
  the resulting tx_hash and records it in a signed receipt.

## Pricing model
- Flat per-tx fee on routed calls (Phase 3+; exact value TBD)
- Optional policy subscription (Phase 4+)
- Refundable provider verification bond — pay-to-list, never pay-to-rank
```

### `/methodology` page

Currently in `src/index.ts` lines ~108–213. Add a new section after the existing "Roadmap" block, titled **"Phase 3 router (in build)"**, that briefly describes the four primitives that are coming. Use the same caveat tone as the rest of the page — the Phase 3 router is described in present tense for what's designed, future tense for what's live.

**Acceptance criteria:**

- ✅ README.md does not contain the words "benchmark," "ranking authority," or "reputation oracle."
- ✅ README.md describes the probe behavior honestly (HEAD, 3 samples, single host, 4xx/429 = alive).
- ✅ README.md does not promise the router is live.
- ✅ /methodology page renders cleanly with new Phase 3 router section.
- ✅ No claims about TrustBench wallets, on-chain submissions, or facilitator behavior.

---

## Step 14 — MCP tool description for `/route`

**Goal:** Update the existing `/mcp/tools` endpoint in `src/index.ts` (lines ~76–100 currently) so the `trustbench_route` tool description matches the actual Phase 3 contract.

The current description is for the old public `GET /route` (score-based recommendation). Phase 3's `POST /route` is different — it's a quote endpoint that requires auth + an idempotency key + a payer wallet, and returns an x402 challenge.

**Replace the existing `trustbench_route` tool entry with two entries** — one for the Phase 3 quote endpoint, one for the settle endpoint:

```ts
{
  name: "trustbench_route_quote",
  description: "Request a payment quote for a capability. Returns a route_id and an x402 payment challenge that the agent's wallet must sign with EIP-3009 transferWithAuthorization. Phase 3 supports Base mainnet + USDC only.",
  parameters: {
    type: "object",
    properties: {
      capability: { type: "string", enum: ["search", "inference", "data"] },
      max_price: {
        type: "string",
        description: "Maximum the agent will pay for this call, in atomic units of USDC (6 decimals). Example: '10000' = $0.01."
      },
      payer_address: {
        type: "string",
        pattern: "^0x[0-9a-fA-F]{40}$",
        description: "The agent's wallet address (EOA) that will sign the EIP-3009 authorization."
      },
      idempotency_key: {
        type: "string",
        minLength: 16,
        maxLength: 128,
        description: "Unique per logical request, supplied as the Idempotency-Key header. Retries with the same key replay the cached quote."
      }
    },
    required: ["capability", "max_price", "payer_address", "idempotency_key"]
  }
},
{
  name: "trustbench_route_settle",
  description: "Submit the agent's signed EIP-3009 transferWithAuthorization to settle a previously quoted route. Returns the provider's response plus a signed Ed25519 receipt (verifiable at /receipts/:id).",
  parameters: {
    type: "object",
    properties: {
      route_id: {
        type: "string",
        pattern: "^qt_[0-9A-HJKMNP-TV-Z]{26}$",
        description: "The route_id returned from trustbench_route_quote."
      },
      signature: {
        type: "string",
        pattern: "^0x[0-9a-fA-F]{130}$",
        description: "65-byte ECDSA signature (r || s || v) over the EIP-3009 authorization payload."
      }
    },
    required: ["route_id", "signature"]
  }
}
```

Keep the existing `trustbench_get_rankings` entry unchanged.

**Acceptance criteria:**

- ✅ `/mcp/tools` returns the two new tool entries (quote + settle).
- ✅ The schemas are JSON-schema-compatible and consistent with the contract in `phase3-x402-construction.md` (max_price as string atomic units, payer_address as 0x+40-hex, route_id as `qt_<26-char>`).
- ✅ Old `trustbench_route` entry is removed (it described the obsolete public GET /route).

**One caveat:** these tool definitions describe behavior that's not shipped yet (step 10 hasn't landed). That's fine — the `/mcp/tools` endpoint is a manifest, not a live router. When step 10 ships, MCP-aware agents will be able to use these definitions immediately.

---

## Step 15 — `.env.example` additions

**Goal:** Document the new env vars introduced by Phase 3 so a clean Railway deploy + a clean local clone both have everything they need.

**Append to existing `.env.example`** (do not remove existing entries). The block to add:

```
# ---------------------------------------------------------------------------
# Phase 3: Receipt generator + audit endpoint
# ---------------------------------------------------------------------------
# DNS host of this TrustBench deployment. Used in receipt.issuer field and as
# the default for TRUSTBENCH_BASE_URL. Lets staging vs prod coexist with
# different signed receipts traceable to the issuing instance.
TRUSTBENCH_ISSUER_HOST=trustbench.io

# Public base URL for receipts and the public-key endpoint. Used to build
# receipt.audit.audit_url and signature.public_key_url. Should be the URL
# verifiers can fetch the public key from. Defaults to https://<TRUSTBENCH_ISSUER_HOST>.
TRUSTBENCH_BASE_URL=https://trustbench.io

# Signing key identifier. Tracked on every receipt for rotation hygiene.
# Bump on key rotation (e.g. trustbench-2027). Verifiers gate on key_id +
# public_key_url to handle multi-key setups.
TRUSTBENCH_KEY_ID=trustbench-2026
```

**Do NOT add any of these** (they would imply a custodial architecture):

- ❌ `BASE_RPC_URL` — TrustBench does not call any chain RPC.
- ❌ `GAS_SPONSOR_PRIVATE_KEY` — TrustBench does not operate a wallet.
- ❌ `X402_FACILITATOR_URL` — TrustBench is not a facilitator.

If you find any of these in any prior Grok writeup that hasn't been merged yet, ignore them — they were rejected on architectural grounds in `phase3-x402-construction.md` review.

**Acceptance criteria:**

- ✅ `.env.example` has the three new TRUSTBENCH_* entries with the descriptions above.
- ✅ Existing entries (SUPABASE_*, UPSTASH_REDIS_URL, PAY_TO_ADDRESS, PROBE_REGION, TRUSTBENCH_SIGNING_*, SIGNING_SECRET) are not modified.
- ✅ No on-chain or RPC env vars added.

---

## Acceptance gate before merging

Before you (Grok) tag any of this work as done in your reply to Johan, run this pre-flight:

1. **Read your diff once.** Specifically grep your own diff for: `SERVICE_ROLE_KEY`, `ethers`, `@x402/`, `wallet_address` (as a column reference), `BASE_RPC_URL`, `GAS_SPONSOR`, `facilitator`, `PAYMENT-REQUIRED` (vs `X-PAYMENT`), `x402Version: 2`. Any hit = revisit before claiming done.
2. **`tsc --noEmit` passes.** No new type errors in any file you touched.
3. **No working middleware was modified.** `src/auth.ts`, `src/idempotency.ts`, `src/spend-caps.ts` should not appear in your diff for this batch. If you think they need changes, surface to Johan first.
4. **Receipt-spec / generator integration looks plausible.** For step 14, the MCP descriptions reference the same field names and types the receipt generator and x402 memos use.
5. **Honest framing.** No "benchmark," "ranking authority," "reputation oracle" anywhere. No claims about live routing if step 10 hasn't shipped yet.

If all five pass, write your handoff message to Johan with: (a) a one-sentence summary per step, (b) any open questions that came up, (c) a list of the exact files you touched and the line ranges. Johan or Claude will review the diff and give you the green light to merge.

## What's next after this batch

Once steps 9, 13, 14, 15 are merged, the remaining Phase 3 work is:

- **Step 10 scaffold** lands from Claude → you fill the TODO blocks → Claude reviews → merge.
- **Step 11 design memo** lands from Claude → you implement the paid-probe script → merge.
- **Step 12** (verify-receipt.js) ships with step 10 in a single Claude commit.

After that, Phase 3 is done and we move to validating with first paid traffic (the "first design partner" milestone — likely InfopunksHQ given the receipt spec collaboration).
