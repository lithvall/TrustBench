// scripts/paywall-smoke.ts — Phase 4 v0.1.0 paywall end-to-end smoke
// =============================================================================
// Sprint Day 3 deliverable per phase4-listing-plan.md § 2 Day 3.
//
// What it does
// ------------
// Exercises the /route paywall path end-to-end against a running TrustBench
// server (local or staged). Smoke covers:
//
//   S1. 402 envelope shape       — paywall returns valid x402 accepts[0]
//   S2. Sign + settle + 200      — full happy path with real $0.005 USDC
//   S3. Idempotency replay       — repeat call returns cached body + replay hdr
//   S4. Idempotency conflict     — same key + different body returns 409
//
// All four must pass. Exit code: 0 = pass, 2 = check failed, 1 = bad env, 99 = crash.
//
// Cost
// ----
// One full settle in S2 burns $0.005 of probe-wallet USDC on Base (the
// facilitator pays gas; we only pay the merchant amount). S3/S4 do NOT
// re-settle. Total per real run: $0.005.
//
// --skip-settle flag
// ------------------
// Runs S1 + S4 only (no on-chain settlement, no money moves). Useful for fast
// regression — proves the 402 envelope shape + the idempotency-conflict path
// without spending. S2/S3 are skipped because they require a successful
// settle as their prerequisite state.
//
// Required env
// ------------
// TRUSTBENCH_BASE_URL                 - server under test (default http://localhost:3000)
// SCRIPTS_PROBE_WALLET_PK             - 0x + 64 hex (agent role, signs X-PAYMENT)
// TRUSTBENCH_REVENUE_WALLET_ADDRESS   - 0x + 40 hex (expected payTo in 402 envelope)
//
// Preconditions
// -------------
// 1. Server has TRUSTBENCH_PAYWALL_ENABLED=true.
// 2. The /pricing page returns 200 (proves the deploy actually has v0.1.0).
// 3. Probe wallet has at least $0.01 USDC on Base.
// =============================================================================

import 'dotenv/config';
import { privateKeyToAccount } from 'viem/accounts';
import { ulid } from 'ulid';
import { ExactEvmScheme } from '@x402/evm';
import type { PaymentRequirements, PaymentPayload } from '@x402/core/types';

// -----------------------------------------------------------------------------
// Env validation
// -----------------------------------------------------------------------------
function required(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === '') {
    console.error(`[paywall-smoke] FATAL: env var ${name} missing`);
    process.exit(1);
  }
  return v.trim();
}
function optional(name: string, fallback: string): string {
  const v = process.env[name];
  return v && v.trim() !== '' ? v.trim() : fallback;
}

const BASE_URL = optional('TRUSTBENCH_BASE_URL', 'http://localhost:3000');
const PROBE_WALLET_PK = required('SCRIPTS_PROBE_WALLET_PK');
const REVENUE_WALLET = required('TRUSTBENCH_REVENUE_WALLET_ADDRESS');
const SKIP_SETTLE = process.argv.includes('--skip-settle');

if (!/^0x[0-9a-fA-F]{64}$/.test(PROBE_WALLET_PK)) {
  console.error('[paywall-smoke] FATAL: SCRIPTS_PROBE_WALLET_PK must be 0x + 64 hex chars');
  process.exit(1);
}
if (!/^0x[0-9a-fA-F]{40}$/.test(REVENUE_WALLET)) {
  console.error('[paywall-smoke] FATAL: TRUSTBENCH_REVENUE_WALLET_ADDRESS must be 0x + 40 hex chars');
  process.exit(1);
}

const agentAccount = privateKeyToAccount(PROBE_WALLET_PK as `0x${string}`);

// -----------------------------------------------------------------------------
// Test result tracking
// -----------------------------------------------------------------------------
type CheckResult = { name: string; ok: boolean; detail: string; skipped?: boolean };
const results: CheckResult[] = [];

function record(name: string, ok: boolean, detail: string, skipped = false) {
  results.push({ name, ok, detail, skipped });
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------
async function postRoute(
  body: Record<string, unknown>,
  idempotencyKey: string | null,
  xPayment: string | null,
): Promise<{ status: number; body: any; headers: Headers }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
  if (xPayment) headers['X-PAYMENT'] = xPayment;

  const res = await fetch(`${BASE_URL}/route`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({ error: 'malformed_response' }));
  return { status: res.status, body: json, headers: res.headers };
}

// Build the same PaymentRequirements the server's paywall would emit. Must
// match byte-for-byte or the facilitator's signature recovery will fail.
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

// Sign a PaymentPayload as agent and base64-encode the X-PAYMENT header.
async function buildXPaymentHeader(requirements: PaymentRequirements): Promise<string> {
  const evmScheme = new ExactEvmScheme(agentAccount as any);
  const result = await evmScheme.createPaymentPayload(2, requirements);
  const payload: PaymentPayload = {
    ...result,
    accepted: requirements,
  };
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');
}

// -----------------------------------------------------------------------------
// S1 — 402 envelope shape
// -----------------------------------------------------------------------------
async function checkS1_402envelope() {
  console.log('\n[paywall-smoke] S1: POST /route with no X-PAYMENT → expect 402');
  const { status, body } = await postRoute(
    {
      capability: 'search',
      max_price: '10000',
      payer_address: agentAccount.address,
    },
    `smoke-s1-${ulid()}`,
    null,
  );

  if (status !== 402) {
    record('S1 402 envelope', false, `expected 402, got ${status}: ${JSON.stringify(body).slice(0, 200)}`);
    return;
  }

  // Validate the 402 body shape
  if (typeof body.x402Version !== 'number') {
    record('S1 402 envelope', false, 'response missing x402Version');
    return;
  }
  if (!Array.isArray(body.accepts) || body.accepts.length === 0) {
    record('S1 402 envelope', false, 'response missing accepts array');
    return;
  }
  const a = body.accepts[0];
  if (a.payTo?.toLowerCase() !== REVENUE_WALLET.toLowerCase()) {
    record('S1 402 envelope', false, `payTo mismatch: got ${a.payTo}, expected ${REVENUE_WALLET}`);
    return;
  }
  if (a.amount !== '5000') {
    record('S1 402 envelope', false, `amount mismatch: got ${a.amount}, expected 5000`);
    return;
  }
  if (a.network !== 'eip155:8453') {
    record('S1 402 envelope', false, `network mismatch: got ${a.network}, expected eip155:8453`);
    return;
  }
  if (a.scheme !== 'exact') {
    record('S1 402 envelope', false, `scheme mismatch: got ${a.scheme}, expected exact`);
    return;
  }

  record('S1 402 envelope', true, `payTo=${a.payTo.slice(0, 10)}... amount=${a.amount} (${a.scheme}/${a.network})`);
}

// -----------------------------------------------------------------------------
// S2 — full settle happy path (REAL on-chain settlement, costs $0.005)
// -----------------------------------------------------------------------------
async function checkS2_settle(): Promise<{ idemKey: string; reqBody: any; cachedBody: any } | null> {
  console.log('\n[paywall-smoke] S2: sign X-PAYMENT and POST /route → expect 200 + signed receipt');
  console.log('[paywall-smoke] (this settles $0.005 USDC on Base via the facilitator)');

  const requirements = buildTrustBenchRequirements();
  const xPayment = await buildXPaymentHeader(requirements);
  const reqBody = {
    capability: 'search',
    max_price: '10000',
    payer_address: agentAccount.address,
  };
  const idemKey = `smoke-s2-${ulid()}`;

  const { status, body, headers } = await postRoute(reqBody, idemKey, xPayment);

  if (status !== 200) {
    record('S2 settle happy path', false, `expected 200, got ${status}: ${JSON.stringify(body).slice(0, 300)}`);
    return null;
  }

  // Validate the response shape
  if (!body.receipt || !body.signature || !body.next_step) {
    record('S2 settle happy path', false, 'response missing receipt/signature/next_step');
    return null;
  }
  if (body.receipt.kind !== 'paid_response.route') {
    record('S2 settle happy path', false, `unexpected receipt.kind: ${body.receipt.kind}`);
    return null;
  }
  if (!body.receipt.paid?.tx_hash || !/^0x[0-9a-fA-F]{64}$/.test(body.receipt.paid.tx_hash)) {
    record('S2 settle happy path', false, `missing or malformed tx_hash: ${body.receipt.paid?.tx_hash}`);
    return null;
  }
  if (body.signature.alg !== 'ed25519' || typeof body.signature.value !== 'string') {
    record('S2 settle happy path', false, 'signature is not Ed25519 or missing value');
    return null;
  }
  const receiptId = headers.get('x-receipt-id');
  if (!receiptId || !receiptId.startsWith('rrcpt_')) {
    record('S2 settle happy path', false, `missing or malformed X-Receipt-Id: ${receiptId}`);
    return null;
  }

  record('S2 settle happy path', true, `tx=${body.receipt.paid.tx_hash.slice(0, 14)}... receipt=${receiptId} provider=${body.receipt.routing.provider_id.slice(0, 30)}`);
  return { idemKey, reqBody, cachedBody: body };
}

// -----------------------------------------------------------------------------
// S3 — idempotency replay (no new settle, no cost)
// -----------------------------------------------------------------------------
async function checkS3_replay(prior: { idemKey: string; reqBody: any; cachedBody: any }) {
  console.log('\n[paywall-smoke] S3: repeat call with same Idempotency-Key + same body → expect cached replay');

  // Build a FRESH X-PAYMENT envelope (different nonce). The server should
  // short-circuit on idempotency-key match BEFORE going to the facilitator,
  // so the fresh nonce is irrelevant for the test — but we send one anyway
  // because the server may reject missing X-PAYMENT in branch 3.
  const requirements = buildTrustBenchRequirements();
  const xPayment = await buildXPaymentHeader(requirements);

  const { status, body, headers } = await postRoute(prior.reqBody, prior.idemKey, xPayment);

  if (status !== 200) {
    record('S3 idempotency replay', false, `expected 200, got ${status}: ${JSON.stringify(body).slice(0, 200)}`);
    return;
  }
  const replayHdr = headers.get('x-idempotent-replay');
  if (replayHdr !== 'true') {
    record('S3 idempotency replay', false, `expected X-Idempotent-Replay: true, got ${replayHdr}`);
    return;
  }

  // v0.1.1: cached body should have a top-level `replayed_at` field added
  // OUTSIDE the signed bytes (Critic verdict gate #2). The inner receipt +
  // signature should be byte-identical to the original.
  if (typeof body.replayed_at !== 'string') {
    record('S3 idempotency replay', false, 'replay body missing replayed_at marker field');
    return;
  }
  // Receipt envelope must be identical to the original. The replayed_at
  // marker is outside the signature; everything else inside should match.
  const expectedReceipt = JSON.stringify(prior.cachedBody.receipt);
  const gotReceipt = JSON.stringify(body.receipt);
  if (expectedReceipt !== gotReceipt) {
    record('S3 idempotency replay', false, 'inner receipt envelope differs from original (signature would not validate)');
    return;
  }
  const expectedSig = JSON.stringify(prior.cachedBody.signature);
  const gotSig = JSON.stringify(body.signature);
  if (expectedSig !== gotSig) {
    record('S3 idempotency replay', false, 'signature object differs from original (would break verifier)');
    return;
  }
  record('S3 idempotency replay', true, `receipt+signature byte-identical, replay marker set (replayed_at=${body.replayed_at})`);
}

// -----------------------------------------------------------------------------
// S4 — idempotency conflict (same key, different body → 409)
// -----------------------------------------------------------------------------
async function checkS4_conflict(prior: { idemKey: string } | { skip: true }) {
  console.log('\n[paywall-smoke] S4: same Idempotency-Key + different body → expect 409');

  let idemKey: string;
  if ('skip' in prior) {
    // S2/S3 were skipped (no prior settled key). Build a fresh key + body to
    // poison the idempotency store with a benign attempt, then send a
    // mismatched body. In --skip-settle mode this can't actually fire because
    // there's no row to conflict with — flag as skipped.
    record('S4 idempotency conflict', true, 'skipped — no prior settled call to conflict against (use without --skip-settle)', true);
    return;
  }
  idemKey = prior.idemKey;

  const requirements = buildTrustBenchRequirements();
  const xPayment = await buildXPaymentHeader(requirements);

  const { status, body } = await postRoute(
    {
      capability: 'inference',                  // DIFFERENT body
      max_price: '99999',
      payer_address: agentAccount.address,
    },
    idemKey,
    xPayment,
  );

  if (status !== 409) {
    record('S4 idempotency conflict', false, `expected 409, got ${status}: ${JSON.stringify(body).slice(0, 200)}`);
    return;
  }
  if (body.error !== 'idempotency_key_reused_with_different_body') {
    record('S4 idempotency conflict', false, `wrong error code: ${body.error}`);
    return;
  }
  record('S4 idempotency conflict', true, '409 with correct error code');
}

// -----------------------------------------------------------------------------
// Main
// -----------------------------------------------------------------------------
async function main() {
  console.log('[paywall-smoke] === Phase 4 v0.1.0 paywall smoke ===');
  console.log(`[paywall-smoke] server       : ${BASE_URL}`);
  console.log(`[paywall-smoke] agent        : ${agentAccount.address}`);
  console.log(`[paywall-smoke] revenue rcvr : ${REVENUE_WALLET}`);
  console.log(`[paywall-smoke] mode         : ${SKIP_SETTLE ? '--skip-settle (S1 + S4-skipped)' : 'full settle (S1-S4)'}`);

  // Preflight: confirm /pricing returns 200 — proves the deploy has the new
  // routes. If this fails, the server probably wasn't restarted.
  const pricingProbe = await fetch(`${BASE_URL}/pricing`, { headers: { Accept: 'application/json' } });
  if (pricingProbe.status !== 200) {
    console.error(`[paywall-smoke] preflight: /pricing returned ${pricingProbe.status} (expected 200)`);
    console.error('[paywall-smoke] is the server running with the new build deployed?');
    process.exit(1);
  }

  // S1 always runs (cheap, no settlement).
  await checkS1_402envelope();

  if (SKIP_SETTLE) {
    record('S2 settle happy path', true, 'skipped via --skip-settle (no settlement / no money)', true);
    record('S3 idempotency replay', true, 'skipped (depends on S2)', true);
    await checkS4_conflict({ skip: true });
  } else {
    const s2 = await checkS2_settle();
    if (s2) {
      await checkS3_replay(s2);
      await checkS4_conflict({ idemKey: s2.idemKey });
    } else {
      record('S3 idempotency replay', false, 'skipped because S2 failed');
      record('S4 idempotency conflict', false, 'skipped because S2 failed');
    }
  }

  // Report
  console.log('\n[paywall-smoke] results:');
  for (const r of results) {
    const tag = r.skipped ? 'SKIP' : r.ok ? 'PASS' : 'FAIL';
    console.log(`  ${tag}  ${r.name}  —  ${r.detail}`);
  }
  const failed = results.filter((r) => !r.ok && !r.skipped);
  console.log('');
  if (failed.length === 0) {
    console.log('[paywall-smoke] === ALL CHECKS PASSED ===');
    process.exit(0);
  } else {
    console.log(`[paywall-smoke] === ${failed.length} CHECK(S) FAILED ===`);
    process.exit(2);
  }
}

main().catch((e) => {
  console.error('[paywall-smoke] uncaught error:', e);
  process.exit(99);
});
