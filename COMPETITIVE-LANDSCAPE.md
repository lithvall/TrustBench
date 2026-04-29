# Competitive landscape — adjacent projects to watch

A short comparison of TrustBench's evolving scope against three projects with
overlapping names or scope. Each one maps to *one* tier of the planned moat
(routing / policy / receipts), but none currently spans the whole stack the
way TrustBench's strategy doc proposes.

| | **TrustBench** (planned) | **AgentProof** (agentproof.sh) | **ProofRail** (proofrail.org) | **ProofRails** (proofrails.com) |
|---|---|---|---|---|
| What it scores / mediates | x402 **provider endpoints** | AI **agents** themselves | AI **agent actions** (tool calls) | **Crypto payments** (settlement events) |
| Underlying primitive | Live telemetry → routing decision | On-chain reputation, ERC-8004 | Network-level mediation layer (kill-switch, audit) | Onchain event capture → ISO-style normalized receipts |
| Payment-plumbing scope | Non-custodial x402 router + payment construction | None (reputation only) | None (control/audit only) | Receipt and audit layer only |
| Public framing | Registry + telemetry today; router next | "Trust oracle for ERC-8004 agent economy" | "Bypass-resistant control for agentic systems" | "ISO-ready auditability for crypto payments" |
| Target user | Agent builders making paid x402 calls | Anyone integrating ERC-8004-tagged agents | Enterprises running agents in regulated environments | Crypto-native businesses + enterprises adopting crypto rails |
| Stage signal | Solo-founder, pre-launch, no public users | Claims 68k+ agents scored across 24 chains | Live site + GitHub presence | Live site, leadership / team page, ISO-20022 angle |

## Honest read of each

**AgentProof — overlapping name, different problem.** They score *agents*,
not provider endpoints. ERC-8004 is an emerging standard for tagging agent
identity/reputation on-chain; AgentProof is positioning as "the oracle that
reads it." That's adjacent to TrustBench but on the other side of the
transaction: AgentProof tells a *provider* whether an *agent* is trustworthy,
TrustBench tells an *agent* whether a *provider* is reachable and well-priced.
They could plausibly become a complement — an agent calling TrustBench's router
might pass an AgentProof reputation token along with the x402 payment so the
provider can rate-limit accordingly. They are not directly competitive with
the router, but they are competing for the same "trust layer for agent
commerce" mindshare in narrative terms, which is worth knowing.

**ProofRail — direct competitor to the policy-firewall layer (Phase 4).**
"Bypass-resistant control for agentic systems" — manual emergency stop,
mediated tool calls, structured audit. This is exactly the shape of the
policy firewall TrustBench's Phase 4 sketches: spend limits, kill switches,
human-in-the-loop. Their angle is *governance for any agent*, network-level,
infrastructure-y, enterprise-targeted; TrustBench's angle is the same thing
narrowed to **payment-related agent actions specifically** (and bundled with
the router primitive). ProofRail's existence is real signal that this is a
problem someone else thinks is worth building a company around — useful
validation. The differentiation that survives is: their policy layer wraps
*tool calls in general*; TrustBench's policy layer wraps *the
construct-tx-and-sign x402 path specifically*, which is a much smaller surface
area but the one with measurable per-call economic risk.

**ProofRails — direct competitor to the receipt/accounting layer (Phase 4).**
ISO-style normalized receipts, signed deterministic evidence bundles, hash
anchored on-chain for integrity, ISO-20022 bridge to traditional financial
messaging. This is the most credible claim to "the receipt layer for crypto
payments" in the comparison, and they're targeting both crypto-native firms
and enterprises adopting crypto rails. If TrustBench ships a CSV/ledger
receipt layer in Phase 4, ProofRails is the reference point users will
compare against. The honest framing: **don't try to compete with their ISO-
ready, enterprise-grade audit pipeline**. Either bundle receipts as a
free-with-routing convenience (basic CSV + Ed25519 receipt is enough for
agent builders), or eventually integrate with ProofRails so receipt export
goes through them for users who need ISO-20022 compliance. Building a
parallel ISO-20022 audit pipeline as a solo founder is a no.

## Implications for TrustBench's strategy

Four things this changes (or sharpens):

1. **The router is the unique part.** AgentProof, ProofRail, and ProofRails
   each cover one *layer* of the agent-commerce stack — reputation,
   governance, receipts. None of them constructs and routes x402 transactions
   on the agent's behalf. The non-custodial router is the moat-shaped thing
   that no one in this set is building, and it's the layer that *needs* the
   other three to feel useful (a router without policy or receipts is a toy;
   a router with both is infrastructure).
2. **Phase 4 should treat policy + receipts as *integrations*, not from-scratch
   builds, where possible.** Spend-limit/kill-switch logic is small enough to
   build in-house, but if ProofRail or ProofRails offers a clean API, wrapping
   theirs can ship faster than reinventing it.
3. **AgentProof is a possible distribution channel, not a competitor.** If
   ERC-8004 reputation tokens become standard, threading them into x402 calls
   that go through TrustBench's router is a natural integration. Worth a low-
   effort intro DM to whoever runs that GitHub.
4. **The "registry + telemetry" framing for now is the right call** — once
   the router ships, the public face becomes the router, and the registry
   becomes a debug/transparency view. Trying to market TrustBench as a
   reputation product head-on against AgentProof's "trust oracle" framing
   would be a dead-on-arrival positioning fight; staying focused on the
   payment-plumbing angle is what differentiates.

## Sources

- [AgentProof](https://agentproof.sh) — site metadata: "Trust Oracle for the ERC-8004 Agent Economy. On-chain reputation oracle for AI agents. 68,000+ agents scored across 24 chains."
- [ProofRail](https://proofrail.org) — "Bypass-Resistant Control for Agentic Systems" — mediated tool calls, manual emergency stop, structured audit evidence.
- [ProofRails](https://www.proofrails.com) — ISO-ready auditability and payment infrastructure for crypto-native businesses; captures onchain events, signed deterministic evidence bundles, hash anchored onchain.
