## Project

TrustBench is a solo-founder project evolving from a public **registry + live telemetry** for x402 (and eventually p402) providers into a **non-custodial smart router and payment-plumbing layer for agents and agent builders**.

The honest framing — and what the public site should reflect — is:

- **Today**: a registry of x402-style endpoints with nightly liveness/latency telemetry and signed scorecards. It is *not* a benchmark in the rigorous sense (the prober does HEAD-request liveness from one host, sampled three times, and treats 401/402/403/404/405/429 as "alive"). The methodology must be stated honestly anywhere the data is published.
- **Next**: a hosted, non-custodial `/route` endpoint where the agent authorizes a payment, TrustBench constructs the x402 transaction, the agent signs it, TrustBench routes to the best provider, and a signed receipt is returned. Think "OpenRouter for x402, protocol-agnostic across x402 and p402."
- **Moat**: policy firewall (spend limits, allow/deny, kill switches), receipt + accounting layer, and eventually p402/Canton coverage for the enterprise-agent side. Revenue: 1–3% routing spread + policy subscription + (refundable, pay-to-list) provider verification bond. Never pay-to-rank.

The full diagnosis, scoring fix, honest reassessment, and phased plan live in `TrustBench-strategy.md` — that document is the source of truth for direction; this file is the working agreement for *how* we build against it.

## Stack

TypeScript + Hono (API) + Supabase (Postgres + RLS) + ioredis (Upstash Redis cache) + tsx runtime. Deployed on Railway. GitHub Actions for the nightly probe/score pipeline and autonomous X posting.

## Commands

- Dev: `npm run dev` (tsx watch on `src/index.ts`)
- Pipeline (probe + score): `npm run pipeline` (runs `src/prober.ts`)
- Crawl providers: `npm run crawl` (runs `src/crawler.ts`)
- Start (Railway): `npm start` → `tsx src/index.ts`
- Type check: `tsc --noEmit`

## Architecture

- `src/` → all source code that ships
  - `index.ts` — Hono server + routes (`/health`, `/rankings`, `/route`, `/rankings/paid`, `/mcp/tools`, `/analytics`)
  - `prober.ts` — HEAD-based liveness probing + new realistic scoring (15 + 45·successRate + 35·latencyHealth + 3·consistency, clamped 40–98) with linear-interpolation percentiles
  - `crawler.ts` — CDP discovery API with hard-coded fallback list of ~20 providers
  - `scorer.ts` — rankings reads with Redis cache + Ed25519 scorecard signing (HMAC-SHA256 fallback when Ed25519 keys are not configured). Public key served at `/.well-known/trustbench-pubkey`. Generate keys with `npm run keygen`; verify a scorecard with `npm run verify-scorecard`.
  - `types.ts` — shared TS types
- `.github/workflows/` — `nightly-pipeline.yml` (cron probe+score), `pipeline.yml` (older crawl+probe duplicate — see Known Cleanups), `post-to-x.yml` (daily autonomous post)
- `scripts/post-to-x.js` — daily X post (currently static copy; will need to align with new framing)
- `schema.sql` — current minimal schema in use (providers / probes / scorecards, RLS public read)
- `supabase/schema.sql` — older schema with EIP-712 trigger machinery; **not in use**, kept as reference only
- Root files: `package.json`, `tsconfig.json`, `.env.example`, `railway.json`, `Dockerfile`, `README.md`, `TrustBench-strategy.md`
- Root-level `index.ts` and `run-crawler.ts` are legacy scratch files — not part of the deployed surface (see Known Cleanups)

## Rules

- Maximum automation, zero manual daily work. Always.
- Keep every solution simple and production-ready for one solo founder to maintain.
- Always include clear comments in code.
- Use PowerShell command syntax when giving the user shell commands (Windows host).
- No external paid services or heavy dependencies without explicit approval.
- **Non-custodial only.** TrustBench never holds agent funds. The agent authorizes and signs; we construct and route. Custody is the regulatory landmine — do not touch it.
- **Honest measurement framing everywhere.** The current prober is a liveness check, not a benchmark. Site copy, README, X posts, and any public artifact must say what we actually measure (HEAD probe from one host, 3 samples, 4xx/429 treated as alive). Avoid the words "benchmark," "ranking authority," or "reputation oracle" in public copy until the underlying measurement justifies them.
- **Public scorecard signatures must be verifiable by third parties.** HMAC-SHA256 with a shared secret is internal-integrity only. Migrate signing to Ed25519 with a published public key before anyone outside TrustBench is asked to verify a scorecard.
- Pay-to-list, never pay-to-rank. Routing decisions are measurement-based, period.

## Workflow

- Apply the solo-founder lens to every change: "How do we keep this 100% automated and simple?"
- Conventional commits (`feat:`, `fix:`, `chore:`, `docs:`).
- Test locally with `npm run pipeline` and check the live `/analytics` page after every push that touches probing or scoring.
- Prefer small, shippable PRs over big refactors.
- When in doubt — especially anything that touches payment construction, signing keys, or public framing — ask before implementing.
- Each phase below is independently shippable. If a phase doesn't validate (e.g. no builder interest in Phase 2), the previous phase still stands as a usable product.

## Phased plan (mirrors `TrustBench-strategy.md`)

- **Phase 0 — Reframe public positioning (this week, ~1 hour).** Site copy + README go from "benchmark/rankings/scores" to "registry + live telemetry, router coming." Add a methodology page that names the probe behavior honestly. Cheaper now (no public users) than after launch.
- **Phase 1 — Stabilize the foundation (this week).** Percentile helper fix in `prober.ts` is **done** (linear interpolation in place). Ed25519 scorecard signing is **done** — `scorer.ts` signs with Ed25519 when `TRUSTBENCH_SIGNING_PRIVATE_KEY` + `TRUSTBENCH_SIGNING_PUBLIC_KEY` are set, falls back to HMAC-SHA256 with a boot-time warning when they are not. Public key served at `/.well-known/trustbench-pubkey`; reference verifier in `scripts/verify-scorecard.js`. Still pending in Phase 1: generate the production keypair, paste it into Railway env vars, and confirm `/rankings`/`/route`/`/rankings/paid` return current data with `signature_alg: ed25519`.
- **Phase 2 — Validate before building (next week, before any router code).** Talk to ≥3 agent builders working with x402. Three questions: does payment plumbing hurt enough to outsource? what's the most painful piece (discovery / signing / retries / spend limits / accounting)? would they accept a 1–3% routing spread? **Goal: at least one written expression of interest before Phase 3 starts.**
- **Phase 3 — Minimal non-custodial router for one capability (2–3 weeks).** Single endpoint `/route?capability=search&max_price=0.01`. Agent submits capability request + payment authorization → TrustBench constructs x402 tx → agent signs → TrustBench executes routing using live scores + real paid probing ($10–20/mo for actual API calls) → returns result + signed receipt. One capability, 2–3 real providers, end-to-end. Non-custodial throughout.
- **Phase 4 — Layer on revenue (after first paid calls).** Policy firewall as a $20–100/mo subscription (spend limits, kill switches, optional human-in-the-loop). Refundable provider verification bond (pay-to-list, never pay-to-rank). Receipt/accounting export (CSV/ledger, signed audit trail).
- **Phase 5 — p402 / Canton expansion (after the x402 path is stable and has at least one paying agent).** This is the moat-building phase; do not start until x402 is debugged and earning. Native p402 + KYB/identity attestations + settlement-finality semantics that map cleanly across protocols.

## Known cleanups (low priority, do as we touch the area)

- Root-level `index.ts` and `run-crawler.ts` are stale duplicates of `src/index.ts` and the crawler+prober pair. They reference `crawlBazaar` / `probeProvider` exports that don't exist in `src/` and use a `SUPABASE_SERVICE_ROLE_KEY` env var that's not in `.env.example`. Delete or quarantine when convenient.
- `.github/workflows/nightly-pipeline.yml` and `.github/workflows/pipeline.yml` both run the nightly job (one at 03:00 UTC, the other at 00:00 UTC, only the latter also runs `npm run crawl`). Consolidate to a single workflow that crawls *then* probes.
- `supabase/schema.sql` is the old EIP-712-flavored schema; the live one is `schema.sql` at the repo root. Either delete the old file or rename it to `schema.legacy.sql` and add a comment.
- README.md and prior `Claude.md` revisions had stray `\#` / `\##` escape artifacts. Always write Markdown without backslash-escaping headers.
- Daily X post (`scripts/post-to-x.js`) still uses "best x402 providers" copy. Soften to "live x402 telemetry + registry" once Phase 0 ships.

## Out of scope (don't touch without explicit approval)

- `.env` and any secret files.
- Railway dashboard settings.
- Full accounting UI or heavy frontend work — `/analytics` stays plain HTML for now.
- On-chain anchoring or EIP-712 typed-data signing — not until we explicitly decide we need it (Ed25519 with a published public key is the Phase 1 target, and that's enough).
- Any change that makes TrustBench custodial.

## Solo-Founder Principles

- Everything must be maintainable by one person with zero manual daily work.
- Prefer zero-cost MVP choices (3-sample probing, Redis cache, GitHub cron, Railway free/cheap tier).
- Revenue must come from usage-based micropayments and simple subscriptions — never complex enterprise sales motions.
- Keep the public registry/dashboard useful and honest while the router is being built. The registry is the front door until the router earns the spotlight.
