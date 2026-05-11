# Phase 4 — agentic.market + Bazaar Listing Plan

**Goal:** TrustBench listed on agentic.market and Coinbase Bazaar by **end of week ending Friday 2026-05-22** (target listed-or-ready-to-list date), with the v0.1.0 paywall live so the discovery → activation loop closes on real revenue.

**Owner:** Johan + Claude (sprint-style implementation, mostly code work, some external submission steps).

**Created:** 2026-05-09. Sprint kickoff: Monday 2026-05-12 (after Strata reply + Paddock CSV land Monday morning).

**Why this plan exists:** The paywall design pass (`phase4-paywall-design.md`) settled the architectural questions; this doc converts the design into a week-by-week execution sequence with explicit deliverables, success criteria, and dependencies. End-of-next-week listing is achievable because the long pole (paywall implementation) is 3-5 focused days, the listing submissions are short forms, and Bazaar's review timing is the only meaningful external dependency.

---

## 0. Calendar (today is 2026-05-10, Saturday)

| Date | Day | Phase | Sprint state |
|---|---|---|---|
| 2026-05-10 | Sat | Pre-flight | Plan committed |
| 2026-05-11 | Mon | Pre-flight | Strata sketch sent + Paddock CSV delivered |
| 2026-05-12 | Tue | Sprint Day 1 | Paywall implementation begins |
| 2026-05-13 | Wed | Sprint Day 2 | |
| 2026-05-14 | Thu | Sprint Day 3 | |
| 2026-05-15 | Fri | Sprint Day 4 | |
| 2026-05-16 | Sat | Sprint Day 5 / buffer | Paywall live, target |
| 2026-05-17 | Sun | Buffer / rest | |
| 2026-05-18 | Mon | Listings prep | Discovery surface annotations + listing research |
| 2026-05-19 | Tue | Listings | Submit agentic.market |
| 2026-05-20 | Wed | Listings | Submit Bazaar |
| 2026-05-21 | Thu | Listings review | Iteration on listing feedback |
| 2026-05-22 | Fri | **TARGET DATE** | Listed or ready-to-list |

If the paywall sprint slips by 1-2 days, the listing submissions slide proportionally; the buffer days (May 16-17) absorb up to 2 days of slip without missing the target date.

---

## 1. Pre-flight (this weekend + Monday 2026-05-11)

These are not part of the listing sprint but must land first so the sprint isn't blocked.

### 1.1 External commitments to honor before sprint starts

| Item | Owner | Deadline | Why it blocks the sprint |
|---|---|---|---|
| Send Strata integration sketch | Johan | Mon 2026-05-11 morning | Strata's pricing pushback in their response could shift v0.1.0 paywall pricing. Better to have it in the loop before code locks. |
| Send Paddock 7-night rollup CSV | Johan | Mon 2026-05-11 | Committed in `decisions.md` 2026-05-08; broken promises bleed trust. |

### 1.2 Strategic doc commits

The QBT/paywall design work from this week is sitting uncommitted. List below; commit before the sprint starts so reviewers (Strata, Aggelos, Foundation watchers) see current strategic posture in the repo.

```powershell
git add decisions.md competitive-landscape.md phase4-paywall-design.md phase4-qbt-and-paywall-handoff.md partnership-day-record-2026-05-07.md phase4-listing-plan.md grok-github-research-briefing.md
git commit -m "docs: QBT-Labs read + Phase 4 paywall design + listing plan + GitHub research briefing"
git push
```

(Skim `git status` first; don't commit the `agentlog-*`, `phase6-*`, or `_CHATGPT_INPUT.md` / `_GROK_INPUT.md` scratch files.)

### 1.3 Infrastructure prep (manual, ~30 minutes)

- **Provision dedicated revenue wallet on Base.** Generate a fresh **secp256k1 EVM wallet** (Base is EVM; secp256k1, not Ed25519 — Ed25519 is the receipt-signing key, unrelated). Preferred path: create the address in a wallet app (Coinbase Wallet, Rabby, or MetaMask). Copy only the `0x...` address into Railway; the private key stays in the wallet app and never enters the server. **Receive-only**, distinct from the existing probe wallet. Prefunding is not required — the facilitator pays its own gas; the revenue wallet only receives USDC.
- **Add Railway env vars:**
  - `TRUSTBENCH_REVENUE_WALLET_ADDRESS` — the revenue wallet's public address.
  - `TRUSTBENCH_PAYWALL_ENABLED=false` — feature flag, default false until we explicitly flip on.
- **Verify the x402 facilitator can settle a $0.005 USDC test payment to the revenue wallet** before code goes live. Use `scripts/facilitator-settle-test.ts` (added 2026-05-11) — the probe wallet plays agent, TrustBench plays merchant, settlement runs through `@x402/core`'s `HTTPFacilitatorClient` against the public Foundation facilitator at `https://x402.org/facilitator` (no CDP credentials needed for v0.1.0; upgrade to Coinbase CDP facilitator later if free-tier rate limits bite).

---

## 2. Week 1 sprint — Paywall v0.1.0 implementation (May 12–16)

The paywall is the long pole. Everything else in this plan depends on it landing.

### Day 1 — Monday 2026-05-12 — `paid_requests` table + smoke env

**Deliverable:** `paid_requests` table live in Supabase with the schema from `phase4-paywall-design.md` § Q10.

- [ ] Write migration SQL for `paid_requests` (schema in design doc, copy verbatim).
- [ ] Apply migration to Supabase via the Supabase SQL editor or `supabase db push`.
- [ ] Add three indexes: `(agent_address, created_at desc)`, `(endpoint, created_at desc)`, `(idempotency_key) where not null`.
- [ ] Enable RLS with the public-read-own-rows policy from the design doc.
- [ ] Smoke: `INSERT` a test row from a service-role client, `SELECT` from an anon-role client with a wallet match, confirm row visibility works.

**Success criteria:** A test row inserts, indexes exist, RLS lets the agent read their own row but not others.

**Risk:** Supabase migration syntax differs slightly from the design doc's SQL on some edge cases (uuid generation, timestamptz default). If `supabase db push` errors, fall back to copy-paste in the SQL editor and iterate.

### Day 2 — Tuesday 2026-05-13 — `/pricing` page + paid annotations

**Deliverable:** `/pricing` HTML and JSON live; `skill.md` and `.well-known/trustbench.json` updated with paid-endpoint annotations.

- [ ] Write `src/pricing-html.ts` rendering the tier table from `phase4-paywall-design.md` § Q7. Plain language, no em-dashes, "subject to change with notice" disclaimer, link to receipt-spec, link to `@trustbench/verify-receipt`.
- [ ] Add `app.get('/pricing', ...)` route in `src/index.ts` with content negotiation (HTML for browsers, JSON for agents).
- [ ] Update `skill.md` with `paid: true` annotations on `/route` (and the to-ship-later endpoints listed but flagged `available_in: v0.2.0`).
- [ ] Update `.well-known/trustbench.json` with the new `endpoints` array (per design doc § Q6).
- [ ] Update `/llms.txt` with a paragraph about paid endpoints + pricing.

**Success criteria:** `curl https://trustbench.io/pricing` returns either HTML or JSON depending on Accept header. Agents crawling `skill.md` see `paid: true` annotations. No em-dashes in any user-visible copy.

**Risk:** Content-negotiation pattern is already established in `src/rankings-html.ts` and `src/receipt-html.ts`; copy that shape exactly. Don't invent a new pattern.

### Day 3 — Wednesday 2026-05-14 — `/route` paywall middleware

**Deliverable:** `/route` returns `402 Payment Required` with x402 payment requirements when `TRUSTBENCH_PAYWALL_ENABLED=true` and no valid `X-PAYMENT` is provided.

- [ ] Implement middleware in `src/index.ts` (or a new `src/paywall-middleware.ts` if it gets large) that:
  1. Checks `TRUSTBENCH_PAYWALL_ENABLED` flag.
  2. Reads `Idempotency-Key` and `X-PAYMENT` headers.
  3. If idempotency-key matches a recent `paid_requests` row for this agent + body hash, short-circuit return cached response (per design doc § Q4 "two-layer dedup").
  4. If no `X-PAYMENT`, return 402 with payment requirements payload (Coinbase CDP format, $0.005 USDC, payTo = revenue wallet).
  5. If `X-PAYMENT` present, verify via Coinbase facilitator using the existing client code from `paid-probe.ts` (mirror operation; TrustBench is now the merchant).
  6. On settle success, write `paid_requests` row.
  7. Run the existing `/route` logic (provider selection, reservation cap, signed receipt).
  8. Return 200 with the routing receipt.
- [ ] Reuse the existing facilitator integration code; don't rewrite. Lift from `paid-probe.ts` and `src/route-handlers.ts`.
- [ ] Implement idempotency-key namespacing as `(agent_address, idempotency_key)` per design doc § Q4 "edge case to design around."
- [ ] Add unit-style smoke test in `scripts/paywall-smoke.ts` that exercises: 402 → sign → retry → 200 → verify cached repeat → 409 on body-mismatch.

**Success criteria:** `tsc --noEmit` clean. Smoke script passes locally against the mock provider with paywall enabled.

**Risk:** This is the highest-risk surface in the sprint. The CLAUDE.md self-review checklist applies (signing, payment construction, idempotency, settlement checks). Read `phase3-x402-construction.md` and `phase3-idempotency-design.md` *before* coding. Write the failure-mode paragraph in the diff comments per CLAUDE.md workflow rule.

### Day 4 — Thursday 2026-05-15 — Live smoke test + Railway deploy

**Deliverable:** Paywall enabled in prod against a real provider (Infopunks or local mock first), with a real paid receipt produced by a TrustBench-side test agent.

- [ ] Run `scripts/paywall-smoke.ts` against the local server with paywall enabled.
- [ ] Deploy to Railway with `TRUSTBENCH_PAYWALL_ENABLED=false` initially (default off).
- [ ] On Railway, flip `TRUSTBENCH_PAYWALL_ENABLED=true`.
- [ ] Run a manual smoke from a separate test wallet: agent role pays TrustBench `/route`, gets routing decision, makes a separate paid call to Infopunks endpoint. Confirm both x402 transactions settle on-chain.
- [ ] Verify `paid_requests` row landed in Supabase with correct fields.
- [ ] Verify the Routing Receipt envelope verifies clean via `@trustbench/verify-receipt` from npm.

**Success criteria:** End-to-end paid `/route` call succeeds, on-chain settlement confirmed at Basescan, receipt verifies signature + on-chain status with no override.

**Risk:** Coinbase facilitator validation can surface bugs that didn't appear in mock testing (P4-1b precedent: 9 hand-roll patches needed). Build in 4-6 hours buffer; if it slips, Day 5 absorbs.

### Day 5 — Friday 2026-05-16 — Bug fixes + first public artifact

**Deliverable:** Paywall stable in prod; first public-facing post about it; README updated.

- [ ] Fix any issues surfaced by Day 4 smoke.
- [ ] Update README with a "Paywall (v0.1.0)" section: how to discover, how to call, link to `/pricing`, link to `@trustbench/verify-receipt`.
- [ ] Append a new entry to `BUILD_IN_PUBLIC` array in `scripts/post-to-x.js` announcing the paywall (for the next build-in-public rotation slot).
- [ ] Manually compose an X post about the paywall going live (don't wait for the cron rotation; ship it Friday afternoon for visibility). Use the X reply pattern's tone but framed as build-in-public.
- [ ] Append entry to `decisions.md`: "2026-05-16: Paywall v0.1.0 shipped to prod against /route. Reason: ..."

**Success criteria:** Paywall has been hit by at least 1 real (non-test) paid call by EOD Friday, OR is stable and waiting for traffic. Public post out.

---

## 3. Buffer / rest (May 17-18, weekend)

No work scheduled. If Day 4-5 slipped, this is where the slip absorbs without missing the target date.

If everything's on schedule, use the weekend to:
- Read any GitHub issues that surfaced in the weekly Monday GitHub scan
- Watch for inbound from Strata / Infopunks / Aggelos
- Light editing on the listing-prep work (§ 4 below) so Monday starts smoothly

---

## 4. Week 2 sprint — Listing submissions (May 18–22)

### Day 6 — Monday 2026-05-18 — Listing prep + agentic.market research

**Deliverable:** Submission packet ready for both agentic.market and Bazaar.

- [ ] **Research agentic.market submission flow.** Their submission process is unknown to Claude as of this writing. Likely paths: (a) a public form on agentic.market, (b) an open `submit-service` endpoint, (c) a PR to a curated catalog repo, (d) a contact email. Investigate via their site + their GitHub org. Memory pointer: `project_skill_md_distribution.md` mentions Coinbase ships agentic.market/skill.md as primary x402 onboarding, suggesting the submission path is skill.md + a registration step.
- [ ] **Research Bazaar submission flow.** Likely a Coinbase CDP form or a `coinbase/x402` issue/PR. Check `coinbase/x402` README and the Bazaar site itself.
- [ ] **Prepare the submission packet:**
  - One-paragraph description of TrustBench as a non-custodial routing primitive
  - Endpoint list with prices (from `/pricing`)
  - Sample paid receipt URL (P4-1b milestone or any new one from the sprint)
  - npm verifier link (`@trustbench/verify-receipt`)
  - skill.md + .well-known link
  - Public key URL
  - GitHub repo link
- [ ] PR to `Merit-Systems/awesome-x402` adding TrustBench to the curated list. (Free, immediate, no platform review.)
- [ ] Add GitHub topic tags to the TrustBench repo: `x402`, `agent-payments`, `routing`, `signed-receipts`, `non-custodial`, `mcp`. (~5 minutes via the GitHub web UI.)

**Success criteria:** Submission flows for both platforms identified. Submission packet drafted and reviewed against `phase4-paywall-design.md` for accuracy.

### Day 7 — Tuesday 2026-05-19 — Submit to agentic.market

**Deliverable:** Submission filed; confirmation received (or "in queue" status).

- [ ] Submit via whichever flow Day 6 identified.
- [ ] If the flow is a PR, open the PR. If a form, fill it. If an email, send it.
- [ ] If the submission requires a sample paid call against `/route` to validate, run one with the test wallet and include the receipt URL.
- [ ] Log the submission in `decisions.md`: "2026-05-19: Submitted TrustBench listing to agentic.market via [flow]. Reason: ..."

**Success criteria:** Submission acknowledged by the platform (auto-reply, PR opened, etc.). Outcome may be pending review for days/weeks; that's fine.

### Day 8 — Wednesday 2026-05-20 — Submit to Bazaar

**Deliverable:** Submission filed; confirmation received.

- [ ] Same shape as Day 7, but for Bazaar.
- [ ] Bazaar may require evidence the endpoint accepts x402 payment correctly (likely a sample call or skill.md check). The paywall + skill.md updates from Week 1 should satisfy this.
- [ ] Log in `decisions.md`.

**Success criteria:** Submission acknowledged.

### Day 9-10 — Thursday-Friday 2026-05-21/22 — Iteration + agent-discovery smoke

**Deliverable:** Listings live or in active review queue. End-to-end agent-discovery flow validated.

- [ ] Address any submission feedback from agentic.market or Bazaar reviewers.
- [ ] **Validate the discovery loop end-to-end:** simulate an agent crawling `skill.md` → finding `/route` annotated `paid: true` → calling `/route` → receiving 402 → signing payment → retry → success → receipt verification. Document the trace as a smoke runbook for future regression checks.
- [ ] Update the Phase 4 doc and memory with listing status.
- [ ] Compose a public post about the listing milestone (X build-in-public slot or manual).

**Success criteria (Friday 2026-05-22):** TrustBench is *either* live on agentic.market and Bazaar, *or* in their review queue with submissions confirmed. Either outcome counts as "ready to be listed" per the user's stated target.

---

## 5. Dependencies + risk register

### Hard dependencies (sprint blocks if any of these slip)

| Dependency | Why blocks | Mitigation |
|---|---|---|
| Coinbase facilitator stable on Base | Without working settlement, paywall doesn't generate revenue | Test against real facilitator before Day 4; fall back to mock-only if Coinbase has an outage day-of |
| Revenue wallet provisioned + funded | Paywall has no payTo address | Pre-flight on May 11 morning |
| Supabase migration capacity | `paid_requests` table is required | Standard Supabase ops, no risk |
| Strata sketch landed before sprint | Pricing pushback could shift v0.1.0 design | Send Monday morning; if no response in 24h, proceed with current pricing |

### Soft dependencies (would be nice but don't block)

| Dependency | Why useful | If slipped |
|---|---|---|
| Infopunks reply lands during sprint | Concrete second integration partner | Sprint proceeds with Strata as primary partner shape |
| Aggelos (QBT) replies on Reddit | Validates compose framing publicly | Sprint proceeds; QBT compose stays in design doc as forward-look |
| GitHub scan surfaces a new partnership signal | Could open a third compose surface | Sprint proceeds; new signal gets folded into v0.2.0 paywall scope |

### External risk (out of our control)

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| Coinbase facilitator changes API mid-sprint | Low | High | Lock SDK versions in `package.json`; pin to current `@x402/core` + `@x402/evm` versions; only upgrade after sprint |
| agentic.market / Bazaar review takes >5 days | Medium | Low | Target says "listed or ready-to-list" — submission filed counts. |
| Paywall surfaces a Phase 3 idempotency bug under real load | Low | High | Smoke test on Day 4 covers the dedup path; if a bug appears post-deploy, hotfix Day 5 buffer absorbs |
| Strata / Infopunks pivot mid-sprint | Low | Medium | Sprint scope is paywall + listing, not partner integration. Partner shifts don't block. |

---

## 6. Success criteria — the end-of-sprint definition of done

By Friday 2026-05-22, all of these must be true:

- [ ] `/route` paywall live in prod, hit by at least one real paid call.
- [ ] `paid_requests` table populated with at least one production row (revenue tracking active).
- [ ] `/pricing` page live (HTML + JSON) with honest framing and tier table.
- [ ] `skill.md` + `.well-known/trustbench.json` + `/llms.txt` updated with paid-endpoint annotations.
- [ ] Submission to agentic.market filed and acknowledged.
- [ ] Submission to Bazaar filed and acknowledged.
- [ ] PR to `awesome-x402` merged or open for review.
- [ ] GitHub topic tags applied to the TrustBench repo.
- [ ] Agent-discovery smoke runbook documented (skill.md crawl → 402 → pay → success → verify).
- [ ] Decisions logged in `decisions.md` for every sprint milestone (paywall ship, agentic.market submission, Bazaar submission).
- [ ] Memory updated: a new `project_paywall_v0_1_0_shipped_2026_05_XX.md` pointing at the prod state, plus a `project_listings_submitted_2026_05_22.md` if listings are filed.

If 8 of 11 are true by Friday, the sprint is a success. The two listing submissions specifically can slide into the following Monday (May 25) without breaking the user's stated "end of next week if not prior" target — "ready to be listed" qualifies.

---

## 7. After the sprint — what's next

Once listings are live or in review, immediate follow-ups in priority order:

1. **Instrument 30 days of paid traffic.** Watch `paid_requests` for: per-call price feedback, idempotency-key collisions, payment-failure rate, agent retry patterns, agent-address concentration. Per `phase4-paywall-design.md` § 3.
2. **Design v0.2.0 paywall** based on the 30-day data: free-tier quota on read endpoints (Q2), `/score-provider` + `/verify` + `/audit-replay` paid endpoints, refund/dispute path if dispute volume justifies.
3. **Watch for first organic agent traffic.** External agents discovering us via skill.md / Bazaar / agentic.market and paying without prior outreach is the validation milestone for the component-in-stack thesis.
4. **Engage Strata / Infopunks integrations** if their replies have arrived. Their integration becomes much easier post-paywall because pricing + receipts are now real artifacts they can point at.

---

## 8. Cross-references

- `phase4-paywall-design.md` — the architectural source of truth for v0.1.0 paywall scope.
- `partnership-day-record-2026-05-07.md` — strategic premise (component-in-stack).
- `phase4-kickoff.md` — engineering state context, including the prior P4-bazaar note about listing requiring server-side x402 wire layer.
- `competitive-landscape.md` — partner-readiness context for any compose hooks.
- `grok-x-research-briefing.md` — daily X scan continues during the sprint.
- `grok-github-research-briefing.md` — weekly GitHub scan continues during the sprint.
- Memory: `project_phase3_build_state.md`, `project_p4_1b_state_2026_05_06.md`, `project_phase4_v2_wire_compat_approach.md`, `project_skill_md_distribution.md`, `project_agent_discovery_surfaces.md`.
