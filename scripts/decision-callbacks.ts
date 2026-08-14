#!/usr/bin/env tsx
/**
 * Decision-journal callback scanner.
 *
 * =============================================================================
 * Why this exists
 * =============================================================================
 * CLAUDE.md describes the callback loop as a MANUAL step: "During weekly Monday
 * review, scan `decisions.md` for entries where `status: open` AND
 * `check_back_date <= today`."
 *
 * That manual step is exactly what failed. The Phase 4 kill criterion passed its
 * date on 2026-06-27 and was not noticed until 2026-08-01 — five weeks late, and
 * found by accident while reading Railway logs for an unrelated reason
 * (`lessons.md` 2026-08-01). A process that depends on a human remembering to
 * run a scan is not "zero manual daily work"; it is a scan that will eventually
 * be skipped, and its failure is silent.
 *
 * This script makes the scan free to run and impossible to get wrong.
 *
 * =============================================================================
 * What it checks
 * =============================================================================
 * 1. OVERDUE   — decisions.md entries with `status: open` and a check_back_date
 *                on or before today. These owe a grading pass via
 *                `prompts/decision-journal.md` Mode B.
 * 2. UPCOMING  — open entries due within the next `--soon` days (default 14),
 *                so a callback is visible before it is late.
 * 3. UNTRACKED — dated commitments (`check_back_date`, `review_trigger`) living
 *                in files OTHER than decisions.md. This is the structural fix
 *                from the 2026-08-01 lesson: a dated commitment written in prose
 *                in some other file is invisible to the callback scan and WILL
 *                drift. Every hit here should get a stub entry in decisions.md
 *                whose only job is to be visible to this scan.
 *
 * Usage:  tsx scripts/decision-callbacks.ts [--soon <days>] [--root <path>]
 * Exit:   0 = nothing due, 1 = upcoming only, 2 = overdue and/or untracked.
 *
 * Failure mode: this script only reads. If the entry format in decisions.md
 * changes (entries start with `YYYY-MM-DD: ` at column 0, fields are `  - key:
 * value`), parsing silently finds fewer entries rather than erroring. The
 * `parsed N entries` line in the output is the guard — if that number drops
 * unexpectedly, the parser has drifted from the file format, not the file from
 * its commitments.
 */

import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";

type Entry = {
  date: string;
  summary: string;
  line: number;
  checkBack?: string;
  status?: string;
};

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Is this entry still awaiting a grade?
 *
 * Status values in decisions.md are free-form prose in practice, and two
 * grading conventions coexist:
 *   - grade embedded in status: `disproven (2026-05-11). assumption broke...`
 *   - grade in dedicated fields: `graded-disproven-2026-08-14` + `grade:` lines
 * and open entries sometimes carry a parenthetical update:
 *   `open (status update at T+35min from third settle 2026-05-12: ...)`
 *
 * Exact `=== "open"` matching missed that last shape entirely. Found 2026-08-14
 * by cross-checking this script's count against an independent parse: the
 * script said 15 overdue, the manual count said 16. An under-reporting callback
 * scanner is worse than none, because it looks authoritative while hiding the
 * very entry that has drifted longest.
 *
 * So: compare the FIRST token only, lowercased, punctuation trimmed.
 */
function isOpen(status: string | undefined): boolean {
  if (!status) return false;
  const first = status.trim().split(/[\s(,.:]/)[0].toLowerCase();
  return first === "open";
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysBetween(a: string, b: string): number {
  const da = new Date(a + "T00:00:00Z").getTime();
  const db = new Date(b + "T00:00:00Z").getTime();
  return Math.round((db - da) / 86_400_000);
}

/**
 * Parse decisions.md into entries.
 *
 * An entry begins at a line matching `YYYY-MM-DD: <summary>` at column 0 and
 * owns every subsequent `  - key: value` line until the next entry begins.
 * Values may carry trailing prose — `check_back_date: 2026-10-30 (90-day
 * callback)` is common — so the date is extracted by regex rather than by
 * taking the whole value.
 */
function parseDecisions(content: string): Entry[] {
  const entries: Entry[] = [];
  const lines = content.split(/\r?\n/);
  let current: Entry | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Entry heads are usually `YYYY-MM-DD: summary`, but several carry a
    // qualifier between the date and the colon — `2026-05-12 (Day 6, GET
    // /route): ...`. Without the optional-parenthetical group those lines are
    // not recognised as entry starts at all, and every field beneath them
    // (check_back_date, status, leading_indicator) is silently attributed to
    // the PRECEDING entry. Found 2026-08-14 when a grading pass surfaced an
    // entry whose summary and leading_indicator described different decisions.
    // Misattribution is worse than a miss: it makes the scanner confidently
    // wrong about which commitment is overdue.
    const head = line.match(/^(\d{4}-\d{2}-\d{2})(?:\s*\([^)]*\))?:\s*(.+)$/);
    if (head) {
      if (current) entries.push(current);
      current = { date: head[1], summary: head[2], line: i + 1 };
      continue;
    }
    if (!current) continue;

    const field = line.match(/^\s+-\s+([a-z_]+)\s*:\s*(.*)$/i);
    if (!field) continue;
    const key = field[1].toLowerCase();
    const value = field[2].trim();

    if (key === "check_back_date") {
      const d = value.match(/\d{4}-\d{2}-\d{2}/);
      if (d) current.checkBack = d[0];
    } else if (key === "status") {
      current.status = value.trim();
    }
  }
  if (current) entries.push(current);
  return entries;
}

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try { entries = readdirSync(dir); } catch { return out; }
  for (const e of entries) {
    if (e.startsWith(".") || e === "node_modules" || e === "exports" || e === "dist") continue;
    const full = join(dir, e);
    let st;
    try { st = statSync(full); } catch { continue; }
    if (st.isDirectory()) walk(full, out);
    else if (e.endsWith(".md")) out.push(full);
  }
  return out;
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + "…";
}

function main() {
  const args = process.argv.slice(2);
  const rootIdx = args.indexOf("--root");
  const root = rootIdx >= 0 ? args[rootIdx + 1] : process.cwd();
  const soonIdx = args.indexOf("--soon");
  const soon = soonIdx >= 0 ? parseInt(args[soonIdx + 1], 10) : 14;

  const today = todayIso();

  let content: string;
  try {
    content = readFileSync(join(root, "decisions.md"), "utf-8");
  } catch {
    console.error(`ERROR: decisions.md not found at ${root}`);
    process.exit(2);
  }

  const entries = parseDecisions(content);
  const open = entries.filter((e) => isOpen(e.status) && e.checkBack && ISO.test(e.checkBack));

  const overdue = open
    .filter((e) => e.checkBack! <= today)
    .sort((a, b) => a.checkBack!.localeCompare(b.checkBack!));
  const upcoming = open
    .filter((e) => e.checkBack! > today && daysBetween(today, e.checkBack!) <= soon)
    .sort((a, b) => a.checkBack!.localeCompare(b.checkBack!));

  // Dated commitments on surfaces the callback scan does not read.
  const untracked: string[] = [];
  for (const file of walk(root)) {
    const rel = relative(root, file).replace(/\\/g, "/");
    // decisions.md is the tracked surface itself; lessons.md quotes dates while
    // narrating past drift; prompts/ holds the decision-journal FORMAT TEMPLATE,
    // whose worked examples contain literal check_back_date values that are
    // instructional, not commitments. Scanning any of these produces permanent
    // false positives, and a checker with permanent false positives is one the
    // reader learns to skim past — the same failure this script exists to fix.
    if (rel === "decisions.md" || rel === "lessons.md" || rel.startsWith("prompts/")) continue;
    let text: string;
    try { text = readFileSync(file, "utf-8"); } catch { continue; }

    // Enrollment marker. Once a file's dated commitment has been copied into
    // decisions.md as a real entry, the file declares `callback_tracked_in:
    // decisions.md` and stops being reported here. Without this the scanner
    // would flag the same enrolled commitments on every run forever, which is
    // the permanent-false-positive failure the prompts/ exclusion also guards
    // against: an alarm that never clears is an alarm that stops being read.
    //
    // The marker is deliberately a claim the author makes, not something the
    // script verifies by matching text across files — the commitments are
    // prose and any matching heuristic would be brittle. The cost of a false
    // claim is one untracked commitment; the cost of brittle matching is a
    // scanner nobody trusts.
    if (/callback_tracked_in\s*:\s*decisions\.md/i.test(text)) continue;

    const re = /(check_back_date|review_trigger)\s*:?\s*(\d{4}-\d{2}-\d{2})/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const overdueMark = m[2] <= today ? "  <-- PAST DUE" : "";
      untracked.push(`${rel}: ${m[1]} ${m[2]}${overdueMark}`);
    }
  }

  console.log(`decision callbacks as of ${today} (parsed ${entries.length} entries, ${open.length} open with a date)\n`);

  if (overdue.length) {
    console.log(`OVERDUE (${overdue.length}) — grade via prompts/decision-journal.md Mode B:`);
    for (const e of overdue) {
      const late = daysBetween(e.checkBack!, today);
      console.log(`  [${late}d late] due ${e.checkBack}  (entry ${e.date}, decisions.md:${e.line})`);
      console.log(`      ${truncate(e.summary, 110)}`);
    }
    console.log("");
  }

  if (upcoming.length) {
    console.log(`UPCOMING within ${soon}d (${upcoming.length}):`);
    for (const e of upcoming) {
      console.log(`  in ${daysBetween(today, e.checkBack!)}d  due ${e.checkBack}  (entry ${e.date}, decisions.md:${e.line})`);
    }
    console.log("");
  }

  if (untracked.length) {
    console.log(`DATED COMMITMENTS OUTSIDE decisions.md (${untracked.length}) — these are invisible to this scan:`);
    for (const u of untracked) console.log(`  - ${u}`);
    console.log(`  Fix: add a stub entry in decisions.md (commitment, check_back_date, status: open).`);
    console.log("");
  }

  if (!overdue.length && !upcoming.length && !untracked.length) {
    console.log("nothing due, nothing upcoming, no untracked dated commitments.");
  }

  if (overdue.length || untracked.length) process.exit(2);
  if (upcoming.length) process.exit(1);
  process.exit(0);
}

main();
