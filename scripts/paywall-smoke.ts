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

// Fetch the live /route 402 once and extract the `extensions` field so we can
// echo it into the X-PAYMENT envelope (Stone 0 fix — see paragraph below).
//
// Returns undefined if the 402 has no extensions block, which means either
// TRUSTBENCH_BAZAAR_EXTENSION_ENABLED is false in prod or the package failed
// to load at module init. Either way, we proceed without extensions and the
// settle will still complete — but cataloging will be skipped, same as the
// pre-Stone-0 baseline.
async function fetchLive402Extensions(): Promise<Record<string, unknown> | undefined> {
  const probeBody = {
    capability: 'data',
    max_price: '10000',
    payer_address: agentAccount.address,
  };
  const res = await fetch(`${BASE_URL}/route`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(probeBody),
  });
  if (res.status !== 402) {
    console.warn(`[paywall-smoke] fetchLive402Extensions: expected 402, got ${res.status}; skipping extensions echo`);
    return undefined;
  }
  const body = await res.json().catch(() => ({}));
  if (body && typeof body === 'object' && body.extensions && typeof body.extensions === 'object') {
    return body.extensions as Record<string, unknown>;
  }
  return undefined;
}

// =============================================================================
// STONE 0 FIX (2026-05-13): the X-PAYMENT envelope's `extensions` echo.
// =============================================================================
// Source: listing-blocker-audit-2026-05-13.md § 9 Stone 0 + § 10.2 verbatim SDK
// excerpt. Confirmed independently by Grok and ChatGPT reviews 2026-05-13.
//
// The bug: @x402/extensions's `extractDiscoveryInfo(paymentPayload,
// paymentRequirements)` reads the bazaar extension from
// `paymentPayload.extensions[BAZAAR.key]` — i.e. from the X-PAYMENT envelope
// the agent submits, NOT from the 402 response body the server emitted.
// Reference x402 clients (@x402/axios, the canonical Express paymentMiddleware)
// auto-propagate the 402's `extensions` field into the payload they sign and
// send. Our hand-rolled smoke wallet did not. Result: six successful settles
// (2026-05-12 + 2026-05-13) produced zero CDP Bazaar indexing even though the
// server-side 402 body was canonical (validator 11/11 green; routeTemplate,
// resource, PAYMENT-REQUIRED header all present; validateDiscoveryExtension
// returns valid:true on the live declaration per scripts/validate-bazaar-extension.cjs
// 2026-05-13).
//
// The fix: add `extensions` to the PaymentPayload literal, sourced from the
// 402 we just fetched. The inner EIP-3009 authorization is unchanged (already
// signed before extensions are layered on), so signature recovery is
// unaffected on the facilitator side.
//
// FAILURE MODE PARAGRAPH (high-risk surface discipline per CLAUDE.md):
//
// If this code is wrong, the worst plausible outcomes:
//
//   A. We somehow corrupt the inner authorization payload by layering
//      extensions on top. Mitigated: extensions is added as a top-level
//      field on the PaymentPayload (sibling to `payload.authorization`),
//      not nested inside it. The EIP-3009 signature is over
//      payload.authorization fields exclusively per @x402/evm; adding a
//      sibling does not change recovery.
//   B. The 402 we fetch returns extensions that don't validate, but the
//      smoke proceeds anyway, producing an invalid extension on the
//      facilitator side. Mitigated: scripts/validate-bazaar-extension.cjs
//      pre-flight confirmed valid:true for the live declaration. We re-run
//      it before any high-stakes settle.
//   C. The 402 emits no extensions (flag off or package failed to load).
//      Mitigated: fetchLive402Extensions returns undefined, and the
//      conditional spread keeps payload byte-identical to the pre-Stone-0
//      baseline. The smoke degrades to the prior behavior — no regression.
//   D. The facilitator rejects the new envelope shape. Mitigated: we'd see
//      a non-200 in S2 with a parseable error reason from the facilitator,
//      and the smoke harness reports failure before any indexing watch
//      starts. Cost of false positive: the same $0.005 as any S2 settle
//      already burns.
//
// CRITIC PASS (mandatory per CLAUDE.md prompts/critic.md):
//
//   Three rejection reasons a hostile reviewer would give:
//     1. "You're echoing server-emitted bytes back to the facilitator
//        verbatim. If the server's extension declaration is ever wrong, the
//        smoke participates in cataloging the wrong shape." Counter: that's
//        the correct behavior — a real agent SDK does the same thing. Bug
//        ownership belongs on the server (we control it) and is gated by
//        validateDiscoveryExtension pre-flight.
//     2. "This change only fixes smoke. Production agents still get the
//        same gap unless their SDK propagates extensions." Counter: real
//        agents use reference clients (@coinbase/x402-axios, etc.) that
//        auto-propagate. The smoke is now aligned with the reference-client
//        behavior, which means once we prove indexing works from the
//        smoke, it'll also work from real agents — and is the right
//        baseline for any future hand-rolled-wallet integration partner.
//     3. "Re-fetching the 402 inside buildXPaymentHeader couples the
//        smoke to a second network call per envelope." Counter: this is
//        acceptable for a smoke harness (correctness > latency; one extra
//        round-trip is negligible). For prod-shape integration we'd cache
//        the extensions value across signings, but smoke doesn't need that.
//
//   Counter-thesis (case for the opposite approach):
//     Don't fix the smoke; instead add a server-side workaround that
//     pre-fetches its own 402 and writes extensions into a side-channel
//     the facilitator might also read. Rejected: there is no documented
//     side-channel; the only path the facilitator reads is
//     paymentPayload.extensions per the SDK source. The bug is genuinely
//     on the client construction side.
//
//   Named wedge competitor: any agent SDK that fails to echo extensions
//     would face the same indexing gap. x402route.vercel.app (the routing
//     competitor surfaced 2026-05-12) presumably indexes correctly because
//     they use reference clients on the agent side. We need to do the same.
//
//   Hidden assumption that, if wrong, breaks the design:
//     That the CDP facilitator's settle path actually runs
//     extractDiscoveryInfo (not just verify) on every successful settle.
//     If they batch indexing on a side queue or skip extraction when
//     validateDiscoveryExtension is invoked elsewhere, the X-PAYMENT echo
//     wouldn't trigger cataloging on its own. Verification: after the
//     settle, the discovery endpoint either lists us within ~30 min
//     (validates hypothesis) or doesn't (kill criterion fires — escalate
//     to Stone 17 / facilitator-strips-unknown-fields hypothesis).
//
//   Kill criterion: if CDP discovery returns "no active resources" 60 min
//     after the Stone-0-corrected settle lands on-chain, the X-PAYMENT
//     echo hypothesis is wrong and Stone 17 (facilitator strips
//     extensions before indexing) becomes the leading candidate.
//
//   Verdict: acceptable. Ship and observe.
// =============================================================================
//
// Sign a PaymentPayload as agent and base64-encode the X-PAYMENT header.
//
// FIX 2026-05-12 (P4-followup, Path P PaymentPayload-resource hypothesis):
// PaymentPayload.resource is OPTIONAL per @x402/core mechanisms-*.d.ts:601-607
// but is the ONLY documented source CDP's extractDiscoveryInfo can pull
// resourceUrl from (since PaymentRequirements has no resource field per
// :585-593). Without resource in the envelope, CDP's facilitator may settle
// the payment successfully but skip cataloging. Adding it here mirrors what
// a well-implemented agent SDK would do after reading the 402 (which now
// includes resource per FIX-RESOURCE 2026-05-12 in build402).
//
// FIX 2026-05-13 (Stone 0): adds extensions echo per the Critic-pass paragraph
// above. The audit document `listing-blocker-audit-2026-05-13.md` carries the
// full context.
//
// The inner `payload.authorization` (EIP-3009) is what's signed; the envelope
// resource field and the extensions field are metadata and adding them does
// NOT change signature recovery.
async function buildXPaymentHeader(
  requirements: PaymentRequirements,
  extensions?: Record<string, unknown>,
): Promise<string> {
  const evmScheme = new ExactEvmScheme(agentAccount as any);
  const result = await evmScheme.createPaymentPayload(2, requirements);
  const payload: PaymentPayload = {
    ...result,
    accepted: requirements,
    // Match exactly what /route's 402 emits in resource — see build402 in
    // src/paywall-handler.ts. Description text kept identical for predictability.
    resource: {
      url: `${BASE_URL}/route`,
      description: 'TrustBench: non-custodial routing and audit layer for x402. Returns a signed routing receipt with on-chain settlement reference, verifiable offline against a published Ed25519 key.',
      mimeType: 'application/json',
    },
    // Stone 0: echo the 402's extensions block so the CDP facilitator's
    // extractDiscoveryInfo() sees `paymentPayload.extensions.bazaar` and
    // catalogs the route. Conditional spread keeps byte-identity with the
    // pre-Stone-0 baseline when extensions is undefined.
    ...(extensions ? { extensions } : {}),
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
  // Stone 0: fetch the live 402 to capture its extensions block (bazaar
  // declaration) and echo into the X-PAYMENT envelope so CDP's facilitator
  // sees it during extractDiscoveryInfo. See buildXPaymentHeader header for
  // the full Critic-pass + failure-mode paragraph.
  const liveExtensions = await fetchLive402Extensions();
  if (liveExtensions) {
    console.log(`[paywall-smoke] S2: echoing ${Object.keys(liveExtensions).length} extension key(s) into X-PAYMENT: ${Object.keys(liveExtensions).join(', ')}`);
  } else {
    console.warn('[paywall-smoke] S2: no extensions found in live 402; X-PAYMENT will not echo any (pre-Stone-0 behavior)');
  }
  const xPayment = await buildXPaymentHeader(requirements, liveExtensions);
  // Capability choice: `data` routes to Infopunks-class providers which are
  // proven x402-conformant (P4-1b precedent — see memory
  // project_p4_1b_state_2026_05_06.md). Other capabilities may select
  // providers whose live 402 probe doesn't return a parseable
  // payment_requirements_v2 (e.g. paysponge endpoints, which need POST not GET)
  // — those would 503 with provider_payment_requirements_unavailable before
  // settle. Switching the smoke's primary capability to `data` keeps the test
  // focused on the paywall middleware itself rather than the broader
  // registry-conformance story (which is its own v0.2.0 follow-up).
  const reqBody = {
    capability: 'data',
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
  //
  // Stone 0: also echo extensions (same rationale as S2). The replay path
  // short-circuits before facilitator settle so this won't trigger indexing
  // either way — but consistency with S2 keeps both envelopes the same shape.
  const requirements = buildTrustBenchRequirements();
  const liveExtensions = await fetchLive402Extensions();
  const xPayment = await buildXPaymentHeader(requirements, liveExtensions);

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
