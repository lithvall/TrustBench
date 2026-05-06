# x402 Ecosystem — Working Reference

**Last updated:** 2026-05-02 (research conducted via WebSearch + WebFetch)
**Purpose:** Operational reference for TrustBench and any future x402-adjacent project the user works on. Captures protocol mechanics, network/facilitator state, adoption metrics, security model, SDK ecosystem, competitive landscape, and known incidents — enough that a fresh reader (Claude session, the user, a contractor) can build x402 things without starting from scratch.

**Why this file exists:** Claude's training cutoff is end of May 2025. Reasoning from that prior would significantly underestimate ecosystem maturity. This doc replaces that prior with an empirically-current view. It's intended to be carried forward to future projects and re-checked on a quarterly cadence.

---

## Snapshot

x402 in May 2026 is a **mature, production-grade payment protocol** with substantial adoption and Foundation-level governance.

- **Protocol version:** v2 (released Dec 11, 2025), governed by the **x402 Foundation** under the **Linux Foundation**.
- **Adoption (cumulative as of mid-2026):** **165M+ transactions, ~$50M+ on-protocol volume, 480K+ unique transacting agents**.
- **Major backers/members (20+):** Coinbase, Cloudflare, Stripe, AWS, Google, Visa, Base, Circle, Solana Foundation, Stellar Development Foundation, OpenZeppelin, and others.
- **Networks live:** Base (EVM, eip155:8453), Solana, Stellar, Polygon, Arbitrum, World Chain. Algorand reachable via standardized identifiers.
- **Volume per chain (recent):** Solana surpassed Base for the first time — Solana ~518K x402 payments vs. Base ~505K (the Solana-vs-Base race is a current ecosystem story).
- **Free public facilitators:** Coinbase (Base, Solana, Polygon, Arbitrum, World — 1,000 tx/month free tier, $0.001/tx after) and Coinbase Stellar (free, sponsored fees via OpenZeppelin Relayer).
- **Reference implementation + spec:** [github.com/x402-foundation/x402](https://github.com/x402-foundation/x402) (migrated from `coinbase/x402` after Foundation handoff).
- **Canonical directory:** [x402.org/ecosystem](https://www.x402.org/ecosystem).
- **Coinbase's x402 marketplace:** [Agentic.Market](https://www.coinbase.com/developer-platform/discover/launches/agentic-market) — 70+ curated services across 7 categories with live pricing/volume.

**The ecosystem is real, growing, and competitive.** Multiple agent-side routers, multiple paywall middleware integrations, multiple SDK families, and one major non-x402 challenger (Stripe MPP, March 2026).

---

## Protocol architecture

### Wire format (the request/response dance)

x402 follows the HTTP 401/407 challenge-and-retry pattern. Three headers carry the entire payment dialog:

```
GET /resource                          ← agent's first request, no payment
HTTP/1.1 402 Payment Required          ← server returns
PAYMENT-REQUIRED: <base64 JSON>        ← payment requirements

GET /resource                          ← agent retries with payment
X-PAYMENT: <base64 JSON>               ← signed payload + authorization
HTTP/1.1 200 OK                        ← server returns
X-PAYMENT-RESPONSE: <base64 JSON>      ← settlement reference (tx_hash)
```

Naming note: the response header is `PAYMENT-REQUIRED` (no `X-` prefix per recent IETF guidance). The request and final-response headers are `X-PAYMENT` / `X-PAYMENT-RESPONSE`. Headers are base64-encoded JSON envelopes; payloads are not URL-encoded, only header-safe-encoded.

### Payment payload structure

The 402 body / `PAYMENT-REQUIRED` header carries an `accepts` array of payment options:

```json
{
  "accepts": [
    {
      "scheme": "exact",
      "network": "eip155:8453",
      "asset": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      "recipient": "0x...",
      "amount": "1000",
      "decimals": 6,
      "valid_after": 1714560000,
      "valid_before": 1714560300,
      "nonce": "0x..."
    }
  ]
}
```

The agent picks one option and signs the corresponding authorization. Multi-network/asset/scheme support is provider-side: a provider can offer the same call as USDC on Base OR USDC on Solana OR EURC on Polygon and let the agent pick.

### Schemes

Two on-chain payment schemes, plus a session extension:

- **`exact` with EIP-3009 `transferWithAuthorization`** — native USDC/EURC. Agent signs an EIP-712 typed authorization with `from`, `to`, `value`, `validAfter`, `validBefore`, `nonce`. Provider (or facilitator) submits the authorization on-chain. Gas paid by submitter, funds move agent → provider directly. **No allowance required.** Most common scheme for stablecoin micropayments.
- **`exact` with Permit2** — generic ERC-20 support. Agent signs a Permit2 message; provider/facilitator pulls. Used when the asset isn't a USDC-style contract that supports EIP-3009.
- **`upto` and `deferred`** — listed as future schemes in some docs (streaming, partial-fill); not yet primary.

### Sessions and SIWx (v2 addition)

x402 v2 introduced **Sign-In-With-X (SIWx)** — based on **CAIP-122**, a chain-agnostic standard for wallet-based authentication. It's an extension on top of the core protocol:

- Agent signs a CAIP-122 message once, proving wallet control.
- Server grants a session bound to that wallet.
- Subsequent requests carry a `SIGN-IN-WITH-X` header proving session ownership; no on-chain payment per call.
- Useful for repeat access to already-paid-for content, or auth-only routes that don't gate behind payment.

This is the protocol's "subscription-like" mode. Reduces on-chain load substantially for high-frequency agents.

### v1 → v2 evolution (key changes)

v2 dropped Dec 11, 2025 after a 2-week community feedback period. Major changes:

1. **Plug-in architecture.** Chains, assets, and schemes are registered, not hard-coded. The SDK no longer needs forking for new chain support.
2. **Clear separation of concerns** between protocol spec, SDK implementation, and facilitators. Each can evolve independently.
3. **Standardized network/asset identifiers.** EVM uses `eip155:<chainId>`, Solana uses `solana:<genesisHash>`, Algorand uses `algorand:<genesisHash>`, Stellar uses `stellar:<network>`. Single payment format across all chains.
4. **SIWx sessions.** Wallet-based identity for repeated access (above).
5. **Legacy rail compatibility.** Format hooks exist for ACH, SEPA, card networks — implementation pending but the spec accommodates it.

V2 is **backward compatible** with v1 in most cases, but new providers and SDKs default to v2 features.

---

## Networks

| Network | Identifier | Native facilitator | Notes |
|---|---|---|---|
| Base (Ethereum L2) | `eip155:8453` | Coinbase free tier | USDC native via EIP-3009. Originally the dominant chain. |
| Solana | `solana:<genesisHash>` | Coinbase free tier | 400ms finality, $0.00025 tx cost. **Volume now exceeds Base.** SPL tokens supported. |
| Stellar | `stellar:<network>` | Coinbase Stellar (free, sponsored fees) | ~5s finality, near-zero fees. OpenZeppelin Relayer powers settlement. Default for true micropayments. |
| Polygon | `eip155:137` | Coinbase free tier | EIP-3009 USDC + Permit2. |
| Arbitrum | `eip155:42161` | Coinbase free tier | Same as Polygon. |
| World Chain | `eip155:480` | Coinbase free tier | Worldcoin's L2, listed in docs. |
| Algorand | `algorand:<genesisHash>` | Per-chain | ID format reserved; adoption lower than EVM/Solana. |
| Avalanche | `eip155:43114` | Per-chain | Listed but less prominent. |

**Adoption note:** Solana surpassed Base for the first time recently with ~518K x402 payments vs. Base's ~505K. Stellar's near-zero fees make it the natural micropayment chain (sub-cent calls don't economically work elsewhere). Multi-chain is a real, used feature, not aspirational.

---

## Facilitators

Facilitators are the components that handle on-chain settlement and signature verification. Both `/verify` and `/settle` are POST endpoints:

- **POST `/verify`** — given a payment payload + payment requirements, return whether the signature is valid and the wallet has sufficient balance, *without* moving money.
- **POST `/settle`** — given the same inputs, broadcast the settlement transaction and return the tx_hash.

Resource servers can either implement these themselves (against an RPC) or POST to a third-party facilitator that does.

### Free public facilitators

- **Coinbase (CDP) Base/Solana/Polygon/Arbitrum/World facilitator** — 1,000 tx/month free, $0.001/tx after. Supports EIP-3009 (USDC, EURC) and Permit2 (any ERC-20).
- **Coinbase Stellar facilitator** — free, gas sponsored via OpenZeppelin Relayer. Network-specific because Stellar's sponsored-fees model differs from EVM/Solana gas.
- **Solana public facilitator** — free, separately operated.

### Self-hosted facilitator implementations

For projects that want to run their own facilitator (e.g., to avoid centralizing through Coinbase, or to support custom schemes):

- **`coinbase/x402` reference SDK** — TypeScript implementation, the canonical starting point.
- **`x402-rs/x402-rs`** — Rust implementation, full verify+settle+monitor.
- **`openlibx402/openlibx402`** — Multi-language (Python, TS, Go, Rust, Java, Kotlin), Solana-focused.

---

## Security model

x402 has **three independent security mechanisms** stacked atop each other:

### 1. Replay protection via on-chain nonces

Every authorization includes a `bytes32` `nonce` chosen by the client. The on-chain settlement contract (USDC's EIP-3009 implementation, or Permit2) records used nonces permanently. **A nonce can be used exactly once, ever.** This is structurally stronger than HTTP-layer idempotency keys (e.g., Stripe's, which are discarded after 24h) — the on-chain record is immutable.

For TrustBench/MPP-style middlewares: HTTP-layer idempotency is still valuable for caching responses cheaply, but the **cryptographic guarantee against double-spend lives on-chain**, not in the middleware.

### 2. Signature integrity via EIP-712 domain separator

Every authorization signature is over an EIP-712 typed-data hash that includes:
- Contract address (the USDC/Permit2 contract)
- Chain ID
- Protocol version

This binds each signature to a specific contract, chain, and protocol version. **Cross-chain replay is impossible** — a signature valid for Base USDC is not valid for Polygon USDC even though they share the same contract address. A signature valid for x402 v2 is not valid for x402 v1 even if everything else is identical.

EIP-712 typed data also gives wallets the ability to display a structured summary of what's being authorized, vs. opaque hex blobs.

### 3. Atomic two-phase settlement

`/verify` is read-only and idempotent. `/settle` is the only side-effectful step, and it's atomic — either the entire transferWithAuthorization succeeds on-chain, or it reverts. There's no half-paid state at the protocol level.

Some L1/L2/L3 atomicity gaps exist when settlement happens across L2 boundaries; x402 v2 addresses some but not all. For Phase 3 single-chain (Base or Solana), this isn't a concern.

### The 402Bridge incident (Oct 28, 2025) — case study

A cross-chain bridge service called **402Bridge** (built *on* x402, not a flaw in the x402 protocol itself) lost ~$17,693 USDC from 200+ users via a leaked admin private key.

- **Root cause:** Compound failure — admin private key stored alongside server logs, no multi-sig/MPC, no audits, excessive control concentrated in a few core members.
- **Mechanism:** Attacker took control of the bridge contract's owner role, called a `transferUserToken` admin function that drained authorized USDC from approving wallets.
- **Not an x402 protocol bug.** The bug was in the bridge's contract-level permission model and the team's key custody hygiene.

**Lesson for any x402-adjacent project:** the protocol's security guarantees only cover what the protocol controls. **Custodial-adjacent service layers (bridges, wallets, middleware that holds approvals) are the soft target.** TrustBench's non-custodial stance is exactly the architectural answer to this — TrustBench has no admin function that can transfer user funds, because TrustBench can't transfer user funds at all. The 402Bridge incident validates the design choice retrospectively.

---

## SDK ecosystem

### Official `@x402/*` packages (TypeScript)

Modular by concern:
- **Core:** `@x402/core` — protocol types, encoding, JCS canonicalization helpers
- **Chain implementations:** `@x402/evm`, `@x402/svm` (Solana), `@x402/stellar`
- **HTTP framework integrations:** `@x402/express`, `@x402/hono`, `@x402/fastify`, `@x402/next`, `@x402/axios`, `@x402/fetch`
- **UI:** `@x402/paywall`
- **Extensions:** `@x402/extensions` (SIWx etc.)

The Hono integration is real and live (`@x402/hono`) — useful context for TrustBench since the codebase is Hono-based.

### Other official languages

- Python (`x402-python` in the foundation repo, FastAPI examples)
- Go
- Rust (`x402-rs`)
- Java

### Notable community SDKs

- **Primer Systems** — TS + Python SDKs for payers and payees, CLI via `npx @primersystems/x402`.
- **Nova402** (`nova402.com` family) — `@nova402/core`, `@nova402/next`, `@nova402/express`, `@nova402/react`, `@nova402/solana`, plus Python and Go.
- **OpenLibx402** — multi-language, Solana-focused, FastAPI/Express server impls.
- **dabit3/a2a-x402-typescript** — TypeScript implementation of the x402 extension for Google's A2A (Agent-to-Agent) protocol.

---

## Adoption: real providers and Agentic.Market

### Agentic.Market — Coinbase's x402 marketplace

Public marketplace for x402-monetized services. Live pricing, transaction volume, top lists per category. **70+ curated services as of launch**, growing.

The seven categories:

1. **Inference / Reasoning** — LLMs and reasoning APIs (OpenAI, Anthropic, etc.)
2. **Data** — financial, market, on-chain (Bloomberg, CoinGecko, Nansen, Alchemy)
3. **Media** — generation, transformation
4. **Search** — web search, web data (Exa, Firecrawl)
5. **Social** — social platform APIs
6. **Infrastructure** — AWS Lambda, Coinbase RAT (Rate-And-Throttle), other compute
7. **Trading** — DEX aggregators, market access

### Notable real providers known to monetize via x402

- **OpenAI** — inference APIs accessible via x402 in addition to API key
- **Anthropic** — same
- **Bloomberg** — market data
- **CoinGecko** — crypto pricing
- **Nansen** — on-chain analytics, blockchain intelligence (`agents.nansen.ai`)
- **Exa** — AI-native web search
- **Firecrawl** — web scraping
- **Alchemy** — blockchain RPC and data
- **AWS Lambda** — compute via x402-gated access

**Important caveat for TrustBench:** these providers serve x402 **at specific endpoint URLs**, not at their general API roots. Querying `https://api.openai.com/v1/chat/completions` directly returns the conventional API-key-gated response. The x402 endpoints live at separate paths or subdomains, listed in Agentic.Market and the canonical directory. **TrustBench's registry currently has the wrong inventory** (it's pointed at the API-key roots, not the x402 endpoints) — this is the operational lever for refreshing the registry.

---

## Provider-side middleware (paywall integrations)

These let providers add an x402 paywall to existing APIs without rebuilding their backend:

- **Cloudflare Workers** — native x402 support, [`x402-proxy` Worker template](https://developers.cloudflare.com/agents/x402/charge-for-http-content/). Cloudflare co-founded the Foundation. Used in production for "pay-per-crawl" against AI bots.
- **Vercel `x402-mcp`** — middleware for Next.js / serverless functions. Used to monetize MCP tools.
- **Zuplo** — API gateway with built-in x402 paywall configuration.
- **Kobaru** — transparent reverse proxy. Add x402 to any API by routing through Kobaru, no backend changes.

For new providers entering the ecosystem, picking one of these is faster than rolling your own. None of them centralize custody — they're all paywall-on-top of provider's own API + facilitator-mediated settlement.

---

## Agent-side routers and gateways (TrustBench's competitive set)

Multiple projects target the agent side — helping agents discover providers, pay safely, and route across multiple x402 endpoints:

| Project | Focus | Notes |
|---|---|---|
| **G402.ai** | Managed router, edge gateway under your domain | Privy-backed wallets (auto-created, no key handling). Pay-per-use, subscription, hybrid. Cloudflare Worker / VM deployment. Three-tier architecture (frontend/gateway/Solana). |
| **ekailabs/x402-openrouter** | OpenRouter-style for x402 LLMs | GitHub project, less productized. |
| **X-Router (`x-router.ai`)** | Universal gateway for permissionless AI model access | Live product. |
| **Router402 (`router402.xyz`)** | LLM routing with x402 micropayments | Live product. |
| **mitgajera/x402-ai** | Solana multi-LLM gateway | Pay-per-request on Solana with on-chain verification. |
| **AgentGatePay/TX** | AP2 mandates + x402 protocol | Agent payments router with Google A2A integration. |
| **itublockchain/hackmoney-router402** | LLM routing | ETHGlobal HackMoney 2026 finalist. |
| **TrustBench (this project)** | Non-custodial smart router with policy + signed receipts + queryable audit | Phase 3 build. Multi-capability (search/inference/data) not LLM-only. |

**TrustBench differentiation in this map:**

- Most competitors focus on **LLM routing only**. TrustBench is multi-capability.
- Most competitors don't expose **idempotency, hard spend caps, signed receipts, queryable audit** as first-class primitives. TrustBench does (validated by Phase 2 builder conversations as the actual unmet need).
- The **non-custodial promise is architecturally enforced** in TrustBench — there is literally no admin function that can move user funds, because the design has no facilitator role for TrustBench. Several competitors operate Privy-managed wallets or session keys that are custodial-adjacent; TrustBench explicitly does not.
- Pricing model: most competitors take a routing spread or platform fee. TrustBench locked **flat-per-tx** in Phase 2 validation (builders explicitly rejected percentage spreads).

The competitive lane is real but defensible — particularly post-402Bridge, when "we never hold funds" becomes a hard differentiator vs. wallet-managing routers.

---

## Competitive payment protocols (alternatives to x402)

### Stripe MPP (Machine Payments Protocol) — March 18, 2026

- **Different design philosophy:** session-based streaming payments with Stripe's compliance stack baked in (Radar fraud detection, PCI, tax).
- **Hybrid fiat + crypto:** an agent can use USDC on Stripe's Tempo blockchain *or* a user's linked Visa card. Unique among agent-payment protocols.
- **Built-in idempotency and replay protection** as protocol primitives (x402 leaves these to the middleware/gateway layer).
- **Higher setup cost** than x402 (Stripe SDK + dashboard), but trivial if already integrated with Stripe.
- **Best for:** enterprise, high-frequency, fiat+crypto hybrid use cases, anyone wanting Stripe's compliance for free.

### L402 (Lightning-based)

- Lightning Network 402 protocol. Less prominent in 2026 than x402 + MPP.
- Suited to BTC-denominated micropayments. Different chain, different settlement model.

### Google A2A / AP2 (Agent-to-Agent / Agent Payments 2)

- Google's agentic protocol stack. AP2 is the payments component.
- **Coinbase + Google partnership:** A2A and x402 announced as compatible. AP2 mandates can be carried over x402 settlement. The two stacks are integrating, not competing head-on.

### What x402 trades vs. Stripe MPP

x402 = **minimal protocol, embedded in HTTP, no accounts, no setup, permissionless, on-chain atomicity by default.** Best for long-tail providers, decentralized scenarios, agent-native apps that already speak crypto.

MPP = **maximal protocol with sessions/streaming/compliance/fiat hybrid.** Best for enterprise, Stripe-native shops, fiat-required users.

If you're building agent-side infrastructure, **support both paths.** They're complementary, not exclusive.

---

## TrustBench-specific notes (consolidated)

- **Phase 3 design choices are validated by ecosystem reality.** Non-custodial architecture, EIP-3009 on Base USDC, two-step quote/settle protocol, agent-signed authorization → provider submission. All match how the ecosystem works in practice.
- **Header naming was correct:** `X-PAYMENT` and `X-PAYMENT-RESPONSE` for the request/final-response. The 402's `PAYMENT-REQUIRED` is the response header without `X-` prefix per recent IETF guidance — the project's wire format is consistent with this.
- **`@x402/hono` exists and may be useful.** When TrustBench needs to expose its own x402 endpoints (e.g., for agent SDK consumption, paid probes, or future provider-side experiments), `@x402/hono` is the natural choice. Earlier sessions assumed the empty `node_modules/@x402/` directory was stale; it likely was, but the *real* `@x402/hono` package is on npm and worth integrating before the v2 SIWx feature lands in TrustBench.
- **Registry inventory issue (May 2026):** the current 14 entries in `providers` + `scorecards` are AI/search APIs (OpenAI, Anthropic, Perplexity, etc.) at their **API-key-gated root URLs**, not their x402 endpoints. The fix is to refresh the crawler against [x402.org/ecosystem](https://www.x402.org/ecosystem) or the Agentic.Market index. This is a non-trivial change but unblocks the "real x402 traffic" milestone.
- **Phase 4 should consider SIWx integration.** For repeat-access / subscription-style flows, SIWx + sessions reduce on-chain load and give agents a familiar "authenticate once" UX. The TrustBench receipt model still works on top — sessions just compress N receipts into one auth + N session-scoped receipts.
- **Competition is real but lane is defensible.** Multiple LLM routers exist (G402, X-Router, Router402, etc.). TrustBench's differentiation — multi-capability, non-custodial, idempotency/caps/receipts/audit as first-class primitives — is not common in that set. The 402Bridge incident strengthened the value of the non-custodial framing.

---

## Sources

Captured 2026-05-02 via WebSearch + WebFetch:

**Foundation, spec, and reference implementation:**
- [x402.org — Internet-Native Payments Standard](https://www.x402.org/)
- [x402.org — Ecosystem directory](https://www.x402.org/ecosystem)
- [github.com/x402-foundation/x402](https://github.com/x402-foundation/x402)
- [docs.x402.org — Quickstart for Sellers](https://docs.x402.org/getting-started/quickstart-for-sellers)
- [docs.x402.org — Networks & Token Support](https://docs.x402.org/core-concepts/network-and-token-support)
- [docs.x402.org — Sign-In-With-X (SIWX)](https://docs.x402.org/extensions/sign-in-with-x)
- [docs.cdp.coinbase.com/x402/welcome — Coinbase x402 docs](https://docs.cdp.coinbase.com/x402/welcome)

**v2 launch:**
- [x402.org — Introducing x402 V2](https://www.x402.org/writing/x402-v2-launch)
- [DEV.to — x402 V2: What's New](https://dev.to/jimquote/x402-v2-whats-new-in-the-internet-native-payments-protocol-2kaf)
- [DEV.to — x402 V2: 5 Security Changes](https://dev.to/mkmkkkkk/x402-v2-just-dropped-5-security-changes-every-ai-agent-builder-needs-to-know-5apf)

**Foundation governance:**
- [PR Newswire — Linux Foundation launching x402 Foundation](https://www.prnewswire.com/news-releases/linux-foundation-is-launching-the-x402-foundation-and-welcoming-the-contribution-of-the-x402-protocol-302732803.html)
- [Cloudflare blog — Launching the x402 Foundation](https://blog.cloudflare.com/x402/)

**Adoption + Agentic.Market:**
- [Coinbase — Introducing Agentic.Market](https://www.coinbase.com/developer-platform/discover/launches/agentic-market)
- [Crypto.news — Coinbase's x402 launches Agentic.Market](https://crypto.news/coinbases-x402-launches-agentic-market-to-expand-ai-agent-payments/)
- [WebProNews — Coinbase's x402 Ignites AI Agent Economy](https://www.webpronews.com/coinbases-x402-ignites-ai-agent-economy-with-agentic-market-launch/)
- [Coinbase — Google A2A + x402 partnership](https://www.coinbase.com/developer-platform/discover/launches/google_x402)

**Networks:**
- [MEXC News — Solana narrows gap with Base](https://www.mexc.com/news/476898)
- [Stellar Development Foundation — x402 on Stellar](https://stellar.org/blog/foundation-news/x402-on-stellar)
- [Solana — How to get started with x402 on Solana](https://solana.com/developers/guides/getstarted/intro-to-x402)
- [Thirdweb — Solana x402 Support is Live](https://blog.thirdweb.com/changelog/solana-x402-support-is-live/)

**Security model:**
- [agentpaytrend.com — 3 Security Mechanisms](https://agentpaytrend.com/x402-protocol-security-3-mechanisms/)
- [blog.valkyrisec.com — x402 Integration Security Deep Dive](https://blog.valkyrisec.com/x402-integration-security/)

**402Bridge incident:**
- [SuperEx Medium — 402Bridge Incident Analysis](https://superex.medium.com/the-explosion-of-the-x402-protocol-and-the-402bridge-security-incident-an-in-depth-analysis-of-12c909bed5f1)
- [ForkLog — 402bridge loses over 17,000 USDC](https://forklog.com/en/402bridge-loses-over-17000-usdc/amp/)
- [Bitget News — 402Bridge attack review](https://www.bitget.com/news/detail/12560605057036)

**Provider-side middleware:**
- [Cloudflare Agents docs — x402](https://developers.cloudflare.com/agents/agentic-payments/x402/)
- [Cloudflare Agents — Charge for HTTP content](https://developers.cloudflare.com/agents/x402/charge-for-http-content/)
- [Zuplo — Autonomous API & MCP Server Payments with x402](https://zuplo.com/blog/mcp-api-payments-with-x402)
- [Kobaru — x402 Micropayment Gateway](https://www.kobaru.io/)
- [github.com/kobaru-io/api-paywall-cookbook](https://github.com/kobaru-io/api-paywall-cookbook)

**Agent-side routers/gateways:**
- [G402.ai — Gateway Overview](https://docs.g402.ai/docs/gateway/overview)
- [G402.ai dashboard](https://www.g402.ai/)
- [github.com/ekailabs/x402-openrouter](https://github.com/ekailabs/x402-openrouter)
- [X-Router](https://x-router.ai/)
- [Router402](https://www.router402.xyz/)
- [github.com/AgentGatePay/TX](https://github.com/AgentGatePay/TX)

**SDKs:**
- [xpay.sh — x402 SDKs catalog](https://www.xpay.sh/x402-sdks/)
- [github.com/xpaysh/awesome-x402](https://github.com/xpaysh/awesome-x402)
- [npm @coinbase/x402](https://www.npmjs.com/package/@coinbase/x402)
- [npm x402-solana](https://www.npmjs.com/package/x402-solana)
- [github.com/x402-rs/x402-rs](https://github.com/x402-rs/x402-rs)
- [github.com/openlibx402/openlibx402](https://github.com/openlibx402/openlibx402)
- [github.com/dabit3/a2a-x402-typescript](https://github.com/dabit3/a2a-x402-typescript)

**Competitive protocols:**
- [WorkOS — x402 vs. Stripe MPP](https://workos.com/blog/x402-vs-stripe-mpp-how-to-choose-payment-infrastructure-for-ai-agents-and-mcp-tools-in-2026)
- [Stripe Documentation — x402 payments](https://docs.stripe.com/payments/machine/x402)
- [DeFi Prime — Stripe's MPP vs. x402](https://defiprime.com/stripe-mpp-vs-x402)
- [Crossmint — Agentic payments protocols compared (MPP, ACP, AP2, x402)](https://www.crossmint.com/learn/agentic-payments-protocols-compared)
- [Mpelembe Network — L402, x402, and Stripe's MPP deep dive](https://mpelembe.net/index.php/crypto-fiat-and-the-ai-web-a-deep-dive-into-l402-x402-and-stripes-mpp/)

**Real provider examples:**
- [Nansen — Pay-per-call onchain data with x402 + PayAI](https://nansen.ai/post/how-nansen-enabled-pay-per-call-onchain-data-access-with-x402-and-payai)
- [Nansen for Agents](https://agents.nansen.ai/)

**Other useful overviews:**
- [Bitget News — x402 Doers list](https://www.bitget.com/news/detail/12560605038268)
- [QuickNode blog — What is the x402 Payment Protocol?](https://blog.quicknode.com/x402-protocol-explained-inside-the-https-native-payment-layer/)
- [Alchemy — What is x402?](https://www.alchemy.com/blog/how-x402-brings-real-time-crypto-payments-to-the-web)
- [Stablecoin Insider — x402 Protocol Explained](https://stablecoininsider.org/x402-protocol/)

---

## Maintenance

This file decays. Things to re-check on a quarterly cadence:

**High-decay (refresh every 30–90 days):**
- Adoption stats (transactions, volume, agents) — Coinbase publishes these periodically
- Solana vs. Base transaction volume race
- Network coverage (which chains have free facilitators)
- Provider list on Agentic.Market and x402.org/ecosystem
- New SDK releases and language support
- Stripe MPP adoption (it's a fast-moving competitor)
- Status of competitive routers (G402.ai, X-Router, Router402, etc.) — they may pivot or shut down

**Medium-decay (every 3–6 months):**
- Protocol version (currently v2). Watch for v3 announcements
- Foundation membership additions/removals
- New extensions beyond SIWx
- Security incidents in the ecosystem

**Stable (re-check annually unless news prompts):**
- Foundation governance under Linux Foundation
- Header naming conventions (PAYMENT-REQUIRED, X-PAYMENT, X-PAYMENT-RESPONSE)
- The three-pillar security model (replay nonces, EIP-712 binding, atomic settlement)
- Major scheme types (EIP-3009, Permit2)
- Comparison with Stripe MPP, L402

**When updating:**
1. Bump the "Last updated" date at the top
2. Note any reversals from the previous snapshot in a brief "Changes since last update" callout
3. Re-run a sample WebFetch against 2–3 listed provider URLs to confirm they still serve x402 (some will rotate)
4. Re-run WebSearch for "x402 V[next] launch" to detect protocol-version churn
5. Cross-check against `x402.org/ecosystem` and `Agentic.Market` for new categories or major providers
