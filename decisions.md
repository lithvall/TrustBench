# TrustBench Decisions Log

A flat, dated record of non-trivial decisions. One line per decision plus a one-sentence reason. Five minutes a week of upkeep. The point isn't completeness — it's that the *why* behind a decision is readable when picking up the project cold months later.

**Format:** `YYYY-MM-DD: <decision>. Reason: <one sentence>.`

Started 2026-05-08 per `phase6-reassessment-2026-05-07.md` § 9 D-2 ("decisions.md exists from day 1 and gets updated whenever a non-trivial decision is made").

---

## Decisions

2026-04-30: Reject %-spread routing fee model. Reason: Phase 2 builders explicitly rejected it, with SpendGate's founder calling 1–3% spreads *"a big no no for a lot of people."*

2026-05-04: Phase 3 closed (router + receipts + audit + spend caps + idempotency). Reason: smoke A1–A5 / B1–B4 green against local mock provider; Phase 2-validated four primitives all shipped.

2026-05-06: Ship P4-1b first paid x402 receipt against real provider (`rcpt_01KQY7C44GAPSXZPFQYRZ1D10C`). Reason: end-to-end architecture proof against the hardest merchant case (CDP-mediated async settlement).

2026-05-07: Adopt Path E (router-as-product, defer Foundation standards work) over Path B (spec-as-product). Reason: external reviews + AP2 / offer-and-receipt verification confirmed standards-first is structurally fragile for solo-founder; revenue must validate before standards investment.

2026-05-07: Sunset AgentLog hypothesis after competitor verification. Reason: 9 verified competitors in the wedge (Toolspend launched 2026-02 with 401 PH upvotes, Ramp shipped AI token tracking, Orbit Money + CostGoat won privacy-first positioning); solo-founder differentiation structurally not available.

2026-05-07: Reject reliability-pivot proposal after competitor verification. Reason: 9+ verified competitors in the lane including PaySentry (open-source full-stack equivalent), PEAC (open-source signed receipts), Probe (free), x402station (industry-scale); standalone-product positioning closed.

2026-05-07: Commit to *component-in-stack* framing for TrustBench. Reason: three independent partnership inbounds in 48 hours (Infopunks, Strata, CLU_AGENT) all proposed the same compose pattern (pre-call scoring + post-call verification); converging external signal stronger than internal speculation.

2026-05-07: Revenue model is x402-native paywalled API endpoints, no subscriptions. Reason: matches solo-founder constraints (no sales motion, no billing infrastructure), aligns with x402 ecosystem norms, partner-validated by Strata's existing $29/mo/10K-call pricing implying ~$0.003/call industry norm.

2026-05-07: AP2 v0.2 declared complementary to TrustBench, not competing. Reason: AP2 has no Router role / no Routing Receipt / no on-chain settlement attestation; verified directly from the v0.2 spec + reference samples + a2a-x402 v0.2 spec.

2026-05-07: Ed25519 + JCS signature scheme stays for TrustBench internal receipts; EIP-712 + JWS adopted only for any future Foundation-track extension proposal. Reason: Ed25519 fits TrustBench's role (router-side attestation, not merchant Checkout JWT); EIP-712/JWS matches established x402 extension convention if we ever propose one.

2026-05-08: Send Strata integration sketch as secret (unlisted) GitHub Gist, not public. Reason: pricing tiers in § 6 would otherwise become discoverable list-price expectations for future partners; secret Gist is shareable-via-link without being indexed.

2026-05-08: Approve illustrative pricing tiers in Strata sketch ($0.0005 read / $0.002 verify / $0.005 score-provider / $0.01 audit-replay / $0.50–$2.00 compliance-export). Reason: starting points framed as reviewable (not legally binding); partner-specific arrangements can deviate; protects against future mispricing without being too cheap to win the integration.

2026-05-08: No free tier in the public commercial relationship. Reason: paid tiers are reasonable enough to lead with; if Strata pushes back on pricing during integration, partner-volume free credit becomes a negotiation tool rather than the opening offer.

2026-05-08: Hold the Solana visibility unblock and `@trustbench/verify-receipt` npm package. Reason: both require focused engineering time; Strata reply pending and Foundation-track work deferred — no immediate unblock-driven need; revisit when a partner specifically asks.

2026-05-08: No follow-up to Infopunks at <48h after most recent reply. Reason: anxiety-driven outreach signal; the relationship is in good standing; their last message was an offer to call which we politely deferred to async, they need beat to process the pivot before responding.

2026-05-08: Update CLAUDE.md, llms.txt, methodology page, and `.well-known/trustbench.json` to reflect partnership-day shift (component-in-stack, x402-paywalled API, no subscription tier mentions, fixed lithvall88 URL typo). Reason: due-diligence-readiness — anyone arriving at the GitHub or website should see current strategic posture, not 2026-04 framing.

2026-05-08: Update Grok daily X research briefing for component-in-stack framing + new partnership inbounds (Infopunks, Strata, CLU_AGENT) + verified-competitor anti-poach list. Reason: Grok is the channel that surfaced these partnerships originally; the briefing must reflect the new direction or it'll keep generating standalone-router-shaped drafts.
