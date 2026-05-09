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

2026-05-08: Reverse the 2026-05-08 hold on Solana visibility unblock + npm verifier (same-day reversal). Reason: review of Phase 4 backlog plus the unique-context strategic value of two same-day artifacts (multi-network registry surfaced + standalone third-party verifier) outweighed the engineering cost; both shipped same-day.

2026-05-08: Solana visibility unblock to /rankings (filter removal, Base-only kept on /route). Reason: P4-3 transition needed registry-first visibility per "discovery upstream of curation" framing; one-line filter removal in scorer.ts + defense-in-depth filter retained in provider-selection.ts protects /route from non-Base settlement until P4-3 (Solana settlement) ships; cache key bumped v4→v5.

2026-05-08: Publish @trustbench/verify-receipt v0.1.0 to npm (https://www.npmjs.com/package/@trustbench/verify-receipt). Reason: a receipt is only as honest as the verifier you ran; if the only verifier is TrustBench-hosted, the trust model collapses; standalone npm-installable verifier closes the loop and gives partners/auditors a no-relationship-needed reproducibility path.

2026-05-08: Use Granular Access Token with "Bypass 2FA" + Read+Write to @trustbench scope for npm publish. Reason: account uses passkey/security-key 2FA only (no TOTP available for `npm publish --otp`); Granular Token with bypass is the documented path for security-key-only npm accounts.

2026-05-08: Rotate npm Granular Access Token immediately after it was pasted into Claude chat. Reason: chat tokens are a credential leak; published package is unaffected, only publish credentials at risk; rotation is cheap, attack surface stays closed.

2026-05-08: Public Reddit reply to AngeloKappos (QBT-Labs/x402, /r/AI_Agents) maps 1:1 to his production checklist + "compose, not compete" closing posture. Reason: high-effort engagement on a peer technical comment > shipping-news drop; matches the component-in-stack framing committed 2026-05-07; positions TrustBench as a buyer-side router that composes with QBT's buyer-side signer rather than competes.

2026-05-08: Don't escalate Aggelos (QBT-Labs) to DM until he replies on the Reddit thread. Reason: public alignment is already valuable as social proof; escalation cadence should be earned by his response shape; if he proposes deeper conversation, DM is the right next move; if he just thanks and moves on, the public alignment stands.

2026-05-08: Defer x402-paywall implementation to a dedicated design pass before code. Reason: needs decisions on which endpoints to paywall first, free-tier signaling, wire-shape for being x402 server vs client; design before code is the correct sequencing for a revenue-bearing surface.

2026-05-08: Paddock 7-night rollup CSV ETA committed for Monday 2026-05-11. Reason: Paddock thread had been waiting since 2026-05-04 (4 days); commitment with concrete date moves the relationship forward; Monday gives weekend buffer to build the rollup script or pull from existing probes data.

2026-05-08: Paddock CSV will include both `canonical_url` and `origin` columns. Reason: Paddock matches by domain currently; full-path matching loses to TrustBench's URL-as-key schema (e.g. mesh.heurist.xyz alone is ~150 distinct Solana tools); both columns let his domain-match work while preserving path-level data for any consumer that wants it.

2026-05-08: QBT-Labs/x402 verdict after focused repo read = compose, not compete. Reason: their surface is agent-side payment plumbing (encrypted vault + isolated signer process + client-resident policy file + EVM/Solana/Cardano signing) plus per-merchant gating middleware; zero overlap with TrustBench's routing surface, receipt envelope, or registry. The natural compose hook is `npx @qbtlabs/x402 client-proxy --target https://trustbench.io/route` — their proxy signs, our `/route` selects + attests, neither product has to know about the other's internals. Watch-flag: re-classify if a router lands in their codebase (currently absent). Full read in `competitive-landscape.md` § QBT-Labs/x402 entry.

2026-05-08: Paywall v0.1.0 scope = `/route` only, with 4 anchor decisions. Reason: smallest test of the revenue thesis; mirror of existing x402-client flow; low risk to free surfaces. The four anchors logged here (full design at `phase4-paywall-design.md`): (a) single Hono server plays both roles, no separate paid-API service; (b) dedicated revenue wallet, receive-only, distinct from probe wallet; (c) `/route` paywall as a separate x402 pre-payment, agent makes two payments per call (TrustBench fee + provider fee), bundled-payTo deferred until facilitator supports it cleanly; (d) Ed25519-signed responses on differentiated-work endpoints, no double-signing on `/rankings` JSON or `/receipts/:id` JSON.

2026-05-08: Free-tier quota deferred to v0.2.0 of paywall. Reason: `/rankings` and `/receipts/:id` JSON ship without throttling in v0.1.0; observe read-volume curve first; revisit if/when an agent hits >60 req/IP/min sustained. Hybrid pattern is designed (X-RateLimit-* headers below quota, 402-with-x402-payment-requirements above) but not implemented until volume justifies it.

2026-05-08: Refund / dispute path deferred from v0.1.0 paywall. Reason: idempotency-key reuse + on-chain nonce dedup cover the main retry case; off-chain credit ledger design held until >5 dispute requests in any 30-day window. Watch trigger documented in `phase4-paywall-design.md` § Q9.

2026-05-08: `paid_requests` table added in v0.1.0 paywall. Reason: revenue tracking + dogfood for the future `/compliance-export` endpoint; schema documented in `phase4-paywall-design.md` § Q10; RLS public-read-own-rows by wallet match, body-hash stored not body itself for privacy + storage cost.
