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
      result[key] = stripQuotes(value);
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

  for (const file of files) {
    // Skip STANCE.md itself and the stance system internals.
    if (file.endsWith("STANCE.md")) continue;
    const rel = relative(root, file).replace(/\\/g, "/");
    if (rel.startsWith("stance/")) continue;

    let content: string;
    try { content = readFileSync(file, "utf-8"); } catch { continue; }
    const fm = parseFrontmatter(content);
    if (!fm || !fm.stance_version) continue;

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

  console.log(`\nstance check complete: ${softWarns} soft, ${hardFails} hard.`);
  if (hardFails > 0) process.exit(2);
  if (softWarns > 0) process.exit(1);
  process.exit(0);
}

main();
