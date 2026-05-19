# Competitive memory schema

## Files

- `COMPETITIVE-MEMORY.md` — index. One line per tracked competitor: name, severity, last-scanned date, link to the per-competitor file.
- `threats/<name>.md` — one file per competitor or adjacent threat.
- `scans/<YYYY-MM-DD>-scan.md` — the output artifact from each scan. Append-only; old scans are historical record.

## Per-competitor file format

Each `threats/<name>.md` starts with YAML frontmatter, then five required sections:

```
---
name: <competitor name>
handle: <X handle if any, else "unknown">
url: <primary URL, else "verify on first scan">
severity: 1-5
last_scanned: YYYY-MM-DD
category: direct-1to1 | routing-overlap | discovery-overlap | facilitator-absorption | receipt-format | adjacent
---

## Capability snapshot (as of YYYY-MM-DD)

What they ship today. Specific. Quoted from their site / X / code where possible. Date-stamped.

## Pricing (as of YYYY-MM-DD)

Per-call rate, subscription, free tier, etc. If unknown, write "unknown — needs scan" rather than guessing.

## TrustBench differentiator vs. them — falsifiable form

Each defense stated as: "Today, TrustBench is differentiated on X. For this to stop being true, Y would have to ship." Y must be an observable signal (a doc change, an npm release, an envelope-shape change), not a vibe.

## Kill criterion

What this competitor would have to ship / announce / partner with that makes TrustBench's lane untenable. Phrase as observable signal with a timeline if knowable.

## Adoption signals

GitHub stars, X mentions, partner integrations, token movement (if applicable), service-catalog counts. Date-stamped. Distinguish "growing" from "stalled."

## Watch

- Next scheduled scan date.
- Specific things to check next time (NOT a generic "monitor them" — concrete questions, e.g. "is the 60-second receipt-expiry window still in their docs").
```

## Severity scale

| Sev | Meaning |
|-----|---------|
| 5 | Active, scaling, directly substitutes for TrustBench. Kill-criterion plausibly met within 90 days. |
| 4 | Direct overlap; smaller or newer than TrustBench. Watch weekly. |
| 3 | Adjacent. Could pivot into TrustBench's lane within 6 months. Watch fortnightly. |
| 2 | Facilitator-tier absorption risk. Could be subsumed by a Coinbase / facilitator feature ship. Watch monthly. |
| 1 | Tangential. Tracked for completeness. Watch quarterly. |

## Re-scoring rules

- Severity is re-checked every scan.
- Default is "stay or go up."
- **Downgrades require a written reason** in the per-competitor file's Watch section, dated, with the signal that justified the downgrade.
- An entry that hasn't been scanned in 60 days gets auto-flagged at the top of the next scan artifact regardless of last severity.

## Naming + categorization rules

- File names are lowercase-hyphenated: `mako-pulse.md`, `x402route.md`, `coinbase-x402.md`.
- Categories are picked from the fixed enum in the frontmatter. If a competitor straddles two, pick the more severe.
- If a competitor changes shape mid-cycle (e.g., Infopunks pivoted from cognition layer to Pay.sh radar), the file is updated, NOT replaced. The old shape stays in a `## History` section at the bottom — it's evidence about the team's velocity and instinct.
