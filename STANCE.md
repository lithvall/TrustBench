---
project: TrustBench
date: 2026-05-19
revision: 2
phase: phase-4-post-listing-sprint

# Universal schema: pillars are the defensible positions. Stable across long horizons.
# Inline objects only (one per line) — see stance/README.md § Schema for why.
pillars:
  - { name: canonical-receipt-format-standard, status: decision-pending-first-surface-shipped-2026-05-19, short: "signed-receipt envelope becomes the spec other projects adopt" }
  - { name: neutral-routing-receipt-layer, status: active-phase-4-maintenance, short: "/route + receipts as protocol-agnostic routing surface" }

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
  - { name: "Dexter", handle: "@divuspop", severity: 2, category: adjacent }
  - { name: "PayAI", handle: "unknown", severity: 2, category: adjacent }
  - { name: "Infopunks radar", handle: "@InfopunksHQ", severity: 2, category: routing-overlap }

# Live partner relationships. Public state.
active_partners:
  - { name: "Strata", status: public-2026-05-15-co-launch-2026-05-26, lane: pre-call-trust-scoring }
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

# Pivots considered but not active. Re-evaluate quarterly.
deferred_pivots:
  - { name: p402-Canton, gate: phase-5-after-first-paying-agent }
  - { name: Solana-settlement, ref: P4-3, status: timing-tbd }
  - { name: AP2-Mandate-Constraint-extension, gate: phase-6 }

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

TrustBench is a non-custodial x402 router + signed-receipt layer on Base. Phase 4 listing sprint shipped 2026-05-13, nine days ahead of plan. Paywall v0.1.0 has been live in prod since 2026-05-11. Strata partnership public 2026-05-15; co-launch window committed 2026-05-19 for Strata's Show HN week of 2026-05-26 (Tue/Wed PT morning). First Pillar 1 propagation surface — the Receipt-Backed Agent-to-Agent Procurement bundle at trustbench.io/bundles/receipt-backed-agent-to-agent-procurement — shipped 2026-05-19 with content-negotiated HTML rendering + revenue wallet anchor in /.well-known/trustbench.json.

The two pillars — canonical receipt-format standard, neutral routing+receipt layer — are the defensible positions. Pillar 2 is active via Phase 4 maintenance. Pillar 1 has a first concrete public artifact (the bundle) demonstrating Option B flavor, but the formal Option A (partner adoption) / B (canonical primitives) / C (original go-list) decision remains pending. No commitment to a specific Option as of this stance date.

Discovery surface watch (banked 2026-05-19): agentic.market operator (@Nick_Prince12) publicly considering pay-to-rank for bundles (*"service providers would pay to get their service promoted to agentic buyers"*, in reply to @heisenburgirrs 2026-05-18). TrustBench's `out_of_scope` includes `pay-to-rank`. Not committed by Nick; flagged for watch. If implemented, the agentic.market relationship moves from pure discovery surface to a structural-differentiation moment — TrustBench's measurement-only routing layer becomes the sharper claim, with the routing-WITHIN-a-bundle vs bundle-DISCOVERY layers cleanly separable in framing.

Next milestone: first external paying agent. §10 Strata reference-agent integration closed 2026-05-15 (4 days ahead of target); next target path is post-launch external agent traffic following Strata's Show HN co-launch. Kill criterion: no paying external agent within 6 weeks of listing (~2026-06-27) triggers paywall pricing and discovery reassessment.

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
