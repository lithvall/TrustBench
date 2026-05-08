# TrustBench

A cross-network, non-custodial smart router and payment-plumbing layer for
x402 agents. Routes Base today, registers Solana endpoints (Heurist Mesh,
Pay.sh skills), Solana settlement next; protocol-agnostic over time across
x402, p402, and MPP.

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

## What we don't do
- We never hold agent funds, never submit transactions on-chain, never act as
  a payment facilitator. Agents sign EIP-3009 transferWithAuthorization
  payloads; providers submit them on-chain and pay gas. TrustBench observes
  the resulting tx_hash and records it in a signed receipt.

## Pricing model
- x402-native paywalled API endpoints, per-call USDC settlement on Base
- No subscriptions, no contracts, no per-seat or per-month charge
- Specific per-call tiers are in active validation with first integration
  partners and not yet published. Reviewable based on real volume.
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
- `GET /mcp/tools` — MCP tool descriptors for agent integrations
- `GET /analytics` — plain HTML dashboard
- `GET /methodology` — full description of what the probe does and does not measure
- `GET /skill.md` — agent skill file in the [agentic.market/skill.md](https://agentic.market/skill.md) format. Paste into Claude Code, Codex, Gemini CLI, Hermes, Cursor, Claude Desktop, Cherry Studio, or ChatGPT to teach the agent the TrustBench quote/settle flow as an additive policy + receipt layer on top of Coinbase Agentic Wallet.
- `GET /llms.txt` — LLM-grounded research summary in [llmstxt.org](https://llmstxt.org) format
- `GET /.well-known/trustbench.json` — machine-readable manifest of TrustBench's public surfaces, capabilities, signing scheme, and discovery references
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


