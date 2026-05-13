# Pending decision journal entry — 2026-05-13

**Status:** Draft, not committed. Append to `decisions.md` only if the SKU paywall pivot is approved. If not approved, discard this file.

**Companion artifact:** `phase4-sku-paywall-sketch.md` — full scope, engineering estimate, what-could-go-wrong.

---

## Entry as it would appear in decisions.md

```
2026-05-13: Pivot Phase 4 listing sprint from `/route`-only paywall to SKU-paywall + Bazaar listing (minimum viable: `/verify` at $0.002; optimistic: `/verify` + `/score-provider` at $0.005). Reason: `/route` is meta-routing and structurally cannot settle without a live x402-conformant upstream provider on Base, and the registry has none today (Infopunks pivoted to Pay.sh radar 2026-05-11; CMC promoted to verified 2026-05-12 but smoke still 503s 2026-05-13). The non-custodial guard correctly refuses to charge a routing fee against a dead provider — that's the system working as designed, not a bug to patch. Meanwhile Strata's tier confirmation arrived 2026-05-12 with reference integration sketch due in ~1 week, consuming `/verify` and `/score-provider` directly. Paywalling SKUs now is on the critical path for the Strata integration regardless of the Bazaar listing question; using the same engineering hours to also clear the indexing pathway (SKUs are self-contained, no upstream dependency) is the higher-leverage allocation. Full scope and trade-offs in `phase4-sku-paywall-sketch.md`. Original /route-only paywall stays live for organic discovery; this pivot adds SKU surfaces alongside, not in place of.
  - assumption: CDP Bazaar indexing works identically for self-contained SKU endpoints as it does for upstream-dependent routing endpoints (i.e., the indexing pathway tested by the Day 6 routeTemplate fix applies cleanly to SKU paywalls)
  - leading_indicator: within 14 days of `/verify` paywall going live and the first paid /verify settle landing, CDP merchant-discovery returns at least one resource (`/verify` and/or `/score-provider` if shipped) for `payTo=0x552000Ffb06445D2dD7F4264c6595B4b11C33C35`. Independent leading indicator: within 21 days, Strata's reference integration consumes /verify in their MCP gateway flow with at least one real paid call.
  - check_back_date: 2026-08-11
  - status: open
```

---

## Status-update needed on existing entries

The 2026-05-12 Day 6 routeTemplate entry in `decisions.md` (last entry before this would be appended) currently has `status: open` with a 48h kill criterion firing ~2026-05-14 13:00 UTC. If the pivot is approved, that entry needs a follow-up note appended:

```
  - status: superseded by 2026-05-13 SKU paywall pivot (2026-05-13). The routeTemplate fix is provably correct in code (prod 402 confirmed 2026-05-13 contains extensions.bazaar.routeTemplate, all schema shapes match, v2 PAYMENT-REQUIRED header emitted), but the indexing pathway is blocked on a separate structural problem (no live x402 upstream provider in registry for capability=data on Base). The 48h kill criterion was designed to test the routeTemplate hypothesis, not the upstream-availability hypothesis — declaring the routeTemplate fix disproven on the basis of the indexing not landing would be the wrong assumption-class call. SKU paywall pivot moves the indexing test onto endpoints that are self-contained.
```

This is the right shape per the Decision Journal rule in CLAUDE.md: "Disproven decisions ALWAYS get a `lessons.md` entry describing the assumption-class failure — that's where calibration learning compounds." The assumption-class lesson here is: **kill criteria written against one hypothesis can fire negative for reasons outside that hypothesis, and treating the negative as disconfirming evidence would conflate two different failure modes.** The routeTemplate decision wasn't *wrong* — it was load-bearing for indexing AND the upstream-availability problem was a second, independent gate that wasn't named in the kill criterion.

That lesson should go in `lessons.md` either way (pivot approved or not), because the same shape will recur on future kill criteria.

---

## Critic-pass against the pivot (per CLAUDE.md high-risk-surface rule)

The pivot touches `paywallGate` (revenue-bearing), idempotency semantics (across-SKU namespace), and the Bazaar wire shape. High-risk surface. Per CLAUDE.md the Critic pass is non-negotiable. Output:

**Three rejection reasons a hostile reviewer would give:**

1. *"You're chasing the indexing kill criterion by expanding scope. The honest move is to admit the routeTemplate fix didn't ship indexing in 48h and write up why the kill criterion was poorly specified. Doing a 14-hour pivot to hit a self-imposed deadline is sunk-cost reasoning dressed up as strategy."*
2. *"Strata hasn't sent the reference integration sketch yet. You're pre-building infrastructure for a partner integration whose final shape isn't pinned. The locked tiers in their 2026-05-12 message tell you the prices, not the wire shape. If their MCP gateway expects a verify endpoint that consumes a different envelope than what you build, you ship the wrong API."*
3. *"You already deferred Path R (paywallGate decoupling) to Phase 5 on 2026-05-11 with the explicit reasoning that it's 4-6 hours of careful surgery on revenue-bearing code with idempotency + spend-cap + receipt-signature invariants to preserve, and that doing it during a listing sprint inverts the risk/reward ratio. Two days later you're proposing to do it. What changed besides one settle failing?"*

**Strongest counter-thesis (case for the opposite approach):**

Stay with `/route` only. Accept the kill criterion fires negative. Spend the same 10-15 hours on (a) registry-conformance work (the v0.2.0 item in `phase4-paywall-design.md`) so `/route` has reliable upstream providers, OR (b) Solana settlement support (P4-3) so the 150 Heurist mesh endpoints become routable, OR (c) outreach to Exa / OneSource / OATP for an explicit "you can route to us" relationship. All three preserve the `/route` framing as TrustBench's headline product. The SKU paywall stays the right v0.2.0 work; doing it now sacrifices the registry-conformance milestone for a marginal Bazaar listing acceleration.

**Named wedge competitor (real or hypothetical) who would beat this:**

x402route.vercel.app (real, discovered 2026-05-12). They're a thin routing primitive at $0.001/call. If TrustBench's catalog entry on Bazaar shifts from "/route" to "/verify + /score-provider", x402route becomes the only routing-named entry in the catalog. Agents searching the catalog for "route" or "routing" land on them, not us. The trust-layer differentiation (signed receipts, on-chain anchor) only matters if agents find us in the first place.

**Hidden assumption that, if wrong, breaks the whole thesis:**

That Strata's MCP gateway will consume `/verify` and `/score-provider` exactly as currently designed in `phase4-paywall-design.md` Q1. If their integration sketch lands and says "actually we want `/score-and-verify` as a single combined endpoint" or "we want batched verification of 50 receipts in one call, not 50 separate calls at $0.002 each," the API shape changes. Building before their sketch lands risks shipping the wrong shape.

**Kill criterion: if X is observed in Y weeks, abandon.**

If Strata's reference integration sketch (due ~2026-05-19) consumes a fundamentally different API shape than what's in `phase4-paywall-design.md` Q1 — e.g., a different endpoint name, a combined SKU, a batched call shape, or a different signature envelope — the SKU paywall built on the wrong shape is sunk cost. Abandon and rebuild against the partner-validated shape. Cost: 6-10 hours of throwaway code. Mitigation: don't ship `/verify` to public discovery surfaces (`skill.md`, `.well-known/trustbench.json`, `/pricing`) until Strata's sketch lands and validates the shape. Have the endpoint ready behind the env flag; flip it on after their sketch confirms.

**Verdict: acceptable-after-stress-test.** The pivot is structurally sound, but the Critic correctly surfaces that:
1. Building `/verify` *before* Strata's sketch lands is premature; do it *after* the sketch validates the shape.
2. Registry-conformance work is the alternative use of the same hours and is plausibly higher-value for `/route`'s long-term framing.
3. The hidden assumption (Strata consumes the SKU shape as currently designed) is the leading-indicator dependency.

**Stress-test resolution:** sequence the work to land *after* Strata's sketch arrives, not before. Use the 7 days between today and their sketch ETA to (a) prep the paywallGate generalization in a branch, smoke-test against `/route` for no-regression, and (b) finalize the registry-conformance design so the *next* sprint can ship that. When Strata's sketch lands, the SKU shape is validated against partner-real demand and the implementation is half-done in a branch.

This addresses all three rejection reasons:
- (1) The expansion is partner-driven, not deadline-driven, and gets the partner-validated shape baked in.
- (2) The shape risk is mitigated by waiting for Strata's sketch.
- (3) The paywallGate decoupling cost is real but it was deferred only because the right consumer for it didn't exist; Strata's tiers are that consumer, so the deferral reasoning is now reversed legitimately.

If you commit the pivot, the actual decision text in `decisions.md` should reflect this sequencing — "begin paywallGate generalization in branch starting 2026-05-13; ship `/verify` and `/score-provider` after Strata's reference integration sketch validates the API shape (~2026-05-20 target)."
