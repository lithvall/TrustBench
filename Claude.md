## Project

TrustBench is a solo-founder project evolving from a public **registry + live telemetry** for x402 (and eventually p402) providers into a **non-custodial smart router and payment-plumbing layer for agents and agent builders**.

The honest framing — and what the public site should reflect — is:

- **Today**: a registry of x402-style endpoints with nightly liveness/latency telemetry and signed scorecards. It is *not* a benchmark in the rigorous sense (the prober does HEAD-request liveness from one host, sampled three times, and treats 401/402/403/404/405/429 as "alive"). The methodology must be stated honestly anywhere the data is published.
- **Next**: a hosted, non-custodial `/route` endpoint where the agent authorizes a payment, TrustBench constructs the x402 transaction, the agent signs it, TrustBench routes to the best provider, and a signed receipt is returned. Think "OpenRouter for x402, protocol-agnostic across x402 and p402."
- **Moat**: policy firewall (idempotency, hard spend caps, allow/deny, kill switches), receipt + queryable audit layer (signed receipt + call metadata + settlement reference + replayable audit path — spec validated by @InfopunksHQ on 2026-04-30), and eventually p402/Canton coverage for the enterprise-agent side. Revenue: **flat per-tx fee + policy subscription + (refundable, pay-to-list) provider verification bond**. The 1–3% routing spread that earlier drafts anchored on was rejected by builders during Phase 2 validation — flat-per-tx + subscription is the validated direction. Never pay-to-rank.

The full diagnosis, scoring fix, honest reassessment, and phased plan live in `TrustBench-strategy.md` — that document is the source of truth for direction; this file is the working agreement for *how* we build against it.

**If you are picking up TrustBench in a new session, read `partnership-day-record-2026-05-07.md` FIRST.** That file documents the strategic shift from "standalone-product searching for a wedge" to "component-in-stack with x402-paywalled API monetization" — driven by partnership inbounds from Infopunks, Strata (@stratamcp), and CLU_AGENT in a 48-hour window. It supersedes the prior strategy direction and contains the committed decision, draft partner replies, and revenue model. Then read `phase4-kickoff.md` for engineering state. `phase3-closeout.md` remains the authoritative reference for what shipped in Phase 3. `phase3-handoff.md`, `phase6-beyond-strategy.md`, and `phase6-reassessment-2026-05-07.md` are historical / context-only — read after the partnership-day record, not before.

**If picking up the QBT-Labs/x402 read or the x402-paywall design pass, read `phase4-qbt-and-paywall-handoff.md` after the partnership-day record.** That file contains the Reddit-thread context with Aggelos Kappos (`AngeloKappos`), the focused-read brief on `github.com/QBT-Labs/x402` (compose vs compete framing), and the 10 design questions for x402-paywalled endpoint revenue (with Strata-anchored pricing tiers and the non-custodial / no-subscription / solo-founder constraint list).

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
- `.github/workflows/` — `nightly-pipeline.yml` (single source of truth: crawl then probe at 03:00 UTC), `nightly-rollup-export.yml` (Paddock partner CSV: 7-night rollup written to `exports/rollup-latest.csv` + dated archive at 23:55 UTC daily, committed + pushed for Railway auto-deploy before Paddock's 00:05 UTC poll — added 2026-05-14), `pipeline.yml` (deprecated stub, no triggers, safe to delete from local clone), `paid-probe.yml` (live x402 paid probe job), `post-to-x.yml` (daily autonomous post, currently disabled until rotation is reviewed)
- `scripts/post-to-x.js` — daily X post (rewrite landed 2026-05-09: live registry pulse fetched from `/metrics/registry-summary` + methodology rotation + build-in-public). 7-day rotation, no em-dashes, fail-loud on missing env vars. Run with `--dry-run` to preview.
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

**Critic pass on high-risk diffs (added 2026-05-10).** Before shipping any high-risk-surface diff, ALSO produce a Critic-pass output using `prompts/critic.md`. The pass must produce:
- Three rejection reasons a hostile reviewer would give (specific, not vague pessimism)
- The strongest counter-thesis (case for the opposite approach)
- A named wedge competitor (real or hypothetical) who would beat this
- The hidden assumption that, if wrong, breaks the whole thesis
- A kill criterion: "if X is observed in Y weeks, abandon"
- Verdict: `strong-reject` / `weak-reject` / `acceptable` / `endorsed-after-stress-test`

If verdict is `strong-reject`, stop and ask Johan before continuing. Critic output goes in the PR description, the commit body, or as a comment block at the top of the primary changed file. This step is non-negotiable for high-risk surfaces — it's what catches the "Dreamer + Main groupthink" failure mode that pure self-review misses.

**Decision Journal capture + callback (added 2026-05-11).** Every non-trivial decision (phase boundaries, pricing, architecture, partnership commitments, kill calls, strategic pivots) gets a Decision Journal entry in `decisions.md` using the new format (see the file's § Format and `prompts/decision-journal.md`). Each entry includes:
- The decision (one sentence, verbatim framing where possible)
- The load-bearing assumption (the one thing that, if wrong, makes the decision wrong)
- The leading indicator (observable signal that will tell us right/wrong within 90 days)
- A 90-day check_back_date
- Status: open

During weekly Monday review, scan `decisions.md` for entries where `status: open` AND `check_back_date ≤ today`. Grade each via `prompts/decision-journal.md` Mode B. Disproven decisions ALWAYS get a `lessons.md` entry describing the assumption-class failure — that's where calibration learning compounds. Historical entries (before 2026-05-11) are NOT retrofitted; they remain frozen context.

This is non-negotiable for the same reason the Critic pass is: it closes the loop between decisions and calibration. Without it, the same assumption-class mistakes recur silently.

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
## Phased plan (current state as of 2026-05-10)

> Original phased plan from Phase 0–5 era lives in `TrustBench-strategy.md` (now header-marked SUPERSEDED-IN-PART). The 2026-05-07 partnership-day reframe (component-in-stack with x402-paywalled API monetization, see `partnership-day-record-2026-05-07.md`) shifted Phase 4's shape from "policy-firewall subscription" to "paywalled API endpoints + listing sprint." Phase 5 stays directionally the same with an AP2-compatibility addendum.

- **Phase 0 — Reframe public positioning — DONE (2026-05-07).** Site V2 redesign shipped: cross-network framing on landing, methodology page, live stat strip, 2-bit verification badges, content-negotiated `/rankings` and `/receipts/:id`. trustbench.io DNS flipped 2026-05-06; both milestone receipts verify clean against the production domain with no override. Public copy throughout uses honest registry-pulse + telemetry framing (no "benchmark/oracle/authority" language). Tracked in `project_phase4_site_redesign_2026_05_07.md` memory.

- **Phase 1 — Stabilize the foundation — DONE (2026-05-06).** `prober.ts` percentile fix shipped (linear interpolation). Ed25519 scorecard signing live — production keypair generated, deployed to Railway env vars; HMAC fallback with boot-time warning still in place for safety. Public key served at `/.well-known/trustbench-pubkey`. `/rankings`, `/route`, `/rankings/paid` all return live data with `signature_alg: ed25519`. Reference verifier at `scripts/verify-receipt.js`; standalone npm package `@trustbench/verify-receipt` v0.1.0 published 2026-05-08.

- **Phase 2 — Validate before building — DONE (2026-04-30).** Three real conversations (r/AI_Agents x3 + @InfopunksHQ X thread) plus ≥1 written expression of interest. Verbatim quotes in `# Phase 2 — Builder Conversations.md`; competitive map in `# Competition Analysis — Recent Rev.md`. Key findings (still load-bearing):
  - The **1–3% routing spread was explicitly rejected** by builders (incl. SpendGate's founder: "a big no no for a lot of people"). Flat per-tx + subscription is the validated direction.
  - Top **unprompted** pain points: idempotency, hard spend caps, signed receipts, queryable audit trail. All four shipped in Phase 3.
  - @InfopunksHQ gave a concrete receipt spec (signed receipt + call metadata + settlement reference + replayable audit path) — implemented in Phase 3 receipts and tacitly accepted via @InfopunksHQ's silence + cognition-layer launch as their reply (memory `project_receipt_spec_infopunks.md`).
  - Competitive lane: **lightweight, non-custodial, MCP-native plumbing** — Infopunks (intelligence), SpendGate (proxy/governance), AgentlyHQ (framework) occupy adjacent slices, not the same one.

- **Phase 3 — Minimal non-custodial router — DONE (2026-05-04).** Authoritative reference: `phase3-closeout.md`. Shipped:
  - Authenticated `POST /route` (quote) + `POST /route/settle` (forward agent-signed EIP-3009) with Argon2id API-key auth.
  - Idempotency keys (16–128 chars, 24h replay window, 409 on body mismatch). Spec: `phase3-idempotency-design.md`.
  - Hard spend caps (server-enforced per-agent + per-call). Spec: `phase3-spend-caps.md`.
  - Ed25519-signed receipts containing call metadata + settlement reference (tx_hash + chain). Spec: `receipt-spec-v1.md`.
  - Public, immutable, no-auth `/receipts/:id` queryable audit endpoint (24h Cache-Control immutable).
  - Smoke A1–A5 / B1–B4 green, sign-off in `lessons.md`.
  - Non-custodial throughout: agent signs EIP-3009 with own key; provider submits on-chain; TrustBench observes tx_hash and emits the receipt.
  - Pricing direction confirmed: flat per-tx fee + subscription, never %-spread.

- **Phase 4 — Component-in-stack with x402-paywalled API monetization — IN FLIGHT.** Reframed 2026-05-07 from the original "policy-firewall subscription" framing after partnership inbounds from @InfopunksHQ + @stratamcp + CLU_AGENT in 48 hours signaled TrustBench as a *component of an emerging stack*, not a standalone product. Authoritative references: `partnership-day-record-2026-05-07.md` (the reframe), `phase4-kickoff.md` (engineering state), `phase4-paywall-design.md` (paywall v0.1.0 design), `phase4-listing-plan.md` (active sprint plan), `phase4-qbt-and-paywall-handoff.md` (post-QBT-Labs read).

  Already shipped under the Phase 4 banner:
  - **P4-1b (2026-05-06):** First paid x402 receipt end-to-end against a real provider (Infopunks's cognition layer). Public Railway-issued receipt `rcpt_01KQY7C44GAPSXZPFQYRZ1D10C` verifies SIGNATURE VALID + ON-CHAIN VERIFIED with no override. Five-fix chain: SDK swap to `@x402/core` + `@x402/evm` v2.11.0, drop normalization, slim accepted before encode, chain-lookup fallback via USDC `AuthorizationUsed` event for async-settlement merchants, publish Phase 3+4 to GitHub.
  - **P4-7 (2026-05-06):** Strict reservation-based spend caps (closes the Phase 3 hold/release race). `SPEND_CAP_RESERVATION_ENABLED=true` in prod; pending-sweep cron releases stale quotes at 60s interval.
  - **Receipt HTML rendering (2026-05-06):** Content-negotiated `/receipts/:id` — browsers get polished HTML with badges + basescan link + copy-paste verifier; agents get byte-identical JSON. Same pattern on `/rankings`.
  - **Heurist Solana mesh crawler (2026-05-06):** 4th crawler source; ~150 Solana endpoints stored, currently filtered from `/rankings`+`/route` by Solana network filter (one-line removal when P4-3 lands).
  - **Discovery surface stack:** `/skill.md` (agentic.market format), `/.well-known/trustbench.json`, `/llms.txt` — all shipped 2026-05-05/05-06.
  - **trustbench.io DNS flip (2026-05-06):** Cloudflare proxy ON; `TRUSTBENCH_BASE_URL` flipped; Railway hostname kept alive permanently for backward compat.
  - **Site redesign V2 (2026-05-07):** Cross-network framing throughout, after Pay.sh launch. Multi-network coverage on landing/README/llms.txt/skill.md.
  - **`@trustbench/verify-receipt` npm v0.1.0 (2026-05-08):** Standalone third-party verifier; mirrors `scripts/verify-receipt.js`; optional `--check-chain` via viem peer-dep. Bumped to v0.1.1 (2026-05-13) to accept the `rrcpt_` prefix + `receipt.paid` envelope for Phase 4 routing receipts.
  - **P4-2 receipt explorer (2026-05-12):** Public `/explorer` page lists all signed receipts (`rcpt_` Phase 3 + `rrcpt_` Phase 4 merged). Default JSON; HTML opt-in via Accept or `?format=html`. Wire-safe vs the indexing watch.

  Listing sprint SHIPPED 2026-05-13 — 9 days ahead of the 2026-05-22 target (plan in `phase4-listing-plan.md`):
  - ✓ **Paywall v0.1.0** (`phase4-paywall-design.md`): `/route` only, two-payment-per-call shape (TrustBench fee + provider fee, both x402), `paid_requests` body-hash discipline, Ed25519-signed responses on differentiated-work endpoints. Live in prod since 2026-05-11; free-tier quota and refund path deferred to v0.2.0.
  - ✓ **agentic.market + Coinbase Bazaar listing** (one listing, two surfaces — see `listing-blocker-audit-2026-05-13.md`): live at `https://agentic.market/services/trustbench.io`, indexed via CDP merchant-discovery with `lastUpdated 2026-05-13T14:09:34Z`. Root cause of the 24h-stuck phase was Stone 0 (X-PAYMENT envelope must echo 402.extensions for the facilitator's `extractDiscoveryInfo` to catalog) — fix in `scripts/paywall-smoke.ts` commit `e060c63`. Reference x402 clients propagate this automatically; hand-rolled wallets must do so explicitly. 30-day validating check: `decisions.md` 2026-05-13 entry (callback 2026-08-11) watches whether `lastUpdated` shifts from an independent agent wallet within 30 days, validating that reference-client propagation works for partners.

  Now-active Phase 4 work post-listing:
  - **Strata §10 reference-agent integration** (target receipt URL ~2026-05-19 per `strata-integration-sketch-SEND.md`). Awaiting Strata acceptance on §10 tiers sent 2026-05-12.
  - **v2 header migration tail:** PAYMENT-SIGNATURE inbound + PAYMENT-RESPONSE outbound (PAYMENT-REQUIRED outbound shipped 2026-05-12). See `phase4-v2-header-migration-handoff.md`.

  Other Phase 4 follow-ups still queued (lower urgency):
  - **P4-3:** Drop the Solana network filter to make Heurist Mesh routable. Timing per `phase4-p4-3-timing.md` (decision: Option A within 48h vs Option C deferred — pending Johan confirmation). Note 2026-05-12: P4-3 is multi-day (Solana branch in validateChallenge + SPL-shaped X-PAYMENT + Solana facilitator), not a one-line filter removal.
  - **P4-1d:** SDK sweep with `@coinbase/x402` after InfopunksHQ amplification (Infopunks pivoted off cognition layer 2026-05-11; amplification path uncertain).
  - **Mindshare outreach** after Infopunks amplifies (same uncertainty as above).

  Pricing: flat per-call USDC settlement on Base. Specific tiers in active validation with first integration partners; not yet published. Reviewable based on real volume. Refundable provider verification bond — pay-to-list, never pay-to-rank.

- **Phase 5 — p402 / Canton + AP2 compatibility (after first paying agent on x402 paywalled endpoints).** Native p402 + KYB/identity attestations + settlement-finality semantics across protocols. **AP2 v0.2 verdict (2026-05-07, see `ap2-compatibility-assessment.md` + memory `project_ap2_compatibility_2026_05_07.md`):** AP2 is complementary, not competing. AP2 has no Router role, no Routing Receipt, no on-chain settlement attestation. Path B proceeds; the Policy SKU (P6-M2) should be an AP2 Mandate Constraint extension. Design seeds collected during Phase 4 work in `phase5-design-seeds.md`. Readiness watch + gate-grading runbook in `phase5-readiness-watch.md` — run the four checks there before any Phase 5 kickoff session. Do not start until x402 paywalled endpoints have at least one paying agent and v0.1.0 has been live for ≥4 weeks.

## Known cleanups (low priority, do as we touch the area)

- Root-level `index.ts` and `run-crawler.ts` are stale duplicates of `src/index.ts` and the crawler+prober pair. They reference `crawlBazaar` / `probeProvider` exports that don't exist in `src/` and use a `SUPABASE_SERVICE_ROLE_KEY` env var that's not in `.env.example`. Delete or quarantine when convenient.
- ~~`.github/workflows/nightly-pipeline.yml` and `.github/workflows/pipeline.yml` both run the nightly job (one at 03:00 UTC, the other at 00:00 UTC, only the latter also runs `npm run crawl`). Consolidate to a single workflow that crawls *then* probes.~~ **Resolved 2026-05-09:** consolidated into `nightly-pipeline.yml` (crawl then probe at 03:00 UTC); `pipeline.yml` reduced to an inert no-trigger stub; safe to fully delete from local clone with `Remove-Item .github\workflows\pipeline.yml`.
- `supabase/schema.sql` is the old EIP-712-flavored schema; the live one is `schema.sql` at the repo root. Either delete the old file or rename it to `schema.legacy.sql` and add a comment.
- README.md and prior `Claude.md` revisions had stray `\#` / `\##` escape artifacts. Always write Markdown without backslash-escaping headers.
- ~~Daily X post (`scripts/post-to-x.js`) still uses "best x402 providers" copy. Soften to "live x402 telemetry + registry" once Phase 0 ships.~~ **Resolved 2026-05-09:** rewritten with honest registry-pulse + methodology rotation + build-in-public mix; trustbench.io URLs throughout; em-dash-free; fail-loud env validation. Workflow stays disabled in GitHub Actions until you re-read the rotation arrays and flip it on.

## Out of scope (don't touch without explicit approval)

- `.env` and any secret files.
- Railway dashboard settings.
- Full accounting UI or heavy frontend work — `/analytics` stays plain HTML for now.
- On-chain anchoring or EIP-712 typed-data signing — not until we explicitly decide we need it (Ed25519 with a published public key is the Phase 1 target, and that's enough).
- Any change that makes TrustBench custodial.

## Founder-shape calibration (added 2026-05-10)

Apply this calibration when proposing ideas, scoping work, evaluating opportunities, or running a Critic pass. The values below tune what's "yes" vs. "no" for *this specific operator and project*. Generic "good idea" criteria do not apply — they produce wrong-shape recommendations.

- **Capital position.** Solo founder, self-funded. Operating spend cap ~$50/mo on infrastructure (Railway + Supabase + Upstash + paid-probe combined). No paid third-party services without explicit approval. Paid APIs or scraping require justification with expected payback window.
- **Energy this quarter.** Phase 4 listing sprint active (paywall v0.1.0 + agentic.market + Bazaar listings, target Friday 2026-05-22 per `phase4-listing-plan.md`). Available dev hours after sprint: ~10-15/week. Solo, no outsourced development.
- **Skills building.** x402/p402 protocol depth, Ed25519 + JCS canonicalization, AEO / LLM-discoverable surfaces, signed-receipt + audit infrastructure, agent-payments architecture, Hono + tsx + Supabase production patterns.
- **Skills avoiding.** React Native, Kubernetes, sales engineering, multi-tenant auth/billing systems, frontend framework churn beyond plain HTML + Tailwind.
- **What bores me.** Low-margin enterprise sales, multi-month deal cycles, anything custodial, complex enterprise sales motions, anything where v1 takes more than two weekends, anything in the AI-as-category trap (per memory `feedback_solo_founder_ai_category_velocity.md`).
- **Risk tolerance.** Comfortable with technical risk and market risk. Uncomfortable with regulatory risk (custodial, securities) and reputation risk (overclaim, "benchmark/oracle/authority" framing the actual measurement does not justify).

If a candidate idea, feature, or scope expansion fails on capital-fit OR energy-fit OR the boredom-check, flag it explicitly before recommending. Wrong-shape ideas waste solo-founder weeks; calibration prevents that.

## Solo-Founder Principles

- Everything must be maintainable by one person with zero manual daily work.
- Prefer zero-cost MVP choices (3-sample probing, Redis cache, GitHub cron, Railway free/cheap tier).
- Revenue must come from usage-based **flat-per-tx fees** and simple subscriptions — never %-spread routing fees (rejected in Phase 2 validation 2026-04-30) and never complex enterprise sales motions.
- Keep the public registry/dashboard useful and honest while the router is being built. The registry is the front door until the router earns the spotlight.
