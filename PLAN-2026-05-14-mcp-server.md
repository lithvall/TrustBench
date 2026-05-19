# TrustBench MCP Server — Plan

**Created:** 2026-05-14
**Status:** Proposed — awaiting Johan approval before coding starts
**Target:** Runnable MCP server that Claude Desktop / Cowork / Cherry Studio / ChatGPT users can install in under 2 minutes with no HTTP-fetch workaround
**Effort estimate:** 1 focused day (4–6 hours) for MVP; 1 additional day to publish as npm package

---

## Why this, why now

**The promise is already made.** `skill.md` says: *"Native TrustBench paid-tool support for chat-app hosts is in the next sprint, for now use the host's HTTP-fetch capability."* That line went live to any agent reading the skill file on 2026-05-13. The next sprint is now.

**The /mcp/tools endpoint is not an MCP server.** `src/index.ts` line 419 serves a JSON schema descriptor at `/mcp/tools`. That's a discovery catalog, not an implementation of the Model Context Protocol. Claude Desktop cannot connect to it. Chat-app users currently navigate a multi-step HTTP-fetch workaround documented in `skill.md` — a workaround that discards most of the value of the MCP setup path.

**Competitor signal.** `phase6-beyond-strategy.md` notes Nava Labs ($8.3M seed, April 2026) ships an MCP server as a core integration surface. They're custodial; TrustBench is not. But if the non-custodial player doesn't have native MCP and the custodial player does, the integration path for chat-app users favors Nava regardless of architectural preference.

**Directory position closes early.** Anthropic's MCP connector directory, agentic.market, and Claude Desktop plugin registries favor early-mover listings. The install surface (npx + config snippet) is identical for every tool in the ecosystem — standing it up now costs 1 day; waiting costs directory rank.

**Calibration check (solo-founder lens):**
- Capital: zero infra cost — stdio transport runs in the user's local process, no Railway service needed for v1.
- Energy: ~1 day, the MCP SDK is well-documented, and TrustBench's REST API is the implementation.
- Boredom check: not a multi-month deal; ships in a morning.
- Regulatory/reputation risk: read-only tools first — no custody, no payment construction in v1.

---

## What to build

### V1 scope — read-only tools (the safe, fast path)

Three tools that require no API key and expose TrustBench's public surfaces natively to any MCP host:

| Tool name | Maps to | What it does |
|---|---|---|
| `get_rankings` | `GET /rankings?capability=<cap>` | Returns scored provider list for a capability. No auth. Cached. |
| `get_receipt` | `GET /receipts/:id` | Fetches a specific routing or settling receipt by ID. No auth. Immutable. |
| `verify_receipt` | Local Ed25519 check + `GET /receipts/:id` | Verifies signature on a receipt JSON the agent already has. Offline-capable. |

These three are enough to make TrustBench useful to a Claude Desktop user who wants to: (a) find providers, (b) look up a receipt after a paid call, (c) verify a receipt someone sent them.

No API key required in v1. No payment construction. No custody surface. Zero regulatory risk.

### V1.5 scope — routing tools (add after v1 ships, with API key)

Two additional tools behind `TRUSTBENCH_API_KEY` env var:

| Tool name | Maps to | What it does |
|---|---|---|
| `route_quote` | `POST /route` | Get a payment quote + x402 challenge for a capability. Requires API key. |
| `route_settle` | `POST /route/settle` | Submit the signed X-PAYMENT to settle. Requires API key. |

These mirror the existing REST flow exactly. No new logic, just MCP tool wrappers.

---

## Implementation plan

### Step 1 — Install the MCP SDK (5 minutes)

```powershell
npm install @modelcontextprotocol/sdk
```

The official Anthropic TypeScript SDK. Handles protocol framing, transport, tool registration, and error marshalling. No need to hand-roll any MCP wire format.

### Step 2 — Create `src/mcp-server.ts` (~150 lines)

Single file. Stdio transport (standard for Claude Desktop and most MCP hosts). Structure:

```typescript
// src/mcp-server.ts
// TrustBench MCP server — exposes rankings, receipt lookup, and receipt
// verification as agent-callable MCP tools over stdio transport.
//
// Run: npx tsx src/mcp-server.ts
// Claude Desktop config: { "command": "npx", "args": ["-y", "@trustbench/mcp"] }
//
// Failure mode: if TRUSTBENCH_BASE_URL is missing, tools return a clear
// error message; the server does not crash. Read-only tools never touch
// payment surfaces, so misconfiguration cannot move funds.

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const BASE_URL = process.env.TRUSTBENCH_BASE_URL ?? "https://trustbench.io";
```

Then register the three tools using `server.setRequestHandler(ListToolsRequestSchema, ...)` and `server.setRequestHandler(CallToolRequestSchema, ...)`. Each tool handler calls the relevant TrustBench REST endpoint using `fetch`, parses the JSON, and returns the result as MCP tool output.

The whole thing is ~120–150 lines. Reference: the `@modelcontextprotocol/sdk` README has a minimal working example at this size.

### Step 3 — Add npm script entry to `package.json`

```json
"scripts": {
  "mcp": "tsx src/mcp-server.ts"
}
```

And a `bin` entry if publishing as a package:

```json
"bin": {
  "trustbench-mcp": "./dist/mcp-server.js"
}
```

### Step 4 — Write `scripts/mcp-smoke.ts` (~30 lines)

Smoke test that:
1. Calls `get_rankings` with `capability: "inference"` — expects a non-empty array.
2. Calls `get_receipt` with a known receipt ID (e.g. `rcpt_01KQY7C44GAPSXZPFQYRZ1D10C`) — expects `signature_valid: true`.
3. Calls `verify_receipt` with the same receipt JSON — expects Ed25519 check passes.

Run with: `npx tsx scripts/mcp-smoke.ts`

### Step 5 — Claude Desktop config snippet for `skill.md`

Replace the current HTTP-fetch workaround section in `skill.md` with:

```json
{
  "mcpServers": {
    "trustbench": {
      "command": "npx",
      "args": ["-y", "@trustbench/mcp"]
    }
  }
}
```

Or, if not yet published to npm, the local variant:

```json
{
  "mcpServers": {
    "trustbench": {
      "command": "npx",
      "args": ["tsx", "/path/to/TrustBench/src/mcp-server.ts"]
    }
  }
}
```

Plain-language instruction to accompany this (following skill.md tone rules — no "MCP server", no "stdio", no "JSON"):

> To use TrustBench tools inside Claude Desktop or Cowork, add TrustBench to your tools settings. Copy the block below into your Claude settings under "Connected tools". Once added, Claude can look up providers, check receipts, and verify payments without any extra steps.

### Step 6 — Publish as `@trustbench/mcp` on npm (optional but recommended)

Mirrors the `@trustbench/verify-receipt` pattern already shipped. Gives users a one-line install surface. Steps:

1. Add a minimal `package.json` in a `packages/mcp/` subdirectory (or build from root via the existing `tsconfig.json`).
2. `npm publish --access public` from the `packages/mcp/` dir.
3. Update `skill.md` to use the `npx -y @trustbench/mcp` form.

This step can wait until after the local version is smoke-tested. Don't publish before smoke passes.

---

## Files to create / modify

| Action | File | Notes |
|---|---|---|
| CREATE | `src/mcp-server.ts` | The MCP server. ~150 lines. |
| CREATE | `scripts/mcp-smoke.ts` | Smoke test for the three tools. ~30 lines. |
| MODIFY | `skill.md` | Replace HTTP-fetch workaround with config snippet + plain-language install step. |
| MODIFY | `package.json` | Add `"mcp": "tsx src/mcp-server.ts"` script. Add `@modelcontextprotocol/sdk` to dependencies. |
| MODIFY | `README.md` | Add "Claude Desktop / MCP" section with the config snippet. |
| LATER | `packages/mcp/` or npm publish | Only after smoke passes. |

Do NOT modify `src/index.ts` for this task. The existing `/mcp/tools` endpoint stays as-is — it's a useful machine-readable catalog even if it's not an MCP transport.

---

## Failure modes (per CLAUDE.md high-risk checklist)

This task does not touch payment construction, signing keys, or idempotency locks — it is read-only REST wrapping. Low risk surface. The two failure modes worth naming:

**1. MCP SDK version mismatch.** The MCP protocol has versioned handshakes. If the installed SDK version doesn't match what Claude Desktop expects, tools won't appear. Mitigation: pin to the latest stable `@modelcontextprotocol/sdk` at install time; don't use `latest` in package.json — pin the exact version.

**2. `TRUSTBENCH_BASE_URL` misconfigured.** If an operator points the env var at a stale domain, tools return errors. Mitigation: the server defaults to `https://trustbench.io` and logs a boot-time message if the env var is absent. No crash, clear error text in tool responses.

---

## Where this sits in the roadmap

This task is **between Phase 4 listing (shipped 2026-05-13) and the Strata integration (~2026-05-19)**. It is:

- Independent of the Strata `§10` reference-agent integration (different surface).
- Independent of the P4-3 Solana routing work.
- A prerequisite for the `skill.md` MCP path being honest (the current text promises "next sprint"; this closes that promise).
- A natural extension of the `@trustbench/verify-receipt` npm package pattern — same principle, different delivery mechanism.

It does not need to block any other Phase 4 work. It can ship in a single day and then sit live while Strata/v2-header work continues in parallel.

---

## Decision Journal entry (if approved)

```
date: 2026-05-14
decision: Ship TrustBench MCP server v1 (read-only tools: get_rankings, get_receipt, verify_receipt) as src/mcp-server.ts + @trustbench/mcp npm package.
load_bearing_assumption: Claude Desktop / Cowork / ChatGPT users actually install MCP servers from npm and find them via skill.md config snippets — the friction of the npx install is lower than the current HTTP-fetch workaround.
leading_indicator: At least one external agent or user reports using the MCP tools (X mention, GitHub issue, or direct message) within 30 days of shipping.
check_back_date: 2026-06-14
status: open
```

---

## Tomorrow morning (2026-05-14) — exact sequence

1. `npm install @modelcontextprotocol/sdk` — confirm it installs cleanly.
2. Read the SDK README (5 min) — look at the minimal stdio server example.
3. Write `src/mcp-server.ts` — 3 tools, stdio transport, `fetch` to trustbench.io.
4. `tsc --noEmit` — clean.
5. Run `npm run mcp` in one terminal, run a manual MCP client call (or `scripts/mcp-smoke.ts`) in another.
6. Update `skill.md` — replace HTTP-fetch section with config snippet.
7. Update `README.md` — add Claude Desktop setup section.
8. Commit: `feat: add MCP server with get_rankings, get_receipt, verify_receipt tools`.
9. (Optional same day) Publish `@trustbench/mcp` to npm — same pattern as `@trustbench/verify-receipt`.
