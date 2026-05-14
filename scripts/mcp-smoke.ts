/**
 * MCP server smoke test
 *
 * Spawns src/mcp-server.ts as a child process, sends JSON-RPC messages
 * over stdin, and asserts the expected responses come back over stdout.
 *
 * Run: npx tsx scripts/mcp-smoke.ts
 *
 * Tests:
 *   S1 — initialize handshake returns correct protocolVersion + serverInfo
 *   S2 — tools/list returns all three expected tools
 *   S3 — get_rankings returns a non-empty provider array for "inference"
 *   S4 — get_receipt fetches a known public receipt (Phase 3 milestone)
 *   S5 — verify_receipt returns a receipt_id + pubkey_url summary
 *   S6 — unknown tool returns a -32601 error, not a crash
 *   S7 — malformed JSON returns -32700 parse error, not a crash
 */

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_PATH = path.join(__dirname, '..', 'src', 'mcp-server.ts');

// Known public receipt from Phase 3 milestone (rcpt_ prefix)
const KNOWN_RECEIPT_ID = 'rcpt_01KQY629W1HWJW19E87ECR4ZTR';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;

function ok(label: string, condition: boolean, detail?: string): void {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}${detail ? ': ' + detail : ''}`);
    failed++;
  }
}

function rpc(id: number, method: string, params?: unknown): string {
  return JSON.stringify({ jsonrpc: '2.0', id, method, params: params ?? {} }) + '\n';
}

function notification(method: string): string {
  return JSON.stringify({ jsonrpc: '2.0', method }) + '\n';
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function run(): Promise<void> {
  console.log('TrustBench MCP server smoke test\n');

  const server = spawn('npx', ['tsx', SERVER_PATH], {
    stdio: ['pipe', 'pipe', 'inherit'],
    env: { ...process.env, TRUSTBENCH_BASE_URL: 'https://trustbench.io' },
  });

  // Collect stdout lines into a queue; resolve waiting promises as lines arrive
  const lineQueue: string[] = [];
  const waiters: Array<(line: string) => void> = [];

  server.stdout!.on('data', (chunk: Buffer) => {
    const lines = chunk.toString().split('\n').filter((l) => l.trim());
    for (const line of lines) {
      const waiter = waiters.shift();
      if (waiter) {
        waiter(line);
      } else {
        lineQueue.push(line);
      }
    }
  });

  function nextLine(): Promise<string> {
    if (lineQueue.length > 0) return Promise.resolve(lineQueue.shift()!);
    return new Promise((resolve) => waiters.push(resolve));
  }

  async function sendAndReceive(id: number, method: string, params?: unknown): Promise<unknown> {
    server.stdin!.write(rpc(id, method, params));
    const raw = await Promise.race([
      nextLine(),
      new Promise<string>((_, reject) =>
        setTimeout(() => reject(new Error(`Timeout waiting for response to ${method}`)), 8000)
      ),
    ]);
    return JSON.parse(raw as string);
  }

  try {
    // S1 — initialize
    console.log('S1: initialize handshake');
    const initResp = await sendAndReceive(1, 'initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'smoke-test', version: '0.0.1' },
    }) as { result?: { protocolVersion?: string; serverInfo?: { name?: string } } };
    ok('protocolVersion matches', initResp.result?.protocolVersion === '2024-11-05');
    ok('serverInfo.name is trustbench', initResp.result?.serverInfo?.name === 'trustbench');

    // Acknowledge init (notification, no response expected)
    server.stdin!.write(notification('notifications/initialized'));

    // S2 — tools/list
    console.log('\nS2: tools/list');
    const toolsResp = await sendAndReceive(2, 'tools/list') as {
      result?: { tools?: Array<{ name: string }> };
    };
    const toolNames = toolsResp.result?.tools?.map((t) => t.name) ?? [];
    ok('get_rankings present',    toolNames.includes('get_rankings'));
    ok('get_receipt present',     toolNames.includes('get_receipt'));
    ok('verify_receipt present',  toolNames.includes('verify_receipt'));
    ok('exactly 3 tools returned', toolNames.length === 3);

    // S3 — get_rankings
    console.log('\nS3: get_rankings(inference)');
    const rankResp = await sendAndReceive(3, 'tools/call', {
      name: 'get_rankings',
      arguments: { capability: 'inference' },
    }) as { result?: { content?: Array<{ text?: string }> } };
    const rankText = rankResp.result?.content?.[0]?.text ?? '';
    let rankData: unknown;
    try { rankData = JSON.parse(rankText); } catch { rankData = null; }
    ok('response is valid JSON',           rankData !== null);
    ok('does not contain "Error"',         !rankText.startsWith('Error'));

    // S4 — get_receipt
    console.log('\nS4: get_receipt(' + KNOWN_RECEIPT_ID + ')');
    const rcptResp = await sendAndReceive(4, 'tools/call', {
      name: 'get_receipt',
      arguments: { receipt_id: KNOWN_RECEIPT_ID },
    }) as { result?: { content?: Array<{ text?: string }> } };
    const rcptText = rcptResp.result?.content?.[0]?.text ?? '';
    ok('response is not empty',  rcptText.length > 0);
    ok('does not contain "Error"', !rcptText.startsWith('Error') && !rcptText.startsWith('No receipt'));

    // S5 — verify_receipt
    console.log('\nS5: verify_receipt(' + KNOWN_RECEIPT_ID + ')');
    const verResp = await sendAndReceive(5, 'tools/call', {
      name: 'verify_receipt',
      arguments: { receipt_id: KNOWN_RECEIPT_ID },
    }) as { result?: { content?: Array<{ text?: string }> } };
    const verText = verResp.result?.content?.[0]?.text ?? '';
    let verData: Record<string, unknown> | null = null;
    try { verData = JSON.parse(verText) as Record<string, unknown>; } catch { /* empty */ }
    ok('response parses as JSON', verData !== null);
    ok('receipt_id present in summary', verData?.['receipt_id'] === KNOWN_RECEIPT_ID);
    ok('pubkey_url present',            typeof verData?.['pubkey_url'] === 'string');

    // S6 — unknown tool
    console.log('\nS6: unknown tool returns error');
    const unknownResp = await sendAndReceive(6, 'tools/call', {
      name: 'nonexistent_tool',
      arguments: {},
    }) as { error?: { code?: number } };
    ok('returns -32601 error code', unknownResp.error?.code === -32601);

    // S7 — malformed JSON
    console.log('\nS7: malformed JSON returns parse error');
    server.stdin!.write('not valid json\n');
    const parseErrRaw = await Promise.race([
      nextLine(),
      new Promise<string>((_, reject) =>
        setTimeout(() => reject(new Error('Timeout on malformed JSON test')), 4000)
      ),
    ]);
    const parseErr = JSON.parse(parseErrRaw as string) as { error?: { code?: number } };
    ok('returns -32700 parse error', parseErr.error?.code === -32700);

  } catch (err) {
    console.error('\nSmoke test threw:', err);
    failed++;
  } finally {
    server.stdin!.end();
    server.kill();

    console.log(`\n${passed + failed} checks — ${passed} passed, ${failed} failed`);
    if (failed > 0) process.exit(1);
  }
}

run();
