# Strategic Pillars & Options — Mandatory Pre-Development Filter

**Date established:** 2026-05-14
**Status:** LOAD-BEARING. Every non-trivial development decision MUST be evaluated against this filter before work begins. No exceptions.
**Supersedes (in part):** the implicit "build endpoints, defend with signed receipts" assumption that ran through `TrustBench-strategy.md`, `phase4-kickoff.md`, and the `endpoint-portfolio-research-2026-05-14.md` initial deep-dive. Those documents are not invalidated; they are now read *through this filter*.

---

## Why this filter exists

On 2026-05-14, a brainstorm spinoff about "boring x402 endpoint portfolio" surfaced three findings that together meaningfully shift TrustBench's strategic position:

1. **A direct positional competitor named explicitly.** An investor tweet from @divuspop (verified, "Early Investor", 박상웅) framed $DEXTER and $PAYAI as the agent-economy winners. Dexter's four explicit stacks (Payment+Settlement / Search+Discovery / Data Analysis / Agent Advertising) overlap with TrustBench's discovery + receipt-data layers at two of the four. Dexter is token-funded — solo founder cannot match velocity on breadth.

2. **The "signed receipts as moat" thesis is already commoditizing.** A Critic pass on the four portfolio-research GO candidates found that multiple projects already ship Ed25519-signed receipts or equivalents on x402: `anchor-x402-mcp` (OFAC + signed attestation), PEAC Protocol (Ed25519 JWS at protocol layer), agentstamp (Ed25519 stamps + trust scoring + x402), Vaultra (RFC-3161 compliance receipts), Coinbase facilitator KYT, AWS Bedrock AgentCore Payments (May 2026 audit-trail bundling). The trajectory suggests signed receipts become protocol-layer default within ~6 months.

3. **All four "GO" candidates from the initial portfolio brief were downgraded by stress-test.** OFAC: weak-reject (anchor-x402-mcp already there). Aave HF: weak-reject (httpay.xyz shipped 186 endpoints including Aave APY). UK Companies House: strong-reject (OpenRegistry by Sophymarine ships 26 jurisdictions free). EU VAT: strong-reject (Vatlayer $9.99/mo unlimited).

Together, these mean: TrustBench cannot continue to build features on the implicit assumption that signed-receipt-with-on-chain-anchor is *by itself* a defensible moat. It is becoming table stakes. TrustBench needs a sharper articulation of *what specifically is defensible*, and every feature decision needs to be tested against that articulation.

The articulation that survives the stress-test: **two pillars**, both rooted in things TrustBench is currently uniquely positioned to own, and **three tactical options** for how to pursue them. This document is the canonical reference. Every future decision routes through here first.

---

## The context that surfaced this — verbatim

This section is the word-for-word capture so future sessions can read the analysis chain rather than relying on summary. Skip on first read if you only want the filter; come back when you need to understand why.

### 1. The Dexter / PayAI tweet (2026-05-14, @divuspop, translated from Korean)

> $DEXTER $PAYAI
>
> Many people, when talking about AI, focus only on aspects like model training using semiconductor chips, improvements in inference performance, and computing resources, but I believe that in the long term, a much larger market will open up from the moment when AIs actually engage in economic activities with each other.
>
> In the future, countless AI agents will purchase information, rent computing resources, hire other agents, and automatically perform tasks according to human instructions.
>
> And all of those actions will inevitably require payment processing.
>
> That's why I'm focusing on projects like PAYAI and DEXTER.
>
> PayAI has established itself as one of the top projects based on x402 facilitator standards, and recently participated in the launch of pay.sh with Google Cloud and the Solana Foundation.
>
> Dexter is also one of the top projects based on x402 facilitator standards, and it's aiming for a bigger picture.
> Below are the 4 stacks provided by Dexter:
>
> 1. Payment and Settlement
> → Secure transaction share with free facilitators (similar to past Google strategy)
> 2. Search and Discovery
> → Connect which tools and services are actually being used
> 3. Data Analysis
> → Accumulate data on which agents buy what and repeatedly use it
> 4. Agent Advertising
> → Attempt to expand to recommendation/advertising markets targeted at future AIs
>
> And the really important thing here isn't just payment fees — it's the data.
>
> Which agents buy what
> Which tools they repeatedly use
> Which services actually produce results
>
> This data has a high potential to lead to the advertising market in the future AI agent economy.
>
> In the past internet era,
> - Google dominated search,
> - Meta dominated advertising,
> - Visa dominated payment infrastructure.
>
> In the AI agent era, the company that dominates the "flow of agents" will be the biggest winner, and I believe Dexter could claim that.
>
> @PayAINetwork @dexteraisol

### 2. Critic pass findings (2026-05-14, on the 4 GO candidates from `endpoint-portfolio-research-2026-05-14.md`)

The Critic pass was an adversarial stress-test run after the initial research. It surfaced specific competitors and hidden assumptions that the initial deep-dive missed. The findings are reproduced here in full because they are load-bearing for the strategic shift.

#### Candidate 1 — OFAC / sanctions name screening (free-data slice) → **weak-reject**

Three rejection reasons a hostile reviewer would give:

1. The market is already crowded, not greenfield. The brief asserts "Zero registry coverage" but the registry has crawler blindness, not actual absence. `anchor-x402-mcp` ships 9 tools including "OFAC sanctions screening" with "signed decision attestation" priced $0.001-$0.010 USDC on Base — same wedge, same price band, same receipt shape. `mcp-sanctions-check` ships OFAC/EU/UK/UN screening via L402 with macaroon-scoped audit. The "Petter Strale" article is the literature *for an existing solution*, not a demand signal for a new one.

2. The single demand quote is from a dev.to post, not a paying customer. The whole conviction-1 case rests on one blog post. There's no buyer, no signed LOI, no Strata / Infopunks / CLU response saying "we'd pay $0.005/name." The brief even concedes Strale's quote is about *wallet* screening — different problem — and substitutes the name-vs-list slice itself.

3. Regulatory drift is one bad agent away. Build "honest list lookup," ship to ten agents, one of them uses your output to deny service or freeze funds, and now "we just publish list versions" is a defense you make to a regulator, not to your CLAUDE.md.

Strongest counter-thesis: don't build a sanctions endpoint at all. AnChain.AI already partnered with x402 facilitators to do sub-200ms on-chain risk checks at the *facilitator* layer — meaning sanctions screening is moving into the rails, not out as a callable endpoint. If sanctions become a facilitator-level concern (KYT at Coinbase, AnChain at AWS AgentCore), name-screening becomes a feature of someone else's checkout, not a standalone $0.005 call. Better play: write a signed-receipt-format spec others adopt; let AnChain pay you for the receipt envelope.

Named wedge competitor: **AnChain.AI** — already has Advanced Sanctions Screening MCP, regulatory relationships, BEI™ API, and an x402-facilitator partnership. They have brand, legal review, and 10x the engineering capacity. Secondary: **hypeprinter007-stack/anchor-x402-mcp** — already shipped, priced in the same band, with "signed decision attestation" as a feature name.

Hidden assumption: buyers will pay a third-party $0.005/name for a name-vs-public-list check rather than (a) running RapidFuzz themselves against the free downloadable SDN file or (b) consuming sanctions screening as a feature of their facilitator/wallet provider. The list is free; the matching code is one npm install. The receipt is the only thing you're really selling.

90-day kill criterion: if, by 2026-08-14, the endpoint has fewer than 25 paid calls from non-self-test wallets AND `anchor-x402-mcp` has either (a) added Ed25519 receipts or (b) crossed 1k paid calls, abandon.

#### Candidate 2 — Aave v3 health factor + collateral breakdown → **weak-reject**

Three rejection reasons:

1. The lane is the most contested of the four. `httpay.xyz` (Alfred Zhang) already ships 186 endpoints including live APY across Aave/Compound/Morpho on Base priced $0.001-$0.01/call. Heurist Mesh has Aave-v3 reporting agents in its vending machine. QuickNode now supports x402 pay-per-request on 130+ networks at $0.001/req — the primitive layer is already commoditized.

2. The receipt-for-dispute thesis is unproven. "At block N, address 0xabc had HF 1.02" is a load-bearing audit claim *only if disputes actually escalate to needing one*. Today, Aave liquidations are settled on-chain — the block itself is the receipt. The signed-receipt adds value only if an off-chain counterparty disputes the read, and the brief names zero such counterparty.

3. Read-only ≠ zero risk. The brief flags "current health factor not predictive" as the watch-item, but agent builders will absolutely use this for liquidation-protection automation. The moment a customer's bot fails to liquidate because your HF read lagged by 30 seconds, the dispute is against you.

Strongest counter-thesis: don't build read-only DeFi position aggregation as a fifth-fiddle product against The Graph + QuickNode + Heurist + httpay. Instead: do nothing here, and let TrustBench's existing `/route` route to these endpoints. Add Aave HF as a *meta-router preset* ("`POST /route/defi/aave-health-factor`" that picks the cheapest live provider) — sells your routing moat instead of competing as a primitive. That's the wedge TrustBench actually has.

Named wedge competitor: **httpay.xyz** (Alfred Zhang, ERC-8004 agent #18032 on Base) — already shipped 186 DeFi endpoints including Aave APY, weekend-cadence release pace matching your "one weekend per endpoint" plan but already ~50 weekends ahead. Secondary: **The Graph Gateway** — accepts x402, has the canonical Aave subgraph, and only needs one product manager to add a signed-receipt wrapper to bury this.

Hidden assumption: DeFi agents will pay a $0.002 premium for a signed receipt over a $0.001 raw read from QuickNode/The Graph/Heurist, even though the block hash + tx index already cryptographically commits the state. If the answer is "no, the block is the receipt," the receipt-moat collapses into a price-war you lose.

90-day kill criterion: if, by 2026-08-14, the endpoint has fewer than 100 paid calls AND httpay or Heurist or QuickNode has added an Ed25519-signed wrapper around any DeFi position read, abandon.

#### Candidate 3 — UK Companies House parsed lookup → **strong-reject**

Three rejection reasons:

1. **OpenRegistry (Sophymarine) already shipped exactly this, at 26 jurisdictions, free.** Ships an MCP server proxying Companies House one-to-one (`search_companies`, `get_company_profile`) with 20 req/min free anonymous tier and a productised KYB/UBO flow at `/solutions/kyb`. The brief's "Zero registry coverage" claim is TrustBench-crawler-blind; OpenRegistry is the dominant player and they shipped 26 countries before TrustBench would ship 1.

2. The "credibility anchor for non-crypto partnerships" framing is the AI-category trap. Non-crypto B2B partnership cycles are 3-6 months minimum, conflict with the "no multi-month sales cycles" calibration, and require SOC2 noises the moment a real KYB conversation starts. The brief explicitly says "Do not drift toward KYB positioning" — but that's the only positioning that justifies a $0.01/profile price over OpenRegistry's free tier.

3. ECCTA changes are an active treadmill. UK Companies House post-ECCTA is rolling out identity verification phases through 2026 — the API surface is changing under you. Solo-founder maintenance burden for a regulatory-shifting surface is exactly the wrong-shape work.

Strongest counter-thesis: don't build this. Reach out to Sophymarine and propose TrustBench-style signed receipts for OpenRegistry's MCP responses, in exchange for being the canonical receipt layer for company-registry calls. That converts a direct competitor into a partner, gives TrustBench Phase 4 a non-crypto reference customer, and reuses 100% of the receipt infra without the data-pipeline maintenance.

Named wedge competitor: **OpenRegistry by Sophymarine** — already live, 26 jurisdictions, free anonymous tier, productised KYB flow, MCP-native.

Hidden assumption: agent builders will pay $0.01/profile for a UK-only registry lookup with signed receipts when OpenRegistry serves the same data free at 20 req/min across 26 jurisdictions, on MCP, today. If false, the only differentiation is the receipt, and the receipt belongs in OpenRegistry's stack, not parallel to it.

90-day kill criterion: if, by 2026-08-14, fewer than 10 paid calls AND OpenRegistry has either (a) added signed receipts or (b) crossed 100 paid users on a paid tier, abandon.

#### Candidate 4 — EU VAT (VIES) wrapper → **strong-reject**

Three rejection reasons:

1. The wrapper market is fully developed and cheap. Vatlayer, VATsense, Vatstack, VIESAC, taxid.dev, and viesapi.eu all ship VIES wrappers with audit trails, retry logic, and consultation-number capture. VIESAC even sends HTTP POST callbacks on audit status changes. Vatlayer is $9.99/mo for unlimited. At $0.002/call, you're priced above a $9.99 month-of-unlimited at ~5000 calls/mo.

2. VIES auto-retry isn't a wedge — it's table-stakes for everyone in the space. Every VIES wrapper does this. The differentiator is "x402 + signed receipt," which is real but tiny — and any of the incumbents can ship x402 in a week if demand materializes.

3. B2B-invoicing agents emitting cross-border EU invoices is a hypothetical persona. The brief names no specific agent builder. Without one named customer asking, this is afternoon build of speculative infrastructure.

Strongest counter-thesis: skip this entirely. VIES wrappers are a commodity, the cross-border-invoicing-agent persona is unvalidated, and an afternoon's effort is better spent on Strata reference-agent integration (already on the Phase 4 critical path).

Named wedge competitor: **vatlayer/APILayer** — established API marketplace, unlimited tier at $9.99/mo, the incumbent. Secondary: **viesapi.eu** — ships consultation_number audit IDs out-of-box. Tertiary: **Fonoa / Stripe Tax** — Stripe Tax integrated x402 in Feb 2026; one PM-decision away from shipping a VAT-validation paywall.

Hidden assumption: cross-border B2B invoicing agents exist in volumes that prefer per-call USDC payments over a $9.99/mo Vatlayer subscription with the same auditability features. Below ~1000 VIES checks/mo, a flat subscription wins; above that, an enterprise procurement contract wins. The middle band is empty.

90-day kill criterion: if, by 2026-08-14, fewer than 20 paid calls AND no named invoicing-agent partner has confirmed they'd integrate, abandon. This one should never have made the GO list without a named buyer.

#### Cross-candidate Critic finding — the shared load-bearing assumption

All four GOs assume **the signed receipt is differentiating moat, not commoditized feature**. But the data says otherwise:

- `anchor-x402-mcp` already ships "signed decision attestation"
- PEAC Protocol ships Ed25519 JWS signed receipts at the protocol layer
- agentstamp ships Ed25519 stamps + trust scoring + x402
- Vaultra ships RFC-3161 cryptographically-signed compliance receipts for every agent decision

If Ed25519-signed receipts become the protocol-layer default (PEAC + x402 v2 receipt extensions + AAR v1.0 are pushing in that direction within the next 6 months), then the moat in all four candidates collapses simultaneously. The receipt-as-moat thesis becomes the receipt-as-table-stakes reality. The portfolio play depends on a 6-18 month head-start window that may already be shorter than the brief assumes.

Shared kill risk: facilitator absorption. Coinbase's facilitator already does KYT/OFAC at the rail layer. AWS AgentCore Payments (May 2026) bundles wallet management + policy + audit trail. If facilitators absorb compliance + auditability + receipts as built-in features, every endpoint in this portfolio competes against a free feature of the rails.

### 3. Brainstorm findings (wider net, 2026-05-14)

Cast a wider net beyond the original 9 categories. Surfaced 7 new GO candidates with stronger receipt-value than the original list:

| # | Candidate | Why it's strong | Pricing |
|---|---|---|---|
| 1 | RFC3161 timestamp + on-chain anchor | Canonical receipt-value play. Wraps FreeTSA + chains to existing on-chain anchor. eIDAS-recognized legal artifact + crypto-native verifiability. Every agent eventually needs "prove this hash existed at time T." | $0.01/timestamp |
| 2 | GLEIF LEI lookup | Global scope (not just UK). Free no-auth public registry. Cleanest "lookup vs determination" framing of any registry candidate. Better solo-founder fit than UK Companies House. | $0.003/lookup |
| 3 | CT log snapshot | Wraps crt.sh for the *history*, not current cert. Forensic chain-of-custody use case. | $0.008/snapshot |
| 4 | drand verifiable randomness | Wraps League of Entropy beacon. 100x cheaper than Chainlink VRF for off-chain agent use cases. | $0.002-0.005 |
| 5 | openFDA recall lookup | Live regulatory data, frontier-model-immune. Compliance audit shape. | $0.005/query |
| 6 | DKIM/SPF/DMARC verification of an emitted email | Agentic shape (single-message verification) genuinely different from dmarcian/Postmark dashboards. | $0.003/verification |
| 7 | Snapshot DAO governance tally | Companion to Aave HF — same DeFi-agent buyer, same audit-trail shape. | $0.003-0.005 |

Two patterns surfaced:
1. **"Wrap a free public registry + add signed receipt" is fractal.** GLEIF, openFDA, USPTO TSDR, CourtListener, Snapshot — every government / public-good registry that ships a free API is a candidate.
2. **Cryptographic primitive endpoints (RFC3161, drand, CT-log) are the cleanest receipt-value plays.** They exist *because* people want verifiable claims about time / randomness / certificate-issuance.

The wider net doesn't change the strategic conclusion; it adds candidates *within* Options B and C. The portfolio play overall remains contested by the Critic's structural findings.

---

## The Two Pillars

These are the strategic positions TrustBench is currently uniquely positioned to own. Every feature decision must advance at least one of them, or explicitly justify why not.

### Pillar 1 — Canonical receipt-format standard

**What it means:** TrustBench's signed-receipt envelope shape (Ed25519 + JCS canonicalization + on-chain settlement anchor + specific field set per `receipt-spec-v1.md`) becomes the spec that other projects (OpenRegistry, AnChain, Heurist Mesh, httpay.xyz, anchor-x402-mcp, PEAC Protocol, Vaultra, eventually facilitators) interop with or adopt outright. The product isn't endpoints — it's the standard.

**What success looks like:**
- A non-trivial fraction of x402-economy signed-receipts are TrustBench-format (verified by `@trustbench/verify-receipt` or compatible verifier).
- Other projects' docs reference TrustBench's receipt envelope as a reference implementation.
- Adoption events surface in MEMORY.md (similar to "Strata adopts TrustBench-format trust_signals" milestone shape).
- TrustBench is positioned in landscape commentary as "the receipt-format standard," not "another receipt-issuer."

**Why TrustBench is uniquely positioned to own this:**
- `@trustbench/verify-receipt` npm package is published and versioned (v0.1.1 as of 2026-05-13).
- Receipt format is documented (`receipt-spec-v1.md`) with both verifiable cryptography and on-chain settlement anchoring.
- Honest-framing culture in CLAUDE.md prevents the "compliance-vendor pivot" that closes off neutral-standard adoption.
- No competing project has both verifier-package + on-chain anchor + the discipline to keep the spec neutral (PEAC is protocol-layer-tied; Vaultra is RFC-3161-tied; anchor-x402-mcp is product-tied).

**Why this pillar may be losing time:**
- PEAC Protocol is positioning the same way at the protocol layer.
- x402 v2 receipt extensions are in flight — if x402's own spec absorbs receipt format, TrustBench's pillar collapses into a feature of x402.
- Coinbase / Stripe / AWS bundling audit trails as facilitator features could make a separate receipt-format standard moot.
- 6-month window estimate is plausible; could be shorter.

### Pillar 2 — Neutral routing+receipt layer

**What it means:** TrustBench sits above whatever discovery / facilitator / mesh / agent-marketplace wins (Coinbase Bazaar, AWS AgentCore, Dexter, PayAI, agentic.market, Heurist Mesh, future entrants) as the protocol-agnostic routing surface that adds signed receipts to whatever the agent calls. The product is `/route` + receipts on top of *someone else's* endpoints.

**What success looks like:**
- Agents call `/route` with capability-level intent, TrustBench picks the best live provider across multiple discovery surfaces, adds signed receipt to the response.
- Routable-provider inventory spans Base + Solana + (future) other networks transparently to the agent.
- TrustBench is positioned in landscape commentary as "the cross-network routing layer," not "another x402 merchant."
- Phase 4 `/route` paid-call volume grows independently of which discovery surface dominates downstream.

**Why TrustBench is uniquely positioned to own this:**
- `/route` exists, is paywall-enabled, settles paid calls end-to-end with Ed25519 receipts (Phase 4 Path P shipped 2026-05-12).
- Cross-network framing is already in production copy (site V2 redesign, Phase 0).
- Architectural choice to be non-custodial-only means TrustBench can route to *any* facilitator's merchants without conflicts.
- Heurist Solana mesh crawler + Bazaar listing + agentic.market validator-green status mean TrustBench is the only public registry with multi-source crawler inventory.

**Why this pillar may be losing time:**
- Dexter is positioning at the same routing+discovery layer with token funding.
- Facilitator-level routing (Coinbase routing across its merchants natively) could subsume the cross-facilitator value proposition.
- The advertising-revenue model (Dexter's stack 4) gives Dexter funding TrustBench can't match on speed-to-market.

### Why the pillars are complementary, not mutually exclusive

The strongest defensible position is **owning both pillars simultaneously**.

- Pillar 1 alone is a spec project — valuable, slow to monetize, vulnerable to upstream protocol absorption.
- Pillar 2 alone is a routing service — valuable, immediately monetizable through paid `/route`, vulnerable to facilitator-level competition.
- Pillar 1 + Pillar 2 together creates a network effect: every endpoint TrustBench routes to is an opportunity to expose the receipt format; every adopter of the receipt format is an opportunity to be a `/route` target. The pillars reinforce.

No other current player in the landscape owns both. PEAC owns Pillar 1 partial. httpay.xyz / Heurist / Pylon own Pillar 2 partial (or just the merchant-side equivalent). Dexter / PayAI own neither yet (they're positioning, not shipped). Coinbase facilitator owns the underlying rails but explicitly does not route across facilitators.

**Strategic direction (decision-pending as of 2026-05-14):** explicitly pursue both pillars. Pillar 2 work is in flight through Phase 4 normal cadence. Pillar 1 work is what the three Options below are tactical paths for.

---

## The Three Options

These are tactical paths for Pillar 1 advancement. (Pillar 2 work proceeds through normal Phase 4 / Phase 5 cadence regardless of which Option is selected.)

### Option A — Skip the portfolio play; pursue partnerships

**What it is:** Reach out to existing projects with a single proposal: adopt TrustBench-format signed receipts on your existing output, and we'll work with you on integration + verifier coverage. No new endpoints built by TrustBench. The product is the standard.

**Specific targets and the message:**

| Target | Message shape | Why they'd say yes |
|---|---|---|
| **Sophymarine (OpenRegistry)** | "Would you adopt TrustBench-format signed receipts on OpenRegistry MCP responses?" | They have the data + free tier but no receipt envelope. Adding signed receipts strengthens their KYB-flow positioning without them building crypto. |
| **AnChain.AI** | "Would TrustBench's Ed25519 receipt format work as the canonical envelope for your sanctions-screening output?" | They have brand + legal + regulatory relationships but no canonical envelope. Adopting a neutral format strengthens their enterprise positioning. |
| **Heurist Mesh** | "Would you accept TrustBench-signed receipts wrapping your existing DeFi agents?" | They have the merchant inventory; we have the receipt envelope and `@trustbench/verify-receipt` npm. Complementary. |
| **httpay.xyz (Alfred Zhang)** | "Would you emit TrustBench-format receipts on your existing 186 endpoints?" | Solo-founder peer; same x402 lane; mutually beneficial. |
| **PEAC Protocol** | "How do we converge the receipt envelopes so the ecosystem has one standard, not three?" | Direct standards-conversation. Most political but highest-leverage if it lands. |

**Success criteria:** at least 1 adopter in 8 weeks. If a partner ships TrustBench-format receipts on their output, Pillar 1 has its first external validation. Two adopters and the standard starts to coalesce.

**Failure mode if Option A doesn't work:** silent no-replies. Then Option B becomes the path.

**Cost:** ~hours of outreach drafting + back-and-forth. Zero engineering until a partner says yes.

**Pillar mapping:** Option A advances Pillar 1 *actively* (recruiting adopters). Pillar 2 benefits passively because every adopter becomes a routable provider TrustBench's `/route` can call with a known receipt envelope.

### Option B — Build receipt-canonical primitives

**What it is:** Build a small set of endpoints whose entire value proposition is the receipt itself, not a wrapped data source. RFC3161 timestamping, drand verifiable randomness, openFDA recall lookup — these are reference implementations of the receipt-format pattern. The endpoints exist to demonstrate (and standardize) the spec.

**Build order:**

1. **RFC3161 + on-chain anchor** — wraps FreeTSA, weekend build, eIDAS-recognized + crypto-native. The canonical receipt-value endpoint. The receipt is the product.
2. **drand verifiable randomness** — wraps League of Entropy, weekend build, $0.002-0.005/call. 100x cheaper than Chainlink VRF for off-chain agent use cases.
3. **openFDA recall lookup** — strongest compliance-audit case from the wider net. Free data, frontier-immune.
4. Pause and validate. Don't extend before 50 paid calls across the first three OR before a named partner asks for a specific addition.

**Success criteria:** 50 paid calls across the three within 8 weeks, and at least one external project references the receipt-format pattern in their own discussion (blog, docs, GitHub issue, X post).

**Failure mode if Option B doesn't work:** Pillar 1 hasn't gained external traction; consider whether x402 v2 / PEAC have absorbed the format and Pillar 1 is closing.

**Cost:** 3-4 weekends of solo-founder time. Riding on existing TrustBench receipt infra.

**Pillar mapping:** Option B advances Pillar 1 *by demonstration* (canonical reference implementations strong enough that others adopt the pattern). Pillar 2 benefits because each endpoint is also a routable inventory addition.

### Option C — Stick with the original GO list (OFAC first, etc.)

**What it is:** Ship OFAC name screening per the deep-spec in `portfolio-ofac-screening-design.md`, then Aave HF, then evaluate. Treat the Critic findings as risk flags to watch rather than rejections.

**Why this option is preserved:** The Critic pass was deliberately harsh. There are reasonable readings where the Critic's findings overstate the threat: maybe anchor-x402-mcp is a one-person project that fizzles; maybe AnChain.AI doesn't expand into the small-agent-payment lane; maybe the receipt-format commoditization is slower than 6 months. If Johan's read is that the Critic is too pessimistic, Option C is the conservative path that doesn't require a strategic pivot.

**Success criteria:** OFAC endpoint hits 50 paid calls in 90 days, AND `anchor-x402-mcp` does not add Ed25519 receipts in that window.

**Failure mode:** the Critic's wedge competitors absorb the lane before TrustBench gets meaningful adoption. Soft cost: a weekend of build + ongoing list-update maintenance.

**Cost:** 3 weekends of OFAC build + ongoing list-refresh maintenance.

**Pillar mapping:** Option C advances Pillar 1 like Option B does — by demonstration — but with weaker candidates. Pillar 2 benefits like Option B.

### How the options map to the pillars

| | Pillar 1 (canonical receipt-format standard) | Pillar 2 (neutral routing+receipt layer) |
|---|---|---|
| Option A (partner) | Strong, active | Indirect (adopters become routable) |
| Option B (canonical primitives) | Strong, by demonstration | Direct (endpoints become routable) |
| Option C (original GO list) | Weak (contested candidates) | Direct (endpoints become routable) |
| **Do nothing on Options; only Phase 4** | None | Continues at normal cadence |

**Key insight:** Pillar 2 is already in flight as Phase 4 work. The Option choice is fundamentally about *how aggressively to pursue Pillar 1*. "Do nothing on Options" is a valid choice — it's the path where TrustBench focuses purely on Pillar 2 and lets Pillar 1 emerge organically (or not).

---

## The Filter — How to apply going forward

**For every non-trivial development decision** (feature scope, endpoint addition, partnership commitment, strategic shift, pricing change, public-copy change, Phase 5 / 6 scope item), answer these six questions BEFORE work begins:

1. **Which Pillar does this advance? (1, 2, both, neither)**

2. **If it advances Pillar 1: how specifically?** Adoption mechanic? Demonstration? Reference implementation? Spec clarification? Standards-coalition outreach?

3. **If it advances Pillar 2: how specifically?** Routing inventory? Cross-network coverage? Receipt envelope robustness? Routing intelligence? Provider discovery surface?

4. **If it doesn't advance either Pillar: WHY are we doing it?** Acceptable reasons: maintenance, technical debt, security patch, partnership ask we can't decline, regulatory requirement, validation infrastructure that supports both Pillars. Unacceptable: "interesting," "people are asking on X," "competitor has it," "looks impressive."

5. **Which Option does this fit under (A, B, C, or "Pillar 2 maintenance")?** If it doesn't fit any cleanly, pause and re-examine. Phase 4 work is "Pillar 2 maintenance" by default.

6. **Is there a less-effort path to the same Pillar advancement?** Especially: would a *partnership* (Option A) advance this faster than a *build* (Option B/C)? The Critic pass found this is the single biggest blind spot in solo-founder decisions.

**If a candidate decision can't answer questions 1-6 cleanly, DO NOT proceed with it.** Ask Johan first. The cost of asking is one chat exchange. The cost of building the wrong thing is a weekend of solo-founder time that could have gone to the right thing.

### What does NOT need to pass this filter

- Bug fixes to shipped code.
- Security patches and dependency updates.
- Immediate operational concerns (outage response, monitoring, alerts).
- Lessons-learned entries and decision-journal entries (these support the filter; they don't bypass it).
- Memory writes and CLAUDE.md tweaks (these are meta-infrastructure for the filter).
- Documentation cleanup of existing docs.
- Outreach drafting for already-decided partnerships.
- Daily X scan replies and the daily build-in-public X cron.
- Anything explicitly tagged "operational" or "maintenance" in Phase 4's existing scope.

### What absolutely DOES need to pass this filter

- Any new endpoint or `/route` extension.
- Any new product surface (HTML page, JSON endpoint, public artifact).
- Any partnership commitment beyond a first-touch reply.
- Any pricing change.
- Any public-copy change to landing/skill.md/llms.txt/README.
- Any Phase 5 / Phase 6 scope item before it's added to the roadmap.
- Any shift in framing (e.g., adopting "compliance" vocabulary, claiming "benchmark" status).
- Any decision to skip / not skip the validation gate for portfolio endpoints.

---

## Decision-pending status (as of 2026-05-14)

**NO commitment to Option A, B, or C yet.** Johan explicitly did not want to commit during the brainstorm session that surfaced this framing. The portfolio play (Options B/C) is on pause pending validation gate or Option A outreach. Option A's partnership-outreach is not yet drafted or sent. Pillar 2 work continues through Phase 4's normal cadence (Strata §10 integration, v2 header migration tail, listing-sprint follow-ups).

**The next steps that ARE committed:**

1. CLAUDE.md updated to make this filter mandatory pre-development (this session).
2. Filter pointer added to MEMORY.md so future sessions surface it immediately (this session).
3. Existing planning docs (`phase4-kickoff.md`, `phase5-design-seeds.md`, `TrustBench-strategy.md`) continue to be the source of truth for their own scopes, *read through this filter*.
4. Future decisions on portfolio endpoints, partnerships, public-copy, or Phase 5 scope items run through the six-question filter and are explicitly evaluated against the three Options before commitment.

**The next steps that are NOT yet committed and need Johan's decision:**

1. Whether to draft Option A outreach messages and send (next week, this week, never).
2. Whether to build the OFAC endpoint per `portfolio-ofac-screening-design.md` (Option C) or skip to RFC3161 (Option B) or skip both pending Option A signal.
3. Whether to publicly announce the strategic shift (e.g., a build-in-public X post about TrustBench-format-receipts-as-standard positioning) or hold silent until Option A has evidence.

---

## When to revisit this filter

**Reassess the filter (not just the Options) if any of the following occurs:**

- **PEAC Protocol or x402 v2 absorbs receipt format as protocol-layer default.** Pillar 1 closes; reframe TrustBench around Pillar 2 + something else.
- **A facilitator (Coinbase / Stripe / AWS AgentCore) ships cross-facilitator routing.** Pillar 2 closes; reframe around Pillar 1 + something else.
- **An Option A partner says yes AND adopts the receipt format publicly.** Pillar 1 has external validation; sharpen the partnership-outreach playbook and lean in.
- **Johan's calibration changes (more time, more capital, different risk tolerance).** Re-run the founder-shape filter in `CLAUDE.md` and see if the Option weighting shifts.
- **A new agentic-payment protocol gains meaningful adoption beyond x402 (p402, AP2 native, MPP).** Pillar 2's "neutral across protocols" framing needs explicit re-articulation.
- **6 months elapse without an Option A signal.** Stale-pillar check: are we still uniquely positioned, or has the window closed?

**Don't reassess for:**
- Tweets or single-day landscape signals (capture in memory, don't trigger pillar review).
- Single-partner conversations that don't move toward adoption.
- Velocity changes that affect specific Options but not the underlying pillars.

---

## How this changes the existing roadmap

| Existing plan | How it reads through this filter |
|---|---|
| Phase 4 listing sprint (target 2026-05-22) | Closed 2026-05-13. Pure Pillar 2 work. No change. |
| Strata §10 reference-agent integration (~2026-05-19) | Pillar 1 advancement (Strata adopts TrustBench's annotation envelope) AND Pillar 2 advancement (Strata becomes routable). Strong fit. Continue. |
| v2 header migration tail (PAYMENT-SIGNATURE + PAYMENT-RESPONSE) | Pillar 2 maintenance. Continue. |
| P4-3 Solana routing | Pillar 2 advancement (cross-network inventory). Multi-day cost. Apply six-question filter before committing the multi-day work — specifically question 6 (is there a less-effort path? Partner with Heurist for Solana receipt-issuance instead of routing through them?) |
| Phase 5 design seeds (dispute resolution, verification tier hierarchy, multi-protocol, p402/Canton/AP2) | All currently scoped through earlier framing. ALL need re-examination through this filter before Phase 5 kickoff. Specifically: P5-coverage-report (gap map) is clean Pillar 2; P5-dispute is Pillar 1 + Pillar 2 hybrid; multi-protocol routing is Pillar 2; AP2 mandate-constraint extension is Pillar 1. Re-prioritize Phase 5 milestones once Option A/B/C is decided. |
| Daily X scan + build-in-public posts | Operational. No filter required for daily run. But messaging direction (e.g., framing TrustBench as "receipt-format standard") IS Pillar 1 — and tweaking landing-page copy or skill.md to lean into either pillar IS filter-gated. |
| Portfolio-endpoint research (`endpoint-portfolio-research-2026-05-14.md`) | Reads as Option B/C analysis through this filter. Doesn't need to be re-written. |
| OFAC deep-spec (`portfolio-ofac-screening-design.md`) | Option C build-ready spec. Don't execute without Option-decision gate. |

---

## Source documents (referenced by this filter)

- `CLAUDE.md` — project agreement, founder calibration, phased plan summary.
- `TrustBench-strategy.md` — original strategy doc (now read through this filter).
- `partnership-day-record-2026-05-07.md` — Phase 4 reframe context.
- `endpoint-portfolio-research-2026-05-14.md` — the brainstorm + stress-test that surfaced this filter.
- `portfolio-ofac-screening-design.md` — Option C build-ready spec.
- `phase5-design-seeds.md` — Phase 5 ideas, all subject to this filter pre-launch.
- `phase4-kickoff.md` — Phase 4 engineering state.
- `phase4-listing-plan.md` — Phase 4 listing-sprint closure.
- `receipt-spec-v1.md` — the receipt envelope that Pillar 1 standardizes.

## External references that inform this filter

- Dexter / PayAI positioning: @divuspop tweet 2026-05-14 (memory: `project_dexter_payai_competitive_signal_2026_05_14.md`).
- anchor-x402-mcp competing OFAC + signed attestation: https://glama.ai/mcp/servers/hypeprinter007-stack/anchor-x402-mcp
- httpay.xyz 186 x402 endpoints: https://dev.to/alfredz0x/i-built-186-ai-agent-apis-in-a-weekend-heres-what-i-learned-about-x402-micro-payments-32dp
- OpenRegistry by Sophymarine 26 jurisdictions: https://openregistry.sophymarine.com/
- PEAC Protocol Ed25519 JWS receipts: https://github.com/peacprotocol/peac
- Vaultra RFC-3161 compliance receipts: https://pypi.org/project/vaultra/
- AnChain.AI x402 partnership: https://www.anchain.ai/blog/x402
- AWS Bedrock AgentCore Payments: https://aws.amazon.com/blogs/machine-learning/agents-that-transact-introducing-amazon-bedrock-agentcore-payments-built-with-coinbase-and-stripe/
