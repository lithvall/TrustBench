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
const SERVER_VERSION = '1.1.0';
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
      'from one host), not a rigorous benchmark. See trustbench.io/methodology. ' +
      'Output: returns a JSON array. Each object has name (string, provider name), ' +
      'score (number 0-100, composite liveness score), latency_p50 (number, ms), ' +
      'success_rate (number 0.0-1.0, last 7 days), endpoint (string, URL), ' +
      'capabilities (array of strings).',
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
    // title — display name (Anthropic Software Directory Policy §5.E)
    annotations: {
      title: 'Get Provider Rankings',
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
      'settlement reference is. IDs start with rcpt_ (Phase 3) or rrcpt_ (Phase 4). ' +
      'Output: returns the signed receipt envelope as JSON. Phase 3 (rcpt_) returns ' +
      'a SignedReceipt with receipt (call metadata + settlement ref) and signature ' +
      '(Ed25519 over JCS-canonicalized receipt body). Phase 4 (rrcpt_) returns ' +
      '{receipt, signature} where receipt.paid contains routing details and signature ' +
      'covers the canonical envelope. To verify an envelope offline use ' +
      'the verify_receipt tool with the returned JSON, or @trustbench/verify-receipt npm.',
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
    // title — display name (Anthropic Software Directory Policy §5.E)
    annotations: {
      title: 'Fetch Payment Receipt',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  {
    name: 'verify_receipt',
    description:
      'Verify the Ed25519 signature on a TrustBench receipt. Two modes: ' +
      '(1) Lookup mode — pass receipt_id and the server fetches the receipt from ' +
      'trustbench.io and re-runs verification (handy when you only have an ID). ' +
      '(2) Offline mode — pass receipt_json (the full {receipt, signature} envelope ' +
      'an agent received from a third party) and the server verifies the Ed25519 ' +
      'signature against the published public key at trustbench.io/.well-known/' +
      'trustbench-pubkey without trusting the database. Exactly one of receipt_id ' +
      'or receipt_json must be provided. ' +
      'Output: returns JSON with receipt_id, signature_valid (boolean), ' +
      'on_chain_verified (boolean, where present), signature_alg ("ed25519"), ' +
      'verify_url, pubkey_url. For non-server-mediated verification with no ' +
      'network round-trip, use the @trustbench/verify-receipt npm package.',
    inputSchema: {
      type: 'object',
      properties: {
        receipt_id: {
          type: 'string',
          description: 'Lookup mode: the receipt ID to fetch and verify. Mutually exclusive with receipt_json.',
        },
        receipt_json: {
          type: 'object',
          description:
            'Offline mode: a full signed-receipt envelope {receipt, signature} (or a Phase 3 SignedReceipt). ' +
            'Verified against the published Ed25519 public key without database lookup. ' +
            'Mutually exclusive with receipt_id.',
        },
      },
      // JSON Schema oneOf — exactly one of the two inputs must be present.
      oneOf: [
        { required: ['receipt_id'] },
        { required: ['receipt_json'] },
      ],
    },
    // readOnlyHint=true — verification only, never initiates payments or writes
    // idempotentHint=true — verifying the same receipt is always safe to repeat
    // title — display name (Anthropic Software Directory Policy §5.E)
    annotations: {
      title: 'Verify Receipt Signature',
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

/**
 * verify_receipt — two modes (added in v1.1.0).
 *
 *   Mode 1 — Lookup (args.receipt_id):
 *     Fetch via GET /receipts/:id and surface the verification fields the
 *     live endpoint already computed (signature_valid, on_chain_verified,
 *     signature_alg).
 *
 *   Mode 2 — Offline (args.receipt_json):
 *     Forward the supplied envelope to POST /mcp's verify_receipt tool so
 *     the hosted server runs the same Ed25519 + on-chain verification it
 *     would for any other call. This keeps the npm package dependency-free
 *     (no @noble/ed25519 / no JCS canonicalizer to ship). For zero-network
 *     verification with no round-trip use @trustbench/verify-receipt.
 *
 * Failure mode: if signature_valid is a boolean on the live response, use
 * it directly. Earlier (v1.0.x) the code wrote
 *   data['signature_valid'] ?? (data['signature_alg'] ? '...' : 'unknown')
 * which is correct as written (parens make ?? bind first), but in some
 * code-review readings the operator precedence was misread as
 *   (data['signature_valid'] ?? data['signature_alg']) ? '...' : 'unknown'
 * The explicit boolean check below removes the ambiguity entirely.
 */
async function handleVerifyReceipt(args) {
  const id = args['receipt_id'];
  const json = args['receipt_json'];

  if (!id && !json) return 'Error: provide either receipt_id (lookup mode) or receipt_json (offline mode).';
  if (id && json) return 'Error: receipt_id and receipt_json are mutually exclusive — pass exactly one.';

  // Mode 2 — Offline: forward the JSON envelope to the HTTP MCP endpoint.
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
    const rpc = await res.json();
    if (rpc.error) return `Error: ${JSON.stringify(rpc.error)}`;
    return rpc?.result?.content?.[0]?.text ?? 'Error: empty MCP response.';
  }

  // Mode 1 — Lookup.
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) return 'Error: invalid receipt_id format.';

  const url = `${BASE_URL}/receipts/${id}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (res.status === 404) return `No receipt found for ID: ${id}`;
  if (!res.ok) return `Error fetching receipt: HTTP ${res.status}`;

  const data = await res.json();

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
    note: `For zero-network offline verification: npx @trustbench/verify-receipt ${id}`,
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
