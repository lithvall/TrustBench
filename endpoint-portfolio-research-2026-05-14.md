# Boring x402 Endpoint Portfolio — Research Brief

**Date:** 2026-05-14
**Status:** Research only. Not a commitment. Not in TrustBench's Phase 4 scope.
**Origin:** Brainstorm spinoff from r/AppBusiness "65 boring apps" playbook applied to x402/agentic-payments. Question: would a portfolio of small single-purpose paid endpoints behind x402 micropayments work for agentic workflows the way 65 utility apps work for App Stores?

---

## TL;DR

The playbook is structurally a better fit for x402 than for mobile (no app-store cut, no SDK churn, no review queue, monetization rails are free), but the "boring utility primitives" lane on x402 has *already been partially taken* by Pylon (`pylonapi.com`) and agentsvc.io in 2025-2026 — both ship 20+ utility endpoints at $0.001-$0.01/call covering DNS, WHOIS, OCR, PDF generation, email validation, IP geo, and more. Competing on cheaper raw utility is a wrong-shape fight for a solo founder.

The viable wedge for someone with TrustBench's existing infrastructure is **audit-grade endpoints**: signed receipts + on-chain settlement anchor for use cases where a regulator, auditor, or counterparty will eventually ask "prove you checked." The receipt is the moat, not the utility.

**Prioritized go-list, in build order:**

1. **OFAC / sanctions name screening (free-data slice)** — highest conviction. Explicit x402-ecosystem demand quotes, free public data, weekend build, receipt is load-bearing.
2. **Aave v3 health factor + collateral breakdown** — strongest demand-density, signed-receipt valuable for dispute resolution, weekend build, plugs directly into the DeFi-agent lane TrustBench already lives in.
3. **UK Companies House parsed lookup** — clean registry gap, free ungated data, weekend build, audit-trail value, doubles as a credibility anchor for non-crypto partnerships. UK only; do not generalize to EU/SG without validation.
4. **EU VAT (VIES) wrapper** — afternoon build, lower-conviction but the receipt is genuinely useful for B2B-invoicing agents and AP2-style audit trails.

**Skip-list (do not build):** IBAN/SWIFT/routing validation, fiat currency conversion, holiday/business-day calendar.

**Build-with-caveats:** DNS/SSL/security posture (only as audit-grade differentiator, not utility), PDF page extraction (only structured-JSON + legal/compliance flavor, not raw bytes).

**Estimated effort to ship 1-4 in sequence:** ~4-5 weekends of solo-founder time, riding entirely on TrustBench's existing receipt infrastructure. Marginal infra cost: ~$5/mo per endpoint.

---

## The shape of the bet

Johan's calibration: solo founder betting on early positioning in the agentic economy, not on near-term revenue. The thesis is that big-player positioning (Google, AWS, Coinbase) signals 6-18 month growth ahead, and being on the supply side with established uptime histories + signed receipt trails creates a defensible position when discovery layers mature.

This is structurally the same bet the App Store boring-portfolio guy is making in reverse: he benefits from a mature discovery channel (App Store search) doing the demand routing for free; the x402 portfolio play bets that discovery infrastructure (agentic.market, Bazaar, awesome-x402, TrustBench-like registries, agent-framework capability routers) matures in the next 6-18 months. If it does, the early endpoints with continuous receipts win. If it doesn't, the bet is wrong.

The unit economics are favorable: per-endpoint infra cost is essentially zero, build cost is one weekend, and existing TrustBench receipt + Ed25519-signing + on-chain anchor machinery is reusable. The marginal cost of adding endpoint #5 once #1-4 are live is hours.

---

## The strategic finding that changes the play

The deep-dive research surfaced a finding that wasn't visible from the initial filter pass: **the "boring utility primitives" lane is no longer greenfield**.

- **Pylon (`pylonapi.com`)** ships DNS lookup, WHOIS, email validation, IP geo, PDF generation, and more at $0.001-$0.01/call via x402-on-Base.
- **agentsvc.io** (via MCP + x402) ships 20 tools including DNS, SSL validation, WHOIS, OCR (Tesseract), webpage reading.

This means the "ship 65 boring endpoints faster than anyone else" play is partially closed for the easy categories. Competing on price ($0.002 → $0.001) is a race to zero. Competing on breadth requires multi-week-per-endpoint maintenance treadmills that don't fit a 10-15hr/week budget.

**What remains defensible for a solo founder with TrustBench's existing infrastructure: audit-grade endpoints where the signed receipt is load-bearing.** Categories where a regulator, auditor, or counterparty will ask "prove you checked at time T" — OFAC screening, VAT validation, DeFi position reads, registry lookups for due-diligence — make the receipt valuable, and the receipt is the part Pylon and agentsvc don't ship.

This shift in framing changes the candidate ranking. The top picks aren't "what's not yet built" — they're "what's not yet built AND where a cryptographic receipt earns its keep."

---

## Registry gap-map (TrustBench probe, 2026-05-14 14:30 UTC)

Probed `/rankings` across capability slices (`search`, `data`, `inference` — 763 endpoints indexable; total registry ~1,102). Coverage per candidate:

| Category | Registry coverage |
|---|---|
| OFAC / sanctions name screening | **Zero** — only crypto/equity *screeners* (Nansen, JeetScreener, Yahoo equity_screen), unrelated capability |
| IBAN / SWIFT / routing validation | **Zero** |
| SEC EDGAR parsed filings | Well-covered (Heurist SecEdgarAgent, 7+ endpoints) |
| UK Companies House parsed filings | **Zero** — non-US registries entirely uncovered |
| DNS / SSL / security posture | **Zero in registry**, but Pylon + agentsvc on x402 outside TrustBench inventory |
| Currency conversion (fiat FX) | **Zero** — crypto rates well-covered (CoinMarketCap, Messari), fiat untouched |
| On-chain reads (generic RPC) | Well-covered (QuickNode 20+ chains at $0.001/req) |
| On-chain reads (topic-aggregated) | Partial — Heurist Mesh covers some (USDC forensics, macro calendars); narrow protocol slices (Aave HF, Uniswap LP) mostly open |
| EU VAT (VIES) | **Zero** |
| Holiday / business-day calendar | **Zero general country-holiday** — only FRED macro-release calendar |
| PDF page extraction | **Zero in registry**, but Pylon ships PDF generation (not extraction) |

**Caveat on absence:** TrustBench's crawler discovers via Bazaar + Heurist Mesh + agentic.market + hard-coded fallbacks. Endpoints hosted but not registered won't appear. Pylon and agentsvc.io are evidence the registry has visibility gaps — they exist and operate on x402 but aren't in the inventory.

---

## Per-category verdict

### 1. OFAC / sanctions name screening — **GO, highest conviction**

**Why.** Free public data (OFAC SDN, EU consolidated, UK OFSI, AU DFAT, CA SEMA), weekend build with RapidFuzz, signed-receipt is load-bearing for compliance audit, and the ecosystem demand is explicitly named:

> "The protocol verifies the payment mechanics... however, the protocol doesn't verify whether that wallet belongs to a sanctioned entity, which is critical as x402 scales from developer experiments to real agent workflows."
> — [Petter Strale, Your x402 Agent Just Paid a Sanctioned Wallet](https://dev.to/petter-strale/your-x402-agent-just-paid-a-sanctioned-wallet-now-what-4d03)

Note: this names *wallet-screening*, which Coinbase's facilitator KYT already addresses. The distinct gap is *name-vs-list screening* (entity name + DOB against sanctions lists), which is what this endpoint covers. Different problem, same audit-trail shape.

**Regulatory framing.** Frame as "public-list lookup with citation and timestamp," not "compliance determination." Return verbatim list version + match details + similarity score + Ed25519-signed receipt. Customer makes the determination. Same posture as TrustBench's "honest measurement framing" rule.

**Pricing:** $0.005/name, $0.003/name bulk (min 10).

**Endpoints:**
```
POST /screen/name              $0.005
GET  /screen/lists             $0       (list versions metadata, free)
GET  /receipts/:id             $0
```

### 2. Aave v3 health factor + collateral breakdown — **GO, strong**

**Why.** Highest demand-density of any category researched — DefiLlama Pro at $490/yr exists because agent-builders pay for DeFi aggregation; Heurist Mesh has 62 paid x402 endpoints with DeFi as the largest cluster; The Graph Gateway now accepts x402 payments. The signed receipt is genuinely differentiating: "at block N, address 0xabc had health factor 1.02" is a load-bearing audit claim when disputes are money.

**Read-only on-chain is essentially zero regulatory risk.** Watch-item: keep framing factual ("current health factor") not predictive ("at risk of liquidation") to avoid drifting toward unregistered-investment-advice territory.

**Pricing:** $0.002/health-factor read, $0.005/full positions read.

**Endpoints:**
```
GET /defi/aave-v3/health/:chain/:address      $0.002
GET /defi/aave-v3/positions/:chain/:address   $0.005
```

**Sequence note.** Ship Aave HF as v0.1; expand to Uniswap v3 LP positions, USDC large-transfers, governance tallies only after Aave HF validates. Each subsequent slice is another weekend.

### 3. UK Companies House parsed lookup — **GO, third**

**Why.** UK Companies House developer API is free with no auth-fee at `developer.company-information.service.gov.uk`, OGL-licensed, and non-US registries are an open gap (SEC EDGAR is well-covered by Heurist; UK/DE/FR/SG are uncovered). The signed receipt has audit value for agent due-diligence workflows. Doubles as a credibility anchor for partnership conversations outside crypto.

**Critical framing rule.** Do not drift toward KYB positioning — that drags in AML + GDPR + compliance certification liability the user is explicitly allergic to. Ship as "registry lookup," not "KYB." Return verbatim Companies House data + signed receipt; customer makes the determination.

**Scope.** UK only for v0.1. Skip DE/FR/SG until UK proves traction (each non-UK jurisdiction is a multi-week scrape with its own schema/quirks). Skip parsed PDF accounts (the 60% of UK filings that aren't digitized) — out of scope for solo-founder.

**Pricing:** $0.01/profile, $0.01/filings, $0.005/officer lookup, $0.01/search.

### 4. EU VAT (VIES) — **GO, lower conviction**

**Why.** Afternoon build wrapping the EU Commission's free VIES service. VIES is famously flaky during VAT filing periods (`MS_UNAVAILABLE` errors common) — the wrapper's auto-retry + caching is the value-add. Signed receipts attach to VIES's own consultation number for tamper-evident audit artifacts.

**Demand is real but narrow.** B2B-invoicing agents emitting cross-border EU invoices need VIES checks before applying reverse-charge VAT — the supplier is liable for full VAT + penalties otherwise. Existing wrappers (vatlayer $9.99/mo, VATsense, Vatstack) prove the market; the x402 + signed-receipt wedge is "agent-native discovery + verifiable audit trail" rather than price.

**Pricing:** $0.002/sync call, $0.001/async-with-retry call.

### 5. DNS / SSL / security posture — **WEAK GO (audit-grade only)**

**Why caveats apply.** Pylon ($0.002 DNS) and agentsvc.io ($0.001-$0.008 for DNS/SSL/WHOIS) already serve the cheap-utility slice. Competing on price is a race to zero; a solo founder will lose.

**The defensible slice:** *audit-grade security snapshots* with Ed25519-signed report + on-chain anchor. Use case: SOC2/compliance/audit agents that want to *prove they ran the check* against an arbitrary domain at block-time T. That's the receipt-value play Pylon and agentsvc don't ship.

**Build only if** OFAC + Aave HF validate as paying volume. This is a #4 or #5 priority, not a first build.

**Pricing if built:** $0.005/snapshot (basic), $0.015 (with subdomain enumeration via crt.sh).

### 6. PDF page extraction — **WEAK GO (structured + legal/compliance only)**

**Why caveats apply.** Frontier-model native PDF ingestion (Claude Opus 4-series with multi-hundred-page native PDF support and 1M context; GPT-5 native PDF) erased the "save agent context budget" thesis that looked solid 12 months ago. Pylon already ships PDF *generation*; raw PDF extraction is on the edge of being commoditized by LLM context windows.

**The surviving slices:**
- Batch/cost-conscious pipelines on non-frontier models (cheap Llama/Mistral RAG) where context cost still matters.
- Legal/compliance agents wanting signed extraction-time receipts for chain-of-custody.
- Structured-JSON extraction (page 47 → typed table data, not raw bytes) — differentiated work the receipt amplifies.

**Build only if** there's a specific partner asking for it. Otherwise defer indefinitely.

**Pricing if built:** $0.003 text/PDF passthrough, $0.01 structured-JSON.

### 7. IBAN / SWIFT / routing validation — **NO-GO**

Three failures: no x402-specific demand (generic commodity), signed-receipt adds nothing (mod-97 check digits don't change over time, no auditor asks for proof of validation moment), and the "real" version (bank-name lookup at scale across 80+ countries) becomes a data-maintenance treadmill that punishes a solo founder. Free incumbents (vatlayer, AbstractAPI free tiers) serve the hobbyist volumes adequately.

### 8. Currency conversion (fiat FX) — **NO-GO**

Frankfurter.dev is free, unlimited, ECB-anchored, and reliable. ExchangeRate-API has a generous free tier. The signed-timestamp angle is real but speculative — accounting auditors today accept screenshots; no one is asking for cryptographic FX provenance yet. Revisit if a specific accounting-agent partner (Acctual, Request Finance) reports their auditors demanding verifiable rate provenance. Until then, the receipt solves a problem no one has.

### 9. Holiday / business-day calendar — **NO-GO**

The `date-holidays` npm package is free, offline, 200+ countries, and ships as an embedded JSON dep. Any agent dev installs it in 30 seconds — friction is *negative* compared to a network call. Signed receipts add zero value (no one disputes that Dec 25 was a holiday). Fails capital-fit (no realistic per-endpoint volume), boredom-check (maintaining holiday JSON across countries is exactly the wrong shape for a solo founder), and demand-test (no forum threads asking for paid holiday lookup).

---

## Recommended sequence and validation gates

**Sequence:**
1. **Weekends 1-2:** Aave v3 health factor + OFAC name screening (parallel; both reuse the same receipt infra).
2. **Weekend 3:** UK Companies House profile + filings lookup.
3. **Afternoon, week 4:** EU VAT (VIES) wrapper.
4. **Pause and validate.** Don't build #5+ until #1-4 have at least one paying agent each.

**Pre-build validation gate (per Agent C's recommendation, reinforced):** Before building OFAC or Aave HF, send a 1-line message to one or two Phase 4 partners (Strata, CLU_AGENT, or a current Bazaar-indexed agent-framework partner) asking: "would a signed [sanctions screening / Aave health factor] endpoint at $0.005/call with on-chain anchor be useful to your audit / risk story?" If a "yes, send the spec" comes within a week, build. If silence, defer.

**Kill criteria (90-day check):**
- If, 90 days after shipping #1 (OFAC), the endpoint has fewer than 50 paid calls from non-self-test wallets, the bet on agentic demand maturing within 6-18 months is wrong-shape — pause the portfolio play and reinvest the time into TrustBench Phase 5 prep.
- If a competing endpoint launches the same audit-grade slice at the same or lower price, reassess differentiation rather than reflexively cutting price.

---

## Cross-cutting principles surfaced by this research

1. **Receipt-value test.** Before building any future "boring x402 endpoint" candidate, ask: *can I articulate a regulator, auditor, or counterparty asking "prove you checked at time T"?* If yes, the signed-receipt-with-on-chain-anchor earns its keep. If no, you're paying x402 discovery costs for something the agent could have done off-chain.

2. **Frontier-model capability creep is real.** Native multi-hundred-page PDF ingestion in the Claude Opus 4-series + GPT-5 native PDF erased a category that looked solid 12 months ago. For any new endpoint, ask: *what does Claude/GPT/Gemini do natively in 6 months that kills this?* DNS/TLS observation is durable (LLMs won't observe live network state for you). On-chain reads are durable. Sanctions list lookups are durable. Pure data conversions are at risk.

3. **Reuse TrustBench receipt infrastructure exclusively.** The `rrcpt_` envelope, `paid_requests` body-hash discipline, content-negotiated `/receipts/:id`, and `@trustbench/verify-receipt` npm are the moat. Every new endpoint rides on this stack — adding an endpoint costs hours, not days, only because of this. The portfolio play is *only* economically viable because the infra is already paid for.

4. **Flat per-call pricing only.** Phase 2 validation already rejected complexity-tied pricing. Pylon and agentsvc validate the $0.001-$0.01 range. Do not price per-page or per-record — that's the percentage-spread mistake in different clothing.

5. **Architectural separation from TrustBench.** These endpoints ride on TrustBench's receipt infra but ship as separate small projects with their own repos and minimal footprints. Do not bleed the portfolio scope into TrustBench's roadmap. The two reinforce each other; they don't merge.

---

## What this brief does NOT do

- Commit to building any of these. Validation gate first.
- Replace TrustBench Phase 4 listing-sprint work or Phase 5 prep.
- Define product-spec-level detail beyond sketch endpoints. If/when a "go" is committed, write a dedicated design doc per endpoint (same shape as `phase4-paywall-design.md`).
- Address custodial pathways. All proposed endpoints are read-only or compute-only.

---

# Stress-test addendum (added 2026-05-14, post-Dexter signal)

The original analysis above was stress-tested with a Critic pass on the 4 GO list and a wider-net brainstorm for additional candidates. Both passes meaningfully changed the recommendation. This addendum captures what shifted; the original section is preserved above unchanged so the analysis chain stays auditable.

## What the Critic pass found

Every single one of the 4 GO candidates was downgraded after adversarial stress-test. Two were flipped to `strong-reject`, two to `weak-reject`. Specifically:

### OFAC name screening → `weak-reject`

The wedge isn't greenfield. **`anchor-x402-mcp` already ships OFAC sanctions screening with "signed decision attestation" at $0.001-$0.010 USDC on Base** — same wedge, same price band, same receipt shape ([Glama listing](https://glama.ai/mcp/servers/hypeprinter007-stack/anchor-x402-mcp)). `mcp-sanctions-check` ships OFAC/EU/UK/UN via L402 with macaroon-scoped audit. The TrustBench registry crawler didn't find these (crawler-blindness, not actual absence). The single demand quote from Petter Strale is one blog post, not a paying customer. **AnChain.AI** is the named wedge competitor with brand, legal review, regulatory relationships, and an x402-facilitator partnership ([AnChain x402 post](https://www.anchain.ai/blog/x402)).

**Hidden assumption:** buyers will pay $0.005/name for a third-party check rather than running RapidFuzz against the free SDN download themselves *or* consuming sanctions screening as a facilitator-bundled feature.

**Kill criterion:** by 2026-08-14, if fewer than 25 paid calls from non-self-test wallets AND `anchor-x402-mcp` has added Ed25519 receipts OR crossed 1k paid calls, abandon.

### Aave v3 health factor → `weak-reject`

**`httpay.xyz` (Alfred Zhang) already ships 186 endpoints including live Aave/Compound/Morpho APY on Base at $0.001-$0.01/call** ([dev.to writeup](https://dev.to/alfredz0x/i-built-186-ai-agent-apis-in-a-weekend-heres-what-i-learned-about-x402-micro-payments-32dp)). Heurist Mesh has Aave-v3 reporting agents. QuickNode covers raw RPC at $0.001. The receipt-for-dispute thesis is unproven — Aave liquidations settle on-chain; the block hash *is* the receipt; the signed-receipt only matters if off-chain counterparties dispute reads, and no such counterparty is named.

**Counter-thesis (strongest):** don't build the primitive. Use TrustBench's `/route` to *route to* existing providers (Heurist / httpay / QuickNode / The Graph) and add Ed25519 receipts at the routing layer. That sells the actual TrustBench moat (routing + receipts) without taking on a maintenance treadmill against 186 weekly endpoints from a competitor that has a ~50-weekend head start.

### UK Companies House → `strong-reject`

**OpenRegistry by Sophymarine** ([openregistry.sophymarine.com](https://openregistry.sophymarine.com/)) ships exactly this — 26 jurisdictions including UK Companies House, free MCP server, 20 req/min free anonymous tier, productised KYB flow. They're ahead by 25 jurisdictions and the partner-with-them path is strictly better than the compete-with-them path. ECCTA changes to Companies House post-2026 make this a regulatory-shifting surface (treadmill cost). The "credibility anchor for non-crypto partnerships" framing forces exactly the multi-month sales cycle the calibration says you're allergic to.

**Counter-thesis:** reach out to Sophymarine and propose TrustBench-style signed receipts for OpenRegistry's MCP responses. That converts a direct competitor into a partner, reuses 100% of receipt infra, and gives TrustBench a non-crypto reference customer.

### EU VAT (VIES) → `strong-reject`

Vatlayer at $9.99/mo for unlimited prices above your $0.002/call at any non-trivial volume. VIESAC ships callbacks + audit IDs. viesapi.eu ships consultation-number tamper-evident audit out of box. The cross-border-invoicing-agent persona is hypothetical with no named buyer. **Stripe Tax integrated x402 in Feb 2026** — they are one PM-decision away from shipping a VAT-validation paywall, and the entire wrapper market becomes a feature of someone else's product.

### Cross-candidate finding (most load-bearing)

The Critic pass surfaced one hidden assumption shared across all four candidates and worth highlighting:

> **The Ed25519-signed-receipt moat may already be commoditizing.** `anchor-x402-mcp` ships "signed decision attestation." PEAC Protocol ships Ed25519 JWS signed receipts at the protocol layer ([peacprotocol/peac](https://github.com/peacprotocol/peac)). agentstamp ships Ed25519 stamps + trust scoring + x402. Vaultra ships RFC-3161 cryptographically-signed compliance receipts. If signed receipts become the protocol-layer default within 6 months (which the trajectory suggests), the "receipt is the moat" thesis underlying the entire portfolio play collapses simultaneously across every candidate.

**Shared kill risk:** facilitator absorption. Coinbase's CDP facilitator does KYT/OFAC at the rail layer. AWS Bedrock AgentCore Payments (May 2026 GA) bundles wallet + policy + audit trail. If facilitators absorb compliance + auditability + receipts as built-in features, every portfolio endpoint competes against a *free* feature of the rails — worse than the Pylon/agentsvc threat.

## What the wider-net brainstorm surfaced

7 new GO candidates outside the original 9:

| # | Candidate | Why it's strong | Pricing |
|---|---|---|---|
| 1 | **RFC3161 timestamp + on-chain anchor** | Canonical receipt-value play. Wraps FreeTSA + chains to existing on-chain anchor. Free public data. eIDAS-recognized legal artifact + crypto-native verifiability. Every agent eventually needs "prove this hash existed at time T." | $0.01/timestamp |
| 2 | **GLEIF LEI lookup** | Global scope (not just UK). Free no-auth public registry. Cleanest "lookup vs determination" framing of any registry candidate. Better solo-founder fit than UK Companies House (no jurisdiction expansion treadmill). | $0.003/lookup |
| 3 | **CT log snapshot** | Wraps crt.sh for the *history* (not current cert). Differentiated from Pylon/agentsvc DNS lookups. Forensic chain-of-custody use case. | $0.008/snapshot |
| 4 | **drand verifiable randomness** | Wraps League of Entropy beacon + signed receipt at round N. 100x cheaper than Chainlink VRF for off-chain agent use cases. | $0.002-0.005 |
| 5 | **openFDA recall lookup** | Live regulatory data, frontier-model-immune. "Prove agent checked recall status for SKU X at time T" is the compliance audit shape. Stronger compliance case than VAT. | $0.005/query |
| 6 | **DKIM/SPF/DMARC verification of an emitted email** | Agentic shape (single-message verification) genuinely different from dmarcian/Postmark dashboards. Fraud-detection agents need "prove this email cryptographically authenticated to claimed sender at time T." | $0.003/verification |
| 7 | **Snapshot DAO governance tally** | Companion to Aave HF — same DeFi-agent buyer, same audit-trail shape, same infra reuse. "Prove proposal X had Y% in favor at block N." | $0.003-0.005 |

Three NO-GOs from the brainstorm: disposable-email detection (saturated + receipt-low), Wikidata SPARQL (LLM-eaten), CrossRef/arXiv metadata (LLM-eaten).

Two patterns named:
1. **"Wrap a free public registry + add signed receipt" is fractal.** GLEIF, openFDA, USPTO TSDR, CourtListener, Snapshot — every government / public-good registry that ships a free API is a candidate. Differentiator is always receipt + anchor.
2. **Cryptographic primitive endpoints (RFC3161, drand, CT-log) are the cleanest receipt-value plays.** They exist *because* people want verifiable claims about time / randomness / certificate-issuance. Wrapping them is structurally aligned with the agentic-payment-native receipt thesis.

## Revised prioritization

The Critic + brainstorm together significantly change the recommendation. Three honest framings of where to go:

**Option A — Skip the portfolio play entirely; partner instead.** The Critic's strongest move: reach out to OpenRegistry (Sophymarine) and propose TrustBench-style signed receipts for their MCP responses. Same for AnChain.AI on sanctions. Same for httpay.xyz / Heurist Mesh on DeFi reads. This converts every direct competitor into a TrustBench partner where the receipt-format becomes the standard. No new endpoints; one strategic shift. **Verdict if pursued: substantially better solo-founder ROI than building.**

**Option B — Build receipt-canonical primitives, not registry wrappers.** If the portfolio play proceeds, the post-Critic best build order is:
1. **RFC3161 + on-chain anchor** — the canonical receipt-value endpoint. Highest conviction post-Critic because the receipt *is* the product, not a moat-around-a-product. Wraps FreeTSA, free public TSA, weekend build.
2. **drand verifiable randomness** — same canonical-receipt shape, similar build, complementary use case.
3. **openFDA recall lookup** — strongest compliance-audit case from the wider net. Free data, frontier-immune.
4. Pause for validation. Only then consider OFAC (and only after the pre-build partner-DM gate gets a "yes, send the spec" reply).

**Option C — Stick with the original ordering despite the Critic.** Ship OFAC first as originally planned; let the partner-DM validation gate run; treat the Critic findings as risk flags rather than rejections. This is the "stay the course" path if Johan's read is that the Critic is too hostile.

## Decision points before building anything (revised)

The original validation gate was: 1-line message to one or two Phase 4 partners. The Critic + brainstorm sharpen this:

1. **Before building anything, validate Option A.** Send 1-line messages to:
   - Sophymarine (OpenRegistry) — "would you adopt TrustBench-style signed receipts on OpenRegistry MCP responses?"
   - AnChain.AI — "would TrustBench's Ed25519 receipt format work as the canonical receipt envelope for your sanctions-screening output?"
   - Heurist Mesh — "would you accept TrustBench-signed receipts wrapping your existing DeFi agents?"
   If any of these say yes within 2 weeks, **build nothing**. Pursue the partnership. That's the strongest ROI surfaced by the entire stress-test.

2. **If Option A gets no signal in 2 weeks, run the original partner-DM gate but for Option B.** Ask Strata / CLU / Infopunks / an audit-aware agent partner: "would a $0.01 RFC3161 timestamp + on-chain anchor endpoint with signed receipt earn its keep in your workflow?" If yes, build RFC3161 first. If silence, defer the portfolio play entirely and reinvest the time in TrustBench Phase 5 prep.

3. **Revised 90-day kill criteria.** Per Critic recommendations, kill criteria are tightened from 50 paid calls to 25 paid calls (lower bar) AND a competitive-launch trigger (if a direct competitor ships the same audit-grade slice, reassess rather than reflexively cut price).

## What this addendum does NOT do

- Invalidate the OFAC deep-spec (`portfolio-ofac-screening-design.md`) — that doc stays useful if Option C is chosen. It just gets used later in the sequence rather than first.
- Change TrustBench's Phase 4 / Phase 5 roadmap — this is portfolio scope, architecturally separate.
- Recommend building anything before the validation gates run.

## Sources (Critic + brainstorm, selected)

- [anchor-x402-mcp — OFAC + signed attestation, $0.001-$0.010](https://glama.ai/mcp/servers/hypeprinter007-stack/anchor-x402-mcp)
- [mcp-sanctions-check L402 with macaroon audit](https://glama.ai/mcp/servers/HaveBlue997/l402-apis)
- [AnChain.AI x402 compliance integration](https://www.anchain.ai/blog/x402)
- [Alfred Zhang / httpay.xyz — 186 x402 endpoints in a weekend](https://dev.to/alfredz0x/i-built-186-ai-agent-apis-in-a-weekend-heres-what-i-learned-about-x402-micro-payments-32dp)
- [OpenRegistry by Sophymarine — 26 jurisdictions free MCP](https://openregistry.sophymarine.com/)
- [PEAC Protocol — Ed25519 JWS at protocol layer](https://github.com/peacprotocol/peac)
- [Vaultra — RFC-3161 compliance receipts](https://pypi.org/project/vaultra/)
- [GLEIF API — free, no auth](https://www.gleif.org/en/lei-data/gleif-api)
- [FreeTSA — RFC3161 TSA valid through 2040](https://www.freetsa.org/index_en.php)
- [drand / League of Entropy](https://drand.love/)
- [openFDA enforcement / recall](https://open.fda.gov/apis/food/enforcement/)
- [Stripe Tax + x402 (Feb 2026)](https://workos.com/blog/x402-vs-stripe-mpp-how-to-choose-payment-infrastructure-for-ai-agents-and-mcp-tools-in-2026)

---

## Original sources (deep-dive agents returned ~40 total)

- [Petter Strale — Your x402 Agent Just Paid a Sanctioned Wallet](https://dev.to/petter-strale/your-x402-agent-just-paid-a-sanctioned-wallet-now-what-4d03)
- [AnChain.AI x402 compliance integration](https://www.anchain.ai/blog/x402)
- [OFAC SDN file formats](https://ofac.treasury.gov/faqs/topic/1641)
- [EU Consolidated Financial Sanctions](https://data.europa.eu/data/datasets/consolidated-list-of-persons-groups-and-entities-subject-to-eu-financial-sanctions)
- [RapidFuzz (sanctions name matching)](https://github.com/rapidfuzz/RapidFuzz)
- [UK Companies House developer API](https://developer.company-information.service.gov.uk/)
- [VIES (EU VAT validation)](https://ec.europa.eu/taxation_customs/vies/)
- [Fonoa — Why VIES is unreliable](https://www.fonoa.com/resources/blog/vies-is-having-issues-again-so-heres-what-you-can-do-about-it)
- [Pylon AI x402 endpoints](https://github.com/pylonapi/pylon)
- [agentsvc.io MCP + x402 catalog](https://glama.ai/mcp/servers/jakobautomation/agentsvc-mcp)
- [Heurist Mesh x402 vending machine](https://docs.heurist.ai/x402-products/vending-machine)
- [DefiLlama Pro / MCP for AI agents](https://defillama.com/mcp)
- [The Graph Gateway accepts x402](https://www.cryptowisser.com/news/the-graph-gateway-now-accepts-x402-payments)
- [AWS Bedrock AgentCore Payments × x402](https://aws.amazon.com/blogs/machine-learning/agents-that-transact-introducing-amazon-bedrock-agentcore-payments-built-with-coinbase-and-stripe/)
- [Claude Opus 4.7 native PDF + 1M context](https://karangoyal.cc/blog/claude-opus-4-6-1m-context-window-guide)
- [AP2 introduction](https://agentpaymentsprotocol.info/docs/introduction/)
