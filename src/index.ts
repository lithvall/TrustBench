import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { getRankings, getProviderScore } from './scorer.js';
import { paymentMiddleware } from '@x402/hono';

const app = new Hono();

app.use('*', cors());
app.use('*', logger());

// Public rankings (free tier - rate limited)
app.get('/rankings', async (c) => {
  const capability = c.req.query('capability') || 'search';
  const limit = Number(c.req.query('limit') || 10);
  
  const results = await getRankings(capability as 'search' | 'inference' | 'data', limit);
  return c.json({ success: true, data: results, source: 'TrustBench' });
});

// Paid x402 endpoint ($0.002 per lookup)
app.use('/rankings/paid', paymentMiddleware({
  accepts: [{
    scheme: 'exact',
    price: '$0.002',
    network: 'eip155:8453',
    payTo: process.env.PAY_TO_ADDRESS!
  }]
}));

app.get('/rankings/paid', async (c) => {
  const capability = c.req.query('capability') || 'search';
  const limit = Number(c.req.query('limit') || 10);
  
  const results = await getRankings(capability as 'search' | 'inference' | 'data', limit);
  return c.json({ 
    success: true, 
    data: results, 
    paid: true,
    source: 'TrustBench'
  });
});

// Simple health check
app.get('/health', (c) => c.json({ status: 'ok', project: 'TrustBench' }));

// MCP stub for agents
app.get('/mcp/tools', (c) => c.json({
  tools: [
    {
      name: "get_provider_rankings",
      description: "Get top x402 providers ranked by quality, latency, and price for a specific capability",
      inputSchema: {
        type: "object",
        properties: {
          capability: { type: "string", enum: ["search", "inference", "data"] },
          limit: { type: "number", default: 5 }
        },
        required: ["capability"]
      }
    }
  ]
}));

const port = Number(process.env.PORT) || 3000;
console.log(`🚀 TrustBench running on http://localhost:${port}`);

// Fixed serve call for Railway + @hono/node-server
import { serve } from '@hono/node-server';
serve({
  fetch: app.fetch,
  port,
});