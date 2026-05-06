# Phase 3 Closeout + Phase 4 Plan

**Status:** Phase 3 design and implementation are complete. Closeout testing + small polish items remaining. Phase 4 work queued behind closeout.

**Date:** 2026-05-03
**Audience:** Fresh Claude session picking up TrustBench. Read this first; it supersedes `phase3-handoff.md` as the entry-point doc.

---

## What's done — do not redo

All design memos shipped:
- `phase3-handoff.md` (original build plan, now historical)
- `phase3-agent-identity.md`
- `phase3-idempotency-design.md`
- `phase3-spend-caps.md`
- `phase3-x402-construction.md`
- `phase3-provider-selection.md`
- `phase3-receipt-generator.md`
- `phase3-paid-probing.md`
- `receipt-spec-v1.md`
- `phase3-valeo-stress-test.md`
- `x402-ecosystem-state.md`
- `phase3-grok-batch.md`

All implementation in `src/` complete and type-checks clean:
- `src/auth.ts` — argon2id API key auth + `agent_caps` loading. Validated.
- `src/idempotency.ts` — full state machine. 8 scenarios validated end-to-end.
- `src/spend-caps.ts` — middleware. 3 rejection branches smoke-tested.
- `src/provider-selection.ts` — top-2 with deterministic tiebreak.
- `src/receipt-generator.ts` — sign-first persist-second, Ed25519 only, sum invariant.
- `src/route-handlers.ts` — full quote + settle handlers, all three x402 wire helpers (probeFor402Challenge, buildXPaymentHeader, parseTxHashFromResponse) implemented.
- `src/index.ts` — POST /route + POST /route/settle + GET /receipts/:id wired. Methodology HTML restored. MCP tools manifest with two new entries.
- `src/scorer.ts` — exports `signWithEd25519` for receipt generator (existing scorecard signing unchanged).

Scripts:
- `scripts/create-agent.ts` — agent provisioning.
- `scripts/keygen.js` — Ed25519 keypair generator.
- `scripts/verify-scorecard.js` — reference verifier for scorecards (existing).
- `scripts/verify-receipt.js` — reference verifier for receipts (NEW).
- `scripts/mock-provider.ts` — local x402 mock for smoke testing.

Schema:
- `phase3-schema.sql` — applied. Tables: agents, api_keys, idempotency_keys, receipts.
- `phase3-schema-quotes.sql` — applied (user confirmed 2026-05-02).

Operational:
- Ed25519 production keypair generated and deployed to Railway. Same key in local `.env`. Verified locally — `🔐 Scorecard signing: Ed25519 (publicly verifiable)` log line confirms.
- `TRUSTBENCH_BASE_URL` set in Railway.
- README.md replaced with Phase 3 framing (no forbidden words).
- `.env.example` extended with three TRUSTBENCH_* vars.

Validated end-to-end:
- ✅ Idempotency happy path (8 scenarios)
- ✅ Spend-cap rejection paths (3 scenarios: max_price_required, max_price_invalid for "1.5", max_price_invalid for "0")
- ✅ Quote step against mock provider returned 200 with route_id + payment_required (smoke-tested 2026-05-02 14:04 UTC)

---

## What's outstanding — Phase 3 closeout (in order)

Each task below has a pass criterion. When all are green, Phase 3 is closed.

### 1. Phase A smoke test — settle round-trip with mock

**Goal:** Validate the entire wire shape including settle, receipt issuance, audit endpoint, and verifier.

**Pre-state:** Three windows running:
- W1: `npm run dev`
- W2: `npm run mock-provider`
- W3: where commands below run

The mock should already be registered in Supabase (run if not):
```sql
insert into providers (url, name, capability, description, pay_to)
values ('http://localhost:3001/', 'mock-x402', 'search', 'Phase 3 smoke-test mock', '0x000000000000000000000000000000000000Beef')
on conflict (url) do nothing;

insert into scorecards (provider_id, capability, score, latency_p50, latency_p95, uptime_7d, last_updated)
values ('http://localhost:3001/', 'search', 99, 5, 10, 100, now())
on conflict (provider_id) do update set score = 99, latency_p50 = 5, last_updated = now();
```

Pre-flight (W3):
```powershell
$BASE = "http://localhost:3000"
$KEY  = "tb_test_MW17B9HR46KTJ73Y9M692WF0KCFCE12T"
'{"capability":"search","max_price":"10000","payer_address":"0x0000000000000000000000000000000000000001"}' `
  | Set-Content -NoNewline -Path body.json
```

**A1 — Fresh quote.** Save the route_id from response.
```powershell
$IDEM_A = "settle-test-" + [guid]::NewGuid().ToString("N")
curl.exe -X POST "$BASE/route" `
  -H "Authorization: Bearer $KEY" `
  -H "Content-Type: application/json" `
  -H "Idempotency-Key: $IDEM_A" `
  --data-binary "@body.json" -i
$ROUTE_ID = "qt_<paste-from-response>"
```
**Pass:** 200 OK with `route_id`, `payment_required` (eip3009/base/USDC contract), `expires_at` 5min out, `fallback_provider` info.

**A2 — Settle with synthetic signature.**
```powershell
$FAKE_SIG = "0x" + ("ab" * 65)
@{ route_id = $ROUTE_ID; signature = $FAKE_SIG } | ConvertTo-Json -Compress | Set-Content -NoNewline -Path settle.json
curl.exe -X POST "$BASE/route/settle" `
  -H "Authorization: Bearer $KEY" `
  -H "Content-Type: application/json" `
  --data-binary "@settle.json" -i
$RECEIPT_ID = "rcpt_<paste-from-X-Receipt-Id-header>"
```
**Pass:** 200 OK with `X-Receipt-Id: rcpt_…` header. Body has `response` (mock's payload) + `receipt` (full envelope: `{ receipt: {...}, signature: { alg: "ed25519", value: "...", key_id: "trustbench-2026", public_key_url: "..." } }`).

**A3 — Audit endpoint.**
```powershell
curl.exe -i "$BASE/receipts/$RECEIPT_ID"
```
**Pass:** 200 OK, body byte-identical to A2's receipt envelope, `Cache-Control: public, max-age=86400, immutable`.

**A4 — Cryptographic verification.**
```powershell
npm run verify-receipt -- $RECEIPT_ID $BASE
```
**Pass:** `✅ SIGNATURE VALID — receipt is authentic.`

**A5 — Tamper test (optional).**
```powershell
curl.exe -s "$BASE/receipts/$RECEIPT_ID" | Set-Content -NoNewline -Path receipt.json
npm run verify-receipt -- ./receipt.json $BASE   # → VALID
(Get-Content receipt.json -Raw).Replace('"capability":"search"', '"capability":"infrnce"') | Set-Content -NoNewline -Path receipt-tampered.json
npm run verify-receipt -- ./receipt-tampered.json $BASE   # → INVALID
```
**Pass:** clean → VALID, tampered → INVALID.

### 2. Phase B idempotency edge cases on the live stack

After A passes (you'll have a working `route_id` + `RECEIPT_ID` for some tests).

**B1 — Quote replay (same idem-key, same body → cached 200).**
```powershell
# Same Idempotency-Key as A1
curl.exe -X POST "$BASE/route" `
  -H "Authorization: Bearer $KEY" `
  -H "Content-Type: application/json" `
  -H "Idempotency-Key: $IDEM_A" `
  --data-binary "@body.json" -i
```
**Pass:** 200 with `X-Idempotent-Replay: true`, **same `route_id`** as A1, no new probe to mock (mock window shows no new `[mock] 402 challenge issued`).

**B2 — Quote body mismatch (same idem-key, different body → 409).**
```powershell
'{"capability":"inference","max_price":"10000","payer_address":"0x0000000000000000000000000000000000000001"}' `
  | Set-Content -NoNewline -Path body-different.json
curl.exe -X POST "$BASE/route" `
  -H "Authorization: Bearer $KEY" `
  -H "Content-Type: application/json" `
  -H "Idempotency-Key: $IDEM_A" `
  --data-binary "@body-different.json" -i
```
**Pass:** 409 with `"error":"idempotency_key_reused_with_different_body"`.

**B3 — Settle replay (same route_id + same signature → cached 200).**
```powershell
# Same route_id + same signature as A2
curl.exe -X POST "$BASE/route/settle" `
  -H "Authorization: Bearer $KEY" `
  -H "Content-Type: application/json" `
  --data-binary "@settle.json" -i
```
**Pass:** 200 with **same response body and same receipt** as A2. Header `X-Idempotent-Replay: true` (or equivalent). Mock window shows no new `[mock] 200 settle`.

**B4 — Quote expiry → 410.** Manipulate `valid_until` in DB to expire it, then settle:
```sql
update quotes set valid_until = now() - interval '1 minute' where route_id = '<paste route_id>';
```
```powershell
@{ route_id = "<paste>"; signature = $FAKE_SIG } | ConvertTo-Json -Compress | Set-Content -NoNewline -Path settle-expired.json
curl.exe -X POST "$BASE/route/settle" `
  -H "Authorization: Bearer $KEY" `
  -H "Content-Type: application/json" `
  --data-binary "@settle-expired.json" -i
```
**Pass:** 410 with `"error":"route_id_expired"`.

### 3. Add `block_number` to receipt schema + envelope

Closes the "TrustBench could lie about chain" criticism from the Valeo stress test.

**Files to touch:**
- `phase3-schema.sql` (or a new migration) — add `block_number bigint` column to `receipts` table.
- `src/receipt-generator.ts` — add `block_number` field to `IssueReceiptInput`, plumb through to the `settlement` block of the receipt object and the DB row.
- `src/route-handlers.ts` — extend `parseTxHashFromResponse` to also return `block_number` if present in `X-PAYMENT-RESPONSE`. Pass to `issueReceipt`.
- `scripts/mock-provider.ts` — already includes `settled_at_block: 12345678` in the X-PAYMENT-RESPONSE; verify the parser picks it up.
- `receipt-spec-v1.md` — bump example to include `block_number`.

**Pass:** A receipt fetched after this change has `block_number` populated. Existing receipts (issued before the change) have NULL — acceptable.

### 4. Extend `scripts/verify-receipt.js` with `--check-chain` flag

Independent on-chain verification. Closes the same gap from a different angle.

**Behavior:**
- Default behavior unchanged (Ed25519 signature check only).
- With `--check-chain`, also fetches `tx_hash` from a Base RPC (env var `BASE_RPC_URL`, default to a public endpoint), confirms the on-chain transaction is a `transferWithAuthorization` matching the receipt's `payer_address` / `payee_address` / `amount_atomic` / `asset_address`.
- On mismatch, reports `❌ ON-CHAIN MISMATCH` with details.

**Note:** This adds a chain client dep. Either use viem (planned for Phase 11 paid-probe anyway) or stay with raw `fetch` against the JSON-RPC endpoint and decode the transaction calldata manually. **Recommend `viem` since it's already lined up for Step 11** — gets installed once, used by both.

**Pass:** `npm run verify-receipt -- <receipt-id> http://localhost:3000 --check-chain` against a receipt issued via the mock fails on-chain (expected — fake tx_hash doesn't exist). Against a receipt from a real x402 settle, succeeds.

### 5. Add "Failure semantics" section to README

Amplifies the non-custodial strength: TrustBench-down ≠ payments-down.

**Content:** A short section with a heading like "What if TrustBench is down?" explaining that agents retain the ability to transact directly with x402 providers, losing only routing decision + spend caps + signed receipts. Emphasize this property is architectural, not a feature flag.

**Pass:** README has the section. Public copy doesn't promise anything stronger than what the architecture delivers.

### 6. Honest-framing additions to README

Two specifics from the Valeo stress test:
- "Single-merchant routing in Phase 3, multi-merchant fan-out in Phase 4."
- "Spend caps approximately enforced under concurrency in Phase 3 — bounded by `(parallelism − 1) × max_price` per agent. Strict reservation-based caps in Phase 4."

**Pass:** README mentions both Phase 3 limits explicitly. No reader can infer fan-out or strict concurrency caps as today's behavior.

### 7. Step 11 — implement `scripts/paid-probe.ts` per `phase3-paid-probing.md`

Full design memo already written. Implementation steps from the memo's operational checklist:

1. Apply `phase3-schema-quotes.sql` ✅ (already done)
2. Provision probe agent with cap config (SQL in the memo).
3. Generate probe-only Ethereum wallet (NOT user's personal wallet). Pre-fund with $30 USDC on Base.
4. Add `viem` to `devDependencies` (`npm install --save-dev viem`).
5. Implement `scripts/paid-probe.ts` per the pseudocode in the memo.
6. Add `npm run paid-probe` to `package.json` scripts.
7. Add `.github/workflows/paid-probe.yml` cron — every 4 hours.
8. Append `SCRIPTS_PROBE_API_KEY`, `SCRIPTS_PROBE_WALLET_PK`, `SCRIPTS_PROBE_DRY_RUN`, `SCRIPTS_PROBE_MAX_PROVIDERS`, `SCRIPTS_PROBE_CAPABILITIES` to `.env.example`.
9. Test scenarios from the memo § "Test scenarios" — 8 scenarios.

**Workflow:** Claude reviews the EIP-712 signing function (signature surface). Grok or solo can implement the scaffolding.

**Pass:** Dry-run succeeds (env validation + provider pick + quote + skip-settle). Single-provider live run against the mock succeeds: real receipt issued, verifies via `verify-receipt`. Monthly cap soft-stop fires when receipts table sum exceeds $20 worth.

### 8. End-to-end smoke test against a real x402 endpoint

This requires either:
- (a) A real conforming x402 endpoint we can identify from `x402.org/ecosystem` or Agentic.Market, OR
- (b) The mock smoke test from Phase A passes (which it does once #1 is green) — accept that as Phase 3 closeout proof.

**Recommendation:** option (b) for Phase 3 closeout. Real-traffic validation belongs to Phase 4 once the registry refresh (item P4-1 below) lands and gives us actually-conforming endpoints to route to.

**Pass:** Phase A passes against the mock. (Real-traffic test can wait for Phase 4.)

### 9. Phase 3 sign-off

When tasks 1–8 are green, write a one-paragraph "Phase 3 closed" entry to `lessons.md` (if it exists) or to a new section in `TrustBench-strategy.md`. Captures: what shipped, what's measured (test pass/fail), what's deliberately deferred to Phase 4.

**Pass:** Sign-off entry written. Phase 3 is officially closed.

---

## Phase 4 plan — priority-ordered

Begin after Phase 3 closes. Each item has effort estimate and dependency notes.

### P4-1. Refresh registry against x402.org/ecosystem (~1–2 days)

**Why first:** the registry currently has 14 wrong-inventory entries (API-key roots of OpenAI/Anthropic/etc., not x402 endpoints). Until refreshed, paid probing can only run against the mock and the "real x402 traffic" milestone is gated.

**How:** Replace or augment the CDP-discovery-based crawler in `src/crawler.ts` with logic that consumes the x402.org/ecosystem directory (or scrapes Agentic.Market, or uses Coinbase's facilitator-discoverable endpoints). Validate each entry by probing for a real 402 challenge before inserting.

**Pass:** `select count(*) from scorecards where score >= 40 and last_updated > now() - interval '48 hours'` returns >5 entries that, when probed manually, return conforming 402 challenges with proper EIP-3009 fields.

### P4-2. Public receipt explorer (~2 days)

**Why:** counters Sentinel Explorer (Valeo's distribution weapon). Every transaction becomes marketing.

**How:**
- Add `agents.metadata.public_receipts: true` flag, default false.
- `GET /receipts/recent?limit=N` endpoint returning the last N publicly-flagged receipts (paginated).
- HTML dashboard at `GET /explorer` consuming that endpoint. Same plain-HTML style as `/analytics`.
- Internal probe receipts (Step 11) auto-flagged public — they're synthetic traffic with no privacy concern.

**Pass:** `/explorer` shows recent paid-probe receipts. Each receipt links to `/receipts/:id` for full envelope. Verifies via `npm run verify-receipt`.

### P4-3. Add Solana support (~3–5 days)

**Why:** Solana has surpassed Base in x402 transaction volume. Staying Base-only cedes both market reach and "the chain that matters" framing to Valeo.

**How:**
- `provider-selection.ts` already chain-agnostic; just need providers in scorecards with Solana network identifiers.
- `route-handlers.ts` quoteHandler validates `network` against an allowlist of known networks; extend to include `solana:<genesisHash>`.
- Receipt schema already has `chain` field; allow `'solana'` value.
- Probe wallet needs SPL token (USDC on Solana) funding in addition to Base.
- viem-equivalent for Solana signing (e.g., `@solana/web3.js`) — second chain dep.

**Pass:** End-to-end paid probe against a Solana x402 endpoint produces a receipt with `chain: "solana"`.

### P4-4. Publish `@trustbench/verify-receipt` on npm (~0.5 day)

**Why:** distribution + clone-resistance. Anyone copying the receipt format inherits TrustBench's exact JCS canonicalization. A subtly-different fork fails verification against the canonical reference.

**How:** Wrap `scripts/verify-receipt.js` as a published package. `package.json` for it, `npm publish`.

**Pass:** `npm install @trustbench/verify-receipt` works; the package's CLI mirrors the in-repo script's behavior.

### P4-5. Promote receipt-spec to public docs (~1–2 days)

**Why:** turns `receipt-spec-v1.md` from a draft InfopunksHQ doc into a canonical reference cited by integrators.

**How:** Stand up minimal docs site (Docusaurus or plain markdown on the project domain). Migrate `receipt-spec-v1.md` to `docs.trustbench.io/receipt-spec-v1`. Cross-link from main README.

**Pass:** Public URL serves the spec. Includes the verification recipe (Ed25519 + JCS + sample code).

### P4-6. Formal Infopunks integration (variable)

**Why:** named depth-integration vs. Valeo's breadth. Infopunks is the obvious candidate from Phase 2 conversations.

**How:** Out-of-band conversation with @InfopunksHQ. Confirm receipt-spec works for their consumption; ship adapter code if needed; co-write a launch announcement.

**Pass:** Infopunks publicly references TrustBench receipts as their canonical proof format.

### P4-7. Pre-authorized budgets (strict spend caps) (~3–5 days)

**Why:** closes the concurrency-overshoot gap in Phase 3's "approximately enforced" spend caps.

**How:** Reserve a per-agent budget envelope. Pre-flight check at quote time atomically debits the reserved-spend counter. On settle, the reservation becomes a real receipt. On settle failure, reservation is released. Either via row-level lock on the agents table or via a separate `pending_spend` table.

**Pass:** 50 concurrent calls each just under the per-call cap, totaling 10× the rolling cap, never overshoots. Stress test as part of integration suite.

### P4-8. Multi-merchant fan-out (`/route` accepts N capabilities) (~5–10 days)

**Why:** counters Valeo's "one intent, multiple paid APIs, one receipt" pitch (Sentinel framing).

**How:** Extend `/route` to accept an array of capabilities. Quote step returns N route_ids. Settle step takes N signatures and runs them in parallel. Receipt envelope lists N sub-receipts.

Partial-success semantics: agent gets back N sub-receipts; some succeeded, some failed; agent decides what to do (no protocol-level refunds on x402, document this clearly).

**Pass:** 5-merchant fan-out works end-to-end; partial failures produce a receipt envelope where some sub-receipts have errors, the rest have valid settlements.

### P4-9. Policy firewall subscription product (paid SKU) (~5–10 days)

**Why:** Phase 4 revenue. CLAUDE.md authorized $20–100/mo subscription range.

**How:** Layer on top of Phase 3 caps:
- Kill switch (per-agent emergency stop)
- Allow/deny lists (per-domain, per-capability)
- Optional human-in-the-loop confirmation for high-value calls
- Signed webhook alerts on cap-approach, kill events, etc.

Billing: Stripe subscription for the policy SKU (separate from per-tx fees on `/route`).

**Pass:** A subscribed agent can configure a kill switch; firing it immediately blocks subsequent `/route` calls. Webhooks fire on cap-80% events.

### P4-10. Refundable provider verification bond (~3–5 days)

**Why:** pay-to-list, never pay-to-rank. Provider-side product nobody else has. Per CLAUDE.md, this is the structural moat.

**How:** Provider posts a USDC bond on-chain (custodial via a smart contract — TrustBench is not the custodian). Bond holds for 90 days. Provider gets bond back at end of period if no fraud reports. Provider name/logo featured in registry as "verified."

**Pass:** Provider can deposit a bond, see "verified" status in registry, withdraw bond after 90 days if clean.

### P4-11. Receipt accounting export (CSV / ledger) (~2–3 days)

**Why:** enterprise procurement loves CSV exports. Also unlocks ProofRails integration (ISO-20022 layer).

**How:** `GET /agents/:id/receipts.csv?from=<date>&to=<date>` returns all receipts for the agent in CSV. Include all settlement + pricing fields.

**Pass:** A finance team can pull a month of receipts as CSV and import to QuickBooks / NetSuite / etc.

---

## Decision matrix — what's NOT in Phase 4

These come up in conversations but are deliberately deferred:

- **TrustBench operates a hot wallet / facilitator role.** No. Crosses the non-custodial line. Out of scope forever unless the user explicitly reverses the architectural commitment.
- **Issuing a TrustBench stablecoin.** No. Out of scope for the same reason as Valeo's UAID would conflict with merchants who already accept USDC.
- **Building a TrustBench iOS / consumer app.** No. Wrong target buyer. Stay infra.
- **Forking x402.** No. Vanilla-x402 alignment is the moat.
- **Percentage routing fees.** No. Phase 2 builders rejected this. Flat-per-tx only.
- **On-chain anchoring of receipts** (Merkle batching). Maybe Phase 5. Not Phase 4.
- **p402 / Canton support.** Phase 5 if real demand surfaces.

---

## Key files to read first (fresh session pick-up)

In order of priority:

1. **`CLAUDE.md`** — project working agreement. Auto-loaded.
2. **`phase3-closeout.md`** (this doc) — current state + remaining tasks.
3. **`x402-ecosystem-state.md`** — May 2026 ecosystem snapshot. Don't reason from May 2025 cutoff.
4. **`COMPETITIVE-LANDSCAPE.md`** — competitor analysis incl. Valeo (added 2026-05-03).
5. **`phase3-valeo-stress-test.md`** — point-by-point Valeo analysis + Phase 4 action items.
6. **`phase3-paid-probing.md`** — Step 11 implementation memo (next big code task).
7. **`receipt-spec-v1.md`** — receipt wire format.
8. **`TrustBench-strategy.md`** — strategic source of truth.

Auto-loaded memory entries (in `MEMORY.md`):
- Phase 3 build state
- Phase 2 validation outcome
- Receipt spec from InfopunksHQ
- Competitive landscape
- Grok design docs drift
- x402 ecosystem state May 2026

---

## Workflow rule (non-negotiable, copied from `phase3-handoff.md`)

**Claude designs the spec; Grok implements; Claude reviews the diff.**

The boundary: anything where a bug enables double-charge, custody, signature forgery, or wrong-router-decision-under-load → Claude. Anything where a bug means an extra render or a typo in a string → Grok.

Round-trip every diff that touches:
- Signing (Ed25519, argon2id, JCS canonicalization)
- Payment construction (x402 tx assembly, settlement checks)
- Idempotency lock semantics
- Spend cap enforcement
- Receipt emission

This held throughout Phase 3 and exposed several Grok hallucinations that would have shipped buggy code. Don't relax it for Phase 4.

