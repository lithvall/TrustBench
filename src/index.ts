// src/index.ts
import 'dotenv/config';
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { paymentMiddleware } from '@x402/hono';
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

// Paid route
app.get('/rankings/paid', paymentMiddleware, async (c) => {
  const capability = c.req.query('capability') || 'search';
  const data = await getRankings(capability as any);
  return c.json({ success: true, data: data.map(signScorecard), source: 'TrustBench', paid: true });
});

// MCP tools
app.get('/mcp/tools', (c) => c.json({ success: true, tools: [...] })); // (kept as before)

// NEW: Simple internal analytics dashboard
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
    body { font-family: system-ui, sans-serif; padding: 20px; background: #0f0f0f; color: #fff; }
    h1 { color: #22c55e; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    th, td { padding: 12px; text-align: left; border-bottom: 1px solid #333; }
    th { background: #1f1f1f; }
    .good { color: #22c55e; }
  </style>
</head>
<body>
  <h1>TrustBench Analytics</h1>
  <p>Last updated: ${new Date().toLocaleString()}</p>
  
  <h2>Providers by Category</h2>
  <table>
    <tr><th>Category</th><th>Providers</th><th>Top Score</th></tr>
    <tr><td>Search</td><td>${search.length}</td><td class="good">${search[0]?.score || '—'}</td></tr>
    <tr><td>Inference</td><td>${inference.length}</td><td class="good">${inference[0]?.score || '—'}</td></tr>
    <tr><td>Data</td><td>${data.length}</td><td class="good">${data[0]?.score || '—'}</td></tr>
  </table>

  <h2>Current Top Providers</h2>
  <pre>${JSON.stringify({
    search: search.slice(0, 3),
    inference: inference.slice(0, 3),
    data: data.slice(0, 3)
  }, null, 2)}</pre>

  <p><a href="/health" style="color:#22c55e">Health Check</a> | 
     <a href="/route?capability=search" style="color:#22c55e">Router Test</a></p>
</body>
</html>`;

  return c.html(html);
});

const port = Number(process.env.PORT) || 3000;
serve({ fetch: app.fetch, port });

console.log(`🚀 TrustBench server running on http://localhost:${port}`);