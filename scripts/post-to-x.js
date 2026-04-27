// scripts/post-to-x.js
import 'dotenv/config';
import { TwitterApi } from 'twitter-api-v2';

(async () => {
  const client = new TwitterApi({
    appKey: process.env.X_CONSUMER_KEY,
    appSecret: process.env.X_CONSUMER_SECRET,
    accessToken: process.env.X_ACCESS_TOKEN,
    accessSecret: process.env.X_ACCESS_TOKEN_SECRET,
  });

  // Honest framing: we run liveness telemetry on x402-style endpoints, not a benchmark.
  // Methodology page (/methodology) describes exactly what the probe does.
  try {
    await client.v2.tweet(
      `Nightly x402 telemetry is live. Public registry of x402-style endpoints + ` +
      `liveness probes + signed scorecards. Honest about what we measure (it's a ` +
      `liveness check, not a benchmark — yet).\n\n` +
      `https://trustbench-production.up.railway.app/rankings?capability=search\n` +
      `Methodology: https://trustbench-production.up.railway.app/methodology\n\n` +
      `#x402 #AIagents`
    );
    console.log('✅ Daily post sent successfully');
  } catch (err) {
    console.error('❌ Post failed:', err);
  }
})();