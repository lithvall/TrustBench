name: trustbench-policy-router
description: Verify that an x402 payment actually settled on-chain and get a cryptographically signed proof. POST /verify with a receipt ID or a raw receipt envelope and get back signature_valid + on_chain_verified booleans backed by Ed25519 + Base chain RPC, no trust required. Also routes paid x402 calls with server-side spend caps (hard budget per call or per day), idempotency (retries never double-charge), and a signed audit receipt on every call. Use when the agent just paid an x402 provider and needs proof it settled, when the user asks for a verifiable record of what the agent paid for, when the user mentions audit, compliance, governance, signed receipts, spend cap, budget cap, USDC cap, verify payment, check receipt, or non-custodial routing. Augments Coinbase Agentic Market / Agentic Wallet (Base) and Solana Foundation Pay.sh / Heurist Mesh (Solana) rather than replacing them. TrustBench never holds funds. The agent's wallet signs the payment authorization, the merchant settles on-chain, TrustBench observes the result and emits an Ed25519-signed receipt verifiable by anyone against the published public key.
---

# TrustBench: verify x402 payments settled on-chain, with signed proof

TrustBench does two things for agents making x402 payments:

1. **Verify payments.** POST /verify with a receipt ID or a raw receipt envelope. TrustBench checks the Ed25519 signature against its published public key AND confirms the transaction settled on Base via chain RPC. You get back `signature_valid` and `on_chain_verified` booleans, no trust required. Free, no auth.

2. **Route payments with guardrails.** POST /route to pay an x402 provider through TrustBench and get an Ed25519-signed receipt automatically. Includes server-side spend caps (hard budget per call or per day), idempotency (retries never double-charge), and a fail-safe paywall (if the upstream merchant is non-conformant, the agent isn't charged).

If the agent just needs to make a paid call with no verification or budget requirements, the existing Agentic Wallet flow at agentic.market/skill.md is enough. TrustBench adds value when the agent needs proof a payment settled, when the call is part of a budgeted workflow, or anywhere a verifiable record of "what was paid, to whom, for what" matters later.

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

TrustBench ships a native MCP server so agents running in Claude Desktop, Claude Cowork, ChatGPT, or Cherry Studio can look up providers, fetch receipts, and verify signatures without any HTTP-fetch workaround.

### Install TrustBench tools

Tell the user:

> TrustBench adds three tools to your agent: look up the best providers for a task, retrieve a payment receipt by ID, and verify that a receipt's signature is genuine. To add them, open your connected tools settings and paste this in.

Add to the user's `claude_desktop_config.json` (or equivalent MCP settings file for their host):

```json
{
  "mcpServers": {
    "trustbench": {
      "command": "npx",
      "args": ["-y", "@trustbench/mcp"]
    }
  }
}
```

After saving, restart the host app. The agent will have three new tools: `get_rankings`, `get_receipt`, and `verify_receipt`.

### Install on Grok

Grok uses a URL-paste flow instead of a config file. Tell the user:

> To add TrustBench to Grok, go to grok.com/connectors, click New Connector, choose Custom, paste `https://trustbench.io/mcp` as the URL, and save. The same three tools become available to Grok immediately. A paid Grok account is required.

### What the tools do

- **get_rankings** — returns scored providers for a capability (search, inference, data, media, infra). No API key needed.
- **get_receipt** — fetches a receipt by ID (`rcpt_…` or `rrcpt_…`). No API key needed.
- **verify_receipt** — confirms the Ed25519 signature on a receipt and surfaces the on-chain settlement status. No API key needed.

Routing tools (`route_quote`, `route_settle`) require a `tb_live_…` API key and are in the next MCP release. Until then, use the CLI path above for paid routing calls.

### Getting a TrustBench API key

Phase 4 is invite-only. The user requests a key by direct messaging @TrustBench on X.

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
    paid: false
    pricing_tier: free
    price_usdc: 0
    available_in: v0.1.0
    description: Verify an x402 receipt (Ed25519 signature + on-chain settlement). Two modes: lookup by receipt_id or offline with raw envelope. Free, no auth.
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

Paid endpoints respond `402 Payment Required` with x402 payment requirements pointing at TrustBench's revenue wallet on Base. The agent signs an EIP-3009 `transferWithAuthorization` for the listed price and retries with an `X-PAYMENT` header. Settlement runs through the Coinbase CDP facilitator at `api.cdp.coinbase.com/platform/v2/x402` (the public `x402.org/facilitator` is testnet-only and not used for mainnet Base traffic); TrustBench never holds funds. Differentiated-work paid responses (routing, scoring, verification, audit replay) are Ed25519-signed and verifiable with `@trustbench/verify-receipt` or the reference verifier in the repo. Existing partner agreements override the published table for that partner.

The v0.1.0 paywall is rolling out behind a feature flag; until the flag flips, `POST /route` continues to use the existing Bearer-`tb_live_…` auth path described above. When the flag flips, both auth paths will coexist during the transition window. Watch `/pricing` and `/.well-known/trustbench.json` for the canonical live state.

## Service discovery

For service discovery itself, defer to Agentic Market. TrustBench does not fork the discovery surface, it routes against providers it has independently probed for liveness and signed scores for. The full ranked list per capability is at `https://trustbench.io/rankings?capability=<capability>` (no auth required), with each provider's signed scorecard.

Registry inclusion is automatic and crawler-driven. TrustBench discovers Base-settled endpoints from the Coinbase Agentic Market catalog (`api.agentic.market/v1/services`) and Solana endpoints from the Heurist Mesh feed, then probes what it finds. There is no application, no fee, and no manual approval step on the TrustBench side: a provider listed in one of those upstream catalogs is picked up by the next nightly crawl. See `https://trustbench.io/methodology` for the current registry policy. Never pay-to-rank — routing decisions are measurement-based.

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
- Strategy and roadmap: `https://github.com/lithvall/TrustBench` (README and `TrustBench-strategy.md`)
- Phase 4 API access: direct message @TrustBench on X to request a key.
