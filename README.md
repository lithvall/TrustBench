# TrustBench

A public **registry of x402-style endpoints with nightly liveness telemetry and signed scorecards** — and the foundation for a non-custodial smart router and payment-plumbing layer for agents.

Built and maintained by a solo founder. Everything in this repo is designed to be run by one person with zero manual daily work.

## What this is (and what it isn't)

**Today, TrustBench is a registry with telemetry, not a benchmark.**

What we actually measure:

- A nightly probe runs from one cloud host (GitHub Actions) and sends three sequential requests per provider.
- Each request is a `HEAD` (with `GET` fallback on 405) with an 8-second timeout.
- Status codes `200, 201, 204, 401, 402, 403, 404, 405, 429` are treated as "endpoint is alive."
- We compute reliability (success rate over the three samples), p50/p95 latency over successful samples only, and a small consistency bonus from inter-sample jitter.
- Scores are clamped to the range 40–98 and signed.

This is essentially a liveness check. It does **not** execute payments, validate that the API returns useful results, or characterize behavior under load. We're up-front about that — see `/methodology` on the live deployment for the full breakdown.

What's coming next: a hosted, non-custodial `/route` endpoint where an agent authorizes a payment, TrustBench constructs the x402 transaction, the agent signs it, TrustBench routes to the best provider, and a signed receipt is returned. Think "OpenRouter for x402, protocol-agnostic across x402 and p402." See `TrustBench-strategy.md` for the full plan.

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

- `GET /health` — liveness check for the API itself
- `GET /rankings?capability=search` — ranked providers for a capability (search, inference, data)
- `GET /route?capability=search` — current best provider + fallback (router endpoint will accept payment authorizations in a future phase)
- `GET /rankings/paid?capability=search` — same as `/rankings` but with signed scorecards
- `GET /mcp/tools` — MCP tool descriptors for agent integrations
- `GET /analytics` — plain HTML dashboard
- `GET /methodology` — full description of what the probe does and does not measure

## Status (April 2026)

- Roughly 20 known x402-style endpoints seeded and probed nightly.
- Scoring formula: `15 + 45·successRate + 35·latencyHealth + 3·consistencyBonus`, clamped 40–98.
- Latency percentiles use linear interpolation over successful probes only (timeouts hit reliability, not latency).
- Scorecards are currently signed with HMAC-SHA256 (internal-integrity only). Migration to Ed25519 with a published public key is the next foundation task — that's the point at which third parties will be able to verify signatures independently.

## Roadmap

The full plan, including the honest reassessment of what the data does and doesn't support, lives in [`TrustBench-strategy.md`](./TrustBench-strategy.md). Short version:

1. **Phase 0** — honest public framing (this README, methodology page).
2. **Phase 1** — Ed25519 signing, percentile fix (done), end-to-end scorecard validation.
3. **Phase 2** — talk to real x402 builders before writing router code.
4. **Phase 3** — minimal non-custodial `/route` for one capability, returning a signed receipt.
5. **Phase 4** — policy firewall, refundable provider verification bond, receipt/accounting export.
6. **Phase 5** — p402 / Canton expansion.

## License

Source-available, license TBD. If you want to use any of this in something serious, open an issue first.
