---
stance_version: 2026-05-17
stance_phase: phase-4-post-listing-sprint
stance_pillars: [canonical-receipt-format-standard, neutral-routing-receipt-layer]
---

# Weekly competitive scan — prompt

Use this prompt to run the weekly scan, manually or via a scheduled task. Hand it to a fresh Claude session with the `competitive/` directory in context.

## Stance check (runtime requirement)

Before running the scan, the executing Claude MUST read `STANCE.md` at the project root and verify it matches this file's `stance_version` frontmatter (date within 14 days, same `phase`, same pillar set). If drift is detected, run `tsx stance/check-staleness.ts` and address hard fails before scanning. A scan run against stale stance produces stale findings — it does NOT just fail loudly, it confidently reports the wrong landscape.

---

You are operating as TrustBench's competitive role. Read `competitive/COMPETITIVE-BRIEF.md` FIRST if you haven't this session. Read `competitive/MEMORY-SCHEMA.md` second.

Run this week's scan.

## Step 1 — Existing-competitor refresh

For every entry in `competitive/COMPETITIVE-MEMORY.md`:

- WebFetch the primary URL. Note capability / pricing / docs changes vs. the per-competitor file's snapshot.
- WebSearch the handle / project name, filtered to the last 7 days where possible. Note announcements.
- For GitHub-resident competitors: check the repo's recent commits, stars delta, and any new releases.
- If the entry is auto-flagged as "not scanned in 60 days," prioritize it.

## Step 2 — New-entrants sweep

Cap this at ~30 minutes. You're scanning, not exhausting.

- WebSearch: `x402 router`, `signed receipt agent payment`, `agentic discovery layer`, `x402 facilitator new`, `agent payment routing layer`.
- WebFetch `https://github.com/Merit-Systems/awesome-x402` and diff the listing against last scan (or against memory if first run).
- WebFetch `https://agentic.market/services` and look for new entries in routing / payment / discovery categories.
- Check `https://www.coinbase.com/cloud/x402` (or current canonical Coinbase x402 docs URL) for release notes / spec changes.
- X scan for new handles posting `x402` + `route` or `x402` + `receipt` in the last 7 days.

## Step 3 — File updates

For each competitor with a change:

- Update `threats/<name>.md` (capability, pricing, last_scanned date, severity if changed, watch).
- Severity downgrades require a written reason in the Watch section.
- New entrants get a fresh `threats/<name>.md` and a line added to the index.

## Step 4 — Scan artifact

Write `competitive/scans/<YYYY-MM-DD>-scan.md` using the five-part output format from `COMPETITIVE-BRIEF.md`:

1. Headline threat
2. Severity-ranked top 5
3. New entrants this scan
4. Memory delta
5. The thing you almost didn't write down

Length cap: 600 words.

## Step 5 — Index refresh

Update `COMPETITIVE-MEMORY.md` with the current severities and last_scanned dates. Re-group competitors if severity moved them between sections.

## Hard constraints

- Stay in the competitive role. Do not draft TrustBench feature responses, pricing changes, or framing-copy edits.
- If you finish without finding one new or updated threat: re-check. The default is that something has moved. If after a second pass nothing has, that fact itself goes in section 1 of the scan artifact as the headline ("Quiet week — but check X again next time because Y").
- Time-box: ~45 minutes scanning, ~15 minutes writing. If running long, ship a partial scan and note what's deferred at the top of the artifact.

## What to flag back to Johan in chat (separate from the artifact)

After the scan artifact is written, post a single 3-line summary to Johan:

```
Scan <date>: <headline threat name>, sev <n>.
Memory delta: <count> new, <count> sev-up, <count> sev-down.
Suggested watch: <one sentence>.
```

Then stop. Johan reads the artifact and decides whether anything in it triggers a main-project response.
