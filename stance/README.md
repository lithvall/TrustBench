# Stance system

Project-state-as-single-source-of-truth, with drift detection and optional regeneration. Cross-project portable.

## What problem it solves

Every prompt, script, doc, and scheduled task in a project tends to encode assumptions about "what the project is right now" — current phase, named competitors, active partners, protocol, pricing model. When the project shifts, those embedded assumptions go stale silently. The artifacts read as confident and current; they're actually frozen images of an old reality.

The stance system fixes this by:

1. Centralizing project state in a single `STANCE.md` at the project root, with YAML frontmatter that's machine-readable.
2. Requiring every dependent artifact to declare which version of `STANCE.md` it was authored against (`stance_version` frontmatter).
3. Providing two enforcement modes:
   - **Light**: dependent artifacts self-flag at runtime when drift is detected. The check is `tsx stance/check-staleness.ts`.
   - **Heavy**: dependent artifacts are *generated* from templates that read `STANCE.md` at regeneration time. The renderer is `tsx stance/regenerate.ts`.

Light mode is the default discipline. Heavy mode is opt-in per artifact, best for artifacts whose content is largely derivable from stance data (indexes, listings, milestone feeds, JSON catalogs).

## Cross-project portability

This system has zero npm dependencies. To adopt it in a new project:

1. Copy this `stance/` directory to the new project root.
2. Create a `STANCE.md` at the new project root using the schema below.
3. Add a section to the new project's `CLAUDE.md` (or equivalent agent-instruction file) requiring `stance_version` frontmatter on stance-dependent artifacts.
4. Run `tsx stance/check-staleness.ts` at session start, in a weekly cron, or both.
5. Optional: add templates to `stance/templates/` for artifacts you want regenerated rather than self-flagged.

The schema's universal core is project-agnostic. Project-specific fields (like `protocol`, `chains`, `revenue_model`) extend the schema but are not required by the tooling.

## Schema

### `STANCE.md` YAML frontmatter

Required:

| Field | Type | Notes |
|---|---|---|
| `project` | string | Project name. |
| `date` | YYYY-MM-DD | Last stance update. Drift checks compare against this. |
| `revision` | int | Incremented on material stance change. |
| `phase` | string | Current phase / sprint / season label. |
| `pillars` | list of inline objects with `name` and `status` | Defensible positions. |
| `out_of_scope` | list of strings | What this project will NOT do. |

Optional (extend freely as project-specific):

`protocol`, `chains`, `custody`, `revenue_model`, `signing`, `active_competitors`, `active_partners`, `deferred_pivots`, `founder_shape`, `drift_soft_days`, `drift_hard_days`.

### Dependent artifact frontmatter

Required on any stance-versioned artifact:

| Field | Type | Notes |
|---|---|---|
| `stance_version` | YYYY-MM-DD | The `STANCE.md` `date` this artifact was authored against. |
| `stance_phase` | string | The `STANCE.md` `phase` this artifact was authored against. |
| `stance_pillars` | inline list of strings | Pillar names this artifact assumes are active. |

### Template frontmatter (heavy mode)

Required on any file in `stance/templates/`:

| Field | Type | Notes |
|---|---|---|
| `output_path` | string | Where the rendered output is written, relative to project root. |

Plus the dependent-artifact fields above (so the rendered output carries them through).

## Drift rules

Drift is detected when ANY of the following:

- `STANCE.md` `date` is more than `drift_soft_days` (default 14) past the artifact's `stance_version` → **soft warning**.
- `STANCE.md` `date` is more than `drift_hard_days` (default 30) past the artifact's `stance_version` → **hard fail**.
- `STANCE.md` `phase` differs from artifact's `stance_phase` → **hard fail**.
- `STANCE.md` pillar name set differs from artifact's `stance_pillars` set → **hard fail**.

Soft warning = "review at next opportunity." Hard fail = "STOP, refresh stance or refresh artifact."

`check-staleness.ts` exit codes: 0 = clean, 1 = soft only, 2 = hard fails present.

## When to use heavy vs. light

Use **light** (self-flagging frontmatter only) when:

- The artifact has substantive judgment / prose that won't survive templating.
- The artifact is updated rarely or only on stance change.
- A human author is the bottleneck on content quality.

Use **heavy** (templated, regenerated) when:

- The artifact is largely derivable from stance data (indexes, listings, feeds, JSON catalogs).
- The artifact is read by tools, not humans, or is a quick-reference summary.
- The artifact drifts silently and embarrassingly (e.g., a public listing that contradicts the current product).

In TrustBench's current setup, `competitive/COMPETITIVE-BRIEF.md` is light. `competitive/SEVERITIES.md` is heavy (generated from `stance/templates/SEVERITIES.template.md`).

## Files in this directory

- `README.md` — this file.
- `check-staleness.ts` — drift detector. Scans the project for stance-versioned files, reports drift.
- `regenerate.ts` — template renderer. Reads templates from `templates/`, writes outputs declared in each template's `output_path` frontmatter.
- `templates/*.template.md` — stance-driven artifact templates.

## YAML parser limitations

The parser used by both scripts is intentionally tiny (zero deps for cross-project portability). It supports:

- Top-level scalar fields: `key: value`.
- Inline lists: `key: [a, b, c]`.
- Lists of scalars or inline objects, indented with two spaces and `- ` prefix: `  - value` or `  - {key: val, key: val}`.

It does NOT support:

- Nested multi-line objects (`key:\n  subkey: val`). Use inline objects instead.
- Values containing literal commas inside inline objects. Quote them: `{name: "Some, Project", ...}`.
- Anchors, references, multi-line strings, or any other YAML feature.

If your schema needs more, swap in the `yaml` npm package — about 10 lines of change in each script, and otherwise drop-in.

## Template syntax (heavy mode)

The renderer supports three constructs:

```
{{key}}                          — substitute scalar value from stance.
{{item.field}}                   — substitute object property (inside a loop).
{{#each list as item}} ... {{/each}}   — iterate a list.
{{#if condition}} ... {{/if}}    — render block if condition is truthy.
```

That's it. No escaping, no helpers, no partials. The point is to be auditable: any user can read the renderer in 60 seconds and understand exactly what their template will do.

## Suggested workflow

- After updating `STANCE.md`, run `tsx stance/regenerate.ts` to refresh templated outputs.
- At session start on stance-relevant work, run `tsx stance/check-staleness.ts` and address any hard fails before continuing.
- Optionally: add to a weekly cron `tsx stance/check-staleness.ts || true` and review the output once a week.
- Add a `package.json` script if useful: `"stance:check": "tsx stance/check-staleness.ts"`, `"stance:gen": "tsx stance/regenerate.ts"`.
