// scripts/check-bazaar-indexed.ts
//
// Daily probe for CDP Bazaar / agentic.market indexing of trustbench.io/route.
//
// What it does
// ------------
// Hits the CDP merchant-discovery endpoint with our revenue wallet's payTo.
// If `resources` array is non-empty → trustbench.io/route is indexed; exits 0.
// Otherwise → not indexed; exits 1.
//
// On any unexpected error (fetch failure, HTTP 5xx, malformed JSON) → exits 2.
// The exit-code split lets a wrapper (GitHub Actions cron, Windows Task
// Scheduler, etc.) distinguish "not indexed yet" from "infrastructure broken."
//
// Background (2026-05-12)
// -----------------------
// Phase 4 Path P session 2026-05-12 confirmed our settle path is correct and
// FIX-RESOURCE + PaymentPayload-resource fixes shipped, but Bazaar indexing
// remained unobserved at T+30min from each settle (four real settles total
// today). Indexing may have substantially longer first-index latency for new
// payTo+URL pairs vs the ~5-15min observed for re-validation of existing
// entries. Setting up this daily probe so we observe when (if) indexing
// eventually lands without burning further $0.005 settles on each check.
//
// See `project_phase4_path_p_progress_2026_05_12.md` memory + lessons.md
// 2026-05-12 entries for full diagnosis.
//
// Usage
// -----
//   npx tsx scripts/check-bazaar-indexed.ts
//
// Env (optional)
// --------------
//   TRUSTBENCH_REVENUE_WALLET_ADDRESS — override the wallet; defaults to the
//   production revenue wallet baked in below.
//
// Cron suggestions
// ----------------
//   GitHub Actions: workflow file with `schedule: cron: "0 12 * * *"` (daily
//   noon UTC) calling `npx tsx scripts/check-bazaar-indexed.ts` and using the
//   exit code to drive a notification step.
//   Windows Task Scheduler: schedule a PowerShell action running the npx line
//   above; capture stdout to a log file; alert on exit code 0 transition.

import 'dotenv/config';

const REVENUE_WALLET =
  process.env.TRUSTBENCH_REVENUE_WALLET_ADDRESS ||
  '0x552000Ffb06445D2dD7F4264c6595B4b11C33C35';

const DISCOVERY_URL = `https://api.cdp.coinbase.com/platform/v2/x402/discovery/merchant?payTo=${REVENUE_WALLET}`;

async function main(): Promise<void> {
  const startedAt = new Date().toISOString();
  console.log(`[check-bazaar-indexed] probing at ${startedAt}`);
  console.log(`  payTo: ${REVENUE_WALLET}`);

  let response: Response;
  try {
    response = await fetch(DISCOVERY_URL);
  } catch (e: any) {
    console.error(`[check-bazaar-indexed] fetch threw: ${e?.message ?? e}`);
    process.exit(2);
  }

  // 404 is the documented "no active resources" path — treat as not-indexed,
  // not as a hard error. Everything else non-2xx is a real error.
  if (!response.ok && response.status !== 404) {
    console.error(`[check-bazaar-indexed] CDP discovery returned HTTP ${response.status}`);
    process.exit(2);
  }

  let data: any;
  try {
    data = await response.json();
  } catch (e: any) {
    console.error(`[check-bazaar-indexed] response was not JSON: ${e?.message ?? e}`);
    process.exit(2);
  }

  // Two shapes documented by CDP responses:
  //   - { errorMessage: "no active resources found...", errorType: "not_found" }
  //   - { resources: [...], pagination: {...} } OR { items: [...], pagination: {...} }
  // Handle both defensively.
  if (data && typeof data === 'object' && 'errorMessage' in data) {
    console.log(`[check-bazaar-indexed] NOT_INDEXED: ${data.errorMessage}`);
    process.exit(1);
  }

  const resources: any[] = data?.resources ?? data?.items ?? [];
  if (!Array.isArray(resources) || resources.length === 0) {
    console.log('[check-bazaar-indexed] NOT_INDEXED: empty resources list');
    process.exit(1);
  }

  console.log(`[check-bazaar-indexed] INDEXED: ${resources.length} resource(s) for ${REVENUE_WALLET}`);
  for (const r of resources.slice(0, 5)) {
    const url = typeof r.resource === 'string' ? r.resource : r.resource?.url;
    const lastUpdated = r.lastUpdated ?? '?';
    console.log(`  ${lastUpdated}  ${url}`);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(`[check-bazaar-indexed] uncaught: ${e?.message ?? e}`);
  process.exit(2);
});
