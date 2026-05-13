# Phase 5 readiness watch

**Purpose:** track the two Phase 5 unlock gates without re-deriving them every time the project has dev capacity to spare. A future session can read this doc, run the four checks below, and produce a "ready / not ready / X weeks out" verdict in under 10 minutes.

**Created:** 2026-05-13, end of the listing-sprint session that shipped the agentic.market + CDP Bazaar listing.

**Anchored on:** `CLAUDE.md` § "Phase 5 — p402 / Canton + AP2 compatibility (after first paying agent on x402 paywalled endpoints)."

**Companion doc:** `phase5-design-seeds.md` collects design observations. This doc is purely the gate tracker. Keep them separate so the seeds file isn't cluttered with readiness state and this file isn't cluttered with design ideas.

---

## The two gates (verbatim from CLAUDE.md)

> Do not start until x402 paywalled endpoints have at least one paying agent and v0.1.0 has been live for ≥4 weeks.

Phase 5 kickoff requires **both** to be true. Each is independent. Whichever fires later is the unlock date.

### Gate 1 — at least one independent paying agent

**Definition:** A `paid_requests` row exists in Supabase where `agent_address` is **not** TrustBench's own probe wallet `0x547C2c615b227800D56b5ed24021C2CbCa0a3057` (the smoke wallet) and the settle is for the `/route` endpoint (`endpoint = '/route'`). One row is sufficient; the bar is "first non-self traffic," not "sustained traffic."

**Why this bar:** demonstrates that the agent-discovery → activation loop works without us paying ourselves. The smoke wallet's settles validate the wire shape, not the funnel.

**Why it's not satisfied by the 2026-05-13 listing settle:** the validating settle (`rrcpt_01KRGTQSG1R6ZHB0XATSJ5K87V` at 14:09 UTC) was from the probe wallet against TrustBench's revenue wallet — same as every prior smoke. It satisfies CDP cataloging requirements but not the paying-agent gate.

### Gate 2 — v0.1.0 paywall live ≥ 4 weeks

**Definition:** at least 28 days have elapsed since `TRUSTBENCH_PAYWALL_ENABLED=true` was flipped in prod with no rollback in between.

**Anchor date:** paywall flipped on **2026-05-11** per memory `project_phase4_1_3_preflight_2026_05_11.md`. No rollback since.

**Earliest unlock date:** **2026-06-08** (2026-05-11 + 28 days).

**Why the 28-day bar:** idempotency replay, spend-cap reservation race conditions, receipt v1 envelope under partner consumption, facilitator stability — these surfaces could surface bugs that need absorption into v0.1.x before adding p402/Canton/AP2 complexity on top.

---

## Current state (2026-05-13)

| Gate | Status | Detail |
|---|---|---|
| 1 — independent paying agent | ❌ not satisfied | All 7 settles to date (2026-05-12 ×5 + 2026-05-13 ×2) are from probe wallet `0x547C2c615b227800D56b5ed24021C2CbCa0a3057`. Funnel just opened today via the listing. |
| 2 — 4 weeks of v0.1.0 stability | ❌ not satisfied | T+2 days. Earliest unlock 2026-06-08 (T+28). |

Unlock projection: **2026-06-08** at the earliest, contingent on gate 1 firing by then. If gate 1 doesn't fire by 2026-06-08, the bigger strategic question is whether passive catalog discovery is enough or whether we need active outreach (Coinbase events, x402 Foundation channels, partner referrals).

---

## How a future session grades readiness

Run these four checks in order. Total time: ~5 minutes from PowerShell.

### Check 1 — gate 1, independent paying agent

```powershell
# Replace SUPABASE_URL with the prod project URL if not in .env
# Returns rows where the agent is NOT our probe wallet
curl.exe -s "$env:SUPABASE_URL/rest/v1/paid_requests?endpoint=eq./route&agent_address=not.eq.0x547C2c615b227800D56b5ed24021C2CbCa0a3057&select=id,agent_address,tx_hash,created_at&order=created_at.desc&limit=5" `
  -H "apikey: $env:SUPABASE_SECRET_KEY" -H "Authorization: Bearer $env:SUPABASE_SECRET_KEY"
```

- Returns `[]` → gate 1 NOT satisfied.
- Returns any row → gate 1 SATISFIED. Capture `agent_address` + `tx_hash` + `created_at` for the readiness-grade entry.

Alternative no-Supabase signal: the CDP catalog entry's `lastUpdated` differs from `2026-05-13T14:09:34.478Z` AND the most recent `paid_requests` row's `agent_address` is non-TrustBench. Worth cross-referencing but Supabase is the authoritative source.

### Check 2 — gate 2, time elapsed

```powershell
# Days since paywall flip
$start = Get-Date "2026-05-11T00:00:00Z"
$now = (Get-Date).ToUniversalTime()
$days = [int]($now - $start).TotalDays
Write-Host "v0.1.0 days live: $days (gate fires at 28)"
```

- `$days < 28` → gate 2 NOT satisfied. Note the remaining days.
- `$days >= 28` → gate 2 SATISFIED.

### Check 3 — stability sub-indicators (only run if gate 2 ≥ 28)

Before declaring gate 2 firmly satisfied, sanity-check that the 28 days were stable. Any "no" answer below blocks the gate even if the calendar says ready:

- Has `TRUSTBENCH_PAYWALL_ENABLED` stayed `true` continuously since 2026-05-11? (Check Railway env audit log.)
- Has the daily indexing-watch cron run cleanly without alert? (Check `.github/workflows/bazaar-indexing-watch.yml` last 28 runs.)
- Has `npm run smoke:paywall` passed in any post-deploy regression run? (Check Railway log retention or local notes.)
- Are there any `[paywall]` ERROR-level lines in Railway logs that suggest unhandled facilitator failures, spend-cap reservation orphans, or receipt-signing crashes? (Spot-check most recent 7 days.)
- Has the receipt envelope v1 format been touched (a `version` bump beyond `1.0.0`)? If yes, the 4-week clock resets to the bump date.

If any "no", the gate is provisionally satisfied but a fix-and-extend is required before Phase 5 kicks off.

### Check 4 — unlock verdict

| Gate 1 | Gate 2 (calendar) | Gate 2 (stability) | Verdict |
|---|---|---|---|
| ❌ | ❌ | — | NOT READY. Days remaining: `28 - $days`. Action: continue Phase 4 tail work; watch for gate 1 signal. |
| ❌ | ✅ | ✅ | NOT READY. Gate 1 still the blocker. Action: reassess passive vs active outreach for first paying agent. |
| ✅ | ❌ | — | NOT READY. Gate 2 calendar still pending. Action: harden v0.1.0 based on the first paying agent's actual traffic shape; Phase 5 scope can start being drafted. |
| ✅ | ✅ | ❌ | PROVISIONAL. A stability sub-indicator blocked. Fix the indicator, extend the 28-day clock to the fix date, re-grade. |
| ✅ | ✅ | ✅ | **READY.** Schedule a Phase 5 kickoff session. Read `phase5-design-seeds.md` and `ap2-compatibility-assessment.md` first. |

---

## What could pull the unlock forward

- A paying agent lands fast via catalog discovery (gate 1 fires early; gate 2 is the binding constraint).
- A partner integration (Strata §10 reference agent, an x402 Foundation introduction, Coinbase outreach response) produces the first real paying call.
- An ecosystem build-in-public moment surfaces an agent author who wires `@trustbench/verify-receipt` into their integration and pays.

## What could push the unlock back

- A bug surfaces in v0.1.x that requires a non-back-compat fix (e.g. receipt envelope v1.1). The 28-day clock resets to the fix-deploy date.
- A facilitator change at CDP that requires a coordinated client update (delays gate 2 stability sub-indicator).
- The first paying agent surfaces an idempotency replay race or a spend-cap reservation orphan we need to absorb before adding multi-protocol complexity. Acceptable; 4 weeks of stability is exactly what this gate is for.
- Zero independent paying agents by 2026-06-08, signaling that catalog visibility alone isn't enough. The strategic conversation shifts from "Phase 5 timing" to "is the discovery thesis working at all" (see `feedback_solo_founder_ai_category_velocity.md` memory for the prior version of this question — solo-founder velocity in a fast-moving AI infrastructure space).

---

## Cross-references

- `CLAUDE.md` § "Phase 5" — the gate definitions live here. If they change, update this doc.
- `phase5-design-seeds.md` — design observations to feed the eventual Phase 5 scoping session.
- `ap2-compatibility-assessment.md` — Path B decision (AP2 complementary, not competing) locked 2026-05-07.
- `decisions.md` 2026-05-13 (Stone 0 entry) — 90-day check-back at 2026-08-11 is the formal callback for the listing-validates-discovery-thesis question. Phase 5 readiness watch is the weekly tactical version of the same observation.
- Memory: `project_stone_0_listing_validated_2026_05_13.md`, `project_phase4_1_3_preflight_2026_05_11.md`.
