#!/usr/bin/env node
/**
 * @trustbench/mcp
 *
 * Native MCP server for TrustBench. Exposes provider rankings, receipt
 * lookup, and Ed25519 receipt verification as agent-callable tools over
 * the Model Context Protocol (JSON-RPC 2.0 / stdio transport).
 *
 * Compatible hosts: Claude Desktop, Claude Cowork, Grok (xAI Connectors),
 * Kimi Code CLI, Cherry Studio, Cursor, and any MCP-capable agent host.
 *
 * No API key required for v1 tools (all read-only):
 *   • get_rankings   — scored providers by capability
 *   • get_receipt    — fetch a receipt by ID (rcpt_ or rrcpt_)
 *   • verify_receipt — confirm Ed25519 signature + on-chain status
 *
 * Claude Desktop / Cowork config (add to claude_desktop_config.json):
 * {
 *   "mcpServers": {
 *     "trustbench": {
 *       "command": "npx",
 *       "args": ["-y", "@trustbench/mcp"]
 *     }
 *   }
 * }
 *
 * Grok / Kimi config (same format — both support MCP):
 * {
 *   "mcpServers": {
 *     "trustbench": {
 *       "command": "npx",
 *       "args": ["-y", "@trustbench/mcp"]
 *     }
 *   }
 * }
 *
 * Environment variables:
 *   TRUSTBENCH_BASE_URL  — override the API base (default: https://trustbench.io)
 *
 * Source: https://github.com/lithvall/TrustBench/blob/main/src/mcp-server.ts
 */

import { createInterface } from 'node:readline';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const BASE_URL = (process.env.TRUSTBENCH_BASE_URL ?? 'https://trustbench.io').replace(/\/$/, '');
const SERVER_NAME = 'trustbench';
const SERVER_VERSION = '1.0.4';
const PROTOCOL_VERSION = '2024-11-05';

// ---------------------------------------------------------------------------
// Tool definitions
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
    // MCP tool annotations (MCP spec §6.2):
    // readOnlyHint=true  — only reads registry data, never writes or transacts
    // destructiveHint=false — no side effects, safe to retry freely
    // openWorldHint=true — results come from live trustbench.io telemetry
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
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
    // readOnlyHint=true — immutable receipt fetch, no writes or payments
    // idempotentHint=true — same receipt ID always returns the same signed envelope
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
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
    // readOnlyHint=true — verification only, never initiates payments or writes
    // idempotentHint=true — verifying the same receipt ID is always safe to repeat
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
];

// ---------------------------------------------------------------------------
// Tool handlers
// ---------------------------------------------------------------------------

async function handleGetRankings(args) {
  const capability = args['capability'];
  if (!capability) return 'Error: capability is required.';

  const url = `${BASE_URL}/rankings?capability=${encodeURIComponent(capability)}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) return `Error fetching rankings: HTTP ${res.status} from ${url}`;

  const data = await res.json();
  return JSON.stringify(data, null, 2);
}

async function handleGetReceipt(args) {
  const id = args['receipt_id'];
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

async function handleVerifyReceipt(args) {
  const id = args['receipt_id'];
  if (!id) return 'Error: receipt_id is required.';
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) return 'Error: invalid receipt_id format.';

  const url = `${BASE_URL}/receipts/${id}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (res.status === 404) return `No receipt found for ID: ${id}`;
  if (!res.ok) return `Error fetching receipt: HTTP ${res.status}`;

  const data = await res.json();

  const sigValid = data['signature_valid'] ?? (data['signature_alg'] ? '(see full receipt)' : 'unknown');
  const onChain  = data['on_chain_verified'] ?? 'not checked by server';

  const summary = {
    receipt_id: id,
    signature_valid: sigValid,
    on_chain_verified: onChain,
    signature_alg: data['signature_alg'] ?? null,
    verify_url: `${BASE_URL}/receipts/${id}`,
    pubkey_url: `${BASE_URL}/.well-known/trustbench-pubkey`,
    note: `For full offline Ed25519 verification: npx @trustbench/verify-receipt ${id}`,
  };

  return JSON.stringify(summary, null, 2);
}

// ---------------------------------------------------------------------------
// JSON-RPC 2.0 / stdio wire layer
// ---------------------------------------------------------------------------

function send(response) {
  process.stdout.write(JSON.stringify(response) + '\n');
}

function sendError(id, code, message) {
  send({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });
}

async function dispatch(msg) {
  const id = msg.id ?? null;

  switch (msg.method) {
    case 'initialize':
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

    case 'notifications/initialized':
      break;

    case 'tools/list':
      send({ jsonrpc: '2.0', id, result: { tools: TOOLS } });
      break;

    case 'tools/call': {
      const params = msg.params ?? {};
      const toolName = params.name;
      const toolArgs = params.arguments ?? {};

      let text;
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

      send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text }] } });
      break;
    }

    default:
      if (id !== null && id !== undefined) {
        sendError(id, -32601, `Method not found: ${msg.method}`);
      }
  }
}

// ---------------------------------------------------------------------------
// Main — read stdin line-by-line
// ---------------------------------------------------------------------------

const rl = createInterface({ input: process.stdin, terminal: false });

rl.on('line', (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;

  let msg;
  try {
    msg = JSON.parse(trimmed);
  } catch {
    sendError(null, -32700, 'Parse error: invalid JSON');
    return;
  }

  if (msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') {
    sendError(msg.id ?? null, -32600, 'Invalid JSON-RPC 2.0 request');
    return;
  }

  dispatch(msg).catch((err) => {
    sendError(msg.id ?? null, -32603, `Internal error: ${err instanceof Error ? err.message : String(err)}`);
  });
});

rl.on('close', () => process.exit(0));
