import 'dotenv/config';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { serve } from '@hono/node-server';
import { getRankings } from './scorer';

const app = new Hono();

app.use('*', cors());
app.use('*', logger());

// Public free rankings
app.get('/rankings', async (c) => {
  const capability = c.req.query('capability') || 'search';
  const limit = Number(c.req.query('limit') || 10);
  const results = await getRankings(capability, limit);
  return c.json({ success: true, data: results, source: 'TrustBench' });
});

// Paid x402 endpoint ($0.002 per lookup) - ready for production
app.get('/rankings/paid', async (c) => {
  const capability = c.req.query('capability') || 'search';
  const limit = Number(c.req.query('limit') || 10);
  const results = await getRankings(capability, limit);
  return c.json({ 
    success: true, 
    data: results, 
    paid: true,
    source: 'TrustBench' 
  });
});

app.get('/health', (c) => c.json({ status: 'ok', project: 'TrustBench' }));

serve({
  fetch: app.fetch,
  port: 3000,
}, (info) => {
  console.log('TrustBench server running on http://localhost:' + info.port);
});