# Phase 4 — x402-paywall design pass

**Status:** Design-before-code. Authoritative answers to Q1–Q10 from `phase4-qbt-and-paywall-handoff.md` § "Work item 2." Anchored on the partnership-day shift (`partnership-day-record-2026-05-07.md`), the Strata-validated pricing tiers (approved 2026-05-08), and the solo-founder constraint set.

**Created:** 2026-05-08.

**Why this exists:** The committed revenue model is *x402-native paywalled API endpoints, no subscriptions* (decision logged 2026-05-07). This is a high-risk surface — revenue-bearing, public, cross-network — so the design pass lands before any code does. The doc resolves the architectural questions that would otherwise be re-litigated mid-implementation.

---

## 1. Strategic premise (settled, do not re-debate in implementation)

- TrustBench becomes a paying customer of its own protocol: paid endpoints emit 402, accept `X-PAYMENT`, settle via Coinbase facilitator on Base.
- Per-call USDC fees only. No subscriptions, no contracts, no enterprise sales motion.
- Paid endpoints are the differentiated work (routing decisions, signed verification, audit replay, compliance export). Free endpoints stay free wherever the ecosystem has normalized free (well-knowns, skill.md, llms.txt, MCP tool discovery, public discovery surfaces).
- Pricing tiers are anchors, not contracts. Reviewable on partner-volume discount basis; protected against silent revisions by a public `/pricing` page.
- All signed paid responses reuse the existing Ed25519 + JCS receipt envelope. No new signature scheme.

## 2. Constraints (non-negotiables)

- **Non-custodial.** TrustBench wallet receives its own routing fees and never holds agent funds destined for upstream providers. Provider payments go agent→provider directly via the x402 transaction the agent signs; TrustBench's fee is a separate x402 transaction settled to TrustBench's wallet.
- **Honest measurement framing.** Paywalling `/score-provider` does not upgrade what the prober measures. The methodology page stays.
- **No subscription tier.** Confirmed 2026-05-08.
- **No free tier in *commercial* relationship with named partners.** The *public* free-tier-by-IP for read endpoints is allowed as a discovery surface.
- **Ed25519 + JCS only.** EIP-712 / JWS only enters scope if a Foundation-track extension proposal lands, and that's deferred (decision 2026-05-07).
- **Solo-founder maintainability.** Whatever ships must run unattended. No 24/7 monitoring, no manual reconciliation, no support inbox.

---

## Q1. Which endpoints get paywalled first?

**Decision:** `/route` is the only endpoint paywalled in v0.1.0. Read endpoints (`/rankings`, `/receipts/:id`) keep their HTML responses free permanently and add a 60 req/IP/min free-tier quota for JSON, then 402 above quota. New paid endpoints (`/score-provider`, `/verify`, `/audit-replay`, `/compliance-export`) are designed in this doc but not shipped until v0.2.0+.

**Per-endpoint paywall plan:**

| Endpoint | Paid? | Pricing tier | Notes |
|---|---|---|---|
| `/health` | Free permanent | n/a | Monitoring norm. k8s probes, partner uptime checks. |
| `/rankings` (HTML) | Free permanent | n/a | Marketing surface. Discovery face. Never paywalled. |
| `/rankings` (JSON) | Free under 60/IP/min, then 402 | $0.0005 read | Quota-then-paywall pattern. |
| `/route` | 402 by default | $0.005 score-provider | **v0.1.0 paywall target.** Differentiated routing work. |
| `/receipts/:id` (HTML) | Free permanent | n/a | Public proof surface. |
| `/receipts/:id` (JSON) | Free under 60/IP/min, then 402 | $0.0005 read | Receipt envelope is already signed; per-call signing not added. |
| `/receipts/:id?replay=true` | 402 (new endpoint) | $0.01 audit-replay | Re-verifies signature + on-chain settlement against current chain state. |
| `/.well-known/trustbench-pubkey` | Free permanent | n/a | Discovery norm. |
| `/.well-known/trustbench.json` | Free permanent | n/a | Discovery norm. |
| `/skill.md` | Free permanent | n/a | LLM-discoverability. |
| `/llms.txt` | Free permanent | n/a | LLM-discoverability. |
| `/mcp/tools` | Free permanent | n/a | MCP discovery norm. Free-tools listed; paid tools annotated `x-payment-required: true`. |
| `/analytics` | Free permanent | n/a | Public dashboard. Honest-measurement transparency. |
| `/score-provider` (new) | 402 (v0.2.0) | $0.005 score-provider | Reads liveness telemetry + risk annotations for any registered URL. Defensible because it reads the unique data moat. |
| `/verify` (new) | 402 (v0.2.0) | $0.002 verify | Hosted verifier for externally-provided receipts. Same logic as `@trustbench/verify-receipt`, no peer-dep ceremony. |
| `/compliance-export` (new) | 402 (v0.3.0) | $0.50 single / $2.00 bundle ≤100 / negotiated >100 | Signed multi-receipt CSV / JSON bundle. |
| `/pricing` (new) | Free permanent | n/a | Honest pricing display. HTML + JSON. |

**Why `/route` first:** highest-leverage (it's the differentiated work), most plumbing already in place (we're already an x402 client there; adding server middleware in front is the mirror operation), low risk to free surfaces, validates the whole 402-pay-success loop against real agent traffic before applying it to reads.

**Open follow-up:** if early v0.1.0 traffic shows the per-call price is wrong (too high → no traffic, too low → margin collapse), the open question on `/route` pricing rebalances against the table above. Don't pre-decide.

---

## Q2. Free-tier signaling — wire shape

**Decision:** Hybrid. Quota-headers for read endpoints below the free quota; 402-by-default for hot endpoints with no free tier.

**Read endpoints (`/rankings` JSON, `/receipts/:id` JSON):**
- Standard `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` headers on every response.
- Quota: 60 requests per IP per minute, sliding window. Tunable.
- Quota-exceeded behavior: return **402 Payment Required** (not 429 Too Many Requests). The 402 response includes the standard x402 payment requirements payload pointing at the read-tier price ($0.0005). Reason: the API contract for "you can have more if you pay" is 402 across the whole TrustBench surface; using 429 would split the contract.

**Hot endpoints (`/route`, and v0.2.0+ `/score-provider`, `/verify`, `/audit-replay`, `/compliance-export`):**
- 402 by default on every call. No free quota.
- Standard x402 payment requirements payload in the response body, with TrustBench's revenue wallet as `payTo`, the per-call price as `maxAmountRequired`, and chain/asset/network metadata.

**HTML responses (content-negotiated `/rankings` and `/receipts/:id`):**
- Always free. Browser content negotiation is in place per `src/rankings-html.ts` and `src/receipt-html.ts` (memory: implemented 2026-05-06). No paywall on Accept: text/html.

**Why hybrid not pure-x402:** ecosystem norms differ across endpoint classes. Free-tier headers on read endpoints match GitHub/Stripe/everyone-else conventions, and crawlers parse them correctly. Pure 402-on-every-call would be technically clean but break the discovery face (the rankings page is what we *want* agents to crawl).

---

## Q3. Wire shape — TrustBench as x402 server vs x402 client

This is the architectural meat. Today TrustBench is an x402 client (the `paid-probe.ts` flow + the `/route` agent-pays-provider flow). Becoming an x402 server adds a mirror role: emit 402, accept X-PAYMENT, verify via Coinbase facilitator, return data + X-PAYMENT-RESPONSE.

**Decision: single Hono server with route-level x402 middleware.** Same TS process plays both roles. No separate paid-API service. Reason: solo-founder constraint; code-locality benefit (the same `verify-receipt.js` logic powers both internal P3 receipt validation and the new `/verify` endpoint); zero deploy/infrastructure cost; matches the QBT-Labs/x402 pattern of one package providing both `client-proxy` and `withX402Server`, which is the ecosystem norm.

**Decision: dedicated revenue wallet.** Different from the wallet that funds `paid-probe.ts`. Receive-only. Reason: clean accounting separation. Probe wallet is spend-only and topped up periodically; revenue wallet is receive-only and drained periodically (manual, or eventually scheduled batch).

**Decision: real-time on-chain settlement on every paid call.** Coinbase facilitator handles this via EIP-3009. No batching. Reason: solo-founder constraint (no batching infrastructure). Cost is gas-on-USDC-EIP-3009-transfer paid by the facilitator, ultimately attributable to the per-call price.

**Decision: `/route` paywall implemented as a separate x402 pre-payment, not bundled with the provider's payment.**

The agent makes two x402 payments per `/route` call:
1. To TrustBench's revenue wallet, for the routing fee. This is the new paywall.
2. To the upstream provider, for the actual capability work. This is the existing x402 client flow that already works.

```
Agent --> POST /route?capability=search&max_price=0.01
TrustBench <-- 402 Payment Required + X-PAYMENT-REQUIREMENTS (route fee, $0.005)
Agent (signs route fee tx) -->
TrustBench --> POST /route + X-PAYMENT (route fee tx)
TrustBench (verifies fee, settles via facilitator) -->
TrustBench (selects provider via existing scoring) -->
TrustBench --> 200 OK + Ed25519-signed routing decision + X-PAYMENT-RESPONSE
Agent (uses routing decision) -->
Agent --> POST <provider-url>
Provider <-- 402 + X-PAYMENT-REQUIREMENTS (provider price)
Agent (signs provider tx) -->
Agent --> POST <provider-url> + X-PAYMENT
Provider --> 200 OK + result
```

Two payments, two on-chain settlements. Keeps TrustBench non-custodial: we receive only our own routing fee, never the provider's payment.

**Why not bundle (split payTo):** Coinbase's facilitator does not currently support a single x402 transaction with two `payTo` recipients in a clean way. This was verified during P4-1b debugging (memory: `project_p4_1b_state_2026_05_06.md`). Defer until facilitator-side splits ship; if/when they do, revisit as a UX optimization (one signature instead of two).

**Decision: Ed25519-sign paid responses for differentiated-work endpoints. Don't sign paid `/rankings` JSON.**

| Endpoint | Per-call signature? | Reason |
|---|---|---|
| `/route` | Yes (already signed routing receipt) | The Routing Receipt is the artifact. Existing flow. |
| `/score-provider` | Yes | Differentiated-work moat. Verifier reuses receipt-spec-v1 envelope. |
| `/verify` | Yes | Critical: signed because it's the second-opinion surface. Verifier must trust the verdict. |
| `/audit-replay` | Yes | Highest-tier proof artifact. |
| `/compliance-export` | Yes | Multi-receipt bundle, must be tamper-evident. |
| `/rankings` (paid JSON) | No | Underlying scorecard already signed at snapshot level; per-call signing adds CPU/bytes for zero new evidentiary value. |
| `/receipts/:id` (paid JSON) | No (receipt itself is already signed) | Same. |

CPU cost of Ed25519 sign: ~50µs on commodity x86; signature is 64 bytes. Negligible.

All signed paid responses reuse the existing Ed25519 key + `/.well-known/trustbench-pubkey` distribution. Different `kind` field in the signed envelope (e.g., `paid_response.score_provider`, `paid_response.verify`) so verifiers can distinguish artifact types.

---

## Q4. Idempotency on the server side

**Decision:** Reuse the Phase 3 idempotency-key pattern from `/route` for all paid endpoints. Every paid call accepts an `Idempotency-Key` header. Same key + same body hash → return cached response from the last 24 hours. Same key + different body hash → 409 Conflict.

**Two-layer dedup:**
- **Application layer:** TrustBench's idempotency table records {key, body_hash, response, cached_until}. 24h TTL.
- **On-chain layer:** Coinbase facilitator de-dupes EIP-3009 payments by nonce. If the agent retries a payment with the same nonce, the facilitator rejects the duplicate at settlement time.

The two layers compose: an agent retrying after a partial timeout will (a) get the cached routing decision back from TrustBench's idempotency cache, and (b) not be charged twice on-chain because the second X-PAYMENT carries the same nonce.

**Edge case to design around:** agent retries with the same idempotency-key but a *different* nonce (i.e., signed a fresh payment). TrustBench should detect this and return the cached response (already paid for via the original nonce), not charge again. Implementation: idempotency-key dedup runs *before* X-PAYMENT verification. If key matches and body hash matches, short-circuit return cached response, don't even ask the facilitator.

**Failure mode if this is wrong:** an agent retrying after a partial timeout could be charged twice. We'd notice via spike in `paid_requests` rows with the same agent+endpoint+5-minute-window. Add a nightly anomaly check that flags >3 paid_requests with same agent+endpoint within 5 minutes for manual review.

---

## Q5. Free-tier abuse prevention

**Decision:** Accept IP-based quota leakage. Quota is 60 req/IP/min on read endpoints, sliding window. Above quota → 402 with payment requirements (not 429). No CAPTCHA, no fingerprinting, no IP-blocklist maintenance.

**Why this is fine:**
- Free-tier endpoints (`/rankings` JSON, `/receipts/:id` JSON) serve cached, public-by-design data. Worst case is aggressive crawling → that's *discovery*, not abuse. Same as Google scraping a website.
- Receipts are public-by-design (signed, third-party-verifiable). There is nothing to "abuse."
- The actual revenue surfaces (`/route`, `/score-provider`, `/verify`, `/audit-replay`, `/compliance-export`) have no free tier. Every call requires payment. Abuse can only target free-tier reads, which is low-cost to serve (Redis cache hits, ~ms latency).
- Above 60 req/IP/min, 402 converts heavy crawlers into paying customers. If they need volume, they pay; if they don't, they slow down.
- IP rotation costs more than reading the data legitimately at quota.

**Operational watch:** if a single agent (identified by recurring x402-paying wallet address, not IP) produces an outsized share of quota-exceeded → 402 traffic, propose a partner-volume free credit deal proactively. This is a customer-acquisition signal, not abuse.

---

## Q6. Discoverability

**Decision:** paid endpoints are in the *same* `skill.md` and `.well-known/trustbench.json` as free endpoints, with explicit `paid: true` annotations. No separate `paid-skill.md`.

**`skill.md`:** add a `paid` section per endpoint:

```yaml
endpoints:
  - path: /route
    method: POST
    paid: true
    pricing_tier: score-provider
    price_usdc: 0.005
    payment_required_doc: /pricing#route
  - path: /receipts/:id
    method: GET
    paid: false
    free_tier_limit: "60 req/IP/min, then 402 read tier"
```

**`.well-known/trustbench.json`:** add an `endpoints` array with the same per-endpoint metadata. Closes the discovery loop for agents that crawl well-knowns instead of skill.md.

**`/llms.txt`:** mention paid endpoints in plain English with prices.

**`/mcp/tools`:** return paid tools alongside free tools, with `x-payment-required: true` annotation. Agents using MCP-aware payment middleware (like QBT's `client-proxy` or any equivalent) handle this transparently.

**`/pricing` page (new):** HTML + JSON. Honest framing: tier table, per-endpoint price, "subject to change with notice" disclaimer, link to receipt-spec-v1 for envelope format, link to `@trustbench/verify-receipt` for verifier code.

**Why same skill.md not separate:** agents discovering TrustBench should see the full API surface in one canonical place. Splitting paid into a separate file fragments discovery and makes the "paid" annotation signal disappear for agents that only crawl one of the two files.

---

## Q7. Pricing display + fairness

**Decision:** Pricing tiers above are anchors. Public via `/pricing`. Reviewable per partner volume. Open question on per-endpoint price-rightness deferred to first 30 days of paid traffic.

**Pricing table (anchored 2026-05-08):**

| Tier | Price (USDC) | Endpoints |
|---|---|---|
| read | $0.0005 | `/rankings` (above quota), `/receipts/:id` (above quota) |
| verify | $0.002 | `/verify` |
| score-provider | $0.005 | `/route`, `/score-provider` |
| audit-replay | $0.01 | `/receipts/:id?replay=true` |
| compliance-export single | $0.50 | `/compliance-export?bundle=false` |
| compliance-export bundle | $2.00 | `/compliance-export?bundle=true` (≤100 receipts) |
| compliance-export negotiated | quote | `/compliance-export?bundle=true` (>100) |

**Where these might be wrong:**
- `/route` at $0.005: a high-volume agent (10K calls/day) pays $50/day = $1.5K/mo. Could be correctly priced for low-volume (the dominant case) and overpriced for high-volume. Mitigation: partner-volume free-credit deal as a one-off negotiation tool (decisions.md 2026-05-08).
- `/audit-replay` at $0.01: assumes real RPC work + signature re-verify + tx confirmation lookup. If we add disk-cached audit results, marginal cost drops to near-zero and price could drop to $0.002. Decision: keep $0.01 for now to anchor the differentiated-work framing; revisit after first month of actual paid traffic.
- `/compliance-export bundle` at $2.00 for ≤100 receipts: probably underpriced for CPA-grade formatting. Decision: $2.00 covers the basic signed-bundle-of-100 case; higher SLA is negotiated.

**Volume tier breakpoints (deferred):** should there be 10K+ calls/mo at 50% off? Don't pre-decide; observe first month, then design tiering based on actual usage curve.

**`/pricing` page content rules (no em-dashes per outreach style guide):**
- Plain language. "This endpoint costs $0.005 per call. Payable in USDC on Base via x402."
- Honest disclaimer. "Prices are anchors, not contracts. We may change them with public notice. Existing partner agreements override the table for that partner."
- Compose pointer. "If you're integrating TrustBench into a stack with Strata, Infopunks, or another partner, ask about partner-volume credit before committing to per-call billing."

---

## Q8. Ed25519 signing scope

Resolved in Q3 above. Summary:
- Sign all differentiated-work paid responses (`/route`, `/score-provider`, `/verify`, `/audit-replay`, `/compliance-export`).
- Don't double-sign paid `/rankings` or paid `/receipts/:id` JSON (the underlying artifact is already signed at scorecard-snapshot or receipt level).
- Reuse existing Ed25519 key, JCS canonicalization, `/.well-known/trustbench-pubkey` distribution.
- Different `kind` field per response type so verifiers can distinguish.

---

## Q9. Refunds / disputes

**Decision:** out-of-scope for v0.1.0 of paywall. Document the deferral in this doc and on the `/pricing` page.

**v0.1.0 policy:**
- Idempotency-key reuse is the only retry mechanism. If a paid call returns 5xx after settlement, the agent retries with the same idempotency-key and gets the cached response (or, if no cached response exists, a fresh attempt without re-charging because the on-chain nonce is the same).
- If a paid response is wrong or garbage (e.g., `/score-provider` returns stale telemetry), no refund mechanism. The data is best-effort under the methodology stated on `/methodology`.

**Deferred-design path:** off-chain credit ledger keyed by paying wallet address. Credits redeemable against future paid calls. No on-chain refund tx (gas + facilitator support not solo-founder-fit).

**Watch trigger:** if the first 30 days of paid traffic produces >5 dispute requests via DM/email, prioritize refund-design as v0.2 of paywall. If <5, ship without it.

---

## Q10. Revenue tracking + tax surface

**Decision:** new `paid_requests` table in Supabase. Schema:

```sql
create table paid_requests (
  id uuid primary key default gen_random_uuid(),
  endpoint text not null,
  agent_address text not null,           -- the x402 paying wallet (lowercase 0x...)
  tx_hash text,                          -- on-chain settlement tx
  block_number bigint,
  amount_usdc numeric(20, 6) not null,   -- the fee paid
  request_payload_hash text,             -- sha256 of canonical request body (don't store body)
  response_signature text,               -- Ed25519 signature if signed, null if not
  idempotency_key text,
  created_at timestamptz default now()
);

-- Indexes for the queries we'll actually run.
create index paid_requests_agent_created_idx on paid_requests (agent_address, created_at desc);
create index paid_requests_endpoint_created_idx on paid_requests (endpoint, created_at desc);
create index paid_requests_idempotency_idx on paid_requests (idempotency_key) where idempotency_key is not null;

-- RLS: public read of own rows by wallet match, service-role write.
alter table paid_requests enable row level security;
create policy "agent reads own paid_requests"
  on paid_requests for select
  using (agent_address = current_setting('request.jwt.claim.wallet', true));
```

**Why don't store the body:** privacy + storage cost. The body hash is enough to prove to the agent (or auditor) that the same request returned the same response (idempotency check), without storing the body itself.

**Why this table is the dogfood for `/compliance-export`:** the export endpoint queries this table for the agent's own paid-request history, signs the result as a multi-receipt bundle, and returns. Same data + format we'd use for our own tax/accounting export.

**Tax surface:** even at sub-cent per call, accumulated paid calls become reportable revenue. The `/compliance-export` endpoint at $2.00/bundle covers our CPA's annual reconciliation cost, paid by the integrators who need it. Eat the dogfood.

**Watch:** if `paid_requests` row volume grows past 100K/month, add table partitioning (by created_at month) before the indexes get slow. Solo-founder rule: don't pre-optimize.

---

## 3. Smallest-shippable-slice scope (v0.1.0)

**v0.1.0 ships:**
1. `paid_requests` table (migration applied).
2. `/route` paywall: 402 by default, X-PAYMENT verification via Coinbase facilitator, settlement on Base, Ed25519-signed routing receipt response.
3. Idempotency-key support on `/route` (already exists from Phase 3; reuse).
4. Dedicated revenue wallet provisioned + `TRUSTBENCH_REVENUE_WALLET_ADDRESS` env var on Railway.
5. `/pricing` HTML + JSON page with honest framing + anchored tier table.
6. `skill.md` + `.well-known/trustbench.json` updated with `paid: true` annotations on `/route`.
7. `paid-probe.ts`-equivalent smoke test: agent → 402 → sign → retry → success → verify response signature.
8. `/llms.txt` paragraph on paid endpoints.
9. README section on the paywall + verifier note.
10. Decisions logged in `decisions.md`.

**v0.1.0 does NOT ship:**
- Free-tier quota on `/rankings` / `/receipts/:id` JSON (Q2 hybrid pattern). Observation period first; revisit if read-volume needs throttling.
- New paid endpoints (`/score-provider`, `/verify`, `/audit-replay`, `/compliance-export`).
- Refund / dispute path (Q9 deferred).
- Volume tier breakpoints (Q7 deferred).
- Anomaly check for >3 paid_requests in 5min (Q4 mitigation; defer until first paid traffic shows the dedup pattern).

**Why this slice:** it's the smallest test of the core revenue thesis. If `/route` paywall produces real paid calls in the first 30 days, the rest of the design above gets implemented incrementally. If it doesn't, the rest of the design is wrong and needs revisit before more code.

**Estimated effort:** 3–5 days of focused work (matches the partnership-day record §7 estimate). High-risk-surface checklist applies (signing, payment construction, idempotency, settlement checks).

---

## 4. Iteration plan

| Version | Adds | Trigger |
|---|---|---|
| v0.1.0 | `/route` paywall + `paid_requests` table + `/pricing` | This design pass approved |
| v0.2.0 | `/score-provider` + `/verify` + `/audit-replay` + free-tier quota on read endpoints | 30 days of v0.1.0 paid traffic + signal that read-volume needs throttling |
| v0.3.0 | `/compliance-export` | Partner asks for it (Strata or Infopunks integration) |
| v0.4.0 | Refund / dispute path (off-chain credit ledger) | >5 dispute requests in any 30-day window |
| v0.5.0+ | Volume tier breakpoints | Actual usage curve shows the tier shape |

Don't ship versions ahead of trigger. Solo-founder rule.

---

## 5. Compose hooks (integration paths for partners)

> **Update 2026-05-11 (post-launch):** the Infopunks compose-hook below is now historical context. Infopunks suspended their `infopunks-cognition-layer-x402.onrender.com` Render deployment between this doc's writing (2026-05-08) and the v0.1.0 paywall launch (2026-05-11), and pivoted to `radar.infopunks.fun` — a Pay.sh-on-Solana provider-intelligence layer with explicit "routing recommendations." That's competition-adjacent on Solana, not the pure complement we'd modeled here. The Strata + QBT + CLU_AGENT compose hooks below remain accurate as written. See memory `project_infopunks_pivot_to_paysh_radar_2026_05_11.md` for the full read and recommended posture (do not chase; watch for Infopunks Radar to add EVM support as the trigger to revisit). The compose-hook prose below is preserved as the 2026-05-08 strategic snapshot.

The paywall design above composes cleanly with each of the three live partnership signals plus the QBT-Labs/x402 read.

### QBT-Labs/x402 (Aggelos Kappos)

**Compose path:**
```
agent
  └─> npx @qbtlabs/x402 client-proxy --target https://trustbench.io/route
        └─> POST /route
              <- 402 + X-PAYMENT-REQUIREMENTS
        (QBT proxy signs payment via local vault)
              -> POST /route + X-PAYMENT
              <- 200 + Routing Receipt (Ed25519-signed)
```

QBT's proxy never has to know about routing. TrustBench's `/route` never has to know about local key custody. Both products' value props intact.

**Open follow-up:** offer this in DM if Aggelos replies on Reddit. Spec: a one-line README addition on QBT side ("works with TrustBench /route as a multi-provider option") in exchange for TrustBench listing QBT as a recommended client-side payment library in `skill.md`.

### Strata (`@stratamcp`)

**Compose path:**
```
agent
  └─> Strata.score(endpoint) -> trust_signal
  └─> POST /route + X-PAYMENT + X-Trust-Signal: <strata-signature>
        TrustBench reads the trust_signal, optionally promotes/demotes the provider,
        carries the signal forward into the Routing Receipt envelope as an annotation.
```

Strata's pre-call score becomes a TrustBench-reading input on `/route`. The Routing Receipt's signed annotation includes Strata's score. Downstream verifiers see both signals in one envelope.

**Open follow-up:** confirm with Strata that the `X-Trust-Signal` header shape is what they want, or whether they prefer an inline JSON field. Strata sketch already drafted at `strata-integration-sketch-draft.md`; this paywall design is the pricing-side companion.

### Infopunks (`@InfopunksHQ`)

**Compose path:**
```
agent (calling Infopunks Cognition Layer for /v1/coherence-score)
  -> POST /route?capability=cognition_score&max_price=0.01
        <- 402 + X-PAYMENT-REQUIREMENTS (TrustBench fee, $0.005)
  (agent pays TrustBench)
  <- 200 + Routing Receipt + selected_provider=infopunks-cognition-layer-x402.onrender.com/v1/coherence-score
  -> POST infopunks endpoint + X-PAYMENT (provider fee)
  <- 200 + Cognition data
agent then optionally:
  -> POST /receipts/<id>?replay=true + X-PAYMENT (audit-replay fee, $0.01)
        <- audit packet with both TrustBench's routing tx and Infopunks's settlement tx
```

The agent pays two fees per call (TrustBench routing + Infopunks cognition) but gets full proof-of-routing + proof-of-cognition tied to a single `/receipts/:id` for downstream agents to audit.

**Open follow-up:** Infopunks has not yet replied to the partnership-day async message. When they do, the v0.2.0 `/audit-replay` endpoint becomes a concrete deliverable to offer in the integration sketch.

---

## 6. Open questions to validate with partners (deferred to actual conversations)

These are pricing/UX questions the design doc takes a position on but defers final commitment until a partner specifically pushes back.

1. Is $0.005 the right price for `/route` for the high-volume case (10K+ calls/day)?
2. Should `/audit-replay` price drop to $0.002 once disk-cached results land?
3. Should `/compliance-export bundle` price scale with bundle size (per-receipt subprice) or stay flat-per-bundle?
4. Should there be a partner-volume free credit tier (e.g., first 1K calls/mo free for named integration partners)? The decisions.md 2026-05-08 entry says "no free tier in commercial relationship" but allows partner-volume credit as a negotiation tool.
5. Should the `Idempotency-Key` header dedup reach back >24h (e.g., 7 days) for compliance-export use cases where retries can land days apart?

These are not implementation blockers. Ship v0.1.0 with the position above; revisit when a partner asks.

---

## 7. High-risk-surface failure modes (per CLAUDE.md self-review checklist)

For each surface the v0.1.0 paywall touches, what's the worst that could happen if the implementation is wrong, and how would we notice?

**Payment verification (X-PAYMENT → facilitator → settle):**
- *Worst case:* an agent's payment is accepted before facilitator confirms settlement → agent gets a routing decision they didn't actually pay for.
- *Notice:* on-chain settlement failure rate spike. Watch via the existing facilitator response flow in `paid-probe.ts`. If verify-then-settle returns success but settlement later fails, we owe ourselves a refund mechanism — caught by reconciling `paid_requests.tx_hash` against on-chain settlements daily.
- *Mitigation in v0.1.0:* always wait for facilitator settlement confirmation before returning 200. Don't pre-settle.

**Idempotency key collision:**
- *Worst case:* two different agents send the same idempotency-key and one gets the other's cached response.
- *Notice:* `paid_requests.agent_address` mismatch on cache hit. Anomaly: dedup key matches but agent_address differs.
- *Mitigation in v0.1.0:* idempotency table key is `(agent_address, idempotency_key)`, not `idempotency_key` alone. Keys are namespaced per paying wallet.

**Ed25519 signature on paid response is forgeable / replayable:**
- *Worst case:* a malicious party reuses TrustBench's signed `/route` response for a different agent's claim.
- *Notice:* signed envelope must include `agent_address` (from the payment) so replay across agents fails verification.
- *Mitigation in v0.1.0:* envelope always includes payment-tx-hash + agent-address + signed_at + idempotency_key; verifier checks all four.

**Free-tier quota silently fails open:**
- *Worst case:* quota tracking breaks (Redis down, etc.) and reads serve unlimited free → revenue erodes for paid users who would have hit quota.
- *Notice:* `paid_requests` row volume drops sharply on `/rankings` paid tier even as overall traffic stays flat.
- *Mitigation in v0.1.0:* deferred (free-tier quota is v0.2.0). Until then, no quota = no failure mode here.

**Wrong revenue wallet provisioned:**
- *Worst case:* agent pays into a wallet TrustBench doesn't control → real revenue lost.
- *Notice:* drained when paid_requests rows accumulate but USDC balance doesn't increase.
- *Mitigation:* manual verification at deploy time (send a $0.005 test payment to the wallet, confirm balance increase before flipping the env var live).

---

## 8. References + cross-doc links

- `partnership-day-record-2026-05-07.md` — strategic premise, revenue model decisions.
- `phase4-qbt-and-paywall-handoff.md` — origin of Q1–Q10.
- `phase4-kickoff.md` — engineering state context.
- `competitive-landscape.md` — QBT-Labs read, partner-readiness signals (Strata, Infopunks, CLU_AGENT, QBT).
- `strata-integration-sketch-draft.md` — Strata-side integration; this paywall design is the pricing-side companion.
- `infopunks-followup-draft.md` — Infopunks-side async message.
- `receipt-spec-v1.md` — Ed25519 + JCS receipt envelope; reused for paid response signing.
- `decisions.md` — flat decision log; this design pass adds 2026-05-08 entries.
- Memory: `project_npm_verifier_shipped_2026_05_08.md` (verifier ships next to this paywall), `project_p4_1b_state_2026_05_06.md` (first paid x402 receipt; the mirror operation), `project_strata_partnership_inbound_2026_05_07.md` (pricing tier anchors), `project_infopunks_collab_inbound_2026_05_07.md` (Infopunks engagement state).

---

## 9. What's next after this design pass is approved

1. Log v0.1.0 design decisions in `decisions.md` (single dated entry referencing this doc).
2. Add `MEMORY.md` pointer.
3. Implement v0.1.0 in a single sprint (3–5 days). Start with the migration + `/pricing` page (lowest-risk surfaces), then layer in the `/route` paywall last.
4. Smoke-test against the existing `paid-probe.ts` pattern: agent role pays TrustBench's `/route`, gets routing decision back, makes a separate paid call to a real provider (e.g., Infopunks).
5. Ship.
6. Instrument 30 days. Then revisit Q7 fairness + Q9 dispute trigger.
