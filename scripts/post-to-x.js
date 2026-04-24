// scripts/post-to-x.js
import 'dotenv/config';
import { TwitterApi } from 'twitter-api-v2';

(async () => {
  try {
    // Fetch live rankings for all categories
    const [searchRes, inferenceRes, dataRes] = await Promise.all([
      fetch('https://trustbench-production.up.railway.app/rankings?capability=search'),
      fetch('https://trustbench-production.up.railway.app/rankings?capability=inference'),
      fetch('https://trustbench-production.up.railway.app/rankings?capability=data')
    ]);

    const search = (await searchRes.json()).data || [];
    const inference = (await inferenceRes.json()).data || [];
    const dataCat = (await dataRes.json()).data || [];

    const topSearch = search.slice(0, 2).map((p, i) => `${i+1}. ${p.provider_id.replace('-search','')} (${p.score})`).join('\n');
    const topInference = inference.slice(0, 2).map((p, i) => `${i+1}. ${p.provider_id.replace('-inference','')} (${p.score})`).join('\n');
    const topData = dataCat.slice(0, 2).map((p, i) => `${i+1}. ${p.provider_id.replace('-data','')} (${p.score})`).join('\n');

    const tweetText = `TrustBench daily rankings are live!\n\n` +
      `🔍 Search\n${topSearch || 'No data yet'}\n\n` +
      `⚡ Inference\n${topInference || 'No data yet'}\n\n` +
      `📊 Data\n${topData || 'No data yet'}\n\n` +
      `Full leaderboard → https://trustbench-production.up.railway.app/rankings?capability=search\n\n` +
      `#x402 #AgenticMarket #AI`;

    const client = new TwitterApi({
      appKey: process.env.X_CONSUMER_KEY,
      appSecret: process.env.X_CONSUMER_SECRET,
      accessToken: process.env.X_ACCESS_TOKEN,
      accessSecret: process.env.X_ACCESS_TOKEN_SECRET,
    });

    const tweet = await client.v2.tweet(tweetText);
    console.log('✅ Dynamic multi-category post sent:', tweet);
  } catch (err) {
    console.error('❌ Post failed:', err);
    // Fallback
    const client = new TwitterApi({
      appKey: process.env.X_CONSUMER_KEY,
      appSecret: process.env.X_CONSUMER_SECRET,
      accessToken: process.env.X_ACCESS_TOKEN,
      accessSecret: process.env.X_ACCESS_TOKEN_SECRET,
    });
    await client.v2.tweet('TrustBench daily rankings are live! Check the best x402 providers 👇\n\nhttps://trustbench-production.up.railway.app/rankings?capability=search\n\n#x402 #AgenticMarket #AI');
    console.log('✅ Fallback post sent');
  }
})();