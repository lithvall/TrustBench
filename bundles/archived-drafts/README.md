# Archived Bundle Drafts — DISPROVEN

This directory contains historical drafts of TrustBench bundles that were superseded during the bundle-authoring iteration of 2026-05-17 through 2026-05-19. **These drafts are preserved for context, not for use.**

## Archive policy

The files in this directory are **DISPROVEN drafts**. They should not be referenced when:

- Writing new bundles
- Answering questions about current TrustBench bundle structure
- Recommending bundle patterns to partners or readers
- Composing outreach that references "the TrustBench bundle"
- Any live or forward-looking task

They MAY be referenced when:

- Documenting the iteration history (e.g., lessons-learned, decisions journal, retrospectives)
- Disproving an approach someone is suggesting that resembles one of these drafts
- Providing historical context to a future session that needs to understand "why we don't do X"

The canonical TrustBench bundle is at `bundles/receipt-backed-agent-to-agent-procurement.md`. If that file is itself ever superseded, archive it here following the same naming + header convention.

## Files in this archive

Each file has a top-of-file "⛔ ARCHIVED — DISPROVEN DRAFT ⛔" banner stating status, why disproven, what supersedes it, and the appropriate use case. The banners are deliberately heavy-handed so a scanning reader cannot miss the status. If you find yourself wanting to remove the banners, stop — that signals the file should be deleted entirely or rehabilitated through a fresh iteration, not silently re-promoted.

### `2026-05-19-v2-verified-market-research.md`

The original "Verified Market Research" bundle that went through two rounds of critique. Disproven for: misleading "Verified" branding, broken `verify_command` shell, self-contradictory "no fourth category" failure-taxonomy section, self-referential Anthropic worked example, premature reference to unbuilt `/verify` endpoint, internal stance-versioning frontmatter leaking to public artifact.

### `2026-05-19-v3-option-1-auditable-market-research.md`

The Option 1 path: keep market-research as topic, fix all v2 correctness bugs. Disproven for the topic itself — both 2026-05-19 critique rounds concluded that market research has no native audit consumer, so the receipt primitive is "searching for a workflow" rather than load-bearing. Correctness fixes were valid; the topic was not.

### `2026-05-19-v3-option-2-receipted-agent-to-agent-procurement.md`

The Option 2 path: new bundle on a topic where the audit consumer is structurally present (Agent A delegates to Agent B). This version was picked over Option 1 by both 2026-05-19 critics but flagged for required v4 edits before publishing: rename, kill "cryptographic proof" overclaim, out-of-scope the delegation mechanism, add omission + response-tampering attack vectors, replace happy-path-only example with mixed states, reframe completeness via Base wallet visibility, refine `settled_no_result` ambiguity, fix `intentionally_skipped` semantics. Superseded by v4.

## Reference trail

For the strategic context behind this iteration, see:

- `SIGNAL-2026-05-17-agenticmarket-bundles.md` — the strategic signal that triggered bundle authoring
- `lessons.md` 2026-05-18 entry — the cross-agent-disagreement lesson learned during this iteration
- The conversation history in the cowork-mode session that produced these drafts (not persisted in repo)

## How to extend this archive

If a future iteration supersedes the current canonical bundle:

1. Move the current canonical to this directory with a `YYYY-MM-DD-` date prefix.
2. Add the "⛔ ARCHIVED — DISPROVEN DRAFT ⛔" banner at the top with: status, archived date, why disproven, superseded-by path, use-case-for-this-archive line, origin reference.
3. Update this README with the new file entry.
4. Make sure `lessons.md` or `decisions.md` captures the reason if the supersession involves a non-obvious lesson.
