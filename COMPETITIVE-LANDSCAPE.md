# Competitive landscape — adjacent projects to watch

Last updated: 2026-05-03. Merges the April 2026 review of Infopunks / SpendGate / AgentlyHQ with the prior analysis of AgentProof / ProofRail / ProofRails plus a May 2026 update adding Valeo / Sentinel.

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

## Implications for TrustBench

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
