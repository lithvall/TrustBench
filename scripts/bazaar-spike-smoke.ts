// scripts/bazaar-spike-smoke.ts — Phase 4 Bazaar extension pre-commit spike
// =============================================================================
// One-command spike test for the throwaway /test/bazaar-spike route. Per the
// CDP Bazaar doc (https://docs.cdp.coinbase.com/x402/bazaar):
//
//   "The first successful settlement for a Bazaar-enabled route is when CDP
//    catalogs it."
//
// So the spike must run a REAL CDP-mediated x402 settle against the route.
// This script does the full 402 → sign → retry → 200 flow against
// /test/bazaar-spike using the same wire pattern as paywall-smoke.ts, then
// prints:
//   1. Response headers (looking for EXTENSION-RESPONSES from CDP)
//   2. The CDP merchant-discovery URL to check 15 min from now
//   3. The Railway log key to grep
//
// Cost: one $0.005 USDC settle on Base. Same as paywall-smoke S2.
//
// Exit codes: 0 = settle succeeded, 2 = settle failed, 1 = bad env, 99 = crash
//
// Required env (same as paywall-smoke.ts):
//   TRUSTBENCH_BASE_URL                 - server under test (default https://trustbench.io)
//   SCRIPTS_PROBE_WALLET_PK             - 0x + 64 hex (agent role, signs X-PAYMENT)
//   TRUSTBENCH_REVENUE_WALLET_ADDRESS   - 0x + 40 hex (expected payTo)
//
// Preconditions:
//   1. Server has TRUSTBENCH_PAYWALL_ENABLED=true
//   2. Server has TRUSTBENCH_BAZAAR_SPIKE_ENABLED=true
//   3. @x402/extensions installed (or the route's bazaar middlewares no-op)
//   4. Probe wallet has at least $0.01 USDC on Base
// =============================================================================

import 'dotenv/config';
import { privateKeyToAccount } from 'viem/accounts';
import { ExactEvmScheme } from '@x402/evm';
import type { PaymentRequirements, PaymentPayload } from '@x402/core/types';

// -----------------------------------------------------------------------------
// Env validation
// -----------------------------------------------------------------------------
function required(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === '') {
    console.error(`[bazaar-spike] FATAL: env var ${name} missing`);
    process.exit(1);
  }
  return v.trim();
}
function optional(name: string, fallback: string): string {
  const v = process.env[name];
  return v && v.trim() !== '' ? v.trim() : fallback;
}

const BASE_URL = optional('TRUSTBENCH_BASE_URL', 'https://trustbench.io');
const PROBE_WALLET_PK = required('SCRIPTS_PROBE_WALLET_PK');
const REVENUE_WALLET = required('TRUSTBENCH_REVENUE_WALLET_ADDRESS');

if (!/^0x[0-9a-fA-F]{64}$/.test(PROBE_WALLET_PK)) {
  console.error('[bazaar-spike] FATAL: SCRIPTS_PROBE_WALLET_PK must be 0x + 64 hex chars');
  process.exit(1);
}
if (!/^0x[0-9a-fA-F]{40}$/.test(REVENUE_WALLET)) {
  console.error('[bazaar-spike] FATAL: TRUSTBENCH_REVENUE_WALLET_ADDRESS must be 0x + 40 hex chars');
  process.exit(1);
}

const agentAccount = privateKeyToAccount(PROBE_WALLET_PK as `0x${string}`);

console.log('[bazaar-spike] config:');
console.log(`  base_url        : ${BASE_URL}`);
console.log(`  agent (probe)   : ${agentAccount.address}`);
console.log(`  revenue wallet  : ${REVENUE_WALLET}`);
console.log('');

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------
async function postSpike(
  body: Record<string, unknown>,
  xPayment: string | null,
): Promise<{ status: number; body: any; headers: Headers }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  if (xPayment) headers['X-PAYMENT'] = xPayment;

  const res = await fetch(`${BASE_URL}/test/bazaar-spike`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({ error: 'malformed_response' }));
  return { status: res.status, body: json, headers: res.headers };
}

// Same build-requirements as paywall-smoke. Must match byte-for-byte or
// the facilitator's signature recovery will fail.
function buildTrustBenchRequirements(): PaymentRequirements {
  return {
    scheme: 'exact',
    network: 'eip155:8453',
    asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    amount: '5000',
    payTo: REVENUE_WALLET,
    maxTimeoutSeconds: 60,
    extra: { name: 'USD Coin', version: '2' },
  };
}

async function buildXPaymentHeader(requirements: PaymentRequirements): Promise<string> {
  const evmScheme = new ExactEvmScheme(agentAccount as any);
  const result = await evmScheme.createPaymentPayload(2, requirements);
  const payload: PaymentPayload = {
    ...result,
    accepted: requirements,
  };
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');
}

// Pretty-print all response headers, highlighting the ones that matter.
function printResponseHeaders(headers: Headers, label: string) {
  console.log(`\n[bazaar-spike] ${label} — response headers:`);
  const keysOfInterest = ['extension-responses', 'x-payment-response', 'x-receipt-id'];
  for (const [k, v] of headers.entries()) {
    const star = keysOfInterest.includes(k.toLowerCase()) ? ' ★' : '';
    console.log(`  ${k}: ${v}${star}`);
  }
}

// -----------------------------------------------------------------------------
// Step 1: Get a 402 with payment requirements
// -----------------------------------------------------------------------------
async function step1_get402() {
  console.log('[bazaar-spike] STEP 1: POST /test/bazaar-spike (no X-PAYMENT) → expect 402\n');
  const { status, body, headers } = await postSpike({ message: 'hello bazaar' }, null);

  if (status !== 402) {
    console.error(`[bazaar-spike] ✗ STEP 1 FAILED: expected 402, got ${status}`);
    console.error(`  body: ${JSON.stringify(body).slice(0, 400)}`);
    console.error('  Likely causes:');
    console.error('    - TRUSTBENCH_BAZAAR_SPIKE_ENABLED=false (set to true in Railway env)');
    console.error('    - TRUSTBENCH_PAYWALL_ENABLED=false (set to true)');
    console.error('    - Spike route falls through to echo handler when paywall is off');
    process.exit(2);
  }

  if (!Array.isArray(body.accepts) || body.accepts.length === 0) {
    console.error(`[bazaar-spike] ✗ STEP 1 FAILED: 402 body missing accepts[] array`);
    console.error(`  body: ${JSON.stringify(body).slice(0, 400)}`);
    process.exit(2);
  }

  const a = body.accepts[0];
  console.log(`[bazaar-spike] ✓ 402 envelope OK`);
  console.log(`  scheme  : ${a.scheme}`);
  console.log(`  network : ${a.network}`);
  console.log(`  amount  : ${a.amount}`);
  console.log(`  payTo   : ${a.payTo}`);
  printResponseHeaders(headers, 'STEP 1');
}

// -----------------------------------------------------------------------------
// Step 2: Sign and retry → expect 200, check for EXTENSION-RESPONSES
// -----------------------------------------------------------------------------
async function step2_settle() {
  console.log('\n[bazaar-spike] STEP 2: Sign EIP-3009 + retry with X-PAYMENT → expect 200');
  console.log('[bazaar-spike] (this settles $0.005 USDC on Base via the CDP facilitator)\n');

  const requirements = buildTrustBenchRequirements();
  const xPayment = await buildXPaymentHeader(requirements);

  const { status, body, headers } = await postSpike({ message: 'hello bazaar' }, xPayment);

  printResponseHeaders(headers, 'STEP 2');

  if (status !== 200) {
    console.error(`\n[bazaar-spike] ✗ STEP 2 FAILED: expected 200, got ${status}`);
    console.error(`  body: ${JSON.stringify(body).slice(0, 500)}`);
    console.error('\n  Likely causes:');
    console.error('    - Facilitator rejected the payment (check `error`/`detail` in body)');
    console.error('    - Probe wallet has insufficient USDC on Base');
    console.error('    - CDP creds missing on Railway (paywall-handler falls back to testnet)');
    process.exit(2);
  }

  console.log(`\n[bazaar-spike] ✓ STEP 2 PASSED: settle succeeded`);
  console.log(`  status: ${status}`);
  console.log(`  body  : ${JSON.stringify(body).slice(0, 400)}`);

  // EXTENSION-RESPONSES header check
  const extResp =
    headers.get('extension-responses') ||
    headers.get('EXTENSION-RESPONSES') ||
    headers.get('Extension-Responses');

  console.log('');
  if (extResp) {
    console.log(`[bazaar-spike] ✓ EXTENSION-RESPONSES header present: ${extResp}`);
    if (extResp.toLowerCase().includes('processing')) {
      console.log('[bazaar-spike] ✓ Bazaar metadata accepted (status: processing)');
      console.log('[bazaar-spike] → Indexing is async; check the catalog in ~10-15 min.');
    } else if (extResp.toLowerCase().includes('rejected')) {
      console.log('[bazaar-spike] ✗ Bazaar metadata REJECTED');
      console.log('[bazaar-spike] → Inspect the rejection reason above and fix the schema in');
      console.log('[bazaar-spike]   src/bazaar-extension.ts; redeploy; retry this script.');
      process.exit(2);
    } else {
      console.log(`[bazaar-spike] ⚠ Unknown EXTENSION-RESPONSES value: ${extResp}`);
    }
  } else {
    console.log('[bazaar-spike] ⚠ EXTENSION-RESPONSES header NOT present on response.');
    console.log('  Possible causes:');
    console.log('    - paywall-handler.ts does not forward this header from the facilitator');
    console.log('      (likely the current case — TrustBench did not previously care about it).');
    console.log('      Inspect Railway logs around the timestamp of this settle for');
    console.log('      "EXTENSION-RESPONSES" or "extension-responses" mentions.');
    console.log('    - @x402/extensions/bazaar package not installed → middlewares no-op.');
    console.log('      Check Railway boot logs for "[bazaar-extension] init" line.');
    console.log('    - Spike route deployed without the Bazaar middlewares for any reason.');
  }
}

// -----------------------------------------------------------------------------
// Step 3: Print verification URLs the user can check 10-15 min from now
// -----------------------------------------------------------------------------
function step3_verificationLinks() {
  console.log('');
  console.log('================================================================================');
  console.log('  Spike settle complete. Indexing is async (CDP cache delay: 10 min documented).');
  console.log('  In ~15 min, check that the spike route shows up in the CDP discovery catalog:');
  console.log('');
  console.log(`  1. CDP merchant-discovery (filter by our revenue wallet):`);
  console.log(`     https://api.cdp.coinbase.com/platform/v2/x402/discovery/merchant?payTo=${REVENUE_WALLET}`);
  console.log('');
  console.log(`  2. agentic.market human view:`);
  console.log(`     https://agentic.market/  (search for "trustbench" or scroll Infrastructure)`);
  console.log('');
  console.log('  Look for:');
  console.log(`    - resource: "${BASE_URL}/test/bazaar-spike"`);
  console.log(`    - description: spike route metadata`);
  console.log('');
  console.log('  If the spike URL appears within 1 hour → success.');
  console.log('  → Next: flip TRUSTBENCH_BAZAAR_EXTENSION_ENABLED=true on Railway,');
  console.log('    run a real settle against /route, and check the same URLs for /route.');
  console.log('');
  console.log('  If the spike URL does NOT appear within 1 hour:');
  console.log('    - If EXTENSION-RESPONSES: rejected → fix schema in src/bazaar-extension.ts');
  console.log('    - If EXTENSION-RESPONSES: processing but no index → escalate to CDP');
  console.log('    - If no EXTENSION-RESPONSES header → check Railway logs for boot warnings');
  console.log('================================================================================');
}

// -----------------------------------------------------------------------------
// Main
// -----------------------------------------------------------------------------
async function main() {
  try {
    await step1_get402();
    await step2_settle();
    step3_verificationLinks();
    process.exit(0);
  } catch (err: any) {
    console.error(`\n[bazaar-spike] CRASH: ${err?.message ?? err}`);
    if (err?.stack) console.error(err.stack);
    process.exit(99);
  }
}

main();
