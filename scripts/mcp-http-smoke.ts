/**
 * scripts/mcp-http-smoke.ts
 *
 * Smoke test for the POST /mcp Streamable HTTP endpoint.
 * Tests the handler logic directly (no network, no live Railway deploy needed).
 *
 * Covers:
 *   H1 — initialize returns correct protocol version and serverInfo
 *   H2 — tools/list returns all three tools with annotations
 *   H3 — tools/call get_rankings (mocked getRankings, no Redis/Supabase)
 *   H4 — tools/call unknown tool returns -32601
 *   H5 — notifications/initialized returns 204
 *   H6 — malformed JSON body returns 400 parse error
 *   H7 — unknown method with id returns -32601
 *   H8 — unknown method without id (notification) returns 204
 *
 * Usage:
 *   npx tsx scripts/mcp-http-smoke.ts
 */

import { createMcpHttpHandler } from '../src/mcp-http.js';
import type { SupabaseClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Minimal Hono Context mock — just enough for the handler to work
// ---------------------------------------------------------------------------
function makeContext(body: unknown): any {
  const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
  return {
    req: {
      json: async () => {
        if (typeof body === 'string') {
          try { return JSON.parse(body); } catch { throw new SyntaxError('invalid json'); }
        }
        return body;
      },
    },
    json: (data: unknown, status?: number) => {
      return { _type: 'json', status: status ?? 200, body: data };
    },
  };
}

// Minimal Supabase mock (not called by initialize / tools/list / get_rankings)
const mockSupabase = {} as SupabaseClient;

const handler = createMcpHttpHandler(mockSupabase);

// ---------------------------------------------------------------------------
// Test runner
// ---------------------------------------------------------------------------
let passed = 0;
let failed = 0;

function assert(label: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}${detail ? `: ${detail}` : ''}`);
    failed++;
  }
}

async function run() {
  console.log('\n=== POST /mcp Streamable HTTP smoke tests ===\n');

  // -------------------------------------------------------------------------
  // H1 — initialize
  // -------------------------------------------------------------------------
  console.log('H1: initialize');
  {
    const c = makeContext({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05' } });
    const res: any = await handler(c);
    assert('status 200', res.status === 200);
    assert('jsonrpc 2.0', res.body?.jsonrpc === '2.0');
    assert('id echoed', res.body?.id === 1);
    assert('protocolVersion', res.body?.result?.protocolVersion === '2024-11-05');
    assert('serverInfo.name', res.body?.result?.serverInfo?.name === 'trustbench');
    assert('capabilities.tools', typeof res.body?.result?.capabilities?.tools === 'object');
  }

  // -------------------------------------------------------------------------
  // H2 — tools/list
  // -------------------------------------------------------------------------
  console.log('\nH2: tools/list');
  {
    const c = makeContext({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
    const res: any = await handler(c);
    const tools = res.body?.result?.tools;
    assert('status 200', res.status === 200);
    assert('tools is array', Array.isArray(tools));
    assert('3 tools', tools?.length === 3);
    const names = tools?.map((t: any) => t.name);
    assert('get_rankings present', names?.includes('get_rankings'));
    assert('get_receipt present', names?.includes('get_receipt'));
    assert('verify_receipt present', names?.includes('verify_receipt'));
    // Verify annotations on each tool
    for (const tool of tools ?? []) {
      assert(`${tool.name} readOnlyHint=true`, tool.annotations?.readOnlyHint === true);
      assert(`${tool.name} destructiveHint=false`, tool.annotations?.destructiveHint === false);
    }
  }

  // -------------------------------------------------------------------------
  // H3 — tools/call get_rankings (mocked via env)
  // NOTE: getRankings calls Redis/Supabase so we test the error-string path
  //       when those aren't available. The handler should return a content
  //       array with an error string, not throw or 500.
  // -------------------------------------------------------------------------
  console.log('\nH3: tools/call get_rankings (no live DB — error string expected)');
  {
    const c = makeContext({
      jsonrpc: '2.0', id: 3, method: 'tools/call',
      params: { name: 'get_rankings', arguments: { capability: 'inference' } },
    });
    const res: any = await handler(c);
    assert('status 200 (handler never 500s)', res.status === 200);
    assert('result.content is array', Array.isArray(res.body?.result?.content));
    assert('content[0].type = text', res.body?.result?.content?.[0]?.type === 'text');
    const text = res.body?.result?.content?.[0]?.text;
    assert('text is string', typeof text === 'string');
    console.log(`  (text preview: ${String(text).slice(0, 80)})`);
  }

  // -------------------------------------------------------------------------
  // H4 — unknown tool
  // -------------------------------------------------------------------------
  console.log('\nH4: tools/call unknown tool');
  {
    const c = makeContext({
      jsonrpc: '2.0', id: 4, method: 'tools/call',
      params: { name: 'nonexistent_tool', arguments: {} },
    });
    const res: any = await handler(c);
    assert('status 200', res.status === 200);
    assert('error code -32601', res.body?.error?.code === -32601);
  }

  // -------------------------------------------------------------------------
  // H5 — notifications/initialized → 204
  // -------------------------------------------------------------------------
  console.log('\nH5: notifications/initialized');
  {
    const c = makeContext({ jsonrpc: '2.0', method: 'notifications/initialized' });
    const res: any = await handler(c);
    // Returns a raw Response object with status 204
    assert('status 204', res?.status === 204);
  }

  // -------------------------------------------------------------------------
  // H6 — malformed JSON body → 400
  // -------------------------------------------------------------------------
  console.log('\nH6: malformed JSON body');
  {
    const c = makeContext('this is not json');
    const res: any = await handler(c);
    assert('status 400', res.status === 400);
    assert('parse error code -32700', res.body?.error?.code === -32700);
  }

  // -------------------------------------------------------------------------
  // H7 — unknown method with id → method not found
  // -------------------------------------------------------------------------
  console.log('\nH7: unknown method with id');
  {
    const c = makeContext({ jsonrpc: '2.0', id: 7, method: 'banana/split' });
    const res: any = await handler(c);
    assert('error code -32601', res.body?.error?.code === -32601);
  }

  // -------------------------------------------------------------------------
  // H8 — unknown notification (no id) → 204
  // -------------------------------------------------------------------------
  console.log('\nH8: unknown method without id (notification)');
  {
    const c = makeContext({ jsonrpc: '2.0', method: 'some/notification' });
    const res: any = await handler(c);
    assert('status 204', res?.status === 204);
  }

  // -------------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------------
  console.log(`\n${'='.repeat(44)}`);
  console.log(`${passed + failed} checks: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error('Smoke test threw:', err);
  process.exit(1);
});
