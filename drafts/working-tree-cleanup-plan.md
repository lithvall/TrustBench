---
title: Working tree cleanup plan (proposed commit sequence for Johan execution)
created: 2026-05-19
status: analysis-only-execution-gated-to-Johan
companion_doc: audit-and-path-forward-2026-05-19.md (v2) § 5 Day-1 artifacts
---

# Working tree cleanup plan

**Why this is a plan, not an execution.** Per CLAUDE.md autonomy boundary, "pushing or merging to main, or anything that triggers a Railway production deploy" requires asking Johan first. This file is the analysis + proposed command sequence. Johan runs the commits and the push from PowerShell when ready.

**Why now.** `git diff --stat HEAD` (last checked 2026-05-19) shows ~24,538 insertions / ~24,485 deletions across 62 files. Most is line-ending churn from Cowork Linux-mount writes (per the `feedback_windows_mount_truncation` memory: NTFS-mount round-trips can normalize line endings). Sitting on top of that diff through the Strata pre-launch maintenance window (now through ~2026-05-29) is operational risk — if a deploy is needed mid-window, a 50KB-line diff is illegible and hard to roll back cleanly.

**Constraint.** Strata maintenance contract is binding: no Ed25519 key rotation, no breaking changes to receipt format or paywall response shape, verify-receipt@0.1.2 stays on npm. This cleanup is hygiene-only; if anything mid-cleanup looks like a wire-touching change, STOP and reconfirm before commit.

---

## Step 1 — Confirm the diff is mostly line-ending churn (PowerShell)

Run from PowerShell on the Windows host, NOT from the Linux mount (per `feedback_windows_mount_truncation`):

```powershell
cd C:\Users\Lithv\Documents\Claude\Projects\TrustBench

# Full diff stat
git diff --stat HEAD | Select-Object -Last 3

# Whitespace-ignored diff stat (real content changes only)
git diff -w HEAD --stat | Select-Object -Last 3

# Compare the two — if -w diff is dramatically smaller, it's mostly EOL/whitespace
```

Expected: regular diff = thousands of lines; -w diff = hundreds of lines. If they're close, the diff has more real content than expected — pause and investigate before commit.

## Step 2 — Identify the real-content file list

```powershell
git diff -w HEAD --stat | Out-File diff-content-only.txt -Encoding utf8
notepad diff-content-only.txt
```

Expected real-content files (based on git log and recent work, as of 2026-05-19):

- `bundles/receipt-backed-agent-to-agent-procurement.md` (v7 work today)
- `bundles/auditable-market-research.md`, `bundles/verified-market-research.md`, `bundles/receipted-agent-to-agent-procurement.md` (related bundle work)
- `bundles/archived-drafts/*.md` (disproven drafts archived today)
- `bundles/archived-drafts/README.md`
- `.well-known/trustbench.json` (revenue wallet added 2026-05-19)
- `decisions.md`, `lessons.md` (today's entries)
- `SIGNAL-2026-05-17-agenticmarket-bundles.md` (Open Strategic Question added today)
- `Claude.md`, `CLAUDE.md` (maintenance updates — confirm which is canonical)
- `README.md` (possible)
- `src/index.ts` (bundles route)
- `src/route-handlers.ts` (large file, possible)
- `src/types.ts`, `src/trust-signals.ts`, `src/routing-receipt-html.ts`, `src/privacy-html.ts` (possible)
- `src/methodology-html.ts`, `src/methodology-html-v2.ts` (possible)
- `Dockerfile`, `.gitattributes`, `.github/workflows/post-to-x.yml` (possible)
- `TrustBench-strategy.md`, `COMPETITIVE-LANDSCAPE.md`, `# Competition Analysis*`, `# Phase 2*`, `# Supabase 2026*`, `stitch-redesign-prompt.md`, `strata-integration-sketch-SEND.md`, `x402SKILL.md`, `supabase/schema.sql` (mostly likely line-ending only)
- `exports/rollup-2026-05-14.csv`, `exports/rollup-2026-05-15.csv`, `exports/rollup-2026-05-16.csv` (data files, possible content drift)

Cross-check this list against `diff-content-only.txt`. The expected set is wider than the actual real-content set; refine.

## Step 3 — Commit A: line-ending normalization

```powershell
# Use --renormalize to apply .gitattributes rules across the working tree
git add --renormalize .

# Verify what was staged
git diff --cached --stat | Select-Object -First 50

# Confirm: this is JUST line-ending changes. No real content.
# If you see content changes here, STOP — they need to be staged separately.

git commit -m "chore: normalize line endings across project (no content changes)"
```

**Sanity check after Commit A:**
```powershell
git diff --stat HEAD | Select-Object -Last 3
```

The remaining diff should now match diff-content-only.txt closely. If it's still huge, the renormalize didn't catch everything — investigate before continuing.

## Step 4 — Commits B-N: real content changes

One logical group per commit. Examples (adjust based on actual content in diff-content-only.txt):

### Commit B — Bundle v7 work (Pillar 1 propagation surface)

```powershell
git add bundles/receipt-backed-agent-to-agent-procurement.md `
        bundles/auditable-market-research.md `
        bundles/verified-market-research.md `
        bundles/receipted-agent-to-agent-procurement.md `
        bundles/archived-drafts/

git diff --cached --stat
git commit -m "feat: bundle v7 + archived drafts (Pillar 1 propagation surface)"
```

### Commit C — Revenue wallet anchor

```powershell
git add .well-known/trustbench.json
git diff --cached
git commit -m "feat: anchor revenue wallet address in trustbench.json"
```

(Note: this commit may already be in git log as `d8f3eb8 feat: publish revenue wallet address in trustbench.json manifest`. If so, skip this commit — the change is already pushed.)

### Commit D — Decisions + lessons (2026-05-19)

```powershell
git add decisions.md lessons.md
git diff --cached --stat
git commit -m "docs: 2026-05-19 decisions + lessons (bundles v7, vocab gist v0.2.1, AxiomBot reply)"
```

### Commit E — SIGNAL Open Strategic Question

```powershell
git add SIGNAL-2026-05-17-agenticmarket-bundles.md
git diff --cached
git commit -m "docs: SIGNAL-2026-05-17 § Open Strategic Question on /route vs /verify"
```

### Commit F — CLAUDE.md maintenance updates

```powershell
git add CLAUDE.md
# If Claude.md is also modified — check if it's a duplicate of CLAUDE.md or a separate file
git diff --cached
git commit -m "docs: CLAUDE.md mission map + bundles entries (2026-05-19)"
```

### Commit G — Audit + roadmap + Day-1 artifacts (TODAY'S NEW FILES)

```powershell
git add audit-and-path-forward-2026-05-19.md `
        roadmap-2026-05-19.md `
        drafts/
git diff --cached --stat
git commit -m "docs: 2026-05-19 audit (v2) + multi-horizon roadmap + Day-1 artifacts"
```

### Commit H — Source files (only if real content drift)

If `src/*.ts` files have real content changes (NOT just line-endings), they need their own commit with a precise message. Look at the diff before committing:

```powershell
git diff -w HEAD src/route-handlers.ts | Select-String -Pattern "^[+-]" | Select-Object -First 20
```

If only formatting / whitespace, skip. If content: stage and commit with a precise commit message describing the change. This is the highest-risk commit class — read carefully.

### Commit I — Exports rollups (data files)

These are CSV outputs from the nightly Paddock pipeline. They should already be committed by the GH Action (commits `8fbcb8c`, `619f2f1`, `c5a5ba7`, `039c4a9` show this pattern). If they're in the working tree, the action's commit may have raced with a local edit. Inspect:

```powershell
git diff HEAD exports/rollup-2026-05-14.csv | Select-Object -First 50
```

If the diff is just appended rows, skip — the next nightly run will reconcile. If the diff is structural (column changes, missing rows), pause and investigate before commit.

## Step 5 — Verify before push

```powershell
git log --oneline -15

git diff origin/main..HEAD --stat
```

Confirm:
- Each commit has a sensible message.
- The line-ending commit is separable from content commits.
- No commit bundles content with normalization.
- The audit + roadmap + drafts are in their own commit (Commit G) — separable from production code.

## Step 6 — Push (when ready)

```powershell
git push origin main
```

This triggers Railway auto-deploy. Watch the deploy log for any post-deploy errors.

## Step 7 — Smoke after push

```powershell
# Live health check
curl https://trustbench.io/health
# Verify receipts endpoint still responds
curl https://trustbench.io/receipts/rrcpt_01KRN8HYPPRD1MS9JE7045S77Q
# Verify .well-known still serves
curl https://trustbench.io/.well-known/trustbench.json
# Verify /explorer renders
curl https://trustbench.io/explorer -o NUL -w "%{http_code}`n"
# Verify bundle route shipped
curl https://trustbench.io/bundles/receipt-backed-agent-to-agent-procurement -o NUL -w "%{http_code}`n"
```

If ANY of these fail with a non-2xx status:
- Roll back the last commit: `git revert HEAD; git push`
- Open the Railway logs and identify what broke
- Strata maintenance contract is binding — debug-forward only if the break is in a non-load-bearing surface (e.g., /explorer rendering) AND the Strata-load-bearing surfaces (paywall, /receipts/:id, /.well-known/trustbench-pubkey) are healthy.

## Risk notes

- The Strata maintenance window is binding through ~2026-05-29. If smoke fails after push, roll back to last known-good commit; do NOT debug-forward during their pre-launch period.
- The `--renormalize` flag respects `.gitattributes` (which already includes `* text=auto` per recent commits). If `.gitattributes` is itself in the diff, look at that first — its rules govern the rest.
- Some files might be intentionally CRLF (Windows line-ending scripts). `git diff -w` will show their content separately.
- `Claude.md` vs `CLAUDE.md` — Windows is case-insensitive; if both appear in the diff, one might be a duplicate. Confirm which is canonical (Linux git is case-sensitive and treats them as different files) before committing both.
- If `git status` from PowerShell shows different output than from the Linux mount, trust PowerShell per `feedback_windows_mount_truncation`. Never run `git push` from the Linux mount.

## Estimated time

- Step 1-2 (analysis): 5 minutes.
- Step 3 (Commit A renormalize): 2 minutes.
- Step 4 (Commits B-N): 15-20 minutes including inspection between commits.
- Step 5 (verify): 2 minutes.
- Step 6 (push): 1 minute.
- Step 7 (smoke): 2 minutes.
- Total: ~25-30 minutes.

## After cleanup

The working tree should be clean (`git status` shows "nothing to commit, working tree clean"). The push triggers Railway deploy. The audit + roadmap + drafts are now in git history, so they're durable artifacts you can reference in future sessions or share externally.

If anything in this plan looks wrong when you actually run Step 1-2, pause and re-evaluate. The risk profile is asymmetric — cleanup costs 30 minutes; a broken push during Strata's maintenance window costs trust.
