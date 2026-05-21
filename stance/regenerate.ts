#!/usr/bin/env tsx
/**
 * Stance template renderer. Cross-project portable, zero npm dependencies.
 *
 * Reads templates from stance/templates/, renders each against STANCE.md
 * frontmatter, writes outputs to each template's `output_path` frontmatter field.
 *
 * Template syntax:
 *   {{key}}                        — substitute scalar from stance.
 *   {{item.field}}                 — substitute object property (in a loop).
 *   {{#each list as item}} ... {{/each}}    — iterate a list.
 *   {{#if condition}} ... {{/if}}  — render block if condition is truthy.
 *
 * Block tags (#each, #if) on their own line absorb the trailing newline so
 * block-on-own-line templates don't produce blank lines between iterations.
 *
 * Usage:   tsx stance/regenerate.ts [--root <path>] [--dry-run]
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from "fs";
import { join, dirname, relative } from "path";

// ---- Tiny YAML parser (duplicated from check-staleness.ts on purpose so each
// script is standalone-portable; copy either into a new project alone).

function parseFrontmatter(content: string): { fm: Record<string, any> | null; body: string } {
  // \r?\n tolerates Windows CRLF line endings — same fix pattern as
  // check-staleness.ts. Without this, regenerate.ts errors on Windows
  // checkouts with "STANCE.md missing frontmatter" even when the file
  // is structurally correct.
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { fm: null, body: content };
  const yaml = match[1];
  const body = match[2];
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
      result[key] = value.slice(1, -1).split(",").map((s) => stripQuotes(s.trim())).filter((s) => s.length > 0);
      currentList = null;
    } else {
      result[key] = stripQuotes(value);
      currentList = null;
    }
  }
  return { fm: result, body };
}

function parseInlineObject(inner: string): Record<string, string> {
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

// ---- Template engine -------------------------------------------------------

function resolvePath(ctx: any, path: string): any {
  return path.split(".").reduce((acc, key) => (acc == null ? undefined : acc[key]), ctx);
}

function render(template: string, ctx: Record<string, any>): string {
  let out = template;
  let prev: string;

  // {{#each list as item}} ... {{/each}}
  do {
    prev = out;
    out = out.replace(
      /\{\{#each\s+(\w+)\s+as\s+(\w+)\}\}\r?\n?([\s\S]*?)\{\{\/each\}\}\r?\n?/g,
      (_, listName, varName, body) => {
        const list = resolvePath(ctx, listName);
        if (!Array.isArray(list)) return "";
        return list.map((item) => render(body, { ...ctx, [varName]: item })).join("");
      }
    );
  } while (out !== prev);

  // {{#if condition}} ... {{/if}}
  do {
    prev = out;
    out = out.replace(
      /\{\{#if\s+([\w.]+)\}\}\r?\n?([\s\S]*?)\{\{\/if\}\}\r?\n?/g,
      (_, condPath, body) => {
        const val = resolvePath(ctx, condPath);
        return val ? body : "";
      }
    );
  } while (out !== prev);

  // {{key}} or {{item.field}}
  out = out.replace(/\{\{([\w.]+)\}\}/g, (_, path) => {
    const val = resolvePath(ctx, path);
    return val == null ? "" : String(val);
  });

  return out;
}

// ---- Main ------------------------------------------------------------------

function main() {
  const args = process.argv.slice(2);
  const rootIdx = args.indexOf("--root");
  const root = rootIdx >= 0 ? args[rootIdx + 1] : process.cwd();
  const dryRun = args.includes("--dry-run");

  let stanceContent: string;
  try {
    stanceContent = readFileSync(join(root, "STANCE.md"), "utf-8");
  } catch {
    console.error(`ERROR: STANCE.md not found at project root: ${root}`);
    process.exit(2);
  }
  const { fm: stance } = parseFrontmatter(stanceContent);
  if (!stance) {
    console.error("ERROR: STANCE.md missing frontmatter.");
    process.exit(2);
  }

  const templatesDir = join(root, "stance", "templates");
  if (!existsSync(templatesDir)) {
    console.log("No templates directory. Nothing to regenerate.");
    return;
  }

  let count = 0;
  for (const entry of readdirSync(templatesDir)) {
    if (!entry.endsWith(".template.md")) continue;
    const tplPath = join(templatesDir, entry);
    const tplContent = readFileSync(tplPath, "utf-8");
    const { fm: tplMeta, body: tplBody } = parseFrontmatter(tplContent);
    if (!tplMeta || !tplMeta.output_path) {
      console.warn(`  skip ${entry}: missing output_path in template frontmatter`);
      continue;
    }
    const outputPath = join(root, tplMeta.output_path);
    const rendered = render(tplBody, stance);
    if (dryRun) {
      console.log(`would write ${relative(root, outputPath)} (${rendered.length} bytes)`);
    } else {
      mkdirSync(dirname(outputPath), { recursive: true });
      writeFileSync(outputPath, rendered, "utf-8");
      console.log(`wrote ${relative(root, outputPath)}`);
    }
    count++;
  }

  console.log(`\nregenerated ${count} file${count === 1 ? "" : "s"}${dryRun ? " (dry-run)" : ""}.`);
}

main();
