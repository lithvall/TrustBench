// scripts/mock-provider.ts — local x402 mock for Phase 3 smoke testing.
//
// What this is:
//   A tiny Hono server on port 3001 that imitates an x402-conforming
//   provider just well enough that TrustBench's /route quoteHandler can
//   probe it, get a valid 402 challenge, and pass validation.
//
// What this is NOT:
//   - On-chain. No tx is submitted. The X-PAYMENT-RESPONSE returns a
//     random "looks-like-a-tx-hash" string. Real verification on Base
//     would fail. Use this for wire-shape validation only.
//   - A signature verifier. The X-PAYMENT body is decoded for shape
//     but the ECDSA signature is NOT verified. Real providers do.
//   - Production-grade. There's no auth, rate limiting, persistence,
//     or anything resembling correctness for real money.
//
// Usage:
//   npm run mock-provider
//   # then in Supabase SQL editor, run the INSERTs at the bottom of
//   # this file to register the mock as a provider with score 99.
//   # Re-run the smoke test:
//   #   POST /route capability=search → should now succeed with route_id
//
// Cleanup when done (also at the bottom of this file).

import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import crypto from 'crypto';

const app = new Hono();

// Constants — these match what the Phase 3 quoteHandler expects.
const USDC_ON_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const MOCK_RECIPIENT = '0x000000000000000000000000000000000000Beef';
const MOCK_AMOUNT_ATOMIC = '1000';            // $0.001 — well below the test agent's $0.01 max_price

// GET / handles both the probe (no X-PAYMENT → 402) and the settle
// (with X-PAYMENT → 200 + faked X-PAYMENT-RESPONSE).
app.get('/', async (c) => {
  const xPayment = c.req.header('X-PAYMENT') || c.req.header('x-payment');

  if (!xPayment) {
    // ---- Probe branch — return a conforming 402 challenge -----------
    const now = Math.floor(Date.now() / 1000);
    const challenge = {
      scheme: 'eip3009',
      network: 'base',
      asset_address: USDC_ON_BASE,
      recipient: MOCK_RECIPIENT,
      amount: MOCK_AMOUNT_ATOMIC,
      decimals: 6,
      valid_after: now - 60,
      valid_before: now + 600,                // 10 minutes
      nonce: '0x' + crypto.randomBytes(32).toString('hex'),
    };
    console.log('[mock] 402 challenge issued', { nonce: challenge.nonce.slice(0, 18) + '…' });
    return c.json(challenge, 402);
  }

  // ---- Settle branch — fake the on-chain submit -------------------
  let parsed: any = null;
  try {
    const decoded = Buffer.from(xPayment, 'base64').toString('utf8');
    parsed = JSON.parse(decoded);
  } catch (e: any) {
    console.warn('[mock] X-PAYMENT decode failed:', e?.message);
    return c.json({ error: 'malformed X-PAYMENT' }, 402);
  }

  // Lightweight shape check — real providers verify the ECDSA signature
  // here. We just confirm the envelope looks plausible. Accept both v0.x
  // (`{authorization, signature}`) and v2 (`{x402Version, scheme, network,
  // payload: {signature, authorization}}`) shapes for graceful migration —
  // route-handlers.ts buildXPaymentHeader was updated to v2 on 2026-05-05
  // for Coinbase CDP facilitator compatibility, and the mock should follow.
  const inner = (parsed && typeof parsed === 'object' && parsed.payload && typeof parsed.payload === 'object')
    ? parsed.payload
    : parsed;
  if (!inner || typeof inner !== 'object' || !inner.authorization || !inner.signature) {
    console.warn('[mock] X-PAYMENT missing authorization or signature');
    return c.json({ error: 'X-PAYMENT missing authorization or signature' }, 402);
  }
  const auth = inner.authorization;
  const requiredFields = ['from', 'to', 'value', 'validAfter', 'validBefore', 'nonce'];
  for (const f of requiredFields) {
    if (!auth[f]) {
      console.warn('[mock] X-PAYMENT.authorization missing', f);
      return c.json({ error: `X-PAYMENT.authorization missing ${f}` }, 402);
    }
  }

  // Fake tx_hash — looks like a real one, isn't on-chain.
  const fakeTxHash = '0x' + crypto.randomBytes(32).toString('hex');
  const xPaymentResponse = Buffer.from(JSON.stringify({
    tx_hash: fakeTxHash,
    network: 'base',
    settled_at_block: 12345678,
  }), 'utf8').toString('base64');

  console.log('[mock] 200 settle (faked tx_hash)', { tx_hash: fakeTxHash.slice(0, 18) + '…' });
  return c.json(
    {
      hello: 'mock x402 provider response',
      received_authorization: auth,
      note: 'this is a mock — tx_hash is faked, no real settlement happened',
    },
    200,
    { 'X-PAYMENT-RESPONSE': xPaymentResponse }
  );
});

// Health check
app.get('/health', (c) => c.json({ status: 'ok', mock: true }));

const port = Number(process.env.MOCK_PROVIDER_PORT) || 3001;
serve({ fetch: app.fetch, port });

console.log(`🎭 Mock x402 provider on http://localhost:${port}`);
console.log(`   Probe: curl http://localhost:${port}/                            (returns 402)`);
console.log(`   Settle: curl -H "X-PAYMENT: <b64>" http://localhost:${port}/     (returns 200)`);
console.log('');
console.log('Register in Supabase SQL editor before smoke-testing /route:');
console.log('   insert into providers (url, name, capability, description, pay_to)');
console.log(`   values ('http://localhost:${port}/', 'mock-x402', 'search',`);
console.log(`     'Phase 3 smoke-test mock — not a real provider', '${MOCK_RECIPIENT}')`);
console.log('   on conflict (url) do nothing;');
console.log('');
console.log('   insert into scorecards (provider_id, capability, score, latency_p50, latency_p95, uptime_7d, last_updated)');
console.log(`   values ('http://localhost:${port}/', 'search', 99, 5, 10, 100, now())`);
console.log('   on conflict (provider_id) do update');
console.log(`     set score = 99, latency_p50 = 5, last_updated = now();`);
