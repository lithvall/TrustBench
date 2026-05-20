// scripts/probe-x402-conformance.ts
//
// One-off diagnostic — walks /rankings for the routable capabilities on Base,
// sends an anonymous probe to each URL, and reports which return a real x402
// v2 402 challenge vs catalog noise. Written 2026-05-20 to test the assumption
// that the registry's 165+ Base candidates are all unconformant (which the
// afternoon decisions.md entry assumed without testing).
//
// Why this exists separately from src/prober.ts: prober.ts is a HEAD-based
// liveness probe — it deliberately does NOT distinguish 200/401/404/405 from
// 402, because for the score it just needs to know "is there a server at the
// other end." This diagnostic asks the orthogonal question: "does the server
// emit a parseable x402 v2 payment challenge?" That's the x402_verified=true
// bit, which is what selectProvider preferentially picks.
//
// Method:
//   - Pull /rankings?capability=<cap> for each routable capability.
//   - Filter to network=base, score>=40.
//   - For each candidate, send GET first (most x402 servers return 402 on any
//     method to advertise the requirement). On 405, retry with POST + empty
//     body, since some servers gate the 402 on the actual production method.
//   - Parse the response body for x402-shaped fields (paymentInfo.network,
//     paymentInfo.asset, paymentInfo.x402Version) to filter out 402-coincidental
//     responses from non-x402 servers.
//   - Output: confirmed-conformant list with the mark-verify command for each.
//
// Concurrency capped at 5 to avoid hammering merchants. Timeout 8s/request.
// Total wall-time: ~1-3 min for ~200 candidates.
//
// Usage:
//   npx tsx scripts/probe-x402-conformance.ts                    # all caps
//   npx tsx scripts/probe-x402-conformance.ts inference search   # specific
//
// Output: stdout = machine-readable summary table + mark-verify commands
//         stderr = progress logs
//
// Does NOT write to DB. Does NOT spend money. Pure read + probe.

const TRUSTBENCH_BASE_URL = process.env.TRUSTBENCH_BASE_URL || 'https://trustbench.io';
const TIMEOUT_MS = 8000;
const CONCURRENCY = 5;

type RankingRow = {
  provider_id: string;
  capability: string;
  network: string | null;
  score: number;
  x402_verified: boolean | null;
  integration_type: string | null;
};

type ProbeResult = {
  url: string;
  capability: string;
  current_verified: boolean;
  method: 'GET' | 'POST' | 'none';
  status: number | 'timeout' | 'error';
  is_x402_conformant: boolean;
  challenge_network: string | null;
  challenge_asset: string | null;
  challenge_version: number | null;
  notes: string;
};

async function fetchRankings(capability: string): Promise<RankingRow[]> {
  const res = await fetch(`${TRUSTBENCH_BASE_URL}/rankings?capability=${capability}`, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`/rankings?capability=${capability} returned HTTP ${res.status}`);
  }
  const json = (await res.json()) as { success?: boolean; data?: RankingRow[] };
  return json.data ?? [];
}

// Send a probe to one URL. Returns the result regardless of pass/fail —
// callers filter on is_x402_conformant.
async function probeOne(url: string, capability: string, currentVerified: boolean): Promise<ProbeResult> {
  const base: Omit<ProbeResult, 'method' | 'status' | 'is_x402_conformant' | 'challenge_network' | 'challenge_asset' | 'challenge_version' | 'notes'> = {
    url,
    capability,
    current_verified: currentVerified,
  };

  // Try GET first.
  const getResult = await tryRequest(url, 'GET');
  if (getResult.status === 402) {
    return { ...base, ...analyzeChallenge(getResult), method: 'GET' };
  }

  // If GET returned 405 (method not allowed), some x402 servers gate the 402
  // on POST. Try POST with empty body.
  if (getResult.status === 405) {
    const postResult = await tryRequest(url, 'POST');
    if (postResult.status === 402) {
      return { ...base, ...analyzeChallenge(postResult), method: 'POST' };
    }
    return {
      ...base,
      method: 'POST',
      status: postResult.status,
      is_x402_conformant: false,
      challenge_network: null,
      challenge_asset: null,
      challenge_version: null,
      notes: `GET=405, POST=${postResult.status}; not x402-conformant`,
    };
  }

  // Any non-402, non-405 GET result: report and move on.
  return {
    ...base,
    method: 'GET',
    status: getResult.status,
    is_x402_conformant: false,
    challenge_network: null,
    challenge_asset: null,
    challenge_version: null,
    notes: getResult.note,
  };
}

async function tryRequest(url: string, method: 'GET' | 'POST'): Promise<{ status: number | 'timeout' | 'error'; body: string; note: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'TrustBench-x402-Conformance-Probe/1.0',
        ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(method === 'POST' ? { body: '{}' } : {}),
    });
    clearTimeout(timer);
    const body = await res.text().catch(() => '');
    return { status: res.status, body, note: `HTTP ${res.status}` };
  } catch (err: any) {
    clearTimeout(timer);
    if (err?.name === 'AbortError') {
      return { status: 'timeout', body: '', note: 'request timed out after 8s' };
    }
    return { status: 'error', body: '', note: `fetch error: ${err?.message || err}` };
  }
}

// Parse a 402 body for x402 v2 shape. A 402 alone isn't enough — many servers
// return 402 for arbitrary reasons. Real x402 challenges have paymentInfo with
// network + asset + x402Version. Returns conformance bit + parsed fields.
function analyzeChallenge(probe: { status: number | 'timeout' | 'error'; body: string; note: string }): Pick<ProbeResult, 'status' | 'is_x402_conformant' | 'challenge_network' | 'challenge_asset' | 'challenge_version' | 'notes'> {
  if (probe.status !== 402) {
    return {
      status: probe.status,
      is_x402_conformant: false,
      challenge_network: null,
      challenge_asset: null,
      challenge_version: null,
      notes: probe.note,
    };
  }

  let parsed: any = null;
  try {
    parsed = JSON.parse(probe.body);
  } catch {
    return {
      status: 402,
      is_x402_conformant: false,
      challenge_network: null,
      challenge_asset: null,
      challenge_version: null,
      notes: '402 but body not JSON-parseable',
    };
  }

  // Two shapes to tolerate:
  //   - shorthand: {paymentInfo: {network, asset, x402Version}, price: {...}}
  //     (BlockRun.AI style, see https://blockrun.ai/api/v1/exa/answer)
  //   - canonical: {x402Version, accepts: [{scheme, network, asset, ...}]}
  //     (x402 v2 spec — accepts[] contains the PaymentRequirements)
  const pi = parsed?.paymentInfo;
  const accepts = parsed?.accepts;

  // Conformance rule (tightened 2026-05-20 after the first diagnostic run found
  // 74 Questflow v1 endpoints incorrectly flagged conformant):
  // `x402_verified=true` in TrustBench semantics means "selectProvider's runtime
  // probe will succeed against this merchant." selectProvider uses the v2 SDK
  // (@x402/core + @x402/evm v2.11.0). A v1 merchant returns a v1 challenge that
  // the v2 SDK rejects with provider_invalid_challenge. So `conformant` MUST
  // require Base AND v2 (not OR) for mark-verify candidacy.
  //
  // The v1-on-Base cohort surfaced by the first diagnostic run is genuinely
  // x402-conformant but not payable by our current router. It's flagged in the
  // notes for visibility (potential Pillar 2 routing-breadth question — do we
  // add v1 SDK support?) but does NOT show up in the mark-verify recommended
  // list.
  if (pi && typeof pi === 'object') {
    const network = typeof pi.network === 'string' ? pi.network : null;
    const asset = typeof pi.asset === 'string' ? pi.asset : null;
    const version = typeof pi.x402Version === 'number' ? pi.x402Version : null;
    const isBase = network === 'base' || network === 'eip155:8453';
    const isV2 = version === 2;
    const notes = isBase && isV2
      ? 'x402 v2 on Base (shorthand) — mark-verify candidate'
      : isBase && version === 1
        ? `x402 v1 on Base (shorthand) — NOT mark-verify; v2 SDK can't pay`
        : `402 paymentInfo network=${network} v=${version}`;
    return {
      status: 402,
      is_x402_conformant: Boolean(network && asset && isBase && isV2),
      challenge_network: network,
      challenge_asset: asset,
      challenge_version: version,
      notes,
    };
  }

  if (Array.isArray(accepts) && accepts.length > 0) {
    const a = accepts[0];
    const network = typeof a.network === 'string' ? a.network : null;
    const asset = typeof a.asset === 'string' ? a.asset : null;
    const version = typeof parsed.x402Version === 'number' ? parsed.x402Version : null;
    const isBase = network === 'base' || network === 'eip155:8453';
    const isV2 = version === 2;
    const notes = isBase && isV2
      ? 'x402 v2 on Base (canonical accepts[]) — mark-verify candidate'
      : isBase && version === 1
        ? `x402 v1 on Base (canonical accepts[]) — NOT mark-verify; v2 SDK can't pay`
        : `402 accepts[0] network=${network} v=${version}`;
    return {
      status: 402,
      is_x402_conformant: Boolean(network && asset && isBase && isV2),
      challenge_network: network,
      challenge_asset: asset,
      challenge_version: version,
      notes,
    };
  }

  return {
    status: 402,
    is_x402_conformant: false,
    challenge_network: null,
    challenge_asset: null,
    challenge_version: null,
    notes: '402 but no paymentInfo or accepts[] field',
  };
}

// Run probes with bounded concurrency. Map-with-concurrency without an external
// dep — simple worker-pool pattern.
async function probeAll(candidates: Array<{ url: string; capability: string; currentVerified: boolean }>): Promise<ProbeResult[]> {
  const results: ProbeResult[] = [];
  let idx = 0;
  let completed = 0;
  const total = candidates.length;

  async function worker(): Promise<void> {
    while (idx < candidates.length) {
      const i = idx++;
      const c = candidates[i];
      const r = await probeOne(c.url, c.capability, c.currentVerified);
      results.push(r);
      completed++;
      if (completed % 10 === 0 || completed === total) {
        console.error(`[probe-conformance] progress ${completed}/${total}`);
      }
    }
  }

  const workers = Array.from({ length: Math.min(CONCURRENCY, candidates.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

async function main() {
  const argCaps = process.argv.slice(2);
  const capabilities = argCaps.length > 0 ? argCaps : ['search', 'inference', 'data'];

  console.error(`[probe-conformance] capabilities: ${capabilities.join(', ')}`);
  console.error(`[probe-conformance] base: ${TRUSTBENCH_BASE_URL}`);

  const candidates: Array<{ url: string; capability: string; currentVerified: boolean }> = [];
  for (const cap of capabilities) {
    const rows = await fetchRankings(cap);
    // Filter: network=base (selectProvider's gate) AND score>=40 (selection floor).
    // Skip rows already x402_verified=true (no action needed — already marked).
    const baseRows = rows.filter((r) => r.network === 'base' && r.score >= 40);
    const unverified = baseRows.filter((r) => r.x402_verified !== true);
    const alreadyVerified = baseRows.length - unverified.length;
    console.error(`[probe-conformance] capability=${cap}: ${rows.length} total, ${baseRows.length} base+score≥40, ${alreadyVerified} already verified, ${unverified.length} to probe`);
    for (const r of unverified) {
      candidates.push({ url: r.provider_id, capability: cap, currentVerified: r.x402_verified === true });
    }
  }

  if (candidates.length === 0) {
    console.error('[probe-conformance] nothing to probe.');
    return;
  }
  console.error(`[probe-conformance] probing ${candidates.length} candidates with concurrency=${CONCURRENCY}, timeout=${TIMEOUT_MS}ms...`);

  const startedAt = Date.now();
  const results = await probeAll(candidates);
  const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1);

  // Sort: conformant first (alphabetical within), then by capability + status.
  results.sort((a, b) => {
    if (a.is_x402_conformant !== b.is_x402_conformant) return a.is_x402_conformant ? -1 : 1;
    if (a.capability !== b.capability) return a.capability.localeCompare(b.capability);
    return a.url.localeCompare(b.url);
  });

  const conformant = results.filter((r) => r.is_x402_conformant);
  const nonConformant = results.filter((r) => !r.is_x402_conformant);

  console.error(`\n[probe-conformance] done in ${elapsedSec}s: ${conformant.length} conformant, ${nonConformant.length} non-conformant`);

  // ===== stdout: structured summary =====
  console.log('\n========== CONFORMANT x402 v2 MERCHANTS ON BASE ==========\n');
  if (conformant.length === 0) {
    console.log('(none found)');
  } else {
    for (const r of conformant) {
      console.log(`✓ ${r.capability}  ${r.url}`);
      console.log(`    method=${r.method} status=${r.status} network=${r.challenge_network} asset=${r.challenge_asset} version=${r.challenge_version}`);
      console.log(`    notes: ${r.notes}`);
      console.log('');
    }
    console.log('========== MARK-VERIFY COMMANDS ==========\n');
    for (const r of conformant) {
      console.log(`npx tsx scripts/mark-verified.ts "${r.url}" ${r.capability} "live-probe-${new Date().toISOString().slice(0, 10)}"`);
    }
  }

  // Non-conformant summary: status breakdown only, not full list (too noisy).
  console.log('\n========== NON-CONFORMANT BREAKDOWN ==========\n');
  const statusCounts = new Map<string, number>();
  for (const r of nonConformant) {
    const key = `status=${r.status}`;
    statusCounts.set(key, (statusCounts.get(key) ?? 0) + 1);
  }
  const sortedCounts = [...statusCounts.entries()].sort((a, b) => b[1] - a[1]);
  for (const [k, v] of sortedCounts) {
    console.log(`  ${k}: ${v}`);
  }
}

main().catch((err) => {
  console.error('[probe-conformance] fatal:', err?.message || err);
  process.exit(1);
});
