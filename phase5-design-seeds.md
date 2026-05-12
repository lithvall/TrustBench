# Phase 5 — Design seeds (collected pre-launch)

**Status:** Notes-only. Phase 5 doesn't start until x402 is debugged, earning, and Phase 4 is closed (per `CLAUDE.md`'s "Phased plan"). This file captures design observations that came up during Phase 4 work which would otherwise be lost when the Phase 4 chat window closes.

**When picking this up in a fresh session:** read `CLAUDE.md` and `phase4-kickoff.md` first to confirm current state, then this file for accumulated design seeds.

---

## Subjective output validation / paid agent work terms

**Source:** Burak (@RahilBuilds) → Nick Prince (Agentic.market), 2026-05-04. Burak asked: *"For paid agent work like research or prospecting, where do the terms live? Like brief, proof of delivery, review window, refund rules — marketplace, x402 metadata, or seller logic?"* Nick's reply: *"unsolved for large transactions where there's also more subjectivity around the output. any ideas?"*

**Why this is Phase 5 territory for TrustBench:**

The whole problem space — terms / proof-of-delivery / disputes — is exactly what receipts + policy firewall + dispute channel can solve. Coinbase's Agentic Market doesn't ship this. Neither does any competitor in the routing/payment space. The pattern would be:

- **Receipt extension.** Today the receipt envelope carries call metadata + settlement reference + replayable audit. Phase 5 adds a structured `terms` field carrying brief / SLA / acceptance criteria. Signed by buyer at quote time. Buyer's signature attests "I asked for this." Seller's response is then judged against the signed terms.
- **`/disputes/:id` endpoint.** Between buyer-rejects-output and chargeback-on-chain (which is hard / impossible on EVM L2s), there's a window for off-chain resolution. TrustBench could host this — receipts make the audit trail; we add a dispute endpoint that marks a receipt as disputed and surfaces the resolution artifact.
- **Reputation feedback.** Receipts + disputes feed back into provider scorecards. "X disputes in last 90 days" as a public ranking factor. Stronger than liveness-only signal.
- **Optional escrow mode** (custodial — separate decision needed). For high-trust repeated relationships, TrustBench (or a third-party escrow agent) could hold payment until acceptance. **This crosses the non-custodial line** and would require regulatory analysis + explicit user consent. Not core; opt-in only.

**Tag:** P5-dispute. Don't start until Phase 4 closes, the receipt corpus has volume, and at least one paid agent has filed a real complaint.

**Why this matters competitively:** Coinbase + Stripe MPP + every other agent-payment infra ship the same shape — frictionless payment, no dispute layer. TrustBench's receipts already enable dispute auditability; adding the resolution surface makes us the only protocol-agnostic dispute-aware router. Worth Phase 5 effort.

---

## Verification tier hierarchy (post-Coinbase verified-badge ship)

Captured 2026-05-05. Originally planned for Phase 4 as the "refundable provider verification bond" — Coinbase shipped a free 1P / proxied attestation in week 2 of Agentic Market (2026-05-04), which subsumes part of what the bond was going to do. The bond now positions as Tier 3:

| Tier | Signal | Cost | Source |
|---|---|---|---|
| 1 | Self-attested | Free | Provider self-lists |
| 2 | Coinbase 1P badge | Free | Coinbase Agentic Market curators |
| 3 | TrustBench verification bond | Paid (refundable) | Provider stakes USDC; revoked-and-burned on confirmed misbehavior |

Tiers stack rather than compete. Bond is for serious providers wanting stronger-than-1P trust signal — enterprise integrators, anyone with compliance asks. Bond design captured in `phase3-closeout.md` § "Phase 4 plan" P4-10.

---

## Multi-protocol settlement (p402 / Canton / cross-chain)

Captured 2026-05-04 baseline (in `x402-ecosystem-state.md`, repeated here for Phase 5 continuity). The strategic moat:

- x402 is the public agent-payment protocol on Base / Solana / Stellar / Polygon / Arbitrum / World
- p402 is the equivalent for Canton (enterprise / regulated counterparty settlement)
- AP2 is Google's mandate format (carried over x402 settlement when integrating with A2A)
- Stripe MPP is the fiat-hybrid alternative — different design philosophy (sessions / streaming / Stripe compliance baked in)

TrustBench's Phase 5 ambition: route across all of these from a unified API. Agent says "I want capability X for ≤ $Y"; TrustBench picks x402 / p402 / MPP based on regulatory context, network availability, price, and signed-receipts compatibility. Single audit trail across protocols.

**Hard prerequisites before Phase 5:**
- Phase 4 closed (x402 path stable + earning + at least one paying agent).
- Direct conversation with at least one Canton-side ecosystem participant.
- Regulatory analysis of multi-protocol routing — particularly anything that touches custody adjacent to fiat (MPP).
- A second design partner beyond Infopunks who has explicit interest in cross-protocol receipts.

---

## Seed observations not yet ranked into phases

### Skill-file-as-distribution (P4 work, but Phase 5-relevant)

`x402SKILL.md` documented as Phase 4 work in `phase4-kickoff.md` § "P4-skill". Phase 5 angle: once `trustbench/skill.md` ships and gets pasted into agent contexts, those agents become callers of the dispute / reputation surfaces above. The skill-file user is the natural audience for Phase 5 features.

### "Discovery is upstream of curation"

Reasonable-Degree101 (Paddock founder) framing 2026-05-04. The five-bucket matrix:
- Verified (curated + paid)
- Listed-not-paid (in registry, no agent spend)
- Paid-not-curated (agents spending, no registry presence)
- Paid + dead in registry (registry inventory wrong)
- **Paid + not in either registry** (dark-matter providers — discovery-layer-bypass)

The fifth bucket is the load-bearing one for Phase 5 ambition: any router that can route to dark-matter providers (services agents are paying for OUTSIDE the canonical discovery surfaces) demonstrates the "discovery is upstream of curation" thesis. Combine with Paddock's payment-volume signal + TrustBench's liveness signal = the canonical map of where agent money is actually going. Worth tracking as a Phase 5 product surface ("comprehensive map", not "verified registry").

### Burak's terms-and-deliverables question as a launch wedge

Once Phase 5 dispute layer is real, the launch positioning is: *"agent payments without a dispute channel are payments waiting for the first incident."* That's the kind of framing that lands a Phase 5 launch as a category-defining piece of infrastructure rather than a feature add.

---

## Receipt envelope: byte-identical replay now actually delivered (2026-05-12)

**Source:** Phase 4 Path P session 2026-05-12. FIX-S3 shipped — the `paid_requests.response_body` JSONB roundtrip was reordering keys, breaking byte-identical idempotency replay. Fixed by canonicalize-on-emit (`paywall-handler.ts:292-332`). Smoke S1-S4 all pass since.

**Why this is Phase 5 territory:**

Phase 5's dispute layer + terms extension above all hinge on receipts being byte-stable across replays. A buyer disputing an output 14 days after delivery needs to prove "this receipt I have in my records is the same one the seller signed" — naive byte equality is the simplest, most universally-supported proof. JCS-aware verification works but adds a dependency every dispute-channel consumer would need; byte equality works for anyone with `grep`.

The pattern is also the right shape for the future `terms` field: it'll be added to the receipt envelope outside the signed `receipt` block, similar to how `replayed_at` was added in v0.1.1. When the dispute layer adds a `terms` field at the envelope level, the canonical-on-emit pattern carries it cleanly.

**How to apply:** when designing Phase 5 dispute/terms extensions, reuse the `canonicalKeyOrder()` helper from paywall-handler.ts. Don't introduce a parallel canonicalization path — single source of truth keeps the verifier semantics simple.

---

## Discovery latency: Bazaar may be slower than its docs claim, which reinforces the discovery-is-upstream-of-curation thesis (2026-05-12)

**Source:** Phase 4 Path P session 2026-05-12. Four real paid /route settles fired against the production paywall with valid bazaar declaration (`extensions.bazaar`) + `resource.url` on the 402 body + `resource` in the X-PAYMENT PaymentPayload envelope. CDP merchant-discovery API at `https://api.cdp.coinbase.com/platform/v2/x402/discovery/merchant?payTo=<revenue>` remained empty for 30+ minutes after each settle. Observed re-validation latency for *existing* entries: ~5-15 min. Inferred first-index latency for *new* payTo+URL pairs: substantially longer (>30 min, possibly hours, possibly requires explicit registration step that's not documented).

**Why this matters for Phase 5:**

The original "discovery is upstream of curation" thesis (Paddock framing, captured above) assumed dark-matter providers — services agents pay for OUTSIDE the canonical discovery surfaces. Today's data point sharpens that: even a route that IS trying hard to be discoverable (declared the bazaar extension, includes resource on both 402 and X-PAYMENT, hit the canonical CDP facilitator) doesn't show up in the canonical catalog within the documented window. That makes the canonical catalog *itself* less authoritative than the docs imply, and increases the value of a comprehensive map that includes "claimed-discoverable but not yet catalogued" as a category.

The five-bucket matrix gains a sixth (or refinement to bucket 4):
- Paid + declared-discoverable + not yet in catalog (indexing in flight or rejected silently)

A TrustBench Phase 5 surface that exposes its OWN registry-of-claimed-routes (sourced from settle events on the facilitator + the bazaar declarations they carry, not from CDP's catalog) would be a real differentiator. "We index every route that ever successfully settled through a CDP-or-equivalent facilitator with a bazaar declaration, regardless of whether the canonical catalog picked it up." That's strictly more comprehensive than CDP's discovery and harder to game (settle-attested, not just self-declared).

**Tag:** P5-comprehensive-map. Don't start until Phase 4's listing question resolves one way or the other — if Bazaar eventually indexes us at T+24h or T+48h, the friction is just latency. If it never does, this seed becomes a launch wedge.

**How to apply:** when picking up Phase 5, first check whether trustbench.io/route ever appeared in the CDP catalog. If yes, the friction was latency and this seed becomes a "comprehensive map" feature add. If no, this seed becomes a hard differentiator: TrustBench-as-the-only-router-that-routes-to-uncatalogued-routes. Either way, the data point about first-index latency >> re-validation latency is the load-bearing input.

---

## Verification tier shape: manual-verified is operational, not a tier (2026-05-12 refinement)

**Source:** Phase 4 Path P session 2026-05-12. Promoted CoinMarketCap to `x402_verified=true` via `scripts/mark-verified.ts` based on live-probe evidence. The bit reflects empirical conformance (we POSTed `{}` and got a clean v2 402 with valid `accepts[0]` on Base), but the act of flipping it was operational — me running a script — not curatorial.

**Refinement to the verification tier hierarchy table above:**

The three-tier shape (self-attested / 1P-badge / bond-staked) is the right public-facing surface, but operationally there's a hidden zeroth tier: **operator-verified**. When the registry-conformance v0.2.0 work ships (automated POST-conformance probe), this should be collapsed into "automated conformance check" so the operational shortcut becomes a system property, not a per-provider manual flip. Until then, treat each `mark-verified.ts` invocation as a Decision Journal entry (one logged 2026-05-12 with 90-day check_back for CMC).

**How to apply:** when v0.2.0 lands, audit all `metadata.x402_verified=true` rows. Any not auto-confirmable by the new POST-conformance probe should be flipped back to false (operational integrity > registry size). The mark-verified tool stays as the manual override path for edge cases (provider migrated to a new URL we haven't crawled, etc.).

---

## How to apply this file

- When Phase 5 work begins, this file becomes the design seed for the actual Phase 5 spec docs (analogous to `phase3-x402-construction.md`, `phase3-receipt-generator.md`, etc. for Phase 3).
- Until then: append observations as they accumulate. Don't rewrite; just timestamp and add.
- If a "seed" graduates from observation to active P5 milestone, move it from this file into a dedicated `phase5-<milestone>.md` design doc.
- Every entry here should reference the source signal (which conversation / which file / which date) so that the trail back to the original context is preserved across chat windows.
