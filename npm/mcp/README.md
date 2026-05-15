# @trustbench/mcp

Native MCP server for [TrustBench](https://trustbench.io) — a non-custodial routing and audit layer for x402 agent payments.

Adds three read-only tools to any MCP-capable host:

| Tool | What it does |
|---|---|
| `get_rankings` | Scored x402 provider list by capability. No API key. |
| `get_receipt` | Fetch any TrustBench receipt by ID (`rcpt_…` / `rrcpt_…`). No API key. |
| `verify_receipt` | Confirm Ed25519 signature + on-chain status. Two modes: lookup by ID, or offline verification of a receipt JSON. No API key. |

Works in **Claude Desktop, Claude Cowork, Grok** (xAI Connectors), **Kimi Code CLI**, **Cherry Studio**, **Cursor**, and any MCP-compatible host.

## Setup

Add to your host's MCP config file (e.g. `claude_desktop_config.json` for Claude Desktop, `~/.kimi/mcp.json` for Kimi):

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

Restart the host app. The three tools above become available immediately — no API key, no account required.

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `TRUSTBENCH_BASE_URL` | `https://trustbench.io` | Override the API base (useful for local dev). |

## What the tools return

**`get_rankings`** — JSON array of scored providers for the requested capability. Capabilities: `search`, `inference`, `data`, `media`, `infra`. Scores are derived from HEAD-probe liveness checks (3 samples from one host). See [trustbench.io/methodology](https://trustbench.io/methodology) for the full scoring formula.

**`get_receipt`** — Full signed receipt envelope. Receipts are immutable after issuance. Phase 3 IDs start with `rcpt_`, Phase 4 routing receipts start with `rrcpt_`.

**`verify_receipt`** — Two modes (provide exactly one input):

- **Lookup mode** (`receipt_id`) — fetches the receipt from `trustbench.io` and re-runs Ed25519 + on-chain verification. Useful when the agent only has an ID.
- **Offline mode** (`receipt_json`) — verifies a full `{receipt, signature}` envelope an agent received from a third party against the published public key, without trusting the database. The third-party-verifier path.

Both modes return a JSON summary with `signature_valid` (boolean), `on_chain_verified` (boolean where applicable), `signature_alg` (`ed25519`), and `pubkey_url`. For zero-network verification with no round-trip to TrustBench, use the [`@trustbench/verify-receipt`](https://www.npmjs.com/package/@trustbench/verify-receipt) npm package instead.

## Routing tools (v1.5)

`route_quote` and `route_settle` (the paid routing flow) require a `tb_live_…` API key and ship in the next release. Request access by DM'ing [@TrustBench on X](https://x.com/TrustBench).

## Technical details

- Transport: stdio (JSON-RPC 2.0) — the MCP standard
- No external dependencies beyond Node.js built-ins
- Node ≥ 18 required (uses native `fetch` and `readline`)
- Source: [github.com/lithvall/TrustBench](https://github.com/lithvall/TrustBench)

## Related packages

- [`@trustbench/verify-receipt`](https://www.npmjs.com/package/@trustbench/verify-receipt) — standalone offline Ed25519 receipt verifier
