# Competitive landscape — adjacent projects to watch

**Last updated: 2026-05-08.** This document is a living record. Sections are added over time, not deleted. Newer sections supersede older ones. Always check the bottom-most "Update YYYY-MM-DD" section for current strategic posture.

**Reading order:** if you only have 5 minutes, skip to § "Update 2026-05-08 — post partnership-day shift" at the bottom. The earlier sections are historical context (Phase-2-era analyses from 2026-05-03 + earlier).

## Where TrustBench sits

The agent-commerce stack has roughly four layers any production system needs:

1. **Reputation / intelligence** — is this counterparty safe to transact with?
2. **Routing** — given a capability and a price ceiling, which provider should this call go to?
3. **Policy / governance** — spend caps, idempotency, kill switches, allow/deny.
4. **Receipts / audit** — signed proof trail, replayable, queryable.

TrustBench's planned scope spans (2) + (3) + (4), with the **non-custodial router** as the unique value prop. The projects below each occupy one or two of these layers; none today offers the same combination.

## At-a-glance comparison

| | TrustBench (planned) | Infopunks Trust Layer | SpendGate.ai | AgentlyHQ | AgentProof | ProofRail | ProofRails |
|---|---|---|---|---|---|---|---|
| **Layer** | Routing + policy + receipts | Reputation / trust scoring | Policy / governance proxy | Routing + framework + marketplace | Reputation oracle (ERC-8004) | Network-level governance | Receipts / audit (ISO-20022) |
| **Mediates** | x402 provider endpoints | Counterparty trust per call | API traffic between agent and provider | Agent ↔ marketplace + payments | Agent identity / reputation | Tool calls in general | Crypto payment events |
| **Custody posture** | Non-custodial (agent signs) | Non-custodial | Non-custodial proxy (sits in path) | Non-custodial (CLI signs locally) | N/A (read-only) | N/A (control only) | N/A (audit only) |
| **Public framing** | Registry + telemetry today; router next | "Trust primitive for Agentic.Market" | "Spend governance for AI agents" | "Routing + settlement for the agent economy" | "Trust Oracle for ERC-8004" | "Bypass-Resistant Control for Agentic Systems" | "ISO-ready auditability for crypto payments" |
| **Pricing** | Flat-per-tx + subscription (planned) | Pay-per-call (x402) | Free → $15/mo Pro → custom Business | Open-source framework + platform | TBD | TBD | Enterprise |
| **Stage** | Pre-launch, solo-founder | Live, deployed on Render | Live with paying tiers | Live: marketplace + framework | Claims 68k+ agents scored, 24 chains | Live site, GitHub presence | Live site, leadership page |

## Per-project read

**Infopunks Trust Layer** — *complement, not competitor.* Pay x402 to get back a structured trust verdict (allow / degrade / block + reasons + receipt) via a single `POST /v1/resolve-trust`. They are the intelligence brain; TrustBench is the payment plumbing. They explicitly want a stronger "cleaner proof trail" — exactly what Phase 3 ships. The receipt spec @InfopunksHQ shared on 2026-04-30 (signed receipt + call metadata + settlement reference + replayable audit path) is now the anchor for our receipt schema. Likely first design partner.

**SpendGate.ai** — *closest direct competitor; deeper analysis below.* Proxy / governance layer that sits between agents and upstream APIs (including x402). Founder Euan Chisholm validated our pain hypotheses on Reddit and explicitly said 1–3% routing spreads are "a big no no for a lot of people" — which is what triggered our flat-per-tx pricing pivot.

**AgentlyHQ (use-agently + aixyz)** — *adjacent but framework-shaped.* CLI + Next.js-style framework + marketplace for x402 agents, with automatic payment retry on 402 responses, A2A + MCP integration, and ERC-8004 identity bootstrapping. Direct overlap on routing / settlement, but they are going opinionated and heavyweight (own your agent end-to-end). TrustBench differentiates by staying lightweight, MCP-native, and framework-agnostic — plug into agents you already have rather than asking you to adopt a new framework. Their existence is real signal that the routing / settlement layer is worth building a company around.

**AgentProof (agentproof.sh)** — *opposite side of the transaction.* They score *agents* for providers; TrustBench scores *providers* for agents. ERC-8004 reputation tokens threaded through TrustBench's router is a natural integration: an agent calling our `/route` could pass an AgentProof reputation token along with the x402 payment so the provider can rate-limit accordingly. Not directly competitive, but competing for the same "trust layer for agent commerce" mindshare in narrative terms. Worth a low-effort intro DM to whoever runs the GitHub.

**ProofRail (proofrail.org)** — *direct competitor to the Phase 4 policy firewall.* "Bypass-resistant control for agentic systems" — manual emergency stop, mediated tool calls, structured audit evidence. Their lane is governance for any agent action; TrustBench's narrower lane is governance specifically over the construct-tx-and-sign x402 path. Smaller surface, but the one with measurable per-call economic risk.

**ProofRails (proofrails.com)** — *don't compete; integrate.* ISO-20022-flavored, enterprise-grade audit pipeline with signed deterministic evidence bundles and on-chain hash anchoring. If TrustBench ships a CSV / ledger receipt layer in Phase 4, theirs is the reference point users will compare against. Bundle our basic Ed25519 receipt for free and integrate with ProofRails for users who need ISO compliance. Building a parallel ISO-20022 pipeline as a solo founder is a no.

**Valeo / Sentinel (valeocash.com, sentinel.valeocash.com)** — *direct competitor on Sentinel; differentiated stack overall.* AI-native financial stack on Solana: iOS wallet + v402 protocol (their own Solana-native payment protocol, NOT a fork of x402) + Sentinel (compliance layer that works with vanilla x402) + UAID stablecoin + Stratum clearing layer + $VALEO token. **Sentinel is a direct head-to-head with TrustBench's `/route` + policy + receipts story** — same primitives (replay-safe receipts, budget limits, audit), same x402 compatibility, but bundled with token-funded marketing and a public Sentinel Explorer. Differentiation in TrustBench's favor: chain-agnostic vs. Solana-native, no token in pricing model, no competing stablecoin (Valeo pushes UAID alongside USDC), single-product focus, open verifier with no platform dependency. Differentiation in Valeo's favor today: multi-product narrative, public Explorer, token-funded marketing budget, Solana-first (which now leads x402 transaction volume vs. Base). Full point-by-point analysis in `phase3-valeo-stress-test.md`.

## SpendGate.ai — deeper analysis

SpendGate is the project most likely to be confused with — or to displace — TrustBench from a buyer's mental model. It deserves explicit treatment.

**What they ship today.** Proxy that sits between an agent and the APIs the agent calls. Per-agent rate limits, spend limits, URL allowlists. x402-aware spend controls. Replay-safe request handling (= idempotency). Signed webhooks and real-time alerts. Full audit trail of policy decisions, approvals, and x402 flows. Credentials encrypted at rest, never logged. Free tier, $15/mo Pro, custom Business pricing.

**Where they overlap with us.**

- Idempotency, hard spend caps, signed receipts, queryable audit — exactly the four primitives Phase 2 validated as Phase 3 must-haves.
- x402-awareness in the request path.
- Subscription pricing model already validated at a price point ($15/mo) that sits at the floor of our planned $20–100/mo Phase 4 range.

**Where they don't overlap.**

- They don't measure providers. They wrap whatever the agent already chose. There is no live telemetry, no signed scorecard, no public registry. If "which provider is up and cheap right now" is the question, they don't answer it.
- They are a proxy. The agent points its API client at SpendGate; SpendGate forwards. That means they see traffic, sit in the latency path, and require credential storage on their side. TrustBench's `/route` returns a routing decision and the agent makes the call directly (or signs a tx we constructed) — no traffic mediation, no credential storage on our side.
- They are not MCP-native by default. Their integration story is API proxy; TrustBench's stated direction is MCP-first.

**Strategic takeaway.** TrustBench's lane is "pick the right provider and prove what happened" — measurement + routing + receipt. SpendGate's lane is "constrain whatever your agent already does." These are genuinely different jobs, but a buyer who only feels the spend-control pain may not realize that and will buy SpendGate first because it is live.

## Implications for TrustBench (2026-05-03 — SUPERSEDED, see § "Update 2026-05-08" below)

1. **The router (with telemetry) is the unique value prop.** No one in this landscape constructs x402 transactions on the agent's behalf based on live measurement. Lead every public framing with that.
2. **Bundle, don't unbundle.** Idempotency, hard spend caps, signed receipts, queryable audit must be free with `/route` — they are table stakes after Phase 2 validation, and they are SpendGate's whole product. We can't sell separately what they give away.
3. **Policy subscription needs more than policy.** The Phase 4 $20–100/mo SKU has to add things SpendGate can't easily replicate: multi-provider routing analytics, signed scorecards for procurement, optional human-in-the-loop on high-risk providers (driven by our telemetry), team / multi-agent quotas tied to capability classes.
4. **Pay-to-list bond stays unique.** SpendGate has no provider-side product. The refundable verification bond + signed registry is structurally something they can't ship without rebuilding TrustBench. Defend that.
5. **Treat AgentProof, ProofRail, ProofRails as integration partners, not enemies.** Reputation tokens through the router (AgentProof), policy webhook bridge (ProofRail for non-payment tool calls), receipt export to ISO-20022 (ProofRails) all compose cleanly with our scope.
6. **Honest framing in public copy.** Until the router ships, the public face is the registry + nightly telemetry. Avoid "benchmark," "ranking authority," and "reputation oracle" — those phrases either overclaim today's measurement or invite a positioning fight against AgentProof.
7. **Counter Valeo's Sentinel Explorer with a public receipt explorer.** Sentinel ships a public dashboard listing every transaction; that's a real distribution weapon TrustBench currently has no answer to. Phase 4 priority: a `/explorer` HTML dashboard reading from a `GET /receipts/recent` feed with opt-in publication per agent. ~2 days, neutralizes the biggest non-technical Valeo advantage.
8. **Solana support belongs in Phase 4, not later.** Recent x402 ecosystem data shows Solana has surpassed Base in transaction volume, and Valeo is Solana-native across their stack. Staying Base-only past Phase 3 cedes both volume and "the chain that matters" framing to Valeo. Adding Solana also broadens the addressable provider pool meaningfully.
9. **The moat is the trio: open spec + reference verifier on npm + named integration partner.** Valeo can clone `/route` mechanically; what they can't easily clone is a public receipt schema cited by Infopunks/ProofRail/ProofRails as the canonical format. Promote `receipt-spec-v1.md` to a public docs page, publish `verify-receipt` as `@trustbench/verify-receipt` on npm, and formalize one named integration (Infopunks is the obvious candidate from Phase 2 conversations).

## Sources

- [Infopunks Trust Layer](https://github.com/ministryofinfopunks/infopunks-trust-layer-agentic.market)
- [SpendGate.ai](https://spendgate.ai/) — Reddit conversation with founder Euan Chisholm (2026-04-30)
- [AgentlyHQ](https://github.com/AgentlyHQ) — use-agently CLI + [aixyz framework](https://github.com/AgentlyHQ/aixyz)
- [AgentProof](https://agentproof.sh) — "Trust Oracle for the ERC-8004 Agent Economy. On-chain reputation oracle for AI agents."
- [ProofRail](https://proofrail.org) — "Bypass-Resistant Control for Agentic Systems."
- [ProofRails](https://www.proofrails.com) — ISO-ready auditability and payment infrastructure for crypto-native businesses.
- [Valeo](https://valeoprotocol.io/) — AI-native financial stack on Solana (also [valeocash.com](https://www.valeocash.com/))
- [Sentinel](https://sentinel.valeocash.com/) — Valeo's compliance layer for x402 agent payments
- [v402 GitHub](https://github.com/valeo-cash/v402) — "Non-custodial payment protocol for AI agents on Solana"
- [Stratum](https://stratumx402.com/) — Valeo's clearing layer for AI agent payments

---

# Update 2026-05-08 — post partnership-day shift

This section supersedes the 2026-05-03 *"Implications for TrustBench"* directives above. The strategic frame committed on 2026-05-07 (component-in-stack with x402-paywalled API monetization, partnership-driven) replaces the earlier *"router-with-telemetry-is-the-unique-value-prop"* framing. See `partnership-day-record-2026-05-07.md` for the full record of why.

## Major ecosystem shifts since 2026-05-03

Five concrete things changed in the ecosystem in the 5 days between the previous update and this one. Each one tightens or shifts TrustBench's lane.

**1. x402 Foundation `offer-and-receipt` extension v0.6 shipped (Alfred Tom, Feb 2026, verified 2026-05-07).** Defines signed offers + signed receipts as merchant-side artifacts in the `extensions["offer-receipt"]` namespace, EIP-712 or JWS signatures. The merchant-side signed-receipt slot TrustBench's original receipt-spec was positioned to fill is now occupied by Foundation work. **TrustBench's lane narrows from "the receipt format for agent commerce" to "router-side attestation that composes with offer-and-receipt."** Spec link: `specs/extensions/extension-offer-and-receipt.md` in `coinbase/x402` (now `x402-foundation/x402`).

**2. coinbase/x402 transferred to x402 Foundation (Linux Foundation governance, multi-org).** Foundation members include Coinbase, AWS, Cloudflare, Stripe, plus dozens of others. Coinbase repo is now a development fork; canonical work lands at `github.com/x402-foundation/x402`. Standards-track work moves through Foundation process, not Coinbase unilaterally. *Strategic implication:* better odds for partner-contributed extensions, but Foundation pace is slower than solo-founder execution.

**3. AWS Bedrock AgentCore Payments launched (2026-05-07).** Native integration of x402 + Coinbase wallet infrastructure into AWS Bedrock. Bundles managed wallet auth, time-bound spending limits, CDP-facilitator compliance, audit trails, and Coinbase-MCP-mediated discovery into one offering for AWS-resident enterprise agents. *Strategic implication:* the four Phase-2-validated primitives (idempotency, hard spend caps, signed receipts, queryable audit) are now bundled at the largest enterprise cloud. TrustBench's audience compresses to non-AWS-aligned, multi-cloud, multi-protocol, or non-Coinbase-aligned agents.

**4. AP2 v0.2 spec stable (Google → FIDO Alliance, January–February 2026).** Defines Cart/Checkout Mandates + Payment Mandates + Mandate-bound Receipts as the agent-payment authorization framework. Reference samples at `samples/python/scenarios/a2a/{human-present,human-not-present}/x402/` show explicit AP2 + x402 composition. *Strategic implication:* AP2 covers the user-intent and Cart-binding layer; TrustBench composes with it (AP2 has no Router role). Full assessment in `ap2-compatibility-assessment.md`.

**5. a2a-x402 v0.2 published (parent extension to the AP2 + x402 integration).** Embedded Flow defined: x402 PaymentPayload nested inside AP2 PaymentMandate, x402PaymentRequiredResponse nested inside AP2 CartMandate. Three signing patterns (atomic / delegated / smart-contract escrow). *Strategic implication:* there are now multiple explicit signature standards inside the x402 ecosystem (Ed25519, EIP-712, JWS, SD-JWT). Any TrustBench Foundation-track extension proposal needs to align with the established conventions, not invent new ones.

## Verified competitors in adjacent lanes

Verification sprints on 2026-05-07 (full reports at `agentlog-competitor-verification-2026-05-07.md` and `trustbench-reliability-pivot-verification-2026-05-07.md`) surfaced active competitors across three adjacent lanes. None of these existed in the 2026-05-03 picture.

### Reliability + verification + monitoring + audit (the lane the reliability-pivot doc proposed entering, verified-saturated)

| Competitor | Status | Match | Threat |
|---|---|---|---|
| **PaySentry** ([github.com/mkmkkkkk/paysentry](https://github.com/mkmkkkkk/paysentry)) | Open-source, multi-protocol (x402 + ACP + AP2 + Stripe). 79 test cases. Includes circuit breaker, retry classification, settlement recovery, RecoveryEngine for refunds, dispute filing, full audit trail. | Field-for-field equivalent to the proposed reliability pivot's full architecture. | Critical — open source equivalent already shipped. |
| **PEAC Protocol** ([peacprotocol.org](https://www.peacprotocol.org/)) | Open-source. Ed25519 JWS signed receipts. peac.txt policy file. Express middleware. Same signature scheme as TrustBench receipt-spec-v1. | Open-source version of TrustBench's signed-receipts thesis. | High — closer to TrustBench's original positioning than anything else. |
| **Probe** ([getprobe.xyz](https://getprobe.xyz/)) | Free, no signup, unlimited audits, 44 compliance checks (x402, ERC-8004, MCP, Voice AI, EU AI Act, security headers, etc.). | Pre-call compliance scanner; covers Strata-shape territory. | High — free tier eats the entry-level audit value prop. |
| **Sentinel by Valeo** ([sentinel.valeocash.com](https://sentinel.valeocash.com/)) | Already in 2026-05-03 doc above. | Audit + compliance layer for x402, intercepts payments, enforces budgets. | High (already noted). |
| **xpay.sh** ([xpay.sh](https://www.xpay.sh/)) | Non-custodial x402 infrastructure: Smart Proxy with hard limits / soft alerts / automated shutoffs, paywall-as-a-service, MCP monetization, real-time observability. | TrustBench Phase 4 + Phase 5 merged into one shipping product. | High — closest commercial competitor on the actual TrustBench surface. |
| **x402station** ([x402station.com](https://x402station.com/)) | Real-time analytics platform. ~35,000 endpoints probed. $1 USDC machine-paid Verified Badge system. ~17% of probed endpoints flagged as landmines / dead. | Industry-scale established analytics; eats "neutral observatory" positioning. | High. |
| **x402scan** (Merit Systems, open-source). | Open-source ecosystem explorer, Coinbase-Developer-Platform-endorsed. | Adjacent registry-explorer. | Medium. |
| **OpenZeppelin Defender** with x402 Facilitator ([docs](https://docs.openzeppelin.com/relayer/guides/stellar-x402-facilitator-guide)) | Enterprise-grade. Stellar focus today; could expand to Base. Spending limits, multisig, scoped permissions, monitoring at multiple layers. | Different chain focus (Stellar) but full-stack capable. | Medium — moves up if they expand to Base. |
| **Tenderly, Forta** | EVM monitoring incumbents. Could ship x402 modules in a quarter if demand materializes. | Generalist; not x402-specific yet. | Low today, medium-term watch. |

### AI spend tracking (the AgentLog wedge — verified-saturated 2026-05-07)

Not a TrustBench-direct lane, but shared the user persona overlap (agent builders / prosumers tracking AI tool costs). Listed for completeness because the verification dynamic was illustrative.

Competitors verified: **Orbit Money, AICosts.ai, CostLayer, CostGoat, Toolspend, AI Spend, Torii, CloudFuze Manage, Ramp AI Token Spend Intelligence.** Toolspend specifically launched on Product Hunt in February 2026 (#2 Product of the Day, 401 upvotes) with Plaid + AI service integration. Ramp shipped enterprise-grade AI token tracking in their existing platform. The AI spend tracking wedge is structurally closed for solo-founder differentiation.

### Discovery / catalog / agent runtime

- **Coinbase Agentic Market + Bazaar** — protocol-level discovery extension, native to AWS Bedrock now. Curated catalog of ~650 services. Owns the discovery slot for Coinbase-aligned agents.
- **Coinbase Agentic Wallet skills** — auth/fund/send/trade/earn primitives bundled into AWS Bedrock.
- **Anthropic Managed Agents** — agent runtime + sandboxing + state management. Different layer; could subsume policy primitives over time.

### Identity + attestation

- **ERC-8004 Trustless Agents** — live on Ethereum mainnet, BNB, Base. ~14K–34K agents per chain. Threading reputation through TrustBench's router would require ERC-8004 token integration if/when partner asks.
- **ENS + ENSIP-25** — verifiable AI agent identity via ENS. agent.arp text record proposal extends.
- **Phala TEE 5-min agent template** — TEE-attested agents, open-source.
- **EigenLayer Verifiable Agents + EigenCompute / EigenVerify** — preview, but cementing.
- **Reclaim Protocol** — `reclaim-8004-validator` for ZK credentials in ERC-8004.
- **Visa TAP** — RFC 9421 HTTP Message Signatures + Cloudflare Web Bot Auth, in pilot in APAC + Europe.

These are not competitors; they're identity-layer infrastructure that TrustBench receipts could *reference* as an annotation. Same compose pattern as the Strata `runtime_score` integration.

## Partnership-readiness signals (NEW 2026-05-08)

Three independent partnership inbounds in the 48-hour window 2026-05-06 / 2026-05-07. These are not competitors — they're complementary players actively proposing integration. The partnership-readiness pattern is what reframed TrustBench from "standalone product" to "component-in-stack" on 2026-05-07.

### Infopunks (@InfopunksHQ)

- **Status:** existing partner (cognition layer was the merchant in TrustBench's first paid receipt, P4-1b).
- **Inbound:** DM 2026-05-06 — *"mate just checking trust bench / everything looks awesome / lets collab / keen to get on a call on google meet sometime today."*
- **Public endorsement:** *"once cognition has receipts agents can start routing by evidence instead of vibes"* (2026-05-04).
- **Engagement state:** Johan sent initial async reply 2026-05-07. Awaiting response. Pre-drafted follow-up at `infopunks-followup-draft.md`.
- **Anti-poach rule:** do not reply to Infopunks's tweets via Grok. Read and learn the room only.

### Strata (@stratamcp, usestrata.dev, built by PThrower)

- **Status:** new partnership prospect, very strong signal.
- **Inbound:** DM 2026-05-06 — *"complementary stacks. Pre-call trust scoring + your signed receipts and liveness telemetry is a stronger stack than either of us ships alone. Open to a quick call before our Show HN Tuesday."*
- **Their product:** "Trust Layer for AI Agents" — security_score + runtime_score + agent identity + payment-endpoint verify across 22 ecosystems, 2,178 MCP servers indexed, $0 / $29-month / $100-lifetime tiers.
- **Architecture endorsement (2026-05-08):** *"Carrying it as a trust-signal annotation in the receipt envelope makes sense — verifiers downstream get pre-call posture without a separate Strata lookup."* They explicitly endorsed Direction B from the integration deep-dive.
- **Active deliverable:** Strata sketch at `strata-integration-sketch-draft.md`, pending Johan's review before send.
- **Show HN deadline:** Tuesday (2026-05-12 or 2026-05-13 depending on timezone).
- **Anti-poach rule:** do not reply to Strata's tweets via Grok. Same as Infopunks.

### CLU_AGENT (@CLU_AGENT, automated by @Logik185, project: Grid)

- **Status:** parallel-discovery technical alignment, not a partnership offer per se.
- **Public engagement:** *"Strict reservation + idempotency keys hit the mark. We're shipping per-call caps with signed receipts on Grid — same three-leg pattern you're describing. Audit trail is non-negotiable."* + technical detail on sidecar quote tables, batch audit writes <2% overhead, error-code standardization across L402/x402 hops.
- **Engagement state:** open public thread; no DM partnership offer yet, but technical alignment is high-quality and the conversation is welcoming.
- **Anti-poach rule:** public engagement OK; private partnership pitch not yet warranted.

## Implications for TrustBench (2026-05-08 — current strategic posture)

These supersede the 2026-05-03 implications.

1. **TrustBench is a component, not a standalone product.** The standalone-router-with-telemetry positioning is replaced by *"router-side attestation that composes with x402's offer-and-receipt extension and partner trust signals."* All public copy and outreach should reflect this; subscription / standalone framing is off the table.
2. **Revenue is x402-native paywalled API.** Per-call pricing in USDC on Base. No subscriptions, no contracts. Specific tiers in active validation with first integration partners (Strata explicitly asked for tiers; sketch includes them, pending Johan's approval).
3. **Standards-track work stays deferred.** The reasons in `phase6-reassessment-2026-05-07.md` § 4 (solo-founder bandwidth, structural fragility of standards-first plays, lane narrowing) all still hold. Defer Foundation-track Discussion / extension-proposal work until production traction makes it pull-shaped, not push-shaped.
4. **Non-AWS, non-Coinbase-aligned, multi-cloud, multi-protocol agents are the addressable persona.** AWS Bedrock + Coinbase bundling absorbed the AWS-aligned single-merchant flow audience. The agents that need TrustBench specifically are the ones who *don't* want to be inside Coinbase's curated ecosystem.
5. **Defending against PaySentry / PEAC / Probe / x402station is structurally hard.** They are open-source, free, or industry-scale. The honest framing: *compose, don't compete.* Surface their existence on the TrustBench landing page rather than pretending the lane is open.
6. **The four Phase-2-validated primitives (idempotency, spend caps, signed receipts, queryable audit) remain free and bundled.** They are now table stakes across multiple competitors. Charging for them separately is closed off.
7. **Pay-to-list bond stays unique.** Refundable verification bond + signed registry is structurally something competitors haven't shipped. Defend that.
8. **The compose framing is the narrative weapon.** *"TrustBench Receipt + Strata score + AP2 Mandate + offer-and-receipt + x402 settlement = the full proof chain."* This is the only framing that survives skeptical reading after the Foundation absorbed merchant-side receipts.

## Weekly monitoring queue

Per `grok-x-research-briefing.md` § 3 + § 5.1 / 5.2, set a 30-minute Monday recurring review checking each of these for material changes:

**Tier 1 (must scan weekly):**
- PaySentry (`github.com/mkmkkkkk/paysentry`) — releases, multi-protocol expansion
- x402station — new badge tiers, dashboard expansion
- xpay.sh — feature additions especially MCP / receipt support
- AWS Bedrock AgentCore Payments — feature ships, new partners
- coinbase/x402 → x402-foundation/x402 — extension proposals, releases
- Anthropic Managed Agents — pricing, primitive expansion

**Tier 2 (scan biweekly):**
- PEAC Protocol — adopters, version updates
- Probe — pricing changes (the free tier is the threat)
- Sentinel / Valeo — Sentinel Explorer growth, $VALEO-funded marketing pushes
- Torii / CloudFuze — AI-specific features, MCP integrations
- Tenderly / Forta — x402 modules announced

**Tier 3 (scan monthly or on signal):**
- AICosts.ai, CostLayer, CostGoat, Toolspend, Orbit Money, Ramp AI Token Spend Intelligence (AgentLog wedge — only relevant if AgentLog reincarnates)
- AgentProof, ProofRail, ProofRails, AgentlyHQ (Phase-2-era competitors — track but lower urgency)

**Watch-for canaries (drop-everything-and-reassess-strategy if any of these fire):**
- A behemoth (Anthropic / Google / Stripe) ships cross-platform aggregation across competitors. Probability: low. Impact: would invalidate the structural-conflict moat the AgentLog concept relied on.
- Coinbase ships routing-attestation as a Bazaar extension. Probability: low (structural conflict — would standardize "the agent picked between Coinbase and someone else"). Impact: would close TrustBench's core remaining lane.
- A well-funded startup (Series A+) launches a TrustBench-shaped router with managed hosting + SLAs. Probability: medium. Impact: requires component-in-stack posture to be defensible against scale, not just against open-source.

## Sources (added 2026-05-08)

Verification sprint sources from 2026-05-07 (full lists in the verification reports themselves):

- [PaySentry](https://github.com/mkmkkkkk/paysentry)
- [PEAC Protocol](https://www.peacprotocol.org/) and [PEAC GitHub](https://github.com/peacprotocol/peac)
- [Probe](https://getprobe.xyz/)
- [xpay.sh](https://www.xpay.sh/)
- [x402station](https://x402station.com/) and [Verified Badge announcement](https://earezki.com/ai-news/2026-05-02-a-1-verified-badge-for-x402-services-fully-autonomous-machine-paid/)
- [x402scan via awesome-x402](https://github.com/Merit-Systems/awesome-x402)
- [Tenderly](https://tenderly.co/), [Forta](https://www.forta.org/)
- [x402 Payment Timeouts (mkmkkkkk on dev.to)](https://dev.to/mkmkkkkk/x402-payment-timeouts-why-your-agent-loses-money-and-how-to-fix-it-fgk)
- [coinbase/x402 issue #1062 — timeout race condition](https://github.com/coinbase/x402/issues/1062)
- [a2a-x402 spec v0.1 + v0.2](https://github.com/google-agentic-commerce/a2a-x402)
- [AP2 v0.2 specification](https://ap2-protocol.org/ap2/specification/)
- [offer-and-receipt extension v0.6](https://github.com/coinbase/x402/blob/main/specs/extensions/extension-offer-and-receipt.md)
- [AWS Bedrock AgentCore Payments announcement](https://aws.amazon.com/blogs/machine-learning/agents-that-transact-introducing-amazon-bedrock-agentcore-payments-built-with-coinbase-and-stripe/)
- [Strata (usestrata.dev)](https://usestrata.dev/)
- [Toolspend on Product Hunt](https://www.producthunt.com/products/toolspend)
- [Ramp AI Token Spend Intelligence](https://ramp.com/ai-cost-monitoring)

Internal cross-references: `partnership-day-record-2026-05-07.md`, `phase6-reassessment-2026-05-07.md`, `trustbench-reliability-pivot-verification-2026-05-07.md`, `agentlog-competitor-verification-2026-05-07.md`, `ap2-compatibility-assessment.md`, `strata-deep-dive-2026-05-07.md`, `strata-integration-sketch-draft.md`, `infopunks-followup-draft.md`.
