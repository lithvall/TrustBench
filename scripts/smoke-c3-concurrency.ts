// scripts/smoke-c3-concurrency.ts — C3 load-bearing concurrency smoke for P4-7.
//
// Pairs with: phase4-smoke-c1-c4.md § "C3 — concurrency cap honored to the byte"
//
// Fires N concurrent /route quotes against a test agent whose rolling cap is
// `(N − 1) × max_price` — i.e. exactly enough room for two successes. With
// SPEND_CAP_RESERVATION_ENABLED=true we expect: exactly 2 success (200) + 1
// reject (429 rolling_cap_exceeded). With the flag off, all 3 succeed and the
// cap is breached — that's the Phase 3 race this work closes.
//
// Usage:
//   $env:TRUSTBENCH_BASE_URL = "http://localhost:3000"
//   $env:SMOKE_AGENT_KEY = "tb_test_<smoke-agent-key>"
//   npx tsx scripts/smoke-c3-concurrency.ts
//
// Defaults to 3 concurrent quotes at max_price=10000 atomic units ($0.01).
// Test agent must have rolling cap = 20000 (=$0.02 = 2 × max_price) and an
// empty receipts/quotes/idempotency state for clean pre-flight.

const BASE = process.env.TRUSTBENCH_BASE_URL || 'http://localhost:3000';
const KEY = process.env.SMOKE_AGENT_KEY;
const PARALLEL = Number(process.env.SMOKE_PARALLEL || '3');
const MAX_PRICE = process.env.SMOKE_MAX_PRICE || '10000';
const PAYER = '0x0000000000000000000000000000000000000001';

if (!KEY) {
  console.error('FAIL — SMOKE_AGENT_KEY not set. Provision a test agent and export the API key first.');
  process.exit(2);
}

async function fireOneQuote(idemKey: string): Promise<{ status: number; body: any }> {
  const resp = await fetch(`${BASE}/route`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${KEY}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': idemKey,
    },
    body: JSON.stringify({
      capability: 'search',
      max_price: MAX_PRICE,
      payer_address: PAYER,
    }),
  });
  const body = await resp.json().catch(() => null);
  return { status: resp.status, body };
}

async function main() {
  console.log(`[c3] firing ${PARALLEL} concurrent quotes at max_price=${MAX_PRICE} against ${BASE}`);
  console.log(`[c3] expected: ${PARALLEL - 1} × 200 + 1 × 429 (rolling_cap_exceeded)`);

  // Distinct idempotency keys — each request is a separate logical call.
  const idems = Array.from({ length: PARALLEL }, () =>
    'smoke-c3-' + Math.random().toString(36).slice(2, 14)
  );

  // Promise.all fires them in parallel. Node's fetch implementation will
  // dispatch all of them on the next microtask before any awaits land —
  // close enough to "concurrent at the server" for the cap-edge test.
  const results = await Promise.all(idems.map(fireOneQuote));

  let successes = 0;
  let capExceeded = 0;
  let other = 0;

  for (const r of results) {
    if (r.status === 200) {
      successes++;
      const routeId = r.body?.route_id ?? '?';
      console.log(`[c3] result: status=200 (route_id=${routeId})`);
    } else if (r.status === 429 && r.body?.error === 'rolling_cap_exceeded') {
      capExceeded++;
      const spent = r.body?.spent_atomic ?? '?';
      const cap = r.body?.cap_atomic ?? '?';
      console.log(`[c3] result: status=429 (error=rolling_cap_exceeded; spent=${spent} cap=${cap})`);
    } else {
      other++;
      console.log(`[c3] result: status=${r.status} body=${JSON.stringify(r.body)}`);
    }
  }

  const expectedSuccesses = PARALLEL - 1;
  const expectedRejected = 1;
  const passed = successes === expectedSuccesses && capExceeded === expectedRejected && other === 0;

  if (passed) {
    console.log(`[c3] PASS — exactly ${expectedSuccesses} successes + ${expectedRejected} 429`);
    process.exit(0);
  } else {
    console.error(
      `[c3] FAIL — got ${successes} successes + ${capExceeded} 429 + ${other} other ` +
      `(expected ${expectedSuccesses} + ${expectedRejected} + 0)`,
    );
    if (successes > expectedSuccesses) {
      console.error(`[c3] Likely cause: SPEND_CAP_RESERVATION_ENABLED is not 'true' OR the cap-check WHERE clause is too loose.`);
    }
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('[c3] unexpected exception:', err?.message ?? err);
  process.exit(2);
});
