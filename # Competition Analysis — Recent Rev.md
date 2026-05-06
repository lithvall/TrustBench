# Competition Analysis — Recent Reviews (April 30, 2026)

## 1. Infopunks Trust Layer
**Repo:** https://github.com/ministryofinfopunks/infopunks-trust-layer-agentic.market  
**What it is:** Paid x402 trust primitive for Agentic.Market. Agents pay via x402 before routing work/execution. Returns trust_score, risk_level, route decision (allow/degrade/block), reasons, and full x402 receipt.

**Key features:**
- Single endpoint: POST /v1/resolve-trust
- x402-compliant
- Structured receipt with payment_receipt_id, verifier_reference, settlement_status
- Deployed on Render, OpenAPI spec, CI/tests included

**How it relates to TrustBench router:**
- Perfect upstream complement: their layer is the trust/intelligence brain; our router is the clean non-custodial payment + routing + receipt plumbing.
- They explicitly want a stronger “cleaner proof trail” (signed receipt + queryable audit path) — exactly what we are building first.

## 2. SpendGate.ai
**Site:** https://spendgate.ai/  
**Founder who replied on Reddit:** Euan Chisholm

**What it is:** Proxy/governance layer for AI agents. Sits between agents and upstream APIs (including x402) and enforces centralized policies.

**Key features:**
- Per-agent policies (rate limits, spend limits, URL allowlists)
- x402-aware spend controls and replay-safe request handling
- Signed webhooks + real-time alerts
- Full audit trail (policy decisions, approvals, x402 flows)
- Credentials encrypted at rest, never logged
- Pricing: free tier → $15/mo Pro → custom Business

**How it relates to TrustBench router:**
- They built in-house exactly the kind of payment plumbing we are validating as a hosted service.
- Confirmed the same pains (retry/failover logic, spend limits, fund-burning loops, accounting).
- Sees value in a hosted non-custodial router for speed/scaling but built their own proxy because they needed maximum control.
- Strong differentiation opportunity: we stay fully non-custodial (agent always auth+signs, we never hold keys or sit in the middle).

**Pricing insight from founder:**
1-3% routing spread is “a big no no for a lot of people” — validates need for flat per-tx fee or subscription options.

## 3. AgentlyHQ (use-agently + aixyz)
**X / GitHub:** @AgentlyHQ — https://github.com/AgentlyHQ  
**Main products:**  
- use-agently (CLI + platform): https://use-agently.com  
- aixyz framework: https://github.com/AgentlyHQ/aixyz

**What it is:** Routing and settlement layer for the agent economy + Next.js-like framework for payment-native AI agents. Marketplace for AI agents using x402. Handles discovery, A2A, MCP, automatic x402 payments, routing, and settlement.

**Key features:**
- Automatic x402 payment handling (CLI automatically signs and retries on 402 responses)
- A2A + MCP integration for agent-to-agent and tool discovery
- ERC-8004 identity + payment-native agent bootstrapping
- Marketplace for agents with built-in routing and settlement
- Focus: “The way AI coordinates and transacts. Routing and settlement layer for your agent economy.”

**How it relates to TrustBench router:**
- Direct overlap on the routing + settlement problem space.
- They are building a more opinionated, framework-heavy solution (CLI + full agent framework) that sits in the middle of agent flows.
- Differentiation opportunity: we remain a lightweight, fully non-custodial, MCP-native router focused on verifiable receipts, idempotency, spend caps, and queryable audit trails — no framework lock-in, no proxy required.
- Their existence confirms strong market demand for exactly the layer we are validating.

**Strategic Takeaways (for TrustBench)**
- All three projects confirm the exact same pain points we heard across Reddit and X.
- None is a perfect 1:1 competitor: Infopunks is intelligence/trust layer, SpendGate is proxy/governance layer, AgentlyHQ is framework + marketplace routing layer.
- Our router can be the lightweight, non-custodial, MCP-native plumbing layer that plugs into all of them (and many others).
- Next features to prioritize: idempotency, hard spend caps, signed receipts + queryable audit API.