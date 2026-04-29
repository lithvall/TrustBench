// src/index.ts - FULL CORRECT FILE
import 'dotenv/config';
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { getRankings, signScorecard, getPublicKeyPem, isPublicVerifiable } from './scorer.js';

const app = new Hono();

app.use('*', cors());
app.use('*', logger());

// Health
app.get('/health', (c) => c.json({ status: 'ok', project: 'TrustBench' }));

// Public rankings
app.get('/rankings', async (c) => {
  const capability = c.req.query('capability') || 'search';
  const data = await getRankings(capability as any);
  return c.json({ success: true, data, source: 'TrustBench' });
});

// Router v2
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
    full_rankings_url: `https://trustbench-production.up.railway.app/rankings?capability=${capability}`,
    signed_scorecards: rankings.map(signScorecard)
  });
});

// Paid route (x402)
app.get('/rankings/paid', async (c) => {
  const capability = c.req.query('capability') || 'search';
  const data = await getRankings(capability as any);
  return c.json({ success: true, data: data.map(signScorecard), source: 'TrustBench', paid: true });
});

// MCP tools
app.get('/mcp/tools', (c) => {
  return c.json({
    success: true,
    tools: [
      {
        name: "trustbench_get_rankings",
        description: "Get current TrustBench rankings for a capability",
        parameters: {
          type: "object",
          properties: { capability: { type: "string", enum: ["search", "inference", "data"] } },
          required: ["capability"]
        }
      },
      {
        name: "trustbench_route",
        description: "Get the best recommended x402 provider with fallback",
        parameters: {
          type: "object",
          properties: { capability: { type: "string", enum: ["search", "inference", "data"] } },
          required: ["capability"]
        }
      }
    ]
  });
});

// Public Ed25519 key for verifying signed scorecards.
// Anyone can fetch this and verify any TrustBench scorecard signature without
// ever contacting us — that's the whole point of moving from HMAC to Ed25519.
// Standard well-known path so it's discoverable without docs.
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

// Public methodology page — required reading for anyone interpreting the data.
// Phase 0 of the strategy doc says: name what the probe does and does NOT do, in plain
// language, before any third party tries to cite the data.
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