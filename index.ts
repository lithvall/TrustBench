import 'dotenv/config';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { serve } from '@hono/node-server';
import { getRankings } from './src/scorer.js';   // ← .js extension required for ESM

const app = new Hono();

app.use('*', cors());
app.use('*', logger());

app.get('/rankings', async (c) => {
  const capability = c.req.query('capability') || 'search';
  const limit = Number(c.req.query('limit') || 10);
  const results = await getRankings(capability, limit);
  return c.json({ success: true, data: results, source: 'TrustBench' });
});

app.get('/health', (c) => c.json({ status: 'ok', project: 'TrustBench' }));

// Start server
serve({
  fetch: app.fetch,
  port: 3000,
}, (info) => {
  console.log(`🚀 TrustBench server running on http://localhost:${info.port}`);
});