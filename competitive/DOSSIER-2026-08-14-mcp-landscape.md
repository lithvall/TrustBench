---
stance_version: 2026-08-14
stance_phase: phase-4-conversion-reassessment
stance_pillars: [canonical-receipt-format-standard, neutral-routing-receipt-layer]
---

# Competitor dossier — the MCP-provider landscape

Commissioned 2026-08-14 (`NEXT-SESSION-2026-08-15-mcp-landscape-brief.md`), executed same day. Companion to `DOSSIER-2026-08-14-awesome-x402-cluster.md`, which swept one list; this sweeps the ecosystem TrustBench's only adopted surface lives in.

**Scope:** two-pass agent sweep. Pass 1: eight sources in parallel (Smithery registry API, mcp.so, mcpmarket.com, glama.ai API, modelcontextprotocol/servers + registry.modelcontextprotocol.io, three awesome-mcp lists + xpaysh/awesome-x402, Anthropic Connectors Directory, open web), producing **327 deduped matches** in TrustBench's five lanes after excluding generic MCP servers and the x402-seller long tail. Pass 2: 30 subjects deep-verified across both passes (live probe, `tools/list` handshake where reachable, npm/GitHub cadence, scale claims vs live APIs), plus a completeness critic whose confirmed misses (npm-only distribution) drove the second pass.

**Discipline:** every fact below is tagged verified (fetched live on 2026-08-14) or reported (README/directory self-description). Smithery `useCount` figures are directory-reported with unknown semantics throughout — that caveat is itself one of this dossier's findings.

---

## Method limits, disclosed up front

- **mcpmarket.com was effectively not swept** — every direct request returned HTTP 429; coverage there is bounded by 8 `site:` search queries.
- **The Anthropic directory was partially swept** — the session registry-search tool returned empty for everything including a `[slack]` canary (broken access path), claude.ai/directory 403'd; findings come from claude.com/connectors page 1 of ~17 plus `site:` searches.
- **The official MCP registry's search is unreliable** (`search=USDC` returned 0 despite USDC appearing in many descriptions); coverage there is keyword-lottery, not enumeration.
- **npm was not a pass-1 source** and both external canaries (MAKO, ScoutScore) live primarily on npm — both were missed by pass 1 and recovered by the critic. Anything distributed npm-only with no directory listing may still be invisible.
- **Never touched:** PulseMCP (self-reports 22,070+ servers), mcpservers.org, Docker MCP Catalog, LobeHub, Cursor's directory, GitHub topic/code search (the MetaMask/mcp-x402 miss proves that gap).
- **Verification coverage is 30 of 327 (~9%).** Of the 30: **7 dead or effectively dead, 12 dormant, 11 active.** Roughly 60% of the verified sample is not being worked on. Do not read the raw 327 as a live field; directories never delist.
- Smithery search tail truncation (39 queries × top-50 of 100–190 fuzzy matches) and open-web negative claims (it missed Tersign that Glama found) are both known weaknesses.

---

## Headline findings

### 1. The funnel TrustBench froze converts at zero everywhere it exists

The 2026-08-01 kill-criterion grading diagnosed an absent free→paid funnel on the MCP surface. This sweep found the funnel **already built, repeatedly, by others — and converting nowhere**:

| Operator | Funnel | Verified conversion |
|---|---|---|
| dropwatchhq agent-receipts | $0.01/receipt x402 MCP tool, official registry since 2026-06-22 | **Receiver wallet has zero transactions on basescan.** ~43 "receipts issued" are all demo-page auto-mints |
| dominion-observatory | x402-paid `paid_trust_verdict` (0.001 USDC) beside free tools | **2 external calls, ever**; interactions_last_24h = 0 |
| BoltHub | discover + auto-pay L402 marketplace in one MCP | **~$9 settled lifetime**, dashboard-verified |
| AgentStamp | free read-only MCP + $0.001 x402 stamps on Base | Network stats display zeros; dormant since March |
| AgentRadar Verify | x402 pricing designed ($0.005/call) | **Never enforced** — live call executed free, no 402 |

This materially weakens "the absent funnel is the problem" as a diagnosis. Independent operators built the exact funnel and got the same zero. The conversion problem is demand-side and category-wide, not a missing feature on TrustBench's side — the strongest single input this sweep produces for the Phase 2 debate.

**And the freeze is routable-around anyway** (observation, not proposal — the freeze stands): TWZRD ships free MCP tools pointing at paid plain-HTTP endpoints; pulsefeed and x402-list distribute payment-capable MCP via npm/own-remote without touching any curated directory; **x402-list already runs in production the exact payment-capable MCP tool TrustBench froze** (`assess_services`, $0.25 USDC, clean non-custodial two-call x402 flow). Anthropic's directory is one distribution channel, not the gate to the pattern.

### 2. Smithery "uses" is now strongly evidenced as decorrelated from usage

Direct third-party evidence, all verified today:

- **PressureDesk: 729 uses** — its public homepage is a password wall behind a self-signed cert.
- **endpoint-diligence: 24 uses** — the methodologically best product in its niche (per-check evidence, reseller-markup detection, live leaderboard).
- **Synmerco: 3,239 uses** — its production marketplace's only listing is literally titled "Smoke Test," escrow_count 0.
- **dominion-observatory: 3,449 uses** — self-instrumented server shows 2 external calls ever.

Additionally, all Smithery-hosted `*.run.tools` deployments now return 401 OAuth to anonymous POSTs — useCount accrues through the gateway and can include scanner traffic. **This shifts the prior toward "heartbeat" for TrustBench's own 1,029 (still displayed exactly 1,029 today, verified via the registry API), but does not settle it — the 2026-08-21 method-level log read remains the decisive instrument.**

### 3. Smithery was acquired by Arcade.dev this week (verified)

Announced 2026-08-05, covered by [Forbes 2026-08-10](https://www.forbes.com/sites/janakirammsv/2026/08/10/arcade-acquires-smithery-to-own-the-agent-tool-supply-chain/) and [Arcade's blog](https://www.arcade.dev/blog/smithery-joins-arcade/). The registry hosting TrustBench's only adopted surface changed owners the same week TrustBench adopted discovery-first. Arcade's stated thesis: only ~0.5% of MCP servers meet their quality bar; they want the find→run→authorize→audit chain. Unknowns worth resolving before the 2026-08-21 read: whether the gateway URL shape, OAuth gating, or useCount semantics changed under Arcade — the six recurring profiles hit a Smithery-shaped gateway URL.

### 4. Coinbase has shipped the discovery+execution slice first-party — absorption is no longer hypothetical

Verified live, keyless, today: **Bazaar MCP** at `api.cdp.coinbase.com/platform/v2/x402/discovery/mcp` — `initialize` + `tools/list` + a real `tools/call` all succeed with no auth. **15,498 resources** (verified from the public REST endpoint), semantic search with `curatedOnly=true` by default, and `proxy_tool_call` executing any discovered x402 tool through Coinbase's proxy with the client's signed payment. Payments MCP (email/OTP embedded wallet, Base+Polygon+Solana, user-set per-call/per-session caps agents cannot modify) and the auth-gated hosted Base MCP complete the trio; the open-source npm adapters (AgentKit MCP, base-mcp) are the deprecated tier. Meanwhile `x402-foundation/x402` landed **client-side spend controls in the protocol SDK on 2026-08-13** — caps are being commoditized from two directions.

What Coinbase does **not** cover first-party, verified: signed receipts / replayable audit (proxy_tool_call returns the response, not an attestation), independent liveness telemetry (Bazaar ranks on 30-day call count / unique payers / recency), cross-facilitator neutrality (curation is editorial, the proxy sees every call and payment), and BYO-key non-custodial signing. Those four gaps are TrustBench's surviving Pillar territory — and note honestly: Bazaar's "real paid calls by unique payers" signal is arguably *stronger* trust evidence than liveness probes.

### 5. MAKO is active — this morning's severity downgrade was stale when written

The sev 4→3 downgrade rested on "zero commits in 92 days." Wrong vantage. Verified today: mako.pollinateresearch.com's telemetry pipeline **ran this morning** (`/pulse.json` refreshed_at 2026-08-14T09:43Z) across **2,727 services at ~48 probes/service/day**; a whole new paid product (`/api/assurance/validate`, $0.10 — preflight risk + buyer policy with allow/deny payTo lists + delivery validation + dispute-ready signed receipts) shipped after the May-era README; site copy is dated 2026-07-22; www.pollinateresearch.com now sells $2,500 consulting engagements; the manifest points at a private repo (`ChrisDover/_MAKO`). Publishes happen without public commits (v0.4.0 shipped 8 days after the last public commit). The npm package itself is not new (v0.1.0 2026-05-09 — the X announcement decodes to 38 minutes later), and adoption is tiny (15 npm downloads/week). But **MAKO has shipped, as a paid product, the policy-firewall + dispute-ready-receipt combination that is TrustBench's declared moat-on-roadmap.** Counter-positioning that survives: MAKO's MCP requires a raw `X402_BUYER_PRIVATE_KEY` in env (TrustBench's agent-signs-EIP-3009 is structurally safer), receipts are EIP-191/sha256 not Ed25519+JCS, and there is no hosted MCP endpoint.

**Vantage lesson for `Claude.md`'s observer table:** "public GitHub commits" cannot see private-repo development, npm publishes, or live-product content changes. MAKO hit exactly this blind spot.

### 6. ScoutScore: the counter-move baseline was watching the wrong path

`scoutscore.ai/.well-known/x402` still 404s — but `GET /api/bazaar/score/:domain` has served a **live x402 v2 402 challenge ($0.001 USDC, Base) since the March refresh**. The "85 days without shipping an x402 surface" line in COMPETITIVE-MEMORY is disproven; the probe was a false negative the whole time. Registry verified at **60,970 services / 4,448 domains** (10–30x the May "2000+" claim). Watch triggers have NOT fired: no signed receipts, no routing surface anywhere. Public code/npm frozen since 2026-03-09; automated pipeline very alive; npm repo pointer 404s (closed source). Severity 3 holds; the baseline probe must be replaced (see corrections).

### 7. Pillar 1's window is open, but the receipt-standard race is real and accelerating

**Nobody verified in the wild ships TrustBench's full triple — Ed25519 + JCS canonicalization + on-chain settlement anchor — as a live, adopted format.** But the lane is filling:

- **PEAC** (sev 3 in STANCE) is the closest *format* competitor on paper: Wire 0.2 is Ed25519 + RFC 8785 JCS with explicit x402 settlement-artifact extension fields, a 3-level conformance suite with test vectors, a Go SDK, frozen-version discipline, evidence bundles. 1,134 commits, 15+ in the last week — and 14 stars, zero named adopters, 306 npm downloads/week. A one-org spec factory. Its new MCP server is stdio-local distribution, not escalation.
- **KYA-OS / Checkpoint (Vouched)** is the closest to *adoption*: donated to the Decentralized Identity Foundation, v1 ratified 2026-08-05, working-group extensions in review, 1,024 npm downloads/week, commits today. Two-line `withKyaOs()` adoption mechanic, DID-anchored keys with on-chain revocation, RFC 9162 transparency log. Scope: tool-call *action* receipts, not payments — no settlement semantics. If they extend to commerce (it's in their marketing), they become the strongest absorber in the lane.
- **Xaip** (active, commits through 2026-07-30): co-signed execution receipts + an actual IETF Internet-Draft (draft-xkumakichi-xaip-receipts), 8,724 receipts verified live — nearly all self-generated, honest riskFlags say so. "Not a payment rail" by design.
- **paybond.ai** (distinct from the x402 dossier's "Paybound" — see corrections): actively-shipping (~weekly releases, 394 npm dl/wk, now closed-source) "Agent Receipt Standard" linking intent→evidence→decision→settlement.
- **IETF crowding:** draft-nelson-agent-delegation-receipts at rev 10, draft-farley-acta-signed-receipts targeting MCP explicitly, draft-schrock-ep-action-evidence-graph. All authorization/decision receipts — **the payment-receipt slot at IETF appears to be literally empty.** That is a concrete, checkable Pillar 1 opening, and it composes with the 2026-08-02 offer-receipt finding (router receipt carries the merchant receipt).
- A "signed verdict/receipt" vocabulary cluster formed in June–July across independent registry publishes (402oracle, blackwall-x402-guardrail, coffee.402) — vocabulary spreading faster than cryptography: Viridis's "receipts" have no signatures at all; ForgeMesh's Merkle anchor is "pending"; payanagent's are HMAC (not third-party-verifiable). Only srotzin's hive suite matches TrustBench's actual Ed25519+JCS stack (plus an unverified post-quantum dual-signature claim — and an Aug 2 commit admitting it previously "fabricated Attest success," plus a USPTO provisional patent, which cuts against neutral-standard adoption and is a clean open-spec differentiator for TrustBench).

### 8. Measurement depth is now table stakes — TrustBench's probe is bottom-quartile in its own cohort

Verified probe depths in this sweep: nohumans.directory **57,599 probes/24h** across 676 listings with x402 v1/v2 conformance columns and on-chain unique-payer counts; MCPQueen full MCP handshakes with live tools/list capture across a claimed 9,326 graded servers; MAKO ~48 probes/service/day; PreFlight *pays* the target and verifies contract→402→settlement→delivery; mainstreet scores from actual x402 settlement history + ERC-8004; x402-list ranks on on-chain-verified settlement traction with anti-wash rules (pro-quota shared-payTo attribution, volume floors, buyer-concentration discounts, versioned ranking generations); Bazaar ranks on real paid usage. Against that, TrustBench's nightly 3-sample HEAD probe is the shallowest instrument in the field it created for itself. **Public-copy rule reaffirmed with teeth: never describe TrustBench telemetry as competitive on depth.** The x402 dossier's "un-pause the paid probe" item is strengthened accordingly.

### 9. The graveyard pattern spans all five lanes — nobody has demonstrated adoption

Highest verified npm weekly downloads in the entire non-incumbent cohort: twzrd-x402-gate 4,721 (inflatable by CI), KYA-OS 1,024, paybond 394, pulsefeed 335. Everything else is under 300/week — noise floor. Registry supply-side acquisition fails universally (Solinkify's machine-verified registry contains exactly 1 entry: their own demo). Zombie infrastructure is endemic: PreFlight's backend is a Railway 404 while its prober still hits TrustBench; x402station's backend refuses connections while its crawler runs; 402.bot has been TLS-dead while listed "Active" in the official MCP registry since March — **the official registry never re-validates**, a third-party proof point for live telemetry as a category need. Listing farms pollute every count (dropwatchhq: 31 servers published in 2 days; wishpool: ~80 country-payment clones; Br0ski777: ~60 near-identical x402 utilities).

### 10. What TrustBench uniquely holds, after seeing the whole field

(a) The **full receipt envelope triple** (Ed25519 + JCS + on-chain settlement anchor) — unmatched in the wild; (b) **non-custodial agent-signs-EIP-3009** — the cohort is raw-private-key-in-env (MAKO, payanagent, AgentWallet, payfetch) or outright custodial (Lightning wallet MCP, Synmerco, Rhumb's managed credentials, Coinbase's embedded wallet); (c) a **hosted, free, unauthenticated remote MCP** — much of the cohort is stdio-only; (d) **public source** — ScoutScore, x402-list, paybond, Mnemom, Ontario all ship closed; (e) honest-framing — though no longer a differentiator by itself: dominion, Xaip, TWZRD, nohumans, and x402-list all now ship machine-readable epistemic humility as a product feature. The differentiation left in honesty is *execution* (signed, verifiable, third-party-checkable), not vocabulary.

---

## Verified subjects by lane

Compact entries; `[cadence]` = last human activity, verified via GitHub HTML / npm registry unless noted. Full per-subject detail is in the session working notes; everything load-bearing is here.

### Registry / discovery

- **x402-list MCP** (`mcp.x402-list.com`, same operator as x402-list.com — resolved via npm maintainer) — ACTIVE, the most sophisticated competitor in the set. Live handshake verified; 6 tools incl. **paid `assess_services`** ($0.25 x402, non-custodial pass-through) and ranking v3 on on-chain settlement traction with anti-wash rules. 541 services (live API). Closed-source core; 7 releases in 3 weeks to 2026-07-28. [cadence: 2026-07-28 release; directory live-updating]
- **nohumans.directory** — ACTIVE, direct today-product competitor, materially ahead on measurement (57.6k probes/24h verified via `/v1/stats`; x402 v1/v2 conformance per listing; on-chain payer counts; payTo-rotation resets reputation). 676 listings. Read-only MCP verified live. No routing, no receipts, no visible monetisation — harvesting agent demand data instead. Compose candidate. [cadence: 2026-08-12]
- **MCPQueen** — ACTIVE, TrustBench's exact registry+probe+«Trust Receipts» concept applied to MCP servers; launched ~2026-07-12, org-backed (Health AI), full-handshake probing verified live (probed_at 2026-08-12), 7 read-only tools with injection-hardened instructions. "Trust Receipts" are evidence documents, NOT signed artifacts. A commit literally named "Prepare Anthropic distribution workflow." [cadence: 2026-07-29 repo; infra probing now]
- **402 Index** (402index.io, Ryan Gentry) — ACTIVE, the one mega-count registry whose number is real: 93,664 endpoints verified via live API (~85% uncategorized bulk crawl). Cross-protocol L402+x402+MPP — TrustBench's Phase 5 ambition, shipped. Free tier + L402-paid API. **July 29 commits reference "routing infrastructure, Stripe integration, settlement systems" — a directory→router move into Pillar 2 territory; watch.** No signed artifacts anywhere. Option A candidate (emits health data, unsigned). [cadence: 2026-07-30]
- **Coinbase Bazaar MCP** — see headline finding 4. [hosted, first-party, active]
- **payanagent** — ACTIVE; "24,000+" claim is ecosystem mirroring — native inventory verified 751, native volume verified **$0.15 total**. Emits HMAC-signed receipts as "the reputation layer" — receipts-as-reputation thesis shipped with weaker crypto; natural Option A target. [cadence: 2026-08-10]
- **Cinderwright Discovery Hub** — DORMANT since mid-June; four mutually inconsistent catalog counts (1,400/1,450/2,835/4,000); pivoted from paid x402 discovery to a prepaid metered proxy. Its "$0.10 free credit, no account, no wallet" keygen onboarding is the cleanest funnel primitive seen in the sweep. [cadence: 2026-06-11]
- **X402 Service Discovery (rplryan/x402scout)** — DEAD, and instructive: registry+rankings+attestation+relay-router — both TrustBench pillars in one project — monetised via x402'd discovery reads plus a %-spread on routed calls, listed on every directory, suspended by its owner (`suspend-by-user` on all four Render services) after a ~2-month life. The %-spread model TrustBench's Phase 2 builders rejected didn't sustain it either. [cadence: 2026-03-11]
- **x402search / x402-index** — DEAD (Vercel deployment deleted); "13,000+" claim frozen at death. **BoltHub** — DORMANT; discover+auto-pay L402 marketplace, verified $9 lifetime volume. **Arclan** — DORMANT infra-live; real handshake-validated MCP-server registry with honest state taxonomy (zombie/auth_gated) and crowd-sourced `report_server`. **402.bot** — DEAD (TLS broken from two vantages) while "Active" in the official registry. **MCPpedia** — ACTIVE MCP-server directory (31k listings rendered), free, not-pay-to-play, no x402 relevance; a listing venue, not a rival. **Rhumb** — DORMANT since June; all five lanes in one solo product ("Index ranks the field, Resolve routes the call" — crisp copy worth remembering); managed-credential custody contrasts with TrustBench.

### Trust-gate / scoring / reputation

- **MAKO** — see headline finding 5. Severity restoration proposed below.
- **ScoutScore** — see headline finding 6.
- **mainstreet** — ACTIVE and fast (142 commits in ~1 month, commits today, Claude-co-authored): scores counterparty wallets from **actual x402 settlement history** (via third-party indexer x402.fuchss.app) + ERC-8004 + identity proofs; EIP-712-signed, on-chain-verifiable score attestations (Pillar-1-shaped); free tier → paid x402 audits; 19 tools verified live. Smithery 2,881 "uses" vs 4 npm downloads/week — the useCount decorrelation again. Token ($MAIN) hype risk. [cadence: 2026-08-14]
- **TWZRD Agent Intel** — ACTIVE (commits yesterday); Solana-side mirror of TrustBench's shape; free MCP tools → paid HTTP trust calls ($0.05, signed V6 receipts + own verifier + own facilitator) — **the freeze-compatible funnel pattern, live**; machine-readable "honesty" block in responses; does NOT list TrustBench (Solana-only catalog, verified by grep). Severity jumps if it crosses to Base. [cadence: 2026-08-13]
- **PreFlight (usepreflight.xyz)** — the `preflight402-probe/0.1` UA that hit `/route` 99 times IS this project (verified via repo README). Deepest methodology in the field: pays targets, verifies contract→402→settlement→delivery, Ed25519 receipts + "verification passports." Backend currently a Railway 404 while the prober still runs. **They have (or had) real buyer-journey data on TrustBench's paywall; if they publish verdicts, that's reputational surface TrustBench doesn't control.** [cadence: 2026-07-23; active=unknown]
- **x402station** — DORMANT split-brain (UI live, backend refuses connections, crawler still hits TrustBench's /.well-known/x402). Its warning taxonomy (`never_paid_zombie`, `wildcard_402`, `spa_fallback`, `decoy_price_extreme`) is a better public vocabulary than any single score — and it would specifically catch things a 4xx-is-alive HEAD probe calls healthy. A dead-endpoint detector that is itself a zombie by its own definition. [cadence: 2026-06-02]
- **Ontario Protocol** — ACTIVE, closed-source, most sophisticated trust-gate operator: free-router-gates-paid-upsell funnel on its own /mcp (verified live, same-day feed), **provider pay-to-publish at 0.50 USDC** (a shipped pay-to-list analog of TrustBench's verification-bond idea), B2B trust-feed pilot, and an AEO stack including `/compare/x402-verification-tools` — **follow up: check whether and how TrustBench is framed there.** Smithery 982 uses, no independent usage evidence. [cadence: unknown/closed; feed generated today]
- **endpoint-diligence (x402supply)** — ACTIVE; best per-check evidence methodology in the niche (reseller/markup detection, "unknown never penalizes", price percentiles over n=2,901); $0.02 x402 checks; 24 Smithery uses. Free weekly market reports + per-host SVG badges = cheap solo-founder-shaped distribution ideas. [cadence: closed-source; leaderboard daily]
- **Pulsefeed x402** — ACTIVE (commits this week, incl. an automated daily demand/funnel-counter loop — the measure-before-building discipline); paid verification oracle $0.004/call via x402, stdio-npm distribution sidestepping directory review; markets with the dead-listing rate ("18% dead") — TrustBench's honest-telemetry wedge, weaponized as a headline. [cadence: 2026-08-13]
- **dominion-observatory** — DORMANT; the radically honest self-instrumented trust oracle for MCP servers (47,492 indexed / 1 live-scored / 2 external calls ever, self-reported via live tools/call). Its deny-list-based external-agent classification is worth copying for TrustBench's own UA analysis. Validated-negative for the "trust oracle for MCP" thesis. [cadence: 2026-05-25]
- **trustscoreagent** — ACTIVE, tiny (20 services, all self-probed; 44 npm dl/wk); near mirror-image of TrustBench (reputation registry + Ed25519 receipts + Merkle audit + "x402 later"); `service_supports_receipts` boolean per listing is a cheap Pillar 1 propagation mechanic worth adopting; small Option A target. [cadence: 2026-08-13]
- **Mnemom** — ACTIVE, closed-source, polished: 74 tools verified via anonymous tools/list; Ed25519-signed scorecards with **in-band verification against a JWKS served as an MCP resource** — TrustBench's verify pattern executed more maturely (self-describing envelopes, verify-signature vs verify-chain-integrity split). No settlement anchor, no payments. Note: their `scan_trust` will grade trustbench.io on their rubric with a signed public permalink — worth running once to see the result. [cadence: platform v2.0.0; repo metadata-only]
- **AgentRadar Verify** — DORMANT (2 commits ever); live free scoring pipeline; advertised x402 pricing never enforced. **PressureDesk** — DORMANT/broken; the 729-uses-vs-password-wall exhibit. **AgentStamp** — DORMANT; Ed25519 + body-bound signatures + hash-chained event log, zero-population network — external validation that free-read-only-MCP + sub-cent x402 does not self-convert.

### Receipts / attestation

- **PEAC, KYA-OS/Checkpoint, Xaip, paybond** — see headline finding 7.
- **dropwatchhq agent-receipts** — see headline finding 1. Also: uses the `rcpt_` prefix (collides with TrustBench Phase 3 in the wild, structurally unrelated format); operator is an anonymous 31-server registry farm; facilitator is **payai.network** (multi-chain incl. Solana mainnet, keyless, gas-sponsored, OFAC filtering, free 10k settlements/mo — relevant datapoint for P4-3 and for CDP-facilitator dependence). [cadence: registry 2026-06-22, frozen]
- **ForgeMesh x402 Notary** — ACTIVE org (24 repos, Aug activity), industrialized TrustBench-paywall pattern: 11 x402 services from one wallet, $0.001 notarization, Ed25519 real but Merkle anchor "pending" — no settlement anchor in the receipt. Different lane (notarizes AI *output*). Zero-cost tactics worth noting: fleet-discovery header on 404s; selling the catalog itself as a $0.05 x402 endpoint. [cadence: org active Aug; notary repo one-burst 2026-07-04]
- **Agent Receipts (webaesbyamin)** — DORMANT; Ed25519 receipts for MCP tool calls generally; hash-chained (`get_chain`), `get_public_key` as an in-band tool, offline-verifiable export bundles, `get_started` onboarding tool — four cheap read-only ideas, none touching the frozen surface. Abandoned at 1 star — receipt infrastructure without a payment rail attached does not self-distribute. [cadence: 2026-04-13]
- **agent-receipts-mcp (dhanushs1912)** — one-day burst 2026-07-17, EU-AI-Act-framed, hash-chained; low signal beyond confirming the design convergence. **Hive suite (srotzin)** — ACTIVE-bursty; the only cohort member on TrustBench's exact Ed25519+RFC 8785 stack; Ed25519-signed HTTP provenance headers on every response (adoptable transport-level pattern); pre-action attestation (sign intent before the call); patent-anchored (USPTO provisional) — open-spec vs patented-spec is a clean Pillar 1 contrast. Credibility caveat: Aug 2 commit "Replace fabricated Attest success with honest 404." [cadence: 2026-08-03] **Viridis** — ACTIVE; receipt *vocabulary* with no signatures and no anchoring ("no other fleet can publish this receipt" = trust-the-server) — the exact model TrustBench's envelope exists to beat; novel cascading-recall/lineage-quarantine primitive. [cadence: 2026-08-10]

### Spend-control / policy

Cross-cluster verdict: **nobody has verifiable adoption** (every package under 250 npm dl/wk; 4 of 5 in cluster 2 dormant or dead), which supports the thesis that policy features don't sell standalone — they belong bolted to a rail that already has traffic. Recurring primitives TrustBench's `/route` lacks, by frequency: **recipient/host allowlists** (7+ subjects), **human-approval thresholds/queues** (5+ — phone-approve in SpendNod, queue in agentpay, threshold in payfetch), **circuit breakers** in two distinct forms (payfetch's failure-triggered per-host 7-day auto-deny; Countersign's sub-second cross-rail freeze), **per-host daily caps + lifetime caps** (payfetch), **session budgets with TTL** (agentpay), **signed denial/cap-hit receipts** (payfetch's refuse-and-receipt; MEOK's signed budget-exhausted attestations — natural receipt-spec extensions: TrustBench only receipts successes), **pre-spend advisory verdict API** (SIPI's APPROVED/BLOCKED/FLAGGED), and **portable signed spending mandates** (Delegare — pairs naturally with receipts as the pre-authorization artifact; also note Delegare's pricing: "3% capped at $0.03 flat" — a flat fee dressed as a percentage, further confirming the flat-per-tx direction). **Correction to the x402 dossier: hourly caps did NOT appear anywhere in this lane** — that item stays sourced to Sentinel alone.

A design fault line worth citing in TrustBench positioning: agentpay-mcp makes `set_spend_policy` agent-callable (the agent can raise its own caps); Countersign does the opposite (policy is orchestrator-set, never agent-callable). TrustBench's server-side enforcement is already on the right side — say so publicly.

Subjects: **Countersign** ACTIVE (78 commits/90d, testnet, 152 dl/wk; also crosses into the receipt/audit lane with a tamper-evident signed ledger anchored to Base — deserves its own index entry) · **payfetch** DORMANT (best-designed policy schema in the lane; read it as a spec) · **payguard/GuardianRail** ACTIVE-maintenance (Pharos hackathon; `eth_call` pre-flight simulation + canonical-asset anti-spoofing check are both adoptable into `/route` quote construction; **the "Arbor" name from the sweep could not be verified as any real project — treat the source listing as unreliable**) · **agentpay/clawpay** DORMANT (manufactured marketing footprint; on-chain cap enforcement via smart-contract wallet is the one stronger-than-server-side idea) · **Solinkify** ACTIVE Solana devnet platform (registry relevance: machine-verifies 402-answer + manifest-validity + **payout-wallet-equals-signer** before listing — a stronger listing gate than TrustBench's HEAD probe, maps onto the verification-bond design; their registry has 1 entry, their own demo) · **SpendNod** DORMANT (phone-approval UX; mid-pivot stall) · **SIPI** ACTIVE (advisory verdict engine, live unauthenticated tools/list) · **MEOK** DORMANT (registry-advertised remote is DNS-dead — listing-vs-reality drift exhibit) · **Delegare** DORMANT (the mandate primitive; watch for revival) · **MetaMask** — the mcp-x402 repo is a 3-star experimental scratch (dormant, unpublished); **the real MetaMask x402 story is Smart Accounts Kit** (promoted 2026-06-05): ERC-7710 delegation-scoped spend controls + recurring payments without per-request re-signing — caps enforced in the wallet delegation itself, a separate watch item at the wallet layer.

### Payment / wallet / incumbents (context)

**Stripe MCP** — active daily; meta-tool pattern (4 generic tools fronting ~100 whitelisted methods — the context-window-scaling pattern if TrustBench ever exceeds 3 tools); two-track auth (OAuth + restricted-key for headless agents); free MCP as funnel to processing fees — the shape TrustBench wants. The Anthropic directory's observed payment shelf (see below) is where Stripe/PayPal/Square sit. **AgentWallet** — active; buyer AND seller-side x402 toolkit; micro-metered USDC billing via x402 itself with free monthly quotas — a concrete template for paywall v0.2.0's free tier; if it enters the Anthropic directory, that's a datapoint on the freeze. **Lightning wallet MCP** — active custodial L402/x402 auto-pay with in-band agent self-registration. **Synmerco** — dormant custodial escrow OS; 3.25% fee; smoke-test-in-prod. **Interline** — dormant testnet-only client-side router; **closest verbal clone of Pillar 2** ("OpenRouter for agent payments" nearly verbatim) with an AP2-mandate inbound adapter; 60–90-day re-check. **PayRouter** — dead 2-commit scaffold; Glama described it as a "universal agentic payment router" — directory description of pure vaporware, the calibration exhibit. **x402-go (mark3labs)** — dormant since a Feb v2-migration beta; x402 is NOT upstreamed into mcp-go; its client-transport pattern (auto-catch 402, sign, retry) means agents increasingly never *see* the 402 — the funnel must live in discovery/routing, not the 402 itself; v0.9.0 added x402scan support = libraries treat third-party receipt/observability surfaces as integration points, a concrete Pillar 1 target class.

### The Anthropic Connectors Directory shelf (observation only)

Verified from public claude.com/connectors pages: the directory lists **official fiat vendors with read/write payment capability** (PayPal, Stripe, Square, Plaid, Airwallex, Shopify; spend-management: Ramp, Brex, Mercury). Crypto-side entries are **read-only data connectors** (Crypto.com — explicitly cannot trade/transfer; Blockscout; QuickNode). **No x402, agent-wallet, or stablecoin-transfer connectors were observed, and zero entries in the registry/receipt/trust lanes.** No inference drawn about TrustBench's escalated review; the composition is simply the observed context the review sits in.

---

## The unverified long tail

311 lane matches were not deep-verified this pass: ~98 multi-lane, ~81 payment/commerce, ~35 receipt/attestation, ~32 registry/directory, ~26 spend-control, ~39 trust-scoring. Given the verified sample's ~60% dead/dormant rate, treat the long tail as majority-inactive listings. Flagged by name for a future pass, with evidence they matter: **io.github.Rumblingb/agentpay** (live remote at api.agentpay.so, registry-active since April — looked real, never probed); **Authoryze** (the AgentPays rename — spending rules, approval flows, single-use virtual cards, OAuth for Claude/ChatGPT); **402oracle**, **blackwall-x402-guardrail** (GO/HOLD/STOP verdicts *with signed receipts*), **coffee.402**, **x402-listing-monitor** (watches Bazaar listings for drops — registry-telemetry lane); **goodmeta Agent Payments Intelligence** (464 Smithery uses); **AurelianFlo** (pay-per-call **OFAC screening via x402**, 596 uses — directly overlaps the shelved Option C OFAC design; someone shipped it); **hermes-payguard** (Circle USDC guard, 13 stars); **Routeweiler** (cross-rail client, unverified); **Checkout.com / Crossmint / Fewsats / Alby** (incumbent-adjacent). Also unswept as sources: PulseMCP, mcpservers.org, Docker MCP Catalog, LobeHub, GitHub topic search.

---

## Corrections to existing TrustBench artifacts (hygiene, do now)

1. **COMPETITIVE-MEMORY / STANCE — MAKO:** the 2026-08-14-morning sev 4→3 downgrade was stale when written (headline 5). Proposed: restore to 4 (below).
2. **COMPETITIVE-MEMORY — ScoutScore:** replace the `.well-known/x402` 404 baseline with a 402-challenge check on `scoutscore.ai/api/bazaar/score/:domain`; strike the "85 days without an x402 surface" claim (x402-live since March).
3. **x402 dossier — "Paybound":** `pando-b/paybound` (dormant credential vault, never verifiably a "governance proxy with circuit breakers") and **paybond.ai** (`@paybond/kit`, active weekly releases, "Agent Receipt Standard") are **two different entities**. The dossier entry conflated a stale list description; track paybond.ai separately (proposed sev below), close pando-b/paybound.
4. **x402 dossier item 9:** "hourly spend caps" did not recur anywhere in the MCP spend lane; keep it attributed to Sentinel alone, not presented as a lane pattern.
5. **gap-map-deep-dive-2026-05-14.md:** x402index.com and x402search.xyz are dead (deployment deleted / no TLS listener); the paywalled-search competitor references are stale.
6. **Memory hygiene:** "AgentPay" is three distinct products (up2itnow0822 stdio package, Rumblingb remote, AgentPays→Authoryze); "@yudduy/ScoutMCP" on Glama is NOT ScoutScore. Record to avoid future conflation.

---

## Proposed severity deltas — PENDING Johan; STANCE.md not modified by this session

Per the 2026-08-14 rule, every proposal below has verified commit_cadence. STANCE.md updates are Johan's call; nothing was changed there.

| Entity | Current | Proposed | One-line justification (all verified today) |
|---|---|---|---|
| MAKO Pulse | 3 | **4 (restore)** | Active (telemetry ran today, post-May paid Assurance product, private-repo dev); shipped policy-firewall+receipts as paid product |
| Coinbase facilitator | 3 | **4** | Bazaar MCP live+keyless: 15,498-resource discovery + payment-proxied execution; SDK spend controls landed 2026-08-13; absorption of the discovery/routing slice is shipped, not hypothetical |
| x402-list | — | **NEW 4** | Active; production payment-capable MCP funnel + on-chain-traction ranking v3; direct discovery-first competitor, ahead on method |
| nohumans.directory | — | **NEW 3** | Active; direct today-product overlap with far deeper measurement; no receipts/routing (compose candidate) |
| mainstreet | — | **NEW 3** | Active, very fast; settlement-history trust scoring + EIP-712 verifiable attestations (Pillar-1-shaped) |
| KYA-OS / Checkpoint (Vouched) | — | **NEW 3** | Active daily; DIF-ratified action-receipt standard with real distribution; absorber-if-they-add-commerce |
| ScoutScore | 3 | 3 (hold) | Watch triggers not fired (no receipts, no routing); baseline probe corrected |
| PEAC | 3 | 3 (hold) | Format-complete but zero adoption; MCP server is distribution, not escalation |
| Ontario Protocol | — | NEW 2 | Active closed-source; shipped funnel + pay-to-publish; no receipts/routing |
| Pulsefeed x402 | — | NEW 2 | Active; paid verification oracle, solo-scale |
| paybond.ai | — | NEW 2 | Active weekly releases; "Agent Receipt Standard"; closed-source, 394 dl/wk |
| Countersign | — | NEW 2 | High velocity, zero adoption, testnet; receipt/audit crossover |
| TWZRD | — | NEW 2 | Active; Solana-side mirror with freeze-compatible funnel; jumps on Base entry |
| Xaip | — | NEW 2 | Active; IETF I-D on receipt territory; no payments; Option A candidate |
| 402 Index | — | NEW 2 | Active; real 93k catalog; watch the routing/settlement commits (→3 if it ships routing) |
| MetaMask Smart Accounts Kit | — | NEW watch item | First-party wallet-layer spend controls via ERC-7710 delegation; not an MCP subject |
| Dead/dormant cohort (X402SD, x402station, PreFlight*, dominion, AgentStamp, Rhumb, BoltHub, dropwatchhq, Synmerco, AgentRadar, Interline, PayRouter, 402.bot, x402search, Cinderwright, SpendNod, MEOK, Delegare, payfetch, agentpay, x402-go, MetaMask/mcp-x402) | — | 1 (documented) | Verified dead or ≥60d human-silent; *PreFlight = unknown (backend dead, prober alive, commits 3 weeks ago) — re-check |

---

## Ranked takeaways for TrustBench

Candidates, not commitments. Items 3–10 are product/positioning changes needing a six-question filter pass; items 1–2 are inputs to the path-forward debate, not work.

1. **The funnel diagnosis needs revision before anything is built on it.** Five independent operators ran the free→paid-MCP funnel and converted zero (headline 1). The bottleneck is category demand, not TrustBench's missing fourth tool. The freeze is likely costing ~nothing — and the pattern is routable-around later via paid plain-HTTP + free MCP pointers (TWZRD/x402-list precedent) without touching the reviewed surface.
2. **Re-read the 1,029 with shifted priors, and check the Arcade variable.** PressureDesk/Synmerco/dominion demonstrate useCount⊥usage. Before the 2026-08-21 log read, verify the Smithery/Arcade transition didn't change gateway URL shape or profile semantics mid-sample.
3. **Say the two things only TrustBench can say, everywhere:** (a) non-custodial agent-signs-EIP-3009 — the entire verified cohort holds keys, takes custody, or wants raw keys in env; (b) the full envelope triple with offline verification. Both are free copy changes with verified competitive backing. Corollary: never claim telemetry depth (headline 8).
4. **Pillar 1 has a named, checkable opening: the payment-receipt slot at IETF is empty.** Delegation/action/decision receipts have drafts; payment receipts don't. Composes with the 2026-08-02 "router receipt carries the merchant offer-receipt" finding. The bar to clear is PEAC's conformance-suite + test-vectors pattern and KYA-OS's two-line-adoption + foundation-donation playbook. Big decision — Johan + filter.
5. **Un-pause the paid probe (x402 dossier item 2, now stronger).** The whole field probes deeper; PreFlight pays targets; Bazaar ranks on real usage. The single highest-integrity upgrade remains converting liveness telemetry into verified-call telemetry.
6. **Wire telemetry into policy: the per-host circuit breaker.** payfetch's failure-triggered auto-deny is client-side and blind; TrustBench already measures provider failure nightly and could ship a telemetry-informed routing breaker no client-side tool can match — a genuinely differentiated adoption of the lane's best primitive.
7. **Receipt-spec v2 seeds, from convergent evidence:** hash-chaining (Tersign + dropwatchhq + AgentStamp + webaesbyamin all ship it; omission-detection), signed denial/cap-hit receipts (payfetch, MEOK — receipts currently only exist for successes), and the offline-verifiable export bundle (PEAC, KYA-OS, webaesbyamin). All three now have multi-source precedent.
8. **Listing-gate upgrade for the registry:** Solinkify's machine-verification (valid 402 + manifest validity + payout-wallet-equals-signer) and x402-list's `payment_ready` distinction — maps directly onto the verification-bond design and the x402 dossier's item 3.
9. **Cheap distribution patterns with verified precedent:** per-provider SVG badges (endpoint-diligence, MAKO, AgentRadar), machine-readable `pulse.json`-style feed with freshness timestamps (MAKO), free weekly market report as AEO surface (endpoint-diligence), `get_started`/`get_public_key` read-only MCP tools (webaesbyamin — filter-pass compatible with the freeze).
10. **Option A outreach shortlist, evidence-based:** payanagent (active; HMAC→Ed25519 upgrade pitch), 402 Index (active; unsigned health data), trustscoreagent (active; `service_supports_receipts` flag), Xaip (active; interop conversation), x402-go-class libraries (emit/accept TrustBench receipts the way they added x402scan).
11. **Follow-ups queued:** check Ontario's `/compare/x402-verification-tools` for TrustBench's framing; run Mnemom's `scan_trust` on trustbench.io once to see the verdict; re-check PreFlight when its backend returns; watch 402 Index's routing commits; AsterPay signer registry as a possible propagation surface.

---

*Verification sources: live HTTP/JSON-RPC probes, registry.npmjs.org + api.npmjs.org, github.com HTML, registry.smithery.ai API, glama.ai API, registry.modelcontextprotocol.io, basescan (dropwatchhq wallet), [Forbes](https://www.forbes.com/sites/janakirammsv/2026/08/10/arcade-acquires-smithery-to-own-the-agent-tool-supply-chain/) / [Arcade blog](https://www.arcade.dev/blog/smithery-joins-arcade/) (acquisition). All probes 2026-08-14. No installs, no payments, no changes to TrustBench's MCP surface.*
