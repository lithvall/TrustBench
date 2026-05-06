## Project

TrustBench is a solo-founder project evolving from a public **registry + live telemetry** for x402 (and eventually p402) providers into a **non-custodial smart router and payment-plumbing layer for agents and agent builders**.

The honest framing — and what the public site should reflect — is:

- **Today**: a registry of x402-style endpoints with nightly liveness/latency telemetry and signed scorecards. It is *not* a benchmark in the rigorous sense (the prober does HEAD-request liveness from one host, sampled three times, and treats 401/402/403/404/405/429 as "alive"). The methodology must be stated honestly anywhere the data is published.
- **Next**: a hosted, non-custodial `/route` endpoint where the agent authorizes a payment, TrustBench constructs the x402 transaction, the agent signs it, TrustBench routes to the best provider, and a signed receipt is returned. Think "OpenRouter for x402, protocol-agnostic across x402 and p402."
- **Moat**: policy firewall (idempotency, hard spend caps, allow/deny, kill switches), receipt + queryable audit layer (signed receipt + call metadata + settlement reference + replayable audit path — spec validated by @InfopunksHQ on 2026-04-30), and eventually p402/Canton coverage for the enterprise-agent side. Revenue: **flat per-tx fee + policy subscription + (refundable, pay-to-list) provider verification bond**. The 1–3% routing spread that earlier drafts anchored on was rejected by builders during Phase 2 validation — flat-per-tx + subscription is the validated direction. Never pay-to-rank.

The full diagnosis, scoring fix, honest reassessment, and phased plan live in `TrustBench-strategy.md` — that document is the source of truth for direction; this file is the working agreement for *how* we build against it.

**If you are picking up TrustBench in a new session, read `phase4-kickoff.md` first.** Phase 3 closed 2026-05-04 (sign-off in `lessons.md`). `phase4-kickoff.md` is the new entry-point — it captures Phase 3's final state, the new Infopunks intel from 2026-05-04, the proposed Phase 4 priority reweighting, and decision points to ask the user before committing. `phase3-closeout.md` remains the authoritative reference for what shipped in Phase 3 and the full original Phase 4 plan. `phase3-handoff.md` is historical only.

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

**Anti-Hallucination & Verification Rules (Anthropic Prompting 101)**  
- Always read the current file with the `read_file` tool *before* proposing any edit or claiming knowledge of its contents.  
- When diagnosing a bug or failure, first point at the exact logs, error messages, line numbers, or command output — then propose the fix.  
- Never assume a file, function, env var, or behavior exists. Verify with tools or commands (`npm run pipeline`, `tsc --noEmit`, `ls`, `cat`, etc.).  
- For any claim about "current state" or "what the code does," run the relevant command and show the output before moving on.  
- If something feels hacky or unclear, pause and ask — do not implement an elegant-sounding but unverified solution.

## Workflow

- Apply the solo-founder lens to every change: "How do we keep this 100% automated and simple?"
- Conventional commits (`feat:`, `fix:`, `chore:`, `docs:`).
- Test locally with `npm run pipeline` and check the live `/analytics` page after every push that touches probing or scoring.
- Prefer small, shippable PRs over big refactors.
- When in doubt — especially anything that touches payment construction, signing keys, or public framing — ask before implementing.
- Each phase below is independently shippable. If a phase doesn't validate (e.g. no builder interest in Phase 2), the previous phase still stands as a usable product.

### AI Collaboration Workflow (how Claude works with you)

**Roles** *(updated 2026-05-04 — Grok no longer touches code)*
- **Claude** designs *and* implements. Reads the canonical design doc, writes the diff, runs `tsc --noEmit` + relevant smoke tests, self-reviews, ships.
- **Grok** is for X posts and X-platform research only — partnership scouting, builder discovery, monitoring conversation around x402/p402 agent payments, drafting tweets. Grok does not edit, propose, or review code, schemas, or signing logic.
- **The user (Johan)** approves direction before non-trivial work, restores backups when the workspace gets into a weird state, and makes the final call on anything public-facing or partnership-bound.

**Response Structure for Any Non-Trivial Task (3+ steps or architectural)**
Always follow this exact order (mirrors Anthropic's recommended prompt structure):

1. **Plan** — Write a clear, numbered plan *before* any code or file changes. If the plan changes mid-task, stop and re-plan.
2. **Implementation** — Use `Edit`, `Write`, or `bash` with exact, minimal diffs. Include clear comments in all new code. For high-risk surfaces (see below) state the spec doc you're implementing against in the plan and re-state it as a header comment at the top of the diff.
3. **Verification** — Run the relevant commands (`tsc --noEmit`, `npm run pipeline`, `npm run dev`, smoke-test scripts), show the output, prove correctness. Ask: *"Would a staff engineer approve this in production?"* For high-risk surfaces, also: *"What's the worst this could do if I got the wire shape wrong, and what would the failure mode look like?"*
4. **Next Steps** — State what should happen next, any open questions, and whether this phase is shippable.

**High-risk surfaces — extra care, not extra people**
The previous workflow round-tripped the following through Grok before merging. With the new rule, Claude implements them directly — but with explicit extra discipline:

- Signing (Ed25519, argon2id, JCS canonicalization, EIP-712 typed-data hashing)
- Payment construction (x402 tx assembly, X-PAYMENT header building, X-PAYMENT-RESPONSE parsing, settlement checks)
- Idempotency lock semantics
- Spend cap enforcement
- Receipt emission

For any change touching one of these:
- Read the canonical design doc *before* coding (e.g. `phase3-x402-construction.md`, `phase3-spend-caps.md`, `phase3-idempotency-design.md`, `receipt-spec-v1.md`). Cite it in the plan.
- Write a short *failure mode* paragraph in the diff comments: "If this is wrong, what breaks, and how would we notice?"
- Smoke-test against the local mock provider (`scripts/mock-provider.ts`) before declaring done.
- After shipping, add an entry to `lessons.md` describing what was tricky and what to watch for next time.

**Pre-fill style**: When a response involves code changes, start with the Plan section already structured so the user can interrupt or redirect cleanly before any disk writes.

**Autonomous Bug Fixing**
Given a bug report or failing test, just fix it. Point at logs/errors first, then resolve them without requiring hand-holding from the user.

**Simplicity First + Minimal Impact**
Make every change as simple as possible. Only touch what's necessary. Avoid introducing new complexity or bugs. If a fix feels hacky, pause and implement the elegant, maintainable solution instead.

**Lessons Learned Loop**
After any correction or user feedback, append to `lessons.md` with the pattern so we never repeat the same mistake. Review relevant lessons at the start of each new session.

**Prompting Style**
For complex tasks, internally apply Anthropic's 6-element structure: (1) Role/Context, (2) Background/Static info from this file, (3) Step-by-step instructions, (4) Examples if helpful, (5) Anti-hallucination reminders, (6) Exact output format. Elements 2, 5, and 6 live permanently in this `CLAUDE.md`.

**What Grok is for**
- Drafting daily / weekly X posts (TrustBench updates, partnership announcements, milestone posts)
- Scouting partnerships on X — agent builders, x402 providers, MCP middleware authors, complementary infrastructure
- Monitoring conversation around x402, p402, AP2, MPP, agent payments, agentic infrastructure
- Pulling in fresh context the user can hand back to Claude (e.g. "Grok found this builder, here's the thread, draft an outreach reply") — but the reply itself, the code, and any decision is Claude's responsibility
## Phased plan (mirrors `TrustBench-strategy.md`)

- **Phase 0 — Reframe public positioning (this week, ~1 hour).** Site copy + README go from "benchmark/rankings/scores" to "registry + live telemetry, router coming." Add a methodology page that names the probe behavior honestly. Cheaper now (no public users) than after launch.
- **Phase 1 — Stabilize the foundation (this week).** Percentile helper fix in `prober.ts` is **done** (linear interpolation in place). Ed25519 scorecard signing is **done** — `scorer.ts` signs with Ed25519 when `TRUSTBENCH_SIGNING_PRIVATE_KEY` + `TRUSTBENCH_SIGNING_PUBLIC_KEY` are set, falls back to HMAC-SHA256 with a boot-time warning when they are not. Public key served at `/.well-known/trustbench-pubkey`; reference verifier in `scripts/verify-scorecard.js`. Still pending in Phase 1: generate the production keypair, paste it into Railway env vars, and confirm `/rankings`/`/route`/`/rankings/paid` return current data with `signature_alg: ed25519`.
- **Phase 2 — Validate before building — DONE (2026-04-30).** Three real conversations completed (r/AI_Agents x3 + @InfopunksHQ X thread) plus ≥1 written expression of interest. Verbatim quotes in `# Phase 2 — Builder Conversations.md`; competitive map in `# Competition Analysis — Recent Rev.md`. Key findings:
  - The **1–3% routing spread was explicitly rejected** by builders (incl. SpendGate's founder: "a big no no for a lot of people"). Flat-per-tx or subscription is the validated direction.
  - Top **unprompted** pain points: idempotency (duplicate pay-retry under partial timeouts — "one missing request fingerprint and your agent buys the tool three times"), hard spend caps, signed receipts, queryable audit trail.
  - @InfopunksHQ gave a concrete receipt spec — *signed receipt + call metadata + settlement reference + replayable audit path* — and is a likely first design partner. Their trust layer (intelligence brain) is complementary to TrustBench's router (payment plumbing); the two are partners, not competitors.
  - Competitive lane is open: **lightweight, non-custodial, MCP-native plumbing** — Infopunks (intelligence), SpendGate (proxy/governance), AgentlyHQ (framework) all occupy adjacent but different slices.
- **Phase 3 — Minimal non-custodial router for one capability (2–3 weeks).** Single endpoint `/route?capability=search&max_price=0.01`. Agent submits capability request + payment authorization → TrustBench constructs x402 tx → agent signs → TrustBench executes routing using live scores + real paid probing ($10–20/mo for actual API calls) → returns result + Ed25519-signed receipt. One capability, 2–3 real providers, end-to-end. Non-custodial throughout. **Phase 2 validation requires four primitives to lead this phase rather than be deferred to Phase 4:**
  1. **Idempotency keys on `/route`** so partial-timeout retries can't double-charge.
  2. **Hard spend caps** enforced server-side per agent + per call.
  3. **Ed25519-signed receipts** containing call metadata + settlement reference (tx hash + chain).
  4. **`/receipts/:id` queryable audit endpoint** so agents can replay the trail.

  Pricing: flat per-tx fee (e.g. $0.001–$0.01 per routed call), not a percentage spread. Keep @InfopunksHQ in the loop on the receipt schema before locking it in.
- **Phase 4 — Layer on revenue (after first paid calls).** Policy firewall as a $20–100/mo subscription — building on the Phase 3 base (idempotency + hard spend caps already shipped) with the higher-touch controls: kill switches, allow/deny lists, optional human-in-the-loop confirmation, signed webhook alerts. Refundable provider verification bond (pay-to-list, never pay-to-rank). Receipt/accounting export (CSV/ledger; the signed audit trail itself is already in Phase 3).
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
- Revenue must come from usage-based **flat-per-tx fees** and simple subscriptions — never %-spread routing fees (rejected in Phase 2 validation 2026-04-30) and never complex enterprise sales motions.
- Keep the public registry/dashboard useful and honest while the router is being built. The registry is the front door until the router earns the spotlight.
