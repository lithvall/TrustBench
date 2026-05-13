# Phase 4 — SKU paywall scope sketch (pivot candidate)

**Status:** Decision-input draft. Not committed. Written 2026-05-13 in response to the smoke-503 blocker on `/route` (no live x402 upstream provider in registry after Infopunks pivot) and Strata's tier confirmation arriving same day.

**Read alongside:** `phase4-paywall-design.md` (current locked /route-only design — this sketch shows the delta), `decisions.md` 2026-05-12 Day 6 entry (routeTemplate fix + 48h kill criterion), `partnership-day-record-2026-05-07.md` (SKU revenue framing), Strata DM 2026-05-12 (tiers locked).

---

## 1. Why this sketch exists

The Day 6 routeTemplate fix is provably correct in code — the prod 402 from `/route` now contains `extensions.bazaar.routeTemplate: "/route"`, all the schema shapes match the published `BodyDiscoveryExtension` interface, and the v2 `PAYMENT-REQUIRED` header is emitted. CDP indexing should follow from a fresh successful settle.

But the settle path is blocked by a separate problem: `/route` requires a live x402-conformant upstream provider on Base for `capability=data`, and the registry currently has none. Infopunks (the only previously-verified one) pivoted to Pay.sh radar on 2026-05-11; CMC was promoted to verified 2026-05-12 (per decisions.md) but the 2026-05-13 smoke still returned 503 against Infopunks's old URL, suggesting either the selector cache hasn't refreshed or CMC also fails the in-handler live probe.

The blocker is structural: **`/route` is meta-routing, so it requires real downstream destinations to settle. Until the registry has ≥1 always-live conformant provider per routed capability, the indexing pathway will keep hitting this fail-safe.** The non-custodial guard correctly refuses to charge a routing fee for nothing — that's the system working as designed, not a bug to patch.

Meanwhile, Strata confirmed v1 tiers on 2026-05-12 (full reciprocal on score-provider, $1.00 compliance-export, others at list) and their reference integration sketch is due in ~1 week. Their integration consumes `/verify` and `/score-provider` — neither of which exists as a paywalled endpoint yet. We will paywall both within ~2 weeks regardless of the Bazaar indexing question.

**The pivot proposition:** paywall the SKU endpoints now and list those on Bazaar, instead of (or in addition to) `/route`. SKU endpoints are TrustBench-internal computation — they have no live-upstream dependency. They settle the moment an agent calls them. They give us multiple Bazaar catalog entries instead of one. And Strata's real traffic in ~1 week becomes the first-paying-agent story, not synthetic smoke.

---

## 2. What changes from the locked design

`phase4-paywall-design.md` Q1 currently locks v0.1.0 as `/route` only. The SKU endpoints (`/score-provider`, `/verify`, `/audit-replay`, `/compliance-export`) are documented as v0.2.0+ with prices locked but **not shipped**. The pivot promotes some of them into v0.1.0.

**Minimum viable pivot (v0.1.0-bis):** ship `/verify` only. It's the leanest SKU:
- Input: a TrustBench-issued receipt envelope (JSON, agent-supplied)
- Computation: re-verify Ed25519 signature against `/.well-known/trustbench-pubkey`, optionally re-verify on-chain settlement via Base RPC
- Output: `{ valid: bool, signature_valid: bool, on_chain_verified: bool, reason: string }`, Ed25519-signed paid response
- No registry dependency, no live-probe step, no external provider involvement
- Existing logic available in `scripts/verify-receipt.js` and `@trustbench/verify-receipt` v0.1.0 — port to HTTP handler
- Locked price: $0.002 (`verify` tier per design Q7)

**Optimistic pivot (v0.1.5):** add `/score-provider` alongside `/verify`. It reads liveness telemetry from the providers/probes tables for a given URL and signs the response. Useful for Strata's pre-call routing decisions; differentiated-work moat is "we have the unique liveness dataset."
- Locked price: $0.005 (`score-provider` tier)
- Strata reciprocal: free between TrustBench and Strata, list price for everyone else (per decisions.md 2026-05-12)

`/audit-replay` and `/compliance-export` stay at v0.2.0+/v0.3.0+ per the original design. They have meaningfully more implementation cost (compliance-export needs CSV/JSON bundle formatting + multi-receipt aggregation) and lower frequency-of-use, so they don't earn front-loading.

---

## 3. What the locked design already pins down (no re-litigation)

These decisions from `phase4-paywall-design.md` survive intact and apply to SKU endpoints without rework:

- **Same Hono process, same revenue wallet, same Coinbase facilitator.** No new infrastructure.
- **Two-payment shape on paywalled endpoints**: agent pays TrustBench fee in x402, then (where applicable) makes a separate call to the actual data source. For `/verify` and `/score-provider` there is no upstream call — the SKU is self-contained.
- **Ed25519-signed paid responses on differentiated-work SKUs** per Q3 table. `/verify` and `/score-provider` both sign.
- **Idempotency via existing pattern** (Phase 3 idempotency-keys table; same {key, body_hash, response, cached_until} discipline).
- **`paid_requests` table writes** for revenue tracking + audit dogfood (already shipped, schema in `phase4-paywall-design.md` Q10).
- **Discovery: same skill.md, same .well-known/trustbench.json**, with `paid: true` annotation per endpoint (already designed in Q6).
- **Pricing display via `/pricing`** (HTML + JSON) updates to surface the new endpoints.
- **No subscription tier, no free tier on commercial named-partner agreements, no IP-blocking.** All non-negotiable per § 2.

The only locked decision that needs revisiting is **Q1's "v0.1.0 is /route only"**.

---

## 4. The decoupling cost

`paywallGate` in `src/paywall-handler.ts` is currently route-coupled per the 2026-05-11 Bazaar handoff memory. Quoting that memo: "paywallGate is route-coupled (rejects spike body) AND no live conformant upstream provider exists. Two follow-up paths: Path P pragmatic 2-3hr (find working provider, hit /route directly), Path R principled 11-18hr (refactor paywallGate + registry conformance v0.2.0 + spike)."

Adding SKU endpoints means walking Path R. Three sub-tasks:

**4a. Generalize paywallGate from `/route`-specific to per-route-configurable.**
- Accept a route config object: `{ price, tier, body_validator, response_signer, bazaar_extension, idempotency_namespace }`
- `body_validator` is per-route — `/verify` accepts a receipt envelope, `/score-provider` accepts `{ provider_url }`, `/route` keeps its existing shape
- `response_signer` produces the per-SKU Ed25519 envelope (`paid_response.verify`, `paid_response.score_provider`, `paid_response.route`)
- `idempotency_namespace` keeps idempotency keys per-endpoint (avoid cross-SKU key collisions)
- Estimated: 4-6 hours of careful surgery on revenue-bearing code

**4b. Implement `/verify` handler + Ed25519 paid envelope.**
- Logic exists in `scripts/verify-receipt.js`; lift the core function out, wrap in a Hono handler, attach to generalized paywallGate
- Per-call signature uses the existing key from Phase 1; `kind: "paid_response.verify"`
- Estimated: 2-3 hours including paid-envelope shape + smoke

**4c. Add bazaar declarations for new SKUs in `src/bazaar-extension.ts`.**
- Each gets its own `declareDiscoveryExtension` config + manual `routeTemplate` injection (same pattern as ROUTE_CONFIG today)
- Each gets emitted in the per-route 402 body via paywallGate
- Estimated: 1 hour per SKU

**4d. Update discovery surfaces.**
- `skill.md`: add `paid` entries for new SKUs with prices
- `.well-known/trustbench.json`: same
- `/llms.txt`: add prose mention
- `/pricing` HTML + JSON: surface the SKUs prominently
- README: update if it claims `/route` is the only paid surface
- Estimated: 2 hours total

**4e. Smoke harness for `/verify`.**
- Mirror `scripts/paywall-smoke.ts` for `/verify`: S1 402-envelope, S2 settle, S3 idempotent replay, S4 conflict
- $0.002 per smoke run (cheap)
- Estimated: 1-2 hours

**Total minimum viable pivot (/verify only):** ~10-13 hours engineering. Two-three focused work days for a solo founder, given the existing test/deploy/smoke cadence.

**With `/score-provider` added (optimistic pivot):** add 3-4 hours for the score-provider handler (it reads the providers + probes tables, formats the response, signs). Total ~14-17 hours.

---

## 5. Bazaar listing implications

Each paywalled SKU becomes a separate Bazaar catalog entry. The CDP merchant-discovery probe (`GET /platform/v2/x402/discovery/merchant?payTo=<revenue-wallet>`) will return a list of resources once cataloging completes — one per SKU.

This is structurally better than the `/route`-only listing for several reasons documented in `project_agent_discoverability_strategy.md` memory:

- **Direct primitives are easier for agents to autonomously discover than meta-routing.** An agent that needs to verify a receipt knows what `/verify` does without context. An agent stumbling on `/route` needs to understand what "non-custodial x402 routing" means before they can use it.
- **Multiple catalog entries beat one for SEO and search-relevance.** Each SKU surfaces under its own semantic match (`/verify` matches "receipt verifier", `/score-provider` matches "endpoint trust score", `/route` matches "x402 router").
- **Each SKU's catalog entry is structurally self-contained.** No risk of an outage on one SKU breaking another's listing.

The original Day 6 routeTemplate fix and the v2 `PAYMENT-REQUIRED` header work are not wasted — they apply identically to SKU endpoints when paywallGate is generalized. Same bazaar-extension wiring pattern, same header emission, same `isValidRouteTemplate` compliance.

---

## 6. What this defers and what it kills

**Defers:**
- The `/route`-specific kill criterion fires tomorrow (2026-05-14 ~13:00 UTC) with status: *not validated, separate blocker discovered*. The routeTemplate-fix decision in decisions.md gets a `status: rescheduled` note pointing at the new SKU-paywall kill criterion (likely 14-21 days out for `/verify` paywall + indexing observation).
- Registry-conformance work (v0.2.0 in `phase4-paywall-design.md`) stays deferred — the SKU pivot doesn't require it because SKUs don't depend on the registry.

**Kills:**
- The "hot-patch a third-party provider as verified" path (Option A from the 2026-05-13 chat) gets shelved permanently. Not just deferred — explicitly rejected because hot-patching just to clear a kill criterion produces misleading positive signal (the kill criterion was supposed to test whether the bazaar wiring works; promoting a third-party endpoint we don't have a relationship with would test something else).
- The TrustBench-owned fixture-provider path (Option B) gets shelved permanently for the same reason: a circular routing entry would degrade the public framing.

**Does NOT defer:**
- Strata reference integration sketch ETA stays at ~1 week (per their 2026-05-12 reply). The SKU paywall work is on the critical path *for* that integration, not parallel to it.

---

## 7. What could go wrong

The load-bearing assumption is that **paywalling SKUs and getting them indexed is the same difficulty as paywalling /route and getting it indexed** — i.e., the indexing pathway itself works, and our only problem on /route was the upstream-provider dependency.

Things that would falsify this:

1. **CDP requires a successful upstream-provider chain for indexing.** If cataloging silently requires that the catalogable route actually do something with the payment beyond settling it, SKUs that settle without further computation could be filtered out. Mitigation: query CDP merchant-discovery for any indexed pure-computation endpoints. Several of the search results from earlier (OneSource block-number, Run402 tier subscription) are pure-computation, which is evidence against this failure mode but not proof.
2. **Two payments per /route call vs one payment per SKU call shifts the wire shape in ways that break smoke replay.** Mitigation: paywall-smoke.ts already passes S1-S4 on the existing `/route` paywall with two-payment shape. SKU paywalls are simpler (one payment, no upstream), so the smoke shape is strictly easier.
3. **Strata pulls out of the reference integration.** Then the SKU paywall is still useful but loses the "first paying agent in ~1 week" leading indicator. Falls back to organic Bazaar-discovery latency. Mitigation: SKUs are revenue-bearing on their own; even without Strata, `/verify` and `/score-provider` make sense to list because the npm verifier (`@trustbench/verify-receipt`) is already a known artifact.
4. **paywallGate generalization breaks `/route`'s existing paywall.** This is the highest-risk technical change. Mitigation: comprehensive smoke regression — run existing `paywall-smoke.ts` against `/route` before and after the generalization, require S1-S4 still pass before merging.

---

## 8. Decision criteria for committing the pivot

This sketch is a candidate, not a commitment. To commit, the following should be true:

- Strata's reference integration sketch is still expected within ~1 week (no pivot or pullback signal from them)
- Solo-founder energy for ~10-15 hours of focused work over 3-5 days is available (per CLAUDE.md founder-shape calibration)
- The risk of the `/route`-only kill criterion firing negative is acceptable (it is — Day 6 fix is provably correct in code, the indexing-blocker is structural)
- No urgent dependency on `/route` being the headline catalog entry (e.g., a partner who explicitly wants to demo TrustBench's routing wedge in the Bazaar UI before Strata's integration lands)

If all four hold: commit. Add the decision-journal entry below, schedule the SKU paywall work as the new Phase 4 listing sprint focus, and let the existing `/route` paywall keep running for any agent that finds it organically.

If any of them fail: the pivot is a future option, not a today decision. Stay with `/route`-only, accept the kill criterion firing negative (with the honest framing that the routeTemplate fix landed but the upstream-provider dependency was the actual blocker), and re-engage on the SKU question after Strata's integration sketch lands.
