# Anthropic Connectors Directory — Submission Brief
## TrustBench Remote MCP

**Submit at:** https://clau.de/mcp-directory-submission  
**Type:** Remote MCP server (Streamable HTTP, hosted at trustbench.io)  
**Date prepared:** 2026-05-14 (updated post-Railway-redeploy)

---

## Prerequisites — both complete ✓

- ✓ `@trustbench/mcp` v1.0.4 published to npm (annotations live)
- ✓ `POST https://trustbench.io/mcp` live (Streamable HTTP endpoint, commit `725c9e2`)

---

## Verify endpoint is live (PowerShell)

```powershell
Invoke-WebRequest -Uri "https://trustbench.io/mcp" -Method POST `
  -Headers @{"Content-Type"="application/json"} `
  -Body '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","clientInfo":{"name":"test","version":"1.0"}}}' | Select-Object -ExpandProperty Content
```

Expected response:
```json
{"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"2024-11-05","capabilities":{"tools":{}},"serverInfo":{"name":"trustbench","version":"1.0.4"}}}
```

---

## Form fields — ready to paste

### Page 1 — Server basics

| Field | Value |
|---|---|
| **Server name** | TrustBench |
| **Tagline** | Signed receipts + spend caps + idempotency for x402 agent payments |
| **Description** | TrustBench is a non-custodial routing and audit layer for x402 agent payments. It adds Ed25519-signed receipts, server-enforced spend caps, and idempotency keys on top of any x402 paid API call. Agents can look up live-scored x402 providers by capability, fetch immutable payment receipts by ID, and verify Ed25519 signatures — no API key, no installation required. |
| **Website URL** | https://trustbench.io |
| **Category** | Developer Tools / Finance & Payments |
| **Logo** | https://trustbench.io/logo.png (or /logo.svg) |

---

### Page 2 — Connection details

| Field | Value |
|---|---|
| **Server URL (Universal URL)** | `https://trustbench.io/mcp` |
| **Transport** | Streamable HTTP |
| **Auth type** | None (all v1 tools are read-only, no API key required) |
| **Auth Client ID / Static Client ID** | Leave blank — no OAuth, no auth |
| **Client secret** | Leave blank — no auth required |

---

### Page 3 — Capabilities

| Field | Value |
|---|---|
| **Read capabilities** | Yes — reads provider rankings and payment receipts from trustbench.io |
| **Write capabilities** | No — all three tools are read-only (`readOnlyHint: true`, `destructiveHint: false`) |
| **Connection requirements** | None — fully hosted, no local installation or Node.js required |

---

### Page 4 — Tools (3 total, all read-only, no API key)

#### 1. `get_rankings` — Get ranked x402 providers by capability
- **Input:** `capability` (enum: search, inference, data, media, infra)
- **Output:** Scored list of providers with latency and success-rate telemetry
- **Annotations:** `readOnlyHint: true`, `destructiveHint: false`, `openWorldHint: true`

#### 2. `get_receipt` — Fetch a payment receipt by ID
- **Input:** `receipt_id` (string, e.g. `rcpt_01KQY7C44GAPSXZPFQYRZ1D10C`)
- **Output:** Full Ed25519-signed receipt JSON with on-chain settlement reference
- **Annotations:** `readOnlyHint: true`, `destructiveHint: false`, `idempotentHint: true`, `openWorldHint: true`

#### 3. `verify_receipt` — Verify a receipt's Ed25519 signature
- **Input:** `receipt_id` (string)
- **Output:** `signature_valid` status, `on_chain_verified` status, verification URLs
- **Annotations:** `readOnlyHint: true`, `destructiveHint: false`, `idempotentHint: true`, `openWorldHint: true`

---

### Page 5 — Documentation & support

| Field | Value |
|---|---|
| **Docs / setup guide** | https://trustbench.io (or https://github.com/lithvall/TrustBench) |
| **Privacy policy** | https://trustbench.io/privacy |
| **Support channel** | https://github.com/lithvall/TrustBench/issues |
| **Source** | https://github.com/lithvall/TrustBench/blob/main/src/mcp-http.ts |

> **Privacy note for form:** The TrustBench MCP server makes outbound read-only HTTP requests to trustbench.io on behalf of the agent. It does not collect, store, or transmit any user data. No credentials, agent wallet addresses, or conversation content are ever sent to TrustBench servers. Receipt IDs queried via `get_receipt` or `verify_receipt` are public identifiers with no PII.

---

### Page 6 — Reviewer test instructions

No account needed — all tools are public and unauthenticated.

**Step-by-step for a reviewer:**

1. Connect to `https://trustbench.io/mcp` as a Remote MCP in Claude.ai (Settings → Integrations → Add MCP Server). No API key needed.
2. Three tools appear: `get_rankings`, `get_receipt`, `verify_receipt`.
3. Test `get_rankings` — ask: *"What are the top x402 inference providers?"* → Claude calls `get_rankings({ capability: "inference" })` and returns a live ranked list.
4. Test `get_receipt` — ask: *"Fetch TrustBench receipt rcpt_01KQY7C44GAPSXZPFQYRZ1D10C"* → returns the first live x402 payment receipt from 2026-05-06.
5. Test `verify_receipt` with the same ID — confirms `signature_valid: true` and `on_chain_verified: true`.

---

### Data & compliance checklist

- [x] Complies with Anthropic Software Directory Terms
- [x] Complies with Anthropic Software Directory Policy
- [x] All tools have `readOnlyHint` and `destructiveHint` annotations (v1.0.4+)
- [x] No OAuth / no auth required (read-only, public endpoints)
- [x] HTTPS transport (`https://trustbench.io/mcp`)
- [x] No PII collected or transmitted
- [x] Public documentation available (trustbench.io + GitHub)
- [x] Source code publicly auditable (MIT license, GitHub)
- [x] Streamable HTTP transport (MCP 2024-11-05 spec)
- [x] Returns 204 for notifications/initialized (no response body)
- [x] Never returns 500 — tool errors surface as content strings in the result

---

## After submitting

- Average review time: ~2 weeks
- For updates to an already-listed server: email mcp-review@anthropic.com
- If rejected for missing privacy page: add `/privacy` to trustbench.io
- If rejected for tool annotations: already in v1.0.4 — point reviewer to https://trustbench.io/mcp (tools/list response includes annotations)
