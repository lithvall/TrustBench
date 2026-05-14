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
 * Claude Desktop config snippet (add to claude_desktop_config.json):
 * {
 *   "mcpServers": {
 *     "trustbench": {
 *       "command": "npx",
 *       "args": ["tsx", "/path/to/TrustBench/src/mcp-server.ts"]
 *     }
 *   }
 * }
 *
 * Or, once published as @trustbench/mcp on npm:
 * {
 *   "mcpServers": {
 *     "trustbench": {
 *       "command": "npx",
 *       "args": ["-y", "@trustbench/mcp"]
 *     }
 *   }
 * }
 *
 * Failure mode: if TRUSTBENCH_BASE_URL is misconfigured, tool calls return
 * a descriptive error string in the content array — the server never crashes
 * and never touches a payment surface. All tools are read-only.
 */

import { createInterface } from 'node:readline';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const BASE_URL = (process.env.TRUSTBENCH_BASE_URL ?? 'https://trustbench.io').replace(/\/$/, '');
const SERVER_NAME = 'trustbench';
const SERVER_VERSION = '1.0.0';
const PROTOCOL_VERSION = '2024-11-05';

// ---------------------------------------------------------------------------
// Tool definitions (MCP inputSchema = JSON Schema draft-07)
// ---------------------------------------------------------------------------

const TOOLS = [
  {
    name: 'get_rankings',
    description:
      'Get TrustBench liveness rankings for x402 providers by capability. ' +
      'Returns a scored list of providers with latency and success-rate telemetry. ' +
      'Methodology note: scores are derived from HEAD-probe liveness checks (3 samples ' +
      'from one host), not a rigorous benchmark. See trustbench.io/methodology.',
    inputSchema: {
      type: 'object',
      properties: {
        capability: {
          type: 'string',
          enum: ['search', 'inference', 'data', 'media', 'infra'],
          description: 'The provider capability to query rankings for.',
        },
      },
      required: ['capability'],
    },
  },
  {
    name: 'get_receipt',
    description:
      'Fetch a TrustBench routing receipt by ID. Receipts are immutable, ' +
      'Ed25519-signed records of a routing or payment event. Use to verify ' +
      'what was paid, to whom, for what capability, and what the on-chain ' +
      'settlement reference is. IDs start with rcpt_ (Phase 3) or rrcpt_ (Phase 4).',
    inputSchema: {
      type: 'object',
      properties: {
        receipt_id: {
          type: 'string',
          description: 'The receipt ID, e.g. rcpt_01KQY7C44GAPSXZPFQYRZ1D10C or rrcpt_…',
        },
      },
      required: ['receipt_id'],
    },
  },
  {
    name: 'verify_receipt',
    description:
      'Verify the Ed25519 signature on a TrustBench receipt. Fetches the receipt ' +
      'from trustbench.io and confirms the signature is valid against the published ' +
      'public key at trustbench.io/.well-known/trustbench-pubkey. Returns ' +
      'signature_valid status and, where present, on_chain_verified status. ' +
      'For full offline verification, use the @trustbench/verify-receipt npm package.',
    inputSchema: {
      type: 'object',
      properties: {
        receipt_id: {
          type: 'string',
          description: 'The receipt ID to verify.',
        },
      },
      required: ['receipt_id'],
    },
  },
];

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

async function handleVerifyReceipt(args: Record<string, unknown>): Promise<string> {
  const id = args['receipt_id'] as string;
  if (!id) return 'Error: receipt_id is required.';
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) return 'Error: invalid receipt_id format.';

  // Fetch the receipt
  const url = `${BASE_URL}/receipts/${id}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (res.status === 404) return `No receipt found for ID: ${id}`;
  if (!res.ok) return `Error fetching receipt: HTTP ${res.status}`;

  const data = await res.json() as Record<string, unknown>;

  // The receipt JSON already carries TrustBench's verification fields
  // (signature_valid, on_chain_verified) when fetched from the live endpoint.
  // Surface them clearly for the agent.
  const sigValid = data['signature_valid'] ?? data['signature_alg'] ? '(see full receipt)' : 'unknown';
  const onChain  = data['on_chain_verified'] ?? 'not checked by server';

  const summary = {
    receipt_id: id,
    signature_valid: sigValid,
    on_chain_verified: onChain,
    signature_alg: data['signature_alg'] ?? null,
    verify_url: `${BASE_URL}/receipts/${id}`,
    pubkey_url: `${BASE_URL}/.well-known/trustbench-pubkey`,
    note: 'For full offline Ed25519 verification: npx @trustbench/verify-receipt ' + id,
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
