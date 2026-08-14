---
project: TrustBench
date: 2026-08-14
revision: 6
phase: phase-4-conversion-reassessment

# Universal schema: pillars are the defensible positions. Stable across long horizons.
# Inline objects only (one per line) — see stance/README.md § Schema for why.
pillars:
  - { name: canonical-receipt-format-standard, status: decision-pending-first-surface-shipped-2026-05-19, short: "signed-receipt envelope becomes the spec other projects adopt" }
  - { name: neutral-routing-receipt-layer, status: shipped-but-unconverted-kill-criterion-fired-2026-08-01, short: "/route + receipts as protocol-agnostic routing surface" }

# Project-specific posture. Drift triggers if any of these change.
protocol: x402
chains: [Base]
custody: non-custodial
revenue_model: flat-per-tx-USDC-plus-listing-bond
signing: Ed25519-plus-JCS

# Live competitors with current severity (1-5). Source of truth for the competitive role.
active_competitors:
  - { name: "MAKO Pulse", handle: "@ChrisDMacro", severity: 4, category: direct-1to1 }
  - { name: "x402route", handle: "unknown", severity: 3, category: routing-overlap }
  - { name: "Sangria", handle: "unknown", severity: 2, category: routing-overlap }
  - { name: "Meterflow", handle: "@meterflowsol", severity: 2, category: routing-overlap }
  - { name: "Coinbase x402 facilitator", handle: "unknown", severity: 3, category: facilitator-absorption }
  - { name: "Pay.sh", handle: "unknown", severity: 2, category: facilitator-absorption }
  - { name: "QuickNode x402", handle: "unknown", severity: 2, category: facilitator-absorption }
  - { name: "PEAC", handle: "unknown", severity: 3, category: receipt-format }
  - { name: "x402 v2 spec", handle: "unknown", severity: 3, category: receipt-format }
  - { name: "Dexter", handle: "@dexteraisol", severity: 4, category: receipt-format }
  - { name: "PayAI", handle: "unknown", severity: 2, category: adjacent }
  - { name: "Infopunks radar", handle: "@InfopunksHQ", severity: 2, category: routing-overlap }
  - { name: "ScoutScore", handle: "@ScoutScoreAI", severity: 3, category: registry-overlap }

# Live partner relationships. Public state.
active_partners:
  - { name: "Strata", status: dormant-verified-2026-08-14-co-launch-never-happened, lane: pre-call-trust-scoring }
  - { name: "Paddock", status: live-pipeline-2026-05-14, lane: registry-export }
  - { name: "QBT-Labs", status: compose-not-compete, lane: x402-merchant-side }
  - { name: "QuickNode", status: live-upstream-2026-05-13, lane: routable-merchant }
  - { name: "agentic.market", status: listed-2026-05-13-pay-to-rank-watch-2026-05-19, lane: discovery-surface }

# What TrustBench will NOT do. Drift trigger if new work contradicts.
out_of_scope:
  - custodial-anything
  - percent-spread-routing-fees
  - benchmark-oracle-authority-vocabulary
  - paid-services-without-approval
  - pay-to-rank
  - complex-enterprise-sales
  - payment-capable-mcp-tools-during-directory-review
  - repricing-the-paywall-without-a-real-price-signal

# Pivots considered but not active. Re-evaluate quarterly.
deferred_pivots:
  - { name: p402-Canton, gate: phase-5-after-first-paying-agent }
  - { name: Solana-settlement, ref: P4-3, status: timing-tbd }
  - { name: AP2-Mandate-Constraint-extension, gate: phase-6 }
  - { name: receipt-envelope-v2-mandate-identity-binding, gate: phase-5-or-6, status: design-seed-banked-2026-05-20 }

# Founder calibration. Drives capital + energy + boredom checks.
founder_shape:
  - { capital_cap_monthly_usd: 50 }
  - { dev_hours_weekly: "10-15" }
  - { pace: solo }

# Drift thresholds (days). Override defaults if needed.
drift_soft_days: 14
drift_hard_days: 30
---

# Current stance

TrustBench is a non-custodial x402 router + signed-receipt layer on Base. Phase 4 listing sprint shipped 2026-05-13, nine days ahead of plan. Paywall v0.1.0 has been live in prod since 2026-05-11. Strata partnership public 2026-05-15; co-launch window committed 2026-05-19 for Strata's Show HN week of 2026-05-26 (Tue/Wed PT morning) — **that co-launch never happened; see the Strata-dormant paragraph below, verified 2026-08-14.** First Pillar 1 propagation surface — the Receipt-Backed Agent-to-Agent Procurement bundle at trustbench.io/bundles/receipt-backed-agent-to-agent-procurement — shipped 2026-05-19 with content-negotiated HTML rendering + revenue wallet anchor in /.well-known/trustbench.json.

The two pillars — canonical receipt-format standard, neutral routing+receipt layer — are the defensible positions. Pillar 2 is active via Phase 4 maintenance. Pillar 1 has a first concrete public artifact (the bundle) demonstrating Option B flavor, but the formal Option A (partner adoption) / B (canonical primitives) / C (original go-list) decision remains pending. No commitment to a specific Option as of this stance date.

Discovery surface watch (banked 2026-05-19): agentic.market operator (@Nick_Prince12) publicly considering pay-to-rank for bundles (*"service providers would pay to get their service promoted to agentic buyers"*, in reply to @heisenburgirrs 2026-05-18). TrustBench's `out_of_scope` includes `pay-to-rank`. Not committed by Nick; flagged for watch. If implemented, the agentic.market relationship moves from pure discovery surface to a structural-differentiation moment — TrustBench's measurement-only routing layer becomes the sharper claim, with the routing-WITHIN-a-bundle vs bundle-DISCOVERY layers cleanly separable in framing.

Direct competitor shift (banked 2026-05-19, revision 3): Dexter (@dexteraisol) shipped Instinct — pay-to-rank recommendation payloads baked into the x402 settlement receipt envelope as an "open extension." Severity moved from 2 (adjacent) to 4 (receipt-format), category reclassified from adjacent to direct Pillar 1 competitor with opposite philosophy. Counter-position narrative artifact pre-drafted in `drafts/dexter-counter-position.md` ready to ship within 24h if a named CDP / Cloudflare / x402 Foundation engineer publishes ≥3 substantive posts engaging Instinct positively (the pre-trigger from audit § 6). Do NOT counter-ship a feature; the differentiation (measurement-only vs pay-to-rank) IS the position. See memory `project_dexter_instinct_launch_2026_05_19.md`.

Protocol-stack framing clarified (banked 2026-05-20, revision 4): MPP research surfaced that the agentic-payments protocol space resolves into a four-layer stack — ACP (OpenAI+Stripe checkout) / AP2 (Google trust/mandates) / MPP (Stripe+Tempo settlement-session) / x402 (Coinbase execution) — not four competing protocols. TrustBench's existing x402-based `/route` is already MPP-charge-compatible without code changes (MPP `charge` intent maps directly to x402 `exact`). Updated Pillar 1 positioning frame: "TrustBench receipts as the cryptographic audit artifact ABOVE the four-protocol stack, regardless of which layer a transaction touches." Stronger than the prior "cross-chain audit artifact" frame because it composes above the entire stack rather than only the execution layer. Receipt envelope v2 design seed (bind AP2 mandate hash + ERC-8004 identity hash into signed body) added to `phase5-design-seeds.md` and to `deferred_pivots` above as the natural home for the AP2 Mandate Constraint extension. See memory `project_mpp_research_2026_05_20.md`.

Registry-overlap competitor identified (banked 2026-05-21, revision 5): ScoutScore (scoutscore.ai, Chris Koziak / @tiltmode_, @ScoutScoreAI) — measurement-axis layer for x402 services. 2000+ services scored across Contract Clarity / Availability / Response Fidelity / Identity & Safety, public REST API + leaderboard + npm packages (@scoutscore/sdk, @scoutscore/mcp-server). Identified via Railway log probes (ScoutScore-HealthCheck/1.0 and ScoutScore-FidelityCheck/1.0 UAs hitting POST /route 2026-05-20). Severity 3 (registry-overlap) — they have no signed receipts, no routing, no on-chain settlement anchor. Lane: scoring as final product, structurally not Pillar 1 or Pillar 2. Engagement posture: no outreach (solo-velocity competitor; asymmetry favors them). Watch triggers: signed receipts ship (→ severity 4, direct Pillar 1 competitor), routing surface ships (→ severity 5, direct Pillar 2 competitor), Coinbase / facilitator partnership announced (→ Bazaar-blessed scoring shift). 30-day re-check scheduled for 2026-06-20. Counter-move baseline 2026-05-21: scoutscore.ai/.well-known/x402 = 404. See memory `project_scoutscore_competitor_2026_05_21.md`.

Discovery surface shipped (banked 2026-05-21): TrustBench /.well-known/x402 and /.well-known/x402.json LIVE in prod (commit a01d36b → deployed as 1c2ab0f). Mirrors the 402 PAYMENT-REQUIRED accepts[] block for POST /route, declares the Ed25519-signed receipt envelope (Pillar 1 propagation hook). Demand signal: 40 hits/16h on the bare path from non-Bazaar crawlers (CarbonMonitor, ScoutScore-HealthCheck, ScoutScore-FidelityCheck, x402-atlas-probe, MPP32-Health, x402station). Filter-passed as Pillar 2 maintenance. Path source: draft-jeftovic-x402-dns-discovery-00 §6.1 informative convention — not a Coinbase x402 spec mandate; if Foundation specifies different shape, adapt then. Kill criterion + counter-move check at 2026-06-20.

Kill criterion FIRED and graded 2026-08-01 (revision 6). The Phase 4 criterion — "no paying external agent within 6 weeks of listing (~2026-06-27)" — passed its date ungraded and was caught five weeks late, by accident, while reading Railway logs for an unrelated reason. Evidence from 6,006 log entries sampled 2026-07-25 → 2026-08-01: 419 requests reached `POST /route` with **zero** `hasXPayment=true` and **zero** `hasAuth=true`. Every one was an automated crawler (`mako-pulse-prober/0.1` 297, `preflight402-probe/0.1` 99, `CoinbaseBazaarDiscovery/1.0` 6, `ScoutScore-HealthCheck/1.0` 1, others). Simultaneously the free read-only MCP surface saw 689 requests from 6 distinct recurring third-party clients on a Smithery-shaped gateway URL, 3 still active on 2026-08-01.

The two halves grade differently: **discovery works, conversion is zero.** The diagnosis is an absent funnel, not price and not product-market fit — all three MCP tools (`get_rankings`, `get_receipt`, `verify_receipt`) are read-only by design, so an agent reaching TrustBench via MCP has no in-band path to becoming a paying agent. Zero conversion is the architecturally predicted outcome. Two constraints follow and are now in `out_of_scope`: (1) **repricing is frozen** because the data contains no price signal — nobody reached a 402 and declined; reassessing pricing on this evidence would be fitting a curve to zero points; (2) **exposing `/route` or any payment-capable operation as a fourth MCP tool is frozen** for the duration of the Anthropic Connectors Directory escalated review, since adding a payment-capable tool mid-review would confirm the category concern that most plausibly triggered it. The funnel question reopens only after the directory decision lands, in either direction. Full entry + 2026-10-30 callback in `decisions.md`; assumption-class lesson in `lessons.md`.

Strata dormant — verified 2026-08-14 (revision 6). The committed co-launch (Show HN, week of 2026-05-26) never happened, and the partner's engineering stopped before §10 was even confirmed closed. Verified across four independent surfaces: (1) GitHub `PThrower` — the entire Strata codebase is 13 commits over 6 days, `strata-sdk` 2026-05-03→05-08 and `strata-mcp-check` all on 2026-05-03, with **no push to any of the account's 12 repos since 2026-05-09**; (2) npm `@strata-ai/sdk` frozen at 0.1.2, last modified 2026-05-03, never republished; (3) the landing page's own founder-tier counter moved from 48-of-50 remaining on 2026-05-07 to 47-of-50 today — **one sale in 99 days**; (4) no public trace anywhere of a launch or announcement.

The nuance that matters: this is autopilot, not a dead host. The backend is demonstrably alive — the verify API referenced by our public receipt still answers, and returned `last_checked_at 2026-08-13`, `content_age_hours 13`, `data_freshness recent`, with the CoinMarketCap security_score having moved 65→75 since our May receipt. Scored-server count grew 2,178→2,647. So the crons run and the product works; what stopped is the human. Consistent with the founder shape (undergrad, GitHub bio and repo mix are quant/ML, Strata reads as a ~6-day sprint project that got traction and then lost attention).

Timeline, because the ordering is the finding: repos created 2026-05-03 → DM'd TrustBench 2026-05-07 (4 days after repo creation) → last commit 2026-05-08 → last push anywhere 2026-05-09 → told us "§10 closed from our side" 2026-05-15 (**6 days after their last commit**) → co-launch committed 2026-05-19 → Show HN week 2026-05-26 never occurred.

Consequence for the conversion diagnosis: the 2026-08-01 grading named post-Strata-launch traffic as the next target path to a first paying agent. That path never opened. This does not invalidate the absent-funnel diagnosis — both can be true — but it does mean the conversion hypothesis was never actually tested against real external demand. Grade the Strata-linked open callbacks (`decisions.md` entries at :181 tier shape, :221 §10 spec, :239 reference receipt) against this evidence.

Next milestone: a funnel path to first paying agent that does NOT touch the frozen MCP surface. Provider-side partnership is the open lane — an inbound from IBANforge (api.ibanforge.com, x402-native, Base USDC, claims existing paying customers) landed 2026-08-13 and is unresolved as of this stance date; draft reply in `drafts/DRAFT-2026-08-14-ibanforge-reply.md`.

**Fields NOT re-verified in the revision-6 refresh (treat as revision-5 vintage, 2026-05-21).** This refresh was evidence-driven from the 2026-08-01 log grading, live endpoint checks, and the live agentic.market catalog. It did NOT re-verify: `active_partners` statuses (Strata post-Show-HN outcome unknown, Paddock/QBT-Labs/QuickNode unconfirmed), `active_competitors` severities beyond the observation that MAKO Pulse is now the single largest prober of `/route` (297 of 419 requests) and ScoutScore is still probing, and whether the Option A outreach committed for 2026-06-01 in `decisions.md` actually happened. Confirm these before relying on them for a partnership or competitive decision.

# How to use this file

This file is the single source of truth for project stance. Any system, prompt, script, document, or scheduled task that encodes assumptions about "what TrustBench is" MUST declare which version of this file it was authored against, via `stance_version` YAML frontmatter matching the `date` field above. Dependent systems read this file at runtime (light mode) or regeneration time (heavy mode, see `stance/templates/`) and self-flag when drift is detected.

When this file's content materially changes (phase, pillars, protocol, chains, revenue model, out_of_scope list, founder_shape), bump the `date` and `revision` fields. Dependent systems will self-flag at next run.

# When to update

Update this file when:

- A pillar's status changes (decision-pending → committed → done → abandoned).
- A pivot in `deferred_pivots` becomes active (move to pillars or to phase scope).
- A competitor enters or exits `active_competitors`, or a severity moves by 2 or more.
- A partner relationship changes lane or status.
- The phase changes (phase-4 → phase-5, etc.).
- An item is added to or removed from `out_of_scope`.
- A `founder_shape` field changes.

Do NOT update for:

- Daily progress.
- Single shipped features within an active phase.
- Routine partner conversations (only stance-level changes).
- Memory file additions (those are tactical, not stance).
- Bug fixes, security patches, dependency updates.

# Drift discipline

Stale stance is worse than no stance, because dependent systems trust the date.

If this file is more than 30 days old at any session start working on stance-relevant material, the FIRST thing in that session is to read it cold, compare to current reality (memory, git log, recent decisions), and either confirm it's still accurate (bump `date`, keep `revision`) or revise it.

Automated drift detection across the project: `tsx stance/check-staleness.ts`. Run when stance feels stale, or weekly.

# Schema notes

Required universal fields: `project`, `date`, `revision`, `phase`, `pillars`, `out_of_scope`.

Project-specific extensions used here: `protocol`, `chains`, `custody`, `revenue_model`, `signing`, `active_competitors`, `active_partners`, `deferred_pivots`, `founder_shape`.

YAML values use inline objects (`{key: val, key: val}`) only, not nested multi-line YAML — the stance system uses a tiny zero-dep parser for cross-project portability. See `stance/README.md`.
