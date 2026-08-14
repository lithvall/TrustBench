/**
 * src/mcp-http.ts — MCP Streamable HTTP transport handler.
 *
 * Implements the MCP 2024-11-05 Streamable HTTP transport spec for the
 * hosted endpoint at POST https://trustbench.io/mcp. This is what lets
 * the Anthropic Connectors Directory (and claude.ai web) use TrustBench
 * without any local installation — the user just connects and three tools
 * become available.
 *
 * Transport: Streamable HTTP (JSON responses, no SSE streaming needed).
 * All three tools are synchronous request/response, so we never need to
 * open an event stream. If a future tool needs streaming, add GET /mcp.
 *
 * No authentication required — all three tools are read-only public data.
 * The `supabase` client is passed in from index.ts so we reuse the same
 * service-role client rather than creating a second connection.
 *
 * Failure modes (per tool):
 *   - Tool returns a plain-text error string in the content array.
 *   - The server never returns 500 for a handled tool error.
 *   - A truly unexpected throw from a handler bubbles to a JSON-RPC
 *     internal error response (-32603) rather than crashing the process.
 *
 * Wire shape:
 *   POST /mcp  Content-Type: application/json
 *   Body: { "jsonrpc": "2.0", "id": N, "method": "...", "params": {...} }
 *   ← 200 application/json   (normal responses)
 *   ← 204 No Content         (notifications — no response expected)
 *   ← 400 application/json   (parse / protocol errors)
 *
 * Integration test: scripts/mcp-http-smoke.ts
 * Connector Directory URL: https://trustbench.io/mcp
 */

import type { Context } from 'hono';
import type { SupabaseClient } from '@supabase/supabase-js';
// Reuses the throw-proof, fail-closed print function that backs the global
// request logger (src/log-redact.ts). Sharing it means MCP lines get the same
// redaction discipline and the same guarantee that a logging failure can never
// take down a request.
import { redactedLogPrint } from './log-redact.js';
import {
  TOOLS,
  handleGetRankingsInternal,
  handleGetReceiptInternal,
  handleVerifyReceiptInternal,
} from './mcp-tools.js';

const MCP_PROTOCOL_VERSION = '2024-11-05';
const SERVER_NAME = 'trustbench';
const SERVER_VERSION = '1.1.1';

type JsonRpcRequest = {
  jsonrpc: '2.0';
  id?: number | string | null;
  method: string;
  params?: unknown;
};

// ---------------------------------------------------------------------------
// Factory: createMcpHttpHandler(supabase)
//
// Returns a Hono route handler bound to the provided Supabase client.
// index.ts calls this once at boot and mounts the result at POST /mcp.
//
//   const mcpHttpHandler = createMcpHttpHandler(supabase);
//   app.post('/mcp', mcpHttpHandler);
// ---------------------------------------------------------------------------
export function createMcpHttpHandler(supabase: SupabaseClient) {
  return async function mcpHttpHandler(c: Context): Promise<Response> {

    // -- Parse body ----------------------------------------------------------
    let body: JsonRpcRequest;
    try {
      body = await c.req.json<JsonRpcRequest>();
    } catch {
      return c.json(
        { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error: invalid JSON' } },
        400,
      );
    }

    // -- Validate JSON-RPC 2.0 envelope --------------------------------------
    if (body.jsonrpc !== '2.0' || typeof body.method !== 'string') {
      return c.json(
        { jsonrpc: '2.0', id: body.id ?? null, error: { code: -32600, message: 'Invalid JSON-RPC 2.0 request' } },
        400,
      );
    }

    const id = body.id ?? null;

    // -- Method-level observability -------------------------------------------
    //
    // Added 2026-08-14. This handler previously logged NOTHING, which is why the
    // 2026-08-01 kill-criterion grading could see 689 MCP requests arriving from
    // 6 distinct Smithery profiles but could not tell whether they represented
    // real tool use or a gateway heartbeat repeating initialize + tools/list.
    // That ambiguity is the open branch of that entry's leading indicator, and
    // it is load-bearing: real use sharpens the absent-funnel diagnosis, while
    // heartbeat means discovery is thinner than it looks and the reassessment
    // widens toward product-market fit. One log line resolves it.
    //
    // WHAT IS LOGGED: the JSON-RPC method, the tool name on tools/call, and the
    // sorted ARGUMENT KEY NAMES. Key names are schema-defined by TOOLS in this
    // file — they are our own vocabulary, not user data — and they let us see
    // request-shape diversity without touching values.
    //
    // WHAT IS NEVER LOGGED: argument VALUES, in any form. The 2026-08-01 entry
    // specifies "log JSON-RPC method + tool name, NEVER arguments" and that is
    // the binding constraint here. A receipt_id is public and a capability is
    // low-sensitivity, but a rule with carve-outs is a rule that erodes, and
    // the decisive signal (does tools/call appear at all?) needs no values
    // whatsoever. If a future question genuinely requires value distributions,
    // log a salted hash, never the value.
    //
    // Failure mode if this is wrong: over-logging leaks third-party usage
    // detail into Railway logs. Mitigated by emitting key names only. Under-
    // logging leaves the heartbeat-vs-use question open for another quarter,
    // which is the status quo this replaces. The line is prefixed [mcp] so it
    // is greppable against the existing redacted request-logger output.
    const argKeys =
      body.method === 'tools/call'
        ? Object.keys(
            ((body.params as { arguments?: Record<string, unknown> } | undefined)?.arguments) ?? {},
          ).sort()
        : [];
    const toolNameForLog =
      body.method === 'tools/call'
        ? (body.params as { name?: string } | undefined)?.name ?? 'unknown'
        : '';
    // `profile` is the Smithery gateway's caller identifier and already appears
    // in the request URL, so logging it here adds no new exposure — it is what
    // makes per-client attribution possible at all.
    const profile = c.req.query('profile') ?? '';
    redactedLogPrint(
      `[mcp] method=${body.method}` +
        (toolNameForLog ? ` tool=${toolNameForLog}` : '') +
        (argKeys.length ? ` argKeys=${argKeys.join(',')}` : '') +
        (profile ? ` profile=${profile}` : '') +
        ` notification=${body.id === undefined}`,
    );

    // -- Dispatch ------------------------------------------------------------
    switch (body.method) {

      // -----------------------------------------------------------------------
      // MCP handshake — client sends this first to agree on protocol version
      // -----------------------------------------------------------------------
      case 'initialize': {
        return c.json({
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: MCP_PROTOCOL_VERSION,
            capabilities: { tools: {} },
            serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
          },
        });
      }

      // Notification: client confirms it received the initialize response.
      // No reply expected — return 204.
      case 'notifications/initialized': {
        return new Response(null, { status: 204 });
      }

      // -----------------------------------------------------------------------
      // Tool discovery
      // -----------------------------------------------------------------------
      case 'tools/list': {
        return c.json({ jsonrpc: '2.0', id, result: { tools: TOOLS } });
      }

      // -----------------------------------------------------------------------
      // Tool execution
      // -----------------------------------------------------------------------
      case 'tools/call': {
        const params = body.params as { name?: string; arguments?: Record<string, unknown> } | undefined;
        const toolName = params?.name;
        const toolArgs = params?.arguments ?? {};

        let text: string;
        try {
          if (toolName === 'get_rankings') {
            text = await handleGetRankingsInternal(toolArgs);
          } else if (toolName === 'get_receipt') {
            text = await handleGetReceiptInternal(toolArgs, supabase);
          } else if (toolName === 'verify_receipt') {
            text = await handleVerifyReceiptInternal(toolArgs, supabase);
          } else {
            return c.json({
              jsonrpc: '2.0',
              id,
              error: { code: -32601, message: `Unknown tool: ${toolName}` },
            });
          }
        } catch (err) {
          // Unexpected throw — surface as JSON-RPC internal error, not 500.
          // If this fires, the handler has a bug; add a lessons.md entry.
          const msg = err instanceof Error ? err.message : String(err);
          return c.json({
            jsonrpc: '2.0',
            id,
            error: { code: -32603, message: `Internal error: ${msg}` },
          });
        }

        return c.json({
          jsonrpc: '2.0',
          id,
          result: { content: [{ type: 'text', text }] },
        });
      }

      // -----------------------------------------------------------------------
      // Unknown method
      // -----------------------------------------------------------------------
      default: {
        // Notifications (no id) get 204; requests (with id) get method-not-found.
        if (id !== null && id !== undefined) {
          return c.json({
            jsonrpc: '2.0',
            id,
            error: { code: -32601, message: `Method not found: ${body.method}` },
          });
        }
        return new Response(null, { status: 204 });
      }
    }
  };
}
