#!/usr/bin/env tsx
/**
 * Stance drift detector. Cross-project portable, zero npm dependencies.
 *
 * Reads STANCE.md at the project root, scans for files with stance_version
 * frontmatter, reports drift against current stance.
 *
 * Usage:   tsx stance/check-staleness.ts [--root <path>]
 * Exit:    0 = clean, 1 = soft warnings only, 2 = hard fails present.
 */

import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";

// ---- Tiny YAML parser ------------------------------------------------------
// Supports: top-level scalars, inline lists ([a, b, c]), lists of scalars,
// lists of inline objects ({k: v, k: v}). NO nested multi-line objects.
// See stance/README.md § YAML parser limitations.

function parseFrontmatter(content: string): Record<string, any> | null {
  // \r?\n tolerates Windows CRLF line endings (git autocrlf converts on checkout
  // for Windows users; without this, STANCE.md on a Windows checkout fails the
  // regex and the script errors with "missing required frontmatter fields").
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return null;
  const yaml = match[1];
  const result: Record<string, any> = {};
  let currentList: any[] | null = null;
  for (const rawLine of yaml.split("\n")) {
    const line = rawLine.replace(/\s+$/, "");
    if (!line.trim() || line.trim().startsWith("#")) continue;
    if (line.startsWith("  - ")) {
      const item = line.slice(4).trim();
      if (!currentList) continue;
      if (item.startsWith("{") && item.endsWith("}")) {
        currentList.push(parseInlineObject(item.slice(1, -1)));
      } else {
        currentList.push(stripQuotes(item));
      }
      continue;
    }
    const m = line.match(/^([a-z_][a-z0-9_]*):\s*(.*)$/i);
    if (!m) continue;
    const key = m[1];
    const value = m[2].trim();
    if (value === "") {
      currentList = [];
      result[key] = currentList;
    } else if (value.startsWith("[") && value.endsWith("]")) {
      result[key] = value
        .slice(1, -1)
        .split(",")
        .map((s) => stripQuotes(s.trim()))
        .filter((s) => s.length > 0);
      currentList = null;
    } else {
      result[key] = stripQuotes(stripInlineComment(value));
      currentList = null;
    }
  }
  return result;
}

function parseInlineObject(inner: string): Record<string, string> {
  // Split on commas that are NOT inside quotes.
  const parts: string[] = [];
  let buf = "";
  let inQuote: string | null = null;
  for (const ch of inner) {
    if (inQuote) {
      if (ch === inQuote) inQuote = null;
      buf += ch;
    } else if (ch === '"' || ch === "'") {
      inQuote = ch;
      buf += ch;
    } else if (ch === ",") {
      parts.push(buf);
      buf = "";
    } else {
      buf += ch;
    }
  }
  if (buf.trim()) parts.push(buf);

  const obj: Record<string, string> = {};
  for (const pair of parts) {
    const idx = pair.indexOf(":");
    if (idx < 0) continue;
    const k = pair.slice(0, idx).trim();
    const v = pair.slice(idx + 1).trim();
    obj[k] = stripQuotes(v);
  }
  return obj;
}

// Strip a trailing YAML inline comment from a scalar value.
//
// YAML treats `#` as starting a comment only when it is at the start of the
// string or preceded by whitespace, and never inside a quoted scalar. The
// parser previously stripped only whole-line comments, so `key: value  # note`
// parsed as the literal value "value  # note". Any equality check against
// "value" then failed silently — which is exactly how the first
// `stance_frozen: true  # reason` attempt failed closed on 2026-08-14: the flag
// was present, correctly spelled, and simply ignored, with no error.
//
// Applied to top-level scalars only, NOT to list items: a list item can be an
// inline object whose quoted values may legitimately contain " #", and naive
// stripping would corrupt it.
function stripInlineComment(s: string): string {
  if (s.startsWith('"') || s.startsWith("'")) {
    const q = s[0];
    const end = s.indexOf(q, 1);
    return end >= 0 ? s.slice(0, end + 1) : s;
  }
  const idx = s.search(/(^|\s)#/);
  return idx < 0 ? s : s.slice(0, idx).trim();
}

function stripQuotes(s: string): string {
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  return s;
}

// ---- Drift helpers ---------------------------------------------------------

function daysBetween(a: string, b: string): number {
  const da = new Date(a + "T00:00:00Z").getTime();
  const db = new Date(b + "T00:00:00Z").getTime();
  return Math.floor((db - da) / (1000 * 60 * 60 * 24));
}

function walkDir(dir: string, files: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return files;
  }
  for (const entry of entries) {
    if (entry.startsWith(".")) continue;
    if (entry === "node_modules" || entry === "dist" || entry === "build") continue;
    const full = join(dir, entry);
    let stat;
    try { stat = statSync(full); } catch { continue; }
    if (stat.isDirectory()) walkDir(full, files);
    else if (entry.endsWith(".md") || entry.endsWith(".ts") || entry.endsWith(".js")) {
      files.push(full);
    }
  }
  return files;
}

// ---- Main ------------------------------------------------------------------

function main() {
  const args = process.argv.slice(2);
  const rootIdx = args.indexOf("--root");
  const root = rootIdx >= 0 ? args[rootIdx + 1] : process.cwd();

  // Read STANCE.md.
  let stanceContent: string;
  try {
    stanceContent = readFileSync(join(root, "STANCE.md"), "utf-8");
  } catch {
    console.error(`ERROR: STANCE.md not found at project root: ${root}`);
    process.exit(2);
  }
  const stance = parseFrontmatter(stanceContent);
  if (!stance || !stance.date || !stance.phase) {
    console.error("ERROR: STANCE.md missing required frontmatter fields (date, phase).");
    process.exit(2);
  }

  // Build the canonical pillar name set from STANCE.md.
  const stancePillarNames = new Set<string>();
  if (Array.isArray(stance.pillars)) {
    for (const p of stance.pillars) {
      if (typeof p === "object" && p && (p as any).name) stancePillarNames.add((p as any).name);
      else if (typeof p === "string") stancePillarNames.add(p);
    }
  }

  const softDays = parseInt(stance.drift_soft_days ?? "14", 10);
  const hardDays = parseInt(stance.drift_hard_days ?? "30", 10);

  // Walk the project and check every file with a stance_version frontmatter.
  const files = walkDir(root);
  let softWarns = 0;
  let hardFails = 0;
  const frozen: string[] = [];

  for (const file of files) {
    // Skip STANCE.md itself and the stance system internals.
    if (file.endsWith("STANCE.md")) continue;
    const rel = relative(root, file).replace(/\\/g, "/");
    if (rel.startsWith("stance/")) continue;

    let content: string;
    try { content = readFileSync(file, "utf-8"); } catch { continue; }
    const fm = parseFrontmatter(content);
    if (!fm || !fm.stance_version) continue;

    // Frozen artifacts (added 2026-08-14).
    //
    // Some stance-versioned files are point-in-time records: assessments,
    // signal captures, dated audits, dated roadmaps, sent outreach drafts.
    // Their stance_version documents WHEN they were authored — it is not a
    // claim that their contents describe current stance. Re-stamping them to
    // the current stance would misrepresent their authorship date and destroy
    // exactly the audit value they exist for.
    //
    // But leaving them unmarked means they report as HARD fails on every run,
    // forever, and grow in number over time. A checker that always reports
    // failures trains the reader to ignore its output — at which point a REAL
    // drift on a live artifact goes unnoticed. That is the failure mode this
    // flag prevents.
    //
    // `stance_frozen: true` means "deliberately historical, do not grade."
    // Frozen files are skipped from drift scoring but are still listed and
    // counted in the summary, so freezing stays visible and cannot be used to
    // quietly silence a live artifact that should have been refreshed. If you
    // find yourself adding this flag to something that still drives decisions
    // (a scan prompt, a live brief, a runbook), that is the wrong fix: refresh
    // the artifact instead.
    if (fm.stance_frozen === "true" || (fm.stance_frozen as unknown) === true) {
      frozen.push(`${rel} (authored against stance ${fm.stance_version})`);
      continue;
    }

    const issues: string[] = [];
    let isHard = false;

    // Date drift.
    const drift = daysBetween(fm.stance_version, stance.date);
    if (drift >= hardDays) {
      issues.push(`stance_version ${fm.stance_version} is ${drift}d behind STANCE.md ${stance.date} (>=${hardDays}d HARD)`);
      isHard = true;
    } else if (drift >= softDays) {
      issues.push(`stance_version ${fm.stance_version} is ${drift}d behind STANCE.md ${stance.date} (>=${softDays}d soft)`);
    }

    // Phase mismatch.
    if (fm.stance_phase && fm.stance_phase !== stance.phase) {
      issues.push(`stance_phase "${fm.stance_phase}" != STANCE.md phase "${stance.phase}"`);
      isHard = true;
    }

    // Pillar mismatch.
    if (Array.isArray(fm.stance_pillars)) {
      const filePillars = new Set<string>(fm.stance_pillars);
      const missing = [...filePillars].filter((p) => !stancePillarNames.has(p));
      const added = [...stancePillarNames].filter((p) => !filePillars.has(p));
      if (missing.length || added.length) {
        issues.push(
          `pillar set differs: file=[${[...filePillars].join(", ")}], STANCE.md=[${[...stancePillarNames].join(", ")}]`
        );
        isHard = true;
      }
    }

    if (issues.length) {
      if (isHard) hardFails++;
      else softWarns++;
      console.log(`${isHard ? "HARD" : "soft"}: ${rel}`);
      for (const i of issues) console.log(`  - ${i}`);
    }
  }

  // Frozen artifacts are listed rather than silently dropped: the count is the
  // guard against this flag being used to mute live artifacts (see the comment
  // at the frozen check above).
  if (frozen.length) {
    console.log(`\nfrozen (point-in-time records, not graded):`);
    for (const f of frozen) console.log(`  - ${f}`);
  }

  console.log(
    `\nstance check complete: ${softWarns} soft, ${hardFails} hard, ${frozen.length} frozen.`,
  );
  if (hardFails > 0) process.exit(2);
  if (softWarns > 0) process.exit(1);
  process.exit(0);
}

main();
