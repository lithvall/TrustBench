// scripts/smoke-paid-requests.ts
// =============================================================================
// Phase 4 v0.1.0 paywall — Sprint Day 1 smoke
// =============================================================================
// Validates that phase4-schema-paid-requests.sql applied correctly and that
// RLS gates anon-role access as intended. Runs after the migration is applied
// in the Supabase SQL editor (or via supabase db push).
//
// Listing plan § 2 Day 1 wording: "INSERT a test row from a service-role client,
// SELECT from an anon-role client with a wallet match, confirm row visibility
// works." Adjusted to the actual deployed RLS (service-role-only per
// phase4-schema-paid-requests.sql Deviation 2) — we now confirm the OPPOSITE:
// the anon role MUST NOT see paid_requests rows. If it can, RLS is misconfigured.
//
// Checks (5):
//   S1. Service-role INSERT writes a row (table exists, columns match schema).
//   S2. Service-role SELECT reads the row back.
//   S3. Anon-role SELECT returns zero rows (RLS denial — the row exists but is
//       not visible without service-role).
//   S4. Anon-role INSERT fails (RLS denial on write).
//   S5. Service-role DELETE cleans up the test row so the smoke is rerun-safe.
//
// All 5 must pass. Exit code: 0 = pass, 1 = bad env, 2 = any check failed.
//
// Failure modes if the smoke itself is wrong:
//   - Service-role key misconfigured → S1 errors with permission denied. Same
//     failure as the real prod write path; surfaces real misconfiguration.
//   - Anon-role key misconfigured → S3/S4 may falsely succeed or falsely fail.
//     Mitigated by S3 explicitly checking the row count, not just absence of
//     error: a successful SELECT returning rows fails the smoke even if it
//     doesn't throw.
// =============================================================================

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { ulid } from 'ulid';

// -----------------------------------------------------------------------------
// Env validation
// -----------------------------------------------------------------------------
function required(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === '') {
    console.error(`[smoke-paid-requests] FATAL: env var ${name} missing`);
    process.exit(1);
  }
  return v.trim();
}

const SUPABASE_URL = required('SUPABASE_URL');
const SUPABASE_SECRET_KEY = required('SUPABASE_SECRET_KEY');
const SUPABASE_PUBLISHABLE_KEY = required('SUPABASE_PUBLISHABLE_KEY');

// -----------------------------------------------------------------------------
// Clients
// -----------------------------------------------------------------------------
// Service-role client — bypasses RLS. Used for legitimate server-side writes.
const serviceClient = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Anon-role client — subject to RLS. Used here as the adversary: any agent
// that connects directly to Supabase with the public anon key.
const anonClient = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// -----------------------------------------------------------------------------
// Smoke
// -----------------------------------------------------------------------------
type CheckResult = { name: string; ok: boolean; detail: string };

async function main() {
  const testAgent = `0x${'a'.repeat(40)}`;       // synthetic test wallet
  const testEndpoint = `/smoke-${ulid().slice(0, 12)}`;
  const testIdempotencyKey = `smoke-${ulid()}`;
  const results: CheckResult[] = [];

  console.log('[smoke-paid-requests] === Phase 4 v0.1.0 paywall — Day 1 smoke ===');
  console.log(`[smoke-paid-requests] test agent     : ${testAgent}`);
  console.log(`[smoke-paid-requests] test endpoint  : ${testEndpoint}`);

  // ---------------------------------------------------------------------------
  // S1. Service-role INSERT
  // ---------------------------------------------------------------------------
  const testRow = {
    endpoint: testEndpoint,
    agent_address: testAgent,
    tx_hash: '0x' + 'b'.repeat(64),
    block_number: 12345678,
    amount_usdc: '0.005',
    request_payload_hash: 'sha256-' + 'c'.repeat(64),
    response_signature: 'ed25519-test-' + ulid(),
    idempotency_key: testIdempotencyKey,
  };

  const insRes = await serviceClient
    .from('paid_requests')
    .insert(testRow)
    .select('id')
    .single();

  if (insRes.error) {
    results.push({
      name: 'S1 service-role INSERT',
      ok: false,
      detail: `failed: ${insRes.error.message}`,
    });
    // If S1 fails, the rest can't run meaningfully. Print results and exit.
    printAndExit(results);
  } else {
    results.push({
      name: 'S1 service-role INSERT',
      ok: true,
      detail: `id=${insRes.data!.id}`,
    });
  }
  const testRowId = insRes.data!.id;

  // ---------------------------------------------------------------------------
  // S2. Service-role SELECT
  // ---------------------------------------------------------------------------
  const selRes = await serviceClient
    .from('paid_requests')
    .select('id, endpoint, agent_address, idempotency_key')
    .eq('id', testRowId)
    .single();

  if (selRes.error || !selRes.data) {
    results.push({
      name: 'S2 service-role SELECT',
      ok: false,
      detail: `expected to read back inserted row, got ${selRes.error?.message ?? 'no rows'}`,
    });
  } else if (selRes.data.endpoint !== testEndpoint || selRes.data.agent_address !== testAgent) {
    results.push({
      name: 'S2 service-role SELECT',
      ok: false,
      detail: `column mismatch: got endpoint=${selRes.data.endpoint} agent=${selRes.data.agent_address}`,
    });
  } else {
    results.push({
      name: 'S2 service-role SELECT',
      ok: true,
      detail: `row visible with matching columns`,
    });
  }

  // ---------------------------------------------------------------------------
  // S3. Anon-role SELECT (must return ZERO rows under service-role-only RLS)
  // ---------------------------------------------------------------------------
  // Even if the anon-role query "succeeds" (no Postgres error), it must
  // return no rows because the only deployed policy is service-role-full.
  // A non-zero result here means RLS is misconfigured or a public-read
  // policy snuck in somewhere.
  const anonRes = await anonClient
    .from('paid_requests')
    .select('id, agent_address')
    .eq('id', testRowId);

  if (anonRes.error) {
    // Some Supabase configs surface RLS denial as an error code rather than
    // an empty result. Either shape counts as "anon cannot see it."
    results.push({
      name: 'S3 anon-role SELECT blocked',
      ok: true,
      detail: `anon SELECT returned error (RLS denial): ${anonRes.error.message}`,
    });
  } else if (!anonRes.data || anonRes.data.length === 0) {
    results.push({
      name: 'S3 anon-role SELECT blocked',
      ok: true,
      detail: 'anon SELECT returned zero rows (RLS denial)',
    });
  } else {
    // BAD: anon can see the row. RLS is broken.
    results.push({
      name: 'S3 anon-role SELECT blocked',
      ok: false,
      detail: `LEAK: anon SELECT returned ${anonRes.data.length} row(s) — paid_requests is readable by anyone with the publishable key`,
    });
  }

  // ---------------------------------------------------------------------------
  // S4. Anon-role INSERT (must fail)
  // ---------------------------------------------------------------------------
  const anonInsRes = await anonClient
    .from('paid_requests')
    .insert({
      endpoint: '/smoke-anon-attack',
      agent_address: '0x' + 'd'.repeat(40),
      amount_usdc: '999.999999',
    })
    .select('id');

  if (anonInsRes.error) {
    results.push({
      name: 'S4 anon-role INSERT blocked',
      ok: true,
      detail: `anon INSERT denied: ${anonInsRes.error.message}`,
    });
  } else if (!anonInsRes.data || anonInsRes.data.length === 0) {
    // Some configs swallow the denial and return [] instead of an error.
    // Treat as blocked for the purpose of the smoke, but flag.
    results.push({
      name: 'S4 anon-role INSERT blocked',
      ok: true,
      detail: 'anon INSERT returned no rows (likely RLS denial without error)',
    });
  } else {
    // BAD: anon successfully wrote a row.
    const leakedId = anonInsRes.data[0].id;
    results.push({
      name: 'S4 anon-role INSERT blocked',
      ok: false,
      detail: `LEAK: anon successfully inserted id=${leakedId} — any caller with the publishable key can forge paid_requests rows`,
    });
    // Best-effort cleanup of the leaked row so the smoke is rerun-safe.
    await serviceClient.from('paid_requests').delete().eq('id', leakedId);
  }

  // ---------------------------------------------------------------------------
  // S5. Service-role DELETE — cleanup
  // ---------------------------------------------------------------------------
  const delRes = await serviceClient
    .from('paid_requests')
    .delete()
    .eq('id', testRowId);

  if (delRes.error) {
    results.push({
      name: 'S5 service-role DELETE cleanup',
      ok: false,
      detail: `failed: ${delRes.error.message}`,
    });
  } else {
    results.push({
      name: 'S5 service-role DELETE cleanup',
      ok: true,
      detail: 'test row removed',
    });
  }

  printAndExit(results);
}

function printAndExit(results: CheckResult[]): never {
  console.log('');
  console.log('[smoke-paid-requests] results:');
  for (const r of results) {
    console.log(`  ${r.ok ? 'PASS' : 'FAIL'}  ${r.name}  —  ${r.detail}`);
  }
  const failed = results.filter((r) => !r.ok);
  console.log('');
  if (failed.length === 0) {
    console.log('[smoke-paid-requests] === ALL CHECKS PASSED ===');
    process.exit(0);
  } else {
    console.log(`[smoke-paid-requests] === ${failed.length} CHECK(S) FAILED ===`);
    process.exit(2);
  }
}

main().catch((e) => {
  console.error('[smoke-paid-requests] uncaught error:', e);
  process.exit(99);
});
