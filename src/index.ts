// src/index.ts — Phase 3 server: auth + idempotency + spend-caps + x402 + receipts.
import 'dotenv/config';
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { getRankings, signScorecard, getPublicKeyPem } from './scorer.js';
import { requireAgent } from './auth.js';
import { withIdempotency } from './idempotency.js';
import { requireWithinSpendCap } from './spend-caps.js';
import { quoteHandler, settleHandler } from './route-handlers.js';
import { startPendingSweep } from './pending-sweep.js';
import { renderReceiptHtml, getOrComputeVerifyResults } from './receipt-html.js';
import {
  renderRoutingReceiptHtml,
  getOrComputeRoutingVerifyResults,
  type SignedRoutingEnvelope,
} from './routing-receipt-html.js';
import { getRecentReceipts, renderExplorerHtml } from './explorer-html.js';
import type { SignedReceipt } from './receipt-generator.js';
import { renderRankingsHtml, type RankingRow } from './rankings-html.js';
import { renderLandingHtml, type LandingStats } from './landing-html.js';
import { renderMethodologyHtml } from './methodology-html.js';
import { renderPrivacyHtml } from './privacy-html.js';
import { renderTermsHtml } from './terms-html.js';
import { renderPricingHtml, buildPricingJson } from './pricing-html.js';
import { paywallGate } from './paywall-handler.js';
import { createMcpHttpHandler } from './mcp-http.js';
import { renderAnalyticsHtml, type AnalyticsData, type CategoryCard } from './analytics-html.js';
import {
  routeBazaarExtension,
  spikeBazaarExtension,
  isBazaarExtensionEnabled,
  isBazaarSpikeEnabled,
  spikeHandler,
} from './bazaar-extension.js';

// ---------------------------------------------------------------------------
// Agent-discovery static assets (P4-skill, P4-llmstxt, P4-wellknown).
// These three files live at the repo root and are served as-is over HTTP for
// agents and crawlers that look in the standard places (skill.md, llms.txt,
// .well-known/<manifest>.json). Read once at boot to avoid disk I/O on the
// hot path; restart picks up content edits. A missing file at boot is logged
// and the corresponding route serves 503 — does NOT crash boot, so a partial
// deploy still serves the rest of the API.
//
// Failure mode: if the file is missing, the route returns 503 with a plain
// text explanation. No security implications (these are public, static).
function loadStatic(relPath: string): string | null {
  try {
    return readFileSync(path.resolve(process.cwd(), relPath), 'utf-8');
  } catch (err: any) {
    console.warn(`[boot] static asset ${relPath} not loaded: ${err.message}; route will serve 503`);
    return null;
  }
}
const SKILL_MD_BODY = loadStatic('skill.md');
const LLMS_TXT_BODY = loadStatic('llms.txt');
const WELL_KNOWN_TRUSTBENCH_JSON_BODY = loadStatic('.well-known/trustbench.json');

// Binary-safe variant of loadStatic for assets served as image/png etc.
// Same boot-on-disk-or-503 semantics — we never crash boot on a missing card.
//
// Returns Uint8Array<ArrayBuffer> (not Buffer, not Uint8Array<ArrayBufferLike>)
// so the body passes the Web `BodyInit` type check cleanly. Three facts collide:
//   1. Node's readFileSync returns Buffer<ArrayBufferLike> (its pool is
//      generically typed to leave room for SharedArrayBuffer).
//   2. `new Uint8Array(buf)` inherits that ArrayBufferLike parameterization.
//   3. lib.dom.d.ts's BodyInit accepts only Uint8Array<ArrayBuffer>.
// Allocating a fresh-by-length Uint8Array gives a guaranteed plain
// ArrayBuffer backing; `.set()` copies the bytes in. One-time cost at boot.
function loadStaticBinary(relPath: string): Uint8Array<ArrayBuffer> | null {
  try {
    const buf = readFileSync(path.resolve(process.cwd(), relPath));
    const u8 = new Uint8Array(buf.byteLength);
    u8.set(buf);
    return u8;
  } catch (err: any) {
    console.warn(`[boot] static binary ${relPath} not loaded: ${err.message}; route will serve 404`);
    return null;
  }
}

// OG / Twitter card images. Per-page 1200x630 PNGs rendered offline by
// scripts/generate-og-cards.py and committed under public/og/. Loaded once
// at boot (5 small PNGs, ~250KB total) and served by /og/:name with
// year-long immutable cache, since the file name is the cache key — to
// update a card, regenerate the PNG and redeploy (the same content URL is
// fine; X re-fetches roughly weekly anyway).
//
// The Record itself is the path-traversal whitelist: nothing outside this
// map can be requested, no matter what the :name param contains.
const OG_CARDS: Record<string, Uint8Array<ArrayBuffer> | null> = {
  home: loadStaticBinary('public/og/home.png'),
  methodology: loadStaticBinary('public/og/methodology.png'),
  rankings: loadStaticBinary('public/og/rankings.png'),
  pricing: loadStaticBinary('public/og/pricing.png'),
  receipt: loadStaticBinary('public/og/receipt.png'),
};

// Favicon PNG (64x64) loaded at boot. Served at /favicon.ico with
// Content-Type: image/png — Google's S2 favicon service (which Anthropic's
// Connectors Directory uses to fetch the listing icon) requires a real
// raster payload at /favicon.ico; SVG redirects fail their crawler and
// cache "no favicon found", surfacing as a grey icon in the directory and
// in tool-call UI. Source: render of src/index.ts /logo.svg via ImageMagick
// (convert -background none -density 600 logo.svg -resize 64x64 favicon.png).
const FAVICON_PNG = loadStaticBinary('public/favicon.png');

// Top-level Supabase client for the public-facing endpoints in this file
// (currently /receipts/:id). Other modules own their own clients to keep
// boot lazy. Same env-var convention as the rest of the codebase:
// SUPABASE_SECRET_KEY (the service-role key under Supabase's 2026 key system).
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const app = new Hono();

app.use('*', cors());
app.use('*', logger());

// Health
app.get('/health', (c) => c.json({ status: 'ok', project: 'TrustBench' }));

// ---------------------------------------------------------------------------
// Landing-page live stats. Three numbers feed the V2 stat strip on `/`:
//   - x402-verified provider count from the providers table
//   - receipts issued in the trailing 30 days
//   - median p50 latency across recent scorecards
//
// Each query has its own try/catch and falls back to null on failure — the
// landing template renders an em-dash for any null tile, so partial DB
// outages degrade gracefully rather than show fake data (honest framing).
//
// Cached for 60s in-process; the front door doesn't need real-time accuracy
// and we don't want every page-load to hit Supabase three times.
// ---------------------------------------------------------------------------

let _landingStatsCache: { data: LandingStats; expires: number } | null = null;

async function getLandingStats(): Promise<LandingStats> {
  // Cheap in-process cache; refresh every 60s.
  if (_landingStatsCache && _landingStatsCache.expires > Date.now()) {
    return _landingStatsCache.data;
  }

  // Endpoint count: sum of providers actually shown in /rankings across all
  // five capabilities. Mirrors what a visitor sees, so the headline number
  // matches the rankings page — and excludes Solana endpoints (filtered by
  // network in scorer.ts) until Phase 4-3 lands cross-network routing.
  // 5 parallel queries; getRankings caches via Redis (5min TTL) so this is
  // amortized cheap.
  let endpointCount: number | null = null;
  try {
    const caps: Array<'search' | 'inference' | 'data' | 'media' | 'infra'> = [
      'search', 'inference', 'data', 'media', 'infra',
    ];
    const lists = await Promise.all(caps.map(c => getRankings(c)));
    endpointCount = lists.reduce((sum, rows) => sum + (rows?.length ?? 0), 0);
  } catch (err) {
    console.warn('[landing-stats] endpoint count query failed:', err);
  }

  // Receipts in last 30 days. Two tables, summed:
  //   - Phase 3 settlement receipts (rcpt_) live in `receipts`, filtered by
  //     `issued_at` (per phase3-schema.sql line 178, NOT `created_at`).
  //   - Phase 4 paywall routing receipts (rrcpt_) live in `paid_requests`
  //     (service-role RLS), filtered by `created_at` AND a non-null
  //     `response_body` — mirrors the accuracy filter used by the explorer
  //     query in src/explorer-html.ts:149.
  // Fail-soft: if one table query errors, return the other's count rather
  // than null, so a partial outage doesn't blank the landing stat tile.
  // Only when BOTH queries fail do we leave receiptsLast30Days null (which
  // hides the tile per the fmt() em-dash fallback in landing-html.ts:43).
  let receiptsLast30Days: number | null = null;
  try {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const [rcptResult, rrcptResult] = await Promise.all([
      supabase
        .from('receipts')
        .select('id', { count: 'exact', head: true })
        .gte('issued_at', cutoff),
      supabase
        .from('paid_requests')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', cutoff)
        .not('response_body', 'is', null),
    ]);
    const rcptCount = !rcptResult.error && typeof rcptResult.count === 'number' ? rcptResult.count : null;
    const rrcptCount = !rrcptResult.error && typeof rrcptResult.count === 'number' ? rrcptResult.count : null;
    if (rcptResult.error) console.warn('[landing-stats] rcpt_ count query failed:', rcptResult.error.message);
    if (rrcptResult.error) console.warn('[landing-stats] rrcpt_ count query failed:', rrcptResult.error.message);
    if (rcptCount !== null || rrcptCount !== null) {
      receiptsLast30Days = (rcptCount ?? 0) + (rrcptCount ?? 0);
    }
  } catch (err) {
    console.warn('[landing-stats] receipt count query threw:', err);
  }

  // Median p50 latency across scorecards. Pull the latency_p50 column and
  // compute the median client-side — Supabase doesn't have a native median
  // aggregate, and the row count here is tiny (<200) so this is fine.
  let medianLatencyMs: number | null = null;
  try {
    const { data, error } = await supabase
      .from('scorecards')
      .select('latency_p50')
      .not('latency_p50', 'is', null);
    if (!error && Array.isArray(data) && data.length > 0) {
      const values = data
        .map((r: any) => Number(r.latency_p50))
        .filter((v: number) => Number.isFinite(v) && v > 0)
        .sort((a, b) => a - b);
      if (values.length > 0) {
        const mid = Math.floor(values.length / 2);
        medianLatencyMs = Math.round(values.length % 2 === 0 ? (values[mid - 1] + values[mid]) / 2 : values[mid]);
      }
    }
  } catch (err) {
    console.warn('[landing-stats] median latency query failed:', err);
  }

  const stats: LandingStats = { endpointCount, receiptsLast30Days, medianLatencyMs };
  _landingStatsCache = { data: stats, expires: Date.now() + 60_000 };
  return stats;
}

// Public landing page (V2 Data-Forward design from Stitch). Live numbers from
// getLandingStats(); page is fully static otherwise. Honest-framing constraints
// applied throughout. No JSON contract — landing is HTML-only.
app.get('/', async (c) => {
  const stats = await getLandingStats();
  return c.html(renderLandingHtml(stats), 200, {
    'Cache-Control': 'public, max-age=60',
  });
});

// JSON endpoint backing the landing stat strip. Useful for dashboards,
// monitoring, or anyone who wants to graph these numbers over time.
app.get('/metrics/registry-summary', async (c) => {
  const stats = await getLandingStats();
  return c.json({ success: true, ...stats, generated_at: new Date().toISOString() }, 200, {
    'Cache-Control': 'public, max-age=60',
  });
});

// Public rankings.
//
// Content negotiation (P4-2 rankings polish, 2026-05-06):
//   - Default behavior unchanged: returns the canonical JSON array.
//   - Browser-preferred (`Accept: text/html` or `?format=html`): renders a
//     polished HTML page with capability tabs (search / inference / data /
//     media / infra), filter pills (verified / 1P / 3P), search input, and
//     a sortable table. JSON contract is byte-identical for every existing
//     programmatic client (paid-probe, MCP tools, /rankings/paid, etc.).
//   - `?format=json` and `?format=html` are explicit overrides.
//
// preferHtml() is defined further down (function declaration, hoisted) and
// shared with /receipts/:id — same content-negotiation rule both routes.
app.get('/rankings', async (c) => {
  const capability = c.req.query('capability') || 'search';
  const data = await getRankings(capability as any);

  const wantsHtml = preferHtml(c.req.header('Accept'), c.req.query('format') ?? null);
  if (wantsHtml) {
    const html = renderRankingsHtml(data as RankingRow[], capability);
    return c.html(html, 200, {
      // Rankings change once per nightly probe pass; aggressive caching is
      // safe inside that window. Clients hitting between probes get fresh
      // data via Redis cache invalidation in scorer.ts (5-min TTL).
      'Cache-Control': 'public, max-age=300',
    });
  }

  return c.json({ success: true, data, source: 'TrustBench' });
});

// ---------------------------------------------------------------------------
// GET /route — 405 Method Not Allowed.
//
// This endpoint used to return a "score-only readout" (best provider per
// capability + signed scorecards) on GET, kept for Phase 3 backward compat.
// Two issues motivated this change to 405:
//   1. Spec citizenship — `agentic.market/validate` flagged GET /route as "no
//      x402 setup detected" because we returned 200 with non-x402 content
//      rather than 402 or 405. Competitor `x402route.vercel.app/v1/route`
//      uses 405 on the same surface; their behavior is the spec norm.
//   2. The data is fully redundant. `/rankings?capability=X` serves the same
//      rankings + signed scorecards publicly with the same cache headers,
//      better-documented contract, and no x402-discoverability ambiguity.
//
// Empirical signal at decision time (2026-05-12): zero GET /route hits in
// the post-deploy HTTP-log window. Railway flushes HTTP logs per deploy so
// 7-day history wasn't observable, but post-deploy gives us a fast-feedback
// loop: if any unknown consumer surfaces, we'll see 405 entries pile up and
// can flip back to the legacy 200 path in a single-commit revert.
//
// Failure mode: if a previously-unknown consumer was relying on the legacy
// 200 + signed_scorecards response, they break at this cutover. Recovery is
// either (a) revert this handler (1-line edit), or (b) point them at
// `/rankings?capability=<...>` which serves byte-equivalent data. No
// data-leak risk introduced — the response body still emits the redirect
// hint, no agent identifiers, no internal state.
//
// HEAD /route: Hono treats HEAD as GET by default, so HEAD also returns 405.
// That's correct (HEAD inherits the method's contract).
//
// Full decision rationale in `phase4-get-route-behavior-handoff.md` and the
// 2026-05-12 entry in `decisions.md`.
// ---------------------------------------------------------------------------
app.get('/route', (c) =>
  c.json(
    {
      error: 'method_not_allowed',
      allow: 'POST',
      detail:
        'GET on /route is not supported. For free rankings + signed scorecards, use /rankings?capability=<search|inference|data|media|infra>. For paid routing, POST to /route with an x402 X-PAYMENT header.',
      rankings_url: 'https://trustbench.io/rankings',
    },
    405,
    { Allow: 'POST' },
  ),
);

// ---------------------------------------------------------------------------
// POST /route — Phase 3 authenticated + idempotent + spend-capped quote.
// Chain order is locked by phase3-spend-caps.md: cap check goes AFTER the
// idempotency claim (so retries replay through the cache without re-evaluating
// caps) and BEFORE any x402 / provider work (so we don't burn an upstream
// round-trip on a request we were always going to reject).
//
// Step 1 of the two-step x402 protocol — see phase3-x402-construction.md.
// Returns a route_id + payment_required challenge for the agent to sign.
// ---------------------------------------------------------------------------
// Paywall gate mounts FIRST. When TRUSTBENCH_PAYWALL_ENABLED=true and an
// X-PAYMENT header is present, it handles the request inline and returns 200
// without calling next() — completely bypassing the Bearer + spend-cap chain.
// When the flag is off, or X-PAYMENT is absent but Authorization is present,
// it falls through to the existing chain. See src/paywall-handler.ts for the
// full failure-mode analysis. Default flag value is false → behavior unchanged
// from Phase 3 until ops explicitly flips the flag on Railway.
// Bazaar discovery extension on POST /route. Per CDP docs, the
// bazaarResourceServerExtension + declareDiscoveryExtension middlewares MUST
// sit BEFORE the paywall middleware so the extension can inspect the request
// shape first. The flag default is false; flip on Railway after the spike
// route (see /test/bazaar-spike below) validates EXTENSION-RESPONSES:
// processing on a real CDP-mediated settle.
//
// FAILURE MODE: if @x402/extensions/bazaar isn't installed or named exports
// don't match the CDP-doc shape, the middlewares no-op (see
// src/bazaar-extension.ts comments). Existing /route behavior preserved.
// Bazaar discovery wire-up: when the env flag is on AND the package built a
// declaration successfully, attach the declaration to the Hono context BEFORE
// paywallGate runs so the 402 response builder can embed `extensions.bazaar`
// in the body. Per CDP docs § Extension architecture, this is the v2 wire
// shape; the CDP facilitator extracts the discovery info from the payment
// payload + requirements at verify/settle time and catalogs the route.
//
// FAILURE MODE: if @x402/extensions/bazaar isn't installed or named exports
// don't match the new types contract, routeBazaarExtension is null and the
// middleware below is a no-op. Existing /route behavior preserved.
if (isBazaarExtensionEnabled() && routeBazaarExtension) {
  app.post(
    '/route',
    async (c, next) => {
      // `as never` on the key: Hono's typed Variables map rejects untyped
      // keys at compile time. Read side in paywall-handler.ts uses the same
      // cast; type discipline is maintained via the value type narrowing on
      // the read side rather than declaring a project-wide Variables interface.
      c.set('bazaarExtension' as never, routeBazaarExtension as never);
      await next();
    },
    paywallGate, requireAgent, withIdempotency, requireWithinSpendCap, quoteHandler,
  );
} else {
  app.post('/route', paywallGate, requireAgent, withIdempotency, requireWithinSpendCap, quoteHandler);
}

// Throwaway spike route for the 30-min pre-commit Bazaar spike (runbook § 2).
// Wrapped with the Bazaar extension AND the paywallGate so a real
// CDP-mediated x402 settle against /test/bazaar-spike triggers Bazaar
// indexing — which is the only thing that exercises the extension's strict
// JSON Schema validation and produces the EXTENSION-RESPONSES header.
//
// Per CDP docs, "the first successful settlement for a Bazaar-enabled route
// is when CDP catalogs it." A spike without payment would not trigger any
// indexing path, so the test would be meaningless. With the paywall gate in
// place, a real settle from a test wallet validates the entire extension
// wiring before we touch the production /route flag.
//
// When called without X-PAYMENT, paywallGate returns a 402 with payment
// requirements pointing at TRUSTBENCH_REVENUE_WALLET. When called with a
// signed X-PAYMENT envelope, paywallGate handles the settle inline through
// the CDP facilitator and returns a 200 — at which point CDP also sees the
// declared Bazaar metadata on this route and (if validation passes) starts
// indexing. The spikeHandler is only invoked if the paywall is disabled.
//
// FAILURE MODES:
//   - TRUSTBENCH_PAYWALL_ENABLED=false → paywallGate falls through, spike
//     handler returns plain echo, NO indexing happens. Spike requires
//     BOTH flags on: TRUSTBENCH_PAYWALL_ENABLED=true AND
//     TRUSTBENCH_BAZAAR_SPIKE_ENABLED=true.
//   - EXTENSION-RESPONSES: rejected on the settle response → metadata
//     failed strict JSON Schema validation. Inspect rejection reason in
//     logs, fix the schema in src/bazaar-extension.ts, redeploy, retry.
//   - agentic.market/validate doesn't index within 15 min → CDP cache delay
//     is 10 min documented; budget 15. If still not indexed after 1 hour
//     with EXTENSION-RESPONSES: processing returned, escalate to CDP.
//
// CLEANUP: delete this route block and the TRUSTBENCH_BAZAAR_SPIKE_ENABLED
// flag after the spike passes and the production /route extension is live.
if (isBazaarSpikeEnabled() && spikeBazaarExtension) {
  // Same context-attach pattern as /route above. paywallGate reads the
  // bazaarExtension from context and embeds it in the 402 response body.
  app.post(
    '/test/bazaar-spike',
    async (c, next) => {
      c.set('bazaarExtension' as never, spikeBazaarExtension as never);
      await next();
    },
    paywallGate, spikeHandler,
  );
}

// ---------------------------------------------------------------------------
// POST /route/settle — Phase 3 settle (Step 2).
// Server-enforced dedup on route_id (no withIdempotency middleware mounted
// here; deduplication happens inside settleHandler with key '_settle:'+route_id).
// Spend cap is NOT re-checked — the quote is the contract.
// ---------------------------------------------------------------------------
app.post('/route/settle', requireAgent, settleHandler);

// Paid route (x402)
app.get('/rankings/paid', async (c) => {
  const capability = c.req.query('capability') || 'search';
  const data = await getRankings(capability as any);
  return c.json({ success: true, data: data.map(signScorecard), source: 'TrustBench', paid: true });
});

// ---------------------------------------------------------------------------
// MCP tools manifest — describes the public agent-facing endpoints.
// trustbench_get_rankings is the existing public reads; the two route_*
// tools describe the Phase 3 paid-routing flow (will be live once Step 10's
// helper functions are filled in).
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// POST /mcp — MCP Streamable HTTP transport endpoint (Phase 4b)
//
// Native MCP server over HTTP so agents on claude.ai web, ChatGPT, and any
// MCP-capable host can use TrustBench without local installation. Required
// for the Anthropic Connectors Directory (which only accepts Streamable HTTP
// or SSE, not the stdio/npx transport of @trustbench/mcp).
//
// All three tools are read-only and need no API key:
//   - get_rankings   — live scored providers by capability
//   - get_receipt    — fetch a signed receipt by ID
//   - verify_receipt — Ed25519 + on-chain verification
//
// Handler uses direct internal imports (getRankings(), Supabase) to avoid
// an HTTP loopback back to trustbench.io. Supabase client is passed from
// this file's boot-time instance so we share the connection pool.
//
// Failure mode: tool errors surface as JSON-RPC error objects, not 500s.
// See src/mcp-http.ts for full wire-format documentation.
// ---------------------------------------------------------------------------
app.post('/mcp', createMcpHttpHandler(supabase));

// ---------------------------------------------------------------------------
// GET /mcp/tools — REMOVED 2026-05-15.
//
// This endpoint previously served a hand-maintained JSON descriptor that
// drifted from the live MCP server at POST /mcp:
//   - different tool names (trustbench_get_rankings vs get_rankings)
//   - different inventory (route_quote/route_settle were never exposed on
//     the MCP transport — read-only by design in v1)
//
// A reviewer probing both surfaces saw two catalogs disagreeing on names
// and count — a credibility risk for the Anthropic Connectors Directory
// submission. The single source of truth is now the MCP `tools/list` method
// on POST /mcp, served from src/mcp-tools.ts. Any wild client still hitting
// GET /mcp/tools now 404s, which is the right signal — there is one MCP
// surface and it lives at POST /mcp.
//
// Removal context: REVIEW-2026-05-14-mcp-approval-odds.md follow-up critic pass.
// ---------------------------------------------------------------------------

// Public Ed25519 key
app.get('/.well-known/trustbench-pubkey', (c) => {
  const pem = getPublicKeyPem();
  if (!pem) {
    return c.text(
      'No Ed25519 public key configured on this deployment.\n' +
      'Scorecard signatures are currently HMAC-SHA256 (server-internal only).\n' +
      'See /methodology for details.\n',
      503,
      { 'Content-Type': 'text/plain; charset=utf-8' }
    );
  }
  return c.text(pem, 200, {
    'Content-Type': 'application/x-pem-file',
    'Cache-Control': 'public, max-age=86400'
  });
});

// ---------------------------------------------------------------------------
// Agent-discovery surfaces (P4-skill, P4-llmstxt, P4-wellknown).
//
// These three routes serve TrustBench's static discovery files. They're the
// surfaces an agent or crawler looks for first when introduced to a new
// service:
//   - /skill.md is the agent skill file (agentic.market/skill.md format).
//     Pasted into Claude Code / Codex CLI / Gemini CLI / Hermes / Cursor,
//     it teaches the agent the TrustBench quote/settle flow on top of an
//     existing Coinbase Agentic Wallet setup.
//   - /llms.txt is the LLM-grounded research summary (llmstxt.org format).
//     Useful for agents that use an LLM to research "agent payment routing"
//     or "x402 receipts" before integrating.
//   - /.well-known/trustbench.json is the machine-readable manifest of all
//     of TrustBench's public surfaces, capabilities, and signing scheme.
//
// All three are read at boot from the repo root (see loadStatic above) and
// served with a 1-hour cache so iterative content updates take effect quickly
// while still giving CDN edges a useful caching window.
// ---------------------------------------------------------------------------
app.get('/skill.md', (c) => {
  if (!SKILL_MD_BODY) {
    return c.text('skill.md is not deployed on this instance.\n', 503, {
      'Content-Type': 'text/plain; charset=utf-8',
    });
  }
  return c.text(SKILL_MD_BODY, 200, {
    'Content-Type': 'text/markdown; charset=utf-8',
    'Cache-Control': 'public, max-age=3600',
  });
});

app.get('/llms.txt', (c) => {
  if (!LLMS_TXT_BODY) {
    return c.text('llms.txt is not deployed on this instance.\n', 503, {
      'Content-Type': 'text/plain; charset=utf-8',
    });
  }
  return c.text(LLMS_TXT_BODY, 200, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'public, max-age=3600',
  });
});

app.get('/.well-known/trustbench.json', (c) => {
  if (!WELL_KNOWN_TRUSTBENCH_JSON_BODY) {
    return c.text('manifest is not deployed on this instance.\n', 503, {
      'Content-Type': 'text/plain; charset=utf-8',
    });
  }
  return c.text(WELL_KNOWN_TRUSTBENCH_JSON_BODY, 200, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'public, max-age=3600',
  });
});

// ---------------------------------------------------------------------------
// GET /og/:name — per-page OG/Twitter card image.
// Returns the PNG corresponding to a page (home, methodology, rankings,
// pricing, receipt) for inclusion in <meta property="og:image"> and
// <meta name="twitter:image"> on the HTML pages of this site.
//
// Whitelist via OG_CARDS Record: any :name not in the keyset returns 404,
// so the route is path-traversal-proof by construction.
// The `.png` suffix is accepted but optional — agents and link-preview
// crawlers typically request the exact URL emitted in the meta tag, so the
// meta tag should include `.png` for clarity.
//
// Caching: `public, max-age=31536000, immutable`. The URL is the cache key,
// so to invalidate a card, regenerate it and let normal CDN/X re-crawl pick
// it up (X refetches OG images roughly weekly); for a hard invalidate, add
// a `?v=2` query string in the meta tag.
// ---------------------------------------------------------------------------
app.get('/og/:name', (c) => {
  const raw = c.req.param('name');
  const key = raw.replace(/\.png$/i, '');
  const body = OG_CARDS[key];
  if (!body) {
    return c.text('Not found', 404, { 'Content-Type': 'text/plain; charset=utf-8' });
  }
  // Bypass Hono's c.body() overloads (which don't cleanly accept Node Buffer
  // and fall through to the `T extends null` overload, breaking tsc). Use
  // the Web Response constructor directly: BodyInit accepts ArrayBufferView,
  // and Buffer extends Uint8Array which is an ArrayBufferView. No copy.
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
});

// ---------------------------------------------------------------------------
// GET /receipts/:id — public, cache-friendly audit endpoint.
// Returns the exact signed receipt envelope stored in the DB.
// Id is ULID (unguessable). Receipts are immutable → aggressive caching.
// No auth required (RLS already handles public-read-by-id).
//
// Content negotiation (P4-2, 2026-05-06):
//   - Default behavior unchanged: returns the canonical signed JSON envelope.
//   - Browser-preferred (`Accept: text/html` or `?format=html`): renders a
//     polished HTML page with verified-signature + on-chain badges, basescan
//     link, and a copy-paste verifier command. JSON contract is byte-identical
//     for every existing programmatic client (curl with no Accept, the
//     reference verifier in scripts/verify-receipt.js, the paid-probe, etc.).
//   - `?format=json` overrides Accept and forces JSON. `?format=html` does
//     the inverse. Unambiguous escape hatches.
// ---------------------------------------------------------------------------
// Accept both receipt-id namespaces:
//   rcpt_*  — Phase 3 settlement receipts (receipt-generator.ts), stored in
//             the `receipts` table with full Phase 3 ReceiptObject shape.
//   rrcpt_* — Phase 4 paywall routing receipts (paywall-handler.ts:905),
//             stored inside paid_requests.response_body as a SignedRoutingResponse.
//             Different receipt body shape (kind='paid_response.route'); no
//             settlement/pricing block.
// The optional second `r` matches both prefixes without a separate regex.
const RECEIPT_ID_RE = /^r?rcpt_[0-9A-HJKMNP-TV-Z]{26}$/;

// Decide whether the client wants HTML or JSON. Strict rule designed to keep
// every existing programmatic client unchanged: HTML only when explicitly
// requested via `?format=html`, OR when the Accept header lists text/html
// AND does NOT list application/json. `*/*` and absent Accept = JSON.
function preferHtml(accept: string | undefined, formatQuery: string | null): boolean {
  if (formatQuery === 'html') return true;
  if (formatQuery === 'json') return false;
  if (!accept) return false;
  const lower = accept.toLowerCase();
  if (lower.includes('application/json')) return false;
  if (lower.includes('text/html')) return true;
  return false;
}

app.get('/receipts/:id', async (c) => {
  const id = c.req.param('id');
  if (!RECEIPT_ID_RE.test(id)) {
    return c.json({ error: 'receipt_id_invalid' }, 400);
  }

  // ---------------------------------------------------------------------------
  // rrcpt_ branch — Phase 4 paywall routing receipts.
  //
  // Why this branch exists: rrcpt_*-prefixed receipts are emitted by
  // paywall-handler.ts on every successful /route paywall settle. They are NOT
  // inserted into the `receipts` table — instead the entire SignedRoutingResponse
  // envelope (receipt + signature + next_step) is persisted as
  // paid_requests.response_body (jsonb). Before this fix, the public read path
  // 400'd every rrcpt_ URL because the regex rejected the prefix AND the read
  // query targeted the wrong table. That broke the trust-layer differentiation
  // story (signed receipts that are publicly verifiable) and may have blocked
  // CDP Bazaar indexing if the indexer fetches a sample receipt URL after settle.
  //
  // What this branch returns: { receipt, signature } extracted from
  // response_body. next_step is intentionally stripped — it's transient payment
  // requirements for the next call, not part of the signed audit artifact. The
  // signature on `receipt` is over the canonical bytes of `receipt`; verifiers
  // (scripts/verify-receipt.js and @trustbench/verify-receipt on npm) re-derive
  // JCS canonical bytes before verifying, so wire-byte order on this path is
  // not load-bearing.
  //
  // HTML rendering is JSON-only for v1. receipt-html.ts is hard-coded to the
  // Phase 3 ReceiptObject shape (accesses r.settlement.*, r.pricing.*) and
  // would crash on a RoutingReceipt. Sibling renderer is queued as follow-up.
  //
  // Failure mode: if the JSONB filter is mis-shaped, all rrcpt_ lookups 503
  // (Supabase error). Existing rcpt_ flow is unchanged so no regression on
  // Phase 3 receipts. Noticed via smoke fetch of the 5 known rrcpt_ IDs after
  // deploy. Privacy: only response_body.receipt and response_body.signature
  // are emitted; payer/payee addresses + tx_hash are inside the signed receipt
  // body by design (they're the public audit artifact).
  // ---------------------------------------------------------------------------
  if (id.startsWith('rrcpt_')) {
    const { data, error } = await supabase
      .from('paid_requests')
      .select('response_body')
      .filter('response_body->receipt->>receipt_id', 'eq', id)
      .maybeSingle<{ response_body: any }>();

    if (error) {
      console.error('[receipts] rrcpt lookup failed:', error.message);
      return c.json({ error: 'receipt_unavailable' }, 503);
    }
    if (!data || !data.response_body) {
      return c.json({ error: 'receipt_not_found' }, 404);
    }

    const { receipt, signature } = data.response_body;
    if (!receipt || !signature) {
      // Row exists but inner envelope missing/malformed — shouldn't happen
      // under the current paywall-handler emit path, but fail loud rather
      // than emit a half-envelope.
      console.error(`[receipts] rrcpt response_body malformed for ${id}`);
      return c.json({ error: 'receipt_unavailable' }, 503);
    }

    // Content negotiation. Defaults to JSON for every existing programmatic
    // client (curl with no Accept, the npm verifier, paid-probe, etc.); only
    // serves HTML when Accept prefers text/html OR ?format=html. If HTML
    // rendering or chain-verify throws, fall back to JSON so the response is
    // never 500 just because the polished view broke. Receipt envelope is the
    // load-bearing artifact; the page is presentation.
    const wantsHtml = preferHtml(c.req.header('Accept'), c.req.query('format') ?? null);
    if (wantsHtml) {
      try {
        const envelope = { receipt, signature } as SignedRoutingEnvelope;
        const verify = await getOrComputeRoutingVerifyResults(envelope);
        const html = renderRoutingReceiptHtml(envelope, verify);
        return c.html(html, 200, {
          'Cache-Control': 'public, max-age=86400, immutable',
        });
      } catch (err: any) {
        console.error(`[receipts] rrcpt HTML render failed for ${id}: ${err?.message ?? err}`);
        // Fall through to JSON — never 500 a working receipt just because the
        // HTML path tripped.
      }
    }

    return c.json({ receipt, signature }, 200, {
      'Cache-Control': 'public, max-age=86400, immutable',
    });
  }

  // ---------------------------------------------------------------------------
  // rcpt_ branch — Phase 3 settlement receipts. Unchanged.
  // ---------------------------------------------------------------------------
  const { data, error } = await supabase
    .from('receipts')
    .select('receipt_json')
    .eq('id', id)
    .maybeSingle<{ receipt_json: unknown }>();

  if (error) {
    console.error('[receipts] lookup failed:', error.message);
    return c.json({ error: 'receipt_unavailable' }, 503);
  }
  if (!data || !data.receipt_json) {
    return c.json({ error: 'receipt_not_found' }, 404);
  }

  // Content negotiation. Defaults to JSON for every existing client.
  const wantsHtml = preferHtml(c.req.header('Accept'), c.req.query('format') ?? null);
  if (wantsHtml) {
    // Receipts are immutable; verify-result cache makes subsequent renders
    // ~5ms even when the first render did chain RPC. See receipt-html.ts.
    const envelope = data.receipt_json as SignedReceipt;
    const verify = await getOrComputeVerifyResults(envelope);
    const html = renderReceiptHtml(envelope, verify);
    return c.html(html, 200, {
      'Cache-Control': 'public, max-age=86400, immutable',
    });
  }

  return c.json(data.receipt_json, 200, {
    'Cache-Control': 'public, max-age=86400, immutable',
  });
});

// ---------------------------------------------------------------------------
// Receipt explorer (P4-2) — public list of recent TrustBench receipts.
//
// Read-only companion to /receipts/:id. Lists both Phase 3 rcpt_ receipts
// (from the receipts table, public-read RLS) and Phase 4 rrcpt_ paywall
// routing receipts (from paid_requests, surfaced via the curated server-side
// service-role query promised in phase4-schema-paid-requests.sql Deviation 2).
//
// Content negotiation mirrors /rankings and /receipts/:id: browsers
// (Accept: text/html) get the polished list page; agents (Accept:
// application/json or ?format=json) get the programmatic JSON contract.
//
// Cache hint: getRecentReceipts() applies its own 5-min Redis cache; the
// HTTP cache-control of 300s tracks that exactly so the public-facing
// freshness story is consistent across the cache and the rendered page.
//
// Wire-safety: read-only on receipts + paid_requests; does NOT touch /route,
// paywallGate, settle path, or boot-time bazaar declaration. POST /route
// 402 emission stays byte-identical pre/post this route mount.
// ---------------------------------------------------------------------------
app.get('/explorer', async (c) => {
  const rows = await getRecentReceipts(50);
  const wantsHtml = preferHtml(c.req.header('Accept'), c.req.query('format') ?? null);
  if (wantsHtml) {
    return c.html(renderExplorerHtml(rows), 200, {
      'Cache-Control': 'public, max-age=300',
    });
  }
  return c.json({ receipts: rows, count: rows.length }, 200, {
    'Cache-Control': 'public, max-age=300',
  });
});

// Methodology page — Phase 4 redesign in src/methodology-html.ts.
// The new layout mandates the "What this measurement does NOT tell you"
// callout (formerly inline) per the honest-framing rule in CLAUDE.md.
app.get('/methodology', (c) => c.html(renderMethodologyHtml()));

// Privacy policy — required for Anthropic Connectors Directory submission.
app.get('/privacy', (c) => c.html(renderPrivacyHtml()));

// Terms of Service — required for Anthropic Software Directory submission checklist.
app.get('/terms', (c) => c.html(renderTermsHtml()));

// Standalone logo SVG — served for the Anthropic Connectors Directory listing
// and any other context that needs a URL-addressable square logo.
// 1:1 aspect ratio (32×32 viewBox), brand-green on transparent background.
//
// Favicon strategy (revised 2026-05-15):
//   The Anthropic Connectors Directory and Claude tool-call UI both fetch the
//   site favicon via Google's S2 service: https://www.google.com/s2/favicons?domain=...
//   That service is finicky — many implementations of it don't follow 302
//   redirects, and even when they do they often reject SVG responses (S2
//   historically rasterizes from PNG/ICO sources). Previously /favicon.ico
//   redirected to /logo.svg, which caused S2 to cache "no favicon found"
//   and render TrustBench with a grey placeholder in directory + tool calls.
//
//   Fix: serve a real 64×64 PNG (rendered from the same source SVG via
//   ImageMagick, committed under public/favicon.png) directly at /favicon.ico
//   with Content-Type: image/png. Modern browsers and S2 both accept PNG
//   payloads at /favicon.ico when the mime type is correct. /favicon.svg
//   keeps the redirect to /logo.svg (SVG-preferring browsers want SVG).
//   After deploy, Google's S2 cache may take a few days to refresh; see
//   https://www.google.com/s2/favicons?domain=trustbench.io&sz=64 to monitor.
//
// To regenerate the binary: convert -background none -density 600 logo.svg -resize 64x64 public/favicon.png
//
// Implementation note: previously this was an inline base64 const, but the
// tool that wrote the const dropped chunks of the encoded payload during
// formatting, decoding to a corrupt PNG (verified 2026-05-15 via sha256
// round-trip). The file-loaded approach mirrors how OG_CARDS handles its
// PNGs — single source of truth, no transcription risk.
app.get('/favicon.ico', (c) => {
  if (!FAVICON_PNG) {
    // Boot-time load failed (file missing on disk). Fall back to 404 rather
    // than serving wrong bytes — Google's S2 will retry on cache expiry.
    return c.text('Favicon not deployed.', 404, { 'Content-Type': 'text/plain; charset=utf-8' });
  }
  return new Response(FAVICON_PNG, {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=86400, immutable',
    },
  });
});
app.get('/favicon.svg', (c) => c.redirect('https://trustbench.io/logo.svg', 302));

app.get('/logo.svg', (c) => {
  return new Response(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32">
  <!-- bench slats -->
  <rect x="3" y="13" width="26" height="2.5" rx="0.5" fill="#1F7A3A"/>
  <rect x="3" y="17" width="26" height="2" rx="0.5" fill="#1F7A3A"/>
  <rect x="3" y="20.5" width="26" height="2" rx="0.5" fill="#1F7A3A"/>
  <!-- bench legs -->
  <rect x="5" y="22.5" width="2" height="6" fill="#1F7A3A"/>
  <rect x="25" y="22.5" width="2" height="6" fill="#1F7A3A"/>
  <!-- shield -->
  <path d="M16 4 L22 6 L22 12 Q22 15.5 16 18 Q10 15.5 10 12 L10 6 Z" fill="#1F7A3A" stroke="#FAFAF7" stroke-width="0.6"/>
  <!-- T glyph -->
  <text x="16" y="13.4" text-anchor="middle" font-family="Inter, sans-serif" font-weight="700" font-size="8.5" fill="#FFFFFF">T</text>
</svg>`,
    { headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=86400' } },
  );
});


// ---------------------------------------------------------------------------
// Pricing page — Phase 4 v0.1.0 paywall (phase4-paywall-design.md § Q7).
// Content-negotiated same as /rankings + /receipts/:id: browsers (Accept:
// text/html) get the polished page; agents (Accept: application/json or
// ?format=json) get the programmatic tier table.
//
// Source of truth for both shapes is src/pricing-html.ts — tier rows are
// declared once and rendered into either HTML or JSON. To change a price,
// edit PRICING_TIERS in pricing-html.ts and bump PRICING_VERSION.
//
// Cache hint: pricing changes are rare and announced via the visible
// "last_updated" stamp, so 1h public cache is comfortable. Bumping the
// version invalidates cached pages naturally as agents see the new value.
// ---------------------------------------------------------------------------
app.get('/pricing', (c) => {
  const wantsHtml = preferHtml(c.req.header('Accept'), c.req.query('format') ?? null);
  if (wantsHtml) {
    return c.html(renderPricingHtml(), 200, {
      'Cache-Control': 'public, max-age=3600',
    });
  }
  return c.json(buildPricingJson(), 200, {
    'Cache-Control': 'public, max-age=3600',
  });
});

// ---------------------------------------------------------------------------
// Partner exports (/exports/<filename>.csv) — added 2026-05-11.
// ---------------------------------------------------------------------------
// Static-file serving for ad-hoc partner deliverables committed under
// exports/ in the repo (e.g. the Paddock 7-night rollup). Read at request
// time, not boot, so a freshly-committed snapshot is available as soon as
// Railway pulls the new commit. No redeploy beat needed.
//
// Why this route exists at all: Reddit DMs block raw.githubusercontent.com
// URLs by default, and even github.com blob links sometimes trip spam
// filters in partner DMs. Serving from the canonical trustbench.io domain
// gives us a branded URL pattern that partners can ingest cleanly.
//
// Why `exports/` and not `data/`: initial implementation used data/, but on
// this Windows machine a brand-new CSV in data/ was invisible to git
// (test-file in the same dir was tracked fine, ReadOnly attr on data/
// directory, none of the usual ignore-rule explanations fired). Switched
// to exports/ which behaves normally. Worth investigating later but the
// rename is the right semantic name regardless.
//
// Security: filename is restricted to `[A-Za-z0-9._-]+\.csv` to block path
// traversal and accidental exposure of non-CSV files in the exports
// directory. Anything outside that pattern returns 404 with no filesystem
// read.
//
// Failure mode: missing file → 404 plain-text. The route never throws and
// never leaks the underlying filesystem error to the caller.
//
// 404 responses set Cache-Control: no-store (added 2026-05-14). Without it,
// Cloudflare cached a transient 404 for ~4 hours after rollup-latest.csv was
// first requested before the file existed, causing the URL to keep returning
// the cached miss even after the file landed on disk. Forcing no-store on
// the 404 path means a transient miss can never poison the cache again.
app.get('/exports/:filename', (c) => {
  const filename = c.req.param('filename');
  if (!/^[A-Za-z0-9._-]+\.csv$/.test(filename)) {
    c.header('Cache-Control', 'no-store');
    return c.text('Not found', 404);
  }
  try {
    const content = readFileSync(path.resolve(process.cwd(), 'exports', filename), 'utf-8');
    c.header('Content-Type', 'text/csv; charset=utf-8');
    c.header('Cache-Control', 'public, max-age=300');
    return c.body(content);
  } catch {
    c.header('Cache-Control', 'no-store');
    return c.text('Not found', 404);
  }
});

// Analytics dashboard — Phase 4 redesign in src/analytics-html.ts.
// Three category cards (Search/Inference/Data) backed by getRankings(),
// each rendered with a 7-day latency-trend sparkline derived from the
// distribution of recent p50 values. Top-3 providers per capability.
app.get('/analytics', async (c) => {
  const search = await getRankings('search');
  const inference = await getRankings('inference');
  const data = await getRankings('data');

  // 7-day sparkline heights are a placeholder shape derived from current
  // p50 spread (lower latency → taller bars). Once we add a probe-history
  // query we can replace this with a real time-series. Honest framing:
  // the bars represent CURRENT distribution, not 7-day history.
  function spark(rows: RankingRow[]): number[] {
    if (rows.length === 0) return [40, 45, 50, 55, 60, 55, 60];
    const ps = rows.map(r => r.latency_p50).filter(n => Number.isFinite(n)) as number[];
    if (ps.length === 0) return [40, 45, 50, 55, 60, 55, 60];
    const max = Math.max(...ps, 1);
    return ps.slice(0, 7).map(p => {
      const inv = 1 - (p / Math.max(max, 1));
      return Math.round(30 + inv * 65);
    });
  }

  function topRows(rows: RankingRow[]) {
    return rows.slice(0, 3).map(r => ({ name: r.name, score: r.score }));
  }

  const cats: CategoryCard[] = [
    { capability: 'Search',    providerCount: search.length,    topScore: search[0]?.score    ?? null, sparklineHeights: spark(search) },
    { capability: 'Inference', providerCount: inference.length, topScore: inference[0]?.score ?? null, sparklineHeights: spark(inference) },
    { capability: 'Data',      providerCount: data.length,      topScore: data[0]?.score      ?? null, sparklineHeights: spark(data) },
  ];

  // Most-recent last_updated across all rows = the dashboard freshness clock.
  const allUpdated = [...search, ...inference, ...data].map(r => r.last_updated).filter(Boolean);
  const latest = allUpdated.length > 0 ? allUpdated.reduce((a, b) => a > b ? a : b) : new Date().toISOString();

  const analyticsData: AnalyticsData = {
    lastUpdated: latest,
    categories: cats,
    topProviders: {
      search: topRows(search),
      inference: topRows(inference),
      data: topRows(data),
    },
  };

  return c.html(renderAnalyticsHtml(analyticsData), 200, {
    'Cache-Control': 'public, max-age=300',
  });
});

const port = Number(process.env.PORT) || 3000;
serve({ fetch: app.fetch, port });

console.log(`🚀 TrustBench server running on http://localhost:${port}`);

// P4-7: start the in-process pending-reservation sweep timer. No-op when
// SPEND_CAP_RESERVATION_ENABLED!=true. See src/pending-sweep.ts for design.
startPendingSweep();
