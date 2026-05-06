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
import type { SignedReceipt } from './receipt-generator.js';
import { renderRankingsHtml, type RankingRow } from './rankings-html.js';

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

// Router v1 (public GET kept for backward compatibility — score-only readout)
app.get('/route', async (c) => {
  const capability = c.req.query('capability') || 'search';
  const rankings = await getRankings(capability as any);

  if (!rankings || rankings.length === 0) {
    return c.json({ success: false, error: 'No providers available' }, 404);
  }

  const best = rankings[0];
  const fallback = rankings.length > 1 ? rankings[1] : null;

  return c.json({
    success: true,
    capability,
    recommended_provider: best.provider_id,
    score: best.score,
    latency_p50: best.latency_p50,
    fallback_provider: fallback ? fallback.provider_id : null,
    fallback_score: fallback ? fallback.score : null,
    message: `Best current provider for ${capability} is ${best.provider_id} (score: ${best.score}).`,
    full_rankings_url: `https://trustbench.io/rankings?capability=${capability}`,
    signed_scorecards: rankings.map(signScorecard)
  });
});

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
app.post('/route', requireAgent, withIdempotency, requireWithinSpendCap, quoteHandler);

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
app.get('/mcp/tools', (c) => {
  return c.json({
    success: true,
    tools: [
      {
        name: "trustbench_get_rankings",
        description: "Get current TrustBench rankings for a capability",
        parameters: {
          type: "object",
          properties: { capability: { type: "string", enum: ["search", "inference", "data", "media", "infra"] } },
          required: ["capability"]
        }
      },
      {
        name: "trustbench_route_quote",
        description: "Request a payment quote for a capability. Returns a route_id and an x402 payment challenge that the agent's wallet must sign with EIP-3009 transferWithAuthorization. Phase 3 supports Base mainnet + USDC only.",
        parameters: {
          type: "object",
          properties: {
            capability: { type: "string", enum: ["search", "inference", "data", "media", "infra"] },
            max_price: {
              type: "string",
              description: "Maximum the agent will pay for this call, in atomic units of USDC (6 decimals). Example: '10000' = $0.01."
            },
            payer_address: {
              type: "string",
              pattern: "^0x[0-9a-fA-F]{40}$",
              description: "The agent's wallet address (EOA) that will sign the EIP-3009 authorization."
            },
            idempotency_key: {
              type: "string",
              minLength: 16,
              maxLength: 128,
              description: "Unique per logical request, supplied as the Idempotency-Key header. Retries with the same key replay the cached quote."
            }
          },
          required: ["capability", "max_price", "payer_address", "idempotency_key"]
        }
      },
      {
        name: "trustbench_route_settle",
        description: "Submit the agent's signed EIP-3009 transferWithAuthorization to settle a previously quoted route. Returns the provider's response plus a signed Ed25519 receipt (verifiable at /receipts/:id).",
        parameters: {
          type: "object",
          properties: {
            route_id: {
              type: "string",
              pattern: "^qt_[0-9A-HJKMNP-TV-Z]{26}$",
              description: "The route_id returned from trustbench_route_quote."
            },
            signature: {
              type: "string",
              pattern: "^0x[0-9a-fA-F]{130}$",
              description: "65-byte ECDSA signature (r || s || v) over the EIP-3009 authorization payload."
            }
          },
          required: ["route_id", "signature"]
        }
      }
    ]
  });
});

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
const RECEIPT_ID_RE = /^rcpt_[0-9A-HJKMNP-TV-Z]{26}$/;

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

// Methodology page — required reading for anyone interpreting the data.
// Phase 0 of the strategy doc says: name what the probe does and does NOT do,
// in plain language, before any third party tries to cite the data.
app.get('/methodology', (c) => {
  const html = `
<!DOCTYPE html>
<html>
<head>
  <title>TrustBench Methodology</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 760px; margin: 40px auto; padding: 0 20px; background: #0f0f0f; color: #ddd; line-height: 1.55; }
    h1 { color: #22c55e; }
    h2 { color: #22c55e; margin-top: 32px; }
    code { background: #1f1f1f; padding: 2px 6px; border-radius: 4px; color: #fff; }
    pre { background: #1f1f1f; padding: 16px; border-radius: 6px; overflow-x: auto; color: #fff; }
    .warn { background: #2a1a00; border-left: 4px solid #f59e0b; padding: 12px 16px; border-radius: 4px; margin: 16px 0; }
    a { color: #22c55e; }
  </style>
</head>
<body>
  <h1>Methodology</h1>
  <p>
    TrustBench is a public registry of x402-style endpoints with nightly liveness telemetry
    and signed scorecards. This page documents exactly how the data is collected, how scores
    are computed, and what each metric represents — so anyone integrating against the registry
    knows what they're working with.
  </p>

  <h2>Data collection</h2>
  <ul>
    <li>A scheduled job runs once per day on a single cloud host.</li>
    <li>For each provider URL, the prober sends <strong>three sequential requests</strong>
        per run. The three samples are tagged <code>us-east / eu-west / asia-southeast</code>
        for variance accounting; they all originate from the same host today. Multi-host
        probing is on the roadmap.</li>
    <li>Each request is a <code>HEAD</code> with an 8-second timeout, falling back to
        <code>GET</code> if the server returns 405.</li>
    <li>HTTP status codes <code>200, 201, 204, 401, 402, 403, 404, 405, 429</code> are
        recorded as "endpoint is alive." Other statuses, connection errors, and timeouts
        are recorded as failures.</li>
  </ul>

  <h2>Scoring</h2>
  <pre>score = 15
      + 45 · successRate
      + 35 · latencyHealth        // max(0, min(1, 1 - p50 / 2000))
      +  3 · consistencyBonus     // max(0, min(1, 1 - jitter))
clamped to [40, 98]</pre>
  <p>
    <code>p50</code> and <code>p95</code> latency are computed over successful probes only,
    using linear-interpolation percentiles. Timeouts contribute to reliability but are
    excluded from the latency calculation, so a single failure does not distort the latency
    number.
  </p>

  <h2>What each metric represents</h2>
  <div class="warn">
    <ul>
      <li><strong>Score reflects reachability and response time, not capability quality.</strong>
          A 4xx or 429 response confirms the endpoint is up and responding, but does not
          confirm the underlying API behaves correctly when authenticated and paid.</li>
      <li><strong>Latency is single-origin.</strong> All measurements come from one host
          today, so real-world latency from an agent's location will differ. Multi-host
          measurement is planned.</li>
      <li><strong>Payment behavior is not yet measured.</strong> The current probe does not
          execute x402 payments, observe settlement latency, or validate payment-gated
          responses. A capability-aware paid-probe layer ships alongside the router.</li>
      <li><strong>Scorecards are signed with Ed25519.</strong> The public key is served at
          <a href="/.well-known/trustbench-pubkey">/.well-known/trustbench-pubkey</a> so any
          third party can verify a TrustBench scorecard independently. See "Verifying a
          scorecard" below.</li>
    </ul>
  </div>

  <h2>Verifying a scorecard</h2>
  <p>
    Each entry returned by <code>/rankings/paid</code> includes
    <code>signed_payload</code>, <code>signature</code>, and <code>signature_alg</code>
    (<code>ed25519</code> when the deployment has a published public key,
    <code>hmac-sha256</code> as a fallback). The Ed25519 public key is served at
    <a href="/.well-known/trustbench-pubkey">/.well-known/trustbench-pubkey</a>
    and can be used by anyone to verify a scorecard without contacting TrustBench:
  </p>
  <pre>// Reference verifier (Node) — also in scripts/verify-scorecard.js
const pubPem = await (await fetch(BASE + '/.well-known/trustbench-pubkey')).text();
const publicKey = crypto.createPublicKey({ key: pubPem, format: 'pem' });

const valid = crypto.verify(
  null,
  Buffer.from(sc.signed_payload),
  publicKey,
  Buffer.from(sc.signature, 'base64')
);</pre>

  <h2>Roadmap</h2>
  <p>
    TrustBench is evolving from a public registry into a non-custodial smart router and
    payment-plumbing layer for agent commerce. The registry will continue to publish
    liveness telemetry; the next milestones are a capability-aware paid-probe layer
    and a non-custodial <code>/route</code> endpoint that constructs x402 transactions
    for agents to sign and returns a signed receipt. Full plan in
    <code>TrustBench-strategy.md</code>.
  </p>

  <h2>Phase 3 router (in build)</h2>
  <p>The router is currently in active development. When live it will provide the following primitives:</p>
  <ul>
    <li><strong>Authenticated quoting</strong> (<code>POST /route</code>) with argon2id API keys, idempotency keys, and hard spend caps</li>
    <li><strong>Non-custodial settlement</strong> (<code>POST /route/settle</code>) that forwards agent-signed EIP-3009 authorizations</li>
    <li><strong>Signed receipts</strong> with Ed25519 signatures and public audit endpoint at <code>/receipts/:id</code></li>
    <li><strong>Queryable audit trail</strong> — any third party can verify receipts without trusting TrustBench</li>
  </ul>
  <p><em>TrustBench never holds funds, never submits transactions, and never acts as a facilitator.</em></p>

  <p><a href="/analytics">Analytics dashboard</a> · <a href="/rankings?capability=search">Sample rankings</a> · <a href="/health">Health</a></p>
</body>
</html>`;
  return c.html(html);
});

// Analytics dashboard with measurement note
app.get('/analytics', async (c) => {
  const search = await getRankings('search');
  const inference = await getRankings('inference');
  const data = await getRankings('data');

  const html = `
<!DOCTYPE html>
<html>
<head>
  <title>TrustBench Analytics</title>
  <style>
    body { font-family: system-ui, sans-serif; padding: 20px; background: #0f0f0f; color: #fff; margin: 0; }
    h1 { color: #22c55e; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    th, td { padding: 12px; text-align: left; border-bottom: 1px solid #333; }
    th { background: #1f1f1f; }
    .good { color: #22c55e; font-weight: bold; }
    .note { background: #1a1a1a; padding: 12px; border-radius: 6px; font-size: 0.95em; margin: 20px 0; line-height: 1.4; }
  </style>
</head>
<body>
  <h1>TrustBench Analytics</h1>
  <p>Last updated: ${new Date().toLocaleString()}</p>

  <div class="note">
    <strong>How this data is collected:</strong>
    Latency and uptime are measured by a nightly probe that sends three sequential
    <code>HEAD</code> requests per provider from a single cloud host (with a <code>GET</code>
    fallback on 405). HTTP status codes <code>200/201/204/401/402/403/404/405/429</code> are
    treated as "endpoint is alive." This is a liveness check — it confirms the endpoint is
    reachable and responding, but does not execute payments or validate response quality.
    A capability-aware paid-probe layer is on the roadmap. Full methodology:
    <a href="/methodology" style="color:#22c55e">/methodology</a>.
  </div>

  <h2>Providers by Category</h2>
  <table>
    <tr><th>Category</th><th>Count</th><th>Top Score</th></tr>
    <tr><td>Search</td><td>${search.length}</td><td class="good">${search[0]?.score || '—'}</td></tr>
    <tr><td>Inference</td><td>${inference.length}</td><td class="good">${inference[0]?.score || '—'}</td></tr>
    <tr><td>Data</td><td>${data.length}</td><td class="good">${data[0]?.score || '—'}</td></tr>
  </table>

  <h2>Current Top Providers</h2>
  <pre>${JSON.stringify({ search: search.slice(0, 3), inference: inference.slice(0, 3), data: data.slice(0, 3) }, null, 2)}</pre>

  <p><a href="/health" style="color:#22c55e">Health Check</a> | 
     <a href="/route?capability=search" style="color:#22c55e">Router Test</a></p>
</body>
</html>`;

  return c.html(html);
});

const port = Number(process.env.PORT) || 3000;
serve({ fetch: app.fetch, port });

console.log(`🚀 TrustBench server running on http://localhost:${port}`);

// P4-7: start the in-process pending-reservation sweep timer. No-op when
// SPEND_CAP_RESERVATION_ENABLED!=true. See src/pending-sweep.ts for design.
startPendingSweep();
