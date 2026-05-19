// src/crawler.ts - Agentic Market discovery + Heurist Solana mesh + verified-x402 seed
//
// Phase 4 P4-1d (2026-05-05): replaced the CDP discovery API
// (api.cdp.coinbase.com/platform/v2/x402/discovery/resources, which returned
// 0 rows in the 2026-05-04 run) with Coinbase's curated Agentic Market
// catalog (api.agentic.market/v1/services). The hard-coded fallback list of
// ~20 AI-API roots is also retired here: it was mostly NOT actually-x402
// endpoints and was actively misleading the rankings (the prober treats 401
// as alive, so an OpenAI/Anthropic/Perplexity root scored highly without ever
// emitting a real 402 challenge).
//
// Phase 4 P4-1d-heurist (2026-05-06): added Heurist Mesh API as a 3rd source.
// `mesh.heurist.xyz/x402/solana/agents` lists ~27 agents × ~5-7 tools = ~150
// Solana x402 endpoints (forensics, search, inference, video gen, etc.).
// These rows are STORED but EXCLUDED from /rankings + /route by a filter in
// scorer.ts getRankings() — Solana settlement is P4-3, separate larger
// sprint. When P4-3 ships, removing the network filter exposes them all
// without re-crawling. Pre-built registry, instant transition.
//
// Three sources, in increasing trust:
//   1. Agentic Market - curated catalog at api.agentic.market/v1/services
//      with structured schema (category, networks, integrationType=1P|3P,
//      endpoints[].pricing, etc.). One provider row per (service, endpoint)
//      pair. Network filter: Base only for Phase 4 (Polygon/Solana skipped
//      until we ship cross-chain settlement).
//   2. Heurist Mesh - mesh.heurist.xyz/x402/solana/agents. Solana-only;
//      stored but filtered from rankings until P4-3.
//   3. seedKnownX402Endpoints() - small, manually-verified list of endpoints
//      we have live-probed and confirmed return a valid x402 402 challenge.
//      Always runs LAST so its rows win on URL conflict, preserving probe
//      method/body metadata we would not get from Agentic Market alone.
//
// Failure mode: if Agentic Market or Heurist is unreachable, the seed still
// runs so the registry is not fully empty. Logged as a warning. New entries
// to the seed list should always include `x402_verified: true` in metadata.

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
);

const AGENTIC_MARKET_URL = 'https://api.agentic.market/v1/services';
const HEURIST_SOLANA_URL = 'https://mesh.heurist.xyz/x402/solana/agents';
const PAGE_LIMIT = 50;
const PAGE_DELAY_MS = 100;

// Network normalization. Agentic Market emits a mix of friendly names
// ("Base", "Polygon", "Solana") and CAIP form ("eip155:8453"). We normalize
// to lowercase friendly names. Phase 4 only routes Base (USDC) so rows are
// filtered to those that advertise at least one Base-compatible network.
const NORMALIZE_NETWORK: Record<string, string> = {
  base: 'base',
  'eip155:8453': 'base',
  polygon: 'polygon',
  'eip155:137': 'polygon',
  solana: 'solana',
};
const ROUTABLE_NETWORKS = new Set(['base']);

// URL hygiene filter for agentic.market catalog entries (added 2026-05-19).
//
// Two failure shapes the upstream catalog has shipped to us that the live
// probe in route-handlers.probeFor402Challenge cannot recover from:
//
//   1. URL templates with un-substituted placeholders (e.g. `/:id/` or
//      `/:session_id/`). The probe layer treats the URL verbatim, so a
//      literal `:id` segment hits the merchant as `:id` and returns 404.
//      The merchant has no chance to emit a 402 challenge because the
//      route doesn't exist. These should never have been catalog-listed
//      as routable. Pattern catches all un-substituted templates, not
//      just the specific Browserbase case that triggered this.
//
//   2. Known-bad endpoints that return 200 OK to anonymous GET probes
//      instead of a 402 x402 challenge body. The probe layer requires
//      status===402, so these are guaranteed to be rejected as
//      provider_unavailable on every call. Keeping them in the rotation
//      only causes /route to 502 in the secondary fallback path.
//
// Why static here instead of a live-probe validation in the crawler
// (the proper fix): agentic.market is the upstream catalog and its
// rows are crawled hourly; live-probing every row on every crawl would
// add ~600 outbound HTTP calls per run and meaningfully slow the
// pipeline. A live-probe validation pass IS the right longer-term move
// (Path B in the 2026-05-19 incident notes), but for the immediate
// stop-the-bleeding fix, a small static filter that drops the two known
// failure shapes is enough and keeps the pipeline fast.
//
// Triggering incident: 2026-05-19 ~18:24 UTC. An authenticated client
// at xfwd=135.232.224.115 was hitting POST /route on capability=data
// in a tight loop, getting 502s. Both providers in the capability=data
// pool (api.brave.com/search returning 200 OK because it's not x402;
// x402.browserbase.com/browser/session/:id/extend returning 404 because
// of the un-substituted :id) failed the probe layer's status===402 check.
// Direct DB DELETE of those two rows landed the stop-the-bleed; this
// filter prevents the next nightly crawl from re-inserting them.
const URL_TEMPLATE_PATTERN = /\/:[a-z_]+(?:\/|$)/i;
const URL_DENYLIST = new Set<string>([
  'https://api.brave.com/search',
]);

// Agentic Market response shapes (only the fields we read).
type AmService = {
  id: string;
  name: string;
  description?: string;
  domain?: string;
  provider?: string;
  category?: string;
  networks?: string[];
  integrationType?: '1P' | '3P';
  endpoints?: AmEndpoint[];
};
type AmEndpoint = {
  url: string;
  description?: string;
  method?: string;
  pricing?: {
    amount?: string;
    currency?: string;
    network?: string;
    scheme?: string;
    minAmount?: string;
    maxAmount?: string;
  };
};

// -----------------------------------------------------------------------------
// Step 1: Agentic Market (paginated)
// -----------------------------------------------------------------------------
// Walks `api.agentic.market/v1/services` page by page (limit/offset, default
// 50/page; total ~600 services as of 2026-05-05) and upserts one providers
// row per endpoint that advertises Base. Capability column is the service
// category lowercased; rows whose category is outside the routable set
// (search/inference/data/media/infra) are still STORED so we can grow the
// router without re-crawling, but they are not picked by /route until the
// validator-side enum graduates them. See provider-selection.ROUTABLE_CAPABILITIES.
async function crawlAgenticMarket(): Promise<number> {
  let inserted = 0;
  let offset = 0;
  let total: number | null = null;

  while (total === null || offset < total) {
    const url = `${AGENTIC_MARKET_URL}?limit=${PAGE_LIMIT}&offset=${offset}`;
    let res: Response;
    try {
      res = await fetch(url, { headers: { Accept: 'application/json' } });
    } catch (e: any) {
      console.warn(`[crawler] Agentic Market fetch failed at offset=${offset}: ${e.message}`);
      return inserted;
    }
    if (!res.ok) {
      console.warn(`[crawler] Agentic Market HTTP ${res.status} at offset=${offset}; stopping`);
      return inserted;
    }
    const body = (await res.json()) as {
      services: AmService[];
      total: number;
      limit: number;
      offset: number;
    };
    if (total === null) total = body.total;
    console.log(`[crawler] Agentic Market page: ${body.services.length} services (offset=${offset}/${total})`);

    for (const svc of body.services) {
      if (!svc.endpoints || svc.endpoints.length === 0) continue;
      const category = (svc.category || 'other').toLowerCase();
      const integrationType = svc.integrationType || null;

      for (const ep of svc.endpoints) {
        if (!ep.url) continue;

        // URL hygiene filter (2026-05-19) — see URL_TEMPLATE_PATTERN and
        // URL_DENYLIST comments above. Drops entries that the probe layer
        // would reject as provider_unavailable on every call, before they
        // reach the rotation.
        if (URL_TEMPLATE_PATTERN.test(ep.url)) {
          console.warn(`[crawler] skip URL template (un-substituted placeholder): ${ep.url}`);
          continue;
        }
        if (URL_DENYLIST.has(ep.url)) {
          console.warn(`[crawler] skip denylisted endpoint (known non-x402): ${ep.url}`);
          continue;
        }

        // Networks: combine service-level + endpoint-pricing-level, normalize,
        // dedupe, filter to those advertising a routable network.
        const epNets = ([] as string[]).concat(
          svc.networks || [],
          ep.pricing?.network ? [ep.pricing.network] : [],
        );
        const normalized = epNets
          .map((n) => NORMALIZE_NETWORK[n.toLowerCase()] || n.toLowerCase())
          .filter((v, i, a) => a.indexOf(v) === i);
        if (!normalized.some((n) => ROUTABLE_NETWORKS.has(n))) continue;

        const row = {
          url: ep.url,
          name: `${svc.name}${ep.description ? ' - ' + ep.description.slice(0, 80) : ''}`,
          capability: category,
          description: svc.description || ep.description || '',
          // Agentic Market does not expose payTo on the catalog row; we learn
          // it via the live 402 probe in route-handlers.probeFor402Challenge.
          pay_to: null,
          metadata: {
            am_service_id: svc.id,
            am_provider: svc.provider || svc.domain || null,
            am_category: svc.category || null,
            // P4-verify-tier (2026-05-05): record Coinbase's curatorial badge
            // alongside our own empirical x402_verified bit (set by the seed
            // when we have probed an endpoint live). Two-bit verification:
            // both signals together are stronger than either alone.
            integration_type: integrationType,
            networks: normalized,
            method: ep.method || null,
            pricing: ep.pricing
              ? {
                  amount: ep.pricing.amount || null,
                  scheme: ep.pricing.scheme || null,
                  currency: ep.pricing.currency || null,
                  min_amount: ep.pricing.minAmount || null,
                  max_amount: ep.pricing.maxAmount || null,
                }
              : null,
            source: 'agentic_market',
          },
          last_crawled_at: new Date().toISOString(),
        };

        const { error } = await supabase
          .from('providers')
          .upsert(row, { onConflict: 'url' });
        if (!error) inserted++;
      }
    }

    offset += PAGE_LIMIT;
    if (offset < total) await new Promise((r) => setTimeout(r, PAGE_DELAY_MS));
  }

  console.log(
    `[crawler] Agentic Market done: ${inserted} provider rows inserted/updated from ${total} services`,
  );
  return inserted;
}

// -----------------------------------------------------------------------------
// Step 2: Heurist Mesh API (Solana, stored but filtered until P4-3)
// -----------------------------------------------------------------------------
// mesh.heurist.xyz/x402/solana/agents returns a flat list of ~27 agents,
// each with ~5-7 tools. Each tool is its own x402 endpoint. We map per-tool
// to the 5-cat capability taxonomy via inferCapabilityForHeuristTool().
//
// Network: 'solana'. These rows live in providers but are filtered out of
// /rankings + /route by scorer.ts getRankings() until P4-3 (Solana
// settlement) ships. Removing that filter is the only step needed to
// expose them all when settlement is ready — no re-crawl required.
//
// Pricing: Heurist quotes USD ($0.001-$0.25 per call). We convert to USDC
// atomic units (6 decimals) for storage, even though Solana settlement
// uses SOL/SPL-USDC and the conversion is approximate. Stored as observed
// signal; the live 402 probe at quote time will be the authoritative
// source for the actual payment requirements when P4-3 ships.

type HeuristTool = {
  name: string;
  description: string;
  resourceUrl: string;
  priceUsd: string;
  network: string;
};
type HeuristAgent = {
  agentId: string;
  tools: HeuristTool[];
};
type HeuristResponse = {
  count: number;
  agents: HeuristAgent[];
};

// Per-tool capability inference. Heuristics from agent name + tool name.
// Anything that doesn't match a more specific lane defaults to 'data',
// which is correct for the bulk of Heurist's agents (forensics, market data,
// project knowledge, on-chain analytics).
function inferCapabilityForHeuristTool(agentId: string, toolName: string): 'search' | 'inference' | 'data' | 'media' | 'infra' {
  const id = agentId.toLowerCase();
  const t = toolName.toLowerCase();

  // Media — video / image generation tools.
  if (id.includes('videogen') || t.includes('text_to_video') || t.includes('image_to_video') || t.includes('video_status')) {
    return 'media';
  }

  // Search — web/twitter/news/discovery search.
  if (id.includes('twitter') || id.includes('search') || id.includes('news')) return 'search';
  if (t.includes('search') || t === 'user_timeline' || t === 'tweet_detail') return 'search';

  // Inference — Q&A, advice, research.
  if (id.includes('ask') || id.includes('research') || id.includes('health')) return 'inference';

  // Default: data (analytics, on-chain, financial, project metadata).
  return 'data';
}

// USD → USDC atomic. USDC has 6 decimals. "0.001" → "1000". Returns null
// when the input isn't a positive finite number — caller stores null in
// metadata.price_atomic_observed in that case.
function usdToAtomicUsdc(usdString: string): string | null {
  const usd = parseFloat(usdString);
  if (!Number.isFinite(usd) || usd <= 0) return null;
  // Math.round handles fractional pennies (e.g. "0.0025" → 2500).
  const atomic = Math.round(usd * 1_000_000);
  return atomic.toString();
}

async function crawlHeurist(): Promise<number> {
  let inserted = 0;
  let res: Response;
  try {
    res = await fetch(HEURIST_SOLANA_URL, { headers: { Accept: 'application/json' } });
  } catch (e: any) {
    console.warn(`[crawler] Heurist Mesh fetch failed: ${e.message}`);
    return 0;
  }
  if (!res.ok) {
    console.warn(`[crawler] Heurist Mesh HTTP ${res.status}; skipping`);
    return 0;
  }

  let body: HeuristResponse;
  try {
    body = (await res.json()) as HeuristResponse;
  } catch (e: any) {
    console.warn(`[crawler] Heurist Mesh body parse failed: ${e.message}`);
    return 0;
  }
  if (!body || !Array.isArray(body.agents)) {
    console.warn('[crawler] Heurist Mesh response missing agents[]; skipping');
    return 0;
  }

  console.log(`[crawler] Heurist Mesh: ${body.count} agents, processing tools...`);

  for (const agent of body.agents) {
    if (!agent || !Array.isArray(agent.tools)) continue;
    for (const tool of agent.tools) {
      if (!tool || !tool.resourceUrl) continue;

      const capability = inferCapabilityForHeuristTool(agent.agentId || '', tool.name || '');
      const priceAtomic = usdToAtomicUsdc(tool.priceUsd);
      // Network normalized to lowercase; almost always 'solana' but defensive
      // in case Heurist later expands to multi-chain on the same endpoint.
      const network = (tool.network || 'solana').toLowerCase();

      const row = {
        url: tool.resourceUrl,
        // Display name combines agentId and tool name for human-readability
        // in the rankings UI when Solana support eventually unlocks.
        name: `${agent.agentId} - ${tool.name}`,
        capability,
        description: tool.description || '',
        // Heurist API doesn't expose pay_to on the catalog; the live 402
        // probe at quote time would be the source of truth (P4-3+).
        pay_to: null,
        metadata: {
          source: 'heurist_solana_mesh',
          network,
          // Stored even when filtered from rankings; P4-3 transition will
          // surface these as the price signal.
          price_usd_observed: tool.priceUsd || null,
          price_atomic_observed: priceAtomic,
          heurist_agent_id: agent.agentId || null,
          heurist_tool_name: tool.name || null,
        },
        last_crawled_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from('providers')
        .upsert(row, { onConflict: 'url' });
      if (!error) inserted++;
    }
  }

  console.log(
    `[crawler] Heurist Mesh done: ${inserted} provider rows stored ` +
    `(network=solana; filtered from /rankings + /route until P4-3 settlement ships)`,
  );
  return inserted;
}

// -----------------------------------------------------------------------------
// Step 3: seedKnownX402Endpoints (manually verified, runs last)
// -----------------------------------------------------------------------------
// Each entry has been hit with curl and confirmed to return a valid x402 402
// challenge body (scheme=exact, network=base, asset=USDC on Base, valid
// pay_to address). Capability label is `data` for all three Infopunks
// endpoints (analytical signal/score extraction). Easy to flip per-endpoint
// if usage shows a better grouping.
//
// Why this list exists separately from Agentic Market: these endpoints are
// POST-only and require a specific request body shape to elicit the 402
// (their request-schema validation runs before the payment check). The
// metadata.x402_probe_method + x402_probe_body fields tell the router how to
// probe them - see route-handlers.probeFor402Challenge().
async function seedKnownX402Endpoints() {
  console.log('[crawler] Seeding verified-real x402 endpoints...');
  const INFOPUNKS_HOST = 'https://infopunks-cognition-layer-x402.onrender.com';
  const INFOPUNKS_PAY_TO = '0xe4E8908308a86aB43E5dEb6C0fd0F006786104c3';
  const seeds = [
    {
      url: `${INFOPUNKS_HOST}/v1/coherence-score`,
      name: 'Infopunks - Coherence Score',
      capability: 'data',
      description:
        'Cultural-intelligence coherence scoring. Returns whether an artifact is internally coherent, credible, thesis-aligned, specific, actionable, and usable by agents or founders. x402 + USDC on Base via Coinbase CDP facilitator.',
      payTo: INFOPUNKS_PAY_TO,
      metadata: {
        x402_verified: true,
        x402_verified_at: '2026-05-04',
        x402_probe_method: 'POST',
        x402_probe_body: { artifact: 'trustbench-probe' },
        provider_org: 'infopunks-cognition-layer',
        price_atomic_observed: '10000',
        price_usd_observed: '0.01',
        source: 'verified_seed',
      },
    },
    {
      url: `${INFOPUNKS_HOST}/v1/extract-signal`,
      name: 'Infopunks - Extract Signal',
      capability: 'data',
      description:
        'Turn raw narrative noise into structured cultural signal. Output types: founder_post | thesis | risk_signal | meme_angle | briefing | launch_copy. x402 + USDC on Base via Coinbase CDP facilitator.',
      payTo: INFOPUNKS_PAY_TO,
      metadata: {
        x402_verified: true,
        x402_verified_at: '2026-05-04',
        x402_probe_method: 'POST',
        x402_probe_body: { input: 'trustbench-probe', output_type: 'briefing' },
        provider_org: 'infopunks-cognition-layer',
        price_atomic_observed: '10000',
        price_usd_observed: '0.01',
        source: 'verified_seed',
      },
    },
    {
      url: `${INFOPUNKS_HOST}/v1/simulate-narrative`,
      name: 'Infopunks - Simulate Narrative',
      capability: 'data',
      description:
        'Model how a narrative, protocol, launch, or market thesis may evolve. x402 + USDC on Base via Coinbase CDP facilitator.',
      payTo: INFOPUNKS_PAY_TO,
      metadata: {
        x402_verified: true,
        x402_verified_at: '2026-05-04',
        x402_probe_method: 'POST',
        x402_probe_body: { narrative: 'trustbench-probe' },
        provider_org: 'infopunks-cognition-layer',
        price_atomic_observed: '10000',
        price_usd_observed: '0.01',
        source: 'verified_seed',
      },
    },
  ];
  await insertProviders(seeds);
}

async function insertProviders(resources: any[]) {
  let inserted = 0;
  for (const r of resources) {
    if (!r.url) continue;
    const { error } = await supabase.from('providers').upsert(
      {
        url: r.url,
        name: r.name || 'Unknown',
        capability: r.capability || 'other',
        description: r.description || '',
        pay_to: r.payTo || null,
        metadata: r.metadata || {},
        last_crawled_at: new Date().toISOString(),
      },
      { onConflict: 'url' },
    );
    if (!error) inserted++;
  }
  console.log(`[crawler] Inserted/updated ${inserted} providers (verified seed)`);
}

// -----------------------------------------------------------------------------
// Main entry
// -----------------------------------------------------------------------------
async function crawlBazaar() {
  console.log('[crawler] Starting x402 provider crawl (Phase 4: Agentic Market + Heurist Mesh)...');
  const amInserted = await crawlAgenticMarket();
  if (amInserted === 0) {
    console.warn('[crawler] Agentic Market returned no usable rows; continuing with Heurist + seed.');
  }
  const heuristInserted = await crawlHeurist();
  if (heuristInserted === 0) {
    console.warn('[crawler] Heurist Mesh returned no usable rows; continuing with seed.');
  }
  await seedKnownX402Endpoints();
  console.log(
    `[crawler] Crawl complete. Agentic Market: ${amInserted} rows (base); ` +
    `Heurist Mesh: ${heuristInserted} rows (solana, filtered from rankings); ` +
    `verified seed: 3 (Infopunks).`,
  );
}

crawlBazaar().catch(console.error);
