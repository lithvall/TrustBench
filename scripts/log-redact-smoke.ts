/*
 * scripts/log-redact-smoke.ts — verification for src/log-redact.ts.
 *
 * Run: npx tsx scripts/log-redact-smoke.ts
 * Exits non-zero on any failure (matches the fail-loud pattern established in
 * commit 9a87664 for the prober).
 *
 * Fixtures mirror the SHAPE of real Railway log lines captured 2026-07-25 ->
 * 2026-08-01, but every credential value here is SYNTHETIC. Real third-party
 * keys are deliberately not committed — this repo is public, and pasting the
 * leaked values into a fixture would be a worse disclosure than the log line
 * this change removes.
 */

import { redactQueryValues } from '../src/log-redact.js';

// Synthetic stand-ins with the same shape as the real gateway values.
const FAKE_KEY = '00000000-1111-2222-3333-444444444444';
const FAKE_CONFIG = 'eyJkZWJ1ZyI6IGZhbHNlfQ%3D%3D';

type Case = {
  name: string;
  input: string;
  expect: string;
};

const CASES: Case[] = [
  {
    name: 'gateway incoming line — every sensitive value redacted, path kept',
    input: `<-- POST /mcp?config=${FAKE_CONFIG}&api_key=${FAKE_KEY}&profile=gougou`,
    expect: '<-- POST /mcp?config=<redacted>&api_key=<redacted>&profile=<redacted>',
  },
  {
    name: 'gateway outgoing line — status, ANSI colour and timing preserved',
    input: `--> POST /mcp?config=${FAKE_CONFIG}&api_key=${FAKE_KEY}&profile=gougou \x1b[32m200\x1b[0m 1ms`,
    expect: '--> POST /mcp?config=<redacted>&api_key=<redacted>&profile=<redacted> \x1b[32m200\x1b[0m 1ms',
  },
  {
    name: 'allowlisted param format=html survives',
    input: '<-- GET /rankings?format=html',
    expect: '<-- GET /rankings?format=html',
  },
  {
    name: 'allowlisted param capability survives',
    input: '<-- GET /rankings?capability=inference',
    expect: '<-- GET /rankings?capability=inference',
  },
  {
    name: 'mixed — allowlisted kept, unknown redacted',
    input: `<-- GET /rankings?format=json&api_key=${FAKE_KEY}`,
    expect: '<-- GET /rankings?format=json&api_key=<redacted>',
  },
  {
    name: 'no query string — line passes through untouched',
    input: '<-- POST /mcp',
    expect: '<-- POST /mcp',
  },
  {
    name: 'no query string, outgoing with timing — untouched',
    input: '--> GET / \x1b[32m200\x1b[0m 2s',
    expect: '--> GET / \x1b[32m200\x1b[0m 2s',
  },
  {
    name: 'value containing a literal = is fully redacted',
    input: '<-- GET /x?token=abc=def',
    expect: '<-- GET /x?token=<redacted>',
  },
  {
    name: 'empty value redacted (no bare credential slip-through)',
    input: '<-- GET /x?api_key=',
    expect: '<-- GET /x?api_key=<redacted>',
  },
  {
    name: 'param name casing does not bypass the allowlist check',
    input: `<-- GET /x?API_KEY=${FAKE_KEY}`,
    expect: '<-- GET /x?API_KEY=<redacted>',
  },
  {
    name: 'receipt path with format — real-world shape',
    input: '<-- GET /receipts/rcpt_01KQY7C44GAPSXZPFQYRZ1D10C?format=html',
    expect: '<-- GET /receipts/rcpt_01KQY7C44GAPSXZPFQYRZ1D10C?format=html',
  },
];

let failed = 0;
console.log('log-redact smoke\n' + '='.repeat(60));

for (const c of CASES) {
  const got = redactQueryValues(c.input);
  const ok = got === c.expect;
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${c.name}`);
  if (!ok) {
    console.log(`      input:    ${JSON.stringify(c.input)}`);
    console.log(`      expected: ${JSON.stringify(c.expect)}`);
    console.log(`      got:      ${JSON.stringify(got)}`);
  }
}

// Backstop: no UUID-shaped token may survive redaction in ANY case output.
// This is the assertion that actually encodes the security property — the
// per-case string equality above could drift, this cannot.
const UUID_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;
const leaked = CASES.map((c) => redactQueryValues(c.input)).filter((out) => UUID_RE.test(out));
console.log('-'.repeat(60));
if (leaked.length) {
  failed++;
  console.log(`FAIL  backstop: ${leaked.length} output(s) still contain a UUID-shaped token`);
  leaked.forEach((l) => console.log('      ' + l));
} else {
  console.log('PASS  backstop: no UUID-shaped token survives in any output');
}

console.log('='.repeat(60));
console.log(failed === 0 ? `ALL ${CASES.length + 1} CHECKS PASSED` : `${failed} CHECK(S) FAILED`);
process.exit(failed === 0 ? 0 : 1);
