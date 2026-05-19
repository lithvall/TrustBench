---
stance_version: 2026-05-17
stance_phase: phase-4-post-listing-sprint
stance_pillars: [canonical-receipt-format-standard, neutral-routing-receipt-layer]
---

# Competitive memory — index

> **Light-mode artifact:** human-curated, categorized index. Self-flags via `stance_version` frontmatter when STANCE.md drifts. For the auto-generated quick-reference (regenerated from STANCE.md), see `competitive/SEVERITIES.md`.
>
> Operating brief: [COMPETITIVE-BRIEF.md](COMPETITIVE-BRIEF.md). Schema: [MEMORY-SCHEMA.md](MEMORY-SCHEMA.md). Run scan via [weekly-scan-prompt.md](weekly-scan-prompt.md).
>
> Severity legend: 5 active/scaling, 4 direct overlap, 3 adjacent pivot-risk, 2 absorption-risk, 1 tangential. Downgrades require a written reason in the per-competitor file.

## Direct 1:1 (severity 4-5)

- [MAKO Pulse](threats/mako-pulse.md) — sev 4 — signed-receipt scoring (EIP-191, 60s validity) + MAKO Route layer; 765 services tracked; last scan 2026-05-15.
- [x402route](threats/x402route.md) — sev 3 — direct routing-lane competitor at $0.001/call (5x cheaper); plain JSON, no signed receipts; last scan 2026-05-12.

## Routing / discovery overlap (severity 2-3)

- Sangria (GTG-Labs) — sev 2 — merchant-side x402 library; compose-friendly today; needs first file. Last memory note 2026-05-11.
- Meterflow — sev 2 — Solana hosted gateway, $MFLOW token; partnership-watch; needs first file. Last memory note 2026-05-13.

## Facilitator / spec absorption risks (severity 2-3)

- Coinbase x402 facilitator — sev 3 — could ship native routing + receipt format and absorb both pillars; needs first file.
- Pay.sh — sev 2 — Solana facilitator; Infopunks pivoted onto it; needs first file.
- QuickNode x402 — sev 2 — live capability=data upstream as of 2026-05-13; partner today, absorption-risk tomorrow; needs first file.
- PEAC — sev 3 — could absorb signed-receipt envelope as a published spec; needs first file + standards-activity scan.
- x402 v2 spec — sev 3 — if v2 ships receipt envelope natively, Pillar 1 is closed; needs first file.

## Token-funded / adjacent (severity 2-3)

- Dexter ($DEXTER) — sev 2 — token-funded full-stack agent-economy play (payment / discovery / data analysis / agent advertising); needs first file. Last memory note 2026-05-14.
- PayAI — sev 2 — facilitator-tier peer (Pay.sh + Google Cloud + Solana Foundation); needs first file.

## Recently pivoted (severity 2)

- Infopunks radar (radar.infopunks.fun on Pay.sh) — sev 2 — explicit "routing recommendations"; partner-paused per 2026-05-14 DM; needs first file + history section noting the cognition-layer → radar pivot.

## Logged but unranked (need first scan to assign severity)

- QBT-Labs/x402 — compose-friendly today; severity unknown; @0xAggelos.
- OpenRegistry / AnChain / Heurist / httpay — Pillar 1 partner candidates OR receipt-format competitors depending on direction; needs first scan to disambiguate.
