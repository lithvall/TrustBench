# TrustBench Decisions Log

A flat, dated record of non-trivial decisions. The point isn't completeness — it's that the *why* behind a decision is readable when picking up the project cold months later. Plus (from 2026-05-11): the *assumption* and *leading indicator* behind each decision so calibration can be graded 90 days later.

## Format

**Legacy format (2026-04-30 → 2026-05-10):** `YYYY-MM-DD: <decision>. Reason: <one sentence>.`

**New format (2026-05-11 onward — Decision Journal entries):**

```
YYYY-MM-DD: <decision>. Reason: <one sentence>.
  - assumption: <the load-bearing assumption this decision rests on>
  - leading_indicator: <observable signal that will tell us right/wrong before full outcome>
  - check_back_date: YYYY-MM-DD (90 days from decision date)
  - status: open
```

When `check_back_date` arrives, grade the entry by appending one of:
- `  - status: validated (YYYY-MM-DD). leading_indicator observed as predicted.`
- `  - status: disproven (YYYY-MM-DD). assumption broke because <one sentence>.`
- `  - status: rescheduled (YYYY-MM-DD → new_check_back_date). reason: <one sentence>. (max 3 reschedules)`
- `  - status: superseded by <YYYY-MM-DD decision> (YYYY-MM-DD).`

**Why richer entries:** historical entries (Apr-May 2026) capture *what* was decided. They don't force calibration on whether the decision turned out right. New entries do, via the assumption + leading indicator + 90-day callback. Pattern lifted from `ProjectAutonomous/VaultIntoBusinessSystem.md` and `lessons.md` 2026-05-10 entry. Historical entries are NOT retrofitted — they're frozen context.

**Callback workflow (manual until Slice 1 of ProjectAutonomous lands):** every Monday morning during weekly review, scan decisions.md for entries with `status: open` AND `check_back_date ≤ today`. Grade each. Append to `lessons.md` if a disproven decision reveals a pattern worth keeping (e.g. recurring assumption-class failures). See `prompts/decision-journal.md` for the full prompt.

Started 2026-05-08 per `phase6-reassessment-2026-05-07.md` (now header-marked SUPERSEDED) § 9 D-2. Upgraded to Decision Journal format 2026-05-11 per the Slice 1 plan in `ProjectAutonomous/01-slice-1-jarvis-brain.md`.

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

2026-05-11: Phase 4 v0.1.0 paywall flipped LIVE in prod on `/route` after § 1.3 + Days 1-3 push-through in one session. Reason: settle-test against CDP returned tx `0x5a558117...`, RLS smoke 5/5 green, prod paywall smoke S1 PASS confirming 402 envelope correctness and revenue-wallet routing. End-to-end paid `/route` call not yet validated tonight (paywall_smoke S2 503'd on a suspended Infopunks Render endpoint), but the refusal-to-charge behavior is itself a successful non-custodial-property test: agent wallet's nonce unburned, no money moved, the paywall correctly fails safe when the registry surfaces a non-conformant provider. Registry-conformance work scheduled as v0.2.0 (registry curation + POST-fallback live probe). Critic-pass verdict was upgraded to `acceptable` after v0.1.1 gates landed; both gates (per-paying-wallet rate limit, replayed_at marker) are deployed and active.
  - assumption: Coinbase CDP facilitator stays available within 1K tx/mo free tier and continues to support Base mainnet `exact + eip155:8453` through v0.1.0
  - leading_indicator: any week where CDP returns 5xx or rate-limits >5% of paywall settle calls signals we need to switch to a self-hosted facilitator (x402-rs or equivalent) or accept a v0.2.0 architectural shift
  - check_back_date: 2026-08-09
  - status: open

2026-05-11: Provider `infopunks-cognition-layer-x402.onrender.com` no longer reachable; suspended-by-user per Render routing header. Reason: between P4-1b (2026-05-06) and the v0.1.0 prod paywall smoke (2026-05-11), Infopunks deliberately turned off their cognition layer on Render. This was the registry's most-reliable x402-conformant `data`-capability provider and now isn't. Doesn't block v0.1.0 launch — the paywall middleware correctly refused to charge the agent when the live probe failed. Does mean the v0.2.0 registry-curation work needs to (a) treat HEAD-probe liveness as a necessary-not-sufficient signal, (b) add a periodic POST/full-request live-conformance check, (c) deprioritize providers whose live probe returns non-402 statuses or carrier-platform suspend signals. The strategic Infopunks relationship is a separate concern — they offered "let's collab" on 2026-05-07; if they've sunset the cognition layer entirely, the compose-with-Infopunks framing in `partnership-day-record-2026-05-07.md` needs revisiting.
  - assumption: Infopunks's Render suspension is a temporary infra move (free-tier cost / migration / pause), not a project shutdown
  - leading_indicator: any post on @InfopunksHQ X feed announcing pivot or sunset, OR no new x402 activity from them for 30+ days
  - check_back_date: 2026-08-09
  - status: open

2026-05-08: Defer x402-paywall implementation to a dedicated design pass before code. Reason: needs decisions on which endpoints to paywall first, free-tier signaling, wire-shape for being x402 server vs client; design before code is the correct sequencing for a revenue-bearing surface.

2026-05-08: Paddock 7-night rollup CSV ETA committed for Monday 2026-05-11. Reason: Paddock thread had been waiting since 2026-05-04 (4 days); commitment with concrete date moves the relationship forward; Monday gives weekend buffer to build the rollup script or pull from existing probes data.

2026-05-08: Paddock CSV will include both `canonical_url` and `origin` columns. Reason: Paddock matches by domain currently; full-path matching loses to TrustBench's URL-as-key schema (e.g. mesh.heurist.xyz alone is ~150 distinct Solana tools); both columns let his domain-match work while preserving path-level data for any consumer that wants it.

2026-05-08: QBT-Labs/x402 verdict after focused repo read = compose, not compete. Reason: their surface is agent-side payment plumbing (encrypted vault + isolated signer process + client-resident policy file + EVM/Solana/Cardano signing) plus per-merchant gating middleware; zero overlap with TrustBench's routing surface, receipt envelope, or registry. The natural compose hook is `npx @qbtlabs/x402 client-proxy --target https://trustbench.io/route` — their proxy signs, our `/route` selects + attests, neither product has to know about the other's internals. Watch-flag: re-classify if a router lands in their codebase (currently absent). Full read in `competitive-landscape.md` § QBT-Labs/x402 entry.

2026-05-08: Paywall v0.1.0 scope = `/route` only, with 4 anchor decisions. Reason: smallest test of the revenue thesis; mirror of existing x402-client flow; low risk to free surfaces. The four anchors logged here (full design at `phase4-paywall-design.md`): (a) single Hono server plays both roles, no separate paid-API service; (b) dedicated revenue wallet, receive-only, distinct from probe wallet; (c) `/route` paywall as a separate x402 pre-payment, agent makes two payments per call (TrustBench fee + provider fee), bundled-payTo deferred until facilitator supports it cleanly; (d) Ed25519-signed responses on differentiated-work endpoints, no double-signing on `/rankings` JSON or `/receipts/:id` JSON.

2026-05-08: Free-tier quota deferred to v0.2.0 of paywall. Reason: `/rankings` and `/receipts/:id` JSON ship without throttling in v0.1.0; observe read-volume curve first; revisit if/when an agent hits >60 req/IP/min sustained. Hybrid pattern is designed (X-RateLimit-* headers below quota, 402-with-x402-payment-requirements above) but not implemented until volume justifies it.

2026-05-08: Refund / dispute path deferred from v0.1.0 paywall. Reason: idempotency-key reuse + on-chain nonce dedup cover the main retry case; off-chain credit ledger design held until >5 dispute requests in any 30-day window. Watch trigger documented in `phase4-paywall-design.md` § Q9.

2026-05-08: `paid_requests` table added in v0.1.0 paywall. Reason: revenue tracking + dogfood for the future `/compliance-export` endpoint; schema documented in `phase4-paywall-design.md` § Q10; RLS public-read-own-rows by wallet match, body-hash stored not body itself for privacy + storage cost.

2026-05-09: Sent Infopunks follow-up DM at 08:54 (2 days after initial reply, past the 48h anti-anxiety window). Reason: real artifacts shipped since last contact (`@trustbench/verify-receipt` v0.1.0 on npm + paywall design pass closed) plus the prior DM left an explicit open thread (Johan asked permission to send a written summary while processing the offer-and-receipt extension implications). Follow-up closed that loop by naming the resolution (component-in-stack, not standalone), surfaced the artifacts, and offered the written one-pager as the next step. Closer reduced from "async whenever, or call when it feels right. no deadline." to "let me know your thoughts, no rush." per the no-calls-in-outreach rule.

2026-05-09: Categorical rule logged: never propose calls/meetings in any outreach draft. Reason: Johan stated explicitly *"that is something I don't ever want to do"* after sending the Infopunks DM. Hardens the partnership-day async-first framing into a permanent constraint. Memory at `feedback_no_calls_in_outreach.md`. Applies even when partner asks for a call (defer to async; surface to Johan if they push twice).

2026-05-11: Pursue Bazaar / agentic.market listing via the in-code `declareDiscoveryExtension` + first-CDP-settle path, not via an external submission flow. Reason: research (`phase4-listing-research.md`) found that agentic.market and Bazaar are one listing (Bazaar is the index; agentic.market is the human render of it) and that listing is automatic after (a) the route is wrapped in `bazaarResourceServerExtension` + `declareDiscoveryExtension({ info, schema })` and (b) at least one real settle goes through the Coinbase CDP facilitator against the declared route. There is no form, PR, or email path. Production paywall already uses the CDP facilitator (`paywall-handler.ts` buildFacilitator), so the gap to listing is server-side wire-up of ~half a day, not a multi-day external submission cycle.
  - assumption: declaring the Bazaar extension on `/route` + one CDP-mediated settle is sufficient to trigger indexing; the `EXTENSION-RESPONSES` header on settle response will tell us within one round-trip whether the metadata validates
  - leading_indicator: within 72 hours of the first declared-route CDP settle, `https://agentic.market/validate` returns indexed for `https://trustbench.io/route` OR the `EXTENSION-RESPONSES` header on the settle response returns `rejected` with a reason
  - check_back_date: 2026-08-09
  - status: open

2026-05-11: For Bazaar indexing, annotate `/route` with the dynamic-routes pattern from `x402-foundation/x402/docs/extensions/bazaar.mdx` rather than expose a separate fixed-shape trial route alongside. Reason: the value of TrustBench is the routing primitive itself; a trial route would discover-then-disappoint agents who pay $0.005 expecting the real router and instead get a demo example, then have to read documentation to find the real `/route`. Dynamic-routes keeps the single public surface honest. Risk-mitigated by running a 30-minute pre-commit spike against the documented pattern; if catalog UI fails to render the entry cleanly, fall back to a trial route.
  - assumption: Bazaar's catalog UI renders dynamic-routes entries cleanly enough that an agent browsing agentic.market can identify TrustBench as a useful routing primitive without confusion
  - leading_indicator: the agentic.market homepage card for TrustBench, viewed within 7 days of first indexed settle, is parseable by an agent (has a clear name, description, price, capability tag) AND does not visibly degrade vs neighboring fixed-route listings
  - check_back_date: 2026-08-09
  - status: disproven (2026-05-11). assumption broke because there is no "dynamic-routes pattern" documented for Bazaar in the first place — the CDP Bazaar doc at https://docs.cdp.coinbase.com/x402/bazaar describes only `input`/`inputSchema`/`output`/`bodyType` schema declaration; variable pricing is handled by the standard x402 `accepts[]` array in 402 responses, not by a Bazaar-specific flag. The original premise (that dynamic-routes was the load-bearing decision between "annotate /route directly" vs "trial route alongside") was a hallucination from an earlier WebSearch snippet that confused runtime pricing with discovery dynamics. The simpler conclusion holds: annotate `/route` directly using the standard schema declaration. No trial route needed. Implementation simplified; see updated `phase4-bazaar-extension-runbook.md` § 3.6.

2026-05-11: Sequencing for listing sprint — quick wins + full stale-copy sweep this session; Bazaar extension wire-up + dynamic-routes spike + first indexed settle in the next session. Reason: the `/pricing` JSON facilitator URL drift was confirmed live via direct fetch during research (still claimed `x402.org/facilitator` while production traffic uses CDP); when Bazaar's catalog crawls our public surfaces post-extension-deploy, the stale URL would be indexed alongside the listing. Fixing public copy before the extension fires the first crawl is load-bearing for listing accuracy, not cosmetic. Extension wire-up itself is a focused 2-4 hour block better given a fresh session with the bazaar.mdx doc read carefully.
  - assumption: Bazaar's catalog crawler pulls from public surfaces (skill.md, pricing, .well-known) at extension-registration time and/or per-settle
  - leading_indicator: the agentic.market card for TrustBench, post-indexing, shows facilitator info consistent with what was in our public surfaces at first-settle time
  - check_back_date: 2026-08-09
  - status: open

2026-05-11 (end of day): Ship Bazaar wire-up infrastructure to prod default-OFF; defer CDP-indexing validation to a follow-up session. Reason: 3-hour focused wire-up session reached the point where the 402 wire shape (`body.extensions.bazaar = { info, schema }`) is validated against the canonical `BodyDiscoveryExtension` interface via direct curl, but actual indexing cannot be tested today because (a) `paywallGate` is route-coupled and rejects the spike's body shape before settle, AND (b) no live conformant upstream provider exists for the primary capabilities right now (Infopunks suspended; others unverified). The infrastructure is correct and fires automatically when the next conformant /route call lands; this is a "ship-in-pieces" outcome that is honest about what's ready vs. what's blocked. Full handoff in `phase4-bazaar-handoff-2026-05-11.md`. Two follow-up paths documented: Path P (pragmatic 2-3 hour session — find a working provider, validate end-to-end via /route directly) and Path R (principled multi-week refactor — decouple paywallGate from /route, fix registry conformance).
  - assumption: a future /route call from a paying agent against a capability with a conformant provider will trigger CDP cataloging automatically with no further code changes
  - leading_indicator: the first paid /route call after `TRUSTBENCH_BAZAAR_EXTENSION_ENABLED=true` is flipped on Railway shows up in `https://api.cdp.coinbase.com/platform/v2/x402/discovery/merchant?payTo=<revenue-wallet>` within 60 minutes
  - check_back_date: 2026-08-09
  - status: open

2026-05-11 (end of day): Defer the `paywallGate` refactor (decoupling from /route-specific body validation + provider selection) to Phase 5. Reason: the refactor is correct work but it's 4-6 hours of careful surgery on revenue-bearing code with idempotency + spend-cap + receipt-signature invariants to preserve; doing it during a listing-focused sprint inverts the risk/reward ratio (one validated listing today is more valuable than a clean architecture in two weeks). Full design + read-list documented in `phase4-bazaar-handoff-2026-05-11.md` § Path R. Schedule alongside the v0.2.0 registry-conformance work since both are unblocks for the Bazaar spike to function as originally designed.
  - assumption: the production /route path can produce a real CDP-mediated settle through some capability without the refactor, eventually surfacing the indexing signal
  - leading_indicator: any successful real /route call with TRUSTBENCH_BAZAAR_EXTENSION_ENABLED=true → confirmed cataloging on agentic.market within 1 hour
  - check_back_date: 2026-08-09
  - status: open

2026-05-11 (session closeout): Three listing surfaces shipped end-of-day. (1) Submitted TrustBench to Merit-Systems/awesome-x402 as PR #215 (https://github.com/Merit-Systems/awesome-x402/pull/215) — placed in `Open Source & SDKs` adjacent to Pipegate (closest concept-neighbor), row + description sharpened to lead with the differentiation moat (signed receipts, on-chain evidence, fail-safe paywall) per the 2026-05-11 competitive reclassification work. (2) Applied 10 GitHub topic tags to https://github.com/lithvall/TrustBench (`x402`, `agent-payments`, `routing`, `signed-receipts`, `non-custodial`, `mcp`, `usdc`, `base`, `eip-3009`, `ed25519`) — repo now surfaces on each topic page (e.g. github.com/topics/x402). (3) Rewrote the repo "About" description from the stale "Reputation & Benchmark Layer for x402 / Agentic.Market" (violated honest-framing rule + used pre-sharpening positioning) to "Non-custodial routing and audit layer for x402. Signed receipts, on-chain evidence, fail-safe paywall." — consistent with skill.md + .well-known + README + landing page meta. Reason for the whole batch: tangible listing surfaces ship today while Bazaar indexing remains blocked on registry conformance + paywall refactor. All three are independent of CDP, produce SEO/discovery value immediately, no waiting on external review.
  - assumption: the awesome-x402 maintainer (Merit-Systems) eventually merges this PR OR keeps it discoverable on the open-PRs page (36+ in queue; healthy backlog implies active triage)
  - leading_indicator: within 30 days, EITHER PR #215 is merged, OR I observe Merit-Systems merging 2+ other PRs from the open-PR queue (signals active maintenance). If neither, the awesome-x402 path is dead and we need an alternative curated listing
  - check_back_date: 2026-06-10
  - status: open
