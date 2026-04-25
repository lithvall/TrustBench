import { serve } from '@hono/node-server';
import app from './index.js';
import 'dotenv/config';

const port = Number(process.env.PORT) || 3000;
console.log(`🚀 TrustBench running on port ${port}`);
serve({ fetch: app.fetch, port });