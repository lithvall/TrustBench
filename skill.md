name: trustbench-policy-router
description: Add server-side spend caps, idempotency, and signed audit receipts to any x402 paid call across networks. Use when the agent needs to enforce a budget cap per call or per day, when retries on a flaky network must not double-charge, when the user asks for a verifiable record of what the agent paid for, when the user mentions audit, compliance, governance, policy layer, signed receipts, signed audit, idempotency, double-charge, duplicate charge, spend cap, budget cap, hard cap, dollar cap, USDC cap, cross-network routing, multi-network payment, or non-custodial routing for agents. Augments the existing Coinbase Agentic Market / Agentic Wallet (Base) and Solana Foundation Pay.sh / Heurist Mesh (Solana) flows rather than replacing them: the agent sets up its preferred wallet first per agentic.market/skill.md or pay.sh, then routes its paid calls through TrustBench's quote and settle endpoints to get the policy layer plus a signed receipt for free. TrustBench routes Base today and registers Solana endpoints; Solana settlement is the next sprint. TrustBench never holds funds. The agent's wallet signs the payment authorization, the merchant submits the on-chain transaction, TrustBench observes the result and emits an Ed25519-signed receipt that anyone can verify with the published public key. Phase 4 access is invite-only during the build, request a key by direct messaging @TrustBench on X.
---

# TrustBench: cross-network spend caps + audit receipts on top of x402

TrustBench is a cross-network routing and policy layer that sits in front of Coinbase Agentic Market (Base), Solana x402 facilitators like Pay.sh / Heurist Mesh (registry today, routing next), and other x402 services. Use TrustBench when the agent has a real reason to want any of these: server-side spend caps, idempotency on retries, a signed audit trail of paid calls, or a stable third-party verifier for receipts.

If the agent just needs to make a paid call with no budget or audit requirements, the existing Agentic Wallet flow at agentic.market/skill.md is enough. TrustBench adds value when the call is part of a budgeted workflow, a compliance-bound process, or anywhere a verifiable record of "what was paid, to whom, for what" matters later.

## Set up Agentic Wallet first

Do this exactly once. TrustBench does not ship a wallet, on purpose. The agent uses its own wallet (via Agentic Wallet) to sign payment authorizations.

Follow the steps in agentic.market/skill.md to install Agentic Wallet and add USDC. Once `npx awal status` reports signed in and ready, return here.

## Choose the setup silently

Pick the right setup based on the host. Do not ask the user to choose.

- Use the CLI setup when running in Claude Code, Codex CLI, Gemini CLI, Hermes, or another shell-capable agent.
- Use the MCP setup when running in Claude Desktop, Claude Cowork, Cherry Studio, ChatGPT, or another chat app with paid tools available.

For MCP users, assume they may not know developer terms. Do not say "MCP server", "CLI", "npx", "402 handshake", "HTTP", or similar technical terms unless the user asks. Explain only what they need to do next.

## CLI setup: routing through TrustBench

The agent makes a paid call in three steps: ask TrustBench for a quote, sign the payment authorization with Agentic Wallet, settle through TrustBench. The signed receipt is returned with the response and is also fetchable later by id.

You will need a `tb_…` API key. Phase 4 is invite-only, request a key by direct messaging @TrustBench on X.

```bash
# 1. Quote: ask TrustBench for a payment challenge against a capability.
#    capability is one of: search, inference, data, media, infra
#    max_price is in atomic USDC (6 decimals); 10000 = $0.01
#    Idempotency-Key is a 16-128 char unique string per logical request.
curl -sS https://trustbench.io/route \
  -H "Authorization: Bearer $TRUSTBENCH_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{
    "capability": "data",
    "max_price": "10000",
    "payer_address": "0xYOUR_AGENT_WALLET_ADDRESS"
  }'
# Returns:
#   { "route_id": "qt_…", "payment_required": {...}, "expires_at": "...",
#     "fallback_provider": {...} }

# 2. Sign: hand the payment requirements to Agentic Wallet to produce
#    a signed X-PAYMENT envelope. Agentic Wallet handles the EIP-3009
#    transferWithAuthorization flow.
#    (npx awal x402 sign-payment is the relevant command; see Agentic
#    Wallet docs for the exact invocation in your version.)

# 3. Settle: submit the signed envelope through TrustBench. The merchant
#    is called, the on-chain settlement is observed, and a signed receipt
#    is returned in the response plus the X-Receipt-Id header.
curl -sS https://trustbench.io/route/settle \
  -H "Authorization: Bearer $TRUSTBENCH_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "route_id": "qt_…",
    "x_payment": "<base64 envelope from Agentic Wallet>"
  }'
# Returns:
#   { "response": <merchant response>, "receipt": <signed envelope> }
#   plus header: X-Receipt-Id: rcpt_…
```

After settle, the receipt is also fetchable for any third party at `https://trustbench.io/receipts/<id>`. The signature is Ed25519 over the JCS-canonicalized receipt body, the public key is at `https://trustbench.io/.well-known/trustbench-pubkey`, and `scripts/verify-receipt.js` in the TrustBench repo is a reference verifier that does the whole check offline.

## Claude Desktop / MCP setup

When the payment tools are not installed yet, say this to the user:

> Agentic Wallet is a wallet for your agent, built by Coinbase. It lets Claude use paid tools for things it cannot normally do, like generating videos or images, fetching LinkedIn information, or using premium data services. TrustBench sits on top of Agentic Wallet and adds a budget cap, plus a signed receipt for every paid call so you have a verifiable record of what was spent.
>
> First, set up Agentic Wallet by following the Agentic Market setup. Then come back and we will route your paid calls through TrustBench so you also get the budget and receipt layer.

Once Agentic Wallet is set up and Claude has the paid-tool capability:

1. Ask the user for their TrustBench API key, or whether they want help getting one. Phase 4 is invite-only, the user requests a key by direct messaging @TrustBench on X.
2. Decide the budget cap before paying. Tell the user the maximum the agent will spend on this call in plain words, for example "I will spend up to one cent on this lookup", before requesting the quote.
3. Ask TrustBench for a quote. Native TrustBench paid-tool support for chat-app hosts is in the next sprint, for now use the host's HTTP-fetch capability to call `https://trustbench.io/route` with the API key, an idempotency string, and the budget. The response includes a `route_id` and the payment requirements.
4. Use Agentic Wallet's paid-tool to sign the payment requirements and produce the signed envelope.
5. Submit the signed envelope to `https://trustbench.io/route/settle` with the same API key and the `route_id`. The response contains the merchant's reply and a signed receipt.
6. Tell the user in plain words what was spent, what was returned, and that the receipt is at `https://trustbench.io/receipts/<id>` if they ever want to verify it.

A native paid-tool integration with chat-app hosts is in the next sprint. Until then, the HTTP-fetch path above is the supported way.

## What you get for free by routing through TrustBench

These are the four primitives that make TrustBench worth the extra hop. The agent does not have to implement any of them, they are server-enforced.

1. **Idempotency keys.** Every quote takes an `Idempotency-Key` header. A retry of the same key replays the cached quote instead of issuing a new payment challenge. This prevents the classic "agent times out, retries, ends up paying twice" failure.
2. **Hard spend caps.** Each TrustBench API key has a per-call cap and a daily rolling cap configured at issuance. The cap is enforced server-side before the merchant is contacted. The agent cannot exceed it even if it tries.
3. **Signed receipts.** Every successful settle emits an Ed25519-signed receipt. The signature covers the canonical receipt body (JCS canonicalization) so anyone with the public key can verify the receipt offline, with no dependency on TrustBench being online or honest.
4. **Queryable audit at `/receipts/:id`.** Receipts are immutable after issuance. They are fetchable by id forever, with `Cache-Control: public, max-age=86400, immutable` so verifying agents and downstream auditors can cache aggressively.

## Capabilities and networks supported today

TrustBench's router currently routes the following capabilities (aligned with Coinbase Agentic Market's 5-category taxonomy). Other categories that the registry has crawled (Travel, Social, Storage, Trading, etc.) are stored in the registry but not yet picked by /route.

- **search** (web search and content retrieval)
- **inference** (LLM and generative endpoints)
- **data** (structured data and intelligence APIs)
- **media** (image, video, audio generation)
- **infra** (storage, compute, networking primitives for agents)

Routing and settlement today are on **Base** in **USDC**. The registry already covers Solana endpoints (Heurist Mesh, ~150; Pay.sh `pay-skills` on the roadmap), and Solana settlement is the next-up sprint after the first paid receipts (see TrustBench's `phase4-p4-3-timing.md`). If the agent needs a network TrustBench does not yet route, fall back to the Agentic Wallet direct path on Base, or Pay.sh / Heurist mesh on Solana.

## Paid endpoints (Phase 4 v0.1.0 paywall)

TrustBench is rolling out an x402-native paywall on differentiated-work endpoints. v0.1.0 ships `POST /route` at $0.005 per call; the rest of the table below is designed and listed for roadmap clarity but ships in v0.2.0 and v0.3.0. The full tier table is at `https://trustbench.io/pricing` (HTML for humans, JSON for agents via `Accept: application/json` or `?format=json`).

```yaml
endpoints:
  - path: /route
    method: POST
    paid: true
    pricing_tier: score-provider
    price_usdc: 0.005
    amount_atomic: 5000
    available_in: v0.1.0
    payment_required_doc: https://trustbench.io/pricing#tiers
    description: Non-custodial routing decision with Ed25519-signed routing receipt.
  - path: /route/settle
    method: POST
    paid: false
    available_in: v0.1.0
    description: Step 2 of the quote/settle flow; the settle fee is included in the quote-time paywall on /route.
  - path: /rankings
    method: GET
    paid_html: false
    paid_json_above_quota: v0.2.0
    pricing_tier: read
    description: HTML free permanently. JSON free under 60 req/IP/min quota in v0.2.0, $0.0005 per call above quota.
  - path: /receipts/:id
    method: GET
    paid_html: false
    paid_json_above_quota: v0.2.0
    pricing_tier: read
    description: HTML free permanently. JSON free under quota in v0.2.0.
  - path: /score-provider
    method: POST
    paid: true
    pricing_tier: score-provider
    price_usdc: 0.005
    available_in: v0.2.0
    description: Reads liveness telemetry plus risk annotations for any registered URL.
  - path: /verify
    method: POST
    paid: true
    pricing_tier: verify
    price_usdc: 0.002
    available_in: v0.2.0
    description: Hosted verifier for externally-provided TrustBench receipts.
  - path: /receipts/:id?replay=true
    method: GET
    paid: true
    pricing_tier: audit-replay
    price_usdc: 0.01
    available_in: v0.2.0
    description: Re-verifies signature and on-chain settlement against current chain state.
  - path: /compliance-export
    method: POST
    paid: true
    pricing_tier: compliance-export
    price_usdc: "0.50 single, 2.00 bundle <=100, negotiated >100"
    available_in: v0.3.0
    description: Signed multi-receipt CSV/JSON bundle.
```

Paid endpoints respond `402 Payment Required` with x402 payment requirements pointing at TrustBench's revenue wallet on Base. The agent signs an EIP-3009 `transferWithAuthorization` for the listed price and retries with an `X-PAYMENT` header. Settlement runs through the public x402 facilitator at `x402.org/facilitator`; TrustBench never holds funds. Differentiated-work paid responses (routing, scoring, verification, audit replay) are Ed25519-signed and verifiable with `@trustbench/verify-receipt` or the reference verifier in the repo. Existing partner agreements override the published table for that partner.

The v0.1.0 paywall is rolling out behind a feature flag; until the flag flips, `POST /route` continues to use the existing Bearer-`tb_live_…` auth path described above. When the flag flips, both auth paths will coexist during the transition window. Watch `/pricing` and `/.well-known/trustbench.json` for the canonical live state.

## Service discovery

For service discovery itself, defer to Agentic Market. TrustBench does not fork the discovery surface, it routes against providers it has independently probed for liveness and signed scores for. The full ranked list per capability is at `https://trustbench.io/rankings?capability=<capability>` (no auth required), with each provider's signed scorecard.

To add a provider to TrustBench's registry, the provider self-attests with TrustBench's pay-to-list bond. See `https://trustbench.io/methodology` for the current registry policy. Pay-to-list, never pay-to-rank.

## Common issues

| Symptom | Cause | Fix |
| --- | --- | --- |
| Quote returns 401 | API key missing or wrong | Pass `Authorization: Bearer tb_…`. Phase 4 keys start with `tb_live_`. |
| Quote returns 409 `idempotency_key_reused_with_different_body` | Same key sent with a different body | Either replay the original body (intentional retry) or generate a new idempotency key (new logical request). |
| Settle returns 410 `route_id_expired` | Quote validity window (5 minutes) closed before settle | Re-quote and settle promptly. Quote validity is intentionally short. |
| Settle returns 502 `provider_settlement_missing` | Merchant did not return a tx_hash on the response | TrustBench will not issue a receipt without a settlement reference. Retry, or pick a fallback provider. No money has moved. |
| Receipt verifies, but `--check-chain` fails | Block reorg or RPC mismatch on the verifying side | The receipt's signature still proves what TrustBench observed at issuance. Use a different RPC endpoint for the chain check or wait for the chain head to stabilize. |

## If you need more

- Methodology, what the probe does and does not measure: `https://trustbench.io/methodology`
- Public scoring rankings: `https://trustbench.io/rankings?capability=search`
- Public key for receipt verification: `https://trustbench.io/.well-known/trustbench-pubkey`
- Machine-readable manifest of TrustBench's surfaces: `https://trustbench.io/.well-known/trustbench.json`
- LLM-grounded reference: `https://trustbench.io/llms.txt`
- CDP docs (the underlying x402 stack): `https://docs.cdp.coinbase.com/llms.txt`
- Agentic Market agent guide: `https://agentic.market/llms.txt`
- Strategy and roadmap: `https://github.com/trustbench/trustbench` (README and `TrustBench-strategy.md`)
- Phase 4 API access: direct message @TrustBench on X to request a key.
gs?capability=search`
- Public key for receipt verification: `https://trustbench.io/.well-known/trustbench-pubkey`
- Machine-readable manifest of TrustBench's surfaces: `https://trustbench.io/.well-known/trustbench.json`
- LLM-grounded reference: `https://trustbench.io/llms.txt`
- CDP docs (the underlying x402 stack): `https://docs.cdp.coinbase.com/llms.txt`
- Agentic Market agent guide: `https://agentic.market/llms.txt`
- Strategy and roadmap: `https://github.com/trustbench/trustbench` (README and `TrustBench-strategy.md`)
- Phase 4 API access: direct message @TrustBench on X to request a key.
