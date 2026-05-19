# JarvisBrain Feed — Session Record 2026-05-14

**Purpose:** Self-contained capture of a strategic-reframe session for TrustBench. Designed to be fed into the JarvisBrain project as context for future cross-project reasoning. Compressed but comprehensive: every load-bearing finding, every artifact produced, every decision still pending.

**Session arc in one sentence:** What started as a brainstorm about whether an App-Store-style "65 boring apps" portfolio play applied to x402 agent payments turned into a fundamental strategic reframe of TrustBench's defensible position — surfacing two pillars (canonical receipt-format standard + neutral routing+receipt layer), three tactical options (A partner / B build receipt-canonical primitives / C original GO list), and a mandatory pre-development filter that now gates every non-trivial TrustBench dev decision.

**Date:** 2026-05-14
**Project:** TrustBench (non-custodial smart router + payment-plumbing layer for x402 agent payments)
**Operator:** Johan (solo founder)

---

## TL;DR — what changed strategically in this session

1. **The implicit moat thesis ("we sign receipts, that's our defense") was killed by direct evidence.** Multiple competitors already ship Ed25519-signed receipts (anchor-x402-mcp, PEAC Protocol, agentstamp, Vaultra, Coinbase facilitator KYT, AWS AgentCore audit-bundling). The thesis is commoditizing on a timescale of months, accelerated by EU AI Act Article 12 (effective 2026-08-02) pushing the ecosystem toward PEAC convergence.

2. **A sharper strategic frame replaced it: two pillars.** Pillar 1 = TrustBench's receipt envelope becomes the canonical standard others adopt. Pillar 2 = TrustBench is the neutral routing+receipt layer above whatever discovery/facilitator wins. Both pillars are defensible separately; owning both is the strongest position. Pillar 2 is already in flight through Phase 4 normal cadence.

3. **Three tactical Options were named, decision-pending.** Option A: partner — get OpenRegistry / AnChain / Heurist / httpay / PEAC to adopt TrustBench-format receipts on their existing output. Option B: build receipt-canonical primitives (RFC3161 + drand + openFDA) as reference implementations. Option C: stick with original portfolio GO list (OFAC first, etc.). Johan has explicitly NOT committed.

4. **A mandatory six-question pre-development filter was codified into CLAUDE.md.** Every non-trivial TrustBench decision now passes: which pillar / how specifically / if neither why / which option / less-effort path? This is enforced going forward.

5. **The gap map idea was deep-dived through V1 → Critic → V2.** V1 (signed nightly snapshot, 14 categories, comprehensive directory) was strong-rejected by the Critic for entering already-contested territory with a parallel envelope that accelerates PEAC convergence against TrustBench's own interest. V2 (quarterly editorial brief, ONE category — defi.reads, PEAC-Receipt envelope, co-published with named research partner like BlockRunAI) responds to each Critic concern. V2 is partner-gated — no code written until a named partner says yes in writing.

6. **Current TrustBench position is more defensible than the Critic implied, less defensible than the original portfolio research assumed.** The MCP connector to Claude (Anthropic Connectors Directory submission in flight) is a significant Pillar 2 amplifier that wasn't fully credited in the Critic's "LLM-eaten" attack. Combined with `/route` paywall live, Bazaar/agentic.market listings, multi-source crawler, Strata §10 in flight, and @trustbench/verify-receipt npm package, TrustBench has a base position that doesn't collapse on any single competitive move.

7. **The recommended no-regrets sequence:** Continue Phase 4 work, ship gap map V2 ONLY if a partner says yes (4-week gate), continue crawler visibility improvements, continue Strata + v2 header migration. Defer Option A/B/C commitment until the gap map V2 outcome and Strata response produce more data.

---

## Session arc — full chronological narrative

### Phase 1: The "65 boring apps" brainstorm

A Reddit post from r/AppBusiness (user Less_Courage_3545) described a strategy of building 65 small "boring" utility apps averaging ~$65/month each, totaling ~$4,200/mo passive income. Playbook: long-tail keyword hunt, 48-hour MVPs, pure ASO marketing.

Johan asked whether this could apply to x402/agentic payments. Initial analysis: structurally a good fit because (a) no App Store cut, (b) no SDK churn, (c) monetization rails are free via x402 protocol itself, (d) per-endpoint marginal cost is essentially zero. But two key differences: (a) the discovery layer for agent-payments is far less mature than App Store search, and (b) demand routing isn't solved.

Key insight surfaced: in mobile, the supply is hard but Apple/Google route the demand. In x402, supply is easy but no one routes demand at scale. **Demand routing is the moat, not supply.**

### Phase 2: Filtered candidate categories

Johan asked to proceed with research on which "boring x402 endpoints" might work. Filter applied across five lenses: LLM-eaten / regulated / saturated / solo-founder fit / receipt-value (does signed receipt + on-chain anchor actually matter).

**Likely losers (skip):** OCR (LLMs eat it), SMS sending (regulatory landmine), WHOIS-with-history (capital-intensive licensed data), carrier+phone lookup (thin reselling, vendor-dependent).

**Survivors (worth deep-diving):**
1. OFAC / sanctions name screening (free-data slice: OFAC SDN, EU consolidated, UK OFSI, AU DFAT, CA SEMA) — skip commercial PEP
2. IBAN/SWIFT/routing-number validation
3. SEC EDGAR / Companies House parsed filings
4. DNS/SSL/security posture lookups
5. Currency conversion with signed timestamp
6. On-chain reads pre-aggregated by topic
7. EU VAT validation (VIES) [added during filter]
8. Holiday/business-day calendar [added during filter]
9. PDF page extraction [added during filter]

### Phase 3: Registry probe + parallel deep-dive research

Three parallel agents researched 3 categories each (financial/compliance, data/audit, web/tech). TrustBench's own registry was probed for capability coverage. Key findings:

**Registry gaps confirmed:** IBAN (no coverage), EU VAT (no coverage), PDF extraction (no coverage), OFAC compliance (no coverage — only crypto/equity screeners), DNS posture (no coverage in registry — but Pylon and agentsvc.io ship this outside registry inventory), fiat FX (no coverage).

**Already well-covered:** SEC EDGAR (Heurist's SecEdgarAgent has 7+ endpoints), on-chain RPC (QuickNode covers 20+ chains).

**Critical strategic finding surfaced mid-research:** The "boring utility primitives" lane on x402 is no longer greenfield. Pylon (`pylonapi.com`) ships 17+ endpoints; agentsvc.io ships 20+ utility services; httpay.xyz (Alfred Zhang) shipped 186 endpoints in a weekend. The whitespace is NOT cheap utility — it's audit-grade endpoints where signed receipts + on-chain anchor earn their keep.

Saved as `endpoint-portfolio-research-2026-05-14.md` with 4 GO + 2 weak-GO + 3 NO-GO ranked.

### Phase 4: Dexter / PayAI competitive signal

A tweet from @divuspop (verified, "Early Investor", 박상웅) framed $DEXTER and $PAYAI as the agent-economy winners. Dexter's explicit four-stack thesis:

1. Payment and Settlement → secure transaction share with free facilitators (Google-strategy reference)
2. Search and Discovery → connect which tools and services are actually being used
3. Data Analysis → accumulate data on which agents buy what and repeatedly use it
4. Agent Advertising → recommendation/advertising markets targeted at future AIs

Framing: "Google dominated search, Meta dominated advertising, Visa dominated payment infrastructure. In the AI agent era, the company that dominates the flow of agents will be the biggest winner."

This is a token-funded direct positional competitor at TrustBench's discovery + data layers (stacks 2 + 3). Captured as project memory `project_dexter_payai_competitive_signal_2026_05_14.md`.

### Phase 5: Critic pass on the 4 GO candidates

Adversarial stress-test run by independent agent. All four GO candidates downgraded:

- **OFAC name screening → weak-reject.** anchor-x402-mcp already ships exactly this with "signed decision attestation" at $0.001-$0.010 USDC on Base. AnChain.AI is the named wedge competitor with regulatory relationships.
- **Aave HF → weak-reject.** httpay.xyz already ships 186 endpoints including Aave/Compound/Morpho APY at the same price band. The block hash IS the receipt for on-chain disputes.
- **UK Companies House → strong-reject.** OpenRegistry by Sophymarine already ships 26 jurisdictions free via MCP server. Partner with them, don't compete.
- **EU VAT (VIES) → strong-reject.** Vatlayer at $9.99/mo unlimited dominates. Stripe Tax integrated x402 in Feb 2026 — one PM-decision from making this a commodity feature.

**Cross-candidate finding (load-bearing):** The "signed receipt as moat" thesis is already commoditizing across multiple projects:
- anchor-x402-mcp ships signed decision attestation
- PEAC Protocol ships Ed25519 JWS at protocol layer (Wire 0.1 stable + Wire 0.2 preview)
- agentstamp ships Ed25519 stamps + trust scoring
- Vaultra ships RFC-3161 compliance receipts
- Coinbase facilitator does KYT/OFAC at rail layer
- AWS Bedrock AgentCore Payments bundles audit trail (May 2026 GA)

**Shared kill risk:** facilitator absorption. If facilitators absorb compliance + auditability + receipts as built-in features, every portfolio endpoint competes against a *free* feature of the rails.

### Phase 6: The wider-net brainstorm

A second agent expanded the candidate set with 14 additional categories. Seven new GO candidates surfaced:

| # | Candidate | Why strong |
|---|---|---|
| 1 | RFC3161 timestamp + on-chain anchor | Canonical receipt-value play — the receipt IS the product |
| 2 | GLEIF LEI lookup | Global scope, free public registry, cleanest "lookup vs determination" framing |
| 3 | CT log snapshot (crt.sh wrap) | Forensic chain-of-custody for arbitrary domains |
| 4 | drand verifiable randomness | 100x cheaper than Chainlink VRF for off-chain agent use |
| 5 | openFDA recall lookup | Live regulatory data, frontier-model-immune, compliance audit shape |
| 6 | DKIM/SPF/DMARC verification | Single-message verification (different from dmarcian dashboards) |
| 7 | Snapshot DAO governance tally | Companion to Aave HF in DeFi-agent lane |

Two patterns named: (1) "wrap a free public registry + add signed receipt" is fractal; (2) cryptographic primitive endpoints (RFC3161, drand, CT-log) are the cleanest receipt-value plays.

### Phase 7: Strategic reframe — two pillars emerge

The combination of Dexter signal + Critic findings + wider-net brainstorm forced a sharper articulation of what TrustBench's actual defensible position is. The frame that survived:

**Pillar 1 — Canonical receipt-format standard.** TrustBench's signed-receipt envelope (Ed25519 + JCS + on-chain settlement anchor per `receipt-spec-v1.md`) becomes the spec that other projects adopt or interop with. The product is the standard, not endpoints. Adopters: OpenRegistry, AnChain, Heurist, httpay, anchor-x402-mcp, eventually facilitators.

**Pillar 2 — Neutral routing+receipt layer.** TrustBench sits above whatever discovery / facilitator / mesh / agent-marketplace wins (Coinbase Bazaar, AWS AgentCore, Dexter, PayAI, agentic.market, Heurist Mesh) as the protocol-agnostic routing surface that adds signed receipts. The product is `/route` + receipts on top of *someone else's* endpoints.

The pillars are complementary, not mutually exclusive. The strongest defensible position is owning both. No other current player in the landscape owns both (PEAC owns Pillar 1 partial; httpay/Heurist/Pylon own Pillar 2 partial in merchant form; Dexter/PayAI position for both but aren't shipped on the receipt-format layer; Coinbase facilitator owns rails but doesn't route across facilitators).

### Phase 8: Three Options codified

Tactical paths for Pillar 1 advancement (Pillar 2 proceeds through Phase 4 cadence regardless):

**Option A — Partner.** Reach out to existing projects: "adopt TrustBench-format signed receipts on your existing output." No new endpoints built. Pillar 1 advanced actively via recruited adopters. Specific targets: Sophymarine (OpenRegistry), AnChain.AI, Heurist Mesh, httpay.xyz, PEAC Protocol convergence conversation. Success criteria: 1 adopter in 8 weeks.

**Option B — Build receipt-canonical primitives.** Ship RFC3161 + drand + openFDA as reference implementations. Pillar 1 advanced by demonstration. Side effect: each becomes a TrustBench-owned routable endpoint (Pillar 2 boost).

**Option C — Original portfolio GO list.** Ship OFAC per `portfolio-ofac-screening-design.md`, then Aave HF, etc. Treat Critic findings as risk flags. Lowest cognitive-load to continue but lowest conviction post-stress-test.

**Decision-pending status as of 2026-05-14:** Johan explicitly did NOT commit. The portfolio play is on pause. Option A messages not drafted. Pillar 2 work continues through Phase 4 normal cadence.

### Phase 9: Filter codified into CLAUDE.md

The user requested: "every new decision on what to do next, next feature, etc, is put up against these 2 pillars and Option A, B and C. Going through this pass will be a pre-requisite for any further development going forward."

Codified into CLAUDE.md as `## Mandatory Pre-Development Filter`. Six questions:

1. Which Pillar does this advance (1, 2, both, neither)?
2. If Pillar 1: how specifically (adoption / demonstration / reference / spec / outreach)?
3. If Pillar 2: how specifically (inventory / coverage / robustness / intelligence / discovery)?
4. If neither: WHY? Acceptable: maintenance, debt, security, partnership ask, regulatory. Unacceptable: interesting / competitor has it / people are asking.
5. Which Option (A / B / C / "Pillar 2 maintenance")?
6. Less-effort path? Especially: partnership (A) instead of build (B/C)?

If a decision can't answer 1-6 cleanly, do not proceed. Ask Johan first. Memory anchor at the top of MEMORY.md so the filter surfaces first in every future session.

Five worked examples included in CLAUDE.md (p402 settlement → passes via partnership question; gap-map HTML page → passes; Strata pricing tiers → passes; /decode-pdf request from X → FAILS; "sanctions compliance" framing shift → FAILS).

What passes through the filter: bug fixes, security patches, outage response, lessons-learned, memory writes, doc cleanup, daily X scan, anything explicitly "operational."

### Phase 10: Sequence-of-work doc + gap map deep-dive

Johan asked: how is TrustBench positioned to transition into the gap map? Recommended no-regrets sequence captured in `sequence-of-work-2026-05-14.md`:

1. Ship gap map (P5-coverage-report) — Pillar 2 advance, Option A enabler
2. Improve crawler visibility (add Pylon, agentsvc.io, anchor-x402-mcp, httpay to inventory)
3. Continue Phase 4 work in flight (Strata §10, v2 header migration)
4. Improve `@trustbench/verify-receipt` docs (Pillar 1 prep without Option commit)
5. Sharpen public copy (Pillar 1+2 framing additive, filter-gated)
6. Reassess Options A/B/C with new data after items 1-3

Then Johan asked for the comprehensive deep-dive on gap map: V1 (full design) → Critic attack (every angle) → V2 (response).

### Phase 11: Gap Map V1 design

V1 design: signed nightly artifact from existing crawler infrastructure, buckets endpoints into 14 capability categories, publishes JSON + CSV + HTML at `trustbench.io/coverage*`. Every nightly run is Ed25519-signed and anchored on-chain. Three audiences (agent builders, endpoint operators, researchers/auditors). Filter pass walkthrough included. ~6000-word design doc.

### Phase 12: Critic Pass on V1

Independent agent ran adversarial stress-test from 10 angles. Verdict: **strong-reject as designed.**

**Three load-bearing structural risks identified:**

1. **Signed-envelope-as-moat has aged out.** x402 Atlas already ships PEAC-Receipt headers. EU AI Act Article 12 (effective 2026-08-02) pushes ecosystem toward PEAC convergence. V1's "first signed-nightly" play is moot in a market about to standardize on PEAC.

2. **Competitive landscape mischaracterized.** V1 claimed unique whitespace in directory lane. Dexter's x402gle ships behavioral-data discovery with 25M+ settlements. Coinbase's CDP Facilitator MCP is directly callable from frontier LLMs. x402scan can ship signed snapshots in 2 weeks.

3. **No priority user.** Three audiences with different needs, none with a named first user. Classic solo-founder product-shape failure pattern.

**Single greatest failure mode:** V1 ships into a market where canonical signed-receipt standard is about to be PEAC, not TrustBench-format — and the gap-map artifact *accelerates* that outcome rather than delaying it. Every public TrustBench-format snapshot is an explicit non-adoption signal. After 2026-08-02, any project building for compliance defaults to PEAC. Pillar 1 closes from TrustBench's own artifact-shipping accelerating standards-fragmentation.

### Phase 13: Gap Map V2 redesign

V2 inverts the bet. Key changes:

| Dimension | V1 | V2 |
|---|---|---|
| Scope | 14 categories | One: `defi.reads` |
| Envelope | TrustBench `cvg_` | PEAC-Receipt/0.1 JWS |
| Cadence | Nightly | Quarterly + monthly delta + continuous unsigned `/coverage-data.json` |
| Audience | Three | One primary (researchers), one secondary beneficiary (operators) |
| Build sequence | Build first | Partner first (4-week hard abort gate) |
| Naming | "gap map" | "x402 Coverage Briefs" series |

**Critical V2 strategic move:** Adopt PEAC-Receipt/0.1 for coverage reports (converge with the regulatory-tailwinded standard) while reserving TrustBench-format for routing receipts (different artifact class, different consumer). The pillars don't have to use the same envelope.

**Build plan:** Phase A = partner outreach (BlockRunAI primary, Decasonic + Artemis as fallbacks) for 4 weeks. Phase B = build only if partner says yes. Phase C = V2.5 abort path (one-shot solo-authored brief) if all three say no.

**Five open decisions for Johan before Phase A starts:**
1. BlockRunAI as primary target?
2. Adopt PEAC-Receipt/0.1?
3. `defi.reads` as first category?
4. "Coverage Brief" naming?
5. V2.5 fallback or just abort?

### Phase 14: Current TrustBench position assessment

Johan asked: "how is TrustBench positioned in its current shape? (including the MCP connector to Claude that is in progress)"

**MCP connector context discovered:** `@trustbench/mcp` — local MCP server, stdio transport, npx launch. Three read-only tools: `get_rankings`, `get_receipt`, `verify_receipt`. v1.0.4 about to publish. Targeting Anthropic Connectors Directory submission.

**Strategic assessment:**

*Pillar 2 is in stronger position than the Critic credited:*
- `/route` paywall live, Phase 4 first paid receipt validated
- agentic.market validator-green, Bazaar indexed (Stone 0 closed 2026-05-13)
- skill.md, /.well-known/trustbench.json, llms.txt, awesome-x402 listed
- @trustbench/verify-receipt v0.1.1 published
- @trustbench/mcp connector imminent — Anthropic Connectors Directory submission in flight
- Heurist Solana mesh crawler shipped
- Phase 4 v2 header migration tail in progress
- Strata §10 reference integration target ~2026-05-19
- Paddock partner CSV rollup pipeline live since 2026-05-14

The MCP connector specifically is a Pillar 2 amplifier with no current competitor parallel. Anthropic Connectors Directory is gate-kept; being in it is distribution Dexter's tokens, x402scan's open-source posture, and Coinbase's Bazaar can't directly replicate. When a Claude user verifies a receipt, the envelope they see is TrustBench's. The receipt-verification slot is TrustBench's lane if the connector lands.

*Pillar 1 is the contested position the Critic correctly identified:*
- Working: Strata adopting `trust_signals[]` (in flight, awaiting response), @trustbench/verify-receipt published, ready PEAC convergence path via V2 if pursued.
- Exposed: PEAC convergence pressure with Article 12 tailwind, multiple competing signed-receipt projects.

*Where actual moat sits, in priority order:*
1. MCP connector + Anthropic Directory placement (most concrete near-term)
2. `/route` as cross-network routing surface with signed receipts (Phase 4 work)
3. Strata trust_signals adoption (if it lands)
4. The receipt-verification verifier package — separable moat even if envelope shape converges to PEAC

**Net read:** TrustBench is NOT on a path to obsolescence in the next 6 months. The pillars filter is doing its job — it caught V1 gap-map before code shipped. MCP connector + Phase 4 + Strata pipeline are concrete Pillar 1 + 2 moves with measurable outcomes. The Option A/B/C decision is *additive*, not "Pillar 1 or die."

Highest-leverage single thing in flight: MCP connector landing in Anthropic Directory.

---

## Key competitive intelligence captured

### Direct competitors at TrustBench's pillar positions

| Project | Position | Status | Threat level |
|---|---|---|---|
| Dexter / dexter.cash / x402gle | Pillar 2 (full-stack: payment + discovery + data + advertising), token-funded | Live, flipped Coinbase as #1 facilitator (50%+ daily volume, 25M+ settlements) | High velocity on discovery + data layers |
| PayAI / pay.sh | Pillar 2 (Solana-side, Google Cloud + Solana Foundation backing) | Live, 50+ community facilitators | Direct Solana competitor |
| x402scan.com (Merit Systems) | Pillar 2 (open-source discovery dashboard, Coinbase Dev endorsed) | Live, multi-source aggregation | Could ship signed snapshots in 2 weeks |
| x402atlas.com | Pillar 2 (real-time analytics with PEAC-Receipt headers) | Live, claims cryptographic verifiability | Already shipping PEAC-style envelopes |
| Coinbase agentic.market | Pillar 2 (7 categories, semantic search, live metrics) | Live, Coinbase brand | 70 curated services, auto-indexed |
| 402index.io / x402index.com | Pillar 2 (protocol-agnostic L402 + x402 + MPP, 15,000+ APIs) | Live | Multi-protocol coverage TrustBench lacks |
| PEAC Protocol | Pillar 1 (Ed25519 JWS receipt format) | Wire 0.1 stable, Wire 0.2 preview, Article 12 tailwind | THE competing standard for receipt envelope |
| anchor-x402-mcp | Pillar 1 + portfolio endpoints | Live, ships OFAC + signed decision attestation | Direct competitor on Option C OFAC |
| AnChain.AI | Pillar 1 (signed sanctions screening at facilitator layer) | Live, x402-facilitator partnership | Regulatory-positioned competitor on sanctions |
| Vaultra | Pillar 1 (RFC-3161 compliance receipts) | Live on PyPI | Compliance-specific receipt issuer |
| agentstamp | Pillar 1 (Ed25519 stamps + trust scoring + x402) | Live | Direct envelope competitor |
| Pylon (`pylonapi.com`) | Portfolio merchant (17+ utility endpoints) | Live, $0.001-$0.01/call | Cheap-utility lane occupier |
| agentsvc.io | Portfolio merchant (20 tools via MCP + x402) | Live | Cheap-utility lane occupier |
| httpay.xyz (Alfred Zhang) | Portfolio merchant (186 endpoints in a weekend) | Live, ERC-8004 agent #18032 | Solo-founder peer at higher velocity |
| OpenRegistry by Sophymarine | Portfolio merchant (26 jurisdictions of registry data) | Live, free MCP, productized KYB | Option A partnership target (rather than competitor) |

### Adjacent products / reports

- **BlockRunAI WEB_STATE_OF_X402.md** (Dec 2025): closest existing report analog (63M tx, $7.5M USDC, 1,100+ projects). Recommended V2 partner.
- **Allium x402 dashboard, Artemis x402 analytics**: transaction-volume enterprise analytics.
- **Decasonic Market Map, Scattering EcoMap, DWF Labs research**: visual one-shot maps.
- **Smithery.ai (7,300+ MCP), Glama.ai (23,581 MCP)**: MCP-shape competitors, not x402-specific.

### Regulatory tailwind

- **EU AI Act Article 12 — Record-Keeping** (effective 2026-08-02). PEAC Protocol positions explicitly for this. TrustBench-format does not have a regulatory framing baked in. This is the single most important external timing factor in the strategic reframe.

---

## Artifacts produced this session (file list)

All files in `C:\Users\Lithv\Documents\Claude\Projects\TrustBench\` unless noted.

| File | Purpose | Size |
|---|---|---|
| `endpoint-portfolio-research-2026-05-14.md` | Initial 9-category research + stress-test addendum capturing Critic findings + new candidate brainstorm | ~30 KB |
| `portfolio-ofac-screening-design.md` | Option C build-ready spec for OFAC name screening endpoint (DO NOT execute without Option-decision gate) | ~15 KB |
| `strategic-pillars-and-options-2026-05-14.md` | LOAD-BEARING canonical doc — word-for-word capture of Dexter signal, Critic findings, brainstorm findings, two pillars, three options, filter rules | 39 KB |
| `sequence-of-work-2026-05-14.md` | No-regrets near-term sequence (gap map → crawler visibility → Phase 4 finishers → Option reassess) | 6.7 KB |
| `gap-map-deep-dive-2026-05-14.md` | Comprehensive deep dive: V1 (6000 words) + Critic Pass (4000 words) + V2 (4000 words). Single doc, three sections | 105 KB / 1047 lines |
| `JarvisBrain-feed-2026-05-14.md` | THIS DOCUMENT — self-contained session record for cross-project consumption | ~10 KB |

### CLAUDE.md edits (in-place)

- Top-of-file pickup order now reads "read `strategic-pillars-and-options-2026-05-14.md` FIRST"
- New section `## Mandatory Pre-Development Filter` (added 2026-05-14) — six-question check, worked examples, what passes/fails the filter

### Memory anchors written (auto-memory directory)

| File | Type | Purpose |
|---|---|---|
| `project_strategic_pillars_filter_2026_05_14.md` | project | LOAD-BEARING filter pointer with `★` marker at MEMORY.md top |
| `project_dexter_payai_competitive_signal_2026_05_14.md` | project | Competitive landscape signal capture |

---

## Pending decisions for Johan (state as of 2026-05-14)

### Strategic-level (require Johan's call before related work begins)

1. **Option A / B / C / "Pillar 2 maintenance only" — which path?** Decision-pending. No commitment yet. The next data points expected are: Strata §10 response (~2026-05-19), gap map V2 partner outreach if pursued, MCP connector directory acceptance.

2. **Gap map V2 — proceed with partner outreach (Phase A)?** If yes: draft and send 3 partner emails (BlockRunAI primary). If no: defer to V2.5 or skip entirely.

3. **PEAC-Receipt adoption for coverage-report layer?** V2's most strategically consequential design choice. Adopt PEAC at coverage-report layer + reserve TrustBench-format at routing-receipt layer? Or fight PEAC convergence at both layers? V2 argues the former; Critic argued the latter.

4. **Public-copy framing shift — add "Why TrustBench" pillar-language to landing?** Filter-gated. Recommended AFTER gap map produces data, not before.

### Tactical-level (smaller, but filter-gated)

5. **P4-3 Solana routing filter drop.** Multi-day work (not the one-liner the original plan suggested). Pillar 2 maintenance but high effort. Apply filter question 6 before committing: partner with Heurist for Solana-side receipt issuance instead?

6. **Gap map naming — "Coverage Brief" or alternative?** V2 recommended "x402 Coverage Briefs."

7. **First gap-map category — `defi.reads` or different?** V2 recommended `defi.reads` based on contestation + named-operator-reachability + receipt-for-dispute concreteness.

8. **MCP connector — finalize Anthropic Connectors Directory submission?** Submission brief drafted at `anthropic-connector-submission.md`. Pending v1.0.4 npm publish + git push.

---

## Leading indicators to watch (30-60 day horizon)

| Indicator | If observed | What it means |
|---|---|---|
| Anthropic Connectors Directory accepts @trustbench/mcp | Within 30 days | Major Pillar 2 distribution win; tighten Pillar 1 strategy around verifier-package adoption |
| Strata §10 acceptance | By ~2026-05-19 | First external Pillar 1 adopter; sharpen partnership playbook |
| Strata silent past ~2026-06-01 | Negative signal | Either rework partnership pitch or reassess Pillar 1 timing |
| PEAC Wire 0.2 release | Before 2026-08-02 | Spec absorption check — does PEAC ship `coverage_report` claim? If yes, fold V2 |
| BlockRunAI publishes Q2 update | Spontaneously | V2 partnership window narrows; offer co-publish for Q3 |
| Dexter ships public coverage page | Anytime | Closes gap-map window entirely; deprioritize V2 |
| anchor-x402-mcp crosses 1k paid calls | Anytime | OFAC lane closed; abandon Option C OFAC |
| Coinbase / AWS AgentCore ships cross-facilitator routing | Anytime | Pillar 2 closes; reframe TrustBench around Pillar 1 + something else |

---

## Filter reassessment triggers (don't confuse with Option reassess)

Reassess the filter itself only if:
- PEAC Protocol or x402 v2 absorbs receipt format as protocol-layer default → Pillar 1 closes
- Facilitator ships cross-facilitator routing → Pillar 2 closes
- Option A partner says yes AND adopts the receipt format publicly → sharpen partnership playbook, lean in
- Johan's calibration changes (more time, more capital, different risk tolerance) → re-run founder-shape filter
- New agentic-payment protocol gains adoption (p402, AP2 native, MPP) → re-articulate Pillar 2 framing
- 6 months elapse without Option A signal → stale-pillar check

Do NOT reassess for: tweets, single-day signals, single-partner non-converting conversations, velocity changes that affect Options but not pillars.

---

## TrustBench infrastructure summary (current state)

### Shipped and in production
- TypeScript + Hono + Supabase + ioredis + tsx on Railway
- Crawler nightly at 03:00 UTC (Bazaar + agentic.market + Heurist Mesh + hardcoded fallbacks)
- Probe + score pipeline nightly
- `/rankings`, `/route`, `/rankings/paid`, `/mcp/tools`, `/analytics`, `/receipts/:id`, `/explorer`, `/coverage` (TBD)
- Ed25519 signing in prod, HMAC fallback in place
- Phase 4 paywall v0.1.0 live since 2026-05-11
- agentic.market validator-green
- CDP Bazaar indexed since 2026-05-13 14:09 UTC
- `@trustbench/verify-receipt` v0.1.1 on npm
- `@trustbench/mcp` connector building toward Anthropic Directory submission
- Paddock partner CSV rollup pipeline live since 2026-05-14
- Site V2 redesign live, cross-network framing
- skill.md, /.well-known/trustbench.json, llms.txt all live
- Heurist Solana mesh crawler shipped (filtered out of /route via one-line removal — multi-day work to fully integrate)

### Solo-founder calibration (CLAUDE.md)
- Capital: self-funded, ~$50/mo infra cap
- Energy: ~10-15 hrs/week after Phase 4 sprint
- Skills building: x402/p402, Ed25519 + JCS, signed-receipt + audit infra, agent-payments architecture, Hono+tsx+Supabase
- Skills avoiding: React Native, Kubernetes, sales engineering, multi-tenant auth/billing, frontend framework churn
- Risk tolerance: comfortable with technical + market risk; uncomfortable with regulatory + reputation risk

### Solo-founder principles (CLAUDE.md)
- Maximum automation, zero manual daily work
- Non-custodial only
- Honest measurement framing — never "benchmark," "oracle," "authority" unless data justifies
- Pay-to-list, never pay-to-rank
- Flat per-tx fees + simple subs; never %-spread (rejected in Phase 2 validation)
- Public scorecard signatures verifiable by third parties

---

## Cross-project notes for JarvisBrain

If JarvisBrain is reasoning about TrustBench from this feed, key load-bearing facts:

1. **The pillars + options framing supersedes earlier framing.** Read `strategic-pillars-and-options-2026-05-14.md` for the canonical version; earlier docs (`TrustBench-strategy.md`, `phase4-kickoff.md`, original `endpoint-portfolio-research-2026-05-14.md` Part I) are valid context but must be read *through* this filter.

2. **Decision-pending on A/B/C is intentional.** Johan explicitly did not commit. Do not push toward an Option in any cross-project reasoning. Present pillar-aligned alternatives and let him choose.

3. **The MCP connector is the highest-leverage thing currently in flight.** Anthropic Connectors Directory acceptance would be a major Pillar 2 win. If JarvisBrain is reasoning about cross-project orchestration, the MCP connector is the surface where TrustBench meets other agent runtimes.

4. **Receipt-format commoditization is real and time-bounded.** EU AI Act Article 12 (effective 2026-08-02) is the regulatory deadline pushing toward PEAC convergence. Any TrustBench strategic move that depends on "we sign receipts uniquely" has a ~6-month half-life from 2026-05-14.

5. **The two-pillars framing is what survives.** If JarvisBrain reasons about other projects, the same pattern applies: identify defensible positions that are complementary, name tactical options for each, gate development behind a pillar/option filter. Generic "good idea" criteria don't apply to solo-founder contexts.

6. **The Critic pass discipline is load-bearing.** When designing any non-trivial feature, run an adversarial Critic pass that produces: three rejection reasons + counter-thesis + named wedge competitor + hidden assumption + kill criterion. The pattern is in `prompts/critic.md` (referenced in CLAUDE.md).

---

## References — canonical docs (full paths)

- `C:\Users\Lithv\Documents\Claude\Projects\TrustBench\CLAUDE.md` — project agreement, founder calibration, mandatory pre-development filter, phased plan
- `C:\Users\Lithv\Documents\Claude\Projects\TrustBench\strategic-pillars-and-options-2026-05-14.md` — LOAD-BEARING canonical strategy doc
- `C:\Users\Lithv\Documents\Claude\Projects\TrustBench\sequence-of-work-2026-05-14.md` — current sequence of work
- `C:\Users\Lithv\Documents\Claude\Projects\TrustBench\gap-map-deep-dive-2026-05-14.md` — V1 + Critic + V2 comprehensive
- `C:\Users\Lithv\Documents\Claude\Projects\TrustBench\endpoint-portfolio-research-2026-05-14.md` — Options B/C source material + stress-test addendum
- `C:\Users\Lithv\Documents\Claude\Projects\TrustBench\portfolio-ofac-screening-design.md` — Option C build-ready spec (do not execute without Option-decision gate)
- `C:\Users\Lithv\Documents\Claude\Projects\TrustBench\anthropic-connector-submission.md` — MCP connector submission brief
- `C:\Users\Lithv\Documents\Claude\Projects\TrustBench\phase4-kickoff.md` — Phase 4 engineering state
- `C:\Users\Lithv\Documents\Claude\Projects\TrustBench\phase5-design-seeds.md` — Phase 5 ideas (now subject to filter)
- `C:\Users\Lithv\Documents\Claude\Projects\TrustBench\partnership-day-record-2026-05-07.md` — 2026-05-07 strategic shift context
- `C:\Users\Lithv\Documents\Claude\Projects\TrustBench\receipt-spec-v1.md` — TrustBench-format receipt envelope spec (referenced by Pillar 1)

---

**End of session record. Ready for JarvisBrain ingestion.**
