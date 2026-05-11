// scripts/post-to-x.js
//
// Daily autonomous X post.
//
// Solo-founder rule (CLAUDE.md): zero manual daily work. The script picks
// today's post based on day-of-year, fetches live registry stats when needed,
// and falls through to static templates if the fetch fails. No scheduling
// state file, no manual queue, no randomness.
//
// Content mix (week-over-week, 7-day rotation):
//   3 days/week — live registry pulse (data fetched at run time)
//   2 days/week — methodology rotation (static, honest-framing)
//   2 days/week — build-in-public (static, manually appended on shipped work)
//
// Honest-framing rules (CLAUDE.md):
//   - The probe is a HEAD-based liveness check, NOT a benchmark.
//   - State what we measure AND what we don't.
//   - Phase 3 (POST /route + Ed25519 receipts + idempotency + reservation
//     caps) IS shipped. Public milestone receipts exist.
//   - Phase 4 paywall design is committed; implementation is in flight, not
//     yet GA. Phrase as "designed" or "in flight," never as "live."
//   - Pricing is flat per-tx, never % spread (Phase 2 validated this).
//   - Non-custodial: agent signs, provider settles, TrustBench routes/attests.
//   - No em-dashes anywhere in post copy (em-dashes read as AI-prompting tell
//     in outreach, per memory feedback_no_em_dashes_outreach.md).
//
// To rotate copy: edit the relevant array (METHODOLOGY_NOTES,
// BUILD_IN_PUBLIC, or the templates inside todaysMessage). Twitter counts
// URLs as 23 chars regardless of actual length. Keep each post under 280.
//
// Local preview (won't post if env vars are missing):
//   node scripts/post-to-x.js --dry-run

import 'dotenv/config';
// twitter-api-v2 is lazy-imported below so --dry-run works without
// node_modules installed (useful for previewing on a fresh clone or in CI
// before npm ci has run).

// -----------------------------------------------------------------------------
// URLs (canonical domain, post-DNS-flip 2026-05-06).
// -----------------------------------------------------------------------------
const BASE_URL = 'https://trustbench.io';
const RANKINGS_URL = `${BASE_URL}/rankings`;
const METHODOLOGY_URL = `${BASE_URL}/methodology`;
const REGISTRY_SUMMARY_URL = `${BASE_URL}/metrics/registry-summary`;
const RECEIPTS_PATH = `${BASE_URL}/receipts`;

// Public milestone receipt (P4-1b first paid x402 receipt, 2026-05-06).
// Used as a concrete example link when a build-in-public template references
// it. Hardcoded because it's stable and verifiable.
const MILESTONE_RECEIPT_ID = 'rcpt_01KQY7C44GAPSXZPFQYRZ1D10C';

// -----------------------------------------------------------------------------
// Static content arrays.
// -----------------------------------------------------------------------------

// Methodology rotation. Honest framing about what the prober measures and
// what it doesn't. Each entry is one short post that points at the full
// methodology page. Append to grow the rotation.
const METHODOLOGY_NOTES = [
  `How TrustBench treats 4xx responses: 401, 402, 403, 404, 405, 429 all count as "alive." ` +
    `Cold-start endpoints commonly return 4xx before serving traffic. We say what we measure, including its limits.\n\n` +
    `${METHODOLOGY_URL}`,

  `What "verified" means on /rankings: two-bit verification. ` +
    `x402_verified = we successfully completed a paid call. ` +
    `integration_type = Coinbase 1P or 3P. ` +
    `Different signals, kept distinct on purpose.\n\n${METHODOLOGY_URL}`,

  `Probe shape: HEAD request, 3 samples per endpoint, from a single host. ` +
    `That's a liveness check, not a benchmark. ` +
    `The /rankings page reports the score with that limit on the label.\n\n${METHODOLOGY_URL}`,

  `Receipts are signed at the issuer (Ed25519, JCS canonicalization), and the public key is published at ` +
    `${BASE_URL}/.well-known/trustbench-pubkey. ` +
    `That means anyone can verify a TrustBench receipt without trusting our hosted endpoint.`,

  `Pricing rule, written down: flat per-tx, never percentage spread. ` +
    `Phase 2 builders rejected the spread model directly. Flat-per-tx is the path.\n\n${METHODOLOGY_URL}`,

  `Non-custodial means: the agent wallet signs the EIP-3009 authorization, the provider submits on-chain, ` +
    `TrustBench constructs the routing decision and attests the result. ` +
    `We don't hold funds.\n\n${METHODOLOGY_URL}`,
];

// Build-in-public posts. Append a new entry at the top whenever something
// material ships. Each entry should reference a concrete artifact (URL,
// receipt, npm package, GitHub release, etc.). Drop or comment out entries
// older than ~30 days so the rotation doesn't recycle stale "shipped" claims.
const BUILD_IN_PUBLIC = [
  // Paywall v0.1.0 — design + code shipped, flag still off in prod.
  // After TRUSTBENCH_PAYWALL_ENABLED=true in prod, swap this entry for the
  // "live" variant in the comment block below.
  `Paywall design and code landed in main. /pricing page is live. ` +
    `7-row tier table, v0.1.0 ships POST /route at $0.005 per call. ` +
    `x402-native, non-custodial, settled via the public Foundation facilitator. ` +
    `Flag-off until the v0.1.1 gates' first prod smoke.\n\n${BASE_URL}/pricing`,

  // PAYWALL-LIVE VARIANT (uncomment + delete the above after flag flip):
  // `Paywall is live. POST /route returns 402, agent signs an EIP-3009 ` +
  //   `transferWithAuthorization for $0.005, x402 facilitator settles on Base, ` +
  //   `we return an Ed25519-signed routing receipt. Non-custodial end-to-end. ` +
  //   `Full tier table at ${BASE_URL}/pricing.`,

  `Shipped @trustbench/verify-receipt v0.1.0 on npm. ` +
    `Standalone third-party verifier, 64-byte Ed25519 signatures, JCS canonicalization. ` +
    `Means you can audit any TrustBench receipt without trusting our hosted endpoint.\n\n` +
    `https://www.npmjs.com/package/@trustbench/verify-receipt`,

  `First paid x402 receipt against a real provider: ` +
    `Ed25519-signed envelope, on-chain settled on Base, third-party verifiable. ` +
    `Click the link to see the verification badges render.\n\n` +
    `${RECEIPTS_PATH}/${MILESTONE_RECEIPT_ID}`,

  `Phase 3 closed: /route handler + reservation-based spend caps + idempotency keys + Ed25519 receipts + replayable audit. ` +
    `The four primitives Phase 2 builders said were table stakes, all live.\n\n${BASE_URL}`,
];

// -----------------------------------------------------------------------------
// Live registry pulse template.
//
// Fetches /metrics/registry-summary which returns:
//   { endpointCount, receiptsLast30Days, medianLatencyMs, generated_at }
//
// Server-side cached 60s, so calling this once per day is cheap. If the
// fetch fails (network, deploy in progress, etc.), we fall through to the
// methodology rotation as the day's post — never silently skip a day.
// -----------------------------------------------------------------------------
async function fetchRegistryPulse() {
  // Node 20+ has native fetch; no extra dependency.
  const res = await fetch(REGISTRY_SUMMARY_URL, {
    headers: { 'Accept': 'application/json' },
    // Short timeout so a stuck deploy doesn't hang the cron job.
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) {
    throw new Error(`registry-summary returned HTTP ${res.status}`);
  }
  const data = await res.json();
  // Defensive: server may legitimately return null for any field if a query
  // failed. Render the parts we have, skip the rest.
  return {
    endpointCount: data.endpointCount ?? null,
    receiptsLast30Days: data.receiptsLast30Days ?? null,
    medianLatencyMs: data.medianLatencyMs ?? null,
  };
}

function renderRegistryPulse(stats) {
  // Build the message conditionally so a missing field doesn't print "null."
  const parts = [];
  if (stats.endpointCount !== null) {
    parts.push(`${stats.endpointCount} x402 endpoints in the registry`);
  }
  if (stats.medianLatencyMs !== null) {
    parts.push(`${stats.medianLatencyMs}ms median latency`);
  }
  if (stats.receiptsLast30Days !== null) {
    parts.push(`${stats.receiptsLast30Days} signed receipts in the last 30 days`);
  }

  if (parts.length === 0) {
    // All three fields missing means the API responded but every field came
    // back null. Don't post a misleading "0 endpoints" message; throw so the
    // caller falls through to a static template.
    throw new Error('registry-summary returned no usable fields');
  }

  return (
    `Registry pulse: ${parts.join(', ')}. ` +
    `Nightly liveness telemetry across Base and Solana. ` +
    `HEAD probe, 3 samples per endpoint, from a single host. ` +
    `Live: ${RANKINGS_URL}`
  );
}

// -----------------------------------------------------------------------------
// Day-of-year rotation logic.
//
// 7-day cycle, mapped:
//   day 0, 2, 4 (Sun, Tue, Thu) - registry pulse
//   day 1, 5    (Mon, Fri)      - methodology rotation
//   day 3, 6    (Wed, Sat)      - build-in-public
//
// Day-of-week is derived from day-of-year mod 7 so it's deterministic and
// has no calendar-week dependency. Within methodology and build-in-public,
// pick the entry by full day-of-year to give a stable but rotating choice.
// -----------------------------------------------------------------------------
function pickCategory(dayOfYear) {
  const slot = dayOfYear % 7;
  if (slot === 0 || slot === 2 || slot === 4) return 'pulse';
  if (slot === 1 || slot === 5) return 'methodology';
  return 'build';
}

function pickStaticEntry(arr, dayOfYear) {
  return arr[dayOfYear % arr.length];
}

function dayOfYearUtc(now) {
  const start = Date.UTC(now.getUTCFullYear(), 0, 0);
  const diff = now.getTime() - start;
  return Math.floor(diff / 86_400_000);
}

async function todaysMessage() {
  const dayOfYear = dayOfYearUtc(new Date());
  const category = pickCategory(dayOfYear);

  if (category === 'pulse') {
    try {
      const stats = await fetchRegistryPulse();
      return { text: renderRegistryPulse(stats), source: 'pulse' };
    } catch (err) {
      console.warn(`[post-to-x] live pulse fetch failed, falling through to methodology: ${err.message}`);
      return { text: pickStaticEntry(METHODOLOGY_NOTES, dayOfYear), source: 'methodology-fallback' };
    }
  }

  if (category === 'methodology') {
    return { text: pickStaticEntry(METHODOLOGY_NOTES, dayOfYear), source: 'methodology' };
  }

  // Build-in-public. If the array shrinks to empty (all entries pruned for
  // staleness), fall through to methodology rather than skip.
  if (BUILD_IN_PUBLIC.length === 0) {
    console.warn('[post-to-x] BUILD_IN_PUBLIC is empty, falling through to methodology');
    return { text: pickStaticEntry(METHODOLOGY_NOTES, dayOfYear), source: 'build-fallback' };
  }
  return { text: pickStaticEntry(BUILD_IN_PUBLIC, dayOfYear), source: 'build' };
}

// -----------------------------------------------------------------------------
// Env-var validation. Fail-fast with a clear message that surfaces in the
// GitHub Actions log if any of the four credentials are missing or empty.
// -----------------------------------------------------------------------------
function validateEnv() {
  const required = ['X_CONSUMER_KEY', 'X_CONSUMER_SECRET', 'X_ACCESS_TOKEN', 'X_ACCESS_TOKEN_SECRET'];
  const missing = required.filter(name => !process.env[name] || process.env[name].trim() === '');
  if (missing.length > 0) {
    throw new Error(
      `Missing required env vars for X post: ${missing.join(', ')}. ` +
      `Set these as GitHub Actions secrets on the repo (Settings > Secrets and variables > Actions).`
    );
  }
}

// -----------------------------------------------------------------------------
// Entry point.
// -----------------------------------------------------------------------------
const isDryRun = process.argv.includes('--dry-run');

(async () => {
  try {
    if (!isDryRun) {
      validateEnv();
    }

    const { text, source } = await todaysMessage();
    console.log(`[post-to-x] category=${source} length=${text.length} chars`);
    console.log('---');
    console.log(text);
    console.log('---');

    if (text.length > 280) {
      // Twitter rejects >280; safer to fail-loud than truncate silently.
      throw new Error(`Post too long: ${text.length} chars (max 280). Edit the template.`);
    }

    if (isDryRun) {
      console.log('[post-to-x] dry-run mode, not posting');
      return;
    }

    // Lazy-load the Twitter SDK only when we're actually going to post, so
    // dotenv-only --dry-run runs work on a fresh clone before `npm ci`.
    const { TwitterApi } = await import('twitter-api-v2');
    const client = new TwitterApi({
      appKey: process.env.X_CONSUMER_KEY,
      appSecret: process.env.X_CONSUMER_SECRET,
      accessToken: process.env.X_ACCESS_TOKEN,
      accessSecret: process.env.X_ACCESS_TOKEN_SECRET,
    });

    await client.v2.tweet(text);
    console.log('[post-to-x] daily post sent successfully');
  } catch (err) {
    // Print the error clearly so it's discoverable in the GitHub Actions log.
    console.error('[post-to-x] post failed:', err && err.message ? err.message : err);
    if (err && err.data) {
      console.error('[post-to-x] Twitter API response:', JSON.stringify(err.data, null, 2));
    }
    process.exitCode = 1;
  }
})();
