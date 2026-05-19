# Gap Map — Deep Dive (V1 → Critic Pass → V2)

**Date:** 2026-05-14
**Status:** Strategic-design analysis. NOT a commitment to build. Outputs of this doc feed the Pre-Development Filter (`CLAUDE.md` § Mandatory Pre-Development Filter) and the Decision Journal (`decisions.md`).
**Source:** Requested 2026-05-14 brainstorm session, after the strategic pillars + options filter was established. Filter pass for "should we even research this": passes — it's a Pillar 2 advance (discovery surface from existing crawler) with Pillar 1 indirect benefit (signed-envelope demonstration at ecosystem scale), Option fit is "Pillar 2 maintenance," less-effort path is evaluated explicitly in § Filter pass walkthrough.

**Document structure:**
- **Part I — V1 Deep Dive** (~6000 words). What it is, isn't, how it works, who buys, why, full competitive landscape, pros/cons, filter pass, V1 build plan.
- **Part II — Critic Pass on V1** (~4000 words). Adversarial stress test from every angle. Why V1 will fail and precisely how.
- **Part III — V2 Redesign** (~4000 words). Specific fixes for each critic concern. Why V2 succeeds. Updated build plan. New risks.

---

# Part I — V1 Deep Dive

## 1. Executive summary

The gap map is a **signed nightly artifact** derived from TrustBench's existing crawler infrastructure. It buckets every endpoint the crawler has observed across the x402 ecosystem (Base + Solana, multiple discovery sources) into a finite capability taxonomy, and publishes the result as JSON + CSV + HTML at `trustbench.io/coverage*`. Every nightly run is Ed25519-signed and anchored on-chain via the same receipt infrastructure that TrustBench's `/route` and `/receipts/:id` already use (`receipt-spec-v1.md`).

The product is **not** another x402 dashboard. The product is the **signed snapshot itself** — a time-pinned, cryptographically verifiable, machine-replayable "what was on x402 at 2026-05-14 03:00 UTC" that any external party can cite by hash six months later.

The value proposition splits across three audiences:

1. **Agent builders.** A canonical "what's available, what's missing" map they can program against. Today they hand-curate from x402scan, agentic.market, Bazaar, Heurist Mesh, and pay.sh; tomorrow they call one `/coverage.json` endpoint and route.
2. **Endpoint operators (potential Option A partners).** A public artifact that names where the ecosystem has zero coverage. Sophymarine / AnChain / Heurist / httpay see their visibility (or lack thereof) and have a hook to engage TrustBench (Option A outreach lands harder when the gap map exists).
3. **Researchers and auditors.** A signed historical ledger of the x402 ecosystem's evolution that can be cited authoritatively (BlockRunAI-style reports footnote a specific TrustBench-signed coverage hash; regulators audit a specific snapshot date).

The build is **incremental on existing infrastructure** — crawler runs nightly already, scoring pipeline runs nightly already, content-negotiated HTML/JSON pattern already shipped at `/rankings` and `/receipts/:id`, signing + on-chain anchor + verifier package already shipped. The net-new work is (a) capability taxonomy + bucketing heuristics, (b) coverage export workflow, (c) `/coverage` route, (d) snapshot-versioning discipline. Estimated effort: 1 weekend for V1, plus ~1 day of taxonomy iteration over the following week.

The competitive landscape is **contested but the specific signed-nightly-snapshot shape is unclaimed** (see § Competitive landscape below). TrustBench's defensible angle is its existing receipt infrastructure, which no current competitor matches.

## 2. What the gap map does

### 2.1 Concretely shipped artifacts

**`/coverage.json`** — machine-readable canonical artifact. Contains:
- `snapshot_id` (ULID, e.g. `cvg_01KQZ...`)
- `generated_at` (ISO 8601 UTC, e.g. `2026-05-14T03:00:00.000Z`)
- `crawler_sources` — list of sources crawled with last-fetch timestamp per source (Bazaar, agentic.market, Heurist Mesh, pay.sh, hardcoded fallbacks)
- `taxonomy_version` — string referring to the published taxonomy spec (e.g. `taxonomy-v1.0`)
- `categories` — array of capability buckets with per-bucket: endpoint count, alive count (uptime ≥ 80%), network distribution, top-3 latency-leader endpoints (provider_id + score + uptime_7d), full endpoint list
- `gaps` — array of taxonomy categories with **zero or near-zero coverage** explicitly named
- `signature` — Ed25519 signature over JCS-canonicalized body
- `settlement_anchor` — { tx_hash, chain, block_number } for the on-chain anchor

**`/coverage.csv`** — flat human-readable export. One row per endpoint, with columns: `category`, `provider_id`, `network`, `score`, `uptime_7d`, `latency_p50`, `last_updated`. Same shape as the existing Paddock rollup CSV. Suitable for spreadsheet analysis.

**`/coverage` HTML** — browser-facing rendering. Cross-network framing (Base + Solana columns). Per-category drill-down. Highlights gaps prominently. Links to `/coverage.json` and `/coverage.csv` for machine consumption.

**`/coverage/:snapshot_id`** — historical snapshot retrieval. Every nightly run preserves the prior snapshot. Same content-negotiated pattern as `/rankings` and `/receipts/:id`. 24h Cache-Control immutable on resolved snapshots.

**`/.well-known/trustbench-coverage.json`** — pointer to the latest snapshot URL + taxonomy spec URL + public key URL. Discoverable by agents at a stable path.

### 2.2 The capability taxonomy

The taxonomy is the load-bearing design choice. It determines what counts as "coverage" and what counts as "gap." V1 proposes a deliberately **conservative, descriptive** taxonomy — what endpoints visibly do, not what they could do. Iteration in subsequent versions.

Proposed V1 categories (~14, expandable):

| Category | Description | Examples in registry |
|---|---|---|
| `defi.reads` | On-chain protocol state aggregation | Heurist BaseUSDCForensicsAgent, DefiLlamaAgent, Aave-flavored agents |
| `defi.governance` | Governance proposal + vote tally reads | Snapshot tally agents (none in registry yet) |
| `onchain.rpc` | Generic JSON-RPC pay-per-request | QuickNode 20+ chain endpoints |
| `onchain.indexers` | The Graph / Allium / Artemis-shaped queryable indexes | The Graph Gateway (if indexed), Dune (not in registry) |
| `search.web` | General web search and crawling | Brave Search, Browserbase, Hyperbrowser, Anchor Browser, Exa, Firecrawl |
| `search.research` | LLM-orchestrated research agents | Caesar Research, FirecrawlSearchDigestAgent |
| `social.intelligence` | Twitter/Farcaster intel agents | TwitterIntelligenceAgent, ElfaTwitterIntelligenceAgent, MoniTwitterInsightAgent |
| `crypto.market_data` | Token prices, market data, screeners | CoinMarketCap, Messari, Nansen, JeetScreener |
| `crypto.news` | Crypto news aggregation | YahooFinanceAgent news_search, UnifaiWeb3NewsAgent |
| `inference.llm` | LLM inference endpoints | (158 in registry tagged `inference`) |
| `infrastructure.compute` | Browser sessions, headless browsers, code sandboxes | Browserbase, Anchor Browser sessions |
| `infrastructure.payments` | Facilitator + settlement primitives | QuickNode Base mainnet payment endpoint, x402 facilitator endpoints |
| `data.public_registry` | Public-record lookups (SEC, Companies House, GLEIF, etc.) | Heurist SecEdgarAgent |
| `data.specialized` | Domain-specific data (FDA, USPTO, weather, etc.) | (none yet in registry) |

Explicit gap categories (zero coverage as of 2026-05-14 probe):
- `data.public_registry` (non-US): UK Companies House, German Handelsregister, French RNE — covered by OpenRegistry (Sophymarine) off-x402 but not in TrustBench inventory
- `crypto.fx`: fiat conversion (FX) — uncovered
- `compliance.sanctions`: OFAC/EU/UK name screening — covered by anchor-x402-mcp off-TrustBench inventory
- `compliance.regulatory`: VAT (VIES), USPTO trademark, FDA recall, court PACER — uncovered
- `security.posture`: DNS/SSL/security observations — covered by Pylon + agentsvc.io off-TrustBench inventory
- `crypto.timestamping`: RFC3161, drand — uncovered
- `content.extraction`: PDF page extraction, OCR — partially covered by Pylon + agentsvc.io
- `verification.email`: DKIM/SPF/DMARC — uncovered

The gap categories aren't fabricated — they're the categories the 2026-05-14 endpoint portfolio research surfaced as candidates. The taxonomy is literally the lens that turned that research into a structured artifact.

### 2.3 Bucketing heuristics

V1 uses URL-pattern + name-keyword matching:

```
if "aave" in name or "lend" in name → defi.reads
if "uniswap" in name or "swap" in name → defi.reads
if "snapshot" in name or "governance" in name → defi.governance
if "rpc" in URL or "x402.quicknode" in URL → onchain.rpc
if "brave" in name or "search" in name → search.web
if "twitter" in name or "tweet" in name → social.intelligence
if "edgar" in name or "filing" in name → data.public_registry
if "coinmarketcap" in name or "messari" in name → crypto.market_data
...
```

Heuristics will be wrong on edge cases. V1 accepts this and exposes `?include_uncategorized=true` to surface what fell through. Iteration tightens the bucketing over the first few snapshots. Versioned in `src/coverage/taxonomy-v1.ts` so changes are explicit.

Endpoints in multiple buckets (e.g. Heurist's UnifaiWeb3NewsAgent serves both search.web + crypto.news) are assigned to all relevant categories. The taxonomy is intentionally not mutually exclusive.

### 2.4 The signing + anchoring discipline

Every nightly snapshot is treated as a receipt. Same receipt infrastructure as `/route` (`rrcpt_`) and `/screen/:id` (Phase 3 `rcpt_`).

- **Receipt prefix:** `cvg_` (coverage). Justified by the same logic as the OFAC `sscrn_` prefix discussion — different issuer kind, different prefix lets verifiers branch.
- **Envelope kind:** `coverage_snapshot.v1` in the receipt `kind` field.
- **Signed body:** JCS-canonicalized JSON of the full snapshot (excluding the signature itself).
- **On-chain anchor:** SHA-256 hash of the JCS body, anchored via a small `OP_RETURN`-equivalent transaction on Base mainnet (or referenced from a known anchoring transaction emitted nightly).
- **Verifier package:** `@trustbench/verify-receipt` v0.1.1 (or newer) extended to accept the `coverage_snapshot.v1` kind. Same dual-probe pattern as the existing `receipt.paid` vs `receipt.settlement` shapes.
- **Public key:** served at `/.well-known/trustbench-pubkey` (already shipped).

Anyone can validate a snapshot independently:
```bash
npx @trustbench/verify-receipt cvg_01KQZ... --check-chain
```

The signing infrastructure already exists. The only net-new work is the envelope `kind` + the verifier branch. Both are <50 lines of TypeScript.

## 3. What the gap map does NOT do

Explicit non-goals (these matter as much as the goals):

- **Not a real-time dashboard.** Real-time is what x402scan, x402 Atlas, x402station, agentic.market do. The gap map is a *historical-record-grade* nightly snapshot. Users who want millisecond-fresh state go to the live dashboards.
- **Not a sentiment / reputation scorer.** Categories and counts only. Scores per-endpoint are propagated from TrustBench's existing scoring pipeline but the gap map does NOT add new ranking opinions. x402 Atlas already does reputation; the gap map is purely structural.
- **Not paid in V1.** V1 is free read. The artifact has to be discoverable + verifiable + citable before it has economic value. Charging in V1 would block all three.
- **Not an aggregator of competing dashboards.** It is its own independent crawler output, not a meta-rollup of x402scan + agentic.market + others. Independence is the trust-substrate.
- **Not a compliance product.** Honest-framing rule (per `CLAUDE.md`): the gap map is "x402 capability coverage measurement," not "x402 compliance certification." Never use "audit," "certified," "verified compliant" in public copy.
- **Not a recommendation engine.** It does not say "use endpoint X for capability Y." That's `/route`'s job — and `/route` is governed by separate routing logic the gap map deliberately doesn't replicate.
- **Not a comprehensive ecosystem map.** L402 + MPP aren't crawled in V1. (402index.io covers protocol-agnostic; the gap map is x402-scoped initially. V2 may extend.)
- **Not a methodology certification.** The gap map describes what the *TrustBench crawler* found. Endpoints hosted but not crawler-discovered won't appear. The HTML page must say this prominently and the JSON must carry `crawler_blindness_disclaimer`.
- **Not a Phase 5 commitment.** This is Pillar 2 maintenance shipped early. Phase 5 design seeds remain separate (`phase5-design-seeds.md`).

## 4. How the gap map works — technical implementation

### 4.1 Architecture

Reuses existing TrustBench infrastructure end-to-end:

```
Existing crawler (nightly cron 03:00 UTC)
    ↓
src/crawler.ts → providers table (Supabase)
    ↓
src/prober.ts → probes table (per-endpoint, per-night)
    ↓
src/scorer.ts → scorecards table (per-endpoint, per-night)
    ↓
[NEW] src/coverage.ts → coverage_snapshots table
    ↓
[NEW] /coverage routes (Hono, content-negotiated)
    ↓
[NEW] @trustbench/verify-receipt extension for cvg_ envelope
```

### 4.2 New code surfaces

- **`src/coverage/taxonomy-v1.ts`** — the capability taxonomy (~14 categories) + bucketing heuristics. Pure functions. Versioned.
- **`src/coverage/snapshot.ts`** — reads from `providers` + `probes` + `scorecards`, applies taxonomy, emits the snapshot JSON. Calls existing signing functions.
- **`src/coverage/routes.ts`** — Hono routes for `/coverage`, `/coverage.json`, `/coverage.csv`, `/coverage/:snapshot_id`, `/.well-known/trustbench-coverage.json`.
- **`src/coverage/html.ts`** — HTML rendering of the snapshot. Uses the same template pattern as `/rankings`.
- **`.github/workflows/nightly-coverage-export.yml`** — runs after `nightly-pipeline.yml` completes. Commits the latest CSV to `exports/coverage-latest.csv` + dated archive (like `exports/rollup-latest.csv` does for Paddock).
- **`@trustbench/verify-receipt`** patch — accept `coverage_snapshot.v1` envelope kind. Minor version bump (e.g. v0.2.0).

### 4.3 New database surface

```sql
-- Coverage snapshots — one row per nightly run
CREATE TABLE coverage_snapshots (
  snapshot_id TEXT PRIMARY KEY,            -- ULID: cvg_01KQZ...
  generated_at TIMESTAMPTZ NOT NULL,
  taxonomy_version TEXT NOT NULL,
  body_jcs_hash TEXT NOT NULL,             -- SHA-256 of JCS-canonicalized body
  signature TEXT NOT NULL,                 -- Ed25519 signature
  settlement_tx_hash TEXT,                 -- On-chain anchor (nullable until anchored)
  settlement_chain TEXT,
  body JSONB NOT NULL                      -- Full snapshot body
);
CREATE INDEX coverage_snapshots_generated_at_idx ON coverage_snapshots (generated_at DESC);

-- Row-level security: public read on resolved rows
ALTER TABLE coverage_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY coverage_snapshots_public_read ON coverage_snapshots
  FOR SELECT USING (settlement_tx_hash IS NOT NULL);
```

The `body JSONB` field is stored verbatim alongside the structured columns for full replayability. Storage cost is negligible (~50KB per snapshot × 365 nights = ~18MB/year).

### 4.4 Per-night execution

1. Nightly probe pipeline completes at ~03:00 UTC (existing).
2. `nightly-coverage-export.yml` triggers `npm run coverage:snapshot`.
3. The script reads `providers` + latest `probes` + latest `scorecards`, applies the taxonomy, builds the JSON body.
4. Body is JCS-canonicalized + SHA-256 hashed + Ed25519 signed using the production keypair (already in Railway env).
5. Body is written to `coverage_snapshots`. ULID assigned.
6. On-chain anchor transaction submitted to Base mainnet (small `OP_RETURN`-equivalent log emission, ~$0.005/night gas cost).
7. Once tx confirms, `settlement_tx_hash` + `settlement_chain` are populated and RLS gates open for public read.
8. CSV export committed to `exports/coverage-latest.csv` + `exports/coverage-2026-05-14.csv` (dated archive).
9. `/.well-known/trustbench-coverage.json` updated to point to the new snapshot.

### 4.5 Operational considerations

- **Gas cost.** ~$0.005/night for the on-chain anchor. ~$1.83/year. Negligible vs the $50/mo infra cap.
- **Storage cost.** ~18MB/year of snapshot bodies in Supabase. Free tier handles ≫ this for the next decade.
- **Failure modes.** If the probe pipeline fails, the snapshot is skipped (don't sign a partial truth). If the on-chain anchor fails, the snapshot is written but RLS keeps it private until the anchor lands. If the bucketing heuristics fail catastrophically, `?include_uncategorized=true` surfaces the dropped endpoints.
- **Monitoring.** Same daily nightly-pipeline cron monitoring as today. If `/coverage.json` doesn't refresh within 24h, alert.

## 5. Intended audience: who is the gap map FOR

V1 has three distinct audiences with different value propositions. Conflating them dilutes the product; identifying them sharpens it.

### 5.1 Audience 1 — Agent builders ("the integrator")

**Profile.** A developer building an agentic application that needs to route to x402 endpoints. Currently hand-curates from x402scan / agentic.market / Bazaar / Heurist Mesh / pay.sh; tracks which endpoints are alive; debugs when one goes down.

**Pain.** Discovery is fragmented across 5+ sources. Capability-bucket questions ("which x402 endpoints can do FX conversion?") require manual cross-referencing. No single source of truth for "what's available."

**What they get from the gap map.**
- Single `GET /coverage.json` call returns the full ecosystem map by category.
- Capability-bucket filtering: "give me all `data.public_registry` endpoints" returns a programmatic list.
- Gap visibility: "no x402 endpoint covers `crypto.timestamping`" tells them not to waste integration time looking.
- Snapshot-pinning: they can pin their integration to `coverage-2026-05-14` and replay later if behavior changes.

**Why they'd pay (eventually).** V1 is free. V2 could charge for high-volume programmatic access (`/coverage.json?live=true` at $0.001/call). But the V1 value is discovery-cost reduction, not direct revenue.

**Failure mode for this audience.** If the agent builder's framework already integrates x402scan or agentic.market natively (LangChain, AutoGen, Strata, AgentlyHQ may), the gap map is redundant. **The fix: ship the gap map as a Coverage MCP server so agent frameworks can hook it natively** — but that's V1.5 or V2, not V1.

### 5.2 Audience 2 — Endpoint operators ("the merchant")

**Profile.** Someone running an x402 endpoint (Pylon, agentsvc.io, anchor-x402-mcp, httpay.xyz, Sophymarine's OpenRegistry, Heurist Mesh contributors). Wants their endpoint discovered.

**Pain.** Discovery surfaces are fragmented. They list on awesome-x402, agentic.market, Bazaar — but each list has different requirements + different verification + different visibility.

**What they get from the gap map.**
- Coverage visibility. Their endpoints show up (or don't) in TrustBench's snapshot. If they don't, that's a discovery problem they can act on (e.g., self-register via TrustBench's existing crawler hints).
- Category positioning. The taxonomy tells them what category they're seen as covering — and gives them a signal if they're being miscategorized (and surfaces a self-correction path).
- Gap signal. They can see which capability buckets are uncovered and decide to ship there.

**Why they'd care.** Operators want their endpoints used. The gap map is a free, public, signed artifact that names them by category. That's marketing they didn't have to do.

**Why TrustBench cares about THIS audience specifically.** This is **the Option A outreach hook.** Today, cold-pitching "would you adopt TrustBench-format receipts?" is hard. With the gap map live, the pitch becomes "your endpoints aren't in our coverage map yet — and we'd love to wrap them with TrustBench-format receipts when they are." That's a warm-DM template, not a cold pitch. The gap map is **the artifact that makes Option A executable.**

**Failure mode for this audience.** If operators feel the categorization is wrong or the visibility is unfair, they'll publish their own counter-rankings. **The fix: open the taxonomy file in the repo, accept GitHub issues against it, version the taxonomy explicitly so operators can argue.** Transparency converts the failure mode into community contribution.

### 5.3 Audience 3 — Researchers + auditors ("the citer")

**Profile.** Crypto-research analysts (Messari, Delphi, BlockRunAI, DWF Labs), regulatory researchers, x402 ecosystem participants writing state-of-the-art reports, journalists. Need to cite x402 ecosystem state authoritatively.

**Pain.** Current ecosystem data is real-time and ephemeral. x402scan shows "now." agentic.market shows "now." BlockRunAI's December 2025 PDF shows December 2025. There's no machine-citable "as of date T, here's the ecosystem state, signed."

**What they get from the gap map.**
- Cite by snapshot ID. "Per TrustBench coverage snapshot `cvg_01KQZ...` of 2026-05-14, x402 had N endpoints across M categories."
- Diff between snapshots. "Between 2026-05-14 and 2026-06-14, `defi.reads` grew from 12 to 19 endpoints."
- Cryptographic verifiability. "The cited snapshot is signed and on-chain anchored; verifier package is at npm/@trustbench/verify-receipt."

**Why they care.** Research artifacts are higher-value when their data substrate is verifiable. Citing a signed snapshot is different from citing a live dashboard that has since changed.

**Why TrustBench cares about THIS audience specifically.** BlockRunAI's WEB_STATE_OF_X402 is the closest existing report-shaped artifact. Co-publishing with BlockRunAI (or its successors) is a **direct Option A move** — they take the signed nightly coverage feed as their data substrate, and TrustBench-format becomes the citable receipt envelope for ecosystem research. That's Pillar 1 with concrete adoption.

**Failure mode for this audience.** If the taxonomy or methodology is contested, researchers won't cite. **The fix: publish the methodology as `coverage-methodology-v1.md` alongside the artifact, version it, accept critique.** Same discipline as the existing TrustBench `/methodology` page.

### 5.4 The Audience Matrix (V1 priority)

| Audience | V1 value | Long-term value | Option lever |
|---|---|---|---|
| Agent builders | discovery cost reduction | programmatic routing source | Option B (build canonical primitives that fill gaps) |
| Endpoint operators | free positioning + visibility | Option A outreach hook | **Option A (the primary lever)** |
| Researchers/auditors | citable snapshots | de facto ecosystem ledger | Option A (research adoption) + Pillar 1 demonstration |

**Conclusion:** all three audiences benefit. The product-market-fit center of gravity is endpoint operators (Option A) and researchers/auditors (Pillar 1). Agent builders are an obvious user but not the strategic target.

## 6. Why the gap map should exist — the case from each angle

### 6.1 Strategic angle

The gap map is the **single highest-leverage move** that advances both pillars simultaneously without committing to Option A, B, or C:

- **Pillar 2** advance: it's a new public discovery surface derived from existing infrastructure. Zero marginal infra cost.
- **Pillar 1** advance: the signed envelope demonstrates TrustBench's receipt format at ecosystem scale — every external party who interacts with the artifact sees `cvg_` + Ed25519 + on-chain anchor.
- **Decision option preservation:** does not commit to A, B, or C. After the gap map ships, the data it produces makes the Option choice easier (which projects to approach for A, which categories to build for B, etc.).

### 6.2 Tactical angle

The gap map is the **artifact that makes Option A executable.** Today, Option A outreach is cold-pitching receipt format adoption to projects that have no concrete reason to engage. With the gap map live, the outreach becomes: "your endpoints are (or aren't) in coverage snapshot X — we'd love to make them more visible AND give them TrustBench-format receipts." Concrete, warm, action-able.

### 6.3 Economic angle

- **Marginal infra cost:** ~$1.83/year gas + free-tier Supabase + free-tier Cloudflare hosting. Zero.
- **Build cost:** ~1 weekend for V1, ~1 day taxonomy iteration. Solo-founder budget fits.
- **Maintenance cost:** the crawler already runs nightly. The coverage workflow is a thin layer on top. ~0 hours/week ongoing.
- **Revenue potential V1:** zero (intentional). V2+ optional: high-volume programmatic access + premium taxonomy customization + research-product partnerships.

### 6.4 Network-effect angle

The gap map compounds. Every nightly snapshot is a new data point. After 30 days, TrustBench has a diff-able time series no competitor has. After 365 days, TrustBench has an authoritative historical ledger of x402 ecosystem evolution — the equivalent of internet archive for the agentic-payments era. **The first 30 days create modest value; the 365th-day value is structural.**

### 6.5 Defensive angle

If TrustBench doesn't ship a signed nightly snapshot, someone else likely will within 6 months — either x402scan adds it (Merit Systems has the engineering), x402 Atlas adds it (they already claim "cryptographically verifiable"), OpenDexter adds it (token-funded velocity), or BlockRunAI commercializes its periodic reports. Shipping V1 now establishes TrustBench as the first-mover on the *signed citable artifact* axis specifically — the axis no current competitor occupies.

## 7. Competitive landscape

Comprehensive competitive scan completed 2026-05-14. Findings:

### 7.1 Direct competitors (overlap HIGH)

- **x402scan.com** (Merit Systems, open-source, Coinbase Dev endorsed). Real-time dashboard + transaction analytics + facilitator activity. No capability buckets explicitly; origin/server-level grouping. **No signed nightly artifact.** [x402scan.com](https://www.x402scan.com/)
- **x402atlas.com.** Real-time analytics with filter-by-category + reputation scoring + pricing benchmarks. Closest UI-shape competitor. Claims "cryptographically verifiable" data but no published verifier package or signing spec. [x402atlas.com](https://x402atlas.com/)
- **x402station.com.** 200+ x402 APIs across categories (AI inference, news, blockchain data, content gen). Real-time dashboard. **No signed nightly artifact.** [x402station.com](https://x402station.com/)
- **agentic.market** (Coinbase). 7 categories (Inference, Data, Media, Search, Social, Infrastructure, Trading), curated + semantic search. Real-time, live metrics. Coverage of *CDP-facilitator-routed endpoints only*. **No signed nightly artifact.** [agentic.market](https://agentic.market/)
- **402index.io** (Merit Systems family). Protocol-agnostic directory (L402 + x402 + MPP). 15,000+ APIs. Category-aware. Domain-verification flow. **No signed nightly artifact.** [402index.io](https://402index.io/)
- **x402index.com / x402search.xyz.** Autonomous indexer, paywalled search ($0.01/query), 13,000+/12,845+ resources indexed, MCP-exposed. **No signed nightly artifact.** [x402index.com docs](https://www.x402index.com/docs)
- **OpenDexter / dexter.cash.** Already shipped (contrary to assumptions in earlier strategy docs). "Quality-verified index of every paid API in x402 ecosystem" — public no-auth MCP, 5,000+ paid APIs searchable, ChatGPT/Claude connectors. Tool metadata includes `category` field. **No signed nightly artifact.** [dexter.cash](https://dexter.cash/) [docs.dexter.cash](https://docs.dexter.cash/)
- **pay.sh** (Solana Foundation × Google Cloud). Discovery catalog indexed across Solana agent facilitators. Categories include e-commerce, market-data, communications, on-chain infrastructure. **No signed nightly artifact.** [pay.sh](https://pay.sh/)

### 7.2 Adjacent reports / artifacts

- **BlockRunAI WEB_STATE_OF_X402.md.** December 2025 quantitative report (63M tx, $7.5M USDC, 1,100+ projects, 4,800+ mainnet endpoints, category breakdown Data 31% / AI 25%). **Closest report-shaped analog.** One-shot, not nightly, not signed. **The natural Option A partnership for the gap map.** [GitHub](https://github.com/BlockRunAI/awesome-blockrun/blob/main/research/WEB_STATE_OF_X402.md)
- **Allium x402 dashboard.** Enterprise blockchain-data product with x402 metrics. [Allium x402 dashboard](https://app.allium.so/s/KZ2yCo0Z)
- **Artemis x402 analytics.** Transaction-volume focus, not capability-bucket coverage. [Artemis x402 asset page](https://app.artemisanalytics.com/asset/x402)
- **Decasonic Market Map** (Oct 2025), **Scattering EcoMap**, **DWF Labs research piece**, **Bitget "x402 Doers" list.** Visual one-shot maps. Not nightly, not signed.

### 7.3 Adjacent MCP-shaped competitors

- **Smithery.ai** (7,300+ MCP servers across categories). Not x402-specific. No signed artifact.
- **Glama.ai** (23,581 MCP servers across 76 categories). Not x402-specific. No signed artifact.

### 7.4 The whitespace

**No competitor ships the combination:**

1. Cross-source authoritative inventory (Bazaar + agentic.market + Heurist Mesh + pay.sh + hardcoded fallbacks) — most competitors are CDP-Bazaar-only or self-merchant.
2. Capability-bucket categorization that *names gaps* explicitly — most competitors show coverage but not absence.
3. Ed25519-signed JCS-canonicalized JSON with third-party-verifier package (`@trustbench/verify-receipt`) — none of the 8+ surveyed competitors ship this.
4. On-chain settlement anchor — none.
5. Time-pinned snapshot versioning — all surveyed competitors are real-time-only.
6. Diff view (snapshot N vs snapshot N-1) — none.

The first axis (cross-source) is partially contested (402index.io is multi-protocol; x402scan + Coinbase Bazaar are cross-source within x402). The second (gap-naming) is contested (x402 Atlas filters by category but doesn't explicitly enumerate gaps as a feature). **The third through sixth axes — signed, anchored, time-pinned, diff-able — are uncontested.**

### 7.5 Differentiation thesis

TrustBench's gap map is positioned as **the receipt of x402's coverage**, not another dashboard *of* x402. Live dashboards (x402scan, x402 Atlas, agentic.market, OpenDexter) are the *present*. TrustBench gap map is the *signed witness to the present* — citable, diff-able, replayable. The pillars filter says TrustBench should not compete on dashboard UX; TrustBench should own the cryptographic-attestation layer. The gap map does exactly that for ecosystem-level data.

## 8. Pros and cons from multiple angles

### 8.1 Pro angles

**Pro (engineering).** Reuses 100% of existing crypto + crawler + content-negotiation infrastructure. Marginal code is <500 lines TypeScript. Marginal infra is $1.83/year. Zero new dependencies. Zero new services.

**Pro (strategic).** Advances both pillars simultaneously. Preserves Option A/B/C decision. Compounds nightly. Creates first-mover lock on the cryptographic-attestation axis no competitor occupies.

**Pro (defensive).** If TrustBench doesn't ship this, x402scan / x402 Atlas / OpenDexter likely will within 6 months. Shipping V1 now is the move that prevents being commoditized on the one axis where TrustBench is uniquely positioned.

**Pro (operational).** Zero ongoing manual work. Same nightly pipeline already runs. Adds one more workflow step. Self-maintaining.

**Pro (alignment).** Matches Johan's calibration cleanly. Solo-founder budget. $0/mo additional spend. Boring (in the productive sense). Honest framing throughout. Non-custodial. No regulated work.

**Pro (network-effect).** Diff-able historical ledger after 30 days; structural moat after 365 days.

**Pro (Option A enabler).** Turns cold-pitch outreach into warm-DM with a concrete artifact.

### 8.2 Con angles

**Con (timing).** All 8+ competitors are real-time dashboards built by teams 2-10x larger than TrustBench. If any of them ships signed nightly snapshots in the next 6 months, the differentiation collapses. Window is open but estimated short.

**Con (audience definition).** Three audiences with different needs — risks not landing fully with any single one. Researchers may want different fields than agent builders. Operators want different framing than auditors.

**Con (heuristic brittleness).** URL-pattern + name-keyword bucketing is naive. Endpoints with cryptic names get misbucketed. Operators publish counter-rankings if they feel miscategorized.

**Con (gap-claim risk).** Saying "no x402 endpoint covers FX conversion" implicitly invites someone to ship one within a week (good outcome) — but if the gap-claim is wrong (the crawler missed an endpoint), TrustBench looks careless. Crawler-blindness disclaimer is necessary but doesn't fully mitigate.

**Con (revenue ambiguity).** V1 is free. Revenue model for V2+ is unclear. If the gap map doesn't lead to Option A partnerships or B/C revenue, it's a sunk-cost time investment.

**Con (taxonomy debate trap).** Once published, the taxonomy invites argument. Solo founder can't moderate a heated category debate while also continuing Phase 4 work.

**Con (low engagement risk).** Researchers cite reports; agent builders use APIs. The third audience (operators) cares most. If endpoint operators see no value (because they're already on agentic.market and don't need TrustBench too), the strategic Option-A-enabler thesis collapses.

**Con (Pillar 1 dependency).** The gap map's strategic value depends partially on the signing infrastructure being recognized as canonical. If PEAC Protocol or x402 v2 ships a different receipt format and gains traction, the gap map's signed envelope becomes "yet another signed format" rather than "the canonical one."

**Con (frontier-model risk).** What stops Claude or GPT from being asked "what x402 endpoints exist?" and answering correctly from training data + live calls to x402scan? The gap map's structural answer (citable, replayable, signed) survives this — but the *casual lookup* value evaporates.

### 8.3 The con synthesis

The biggest single con is **timing**. The window for being the first signed-nightly-coverage product on x402 is open as of 2026-05-14, but it's a window, not a permanent moat. The second biggest con is **audience-fit risk**: three audiences with different needs may mean none gets fully served. The third biggest is **heuristic brittleness** in V1 — taxonomy and bucketing both need iteration.

These three are the natural targets for the V2 redesign after the critic pass.

## 9. Filter pass walkthrough (CLAUDE.md § Mandatory Pre-Development Filter)

Walking through the six questions explicitly:

### Q1: Which Pillar does this advance (1, 2, both, neither)?

**Both.** Primary: Pillar 2 (neutral routing+receipt layer extended with discovery-surface artifact). Secondary: Pillar 1 (canonical receipt-format standard, demonstrated at ecosystem-data scale).

### Q2: If Pillar 1, how specifically (adoption / demonstration / reference / spec / outreach)?

**Demonstration + adoption-enabler.** The signed snapshot envelope is a reference implementation of the receipt format applied to ecosystem-level data (not just routing). Any external party verifying a snapshot via `@trustbench/verify-receipt` sees the format work in production at scale. Additionally, the gap map becomes the *enabling artifact* for Option A outreach — adoption follows.

### Q3: If Pillar 2, how specifically (inventory / coverage / robustness / intelligence / discovery)?

**Discovery surface.** The gap map is itself a new discovery surface that surfaces *every* endpoint the crawler observes across the ecosystem, bucketed by capability. It strengthens Pillar 2 by giving agents a single canonical place to ask "what's available."

### Q4: If neither, WHY?

N/A — advances both.

### Q5: Which Option does this fit under (A / B / C / Pillar 2 maintenance)?

**Pillar 2 maintenance** in classification, **Option A enabler** in strategic effect. The build itself is Pillar-2-maintenance-shaped (derived from existing crawler, no new product surface beyond a derived artifact). The strategic value is Option A enablement (the artifact makes partnership outreach concrete).

### Q6: Is there a less-effort partnership path to the same Pillar advancement?

**Examined explicitly per the filter's guidance.** Three candidate partnerships could substitute for building:

- **Co-publish with BlockRunAI.** They have the closest existing report. Partnership: TrustBench provides signed nightly coverage data; BlockRun publishes periodic reports referencing TrustBench-signed snapshots as the data substrate. This advances Pillar 1 (BlockRun cites TrustBench receipt format) AND avoids building the public artifact ourselves. **However:** BlockRun is one-shot/periodic, not nightly; their reports aren't a substitute for the always-on artifact; and TrustBench's gap map can publish *to* BlockRun even after BlockRun publishes their next report. The partnership is *additive*, not a substitute.

- **Partner with x402scan / Merit Systems.** They have the multi-source crawler; TrustBench adds signing. The technical fit is good. **But:** x402scan is open-source and already operates without signed snapshots; convincing them to integrate TrustBench's signing for what is currently a free dashboard requires them to see value, which depends on the gap map existing first. Sequence problem: build first, partner second.

- **Partner with x402.org or Coinbase to ship coverage as official.** Highest-impact partnership, lowest-probability. Would foreclose competitive options. **And again:** the conversation requires existing artifact to anchor.

**Conclusion on Q6:** All three plausible partnerships *follow* the gap map existing rather than substituting for it. No less-effort partnership path supersedes the build. The build IS the less-effort move because it's <500 lines of net-new code on existing infrastructure.

### Q6 (extended): Cost vs build

- Build cost: ~1 weekend + ~1 day taxonomy iteration. ~$0 marginal infra.
- Partner-first cost: 4-8 weeks of outreach + dependency on partner willingness + no artifact to ship in the interim.

Build wins on cost-per-pillar-advancement.

### Filter verdict

**Passes all six questions cleanly.** Proceed to build per the sequence in `sequence-of-work-2026-05-14.md`.

## 10. V1 build plan

### 10.1 Sequencing

- **Day 1 (4-6 hours).** Define taxonomy-v1.0 (~14 categories). Write bucketing heuristics. Write unit tests against representative endpoints from the 2026-05-14 probe.
- **Day 2 (4-6 hours).** Build `src/coverage/snapshot.ts`. Wire to existing signing infrastructure. Test on Friday's nightly pipeline output offline.
- **Day 3 (3-4 hours).** Build `/coverage` routes. HTML rendering. Content negotiation. `/coverage/:snapshot_id` for historical retrieval. `/.well-known/trustbench-coverage.json`.
- **Day 4 (1-2 hours).** GitHub Actions workflow. Push to production. First live snapshot.
- **Day 5 (1-2 hours).** Patch `@trustbench/verify-receipt` to v0.2.0 with `coverage_snapshot.v1` envelope kind. Publish.
- **Day 6-7 (1-2 hours each).** Taxonomy iteration based on the first 3-5 live snapshots.

Total: ~1.5 weekends including taxonomy iteration.

### 10.2 Success criteria (V1)

- One published live snapshot at `trustbench.io/coverage` (HTML + JSON + CSV).
- Snapshot verifies clean via `@trustbench/verify-receipt --check-chain`.
- Crawler-blindness disclaimer prominent in HTML; explicit in JSON.
- Methodology page at `/coverage/methodology` (or section of existing `/methodology`).
- Taxonomy file open-sourced (`src/coverage/taxonomy-v1.ts` visible in repo).
- Reasonable bucketing on first snapshot (<10% endpoints in "uncategorized").

### 10.3 90-day kill criteria

Per the standing pillars-filter discipline:

- **Kill if (by 2026-08-14):** zero external citation / engagement (no X repost from a non-TrustBench-affiliated account, no GitHub issue from a non-TrustBench-affiliated account, no DM from any of the 8 surveyed competitors). Signals the artifact has zero ecosystem pull.
- **Kill if (by 2026-08-14):** a competitor (x402scan, x402 Atlas, OpenDexter, agentic.market) ships signed nightly snapshots with their own verifier. Signals the moat closed; reassess Pillar 1 framing entirely.
- **Reframe if (by 2026-08-14):** the gap map gets used by researchers (one citation in a public report counts) but not by operators (no Option A outreach success). Signals Pillar 1 demonstration is working but Pillar 2 / Option A is not — adjust public copy and outreach accordingly.

### 10.4 Open questions for Johan

- Should V1 emit on-chain anchors for *every* snapshot or batch (one anchor every N snapshots to reduce gas)? Default V1: every snapshot, given the negligible cost.
- Should the gap map crawl beyond x402 in V1 (e.g., L402 endpoints via 402index.io's data)? Default V1: x402-only with explicit scope note.
- Should the taxonomy be published as a separate npm package (`@trustbench/coverage-taxonomy`) for community PRs, or kept in the main repo? Default V1: main repo, separate package only if PR volume justifies.

---

# Part II — Critic Pass on V1 (Adversarial Stress Test)

## Bottom-line verdict

**Strong-reject as currently designed, with a clear path to acceptable-after-redesign.** V1's central premise — that "no competitor ships signed nightly snapshots, the third-through-sixth axes (signed, anchored, time-pinned, diff-able) are uncontested" — is materially false at the moment the doc was written. x402 Atlas already returns "a signed PEAC-Receipt header binding payment proof to the delivered response and policy, verifiable offline." Dexter has flipped Coinbase as the #1 facilitator (50%+ daily volume, 25M+ settlements) and ships `x402gle` which "indexes every facilitator, every resource, every chain in real time, tracking who is paying who, for what, how often, and whether the response was any good" — that is the gap map's job, shipped, by a token-funded competitor. PEAC Protocol ships Ed25519 JWS signed receipts at the protocol layer with EU AI Act Article 12 (effective 2026-08-02) as a regulatory tailwind. Coinbase's CDP Facilitator MCP endpoint is directly callable from Claude / ChatGPT / Perplexity / Grok / Mistral / OpenClaw — the LLM-eaten failure mode is already cocked. V1 is a 1.5-weekend build that lands into a market where (a) the structural value-prop is contested, (b) the larger competitor already ships a real-time version of the same thing with 25M settlements of behavioral data behind it, (c) the signed-receipt envelope is being absorbed into protocol-layer defaults, and (d) the addressable audience can already get a better answer by typing into Claude. The build is cheap, but the strategic value of *shipping it as designed* is close to zero; worse, it consumes the most valuable Pillar 1 lever (Option A outreach) on a deliverable that the named partners (BlockRunAI, Sophymarine, AnChain, Merit Systems) have no concrete reason to adopt over their existing alternatives.

---

## Vector 1 — Technical failure modes

**Failure scenarios.**

1. *Bucketing heuristics get publicly mocked on day one.* V1's heuristics include `if "aave" in name or "lend" in name -> defi.reads`. An operator named "AaveBypassHonestSearchAgent" (search.web) gets bucketed as `defi.reads`. The first 24 hours of public output produces a Twitter thread from a hostile operator demonstrating six misbuckets. Every misbucket weakens the "signed" claim because the signature is over a body that's structurally wrong.

2. *Crawler-blindness disclaimer is operationally useless when contested.* V1 says "no x402 endpoint covers `crypto.fx`" while OpenRegistry's KYB flow already includes FX conversion through Sophymarine's pipeline (and Pylon ships PDF + FX). The disclaimer-shaped retreat reads as either incompetence or deception when "our signed snapshot says zero FX endpoints when there are three."

3. *On-chain anchor breaks the snapshot recoverability model.* Base doesn't natively have OP_RETURN; "equivalent" means a tx with calldata that the verifier must parse. If Base gas spikes or sequencer outages occur (both have happened), the nightly tx silently delays past the 24h SLA. `/coverage` either 404s, shows yesterday's snapshot, or shows partial state.

**Strongest counter-thesis.** Don't sign the snapshot at all. Publish it as a plain CSV at `exports/coverage-latest.csv`, append a SHA-256 hash + nightly git commit ID, and call that the "verifiable artifact" — same provenance with one-tenth the failure surface and zero gas cost. The Ed25519 + on-chain anchor is theater unless the artifact is being disputed in a venue that adjudicates Ed25519 signatures, which it isn't.

**Named wedge competitor / hostile actor.** Alfred Zhang (httpay.xyz) posts a screenshot showing his 186 endpoints distributed across categories TrustBench claims are "near-zero coverage." Or any operator whose endpoint gets bucketed wrong — the misbucket is permanent in the signed snapshot until next nightly run.

**Hidden assumption.** That the value of the signature comes from the signature mechanism, not from the dispute-resolution venue the signature is admissible in.

**Severity: 3.**

---

## Vector 2 — Business model / revenue failure modes

**Failure scenarios.**

1. *V1 stays free forever because the V2 paywall thesis is fantasy.* The V2 idea is "$0.001/call for `?live=true`." But the live data is already free on x402scan, Dexter's x402gle, agentic.market, and 402index.io. Nobody pays $0.001/call for a query they can hit for free elsewhere with one-line LLM tool-calling.

2. *Research partnership revenue path collapses on contact with BlockRunAI's economics.* BlockRunAI's December 2025 report is a self-published GitHub markdown. Their incentive is to publish their own up-to-date numbers via their own crawler, not to cite a third-party signed snapshot from a smaller player. If they wanted a signed envelope, PEAC's Ed25519 JWS is already standard.

3. *Option-A-enabler thesis pays in unverifiable currency.* "Gap map makes Option A outreach warm" is unmeasurable. If no partner converts, was it because the outreach was cold, or because the gap map didn't move them? V1's 90-day kill criterion is so vague (one X repost counts) it can never actually fire — Johan's own daily X scan will inevitably produce ambient citation. The kill is theatrical; the spend is real.

**Strongest counter-thesis.** Email five named operators before V1 ships — would you pay $20/mo for monthly coverage analytics of your category? If three say yes, build a paid tier from day one. If zero say yes, the revenue path is fantasy and V1 should be reduced to a one-time research artifact.

**Named wedge competitor.** Dexter ($DEXTER + $PAYAI ecosystem). Stack 3 ("Data Analysis — accumulate data on which agents buy what") IS the gap map but with actual settlement-volume data behind it. They monetize via stack 4 (Agent Advertising) — revenue model that doesn't depend on charging for discovery.

**Hidden assumption.** That a signed artifact has economic value distinct from the underlying data. It doesn't, in this market, today.

**Severity: 4.**

---

## Vector 3 — Audience misalignment

**Failure scenarios.**

1. *Agent builders: name one who hits `/coverage.json` and integrates it.* The Strata reference-agent integration is the most concrete builder relationship — would Strata route through `/coverage.json` instead of `/route`? No. The validated builder pain (Phase 2: idempotency, hard spend caps, signed receipts, queryable audit trail) was never "we can't find which endpoints exist" — it was "we don't trust the ones we use." Gap map solves discovery; builders' actual pain is trust.

2. *Operators: Sophymarine doesn't need TrustBench to be discovered.* OpenRegistry serves 26 jurisdictions free at 20 req/min anonymous. Why would they care that a third-party crawler bucketed them into `data.public_registry`? The Option A pitch asks them to do work — adopt a new receipt envelope — for marginal visibility gain on a crawler they didn't choose to be on.

3. *Researchers cite their own work.* BlockRunAI's report cites "on-chain transaction data and service discovery APIs from multiple blockchain facilitators" — they sourced their own data, didn't cite anyone's signed envelope. Citing `cvg_01KQZ...` requires explaining Ed25519+JCS+on-chain anchor in footnotes, trusting taxonomy matches their framework, accepting derivative status.

**Strongest counter-thesis.** Pick ONE audience and design for it. Cleanest pick is "researchers" — but only if TrustBench co-publishes WITH a named researcher (BlockRunAI, Decasonic, DWF, Artemis) BEFORE V1 ships.

**Named wedge competitor.** Coinbase agentic.market. 70 curated services across 7 categories, real-time semantic search, live metrics, native MCP. Agent-builder audience has a better discovery surface; operator audience is auto-indexed by CDP Facilitator with zero effort.

**Hidden assumption.** That naming three audiences and showing some value-for-each is the same as having product-market-fit with one.

**Severity: 4.**

---

## Vector 4 — Competitive failure modes

**Failure scenarios.**

1. *x402scan ships signed snapshots in two weeks if they want to.* Merit Systems is open-source, well-staffed, Coinbase-endorsed. The marginal engineering to publish nightly signed snapshots (using PEAC's already-standard Ed25519 JWS format) is one PR.

2. *Coinbase bakes coverage exports into agentic.market with one PR.* Adding a `/api/coverage/snapshot?date=2026-05-14` endpoint that emits signed JSON is a Coinbase-engineering-afternoon. The moment they do it, TrustBench's gap map competes against the canonical source with 100% inventory of CDP-facilitated traffic and a first-party brand.

3. *Dexter's x402gle is the gap map with behavioral data attached.* "Indexes every facilitator, every resource, every chain in real time, tracking who is paying who, for what, how often, and whether the response was any good." TrustBench's gap map is structural-only (what exists); Dexter's is structural + behavioral (what exists, who uses it, how well it performs).

**Strongest counter-thesis.** Drop the "comprehensive crawler" framing because there TrustBench loses. The actual whitespace is *editorially-opinionated taxonomy with named ecosystem contributors* — x402scan/Coinbase/Dexter won't ship that because their incentive is comprehensiveness, not opinion.

**Named wedge competitor.** Dexter (token-funded, Coinbase-flip volume, x402gle live). Their pace and resources mean any V1 feature is matchable in days.

**Hidden assumption.** That competitor inattention is a moat. The competitors aren't inattentive; they made a different design choice (real-time live data) because that's what their users actually wanted.

**Severity: 5.**

---

## Vector 5 — Strategic / pillars failure modes

**Failure scenarios.**

1. *Pillar 1 advancement is illusory because signed-things are commoditizing.* The strategic doc itself names this: "signed receipts as moat thesis is already commoditizing... PEAC Protocol, agentstamp, Vaultra, AAR pushing in that direction within 6 months." x402 Atlas already returns PEAC-Receipt headers. Adding another signed envelope does not advance "TrustBench-format becomes the canonical receipt-format standard." It contributes to the "ecosystem has five competing receipt envelopes" problem.

2. *Pillar 2 advancement is parallel to `/route`, not synergistic with it.* The gap map describes the ecosystem; `/route` routes within it. They share crawler data but their public surfaces don't reinforce. A user who hits `/coverage` doesn't have a smaller path to `/route`; a user who hits `/route` doesn't get pulled to `/coverage`.

3. *Option-A-enabler is the explicitly-named justification, and it's the weakest possible Pillar 1 lever.* If Sophymarine has no reason to adopt TrustBench-format over PEAC, no amount of gap-map-as-icebreaker fixes that. The artifact is a conversation-starter for a conversation whose substance is unimproved.

**Strongest counter-thesis.** If Pillar 1 advancement is the real goal, the highest-leverage move is to **converge with PEAC** (the existing Ed25519 JWS standard with EU AI Act tailwind landing 2026-08-02). Drop the `cvg_` prefix; emit a PEAC-Receipt-formatted snapshot manifest. TrustBench becomes "the project that did the discovery-surface reference implementation of PEAC for x402 inventories."

**Named wedge competitor.** PEAC Protocol itself. Article 12 of the EU AI Act lands 2026-08-02. Every signed-thing ecosystem move between now and August converges on PEAC, not on alternatives.

**Hidden assumption.** That advancing both pillars simultaneously with one cheap artifact is achievable. The strategic doc itself flags this as the "Pillar 1 may be losing time" risk; V1 acts as if shipping the artifact is itself the advance, rather than landing adoption of the envelope.

**Severity: 5.**

---

## Vector 6 — Behavioral failure modes

**Failure scenarios.**

1. *Operators game the taxonomy by self-naming.* Once operators learn the heuristics (which V1 open-sources), they SEO their endpoint names against the bucketing rules. The signed snapshot signs over a body that's increasingly gamed.

2. *Researchers ignore TrustBench snapshots and cite x402scan/agentic.market data instead.* Behavioral inertia is against citing a new artifact, especially one without editorial reputation behind it.

3. *Agent builders find the snapshot too coarse (14 categories) AND too brittle (heuristics) AND too late (24h-stale).* They wanted "find me a cheap FDA-recall endpoint" — V1 says "no `data.specialized` coverage yet." They wanted "is `aaveHF.example.com` reliable today" — V1's score is yesterday's. They bounce to x402scan / agentic.market / x402gle within minutes.

**Strongest counter-thesis.** Don't ship a coverage artifact at all; ship a *recommendation artifact* — "for capability X, here are the top three endpoints, here's why, here's their 7-day uptime, here's the signed witness." That serves agent builders' actual behavior (find what works) and operators' actual incentive (be recommended) and researchers' actual workflow (cite recommendations).

**Named wedge competitor.** Any operator whose endpoint is open-sourced and watches GitHub. Once they read `taxonomy-v1.ts`, they rewrite their endpoint name to win the bucketing.

**Hidden assumption.** That users will behave passively toward a published artifact. They won't — they'll game it, ignore it, or contest it, in that order.

**Severity: 3.**

---

## Vector 7 — Frontier-model / LLM-eaten failure modes

**Failure scenarios.**

1. *Claude's MCP connector already calls `api.cdp.coinbase.com/platform/v2/x402/discovery/mcp` directly.* The Bazaar MCP exposes `search_resources` (semantic search across the Bazaar index returning pricing, schemas, relevance-ordered results) and `proxy_tool_call`. User types "find me an x402 endpoint that does FX conversion" — Claude calls Bazaar MCP, gets a semantic answer, optionally pays and calls. V1's `/coverage.json` is a slower, less-fresh, less-rich answer to a question the user can ask their LLM.

2. *"Structural signed answer survives LLM-native queries" is wishful.* V1 concedes "the casual lookup value evaporates" but argues citable/replayable/signed survives. The signed-receipt audience is researchers, regulators, auditors. Researchers cite BlockRunAI or write their own; regulators don't yet care about x402; auditors don't have a known auditing standard.

3. *Frontier models hallucinate confidently about x402 endpoints from training data, and the gap map becomes a hallucination-correction service no one knows exists.* The corrective only fires if the LLM itself calls the gap map, which requires it being a registered MCP tool that the LLM prefers over CDP Facilitator MCP. TrustBench can't win that prefer-vote.

**Strongest counter-thesis.** The only LLM-eaten-resistant artifact is one with a regulatory or contractual venue that requires it. A signed snapshot useful in an SEC filing, in a SOC2 audit, in a court-of-record dispute. V1's snapshot is none of those because TrustBench is explicitly NOT a compliance product.

**Named wedge competitor.** Anthropic / OpenAI themselves. Every Claude / ChatGPT release with better tool-use eats more discovery value.

**Hidden assumption.** That a downloadable JSON file is more useful than an LLM tool call. In 2026, increasingly not.

**Severity: 4.**

---

## Vector 8 — Taxonomy / methodology failure modes

**Failure scenarios.**

1. *Two operators publicly disagree on bucketing, no arbiter.* httpay.xyz's Aave HF is `defi.reads`. Heurist's Aave-flavored agent is also `defi.reads`. Alfred says his deserves `defi.governance`; Heurist disagrees. Solo founder Johan has to pick a side (alienating one operator), abstain (looks indecisive), or change the taxonomy (which retroactively invalidates prior signed snapshots). All three outcomes are bad.

2. *A category emerges V1 didn't anticipate (e.g., `agent.identity` for ERC-8004 endpoints — already shipping).* They get dumped in `uncategorized` or shoved into `infrastructure.compute` (wrong). By the time taxonomy-v1.1 ships, the public has already screenshotted "TrustBench thinks ERC-8004 isn't a category."

3. *Methodology page invites methodology critique, and solo founder can't sustain the back-and-forth.* GitHub Issues queue fills with "you've miscategorized X." At 5 issues/week (low estimate), that's 2.5 hours/week of methodology defense.

**Strongest counter-thesis.** Don't publish the taxonomy as a methodology that invites debate. Publish it as **the editorial taxonomy of TrustBench's coverage product** with a clear "this is our cut; other cuts are valid" framing.

**Named wedge competitor.** Any operator with a 1k-follower X account. A single "TrustBench buckets my endpoint wrong and won't fix it" post is more durable damage than a year of right-bucketing wins back.

**Hidden assumption.** That a taxonomy is a technical artifact rather than a political artifact.

**Severity: 4.**

---

## Vector 9 — Adoption / network-effect failure modes

**Failure scenarios.**

1. *Competitors fork the methodology and publish competing signed snapshots within 6 weeks.* x402scan forks the open taxonomy, runs it nightly against their richer crawler data, publishes their own signed version under their own brand. Better data + better brand. TrustBench's 2026-05-14 snapshot is the historical curiosity; x402scan's nightly is the canonical.

2. *First isn't best.* Diff-ability is only valuable if THIS snapshot's diff is the one users care about. If x402scan ships a better snapshot in week 8, users diff x402scan's, not TrustBench's.

3. *Cold-start problem on Day 1.* No researcher cites a brand-new signed JSON envelope from a project they've never heard of. The first citation requires (a) Johan personally asking, (b) the artifact being adopted by an existing-credibility project (Option A), or (c) viral organic discovery (unlikely). V1's plan for cold-start is "ship it and Option-A-enable from there" — but Option A success requires the artifact be valuable, which requires citations, which requires Option A success. Circular.

**Strongest counter-thesis.** Don't ship the snapshot alone. Co-ship with an existing-credibility partner on day one. "TrustBench × BlockRunAI Coverage Snapshot v1" has citation power that solo-published TrustBench coverage does not.

**Named wedge competitor.** x402scan or Merit Systems. Open-source commitment makes the fork inevitable; brand asymmetry makes their version canonical.

**Hidden assumption.** That nightly cadence + signed envelope = network effect. It doesn't.

**Severity: 4.**

---

## Vector 10 — Operational / solo-founder failure modes

**Failure scenarios.**

1. *Realistic maintenance cost is 5-8 hours/week, not "~0 hours/week ongoing."* Every operator inbound about a bucketing dispute, plus taxonomy iteration, plus on-chain anchor monitoring, plus methodology questions, plus version-bump discipline. At BlockRunAI's growth rate (4,800+ endpoints from 1,100+ projects, 700%+ week-over-week growth periods), the taxonomy is permanently behind.

2. *Operator publicly attacks TrustBench for miscategorization while Johan is mid-Strata-integration.* Johan now has to choose: respond (losing 2-4 hours of Strata work) or stay silent (attack compounds). The gap map takes attention from Pillar-2 work that's actually advancing.

3. *On-chain anchor pipeline silently fails for a week and Johan doesn't notice.* Snapshot rows accumulate with `settlement_tx_hash IS NULL`. RLS blocks public read. `/coverage` 404s for 7 nights. First external citation attempt finds a broken artifact.

**Strongest counter-thesis.** The solo-founder principle in CLAUDE.md is "Maximum automation, zero manual daily work." V1 ships a product whose value depends on social engagement — the opposite. Either don't ship it, or pre-budget the maintenance and accept it eats Phase 4 / Phase 5 velocity.

**Named wedge competitor.** Time itself. Growth rate (165M tx, $50M+ volume, 480K agents, 700%+ week-over-week) means any taxonomy is stale on a timescale of days, not weeks.

**Hidden assumption.** That "self-maintaining" infrastructure exists for a categorization product. It doesn't — categorization is editorial work.

**Severity: 4.**

---

## Cross-vector themes

Three load-bearing structural risks recur:

**1. The "signed envelope is moat" framing has aged out of correctness.** The pillars doc itself flagged this risk; V1 didn't update. x402 Atlas already returns PEAC-Receipt headers. EU AI Act Article 12 (effective 2026-08-02) is a 80-day deadline pushing the entire ecosystem toward PEAC convergence. V1's "first signed-nightly" play is moot in a market about to standardize on PEAC. Appears in Vectors 1, 2, 4, 5, 7, 9.

**2. The competitive landscape is materially mischaracterized.** V1 says no competitor ships signed snapshots; Atlas does. V1 says no competitor ships behavioral-data discovery; Dexter's x402gle does with 25M+ settlements. V1 says agentic.market doesn't have category-bucket gap-naming; agentic.market has 70 curated services across 7 categories with semantic search that does this functionally better. Appears in Vectors 3, 4, 6, 7, 9.

**3. The audience model masks "no priority user."** Three audiences with different needs, all unverified, none with a named first user. Appears in Vectors 2, 3, 4, 6, 7.

---

## The single greatest failure mode

**V1 ships into a market where the canonical signed-receipt standard is about to be PEAC, not TrustBench-format — and the gap-map artifact accelerates that outcome rather than delaying it.** Every public TrustBench-format snapshot is an explicit non-adoption signal: TrustBench chose to ship a parallel envelope instead of converging with PEAC. After 2026-08-02 (EU AI Act Article 12 effective), any project building for compliance defaults to PEAC because PEAC has the regulatory framing baked in. TrustBench-format becomes "the project that didn't converge when convergence was the right move." Pillar 1 closes not because of competitive attack but because TrustBench's own artifact-shipping accelerated the standards-fragmentation that pushed users toward the regulatory-tailwinded option.

The mechanism: V1 announces "TrustBench coverage snapshot v1, cvg_ prefix, Ed25519-signed JCS-canonicalized, on-chain anchored." x402 Atlas already ships PEAC-Receipt-formatted output. PEAC itself has Wire 0.1 stable + Wire 0.2 preview. The signal sent to the ecosystem is "TrustBench is committed to its own envelope and will not converge." Sophymarine, AnChain, Heurist, httpay, and PEAC itself all read this signal. The Option A outreach lands into a context where TrustBench has just publicly demonstrated it won't adopt others' formats either. Adoption asymmetry collapses Option A entirely.

The collapse is observable within 90 days: zero Option A partners say yes; one or two competitors (Atlas, x402scan via fork) ship better snapshots; defenders within TrustBench can point only to a few X mentions as "engagement." 90-day kill criterion fires. The weekend was lower-cost than the strategic position lost.

---

## What V1 should have been instead

**Ship a single editorial coverage report co-published with one named partner, in PEAC-Receipt envelope, scoped to one capability category that's actively contested.**

The shape:

- **Partner first, code second.** Email BlockRunAI (most likely yes), Decasonic, DWF Labs, or Artemis with a concrete co-publish offer. "We'll build the signed snapshot infrastructure; you write the editorial analysis; co-byline; PEAC-Receipt envelope; we both link from our channels." Wait for one yes. Without a yes, do not ship.

- **PEAC-Receipt envelope, not TrustBench-format `cvg_`.** Drop the parallel-standard play. Adopt PEAC's Ed25519 JWS format directly. TrustBench's value-add is the *coverage application of PEAC*, not the envelope itself. Converges with the regulatory-tailwinded standard (EU AI Act Article 12) instead of fragmenting against it. Pillar 1 advances by demonstration-of-adoption rather than by demonstration-of-alternative.

- **One capability category, named, contested.** Not 14 buckets. Pick the one with the most active operators. Publish a deeply-analyzed coverage map of that single category with named endpoints, named gaps, named tradeoffs. Signed envelope is over editorial analysis, not over a directory scan. Operators in that category have a concrete reason to engage because the artifact discusses them by name.

- **Quarterly cadence, not nightly.** Quarterly matches the research-report shape that has actual editorial weight. Nightly is theater-of-velocity that produces low-edit artifacts no one cites. Quarterly forces editorial rigor, gives time for operator dialogue, fits solo-founder bandwidth, and pairs naturally with co-publish partners.

- **Explicit non-goal: comprehensive ecosystem map.** Leave that to x402scan, Dexter's x402gle, agentic.market, 402index.io. TrustBench's lane is *opinionated editorial analysis with cryptographic receipt* — a lane those competitors structurally won't enter because their incentive is comprehensiveness, not opinion. This is the actual defensible whitespace.

- **Operator-engagement model: named pre-publication review.** Named operators in the category get a 7-day review window. They can dispute classifications, provide counter-data, request corrections. Operators who participate become potential Option A partners through the review process itself — the engagement IS the warm-DM.

- **Founder-shape fit.** This redesign is fewer hours per quarter than V1 is per week. Maintenance is bounded, social engagement is structured, strategic value is concentrated.

---

# Part III — V2 Redesign

## V2 Design — Bottom-line summary

**V2 is a quarterly, PEAC-conformant, editorially-opinionated coverage report on a single contested capability category — DeFi position reads — co-published with one named research partner (BlockRunAI as the leading candidate). The signed artifact is a PEAC-Receipt/0.1 envelope with a `coverage_report/v1` claim type, not a parallel `cvg_` standard. There is one primary audience (researchers/auditors who cite ecosystem state), one explicit secondary beneficiary (named operators in the DeFi-reads category who get pre-publication review), and a partner-first build sequence where no engineering happens until a co-publish partner says yes in writing.** V1 failed because it shipped a parallel envelope into a market converging on PEAC, claimed three audiences and served none, framed a comprehensive directory scan as a moat against competitors who do that better, and treated signing-as-such as the value when the dispute venue is the actual value. V2 succeeds by aligning with the PEAC standard (so every snapshot accelerates rather than fragments Pillar 1), narrowing to a single category deep enough to be editorial and broad enough to invite named participation, picking a cadence the solo founder can actually sustain at editorial quality, and converting the published artifact from "directory" to "research-citation primitive" — the one shape no real-time crawler-based competitor will enter.

## What changed from V1 to V2 — delta table

| Dimension | V1 | V2 | Why changed | Critic vector(s) addressed |
|---|---|---|---|---|
| **Scope** | 14 capability categories, comprehensive | One category: `defi.reads` (Aave/Compound/Morpho/Pendle position reads + governance tally) | "Comprehensive directory" loses to x402scan + Dexter + agentic.market. One contested category lets editorial rigor be the value | V4, V6, V10 |
| **Envelope format** | TrustBench `cvg_` Ed25519 JCS + on-chain anchor | PEAC-Receipt/0.1 JWS (EdDSA), claim type `coverage_report/v1`, JWKS at `/.well-known/peac-issuer.json`, on-chain anchor as a separate PEAC claim INSIDE the envelope | PEAC is converging as the standard; parallel envelope is the single-greatest-failure-mode | V5, V7, cross-vector theme 1 |
| **Cadence** | Nightly | Quarterly editorial cut (4/year) + monthly "delta brief" between cuts + continuous machine-readable inventory at `/coverage-data.json` (unsigned, explicitly not the cited artifact) | Editorial weight requires editorial time. Solo-founder can't sustain nightly editorial. Quarterly matches research-report shape | V6, V8, V10 |
| **Audience** | Three audiences | One primary: researchers/auditors. Secondary beneficiary: named DeFi-reads operators (pre-publication review). Agent builders explicitly NOT a V2 audience | "Three audiences, no priority user" is the no-priority-user trap | V3, cross-vector theme 3 |
| **Build-vs-partner sequence** | Build first, partner-enable after | Partner first (named target list). No engineering until one yes. Hard kill at 4 weeks zero-yes | "Partner first, code second" — operationalized as gate | V2, V3, V9 |
| **Taxonomy ownership** | "Methodology page invites debate" | Explicit "editorial cut of TrustBench × Partner" framing. Versioned per cut. Not pitched as canonical taxonomy of x402 | Taxonomy is political; editorial framing defangs gaming + dispute attack surface | V8, V6 |
| **Operator engagement** | "Open GitHub issues, accept PRs" (reactive) | 14-day named pre-publication review window. Specific operators: Alfred Zhang (httpay), Heurist team, anchor-x402-mcp maintainer, QuickNode, The Graph. Documented dispute response template | Reactive issue queue eats solo-founder bandwidth; pre-pub review IS the warm-DM | V8, V10 |
| **Success criteria (30/60/90)** | "One published live snapshot" — meaningless | 30d: partner-yes + draft. 60d: published with named partner byline + PEAC verification clean. 90d: one external citation in non-affiliated artifact AND one operator-engagement that converted to Option A receipt-format conversation | V1's bar was "did I push code" — useless | V2, V9 |
| **Kill criteria** | "Zero engagement at 90d" (too vague to fire) | (a) Zero partner-yes by week 4 → abort. (b) Published but zero external citation by 90d → freeze. (c) PEAC ships native discovery extension → fold. Stricter, observable, binary | "Theatrical kill criteria" — Critic right | V2 |
| **Naming** | "Gap map" / `/coverage` | "x402 Coverage Briefs" series. First edition: "x402 DeFi Reads — Q3 2026 Coverage Brief." URL: `/reports/defi-reads-q3-2026.json` and `.html` | "Gap map" was the brand the Critic killed; report-framing makes citation natural | V3, framing |

## V2 design — comprehensive spec

### Scope: one category, `defi.reads`

**What.** V2 covers a single capability category: DeFi protocol state reads on x402. Specifically: Aave v3 health-factor and collateral breakdown, Compound v3 supply/borrow positions, Morpho vault positions, Pendle PT/YT positions, and Snapshot governance tally reads as a named adjacent category. Concrete endpoint list assembled from TrustBench crawler + Heurist Mesh + httpay.xyz's published catalog + The Graph Gateway x402-enabled subgraphs + QuickNode x402 RPC variants.

**Why (vectors 3, 4, 8).** Comprehensiveness is the lane Dexter, x402scan, and agentic.market already win. The defensible lane is editorial depth in one contested category. `defi.reads` is the highest-leverage pick because:

1. **It is actively contested.** httpay.xyz ships 186 endpoints with overlap; Heurist Mesh ships Aave-flavored agents; The Graph + QuickNode are commoditizing the primitive layer. The Critic's stress-test of Candidate 2 (Aave HF) named four competing implementations in one paragraph. That contestation is exactly what makes editorial analysis valuable.
2. **Named operators are reachable.** Alfred Zhang (httpay) is a known solo-founder peer. Heurist Mesh has documented contributors. QuickNode publishes contact channels. The Graph Foundation has a known liaison structure. A pre-publication review email list is constructable in one afternoon.
3. **The receipt-for-dispute case is concrete here.** The Critic correctly noted that Aave liquidations are settled on-chain so "the block is the receipt" for state. But the *coverage* claim — "as of Q3 2026, here are the 14 x402-priced endpoints serving Aave v3 health-factor reads, here's pricing, here's methodology" — has dispute value distinct from on-chain block-as-receipt. Operators care how they're compared; researchers cite the comparison.
4. **Connects to TrustBench infra without strain.** Crawler already knows these endpoints. Pricing in `paid_requests`. Latency/uptime in `probes`. No new data plumbing.

Why not alternatives: `inference.llm` (Dexter's x402gle indexes this with behavioral data; we'd be a worse Dexter); `compliance.sanctions` (anchor-x402-mcp + AnChain own; entering risks compliance-vendor pivot CLAUDE.md prohibits); `crypto.timestamping` / `data.public_registry` (low contestation = low editorial value); `onchain.rpc` (QuickNode dominates).

**Tradeoff acknowledged.** V2 gives up the "single canonical map of x402" framing. Researchers who want that go to BlockRunAI's WEB_STATE_OF_X402 or Dexter's x402gle. V2 is explicitly one category, deep. If V2 succeeds, a Q4 cut could be a *second* category — but that's a decision after evidence.

### Envelope: PEAC-Receipt/0.1, not `cvg_`

**What.** Signed artifact is a PEAC-Receipt/0.1 JWS using EdDSA, served via standard PEAC-Receipt header pattern, with TrustBench's signing key published at `/.well-known/peac-issuer.json` as JWKS. Claim payload:

```json
{
  "iss": "https://trustbench.io",
  "iat": 1751760000,
  "typ": "coverage_report/v1",
  "report_id": "defi-reads-q3-2026",
  "category": "defi.reads",
  "partner_byline": "BlockRunAI",
  "report_url": "https://trustbench.io/reports/defi-reads-q3-2026.json",
  "report_sha256": "0xabc...",
  "settlement_anchor": {
    "chain": "base",
    "tx_hash": "0x...",
    "block_number": 50000000
  }
}
```

On-chain anchor is a *separate claim inside the PEAC envelope*, not a parallel attestation. `@trustbench/verify-receipt` v0.3.0 adds PEAC verification per PEAC reference verifier + the optional anchor check.

**Why (vectors 5, 7, cross-vector theme 1).** This is the single most important V2 change. V1's parallel `cvg_` standard accelerated the standards-fragmentation that pushes adopters toward PEAC. V2 inverts: every TrustBench coverage report is a PEAC-Receipt, making TrustBench a *reference implementation of PEAC at the ecosystem-data layer* rather than a competing envelope. Pillar 1 advancement shifts from "convince the ecosystem to adopt cvg_" to "demonstrate PEAC at scale and influence the spec from inside."

Pushback on the Critic, partial: the Critic framed PEAC convergence as terminal for Pillar 1. This is overstated. Adopting PEAC for *coverage reports* doesn't preclude TrustBench-format for *routing receipts* (the `rrcpt_` shape Strata is integrating). Different artifact classes, different consumers. PEAC is becoming canonical for *agent-interaction records*; TrustBench-routing-receipts can remain canonical for *meta-router attestations* (Pillar 2's actual product). V2 explicitly accepts PEAC for the coverage-report lane because convergence pressure is highest there, and reserves TrustBench-format for the routing lane where it's actually load-bearing.

Post-2026-08-02 (Article 12 effective), any signed-receipt artifact a regulator/research firm cites is one that conforms to or interoperates with whatever Article 12 standards bodies bless. PEAC has explicit positioning for this. TrustBench gets the regulatory tailwind for free by adopting.

**Tradeoff acknowledged.** V2 hands PEAC the coverage-report envelope claim. If PEAC absorbs routing-receipt format into Wire 0.2/0.3, TrustBench's routing envelope faces the same convergence pressure. Risk surfaces below.

### Cadence: quarterly + monthly delta + continuous unsigned

**What.** Three artifact tiers:

1. **Quarterly Coverage Report** (the cited artifact). 4/year fixed: Q1 (Mar 15), Q2 (Jun 15), Q3 (Sep 15), Q4 (Dec 15). Markdown + PDF + signed PEAC-Receipt JSON. Triggered by calendar, not event. Each cut is full editorial pass.
2. **Monthly Delta Brief** (linked, signed, lightweight). One-page markdown each month: "Since Q3 cut, three endpoints added, two went stale, one disputed our classification." Same PEAC envelope. Anchored on-chain. Audit trail between reports, not citation artifact.
3. **Continuous machine-readable inventory** at `/coverage-data.json`. Unsigned. Updated nightly from existing crawler. *Explicitly not the cited artifact.* Documentation: "for the signed cited version, see the quarterly report."

**Why (vectors 6, 10).** Quarterly forces editorial rigor. Nightly was "theater-of-velocity that produces low-edit artifacts no one cites." Quarterly matches BlockRunAI / Messari / Delphi / Decasonic publication cadence — the cadence that matches researcher behavior. Monthly delta briefs give "we're still here" continuity. Continuous inventory exists for builders + competitive-watchers but disclaims itself out of the citation lane.

Pushback on the Critic, partial: the Critic argued for "quarterly cadence" but didn't address "is quarterly too slow?" In a 700%-WoW-growth ecosystem, the underlying state changes daily. V2's three-tier structure addresses this: quarterly = citation; monthly delta = responsiveness; continuous = live data. Different consumers, different cadences, aligned.

**Tradeoff acknowledged.** Q3 cut Sep 15 describes data through Aug 31 with two weeks editorial review. Endpoints appearing Sep 1 are footnoted and rolled into Q4. Some researchers find this stale; they're not the citing audience. The citing audience wants something they can pin to a date.

### Audience: researchers/auditors, named first user

**What.** Primary: research analysts and on-chain data firms who publish periodic ecosystem reports and need a citable signed substrate. First specific validation target is **BlockRunAI** — they published WEB_STATE_OF_X402, have GitHub presence and reachable maintainers, ship `blockrun-mcp` and `ClawRouter` (so they live in the x402 stack day-to-day), operate at a scale where co-publishing makes sense for both sides, and have editorial-output infrastructure to actually co-byline.

Secondary beneficiaries (NOT primary, but designed-for): named operators in `defi.reads` category — Alfred Zhang (httpay), Heurist Mesh team, anchor-x402-mcp maintainer, QuickNode, The Graph Foundation. Pre-publication review + path to Option A through the engagement structure.

Explicitly not V2 audiences: agent builders (served by `/route`) and Strata (integrates routing surface).

**Why (vector 3, cross-vector theme 3).** Three audiences = no audience. V2 picks researchers because (a) their workflow naturally consumes signed artifacts, (b) co-publishing with named research partner is the highest-leverage Pillar 1 move available, and (c) operators participate through the review structure without being asked to "use" the artifact — solving the operator-doesn't-need-us critique.

Pushback on the Critic: implicit framing was "pick one and serve only them"; V2 nuances to "pick one as primary consumer, design operator engagement as structural mechanism." Operators don't need the report; they need engagement *with* the report.

**Tradeoff acknowledged.** Agent builders who hit `/coverage.json` looking for V1's directory get redirected to `/route` (what they actually need) and `/coverage-data.json` (unsigned live inventory).

### Build-vs-partner sequence: partner first, hard gate

**What. Week 1 (now-to-day-7).** Email three named partners in parallel:

1. **BlockRunAI (primary).** "Your WEB_STATE_OF_X402 report set the standard for x402 ecosystem analysis. We're publishing the first of a quarterly per-category coverage series — DeFi position reads on x402 — and would like to co-publish under both bylines. We provide signed coverage data via PEAC-Receipt/0.1 + on-chain anchor; you provide editorial analysis (1500w + name). We both link. Estimated total time on your side: 8-12 hours over 6 weeks for Q3 cut."
2. **Decasonic (secondary).** Same proposal, slight reframe toward their market-map orientation.
3. **Artemis Analytics (tertiary).** Same proposal, lean on transaction-analytics depth.

**Yes-decision criteria.** Written commitment (email or DM thread) to (a) co-byline, (b) editorial contribution of at least 1500 words OR equivalent named foreword/sign-off, (c) cross-publication. Verbal "interested" doesn't count.

**Day 22-28 abort gate.** No yes by day 28 → execute V2.5 (below). Yes by day 28 → proceed to Phase B.

**Why (vectors 2, 9).** Partner-first solves three V1 failure modes: (a) adoption cold-start (partner byline gives day-one citation credibility), (b) audience-validation (if no research firm wants to co-publish, the audience hypothesis is wrong before we waste a weekend), (c) revenue-path ambiguity (co-publish is leading indicator of either future paid analytics products or sustained adoption — silence is the strongest possible negative signal).

**Tradeoff acknowledged.** V2 ships nothing for at least 4 weeks. In a 700%-WoW market, 4 weeks is real time. Trade: 4 weeks lost vs. shipping a misaligned artifact whose negative signal we'd then have to live with. Former is recoverable; latter is not.

### Taxonomy ownership: explicit editorial cut

**What.** Methodology document is titled "Q3 2026 — defi.reads — Editorial Methodology by TrustBench × BlockRunAI." Opening paragraph:

> This is the editorial cut of TrustBench and BlockRunAI for one category of x402 endpoints. Other valid cuts exist — Dexter's x402gle, agentic.market's taxonomy, x402scan's grouping, BlockRunAI's broader WEB_STATE_OF_X402 — and we encourage readers to consult them. This document describes how *we* drew the lines for *this category* in *this quarter*.

Versioning: each quarterly cut has its own methodology section. We don't pretend methodology is stable across quarters — we say explicitly: "Q3 2026 methodology differs from Q2 in the following ways..." Methodology doc lives at `/reports/defi-reads-q3-2026/methodology.md` and is included in the signed PEAC-Receipt by SHA-256.

**Why (vector 8).** Taxonomy is political not technical. V2 dodges the political fight by not claiming canonical taxonomy. We're *one editorial cut, alongside others, dated, versioned*. Attack "TrustBench buckets my endpoint wrong" loses force when response is "yes, this is our Q3 editorial cut; here's where the dispute lands in Q4 methodology revision."

**Tradeoff acknowledged.** V2 gives up "canonical x402 taxonomy" framing. Costs some Pillar 1 framing power — but the framing power V1 claimed was unearned anyway.

### Operator engagement: 14-day named pre-publication review

**What.** For each quarterly cut, draft sent privately to every named operator 14 days before publication. Mechanic: single email per operator with (a) draft markdown, (b) rows where their endpoints appear, (c) methodology section, (d) 14-day deadline to dispute / contest / provide counter-data, (e) explicit invitation to co-sign methodology improvement for next quarter. Default: "if we don't hear back, we publish as drafted; you can dispute next cycle."

Q3 2026 list: Alfred Zhang (httpay@httpay.xyz, public), Heurist Mesh contributor list (Discord + maintainer email), `anchor-x402-mcp` maintainer (GitHub contact), QuickNode dev relations, The Graph Foundation x402 integration lead. If can't find contact in 30 minutes, endpoint mentioned with `[no review contact reached, please file an issue]` annotation.

Disputes received within window: incorporated where validated (with diff in change-log), declined-with-reason where not (with operator's counter-data published as appendix if they consent). All captured in PEAC-Receipt's methodology SHA-256.

**Why (vectors 8, 10).** Reactive issue queues eat solo-founder time. Pre-publication private review is bounded, scheduled, finite — and IS the warm-DM V1 hoped the artifact-itself would become. Every email is an Option A receipt-format conversation starter.

**Tradeoff acknowledged.** Real ongoing work — ~4-6 hours per quarterly cycle for solo founder + dispute response. Bounded (14 days × 4/year = 56 days/year of bounded operator-engagement) vs. unbounded reactive issue queue V1 invited.

### Distribution

**What.** Four publication locations:

1. `https://trustbench.io/reports/defi-reads-q3-2026.html` — primary canonical HTML, content-negotiated.
2. `https://trustbench.io/reports/defi-reads-q3-2026.json` — signed PEAC-Receipt JSON.
3. GitHub repo `trustbench/coverage-reports` — markdown source + methodology + change-log, MIT-licensed, tagged releases.
4. Partner's distribution surface — BlockRunAI's `awesome-blockrun/research/` directory under co-authored filename. They link to ours; we link to theirs. Dual canonical, single SHA-256.

Citation format: *TrustBench × BlockRunAI (2026). "x402 DeFi Reads — Q3 2026 Coverage Brief." Signed: peac-receipt/0.1, sha256: 0xabc... Anchored: Base tx 0xdef... Available: https://trustbench.io/reports/defi-reads-q3-2026.json*

Discoverability: `/.well-known/peac-issuer.json` advertises TrustBench's PEAC compliance + reports index URL. Landing page gets a single "Research" link to `/reports/`. skill.md + llms.txt include `/reports/` framed as "for cite-worthy ecosystem analysis."

**Why (vectors 7, 9).** Cold-start solved by partner co-distribution. LLM-discoverability gets the peac-issuer pattern (which Claude/Perplexity/etc. increasingly hit as Article 12 compliance lands).

### Success criteria, observable + binary

**30 days from V2 commit:** one named partner says yes in writing. Q3 outline circulated. Zero yes → abort to V2.5.

**60 days:** Q3 2026 report published at both canonical URLs. PEAC-Receipt verification clean via `@trustbench/verify-receipt`. Operator pre-publication review completed for 5+ named operators (yes-replied, no-replied-in-window, or unreachable-but-attempted). Methodology + change-log public.

**90 days:** at minimum one external citation in a non-TrustBench, non-partner artifact (X thread, blog post, report, GitHub issue from someone unaffiliated). At minimum one operator from review process has either (a) committed to emit TrustBench-format / PEAC routing receipts on their endpoints, or (b) explicitly disputed-with-counter-data (also success — produces Option A conversation).

**Why (vector 2).** Observable, binary, dated. V1's "one X repost counts" could never fire because daily X scan produces ambient noise. V2's 90-day criterion requires *both* external citation AND operator-engagement-conversion. Structurally fireable.

### Kill criteria

**Auto-abort (no Johan judgment needed):**

1. **Week 4: zero partner-yes.** Switch to V2.5. Q3 report not built.
2. **Week 10 (after Q3 publish): zero external citation by day 90.** Freeze; no Q4 cut. Reassess pillar framing.
3. **Any time: PEAC ships `coverage_report` or equivalent claim type in Wire 0.2 covering this use case.** Fold V2 into PEAC's canonical example; cease independent cuts; offer TrustBench × BlockRunAI cut as PEAC reference.
4. **Any time: BlockRunAI (or equivalent if BlockRunAI declined) ships own signed quarterly category cuts under own envelope.** Re-evaluate; likely fold.

### Naming/branding

**What.** Product name: **"x402 Coverage Briefs"** (plural — implying series). Q3 2026 first edition: **"x402 DeFi Reads — Q3 2026 Coverage Brief."**

Specifically NOT used: "gap map" (Critic killed framing), "registry" (TrustBench already has one), "index" (x402index.com / 402index.io own), "directory" (agentic.market / Bazaar own), "benchmark" (CLAUDE.md prohibits), "compliance" (CLAUDE.md prohibits).

**Why.** "Coverage Brief" reads as research-artifact, not live-dashboard. Signals editorial weight. Doesn't promise comprehensiveness — a "brief" can be one category. Series framing signals continuity without promising rate.

## Build plan for V2

### Phase A — Pre-build validation gate (week 1-4)

**Day 1-2.** Draft three partner emails. Each cites December 2025 WEB_STATE_OF_X402 and proposes concrete Q3 cut on `defi.reads`. Each promises: TrustBench provides signed coverage data + PEAC envelope + on-chain anchor + crawler infra; partner provides editorial section (1500w + name) + co-byline + cross-link. Partner time: 8-12 hours over 6 weeks.

**Day 3.** Send all three in parallel (no sequential gating — V1's slowness was its enemy).

**Day 4-21.** Respond to replies. First yes wins for Q3; others declined politely with door open for Q4.

**Day 22-28.** Abort gate if no yes; proceed to Phase B if yes.

### Phase B — Build sequence assuming yes (week 5-10)

**Week 5.** Build quarterly data pipeline:
- `src/coverage/category-snapshot.ts` — reads `providers` + `probes` + `paid_requests` filtered to `defi.reads`. Outputs typed `CategorySnapshot`.
- `src/coverage/peac-envelope.ts` — wraps CategorySnapshot in PEAC-Receipt/0.1 JWS using existing Ed25519 keypair. Implements PEAC claim format directly. Adds `settlement_anchor` claim.
- `src/coverage/report-pages.ts` — serves `/reports/defi-reads-q3-2026.html` + `.json`, content-negotiated, immutable Cache-Control once published.
- `@trustbench/verify-receipt` v0.3.0 — PEAC verification + optional `--check-chain` anchor verification.

Total: ~600 LOC including tests.

**Week 6.** Editorial pass — Johan writes TrustBench section, partner writes theirs in parallel. Methodology document written.

**Week 7.** Pre-publication review window opens. Email 5+ named operators with draft. Track responses in `decisions.md`.

**Week 8.** Incorporate operator feedback. Final editorial pass with partner.

**Week 9.** Publish. Sign. Anchor. Cross-publish on partner's surface.

**Week 10.** Distribution push — co-published X announcement, GitHub release, awesome-x402 PR adding report, post to relevant subreddits with honest framing.

**Week 11-13.** Watch 90-day window. Track citations + operator engagement in `decisions.md`.

### Phase C — V2.5, the abort/pivot if all three partners say no

**A single named coverage brief on `defi.reads`, solo-authored by TrustBench, PEAC-enveloped, published once as one-shot research artifact (not a series), with same operator pre-publication review window, distributed by submitting to BlockRunAI's `awesome-blockrun/community/` or equivalent ecosystem reference repo.**

Why this still has value: operator pre-publication review still produces Option A conversation starter; PEAC envelope still demonstrates standard at scale; editorial framing still distinguishes from real-time dashboards; one-shot framing doesn't commit to a series we can't sustain solo. Effort: ~1 weekend + 14-day review window.

V2.5 drops: co-byline, quarterly cadence, distribution leverage. It's a research artifact, not a series. Q4 reassessment after V2.5: if any external citation or operator engagement, restart Phase A with refreshed outreach. If silent for 90 days, "research artifact" thesis is dead and pillars filter reassessment triggers.

V2.5 does NOT become a recurring artifact. Recurring editorial work without a partner is solo-founder-shape-misaligned.

## New risks introduced by V2

**Risk A: comprehensiveness handed to competitors.** V2 cedes comprehensive-directory lane to Dexter / x402scan / agentic.market / 402index.io. If market evolves such that comprehensive directory becomes dominant and editorial briefs become marginal, V2 becomes a niche literary product. *Mitigation:* continuous unsigned `/coverage-data.json` retains comprehensive crawler data as public utility — TrustBench doesn't disappear from directory lane, just stops trying to brand it as moat. If market goes that way, quarterly briefs become Pillar-1-only play, Pillar 2 leans entirely on `/route` + `rrcpt_`. Defensible smaller position.

**Risk B: adopting PEAC accidentally hands PEAC all of Pillar 1.** Using PEAC-Receipt/0.1 for coverage reports publicly signals "PEAC is our envelope for at least this artifact class." If PEAC expands claim taxonomy to routing receipts in Wire 0.2/0.3, TrustBench's `rrcpt_` envelope faces same convergence pressure. We lose Pillar 1 incrementally — coverage first, routing second.

This is the most serious V2-specific risk. Three mitigations: (1) participate in PEAC's spec process from inside — adopting their envelope gives standing to push for routing-receipt extensions matching what TrustBench already ships; (2) maintain `@trustbench/verify-receipt` as dominant verifier package even as we adopt PEAC's envelope — verifier becomes moat instead of envelope-shape; (3) accept Pillar 1 may consolidate around PEAC long-term, and TrustBench's contribution is "the reference implementation that demonstrated PEAC at ecosystem scale first" — defensible historical position even if not perpetual moat.

Pushback on the Critic, partial: Critic implied PEAC convergence terminal. I disagree: PEAC convergence is bad *if TrustBench fights it*; PEAC convergence is fine *if TrustBench contributes from inside*. V2 takes contribute-from-inside path.

**Risk C: quarterly is obsolete in 700%-WoW market.** If x402 velocity stays at observed rates, Aug-data-Sep-publish is 3+ months stale by Q4 publication. Researchers may shift to live signed feeds. *Mitigation:* monthly delta brief is velocity bridge. Each delta is signed, PEAC-enveloped, ~1 page. Three-tier cadence designed for this risk. If quarterly proves too slow even with deltas, accelerate or accept citation-artifact niche stays low-velocity-by-design.

**Risk D: editorial bandwidth unbounded even with partner.** V2 commits ~4-6 hours per quarter solo-founder editorial + pre-publication review + dispute response. With partner contributing 8-12 hours, cycle sustainable. But: if partner contribution comes late, gets thin, or shifts to another quarter, fallback is "publish without their editorial contribution and label solo" — collapses V2 to V2.5 mid-cycle. *Mitigation:* partner email states "if either side cannot deliver editorial contribution by week 8, we mutually agree to publish as the side that delivered, with full byline transparency." Partner-flake is known recoverable failure mode rather than existential.

**Risk E: operator pre-publication review becomes quarterly attack surface.** If 5 operators per cycle all dispute and 2-3 dispute aggressively, 14-day window becomes 14 days of operator-conflict management. Bounded but high-stress. *Mitigation:* methodology states up front that disputes with counter-data are incorporated by reference; without counter-data are noted; miss the window are queued for next quarter. Process documented before first dispute fires.

## Why V2 succeeds where V1 fails

**Cross-vector theme 1 ("signed-envelope-as-moat aged out").** V1 doubled-down on competing envelope; V2 adopts PEAC-Receipt/0.1, contributes from inside converging standard, shifts moat from envelope-shape to (a) verifier package + on-chain-anchor extension + (b) editorial credibility + (c) routing-receipt envelope (different artifact class, different consumer).

**Cross-vector theme 2 ("competitive landscape mischaracterization").** V1 claimed unique whitespace in directory lane against bigger, better-funded, already-there competitors. V2 explicitly cedes directory lane and competes on lane those competitors structurally won't enter: editorial analysis with named partner co-byline. Dexter monetizes behavioral data; x402scan via free + open; agentic.market via Coinbase brand. None ship editorial briefs because workflow doesn't fit. Whitespace narrower than V1's "comprehensive map," and defensible.

**Cross-vector theme 3 ("no priority user").** V1 named three audiences and served none; V2 names one (researchers) and structurally accommodates one secondary beneficiary (operators) through engagement mechanism. First specific user (BlockRunAI) named, reachable, and is the gate that decides whether V2 gets built at all.

**Single greatest failure mode (PEAC convergence acceleration).** V1 accelerated PEAC convergence by shipping parallel envelope; V2 inverts — every V2 artifact is a PEAC reference implementation. Convergence becomes our distribution, not our enemy. "TrustBench-format becomes the project that didn't converge" outcome structurally prevented.

## Pillars-filter walkthrough for V2

**Q1: Which Pillar?** Primarily Pillar 1 (canonical receipt-format standard). Secondarily Pillar 2 (unsigned `/coverage-data.json` keeps Pillar 2 discovery surface; operator review conversations seed routing-receipt adoption). Pillar 1 leads, in contrast to V1's "both via Pillar-2-maintenance" framing.

**Q2: If Pillar 1, how specifically?** Both demonstration and adoption-by-contribution. Implementing PEAC-Receipt/0.1 reference at ecosystem-data layer with verifier + on-chain anchor extension positions TrustBench as leading PEAC implementer with credibility to push spec evolution. Adoption mechanic: every quarterly cut is PEAC artifact in the wild others can copy as template. Standards-coalition outreach via editorial process (partner co-byline = standards-influencing co-byline).

**Q3: If Pillar 2, how specifically?** Continuous machine-readable inventory at `/coverage-data.json` extends existing crawler surface. Operator pre-publication review conversations seed routing-receipt adoption (operators who participate likely emit `rrcpt_` on their endpoints). Indirect Pillar 2 advance through Pillar 1 work.

**Q4: If neither, why?** N/A.

**Q5: Which Option?** Option A primarily (entire build sequence gated on named partner adopting / co-bylining). Option B secondarily (PEAC-conformant signed-artifact infra reusable for future canonical primitives). Not Option C.

**Q6: Less-effort partnership path?** YES, and it IS the path. V2 is partner-first by design — Phase A is the less-effort path. Build (Phase B) only happens once less-effort path produces yes.

**Filter verdict.** Passes cleanly. Phase A operationalizes question 6 — V1's filter walkthrough acknowledged this in concept but didn't operationalize. V2 makes the less-effort path the actual primary path.

## Open decisions for Johan

These 5 require a call before Phase A starts:

1. **BlockRunAI as primary target, or different first target?** I've recommended BlockRunAI based on their December 2025 report, GitHub presence, and operating in the x402 stack. If Johan has closer relationship with Decasonic, Artemis, Messari Research, or another firm — that should be primary instead. Partner choice is the single most load-bearing V2 decision.

2. **Adopt PEAC-Receipt/0.1 for coverage reports even though it weakens case for `cvg_` / extends PEAC's standards position?** Most strategically consequential design choice. V2's argument: "adopt PEAC at coverage-report layer; keep TrustBench-format at routing-receipt layer; contribute from inside converging standard." Critic's argument: "any PEAC adoption hands them everything eventually." Johan calls.

3. **Pick `defi.reads` as first category, or different one?** I've recommended `defi.reads` based on contestation + named-operator-reachability + receipt-for-dispute concreteness. Weaker but plausible alternatives: `inference.llm` (broader audience, more competitive), `data.public_registry` (less contested, less editorial value), `compliance.sanctions` (avoid per CLAUDE.md). If Johan has strong read on different first category from partner conversations, his call.

4. **Naming: "Coverage Brief" or alternative?** V2 names "x402 Coverage Briefs" series, Q3 2026 first edition "x402 DeFi Reads — Q3 2026 Coverage Brief." Alternatives Johan might prefer: "Sector Report," "Ecosystem Brief," "Market Cut." Naming affects citation patterns going forward.

5. **What's the abort latitude on V2.5?** V2.5 is a one-shot solo-authored brief if all three partners say no. Johan needs to confirm: is V2.5 real option to execute, or is "abort, do nothing, focus on Phase 4" the actual fallback? Both defensible per pillars filter. If no-V2.5, kill criteria simplifies (week 4 zero-yes = abort full stop, return to Pillar-2-maintenance-only).

---

# Sources (Parts I-III combined)

## V1 Part I — competitive landscape research

- [x402scan.com](https://www.x402scan.com/) | [GitHub](https://github.com/Merit-Systems/x402scan)
- [x402atlas.com](https://x402atlas.com/)
- [x402station.com](https://x402station.com/)
- [agentic.market](https://agentic.market/) | [Coinbase launch announcement](https://www.coinbase.com/developer-platform/discover/launches/agentic-market)
- [Coinbase Bazaar discovery docs](https://docs.cdp.coinbase.com/x402/bazaar)
- [402index.io](https://402index.io/) | [x402index.com docs](https://www.x402index.com/docs) | [x402-index org](https://github.com/x402-index)
- [dexter.cash](https://dexter.cash/) | [docs.dexter.cash](https://docs.dexter.cash/)
- [pay.sh](https://pay.sh/) | [solana-foundation/pay](https://github.com/solana-foundation/pay) | [PayAI facilitator](https://facilitator.payai.network/)
- [Heurist Mesh portal](https://mesh.heurist.ai/) | [mesh README](https://github.com/heurist-network/heurist-agent-framework/blob/main/mesh/README.md)
- [Pylon API](https://api.pylonapi.com/) | [pylon-mcp](https://github.com/pylonapi/pylon-mcp)
- [httpay author dev.to writeup](https://dev.to/alfredz0x/i-built-186-ai-agent-apis-in-a-weekend-heres-what-i-learned-about-x402-micro-payments-32dp)
- [BlockRunAI WEB_STATE_OF_X402.md](https://github.com/BlockRunAI/awesome-blockrun/blob/main/research/WEB_STATE_OF_X402.md)
- [Merit-Systems/awesome-x402](https://github.com/Merit-Systems/awesome-x402) | [xpaysh/awesome-x402](https://github.com/xpaysh/awesome-x402)
- [Smithery](https://smithery.ai/) | [Glama](https://glama.ai/mcp/servers/categories)
- [Decasonic Market Map tweet](https://x.com/decasonic/status/1984303599967748321) | [Scattering EcoMap tweet](https://x.com/scattering_io/status/1988257724074004946) | [DWF Labs research](https://www.dwf-labs.com/research/inside-x402-how-a-forgotten-http-code-becomes-the-future-of-autonomous-payments)
- [Allium x402 monitoring dashboard](https://app.allium.so/s/KZ2yCo0Z) | [Artemis x402 analytics](https://app.artemisanalytics.com/asset/x402)

## V2 Part III — PEAC, regulatory, partner candidates

- [PEAC Protocol GitHub (Wire 0.1 stable / Wire 0.2 preview)](https://github.com/peacprotocol/peac)
- [PEAC Protocol homepage / adapters](https://peacprotocol.org/)
- [x402 Headers Reference including PEAC-Receipt](https://agentpay-docs.replit.app/reference/x402_headers)
- [BlockRunAI GitHub organization](https://github.com/BlockRunAI)
- [EU AI Act Article 12 — Record-Keeping (effective 2026-08-02)](https://artificialintelligenceact.eu/article/12/)
- [Help Net Security — Article 12 logging requirements](https://www.helpnetsecurity.com/2026/04/16/eu-ai-act-logging-requirements/)
- [Dexter overtakes Coinbase as top x402 facilitator (MEXC News)](https://www.mexc.com/news/395460)
- [AAR (Agent Action Receipt) — Mastercard Verifiable Intent](https://dev.to/andrew_glaz_12f84661fd541/mastercard-just-validated-the-standard-we-built-verifiable-agent-actions-with-aar-5b1g)
- [Claude MCP Connector docs](https://platform.claude.com/docs/en/agents-and-tools/mcp-connector)
- [AWS Bedrock AgentCore Payments (Coinbase + Stripe bundling)](https://aws.amazon.com/blogs/machine-learning/agents-that-transact-introducing-amazon-bedrock-agentcore-payments-built-with-coinbase-and-stripe/)
