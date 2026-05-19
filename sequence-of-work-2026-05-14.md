# Sequence of Work — 2026-05-14 (post-pillars-filter)

**Status:** Active. Updated when sequence items ship or when the Option A/B/C decision changes.
**Source:** Recommended path forward agreed during the 2026-05-14 pillars+options brainstorm session. All items pass the `CLAUDE.md` Pre-Development Filter. Designed as **no-regrets work** — every item strengthens TrustBench's position regardless of which Option (A / B / C / Pillar-2-maintenance-only) Johan eventually commits to.

**When picking this up in a fresh session:** read `strategic-pillars-and-options-2026-05-14.md` first (load-bearing filter context), then this file for the actual next-step sequence.

---

## The sequence (in order)

### Near term — next 2-3 weeks (no Option commitment required)

**1. Ship the gap map (P5-coverage-report).**
- Pillar: 2 primarily, 1 indirectly.
- What it is: nightly cron that buckets the 1,102-endpoint registry into capability categories, publishes `coverage.json` + `coverage.csv` + `/coverage` HTML. Same shape as Paddock CSV rollup.
- Effort: ~1 weekend.
- Why first: highest-leverage move. Strengthens Pillar 2 (public discovery surface) AND prepares Pillar 1 outreach (turns the gap map into an Option A outreach hook: "your endpoints aren't yet in our coverage map — want to be?").
- Deep dive: `gap-map-deep-dive-2026-05-14.md` (V1 + critic + V2).
- Filter pass: yes — clean Pillar 2 advance, Option fits as "Pillar 2 maintenance," less-effort path than building portfolio endpoints to fill the gaps.

**2. Improve crawler visibility — add known-missing projects.**
- Pillar: 2 maintenance.
- Targets surfaced by the 2026-05-14 Critic pass: Pylon (`pylonapi.com`), agentsvc.io, anchor-x402-mcp, httpay.xyz, OpenRegistry MCP endpoints. None appeared in the 2026-05-14 registry probe; all are on x402.
- Effort: incremental, one source at a time. Each is ~1-2 hours.
- Why second: makes the gap map (item 1) honest. "Absence from registry" only carries weight if the crawler has caught the biggest known endpoints.
- Filter pass: yes — Pillar 2 maintenance, no Option commitment required.

**3. Continue Phase 4 work already in flight.**
- Strata §10 reference-agent integration (target receipt URL ~2026-05-19).
- v2 header migration tail: PAYMENT-SIGNATURE inbound + PAYMENT-RESPONSE outbound (PAYMENT-REQUIRED outbound shipped 2026-05-12).
- Pillar: 1 (Strata adopts annotation envelope) + 2 (Strata routable, v2 header migration).
- Filter pass: already passed and committed in earlier phases. Continue.

### Mid term — after gap map ships, before any Option choice

**4. Improve `@trustbench/verify-receipt` docs and partner-adoption examples.**
- Pillar: 1 prep.
- Specifically: worked example of a partner emitting TrustBench-format receipts on their existing endpoints. Code sample, JSON schema reference, signature verification walkthrough.
- Why: a friction-free adoption path is the precondition for Option A outreach being credible. The pitch "would you adopt our receipt format" lands much harder when the partner can copy-paste a 20-line working example.
- Effort: ~1 weekend.
- Filter pass: yes — Pillar 1 demonstration that doesn't commit to Option A timing.

**5. Sharpen public copy (filter-gated).**
- Pillar: 1 + 2 simultaneously.
- Specifically: consider adding a short "Why TrustBench" section to landing / README that names the two pillars in plain language. Not a wholesale framing pivot — additive.
- Why later, not now: this is a framing shift, and `CLAUDE.md` flags framing shifts as filter-gated. Wait until gap map (item 1) has produced data to talk about. Without that, the framing claims have nothing to point at.
- Effort: ~2-3 hours of writing.
- Filter pass: yes — additive Pillar 1+2 advance, but ONLY after item 1 ships.

### Decision point (after items 1-3 ship)

**6. Reassess Options A/B/C with the new data.**

The gap map produces concrete information that makes the Option decision easier:
- *Which projects are most visible / least visible in TrustBench's inventory* → that's the Option A target list, prioritized by how much they'd benefit from TrustBench-format receipt adoption.
- *Which categories have zero coverage AND aren't already taken by Pylon/agentsvc/httpay/Heurist* → that's the refreshed Option B candidate list. The original 9 categories in `endpoint-portfolio-research-2026-05-14.md` will be updated by the gap-map data.
- *Whether anyone outside TrustBench engages with the gap map artifact* (X repost, partner DM, GitHub PR) → that's signal on whether Pillar 1 (receipt-format standard) has external pull yet.

If by ~3 weeks after gap map ships there's external engagement, Option A becomes more credible. If silence, Option B becomes more credible as the demonstration vehicle. If both are silent, Option C and "Pillar 2 maintenance only" remain on the table.

**Capture the decision in `decisions.md`** per the Decision Journal practice. Include load-bearing assumption + leading indicator + check_back_date.

---

## What this sequence is NOT

- **Not a commitment to Option A, B, or C.** All items above are Pillar-2-maintenance or Pillar-1-preparation. The Option decision stays open and is informed by the data items 1-3 produce.
- **Not a rejection of the portfolio play.** Options B and C remain viable if data supports them. `portfolio-ofac-screening-design.md` stays build-ready for Option C if chosen.
- **Not a comprehensive roadmap.** This is the next 2-4 weeks of work. After item 6 (Option reassess), a new sequence doc supersedes this one.

## Triggers that change this sequence

- **Strata reverts on §10 integration** → item 3 may pause; could surface Pillar 1 risk depending on reason.
- **A Phase 4 partner spontaneously asks for a portfolio endpoint** (e.g., "would you build us an X endpoint?") → that's a named-buyer signal, may justify pulling Option B forward.
- **PEAC Protocol or x402 v2 ships receipt-envelope spec** → reassess `strategic-pillars-and-options-2026-05-14.md` § "When to revisit the filter" — Pillar 1 may close.
- **Coinbase / AWS AgentCore ships cross-facilitator routing** → reassess; Pillar 2 may close.
- **Johan decides on an Option ahead of schedule** → update this sequence to reflect committed work.

## Cross-references

- Pillars filter (mandatory pre-dev gate): `strategic-pillars-and-options-2026-05-14.md`
- Filter enforcement: `CLAUDE.md` § Mandatory Pre-Development Filter
- Gap map deep dive: `gap-map-deep-dive-2026-05-14.md`
- Phase 4 engineering state: `phase4-kickoff.md`
- Phase 5 design seeds (now subject to filter): `phase5-design-seeds.md`
- Decision Journal: `decisions.md`
- Memory anchor: `project_strategic_pillars_filter_2026_05_14.md`
