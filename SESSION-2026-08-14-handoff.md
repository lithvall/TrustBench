---
stance_version: 2026-08-14
stance_phase: phase-4-conversion-reassessment
stance_pillars: [canonical-receipt-format-standard, neutral-routing-receipt-layer]
stance_frozen: true   # point-in-time session record
---

# Session handoff — 2026-08-14

Read this after `STANCE.md` (rev 6) and before acting on anything strategic. It is the state of play as of end-of-session. Everything below is committed and pushed to `main`.

---

## 1. The strategic call made today

**Discovery-first is now the active posture. Routing + receipts moved to explicit MAINTENANCE mode.**

Recorded in `decisions.md` (2026-08-14 entry, check-back 2026-11-12). Maintenance means `/route`, `/receipts/:id`, the paywall and signing keys keep running at ~$0 marginal cost, but generate **no** new decision entries, callbacks, roadmap items or stance obligations.

**Why:** 93 days live, listed and CDP-indexed produced zero paying agents. But the decisive evidence is category-level, not TrustBench-specific — six comparable projects show the same zero (Strata: 1 sale in 99 days then abandoned; MAKO: dormant 92d; x402route: dead; Infopunks: shut down; ScoutScore: no x402 surface in 85 days). Six independent execution failures is not the parsimonious reading. Meanwhile the only surface anyone adopted unprompted is the **free read-only MCP server**, and the only inbound claiming real x402 revenue is an **endpoint** (IBANforge) that came to TrustBench for distribution.

**RE-ENTRY TRIGGER — the load-bearing field:** first `hasXPayment=true` on `/route` from a non-prober User-Agent. Already instrumented, costs zero attention. If it fires, routing + receipts return to active development immediately.

**This decision is CONDITIONAL** on the 2026-08-21 MCP log read (see §3). Do not build on it until that resolves.

---

## 2. Anthropic Connectors Directory — REAL, OPEN, FROZEN

**Status source: observed.** Email from the Anthropic MCP Directory team, **2026-07-31 09:04**:

> "your submission is currently under an escalated review… It isn't a rejection, and there's nothing you need to do right now… Your submission keeps its place."

**Operative constraints:**

- **Exposing `/route` or any payment-capable operation as an MCP tool is FROZEN.** In `STANCE.md` `out_of_scope`. Do not propose, scope, or treat as a live option.
- The freeze covers **MCP tools only**. `/route` as an HTTP endpoint, `/receipts/:id`, the registry, the paywall and the Smithery listing are outside the submission and unaffected.
- **Do not chase Anthropic before 2026-09-30.** "Nothing you need to do right now" is explicit; escalated reviews are stated to run long. Check-back is set.
- Mild consideration: the submitted listing reads *"a non-custodial routing and audit layer for x402 agent payments."* A site that reads discovery-first against that listing is an inconsistency a reviewer could notice, and the submission is not editable from a Max plan. Prefer gradual reframing over loud repositioning while the review is open.

**If you encounter an entry claiming this review "appears not to exist":** that is marked `graded-disproven-2026-08-14-same-day`. Ignore its conclusion. The email supersedes it. See §6.

---

## 3. What is on a timer — nothing needs action before 2026-08-17

| Date | What | Where |
|---|---|---|
| 2026-08-17 | Callback due | `decisions.md` (entry 2026-05-19) |
| 2026-08-20 | Callback due | `decisions.md` (entry 2026-05-20) |
| **2026-08-21** | **MCP method-level log read** | Scheduled task `trustbench-mcp-log-read`, fires 09:00 +02:00 |
| 2026-09-30 | Connector review check-back | `decisions.md` status-of-record entry |
| 2026-11-12 | Maintenance-mode decision check-back | `decisions.md` |
| 2026-10-30 | Phase 4 kill-criterion 90-day callback | `decisions.md` (2026-08-01 entry) |

Run `npm run callbacks` and `npm run stance-check` at session start. Both were green at close: **0 overdue, 0 untracked, 0 stance drift.**

The 2026-08-21 task is self-contained and will run in a fresh session. Scheduled tasks only fire while the app is open; if closed, it runs on next launch.

---

## 4. The open question that gates the strategy

**Are the 1,029 Smithery "uses" real tool calls, or a gateway heartbeat?**

- 6 distinct Smithery profiles hit `/mcp` (gougou, cohere, jimin2, unccs, jimin1, shiyue3677), 689 requests in the 2026-07-25→08-01 window, 3 still active on the last day.
- **Installation is established. Use is NOT.** The old logs captured URLs and status codes only.
- Smithery cannot answer it — TrustBench is registered `remote`, so their pipeline never sees JSON-RPC payloads. Their Logs tab shows "No data"; Observability fails to load.
- **Fixed 2026-08-14** (commit `e715c23`): `src/mcp-http.ts` now logs method, tool name, argument KEY NAMES, and profile — **never argument values**.
- **The decisive number is the `tools/call` count.** Zero = heartbeat. Meaningful volume = real use.

Real use → discovery-first is well-founded. Heartbeat → discovery is thinner than it looks and the reassessment widens toward product-market fit (branch (c) of the 2026-08-01 leading indicator).

---

## 5. Everything else that shipped today

**Tooling**
- `npm run callbacks` — `scripts/decision-callbacks.ts`. Automates the Monday review: overdue, upcoming, and dated commitments living outside `decisions.md`. Two bugs found and fixed the same day (see §6).
- `npm run stance-check` — existing, plus new `stance_frozen: true` support so point-in-time records stop reporting as permanent hard fails.
- `callback_tracked_in: decisions.md` marker — enrolled commitments stop re-flagging.

**Decision journal**
- **23 callbacks graded**, backlog cleared to zero: 12 validated, 5 disproven, 2 superseded, 2 lapsed, 2 rescheduled.
- New fifth grade **`lapsed`** added to `prompts/decision-journal.md` for action-shaped decisions never executed.
- 4 untracked dated commitments enrolled from `decisions-pending-2026-05-13.md`, `PLAN-2026-05-14-mcp-server.md`, `SIGNAL-2026-05-17-agenticmarket-bundles.md`.

**Public copy**
- Removed the unimplemented "pay-to-list (refundable bond)" claim from **8 surfaces** (landing ×2, footer, `trustbench.json`, `llms.txt` ×2, `skill.md`, README, OG-card script). "Never pay-to-rank" retained everywhere — it is true and load-bearing.
- `skill.md` was the worst case: it instructed agents to "self-attest with TrustBench's pay-to-list bond," an action with no implementation.
- **OG card PNGs are stale** until `scripts/generate-og-cards.py` is re-run.

**Ops**
- Rollup cron moved 23:55 → **20:17 UTC**. GitHub's scheduler was starting it ~00:44 UTC, *after* Paddock's 00:05 poll — he had been reading the previous day's file every day.
- `export-7-night.ts` `MAX_PAGES` 100 → 500 with a 150k soft alarm. `providers` is at 79,480 growing ~320/day; the old ceiling was a scheduled outage ~64 days out.
- **Not done, needs your call:** ~73k unprobed `providers` rows accumulate with no retention policy. Deleting rows is destructive.

**Competitive** (first refresh in 89 days, all verified by live probe)
- MAKO Pulse **sev 4 → 3**. Identity finally resolved: Chris Dover, `mako.pollinateresearch.com`. Capability overlap still direct (`mako-mcp-server` ships route/pulse/pricing/reputation/verify as MCP tools) but zero commits in 92 days. **Your defense #4 survived a scare** — `mako-verifier` exists but is a *paid hosted endpoint*, not a standalone offline verifier like `@trustbench/verify-receipt`.
- x402route **sev 3 → 1**, root returns 404.
- Dexter **2 → 4** (index was stale vs STANCE). ScoutScore added at 3. Infopunks **2 → 1**, shutdown confirmed. IBANforge logged as *not* a competitor.
- Three new rules in `COMPETITIVE-BRIEF.md`: a live endpoint is not a live competitor (`commit_cadence` now required at sev ≥3); never scan against an unverified domain; symmetry check (TrustBench had its own 68-day gap).

**Partner state**
- **Strata: dormant.** Repos silent since 2026-05-09, npm frozen at 0.1.2, 1 sale in 99 days, Show HN never happened. Their engineering stopped 6 days *before* they confirmed §10 closed.
- **IBANforge: reply sent 2026-08-14.** Record at `drafts/DRAFT-2026-08-14-ibanforge-reply.md`. Not indexed because they are not in the agentic.market catalog — TrustBench's only Base discovery source. Anything beyond answering follow-ups is a partnership commitment needing a six-question filter pass.
- **Paddock: live**, feed healthy, now getting same-day data after the cron fix.

---

## 6. Calibration record — read this before trusting a confident conclusion

**Four claims outran their evidence today.** All mine, all in one session:

1. *"The nightly export has been dead for 13 days."* Read from local `git log` without `git fetch`. The pipeline never missed a night. Caught in ~1 hour by Johan's Actions screenshot.
2. *"External parties do install and use the MCP tools."* Installs were proven; **use** was not, and the 2026-08-01 entry had already marked it UNPROVEN. Caught same session.
3. *"The escalated review appears not to exist."* Reasoned from portal-requires-Team + Johan-on-Max. **Wrong** — the email proves it. Caught within the hour by Johan producing it.
4. Correcting (3) at the origin but leaving it cited in the maintenance entry's `constraint_note` **and in the scheduled task prompt** — which would have handed a fresh session a disproven premise.

**The mechanism:** hedged language does not survive being quoted. "Most plausibly triggered the escalation" becomes "the escalation" on first citation and a constraint on the second.

**Rules banked in `Claude.md` and `lessons.md`:**
- **Name the observer before trusting the observation.** Local `git log` cannot see remote-committed state. Green CI cannot see output correctness. A source file cannot see rendered output. A CDN cannot see origin health.
- **When a claim's disconfirming source exists but is outside your reach, you do not get to conclude.** Report the finding, name the source, hand the check over. One question to Johan beats a wrong entry.
- **Retracting a claim means grepping for where it was cited**, not just fixing where it was born.
- Instruments need measuring too — the callbacks scanner had two bugs, both found by cross-checking against an independent parse, never by reading its own output.

**Net damage: near zero**, and only because the `out_of_scope` removal was written as a *condition* rather than executed. Write consequential removals as conditions.

---

## 6b. Commissioned for next session — MCP landscape scan, then the cross-LLM loop

Johan commissioned this at the end of the session. Brief: **** — read it after this handoff.

Two phases. **Phase 1:** deep-research sweep of the MCP-provider ecosystem (Smithery, mcp.so, mcpmarket, glama, modelcontextprotocol/servers, awesome-mcp lists, Anthropic directory), then narrowing to subjects that match TrustBench lanes, with a per-subject TrustBench-takeaway column. Same shape and discipline as . **Phase 2:** the cross-LLM dialectic on the path forward, informed by Phase 1.

The loop is **ported and verified working**:  + , adapted from Frisyr. codex-cli 0.139.0, ChatGPT auth live, smoke test returned a correct read of . codex lives in WSL so calls route through .

**The protocol is a GENUINE DIALECTIC and this is enforced:** Claude writes its own answer FIRST, the codex prompt is OPEN-ENDED with no Claude solution embedded, then debate, rebut, converge, and document both positions. Handing codex a finished plan to react to defeats the entire mechanism.

Note the dependency: the 2026-08-21 log read is an **input** to Phase 2. If those 1,029 Smithery uses are heartbeat rather than tool calls, the discovery-first premise the debate starts from is much weaker.

## 7. Suggested first moves next session

1. `npm run callbacks` and `npm run stance-check`. Both green at close; anything red is new.
2. If it is on/after 2026-08-21, check whether the scheduled task ran and what the `tools/call` count was. **That number gates the discovery-first decision.**
3. Do not touch the MCP tool surface. Do not chase Anthropic before 2026-09-30.
4. If IBANforge replied, run the six-question filter before committing to anything beyond answering questions.
