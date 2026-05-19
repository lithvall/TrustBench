# Git Hygiene Pass — 2026-05-19

PowerShell command sheet for Johan to execute. Run from
`C:\Users\Lithv\Documents\Claude\Projects\TrustBench\`.

**Why PowerShell, not Linux side:** Linux git can't touch `.git/index.lock` on the
Windows mount (permission denied). Trying ran into the exact mount-write-risk the
2026-05-13 lesson warned about. PowerShell is the source of truth for git ops.

---

## Pre-flight — verify state matches expectations

```powershell
cd C:\Users\Lithv\Documents\Claude\Projects\TrustBench

# Confirm we're on main and there's no detached HEAD weirdness
git branch --show-current
git log --oneline -1

# Confirm a stale lock isn't blocking writes
if (Test-Path .git\index.lock) {
    Write-Host "Stale lock present — removing"
    Remove-Item .git\index.lock
}

# Reality-check the working tree count
(git status --short).Count
```

The `.gitignore` was already edited by Claude (Edit tool wrote to disk).
Verify the edit landed:

```powershell
Get-Content .gitignore | Select-String -Pattern "ProjectAutonomous|Xpictures|.claude/"
```

If the new ignore patterns appear, you're good. If not, the file didn't sync;
manually re-add the block at the bottom (see the diff in this session's chat).

---

## Batch 1 — .gitignore additions

```powershell
git add .gitignore
git diff --cached .gitignore     # review before committing
git commit -m "chore: ignore .claude worktrees, ProjectAutonomous, Xpictures, root banner-x assets"
```

After this commit, the previously-untracked dirs will disappear from `git status`.

---

## Batch 2 — Load-bearing strategic infrastructure (MUST-COMMIT)

```powershell
git add `
    STANCE.md `
    strategic-pillars-and-options-2026-05-14.md `
    prompts/ `
    stance/ `
    competitive/

git status --short --cached
git commit -m "docs: commit load-bearing strategic infrastructure (STANCE, pillars-filter, prompts/, stance/, competitive/)"
```

What this commits:
- `STANCE.md` — single source of truth for "what TrustBench is right now"
- `strategic-pillars-and-options-2026-05-14.md` — the canonical pillars doc
- `prompts/critic.md` + `prompts/decision-journal.md` — mandatory critic + DJ flows
- `stance/` — drift-check infrastructure (`check-staleness.ts`, `regenerate.ts`, README, templates)
- `competitive/` — COMPETITIVE-BRIEF, SEVERITIES, MEMORY, threats/

---

## Batch 3 — Historical context (SHOULD-COMMIT)

```powershell
git add `
    phase6-beyond-strategy.md `
    phase6-reassessment-2026-05-07.md `
    phase6-reassessment-2026-05-07_CHATGPT_INPUT.md `
    phase6-reassessment-2026-05-07_GROK_INPUT.md `
    ap2-compatibility-assessment.md `
    agentlog-competitor-verification-2026-05-07.md `
    agentlog-CLAUDE-draft_deprecated_2026-05-10.md `
    agentlog-concept-2026-05-07_deprecated_2026-05-10.md `
    agentlog-concept-2026-05-07_CHATGPT_INPUT_deprecated_2026-05-10.md `
    agentlog-concept-2026-05-07_GROK_INPUT_deprecated_2026-05-10.md `
    phase3-grok-batch_deprecated_2026-05-10.md `
    stitch-redesign-prompt_deprecated_2026-05-10.md `
    strata-deep-dive-2026-05-07.md `
    trustbench-reliability-pivot-verification-2026-05-07.md

git status --short --cached
git commit -m "docs: archive historical strategy + agentlogs + deprecated drafts for future-session context"
```

What this commits:
- `phase6-*` strategy assessment files (incl. ChatGPT/Grok input snapshots)
- `ap2-compatibility-assessment.md` — 2026-05-07 AP2 verdict (complementary, not competing)
- `agentlog-*` files including the `_deprecated_2026-05-10` suffixed audit-trail variants
- `_deprecated_*` suffix is the explicit audit trail; preserved as-is
- partner-day + reliability-pivot 2026-05-07 anchor docs

---

## Batch 4 — Phase 4/5 working research, assessments, drafts, signals

```powershell
git add `
    phase4-p4-3-timing.md `
    endpoint-portfolio-research-2026-05-14.md `
    gap-map-deep-dive-2026-05-14.md `
    portfolio-ofac-screening-design.md `
    sequence-of-work-2026-05-14.md `
    PLAN-2026-05-14-mcp-server.md `
    REVIEW-2026-05-14-mcp-approval-odds.md `
    ASSESS-2026-05-14-base-azul-trustbench.md `
    ASSESS-2026-05-17-mythosrouter-competitive.md `
    SIGNAL-2026-05-14-xrpl-agent-commerce-launch.md `
    JarvisBrain-feed-2026-05-14.md `
    anthropic-connector-submission.md `
    clu-agent-error-vocab-gist-draft.md `
    pay-sh-amplification-draft.md `
    pay-sh-provider-triage.md `
    strata-reply-2026-05-12.md `
    grok-github-research-briefing.md `
    unexplored-ideas.md `
    x-content-strategy.md `
    x-post-draft-2026-05-13.md `
    zk-pdf-analysis.md

git status --short --cached
git commit -m "docs: add Phase 4/5 working research, assessments, drafts, and signals"
```

**Skipped:**
- `rollup-2026-05-11.csv` at the repo root — orphan rollup outside `exports/`.
  Either move it into `exports/` first or leave it untracked. Decide manually.

---

## Batch 5 — Bundle v7 archive (disproven drafts collapsed to MOVED stubs)

```powershell
git add `
    bundles/auditable-market-research.md `
    bundles/receipted-agent-to-agent-procurement.md `
    bundles/verified-market-research.md

git diff --cached bundles/             # eyeball that they're MOVED stubs, not full files
git commit -m "chore(bundles): collapse disproven v1-v3 drafts to MOVED stubs (v7 canonical at receipt-backed-agent-to-agent-procurement)"
```

---

## Batch 6 — Content adds (3 files Johan asked to investigate + grok-bundle-scan briefing)

These are the 3 specifically flagged in the request, plus `grok-bundle-scan-briefing.md`
which has a real 2-line change.

```powershell
git add `
    decisions.md `
    phase5-design-seeds.md `
    scripts/verify-receipt.js `
    grok-bundle-scan-briefing.md

# IMPORTANT: review the diff — most of the byte count is CRLF/LF churn,
# but the substantive changes are described below. Check them visually:
git diff --cached --ignore-all-space decisions.md          | Select-Object -First 80
git diff --cached --ignore-all-space phase5-design-seeds.md | Select-Object -First 60
git diff --cached --ignore-all-space scripts/verify-receipt.js
git diff --cached --ignore-all-space grok-bundle-scan-briefing.md

git commit -m "docs: 2026-05-15 Strata re-issue + Mindshare calibration; Phase 5 gap-map seed; verifier example repin"
```

What's actually in these diffs (under the CRLF noise):
- `decisions.md` — +23 lines: three 2026-05-15 entries about the Strata receipt
  re-issue (`rrcpt_01KRN8HYPPRD1MS9JE7045S77Q`), Mindshare-outreach calibration
  shift (wait-and-leverage → Option 1 lightly extended), distribution baseline
  reality-check.
- `phase5-design-seeds.md` — +26 lines: new "x402 capability gap map" section,
  tagged P5-coverage-report.
- `scripts/verify-receipt.js` — 1-line example repin from the older
  `rrcpt_01KRGKSZACB4ECRPEQY1VC0F3N` to the new Strata receipt.
- `grok-bundle-scan-briefing.md` — 2-line change (inspect; if it's stale draft
  state and not load-bearing, unstage it).

---

## DO NOT COMMIT IN THIS PASS — lessons.md (mount-truncation gotcha)

**Symptom:** the working-tree `lessons.md` is missing the bottom 5 paragraphs of the
2026-05-19 "cap rules" entry. The file ends mid-sentence with no newline at EOF.
HEAD's version has the full entry intact.

**Cause:** the Windows-mount-write-truncation pattern from `feedback_windows_mount_truncation.md`.
A Linux-side write didn't fully propagate.

**Also true:** the working tree has a NEW 2026-05-19 lesson at the top (X card
preview / 2-URL behavior) that IS load-bearing and worth keeping.

**Fix sequence (from PowerShell):**

```powershell
# 1. Stash the new top entry from the working-tree file
$workingTree = Get-Content lessons.md -Raw
$newEntry = $workingTree.Substring(0, $workingTree.IndexOf("## 2026-05-18 — When another Claude instance"))

# 2. Restore the canonical version from HEAD
git checkout HEAD -- lessons.md

# 3. Prepend the saved new entry
$canonical = Get-Content lessons.md -Raw
$header = $canonical.Substring(0, $canonical.IndexOf("## 2026-05-18 — When another Claude instance"))
$body   = $canonical.Substring($canonical.IndexOf("## 2026-05-18 — When another Claude instance"))
Set-Content -Path lessons.md -Value ($header + ($newEntry -replace "(?s)^.*?## 2026-05-19", "## 2026-05-19") + $body) -NoNewline

# 4. Verify
Select-String -Path lessons.md -Pattern "## 2026-05-19" | Select-Object Line, LineNumber
tail -n 5 lessons.md       # or `Get-Content lessons.md -Tail 5` on PowerShell

# 5. Commit if it looks right
git diff lessons.md | Select-Object -First 80
git add lessons.md
git commit -m "docs(lessons): add 2026-05-19 X-card-preview rule; restore cap-rules entry truncated by mount drift"
```

Alternative if the PowerShell substring dance feels brittle: open the file in your
editor, paste the new top entry from chat (it's preserved in the diff above), save,
and `git diff` to verify before commit.

---

## Verification before push

```powershell
git log --oneline -7              # confirm 6 new commits in the expected order
git status --short                # should be down to CRLF-only-churn + lessons.md if still dirty
```

The remaining "modified" files in `git status` after these batches will be the ~55
files that have ZERO content change (pure CRLF/LF noise). They can stay dirty
indefinitely without harm; resolve by running `git checkout --` on each, or by
fixing the .gitattributes line-ending rule for the repo and committing the
normalization as a separate housekeeping pass.

---

## Push (when ready)

```powershell
git push origin main
```

Each push triggers a Railway deploy. The strategic doc commits won't change runtime
behavior (no code changes). The verify-receipt.js example repin and the bundles
v7 archive don't either. Safe to push when reviewed.
