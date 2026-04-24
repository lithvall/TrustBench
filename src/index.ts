// src/index.ts
import 'dotenv/config';
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { paymentMiddleware } from '@x402/hono';   // real x402 middleware
import { getRankings, signScorecard } from './scorer.js';

const app = new Hono();

app.use('*', cors());
app.use('*', logger());

// Health
app.get('/health', (c) => c.json({ status: 'ok', project: 'TrustBench' }));

// Public free rankings
app.get('/rankings', async (c) => {
  const capability = c.req.query('capability') || 'search';
  const data = await getRankings(capability as any);
  return c.json({ success: true, data, source: 'TrustBench' });
});

// NEW: Intelligent Router – best provider for any capability
app.get('/route', async (c) => {
  const capability = c.req.query('capability') || 'search';
  const rankings = await getRankings(capability as any);

  if (!rankings || rankings.length === 0) {
    return c.json({ success: false, error: 'No providers available' }, 404);
  }

  const best = rankings[0];
  return c.json({
    success: true,
    capability,
    recommended_provider: best.provider_id,
    score: best.score,
    latency_p50: best.latency_p50,
    message: `Best current provider for ${capability} is ${best.provider_id} (score: ${best.score})`,
    full_rankings_url: `https://trustbench-production.up.railway.app/rankings?capability=${capability}`
  });
});

// Paid route – protected by real x402
app.get('/rankings/paid', paymentMiddleware, async (c) => {
  const capability = c.req.query('capability') || 'search';
  const data = await getRankings(capability as any);
  return c.json({ success: true, data, source: 'TrustBench', paid: true });
});

const port = Number(process.env.PORT) || 3000;
serve({
  fetch: app.fetch,
  port,
});

console.log(`🚀 TrustBench server running on http://localhost:${port}`);