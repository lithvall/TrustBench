# Decision Journal — Capture and Callback

> Use this prompt when adding a non-trivial decision to `decisions.md` (capture mode) or during weekly review to grade decisions whose check-back date has arrived (callback mode).
> Pattern derived from `ProjectAutonomous/VaultIntoBusinessSystem.md` and `lessons.md` 2026-05-10 entry on the Critic-pass + Decision-Journal additions.

---

## Why this exists

The legacy `decisions.md` format captures *what* was decided and *why* in one sentence. That's enough to recover context months later, but not enough to grade calibration. Without grading, the same assumption-class mistakes recur — we never learn whether our "reason" was the actual driver of the outcome.

The Decision Journal upgrade adds three fields per entry: the **load-bearing assumption** the decision rests on, the **leading indicator** that will tell us right/wrong before the full outcome is visible, and a **90-day check-back date**. At the 90-day mark we grade the entry — validated, disproven, rescheduled, or superseded. Disproven decisions become high-priority `lessons.md` entries.

This closes the loop between decisions and calibration. Solo founders make 100+ decisions per quarter; the ones that compound are the ones whose assumption-class failures get caught and named.

---

## When to use this prompt

### Capture mode

Trigger: adding any non-trivial decision to `decisions.md`. Examples:

- Phase boundary calls (close Phase X, start Phase Y)
- Pricing model changes
- Partnership commitments (accept / decline / defer)
- Architectural choices (e.g. two-payment-per-call paywall shape)
- Strategic pivots (e.g. component-in-stack reframe)
- Tech stack changes affecting >1 file
- Public-framing changes
- Kill calls (sunset feature / shelve project / drop sector tracking)

NOT for: trivial daily choices, code-internal refactors, individual smoke-test outcomes.

### Callback mode

Trigger: weekly Monday review. Scan `decisions.md` for entries where `status: open` AND `check_back_date ≤ today`. Grade each.

Also trigger before any decision that contradicts a prior decision — read the prior one's callback grade first.

---

## Capture-mode prompt

You are the Decision Journal agent (capture mode). Load `CLAUDE.md` (especially Founder-shape calibration and the current phase plan).

Given the decision Johan just described:

1. Restate the decision in one sentence. Use his exact framing where possible.
2. Identify the **load-bearing assumption** — the one thing that, if wrong, makes this decision wrong. Not "users want X" (too vague) or "the market will grow" (untestable). Something concrete and observable like "Coinbase keeps @x402/core v2.x API-stable for 6+ months" or "agent builders prefer fewer integration steps over richer per-call telemetry."
3. Specify a **leading indicator** — an observable signal that will tell us this was right or wrong *before* the full outcome is visible. Examples:
   - For a pricing decision: "≥3 of first 10 integration partners adopt without re-negotiating the tier"
   - For a partnership decision: "Partner integration spec arrives within 14 days of commitment"
   - For an architecture decision: "First 5 production calls succeed without scope-question receipts"
4. Compute the **check_back_date**: 90 days from the decision date.
5. Set **status**: open.
6. Format the entry in the new Decision Journal format (see `decisions.md` § Format) and append to the bottom of the Decisions list. Do NOT insert mid-list — order matters for cold-pickup readability.

Be specific. Vague assumptions ("the right call") and vague indicators ("things go well") defeat the purpose. If you can't name a concrete indicator, ask Johan one clarifying question before writing the entry.

End with: "Decision captured. Check-back: {date}."

---

## Callback-mode prompt

You are the Decision Journal agent (callback mode). Load `CLAUDE.md`.

Walk `decisions.md` from the bottom up. For each entry with `status: open` AND `check_back_date ≤ today`:

1. Read the decision, assumption, and leading indicator.
2. Look at the observable evidence in the project state since the decision date:
   - Relevant `phase4-*.md` / `phase5-*.md` shipped artifacts
   - `lessons.md` entries dated after the decision
   - Memory files updated after the decision
   - Receipts / metrics if applicable
3. Determine the grade:
   - **validated**: leading indicator was observed as predicted. Note the date observed.
   - **disproven**: assumption broke. Name the specific way it broke in one sentence.
   - **rescheduled**: insufficient evidence yet. Set new `check_back_date` 30 days forward. Increment a reschedule counter; refuse beyond 3 reschedules.
   - **superseded**: a later decision invalidated this one. Reference the YYYY-MM-DD of the superseding entry.
4. Append the grade to the entry inline (new line under the existing fields, do NOT rewrite the original fields).
5. For every `disproven` grade: append a one-paragraph entry to `lessons.md` describing the assumption-class failure. Format: "Decision X (YYYY-MM-DD) was disproven because <specific way>. Pattern to watch for: <generalized assumption type>. Next time, before committing this kind of decision: <one mitigation>."

Output a callback summary:
```
Callbacks processed: N
  Validated: K (calibration win)
  Disproven: M (pattern entries added to lessons.md: ...)
  Rescheduled: J
  Superseded: P
Open with check-back due in next 30 days: Q
```

Be ruthless on the disproven calls. The point of this loop is to catch assumption-class failures while they're fresh. "Mostly worked out" is not validated. The leading indicator either fired or didn't.

---

## Example: a real Decision Journal entry

```
2026-05-11: Adopt two-payment-per-call paywall shape for v0.1.0. Reason: explicit fee transparency + audit clarity over single-payment simplicity; matches the "honest framing" rule.
  - assumption: Agent builders' integration teams will tolerate dual-confirmation flow if the failure-recovery path is documented with one working example
  - leading_indicator: First 5 integration partners ship without raising dual-payment confusion in their integration notes
  - check_back_date: 2026-08-09
  - status: open
```

90 days later:

```
  - status: disproven (2026-08-09). 4 of 5 first partners flagged dual-payment confusion as a top-3 integration issue; assumption broke because copy-paste examples dominated over docs and the working failure-recovery example wasn't enough. lessons.md entry appended 2026-08-09.
```

That `disproven` entry has more strategic value than the original decision did. It generalizes: "when shipping a new payment-shape pattern, expect copy-paste-first adoption — invest in single working example before docs."

---

## Anti-patterns

- **Vague assumptions.** "The market will adopt this" — useless. Be specific: name a behavior, a number, an observable.
- **Untestable leading indicators.** "Things go well" / "no major problems" — useless. Pick something that either happens or doesn't within 90 days.
- **Backdating callbacks to make them validated.** If the leading indicator didn't fire as predicted, it's disproven. Don't move the goalpost.
- **Hand-waving disproven into validated.** "We pivoted but it worked out" is not validated — it's superseded. Mark it correctly.
- **Skipping the lessons.md entry on disproven.** That's where the calibration value actually compounds. Skipping it is letting the lesson evaporate.
- **Capturing every micro-decision.** This isn't a todo list. Use it for non-trivial calls only (see "When to use" above).

---

## Integration with the broader workflow

- `CLAUDE.md` § "Decision Journal" references this prompt as the authoritative capture/callback procedure.
- Monthly synthesis (when Slice 1 ships) reads callback grades and reports calibration rate.
- Disproven entries auto-feed the next Critic pass on similar diffs (the Critic prompt should reference recent disproven decisions when assessing similar assumption classes).
- Tied to founder-shape calibration: if multiple disproven decisions cluster around a single founder-shape mis-application (e.g. repeated capital-fit overruns), surface it as an AGENTS.md / CLAUDE.md edit recommendation.

---

## Calibration history

- 2026-05-11 — initial version. Capture + callback modes specified. Worked example uses the paywall v0.1.0 two-payment shape (from `phase4-paywall-design.md` and the Critic-pass worked example in `prompts/critic.md`).
