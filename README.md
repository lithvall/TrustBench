# TrustBench

Verify that x402 payments settled on-chain and get cryptographically signed
proof. POST `/verify` with a receipt ID or raw envelope to confirm Ed25519
signature validity + on-chain settlement on Base, no trust required.

Also routes paid x402 calls with server-side spend caps, idempotency, and a
fail-safe paywall (agent isn't charged when the upstream merchant is
non-conformant). Non-custodial: TrustBench never holds funds. Every paid
call emits an Ed25519-signed receipt verifiable offline against a published
public key.

Cross-network: routes Base today, registers Solana endpoints (Heurist
Mesh, Pay.sh skills), Solana settlement next.

## What's live today
- Public registry of x402 endpoints across Base (Coinbase Agentic Market,
  ~650 services) and Solana (Heurist Mesh, ~150 endpoints) — Solana inventory
  is in the database today and surfaces on `/rankings` once the network
  filter is dropped (P4-3a, see `phase4-p4-3-timing.md`)
- Nightly liveness probe (HEAD requests from a single cloud host, 3 samples per
  provider, statuses 200/201/204/401/402/403/404/405/429 treated as alive)
- Score derivation: 15 + 45·successRate + 35·latencyHealth + 3·consistency,
  clamped to [40, 98], via linear-interpolation percentiles
- Ed25519-signed scorecards, public key at /.well-known/trustbench-pubkey
- Routing and settlement on Base + USDC (Phase 3); Solana is roadmap (P4-3)
- Methodology disclosure at /methodology

## Phase 3 + 4 (live since 2026-05-04 / 2026-05-06)
- Authenticated POST /route endpoint with API-key auth (argon2id), idempotency
  keys, hard spend caps, and Ed25519-signed receipts
- /route/settle endpoint forwarding agent-signed EIP-3009 authorizations
- Queryable audit at /receipts/:id
- Strict reservation-based spend caps (P4-7)
- Discovery surfaces: /skill.md, /llms.txt, /.well-known/trustbench.json
- First paid x402 receipt against a real provider, settled on Base 2026-05-06:
  [rcpt_01KQY7C44GAPSXZPFQYRZ1D10C](https://trustbench.io/receipts/rcpt_01KQY7C44GAPSXZPFQYRZ1D10C)
  — verifies SIGNATURE VALID + ON-CHAIN VERIFIED with no overrides.

## In flight (Phase 4b)
- x402-paywalled API endpoints (per-call USDC pricing surface)
- Public receipt explorer at /explorer
- Formal partner integrations
- Solana routing (registry pre-built, network filter to drop)
- npm verifier package `@trustbench/verify-receipt`

## Claude Desktop / MCP

TrustBench ships a native MCP server so agents in Claude Desktop, Claude Cowork, ChatGPT, or Cherry Studio can look up providers, fetch receipts, and verify signatures without any HTTP-fetch workaround.

Add to `claude_desktop_config.json` (or your host's equivalent MCP settings file):

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

Restart the host app after saving. Three tools become available:

- **get_rankings** — scored providers by capability. No API key.
- **get_receipt** — fetch any receipt by ID (`rcpt_…` / `rrcpt_…`). No API key.
- **verify_receipt** — confirm Ed25519 signature + on-chain status. No API key.

Routing tools (`route_quote`, `route_settle`) require a `tb_live_…` API key and ship in the next MCP release. Request access by DM'ing @TrustBench on X.

## What we don't do
- We never hold agent funds, never submit transactions on-chain, never act as
  a payment facilitator. Agents sign EIP-3009 transferWithAuthorization
  payloads; providers submit them on-chain and pay gas. TrustBench observes
  the resulting tx_hash and records it in a signed receipt.

## Pricing model
- x402-native paywalled API endpoints, per-call USDC settlement on Base
- No subscriptions, no contracts, no per-seat or per-month charge
- v0.1.0 ships `POST /route` at $0.005 per call (score-provider tier); full
  tier table at [/pricing](https://trustbench.io/pricing) (HTML for humans,
  JSON for agents via `Accept: application/json` or `?format=json`)
- Settlement through the Coinbase CDP facilitator at
  `api.cdp.coinbase.com/platform/v2/x402` (the public `x402.org/facilitator`
  is testnet-only). TrustBench never holds funds; the agent's wallet
  signs and the facilitator submits on-chain.
- Existing partner agreements override the published table for that partner.
  Reach out for partner-volume credit before integration.
- Refundable provider verification bond — pay-to-list, never pay-to-rank

## Stack

TypeScript + Hono (API) + Supabase (Postgres + RLS) + ioredis (Upstash Redis cache) + tsx runtime. Deployed on Railway. Nightly probe pipeline + autonomous X posting via GitHub Actions.

## Quick start

```bash
npm install
cp .env.example .env   # fill in Supabase + Upstash credentials
npm run pipeline       # probe + score (writes to Supabase)
npm run dev            # run the API locally
```

## Endpoints

Public (no auth):

- `GET /health` — liveness check for the API itself
- `GET /rankings?capability=search` — ranked providers for a capability (`search`, `inference`, `data`)
- `GET /rankings/paid?capability=search` — same as `/rankings` but with each provider's signed scorecard
- `GET /route?capability=search` — current best provider + fallback (legacy read-only — the Phase 3 routing surface is `POST /route`)
- `GET /mcp/tools` — MCP tool descriptor catalog (JSON schema). For native tool use, see the Claude Desktop / MCP section above.
- `GET /analytics` — plain HTML dashboard
- `GET /methodology` — full description of what the probe does and does not measure
- `GET /skill.md` — agent skill file in the [agentic.market/skill.md](https://agentic.market/skill.md) format. Paste into Claude Code, Codex, Gemini CLI, Hermes, Cursor, Claude Desktop, Cherry Studio, or ChatGPT to teach the agent the TrustBench quote/settle flow as an additive policy + receipt layer on top of Coinbase Agentic Wallet.
- `GET /llms.txt` — LLM-grounded research summary in [llmstxt.org](https://llmstxt.org) format
- `GET /pricing` — public, honest pricing for paid endpoints. Content-negotiated: HTML for humans, JSON for agents via `Accept: application/json` or `?format=json`. Returns a 7-row tier table with `live` / `planned (v0.2.0)` / `planned (v0.3.0)` status badges per endpoint.
- `GET /.well-known/trustbench.json` — machine-readable manifest of TrustBench's public surfaces, capabilities, signing scheme, and discovery references. Includes an `endpoints` array with paid annotations matching `/pricing`.
- `GET /.well-known/trustbench-pubkey` — Ed25519 public key (PEM) for verifying scorecards and receipts

Authenticated (Phase 3, in build):

- `POST /route` — quote step. `Authorization: Bearer tb_…`, `Idempotency-Key: <16–128 chars>`, body `{capability, max_price (atomic-unit string), payer_address}`. Returns `{route_id, payment_required, expires_at, fallback_provider}`. Quote validity is 5 minutes; settling after that returns 410.
- `POST /route/settle` — settle step. Body `{route_id, signature}` where `signature` is the agent's EIP-3009 `transferWithAuthorization` signature. Returns `{response, receipt}` plus `X-Receipt-Id` header. Idempotent on `(route_id, signature)`: replays return `x-idempotent-replay: true` with the cached receipt and never re-call the merchant.
- `GET /receipts/:id` — public, no-auth, immutable. Returns the exact signed envelope (`{receipt, signature}`) that was issued. `Cache-Control: public, max-age=86400, immutable`.

## Verifying a receipt

Receipts are Ed25519-signed over the JCS-canonicalized form of `envelope.receipt`. The `signature` block (including `public_key_url`) is detached and not part of the signed bytes, so it can be overridden at verification time without invalidating the chain of trust.

Reference verifier: `scripts/verify-receipt.js`.

```bash
# By id, against a deployed instance
npm run verify-receipt -- rcpt_01HV3K8M5C9X2ZBFYR4QWP8ND1 https://your.trustbench.deployment

# From a saved JSON file
node scripts/verify-receipt.js ./receipt.json

# Override pubkey URL when the receipt's public_key_url isn't reachable
# from your network (useful for local-dev verification of locally-issued receipts)
node scripts/verify-receipt.js ./receipt.json --pubkey-url http://localhost:3000/.well-known/trustbench-pubkey
```

## Failure semantics

**TrustBench down ≠ payments down.** This is an architectural property, not a feature flag.

The agent's payment authorization is an EIP-3009 signature it produces with its own key. The merchant accepts that signature and submits the on-chain transaction. TrustBench sits between them as a router and audit layer — it constructs the quote and records the result, but it never holds funds, never signs the payment, and never broadcasts the transaction.

If the TrustBench API is unavailable, an agent can still:
- Transact directly with any x402 provider it already knows about, using the same EIP-3009 signing flow.
- Submit and verify receipts after the fact (the verifier is a standalone script and the public key is served from `/.well-known/trustbench-pubkey`).

What it temporarily loses while the API is down:
- Routing decision (which provider scored best at this moment).
- Server-enforced spend caps (the agent must enforce caps locally if it cares).
- Signed receipts for any calls made during the outage.

Existing receipts remain verifiable — the public key and JCS canonicalization rules are stable, and the receipt's `audit_url` is a hint, not a dependency.

## Paywall (Phase 4 v0.1.0)

`POST /route` is paywalled when `TRUSTBENCH_PAYWALL_ENABLED=true` on the deployment. The flow is x402-native end-to-end:

1. Agent calls `POST /route` with no `X-PAYMENT` header.
2. TrustBench responds `402 Payment Required` with x402 payment requirements pointing at the TrustBench revenue wallet on Base. Price: $0.005 USDC.
3. Agent signs an EIP-3009 `transferWithAuthorization` for the routing fee and retries the call with an `X-PAYMENT` header carrying the signed envelope (use any x402 client; the modular `@x402/core` + `@x402/evm` SDKs are the reference).
4. TrustBench verifies the payment with the Coinbase CDP facilitator at `api.cdp.coinbase.com/platform/v2/x402`, settles it on-chain, selects the best provider via the live registry, and returns 200 with an Ed25519-signed routing receipt plus payment requirements for the agent's NEXT call (to the upstream provider).
5. The agent then pays the provider directly via a second x402 transaction. TrustBench is out of the loop after step 4.

Two payments per call (TrustBench fee + provider fee), both non-custodial. Receipts cover the routing decision; the provider transaction is a separate x402 envelope the agent owns end-to-end.

**Discovery.** Paid endpoints carry `paid: true` annotations alongside the free ones in [`/skill.md`](https://trustbench.io/skill.md) and [`/.well-known/trustbench.json`](https://trustbench.io/.well-known/trustbench.json). v0.2.0+ endpoints are listed with `available_in` tags so agent builders see the roadmap shape.

**Verifying a routing receipt.** Same Ed25519 + JCS canonicalization as Phase 3 settlement receipts, with `kind: "paid_response.route"`. Use the npm verifier:

```bash
npm install @trustbench/verify-receipt
trustbench-verify-receipt ./routing-receipt.json
trustbench-verify-receipt ./routing-receipt.json --check-chain   # also re-verify the on-chain tx
```

**Server-side controls (v0.1.1).** Two safeguards run on every paywalled call:

- **Per-paying-wallet hourly rate limit.** Default 60 paid calls per hour per `agent_address`. Tunable via `TRUSTBENCH_PAYWALL_HOURLY_LIMIT` (set to 0 to disable). Returns 429 with `Retry-After: 60` when exceeded.
- **Idempotency-key replay with `replayed_at` marker.** `Idempotency-Key` header (16-128 chars) honored on every paywalled call. Same key + same body within 24 hours returns the original signed receipt with a top-level `replayed_at` field added outside the signed bytes — original signature stays valid, downstream consumers can distinguish fresh from replayed. Same key + different body returns 409.

**Failure modes.** Documented in detail in the Critic-pass header at the top of [`src/paywall-handler.ts`](./src/paywall-handler.ts). Live facilitator is the Coinbase CDP facilitator at `api.cdp.coinbase.com/platform/v2/x402`; the original "Foundation facilitator first, swap to CDP later" plan was disproven on 2026-05-11 when settle-tests confirmed the Foundation facilitator is testnet-only (see `lessons.md` 2026-05-11 entry). Current hidden assumption: CDP facilitator stays stable and within plan limits. Kill criterion: if CDP returns 5xx or auth-errors >5% of calls in the first 4 weeks, fall back to PayAI-mediated settlement.

## What Phase 3 deliberately does not do

These are limits in the current implementation, called out so consumers don't infer behavior the system doesn't actually deliver:

- **Single-merchant routing.** `POST /route` serves one capability against one selected provider per call. Multi-merchant fan-out (one intent → multiple paid APIs → one envelope) is Phase 4.
- **Receipt content is not yet on-chain anchored.** Receipts are Ed25519-signed by TrustBench. They are not Merkle-batched into a public blockchain. On-chain anchoring is a Phase 5 consideration if real demand surfaces.
- **Single-chain settlement today.** Routing + settlement is Base + USDC. Solana inventory is registered but not yet routable (P4-3 next).

## Methodology disclosure

The probe is a HEAD-request liveness check from a single host, three samples per provider per night. Status codes 200, 201, 204, 401, 402, 403, 404, 405, and 429 are treated as alive (the provider is responding; only the auth/payment gate is closed).

This is not a benchmark in the rigorous sense. Latency is wall-clock from a single network vantage. Score `latencyHealth` is derived from linear-interpolation percentiles across the cohort — useful as a relative signal, not as a service-level claim. Full description at `/methodology`.

## License

MIT.


