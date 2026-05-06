// src/crawler.ts - Agentic Market discovery + verified-x402 seed
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
// Two sources, in increasing trust:
//   1. Agentic Market - curated catalog at api.agentic.market/v1/services
//      with structured schema (category, networks, integrationType=1P|3P,
//      endpoints[].pricing, etc.). One provider row per (service, endpoint)
//      pair. Network filter: Base only for Phase 4 (Polygon/Solana skipped
//      until we ship cross-chain settlement).
//   2. seedKnownX402Endpoints() - small, manually-verified list of endpoints
//      we have live-probed and confirmed return a valid x402 402 challenge.
//      Always runs LAST so its rows win on URL conflict, preserving probe
//      method/body metadata we would not get from Agentic Market alone.
//
// Failure mode: if Agentic Market is unreachable, the seed still runs so the
// registry is not fully empty. Logged as a warning. New entries to the seed
// list should always include `x402_verified: true` in metadata.

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
);

const AGENTIC_MARKET_URL = 'https://api.agentic.market/v1/services';
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
// Step 2: seedKnownX402Endpoints (manually verified, runs last)
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
  console.log('[crawler] Starting x402 provider crawl (Phase 4: Agentic Market)...');
  const amInserted = await crawlAgenticMarket();
  if (amInserted === 0) {
    console.warn('[crawler] Agentic Market returned no usable rows; running seed only.');
  }
  await seedKnownX402Endpoints();
  console.log(
    `[crawler] Crawl complete. Agentic Market: ${amInserted} rows; verified seed: 3 (Infopunks).`,
  );
}

crawlBazaar().catch(console.error);
