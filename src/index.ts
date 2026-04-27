// src/index.ts - FULL CORRECT FILE
import 'dotenv/config';
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { getRankings, signScorecard } from './scorer.js';

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
  <h1>How TrustBench measures providers</h1>
  <p>
    TrustBench is currently a <strong>registry with liveness telemetry</strong>, not a benchmark.
    This page describes exactly what the nightly probe does, what the score means, and what it
    does <em>not</em> mean. If you're considering citing this data anywhere, read this first.
  </p>

  <h2>What we actually do</h2>
  <ul>
    <li>A GitHub Actions job runs once per day on a single Ubuntu runner.</li>
    <li>For each provider URL in the registry, we send <strong>three sequential requests</strong>
        per run. The three requests are tagged <code>us-east / eu-west / asia-southeast</code> for
        variance bookkeeping, but they all originate from the same host. They are sample slots,
        not real geographic regions.</li>
    <li>Each request is a <code>HEAD</code> with an 8-second timeout, falling back to <code>GET</code>
        if the server returns 405.</li>
    <li>HTTP status codes <code>200, 201, 204, 401, 402, 403, 404, 405, 429</code> are treated as
        "the endpoint is alive and reachable." Anything else, plus connection errors and timeouts,
        counts as a failure.</li>
  </ul>

  <h2>How the score is computed</h2>
  <pre>score = 15
      + 45 · successRate
      + 35 · latencyHealth        // max(0, min(1, 1 - p50 / 2000))
      +  3 · consistencyBonus     // max(0, min(1, 1 - jitter))
clamped to [40, 98]</pre>
  <p>
    <code>p50</code> and <code>p95</code> latency are computed over <em>successful</em> probes only,
    using linear-interpolation percentiles. Timeouts hit reliability (correctly), but they no longer
    poison the latency number.
  </p>

  <h2>What the score does NOT mean</h2>
  <div class="warn">
    <ul>
      <li><strong>It is not proof the API works.</strong> 401/403/404/405/429 all count as "alive"
          — they prove the server responded, not that the underlying capability is functional.</li>
      <li><strong>It is not an x402 payment benchmark.</strong> We do not execute payments, do not
          measure settlement latency, do not observe retry behavior under failed payments, and do
          not check that paid responses contain anything useful.</li>
      <li><strong>It is not multi-region.</strong> All probes originate from one GitHub Actions
          runner. Real-world latency from your agent's location will differ.</li>
      <li><strong>It is not a reputation oracle.</strong> Scorecards are signed today with
          HMAC-SHA256 over a shared secret, which proves provenance to TrustBench but cannot be
          independently verified by third parties. Migration to Ed25519 with a published public
          key is the next foundation task.</li>
    </ul>
  </div>

  <h2>Why we're up-front about this</h2>
  <p>
    TrustBench is evolving from a public registry into a non-custodial smart router and
    payment-plumbing layer for agent commerce. The registry is a useful front door while we build,
    but it would not survive being framed as an authoritative benchmark. Honest framing now is
    cheaper than a credibility hit later.
  </p>
  <p>
    Full strategy and roadmap:
    <a href="https://github.com/">TrustBench-strategy.md</a> in the repo.
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
    <strong>Measurement note (be honest with yourself):</strong>
    Latency and uptime here come from a nightly probe that runs from <em>one</em> cloud host
    (GitHub Actions, Ubuntu) and sends three sequential <code>HEAD</code> requests per provider
    (with <code>GET</code> fallback on 405). HTTP status codes
    <code>200/201/204/401/402/403/404/405/429</code> are treated as "endpoint is alive."
    This is a liveness check, not a benchmark — it does not execute payments, validate that
    the API returns useful results, or characterize behavior under real load. The three
    sample slots are labeled <code>us-east / eu-west / asia-southeast</code> for variance,
    but they all run from the same host. See <a href="/methodology" style="color:#22c55e">/methodology</a>
    for the full description.
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