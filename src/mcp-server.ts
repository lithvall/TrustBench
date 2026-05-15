#!/usr/bin/env node
/**
 * TrustBench MCP Server
 *
 * Exposes TrustBench's public registry and receipt surfaces as native
 * Model Context Protocol tools, so agents running in Claude Desktop,
 * Claude Cowork, ChatGPT, Cherry Studio, or any MCP-capable host can
 * query providers, fetch receipts, and verify signatures without an
 * HTTP-fetch workaround.
 *
 * Transport: stdio (JSON-RPC 2.0 over stdin/stdout — the MCP standard).
 * No external MCP SDK dependency: the protocol is pure JSON-RPC 2.0 and
 * small enough to implement directly, keeping the dependency surface at
 * zero and making the wire format fully auditable.
 *
 * Tools exposed (v1 — read-only, no API key required):
 *   • get_rankings   — query scored providers by capability
 *   • get_receipt    — fetch a receipt by ID (rcpt_ or rrcpt_)
 *   • verify_receipt — confirm Ed25519 signature validity on a receipt
 *
 * Routing tools (route_quote, route_settle) are v1.5 — add after v1 ships.
 *
 * Claude Desktop / Grok / Kimi config (add to claude_desktop_config.json
 * or your host's equivalent MCP settings file):
 * {
 *   "mcpServers": {
 *     "trustbench": {
 *       "command": "npx",
 *       "args": ["-y", "@trustbench/mcp"]
 *     }
 *   }
 * }
 *
 * To run from a local clone instead:
 *   npx tsx src/mcp-server.ts
 *
 * Failure mode: if TRUSTBENCH_BASE_URL is misconfigured, tool calls return
 * a descriptive error string in the content array — the server never crashes
 * and never touches a payment surface. All tools are read-only.
 */

import { createInterface } from 'node:readline';
// TOOLS array is single-sourced in mcp-tools.ts so the hosted HTTP endpoint
// (src/mcp-http.ts) and this stdio server always advertise identical schemas.
// Handler logic differs: this server calls the external trustbench.io API via
// fetch() because it runs as a subprocess without access to the Hono app's
// Supabase client. See mcp-tools.ts for the internal-import equivalents.
import { TOOLS } from './mcp-tools.js';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const BASE_URL = (process.env.TRUSTBENCH_BASE_URL ?? 'https://trustbench.io').replace(/\/$/, '');
const SERVER_NAME = 'trustbench';
const SERVER_VERSION = '1.0.4';
const PROTOCOL_VERSION = '2024-11-05';

// ---------------------------------------------------------------------------
// Tool handlers
// ---------------------------------------------------------------------------

async function handleGetRankings(args: Record<string, unknown>): Promise<string> {
  const capability = args['capability'] as string;
  if (!capability) return 'Error: capability is required.';

  const url = `${BASE_URL}/rankings?capability=${encodeURIComponent(capability)}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) return `Error fetching rankings: HTTP ${res.status} from ${url}`;

  const data = await res.json();
  return JSON.stringify(data, null, 2);
}

async function handleGetReceipt(args: Record<string, unknown>): Promise<string> {
  const id = args['receipt_id'] as string;
  if (!id) return 'Error: receipt_id is required.';

  // Sanitise: only alphanumeric, underscores, hyphens
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) return 'Error: invalid receipt_id format.';

  const url = `${BASE_URL}/receipts/${id}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (res.status === 404) return `No receipt found for ID: ${id}`;
  if (!res.ok) return `Error fetching receipt: HTTP ${res.status} from ${url}`;

  const data = await res.json();
  return JSON.stringify(data, null, 2);
}

/**
 * Verify a receipt — two modes (matches src/mcp-tools.ts handler).
 *
 *   Mode 1 — Lookup: args.receipt_id → fetch via GET /receipts/:id, surface
 *            the verification fields the live endpoint already computes.
 *   Mode 2 — Offline: args.receipt_json → POST to /verify (or to the
 *            HTTP MCP endpoint at /mcp using verify_receipt) so the server
 *            verifies the supplied envelope. Stdio clients can't use
 *            in-process Ed25519 here without dragging the noble crypto
 *            dependency into this minimal-deps subprocess; routing through
 *            HTTP keeps the package zero-dependency. For truly offline
 *            verification with zero network use @trustbench/verify-receipt.
 *
 * Failure mode: if the chain RPC fails, signature_valid is still meaningful;
 * on_chain_verified falls back to false. Inverted-truthiness bug fix
 * (2026-05-15): the prior `data['signature_valid'] ?? data['signature_alg']
 * ? '...' : 'unknown'` parsed as `?? (ternary)` and lost the false signal.
 * The server now uses the `signature_valid` boolean directly when present.
 */
async function handleVerifyReceipt(args: Record<string, unknown>): Promise<string> {
  const id = args['receipt_id'] as string | undefined;
  const json = args['receipt_json'] as Record<string, unknown> | undefined;

  if (!id && !json) return 'Error: provide either receipt_id (lookup mode) or receipt_json (offline mode).';
  if (id && json) return 'Error: receipt_id and receipt_json are mutually exclusive — pass exactly one.';

  // Mode 2 — Offline: forward the envelope to the HTTP MCP endpoint so the
  // hosted server runs the same Ed25519 + on-chain verification it would for
  // any other call to verify_receipt. Keeps this stdio package dependency-free.
  if (json) {
    const url = `${BASE_URL}/mcp`;
    const body = {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'verify_receipt', arguments: { receipt_json: json } },
    };
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) return `Error verifying receipt envelope: HTTP ${res.status} from ${url}`;
    const rpc = await res.json() as { result?: { content?: Array<{ text?: string }> }; error?: unknown };
    if (rpc.error) return `Error: ${JSON.stringify(rpc.error)}`;
    return rpc.result?.content?.[0]?.text ?? 'Error: empty MCP response.';
  }

  // Mode 1 — Lookup: receipt_id only.
  if (!/^[a-zA-Z0-9_-]+$/.test(id!)) return 'Error: invalid receipt_id format.';

  const url = `${BASE_URL}/receipts/${id}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (res.status === 404) return `No receipt found for ID: ${id}`;
  if (!res.ok) return `Error fetching receipt: HTTP ${res.status}`;

  const data = await res.json() as Record<string, unknown>;

  // Use signature_valid directly when present (it's the boolean the live
  // endpoint already computed via getOrComputeVerifyResults). Falling back
  // to the older "(see full receipt)" string only if the field is absent.
  const sigValid =
    typeof data['signature_valid'] === 'boolean'
      ? data['signature_valid']
      : (data['signature_alg'] ? '(see full receipt)' : 'unknown');
  const onChain =
    typeof data['on_chain_verified'] === 'boolean'
      ? data['on_chain_verified']
      : (data['on_chain_verified'] ?? 'not checked by server');

  const summary = {
    receipt_id: id,
    mode: 'lookup',
    signature_valid: sigValid,
    on_chain_verified: onChain,
    signature_alg: data['signature_alg'] ?? null,
    verify_url: `${BASE_URL}/receipts/${id}`,
    pubkey_url: `${BASE_URL}/.well-known/trustbench-pubkey`,
    note: 'For zero-network offline verification: npx @trustbench/verify-receipt ' + id,
  };

  return JSON.stringify(summary, null, 2);
}

// ---------------------------------------------------------------------------
// JSON-RPC 2.0 over stdio — MCP wire layer
// ---------------------------------------------------------------------------

type JsonRpcRequest = {
  jsonrpc: '2.0';
  id?: number | string | null;
  method: string;
  params?: unknown;
};

type JsonRpcResponse = {
  jsonrpc: '2.0';
  id: number | string | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
};

/** Write a JSON-RPC response to stdout, followed by newline. */
function send(response: JsonRpcResponse): void {
  process.stdout.write(JSON.stringify(response) + '\n');
}

/** Send a JSON-RPC error response. */
function sendError(id: number | string | null, code: number, message: string): void {
  send({ jsonrpc: '2.0', id, error: { code, message } });
}

/** Process a single parsed JSON-RPC message. */
async function dispatch(msg: JsonRpcRequest): Promise<void> {
  const id = msg.id ?? null;

  switch (msg.method) {
    // -----------------------------------------------------------------------
    // MCP handshake
    // -----------------------------------------------------------------------
    case 'initialize': {
      send({
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
        },
      });
      break;
    }

    // Notification — no response required
    case 'notifications/initialized':
      break;

    // -----------------------------------------------------------------------
    // Tool discovery
    // -----------------------------------------------------------------------
    case 'tools/list': {
      send({ jsonrpc: '2.0', id, result: { tools: TOOLS } });
      break;
    }

    // -----------------------------------------------------------------------
    // Tool execution
    // -----------------------------------------------------------------------
    case 'tools/call': {
      const params = msg.params as { name?: string; arguments?: Record<string, unknown> };
      const toolName = params?.name;
      const toolArgs = params?.arguments ?? {};

      let text: string;
      try {
        if (toolName === 'get_rankings') {
          text = await handleGetRankings(toolArgs);
        } else if (toolName === 'get_receipt') {
          text = await handleGetReceipt(toolArgs);
        } else if (toolName === 'verify_receipt') {
          text = await handleVerifyReceipt(toolArgs);
        } else {
          sendError(id, -32601, `Unknown tool: ${toolName}`);
          return;
        }
      } catch (err) {
        text = `Tool error: ${err instanceof Error ? err.message : String(err)}`;
      }

      send({
        jsonrpc: '2.0',
        id,
        result: {
          content: [{ type: 'text', text }],
        },
      });
      break;
    }

    // -----------------------------------------------------------------------
    // Unknown method
    // -----------------------------------------------------------------------
    default:
      // Only send error for requests (with id), not notifications
      if (id !== null && id !== undefined) {
        sendError(id, -32601, `Method not found: ${msg.method}`);
      }
  }
}

// ---------------------------------------------------------------------------
// Main — read stdin line-by-line, parse JSON-RPC, dispatch
// ---------------------------------------------------------------------------

const rl = createInterface({ input: process.stdin, terminal: false });

rl.on('line', (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;

  let msg: JsonRpcRequest;
  try {
    msg = JSON.parse(trimmed) as JsonRpcRequest;
  } catch {
    sendError(null, -32700, 'Parse error: invalid JSON');
    return;
  }

  if (msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') {
    sendError(msg.id ?? null, -32600, 'Invalid JSON-RPC 2.0 request');
    return;
  }

  // Dispatch asynchronously; errors are caught inside dispatch()
  dispatch(msg).catch((err) => {
    sendError(msg.id ?? null, -32603, `Internal error: ${err instanceof Error ? err.message : String(err)}`);
  });
});

rl.on('close', () => {
  process.exit(0);
});
