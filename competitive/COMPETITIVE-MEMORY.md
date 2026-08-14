---
stance_version: 2026-08-14
stance_phase: phase-4-conversion-reassessment
stance_pillars: [canonical-receipt-format-standard, neutral-routing-receipt-layer]
---

# Competitive memory — index

> **Light-mode artifact:** human-curated, categorized index. Self-flags via `stance_version` frontmatter when STANCE.md drifts. For the auto-generated quick-reference (regenerated from STANCE.md), see `competitive/SEVERITIES.md`.
>
> Operating brief: [COMPETITIVE-BRIEF.md](COMPETITIVE-BRIEF.md). Schema: [MEMORY-SCHEMA.md](MEMORY-SCHEMA.md). Run scan via [weekly-scan-prompt.md](weekly-scan-prompt.md).
>
> Severity legend: 5 active/scaling, 4 direct overlap, 3 adjacent pivot-risk, 2 absorption-risk, 1 tangential. Downgrades require a written reason in the per-competitor file.

## Refresh note — 2026-08-14

First refresh since 2026-05-17 (89 days). The gap is not a scan cadence failure in isolation: the project had a 68-day human-commit gap (2026-05-25 → 2026-08-01) and the competitive role paused with it. Every severity below was re-verified by live probe on 2026-08-14 rather than carried forward on memory, per the brief's "time-stamp everything" rule.

**The finding that reframes this index: three tracked entities went dormant in the same quarter while their infrastructure kept running.** MAKO Pulse (repos silent 92d), Infopunks (shut down), and partner-side Strata (repos silent 97d) all show the same shape — crons answer, humans stopped. Uptime is not evidence of activity, and this index previously treated a live endpoint as a live competitor. Commit cadence is now a required field for any severity ≥3.

## Direct 1:1 (severity 4-5)

- [MAKO Pulse](threats/mako-pulse.md) — **sev 4 → 3** (downgrade reason in file) — URL RESOLVED 2026-08-14: `mako.pollinateresearch.com`, built by Chris Dover (@ChrisDMacro, chrisdover.com: *"Currently building MAKO"*). Capability overlap is still direct — `ChrisDover/mako-mcp-server` ships route/pulse/pricing/reputation/verify as MCP tools — but velocity is zero: `mako-verifier` last pushed 2026-05-13, `mako-mcp-server` last pushed 2026-05-14. Their prober remains the single largest source of `/route` traffic (`mako-pulse-prober/0.1`, 297 of 419 requests, 2026-07-25→08-01). Last scan 2026-08-14.

## Routing / discovery overlap (severity 2-3)

- **ScoutScore** (scoutscore.ai, Chris Koziak / @tiltmode_, @ScoutScoreAI) — **sev 3, NEW to this index** (was in STANCE.md since 2026-05-21 but never added here — an index gap, not a new entrant). Measurement-axis layer for x402: trust scores across contract clarity / availability / response fidelity / safety, public leaderboard + REST API + npm packages. Live and active 2026-08-14 (site HTTP 200). **Counter-move check: `scoutscore.ai/.well-known/x402` still returns 404**, unchanged from the 2026-05-21 baseline — 85 days without shipping an x402 surface. Structurally not Pillar 1 or Pillar 2: no signed receipts, no routing, no on-chain settlement anchor. Watch triggers unchanged: signed receipts ship → sev 4; routing surface ships → sev 5; facilitator partnership → Bazaar-blessed scoring shift.
- Sangria (GTG-Labs) — sev 2 — merchant-side x402 library; compose-friendly. Still needs first file. Unverified since 2026-05-11.
- Meterflow — sev 2 — Solana hosted gateway, $MFLOW token. Per the 2026-05-20 read: cross-chain claim was tweet-only not in code, receipts signed at webhook not body, partial-custodial via `WALLET_ENCRYPTION_SECRET`, single live paid route. Still needs first file. Unverified since 2026-05-20.

## Receipt-format competitors (severity 3-4)

- **Dexter** (@dexteraisol) — **sev 2 → 4** (index was stale; STANCE.md has carried sev 4 since 2026-05-19). Shipped **Instinct**: pay-to-rank recommendation payloads embedded in the x402 settlement receipt envelope as an "open extension." Direct Pillar 1 competitor with the opposite philosophy to TrustBench's measurement-only position. Counter-position artifact pre-drafted at `drafts/dexter-counter-position.md`; its ship-trigger (a named CDP / Cloudflare / x402-Foundation engineer publishing ≥3 substantive posts engaging Instinct positively) **has never been checked** — carried forward from the 2026-08-14 callback grading. Needs first file.
- PEAC — sev 3 — could absorb the signed-receipt envelope as a published spec; needs first file + standards-activity scan.
- x402 v2 spec — sev 3 — if v2 ships a receipt envelope natively, Pillar 1 is closed; needs first file.

## Facilitator / spec absorption risks (severity 2-3)

- Coinbase x402 facilitator — sev 3 — could ship native routing + receipt format and absorb both pillars; needs first file.
- Pay.sh — sev 2 — Solana facilitator; Infopunks pivoted onto it; needs first file.
- QuickNode x402 — sev 2 — verified live 2026-08-14: `x402.quicknode.com/mat` returns HTTP 402 with conformant x402Version 2 body. Partner today (routable `capability=data` upstream), absorption-risk tomorrow; needs first file.

## Token-funded / adjacent (severity 2)

- PayAI — sev 2 — facilitator-tier peer (Pay.sh + Google Cloud + Solana Foundation); needs first file.

## Dormant / dead (severity 1)

- [x402route](threats/x402route.md) — **sev 3 → 1** — `x402route.vercel.app` returns **HTTP 404 at the root**, not just `/v1/route`, verified 2026-08-14. The project appears gone. Retained in the index rather than deleted because the 2026-05-12 decision entry that tracked it graded *validated-by-a-different-competitor* — the tier was right, the name was wrong — and that lesson is worth keeping visible. Re-check on any scan; a revived deployment returns it to sev 3.
- Infopunks radar — **sev 2 → 1** — cognition layer shut down, not paused. The 2026-05-11 decision assuming a temporary Render suspension was **graded disproven 2026-08-14**: paid probe returned 100% 502s for 8 days and the crawler seed list has been disabled since 2026-05-20. Pivot to radar.infopunks.fun on Pay.sh is the surviving surface; not currently a TrustBench-lane competitor.

## Found 2026-08-14 in awesome-x402 — UNRANKED, verification pass required

Surfaced while placing a TrustBench entry in `xpaysh/awesome-x402` (the list moved from `Merit-Systems`; TrustBench appears **0** times, MAKO once, ScoutScore once, Dexter twice). All eight below sit in `Tools & Utilities → Monitoring & Analytics`, the same subsection as ScoutScore — i.e. the densest concentration of direct peers in the ecosystem, and this index missed all of them.

**No severities assigned deliberately.** These are self-descriptions in an awesome-list: scale claims unverified, and on this quarter's evidence (Strata, MAKO, Infopunks, x402route all dormant or dead behind live infrastructure) a meaningful fraction are likely inactive. Per the 2026-08-14 rule, `commit_cadence` is required before anything is ranked ≥3. Verify before ranking.

**Contest the discovery-first position chosen 2026-08-14 — check these first:**
- **x402 List** (x402-list.com) — "Agent-first directory of x402 API services with live uptime monitoring and machine-readable discovery for AI agents (JSON API, OpenAPI 3.1, llms.txt)." TrustBench's new positioning nearly word for word, llms.txt included.
- **SmartFlow Mapper API** (api.smartflowproai.com) — "22,251+ catalogued x402 endpoints with uptime, payment-success, and facilitator metadata. Free tier + paid bulk export." ~14x TrustBench's ranked registry, and **already monetising the registry** — the problem TrustBench has not solved.
- **Cinderwright Discovery Hub** (api.ideafactorylab.org) — "Cross-protocol discovery hub indexing 2,771+ services across x402, MPP, and L402/Lightning." Ships the cross-protocol coverage that is TrustBench's Phase 5 ambition.

**Contest Pillar 1 (signed receipts):**
- **Tersign** (tersign.ai) — "Neutral evidence layer... seller-signed EIP-712 receipts... counter-signed into per-seller hash chains on a public ledger, verifiable by anyone without an account, with refunds, deterministic dispute triage, and exportable evidence packs." Closest thing found to TrustBench's receipt thesis, and further developed on dispute/evidence tooling.
- **Mycelium Trails** (github.com/giskard09/giskard-stack) — signed trail records, `payment_hash` + `action_ref` SHA-256 commitment + **dual-chain anchor (Arbitrum One + Base)**. TrustBench anchors on one chain.

**Contest spend caps / policy:**
- **Sentinel** (sentinel.valeocash.com) — enterprise audit & compliance layer; per-call/hourly/daily budget enforcement, audit trails, public payment explorer, npm SDK.
- **Paybound** (github.com/pando-b/paybound) — open-source governance proxy; per-agent budgets, circuit breakers, SQLite audit trail.

**Contests the measurement methodology:**
- **Assay** (assay.nominal-labs.com) — "Service-quality oracle for x402: **pays real USDC to probe** machine-payable services on a schedule and scores what actually comes back." Methodologically stronger than TrustBench's HEAD-probe liveness check, which is the limitation TrustBench documents honestly everywhere.

**Process lesson recorded with these:** this index was built from X, Reddit and direct discovery, and missed the public README any agent sweep enumerates first. The discovery blind spot and the competitive blind spot were the same blind spot — not being in the list meant not reading the list. Add awesome-x402 delta-checking to the weekly scan.

## Logged but unranked (need first scan to assign severity)

- QBT-Labs/x402 — compose-friendly today; severity unknown; @0xAggelos.
- OpenRegistry / AnChain / Heurist / httpay — Pillar 1 partner candidates OR receipt-format competitors depending on direction; needs first scan to disambiguate.
- **IBANforge** (api.ibanforge.com) — inbound 2026-08-13, NOT a competitor on current evidence: x402-native provider (Base USDC, CDP facilitator, clean `/.well-known/x402`) in IBAN/BIC validation and payment-compliance data, a lane TrustBench explicitly marked NO-GO to build. Logged here so a future scan does not re-discover them as an unknown. Reclassify only if they ship routing or a receipt format.
