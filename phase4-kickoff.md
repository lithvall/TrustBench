# Phase 4 Kickoff

**Status:** Phase 3 closed 2026-05-04. Phase 4a (discovery surfaces, P4-7 reservation caps, first paid receipt P4-1b) shipped 2026-05-04 / 2026-05-06. Phase 4b (paywalled API, receipt explorer, partner integrations) in flight.

**Strategic direction superseded 2026-05-07:** This document is the engineering-state record. The current strategic direction (component-in-stack with x402-paywalled API monetization, partnership-driven) is in `partnership-day-record-2026-05-07.md` and **should be read first** if you're picking up the project cold. The Phase 4b items below are still the right engineering work; what changed is the framing around why they matter and what the revenue model is.

**Audience:** Fresh Claude session. Read `partnership-day-record-2026-05-07.md` first for current direction, then this doc for engineering context, then `phase3-closeout.md` for what shipped through Phase 3.

---

## What's done — Phase 3 receipt

All 9 closeout items shipped + smoke-tested green:

- A1–A5 Phase A smoke (quote → settle → audit → verify → tamper) ✅
- B1–B4 Phase B smoke (replay, body-mismatch 409, settle replay no-double-charge, expiry 410) ✅
- `block_number` plumbed through schema → receipt envelope → DB column ✅ (migration applied 2026-05-04)
- `verify-receipt.js` extended with `--pubkey-url` and `--check-chain` (lazy-imports viem; default verification still works without it) ✅
- README rewritten with verifier docs, failure-semantics, explicit Phase 3 limits ✅
- `scripts/paid-probe.ts` + GitHub Actions cron + `.env.example` block ✅ (`npm install` confirmed viem 2.21.0)
- Sign-off entry in `lessons.md` ✅
- `MEMORY.md` updated to reflect closed state ✅

Operational items not yet done (these don't block Phase 4 design work, only paid-probe go-live):
- Provision probe agent in Supabase (SQL in `phase3-paid-probing.md` § Probe agent provisioning)
- Generate dedicated probe wallet, fund ~$30 USDC on Base
- Set GitHub Secrets: `SCRIPTS_PROBE_API_KEY`, `SCRIPTS_PROBE_WALLET_PK`, `TRUSTBENCH_BASE_URL`, optional `SUPABASE_URL` + `SUPABASE_SECRET_KEY`
- Local dry-run, then single-provider live run

Non-blocking carry-forward bugs:
- `src/server.ts` — stale stub importing `./index.js` as default. Live entry is `tsx watch src/index.ts` direct. Either delete or align.
- 3 pre-existing `tsc` errors in `node_modules/@supabase/realtime-js` referencing missing `@supabase/phoenix` types. Probably a `@supabase/supabase-js` minor bump.

---

## New intel since Phase 3 closeout — Infopunks shipped (2026-05-04)

**@InfopunksHQ** announced their Cognition Layer as a live x402 paid API on Base. Three endpoints, CDP-settled in USDC:
- `/v1/coherence-score`
- `/v1/extract-signal`
- `/v1/simulate-narrative`

Public proof URL: `https://infopunks-cognition-layer-x402.onrender.com/proof` (Render-hosted; useful for routing-latency expectations).

Direct public endorsement of the TrustBench thesis, in their words:
> *"imo the receipt is the primitive… once cognition has receipts agents can start routing by evidence instead of vibes."*

Implications for Phase 4:

1. **Receipt-spec v1 is implicitly accepted.** I sent Infopunks the spec on 2026-05-03 with five open questions; they responded by announcing their launch rather than answering. Combined with the public framing, treat the spec as locked unless they later raise concerns.

2. **First real x402 endpoints we can probe.** Until now `paid-probe.ts` could only hit the local mock. Infopunks's 3 endpoints are real x402 + USDC + Base. Adding them to the registry directly is a faster path to "real x402 traffic" than waiting for the full P4-1 ecosystem refresh.

3. **Their /proof page is a reference for P4-2.** Study its format before designing the public receipt explorer.

4. **Infopunks's roadmap is Trust → Cognition → Passport.** Their next layer (passport: identity claim hygiene + reputation memory + route selection) is complementary, not competitive. Clean partnership story for P4-6.

---

## Phase 4 priority — proposed reweighting

Original priority ordering in `phase3-closeout.md` § "Phase 4 plan":
P4-1 → P4-2 → P4-3 → P4-4 → P4-5 → P4-6 → P4-7 → P4-8 → P4-9 → P4-10 → P4-11

**Recommended reweighting given Infopunks news:**

| Order | Item | Why now |
|---|---|---|
| 1 | **P4-1a — Add Infopunks's 3 endpoints to the registry** | Surgical 30-min change; gives paid-probe its first real targets. |
| 2 | **P4-1b — Run paid-probe against Infopunks endpoints** | First real-traffic receipts. Validates the entire stack end-to-end with live x402 + USDC + Base. |
| 3 | **P4-1 — Full ecosystem refresh against `x402.org/ecosystem`** | Broader, slower; do once the surgical Infopunks add proves the path. |
| 4 | **P4-2 — Public receipt explorer** | Use Infopunks's /proof page as design reference. Real probe receipts (from P4-1b) make the explorer immediately demo-able. |
| 5 | **P4-6 — Formal Infopunks integration** | Now has concrete substance: their passport + our receipts. |
| 6+ | P4-3, P4-4, P4-5, P4-7…P4-11 | Original order applies. |

If the user wants to follow the original order strictly, fine — but the Infopunks-first sequence collapses three Phase 4 dependencies (real traffic, explorer demo material, Infopunks integration substance) into one early sprint.

---

## State as of 2026-05-06 — P4-1b agent-side complete, externally blocked

**P4-1a:** ✅ Done. Three Infopunks endpoints in the registry with POST-mode probe metadata.

**P4-1b:** Agent-side is complete and shippable. SDK pivot done (`x402` v1.2.0, `createPaymentHeader`); `paid-probe.ts` builds X-PAYMENT client-side via SDK; local `recoverTypedDataAddress` self-verification confirms cryptographically correct envelopes; `/route/settle` accepts both legacy `signature` and SDK-built `x_payment`; mock-provider regression smoke (A1-B4) still passes; quote round-trip against Infopunks works end-to-end. **Blocked at the Coinbase CDP facilitator** — every wrapper variant rejected with the same opaque "x402 facilitator verify failed" message regardless of x402Version (1 vs 2) or network spelling ("base" vs "eip155:8453"). 9 hand-roll patches yesterday + SDK pivot + 4 wrapper-shape patches today, all rejected at the same wall. Below the floor of what's debuggable from outside without partner-side facilitator logs. Infopunks DM (drafted in `lessons.md` 2026-05-06 entry) is the unblock move; not technical work.

**Practical effect on Phase 4 sequencing:** P4-1b's "first paid receipt" deliverable is now on Infopunks's response time, not ours. The natural reweight is to **start the discovery sprint while waiting** — P4-skill + P4-wellknown + P4-llmstxt are all independent of paid receipts and each is <1-2 days. Shipping them gets traffic to TrustBench's surfaces immediately, and the Infopunks DM gets to mention "by the way, we just published our skill file" which is partnership-grade.

**Reweighted sprint order from 2026-05-06 onward (until Infopunks responds):**

| Order | Item | Why now | Status |
|---|---|---|---|
| 1 | **Send Infopunks DM** (drafted in lessons.md) | Unblocks P4-1b. 5 minutes. | ✅ Sent 2026-05-05; replied; second DM with diagnostic packet sent 2026-05-05; awaiting SDK-version reply. |
| 2 | **P4-skill — publish `trustbench/skill.md`** | First-mover open in routing/policy lane. Discovery channel. <1 day. | ✅ Shipped 2026-05-05. File at repo root + Hono GET /skill.md route. Augment-only positioning, defers to Coinbase Agentic Wallet. |
| 3 | **P4-wellknown + P4-llmstxt** | Co-ship with skill.md. Discovery surfaces. <1 day combined. | ✅ Shipped 2026-05-05. /.well-known/trustbench.json (new file + Hono route), /llms.txt (existing file refreshed for Phase 3 closed + Phase 4 status; Hono route newly added — README's prior claim it was served was aspirational). |
| 4 | **P4-1 — Full ecosystem refresh** | Replaces stale CDP-discovery inventory in the registry. Has its own value independent of paid receipts. | ✅ Shipped 2026-05-05 by way of P4-1d (Agentic Market is the canonical catalog as of week 2; replaces both CDP discovery and the obsolete hard-coded fallback). Refresh happens on the next nightly cron, or `npm run crawl` for an immediate run. |
| 5 | **P4-1c — taxonomy alignment (5-cat)** | Bundle with the registry refresh while we're touching that surface. | ✅ Shipped 2026-05-05. `Capability` type expanded to `search \| inference \| data \| media \| infra` in provider-selection.ts, route-handlers validator + error message updated, mcp/tools enums updated. Crawler stores any category Agentic Market emits (Travel/Social/Storage/Trading observed in the wild) but `/route` only picks the canonical 5 via `ROUTABLE_CAPABILITIES`. |
| 6 | **P4-1d — switch crawler source to Agentic Market** | Same sprint as P4-1c. | ✅ Shipped 2026-05-05. `src/crawler.ts` replaced: paginated `api.agentic.market/v1/services` (limit=50, ~13 pages for ~650 services), one provider row per (service, endpoint) pair, network filter to Base only, `metadata.integration_type` recorded for each row. CDP-discovery call + the misleading hard-coded AI-API-root fallback retired. `seedKnownX402Endpoints()` for Infopunks's 3 endpoints preserved verbatim and runs last so it wins on URL conflict. |
| 6.5 | **P4-verify-tier — `integration_type` alongside `x402_verified`** | Two-bit verification: empirical (we probed it) plus curatorial (Coinbase certified it 1P). | ✅ Shipped 2026-05-05. Crawler records `metadata.integration_type` ("1P" or "3P") from Agentic Market. `getRankings` projects it alongside `x402_verified` (cache key bumped to `rankings:v3:`). Not part of the signed scorecard payload, so existing scorecard signatures stay stable. |
| 7 | **P4-bazaar — list TrustBench services on Bazaar/Agentic.market** | Largest single agent-side discovery surface. After taxonomy + crawler upgrades. | Not started. Requires server-side x402 wire layer (~1.5–2 weeks); out of "while waiting on Infopunks" scope. |
| 8 | **P4-1b — first paid receipt against Infopunks** | The unblock. SDK swap to @x402/* v2 landed 2026-05-06. | ✅ **Shipped 2026-05-06.** Public Railway-issued receipt: `rcpt_01KQY7C44GAPSXZPFQYRZ1D10C` (tx `0x3e6d6078...` block 45633871). Local-issued precursor: `rcpt_01KQY629W1HWJW19E87ECR4ZTR` (tx `0x706d3f16...` block 45633185). Verifier confirms SIGNATURE VALID + ON-CHAIN VERIFIED with no override. Three on-chain transactions today including one 431-orphan during diagnostics. |
| 9 | **P4-7 — Strict reservation-based spend caps (BUMPED 2026-05-06)** | Convert today's read-then-check spend cap into a real reservation/release on the quote→settle window. Eliminates the `(parallelism − 1) × max_price` overshoot under concurrency. | Bumped from deferred bottom by two-signal validation: Infopunks's earlier "audit tail is where teams slip" framing + CLU_AGENT (automated, op @Logik185) reply 2026-05-06 explicitly naming "per-call timeout reversion" as a gap. See `phase4-clu-agent-handoff.md` and `project_clu_agent_signal.md` (memory). **Design sketch landed 2026-05-06 in `phase4-spend-caps-reservation.md`** (schema change + lifecycle + failure-mode analysis + C1-C4 smoke plan + pre-implementation checklist). Estimated ~1 day, server-side only. Lands ahead of P4-2 (receipt explorer) and P4-bazaar. |
| 10 | **P4-bazaar (continued)** | Server-side x402 wire layer + manifest + Bazaar listing for the three pure-compute services (verify-receipt, score-provider, policy-check). | Same scope as item 7. ~1.5–2 weeks; defers to a focused sprint. |
| 11 | **P4-2 — Public receipt explorer** | `/explorer` page that takes a receipt id and renders the verified envelope + on-chain settlement reference. | Was originally next-after-1b; demoted to post-7 after the priority bump. Builds on first paid receipts (1b) so its launch story is stronger once we have at least one. |
| 12 | **P4-6 — Formal Infopunks integration** | Cross-link manifests, joint reference flow, partnership announcement. | Same priority as before. |
| 13+ | Original order: P4-3 (Solana) → P4-4 (npm package) → P4-5 (receipt-spec docs) → P4-8 (multi-merchant) → P4-9 (policy firewall subscription) → P4-10 (verification bond) → P4-11 (CSV export) | | |

The reweight buys forward motion regardless of how Infopunks's debug response goes. As of 2026-05-05 end-of-day: Tier-1 discovery surfaces (skill.md / llms.txt / manifest) are live, Infopunks DM thread is in flight with the diagnostic packet they asked for, and items 4-7 of the sprint table are next if the Infopunks reply takes more than a day. See `lessons.md` 2026-05-05 entry for what shipped and what to verify on Windows-side after the next deploy.

---

## Phase 4 follow-ups added 2026-05-05 from week 2 ecosystem intel

These came out of reviewing `x402SKILL.md` (Coinbase's published skill file) + Nick Prince's Agentic.market week 2 announcement + the Reasonable-Degree101 Reddit DM. They're not blockers for P4-1b but are clear, scoped pieces of P4 work to land after first-receipt amplification.

### P4-skill — publish `trustbench/skill.md` (distribution channel)

**Why this is high-leverage:** Coinbase ships `agentic.market/skill.md` as the primary onboarding for x402 — paste into Claude Code / Codex / Cursor / Hermes / Cherry Studio and the agent gains x402 capability immediately. They aren't competing on developer SDKs; they're competing on **agent skill files**. As of 2026-05-05, no competitor in our routing/policy lane (G402, X-Router, Router402, AgentGatePay, etc.) ships a skill file. **First-mover advantage is open.**

**Proposed shape of `trustbench/skill.md`:**
- Same two-path structure as Coinbase's (CLI for Claude Code/Codex/Hermes; MCP for Claude Desktop/Cherry Studio/ChatGPT)
- TrustBench's primitives surfaced as defaults the agent gets for free: idempotency keys, hard spend caps, signed receipts, `/receipts/:id` audit, non-custodial routing
- Differentiation vs Coinbase's skill: theirs points at the Coinbase facilitator + Agentic Market for discovery. Ours augments — pay through TrustBench's `/route` and you ALSO get the policy layer + signed audit trail Coinbase doesn't ship
- Tone discipline: borrow Coinbase's MCP-user voice rules (no jargon, no "MCP server", no "402 handshake", plain language)

**Effort:** ~1 day. Mostly copy-style writing + tone calibration. Code already exists.

**Sequence:** Ship after first paid receipt is amplified, before P4-2 receipt explorer (skill.md drives traffic to `/receipts/:id` once the explorer is live, so order matters).

**Reference:** `x402SKILL.md` at project root is Coinbase's published skill — use as format template, NOT as canonical TrustBench language.

### P4-1c — taxonomy alignment (Search / Inference / Data / Media / Infra)

Coinbase's Agentic Market uses 5 categories: **Search, Inference, Data, Media, Infra**. TrustBench currently uses 3: search/inference/data. We're missing Media and Infra. Federation with Agentic Market data (and any future agentic.market-sourced registry) requires shared taxonomy.

**Migration:**
- Update `Capability` type in `src/provider-selection.ts` and `src/route-handlers.ts`
- Either expand the validator-side enum or remove the constraint and store-as-string (less type-safe but more flexible)
- Backfill existing rows from the limited 3-cat set into the expanded 5-cat set (Media and Infra rows currently don't exist; new rows can use them when added)

**Effort:** 1–2 hours.

### P4-1d — switch crawler source to Agentic Market (`api.agentic.market/v1/services`)

**Current state:** `src/crawler.ts` tries CDP discovery (`api.cdp.coinbase.com/platform/v2/x402/discovery/resources`) — returned 0 rows in the 2026-05-04 run. Falls back to a hard-coded list of ~20 API roots, mostly NOT actually-x402 endpoints.

**Replacement:** `https://api.agentic.market/v1/services` returns a curated list of 100s of services with full schema:
```json
{
  "services": [{
    "id", "name", "description", "domain", "category", "networks",
    "integrationType": "1P",  // or "proxied"
    "endpoints": [{"url", "method", "pricing": {"amount", "currency", "network"}}]
  }]
}
```

This is the canonical x402 discovery surface as of 2026-05. Switching is a clean win: more inventory, structured schema, includes attestation flag (1P / proxied).

**Effort:** Small refactor of `crawler.ts`. ~1 hour.

### P4-verify-tier — adopt `integrationType` ("1P" / "proxied") alongside `x402_verified`

Coinbase ships verified badges in Agentic Market — `services[].integrationType: "1P"` for first-party native x402 integrations, `"proxied"` for those going through a paywall middleware. Functionally similar to TrustBench's `metadata.x402_verified` but Coinbase-attested rather than self-attested.

**Adoption:** Add `metadata.integrationType` to the providers row. Two-bit verification = `x402_verified` (we probed it ourselves) + `integrationType` (Coinbase certified it 1P). Display both on receipts and in `/rankings` once available.

**Why both, not just adopt Coinbase's:**
- TrustBench's verification is empirical (we got a 402 challenge and validated the wire shape ourselves)
- Coinbase's is curatorial (they accepted the seller into Agentic Market)
- Both signals together are stronger than either alone
- Future verification bond becomes Tier 3, distinct from Coinbase's free 1P badge

**Sequencing:** Pair with P4-1d (the data comes from the same Agentic Market crawl).

### Verification bond positioning vs Coinbase's verified badge

The original Phase 4 plan listed a refundable provider verification bond. Coinbase shipped a free 1P attestation in week 2 (2026-05-04). The bond is now Tier 3 of a verification stack:

1. **Self-attested** — provider lists themselves (no signal). Free.
2. **Coinbase 1P badge** — Coinbase certified native integration. Free.
3. **TrustBench verification bond** — refundable economic stake against fraud, revoked-and-burned on confirmed misbehavior. Paid (P4 / P9 design).

These stack rather than compete. Bond is for serious providers who want a stronger trust signal than 1P alone (e.g. enterprise integrators, anyone whose customers have compliance asks).

---

### P4-bazaar — list TrustBench services on Bazaar / Agentic.market

**What we list (non-custodial-pure x402 endpoints):**

| Endpoint | What it does | Suggested price | Custody status |
|---|---|---|---|
| `POST /v1/verify-receipt` | Verify any TrustBench-emitted receipt against our public key + on-chain settlement; return signed verdict | $0.001 | None (pure compute) |
| `POST /v1/score-provider` | TrustBench score + last 7 days probe data + scorecard signature for any provider URL | $0.005 | None (pure data) |
| `POST /v1/policy-check` | Validate `{capability, max_price, payer_address}` against agent's stated caps; return allow/deny + reason | $0.001 | None (pure compute) |

**Why these specifically:** all three are pure-compute or pure-data, no float, no hot wallet, no settlement-side responsibility. Listing TrustBench's `/route` itself (the routing service) has a real custody-vs-fee-collection tension — defer that design to Phase 4 / 5 when we know more about the float-vs-subscription tradeoff. The three above are clean wins.

**Work breakdown (~1.5–2 weeks focused solo-founder):**
1. Server-side x402 wire layer (we've built client-side; need merchant-side equivalent). Consider `@x402/hono` middleware or roll a thin layer. ~2–3 days.
2. The three endpoints themselves (verify-receipt is moving `scripts/verify-receipt.js` server-side; score-provider is a thin scorecards-table wrapper; policy-check wraps the existing spend-cap middleware). ~2 days total.
3. Manifest + OpenAPI publication (mirror Infopunks's format). ~1 day.
4. Bazaar submission via Coinbase's seller endpoint validator. Variable, depends on Coinbase indexing latency.
5. Coinbase Wallet on TrustBench's pay-to address for revenue collection. ~30 minutes ops.

**Sequence:** ship after P4-1b + P4-skill + P4-1c + P4-1d. Bazaar listing depends on the wire layer being battle-tested through the consumer flow first, the agent-side skill being live, and the taxonomy + crawler upgrades being in place.

### P4-wellknown — publish `.well-known/trustbench.json` manifest

**What:** machine-readable manifest at `trustbench.io/.well-known/trustbench.json` describing TrustBench's public surfaces — endpoints, OpenAPI URL, capability tags, pay-to address, signed-receipt verifier path, public key URL.

**Why:** any agent that crawls `.well-known/` paths or reads them after a 402 challenge finds us. Standard x402 / agent-discovery convention — Infopunks publishes one for each of their three layers (`infopunks-trust-layer.json`, `infopunks-cognition-layer.json`, `infopunks-passport-layer.json`). Cheap to ship, missed by most competitors.

**Format reference:** Infopunks's `https://infopunks-cognition-layer-x402.onrender.com/.well-known/infopunks-cognition-layer.json` — same shape, adapted for TrustBench's offerings.

**Effort:** ~3 hours. Single endpoint serving a static JSON document; updates only when public surfaces change.

**Sequence:** can ship alongside or even before P4-skill — independent. Bundle into the P4-skill delivery sprint.

### P4-llmstxt — publish `llms.txt` at `trustbench.io/llms.txt`

**What:** plain-text summary of TrustBench's capabilities + URLs, designed for LLM-grounded research. Coinbase, Anthropic, OpenAI all publish one. Format is loose — bullet-pointed sections, public URLs, capability descriptions.

**Why:** any agent that uses an LLM to research "agent payment routing" or "x402 receipts" or "spend caps for agents" — the LLM ranks our `llms.txt` content highly because it's authoritative and machine-readable. Slow-burn discovery surface but compounds over time as more agents do LLM-grounded research.

**Format reference:** `https://docs.cdp.coinbase.com/llms.txt` and `https://agentic.market/llms.txt` (both linked from the Coinbase x402SKILL.md). Mirror that shape.

**Effort:** ~2 hours. Single static document.

**Sequence:** ship in the same sprint as P4-skill + P4-wellknown. All three are <1 day combined.

---

## Agent discovery — surface stack analysis (added 2026-05-05)

**Honest framing of the discovery problem.** Without curated marketplace listings (Bazaar / Agentic.market), organic agent discovery in 2026 is weak. The agent-payment ecosystem is too young for robust direct-discovery surfaces. Most agents discover x402 services through one of three routes: (a) human builder configured them with specific URLs, (b) a skill file is in their prompt context, (c) they query a curated marketplace. **TrustBench's job is to be visible on every layer of that stack, ordered by effort vs. reach.**

### Tier 1 — Cheap, high-leverage (each <1-2 days)

| Surface | Tag | Coverage |
|---|---|---|
| `trustbench/skill.md` published | P4-skill | Every agent built on Claude Code / Codex / Cursor / Hermes / Cherry Studio whose builder pastes the skill |
| `/.well-known/trustbench.json` manifest | P4-wellknown | Any agent that crawls `.well-known/` or reads it after a 402 |
| `/llms.txt` at trustbench.io | P4-llmstxt | LLM-grounded agent research; agents using LLMs to find "agent payment routing" |
| Bazaar / Agentic.market listing | P4-bazaar | Largest single agent-side discovery surface in 2026 |

**These four together cover most realistic agent-discovery paths in 2026.**

### Tier 2 — Medium effort, medium reach (each ~1 week)

- **Cross-references in partner manifests** (Infopunks, others). Their manifests point at TrustBench for receipts; ours point at theirs for cognition / trust. Partnership-driven, no central catalog needed.
- **npm packages** (`@trustbench/verify-receipt` is on the original Phase 4 plan as P4-4; a future `@trustbench/sdk` for builder-side SDK use).
- **Reference implementation repos** — one well-maintained GitHub example, e.g., "build a budget-aware agent with TrustBench in 50 lines."
- **Documentation indexed in search** — proper SEO + technical docs at trustbench.io. Slow burn but compounds.

### Tier 3 — Heavier lift, big multiplier if it lands (months-to-years)

- **Agent framework integrations** — native LangChain / LangGraph / CrewAI / AutoGen support. Massive if it lands.
- **Anthropic / OpenAI / Google agent-payments docs** referencing TrustBench as a recommended pattern.
- **Standard-shaping in x402 v3** — proposing an "audit trail extension" that points at TrustBench-style services as canonical.

### What "agent-driven discovery" actually requires (design principle)

**Agents don't discover infrastructure they don't have a reason to want.** TrustBench adds value when:

- The agent has spend caps to enforce (we give server-side enforcement)
- The agent needs a signed audit trail (our receipts)
- The agent retries on failure (our idempotency keys prevent double-charge)
- The agent compares multiple providers (our routing)

**Tactical implication:** target safety-conscious / compliance-bound / audit-aware agents specifically. Show up in their prompt context (skill.md), in their builder's research path (llms.txt + reference repos), and in marketplace categories like "Compliance / Audit / Policy" rather than generic "Search / Inference."

### Recommended Phase 4 discovery sprint

After P4-1b + P4-skill, bundle the rest into a single ~2-week delivery sprint:

```
P4-1b → P4-skill → [P4-wellknown + P4-llmstxt + Reference repo] → P4-1c → P4-1d → P4-bazaar → P4-2 → P4-6
```

The brackets are co-shipped; the rest are sequential. Total elapsed time: 3–4 weeks of solo-founder pace, assuming P4-1b lands today/tomorrow.

---

## Decision points (resolved 2026-05-04 — kept for traceability)

1. **Priority ordering.** ✅ Picked Infopunks-first reweight (P4-1a → P4-1b → P4-1 → P4-2 → P4-6 → original order).
2. **Reply to Infopunks.** ✅ Picked (a) Acknowledge + integrate. Initial DM sent; Infopunks DM-confirmed explicit authorization to paid-probe + amplification commitment 2026-05-04.
3. **Probe go-live.** ✅ Picked first-against-Infopunks. Operational runbook in `phase4-p4-1b-runbook.md`. Currently in flight (silent-null debug from 2026-05-04 end-of-day).

---

## Key files to read first (fresh-session pickup)

In order of priority:

1. **`CLAUDE.md`** — auto-loaded. Project working agreement. Includes the 2026-05-04 workflow rule change (Grok no longer touches code; Claude implements directly).
2. **`phase4-kickoff.md`** (this doc) — current entry point.
3. **`phase5-design-seeds.md`** — Phase 5 design observations collected during Phase 4 work. Read before any Phase 5 planning conversation.
4. **`phase4-p4-1b-runbook.md`** — operational runbook for the Infopunks paid-probe go-live (the current in-flight P4 milestone).
5. **`phase3-closeout.md`** — historical reference for what shipped in Phase 3 + the original Phase 4 plan with full effort estimates and "what's NOT in Phase 4" matrix.
6. **`lessons.md`** — Phase 3 sign-off + 2026-05-04 end-of-day debug carry-forward + the chat-markdown-render gotcha + the file-tools-vs-bash truncation gotcha.
7. **`x402-ecosystem-state.md`** — May 2026 ecosystem snapshot (Cloudflare/Stripe/AWS/Google/Visa Foundation, ~20 orgs).
8. **`x402SKILL.md`** — Coinbase's published agentic.market skill file (downloaded 2026-05-05). Format reference for the planned `trustbench/skill.md` (P4-skill).
9. **`receipt-spec-v1.md`** — receipt wire format (block_number added 2026-05-04).
10. **`TrustBench-strategy.md`** — strategic source of truth.

Auto-loaded memory entries (in `MEMORY.md`):
- Phase 3 build state (closed)
- Phase 2 validation outcome
- Receipt spec from InfopunksHQ
- Infopunks cognition launch + paid-probe authorization (2026-05-04)
- Competitive landscape
- High-risk-surface self-review checklist
- Chat markdown render fakes bugs
- x402 ecosystem state May 2026
- Phase 4 v0.x→v2 wire-compat strategy

---

## Workflow rule (changed 2026-05-04)

**Claude designs and implements; Grok is for X posts and X partnership scouting only.**

The previous round-trip rule (Claude designs → Grok implements → Claude reviews) is retired. Going forward Claude writes the diff directly, including for high-risk surfaces — but with explicit extra discipline on those surfaces:

- Signing (Ed25519, argon2id, JCS canonicalization, EIP-712 typed-data hashing)
- Payment construction (x402 tx assembly, X-PAYMENT header building, X-PAYMENT-RESPONSE parsing, settlement checks)
- Idempotency lock semantics
- Spend cap enforcement
- Receipt emission

For any change to one of those surfaces, Claude must:
1. Read the canonical design doc first (e.g. `phase3-x402-construction.md`, `phase3-spend-caps.md`, `phase3-idempotency-design.md`, `receipt-spec-v1.md`) and cite it in the plan.
2. Add a failure-mode paragraph to the diff comments — "if this is wrong, what breaks, and how would we notice?"
3. Smoke-test against `scripts/mock-provider.ts` before declaring done.
4. Append a `lessons.md` entry capturing what was tricky and what to watch for.

Why the change: round-tripping was insurance against subtle wire-shape mistakes, but it cost a full async cycle per diff, and Grok's design-doc-drift rate (see `feedback_grok_design_docs_drift.md` in memory) meant Claude was already doing the careful reading both times. The new rule keeps the careful reading and drops the cycle.

Grok's role going forward: X posts, partnership scouting on X, monitoring conversation around x402/p402/AP2/MPP. No code, no schemas, no signing.

**This held throughout Phase 3 closeout** — the Grok-rejected x402-construction draft and the false-alarm "issuer env" diagnosis were both caught by reading actual code/bytes rather than trusting surface narrative. Same anti-hallucination discipline applies to Claude's own diffs going forward.
