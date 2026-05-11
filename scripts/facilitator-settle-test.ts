// scripts/facilitator-settle-test.ts
// =============================================================================
// Phase 4 v0.1.0 paywall pre-flight — listing plan § 1.3
// =============================================================================
// One-off settle test for the dedicated revenue wallet. Proves the x402
// facilitator wire works end-to-end against TRUSTBENCH_REVENUE_WALLET_ADDRESS
// BEFORE Sprint Day 1 paywall middleware lands, so we don't discover dialect
// or facilitator bugs mid-sprint (P4-1b precedent: 9 hand-roll patches were
// needed once we actually called the Coinbase CDP facilitator for the first
// time).
//
// Shape: TrustBench plays MERCHANT, the existing probe wallet plays AGENT.
//   1. Build PaymentRequirements pointing at TRUSTBENCH_REVENUE_WALLET_ADDRESS
//      ($0.005 USDC on Base).
//   2. Sign as agent: ExactEvmScheme(probeWallet).createPaymentPayload(2, req).
//   3. Verify via HTTPFacilitatorClient.verify(payload, req) (no money moves).
//   4. If --dry-run, stop here. Otherwise:
//   5. Settle via HTTPFacilitatorClient.settle(payload, req). Facilitator
//      broadcasts EIP-3009 transferWithAuthorization on Base. Tx hash returned.
//   6. Read USDC balance at revenue wallet before/after, confirm +$0.005 delta.
//
// Failure modes if this is wrong:
//   - verify() returns isValid:false → wire shape bug or wallet balance issue.
//     No money moves. We learn the dialect bug NOW, not in middleware.
//   - settle() throws / returns success:false → facilitator rejected on-chain
//     submission. No money moves. Same recovery.
//   - settle() returns success:true but balance doesn't change → facilitator
//     misreport or RPC lag. Wait + re-check via tx_hash before deciding.
//   - Probe wallet underfunded → SDK or facilitator surfaces an insufficient
//     balance error. Top up probe wallet, retry.
//
// Non-custodial sanity check: this script NEVER touches the revenue wallet's
// private key. It only reads the revenue wallet's PUBLIC address from env and
// uses it as payTo. The revenue wallet's private key stays in the wallet app
// where Johan provisioned it.
// =============================================================================

import 'dotenv/config';
import { privateKeyToAccount } from 'viem/accounts';
import { createPublicClient, http, getAddress, getContract, type Address } from 'viem';
import { base } from 'viem/chains';
import { ulid } from 'ulid';
import { ExactEvmScheme } from '@x402/evm';
import { HTTPFacilitatorClient } from '@x402/core/server';
import type { PaymentRequirements, PaymentPayload } from '@x402/core/types';

// -----------------------------------------------------------------------------
// Constants — same anchors as paid-probe.ts
// -----------------------------------------------------------------------------
const BASE_USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as const;
const BASE_NETWORK_CAIP = 'eip155:8453';
const TEST_AMOUNT_ATOMIC = '5000';        // $0.005 in USDC 6-decimals
const MAX_TIMEOUT_SECONDS = 60;
const DEFAULT_FACILITATOR_URL = 'https://x402.org/facilitator';

// Minimal USDC ABI fragment for balanceOf — we don't need the full contract.
const USDC_BALANCE_ABI = [
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

// -----------------------------------------------------------------------------
// Env helpers (mirrors paid-probe.ts conventions)
// -----------------------------------------------------------------------------
function required(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === '') {
    console.error(`[facilitator-test] FATAL: required env var ${name} is missing or empty`);
    process.exit(1);
  }
  return v.trim();
}

function optional(name: string, fallback: string): string {
  const v = process.env[name];
  return v && v.trim() !== '' ? v.trim() : fallback;
}

// -----------------------------------------------------------------------------
// USDC balance check on Base
// -----------------------------------------------------------------------------
async function readUsdcBalance(rpcUrl: string, wallet: Address): Promise<bigint> {
  const client = createPublicClient({ chain: base, transport: http(rpcUrl) });
  const usdc = getContract({
    address: BASE_USDC_ADDRESS,
    abi: USDC_BALANCE_ABI,
    client,
  });
  return await usdc.read.balanceOf([wallet]);
}

function formatUsdc(atomic: bigint): string {
  // USDC has 6 decimals. Render as $X.XXXXXX with trailing-zero trim.
  const whole = atomic / 1_000_000n;
  const frac = atomic % 1_000_000n;
  const fracStr = frac.toString().padStart(6, '0').replace(/0+$/, '') || '0';
  return `$${whole}.${fracStr}`;
}

// -----------------------------------------------------------------------------
// Main
// -----------------------------------------------------------------------------
async function main() {
  // 1. Env. Validate everything before touching network or wallets.
  const probeWalletPk = required('SCRIPTS_PROBE_WALLET_PK');
  const revenueWalletAddr = required('TRUSTBENCH_REVENUE_WALLET_ADDRESS');
  const facilitatorUrl = optional('TRUSTBENCH_FACILITATOR_URL', DEFAULT_FACILITATOR_URL);
  const baseRpcUrl = optional('BASE_RPC_URL', 'https://mainnet.base.org');
  const dryRun = process.argv.includes('--dry-run');

  if (!/^0x[0-9a-fA-F]{64}$/.test(probeWalletPk)) {
    console.error('[facilitator-test] FATAL: SCRIPTS_PROBE_WALLET_PK must be 0x + 64 hex chars');
    process.exit(1);
  }
  if (!/^0x[0-9a-fA-F]{40}$/.test(revenueWalletAddr)) {
    console.error('[facilitator-test] FATAL: TRUSTBENCH_REVENUE_WALLET_ADDRESS must be 0x + 40 hex chars');
    process.exit(1);
  }

  const agentAccount = privateKeyToAccount(probeWalletPk as `0x${string}`);
  const agentAddress = agentAccount.address;
  const merchantAddress = getAddress(revenueWalletAddr) as Address;

  console.log('[facilitator-test] === Phase 4 paywall pre-flight ===');
  console.log(`[facilitator-test] facilitator   : ${facilitatorUrl}`);
  console.log(`[facilitator-test] agent (probe) : ${agentAddress}`);
  console.log(`[facilitator-test] merchant (rev): ${merchantAddress}`);
  console.log(`[facilitator-test] amount        : ${TEST_AMOUNT_ATOMIC} atomic ($0.005 USDC)`);
  console.log(`[facilitator-test] dry-run       : ${dryRun} (true = verify only, no settle)`);

  // Sanity: agent and merchant must be different. If they collapse, the
  // settle would be self-transfer and probably reject; in any case it
  // violates the wallet-separation design.
  if (agentAddress.toLowerCase() === merchantAddress.toLowerCase()) {
    console.error('[facilitator-test] FATAL: probe wallet and revenue wallet are the same address — provision a fresh revenue wallet');
    process.exit(1);
  }

  // 2. Pre-settle balance snapshot.
  console.log('[facilitator-test] reading pre-settle balances on Base...');
  let agentBalanceBefore: bigint;
  let merchantBalanceBefore: bigint;
  try {
    agentBalanceBefore = await readUsdcBalance(baseRpcUrl, agentAddress);
    merchantBalanceBefore = await readUsdcBalance(baseRpcUrl, merchantAddress);
  } catch (e: any) {
    console.error(`[facilitator-test] FATAL: balance read failed: ${e?.message || e}`);
    console.error('[facilitator-test] hint: set BASE_RPC_URL to a working Base RPC (default https://mainnet.base.org may rate-limit)');
    process.exit(1);
  }
  console.log(`[facilitator-test] agent USDC before    : ${formatUsdc(agentBalanceBefore)}`);
  console.log(`[facilitator-test] merchant USDC before : ${formatUsdc(merchantBalanceBefore)}`);

  if (agentBalanceBefore < BigInt(TEST_AMOUNT_ATOMIC)) {
    console.error(`[facilitator-test] FATAL: probe wallet underfunded — has ${formatUsdc(agentBalanceBefore)}, needs ${formatUsdc(BigInt(TEST_AMOUNT_ATOMIC))}`);
    process.exit(1);
  }

  // 3. Build PaymentRequirements. This is the EXACT shape a paywalled /route
  // will emit on Sprint Day 3 — we're prototyping the merchant-side payload
  // here so any dialect bug surfaces NOW.
  const requirements: PaymentRequirements = {
    scheme: 'exact',
    network: BASE_NETWORK_CAIP,
    asset: BASE_USDC_ADDRESS,
    amount: TEST_AMOUNT_ATOMIC,
    payTo: merchantAddress,
    maxTimeoutSeconds: MAX_TIMEOUT_SECONDS,
    // USDC v2 EIP-712 domain. The agent's SDK reads these to reconstruct the
    // domain separator; the facilitator does the same on the verify side.
    // Both must agree on (name, version) or signature recovery fails.
    extra: {
      name: 'USD Coin',
      version: '2',
    },
  };

  console.log('[facilitator-test] PaymentRequirements:', JSON.stringify(requirements));

  // 4. Sign as agent. Same SDK call paid-probe.ts uses against real merchants,
  // just driven by our own constructed PaymentRequirements instead of a
  // merchant's accepts[0].
  console.log('[facilitator-test] signing as agent (ExactEvmScheme.createPaymentPayload)...');
  const evmScheme = new ExactEvmScheme(agentAccount as any);
  const result = await evmScheme.createPaymentPayload(2, requirements);

  const payload: PaymentPayload = {
    ...result,
    accepted: requirements,
  };
  console.log(`[facilitator-test] payload signed (x402Version=${result.x402Version}, payloadKeys=${Object.keys(result.payload).join(',')})`);

  // 5. Verify via facilitator. Read-only; no money moves.
  const facilitator = new HTTPFacilitatorClient({ url: facilitatorUrl });

  console.log('[facilitator-test] POST /verify ...');
  let verifyResp;
  try {
    verifyResp = await facilitator.verify(payload, requirements);
  } catch (e: any) {
    console.error(`[facilitator-test] FAIL verify: ${e?.message || e}`);
    if (e?.response) {
      console.error('[facilitator-test] facilitator response:', JSON.stringify(e.response, null, 2));
    }
    process.exit(2);
  }
  console.log('[facilitator-test] verify response:', JSON.stringify(verifyResp, null, 2));

  if (!verifyResp.isValid) {
    console.error(`[facilitator-test] FAIL verify: isValid=false reason=${verifyResp.invalidReason} message=${verifyResp.invalidMessage}`);
    process.exit(2);
  }
  console.log('[facilitator-test] OK verify: signature + balance accepted by facilitator');

  if (dryRun) {
    console.log('[facilitator-test] --dry-run set; stopping before /settle. No money moved.');
    return;
  }

  // 6. Settle via facilitator. Real on-chain submission. $0.005 USDC moves.
  console.log('[facilitator-test] POST /settle (real on-chain submission) ...');
  let settleResp;
  try {
    settleResp = await facilitator.settle(payload, requirements);
  } catch (e: any) {
    console.error(`[facilitator-test] FAIL settle: ${e?.message || e}`);
    if (e?.response) {
      console.error('[facilitator-test] facilitator response:', JSON.stringify(e.response, null, 2));
    }
    process.exit(3);
  }
  console.log('[facilitator-test] settle response:', JSON.stringify(settleResp, null, 2));

  if (!settleResp.success) {
    console.error(`[facilitator-test] FAIL settle: success=false reason=${settleResp.errorReason} message=${settleResp.errorMessage}`);
    process.exit(3);
  }

  const txHash = settleResp.transaction;
  console.log(`[facilitator-test] OK settle: tx=${txHash}`);
  console.log(`[facilitator-test] basescan: https://basescan.org/tx/${txHash}`);

  // 7. Confirm balance delta. Settlement is typically <3s on Base; allow up
  // to ~10s of RPC lag before declaring failure.
  console.log('[facilitator-test] waiting 5s for RPC propagation, then re-reading balances...');
  await new Promise((r) => setTimeout(r, 5000));

  let agentBalanceAfter: bigint;
  let merchantBalanceAfter: bigint;
  for (let attempt = 1; attempt <= 3; attempt++) {
    agentBalanceAfter = await readUsdcBalance(baseRpcUrl, agentAddress);
    merchantBalanceAfter = await readUsdcBalance(baseRpcUrl, merchantAddress);
    const merchantDelta = merchantBalanceAfter - merchantBalanceBefore;
    if (merchantDelta >= BigInt(TEST_AMOUNT_ATOMIC)) {
      console.log(`[facilitator-test] agent USDC after     : ${formatUsdc(agentBalanceAfter)}  (delta ${formatUsdc(agentBalanceBefore - agentBalanceAfter)})`);
      console.log(`[facilitator-test] merchant USDC after  : ${formatUsdc(merchantBalanceAfter)}  (delta +${formatUsdc(merchantDelta)})`);
      console.log('[facilitator-test] === PASS — facilitator wire works end-to-end ===');
      return;
    }
    console.log(`[facilitator-test] attempt ${attempt}/3: merchant balance not yet credited; waiting 3s...`);
    await new Promise((r) => setTimeout(r, 3000));
  }

  console.error('[facilitator-test] WARN: settle reported success but merchant balance did not change within ~14s');
  console.error('[facilitator-test] check basescan for the tx; if confirmed, this is RPC lag and the test still passed');
  process.exit(4);
}

main().catch((e) => {
  console.error('[facilitator-test] uncaught error:', e);
  process.exit(99);
});
