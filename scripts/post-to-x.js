import { TwitterApi } from 'twitter-api-v2';

(async () => {
  try {
    // Fetch live rankings for the most popular category (search)
    const res = await fetch('https://trustbench-production.up.railway.app/rankings?capability=search');
    const json = await res.json();

    if (!json.success || !json.data || json.data.length === 0) {
      throw new Error('No data returned');
    }

    // Sort by score descending and take top 3
    const sorted = json.data
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);

    const lines = sorted.map((p, i) => 
      ${i+1}.  — 
    ).join('\n');

    const tweetText = TrustBench daily rankings are live!\n\n +
      Search category:\n\n\n +
      Full leaderboard → https://trustbench-production.up.railway.app/rankings?capability=search\n\n +
      #x402 #AgenticMarket #AI;

    const client = new TwitterApi({
      appKey: process.env.X_CONSUMER_KEY,
      appSecret: process.env.X_CONSUMER_SECRET,
      accessToken: process.env.X_ACCESS_TOKEN,
      accessSecret: process.env.X_ACCESS_TOKEN_SECRET,
    });

    const tweet = await client.v2.tweet(tweetText);
    console.log('✅ Posted successfully:', tweet);
  } catch (err) {
    console.error('❌ Post failed:', err);
    // Fallback static post if API is down
    const client = new TwitterApi({
      appKey: process.env.X_CONSUMER_KEY,
      appSecret: process.env.X_CONSUMER_SECRET,
      accessToken: process.env.X_ACCESS_TOKEN,
      accessSecret: process.env.X_ACCESS_TOKEN_SECRET,
    });
    await client.v2.tweet('TrustBench daily rankings are live! Check the best x402 providers right now 👇\n\nhttps://trustbench-production.up.railway.app/rankings?capability=search\n\n#x402 #AgenticMarket #AI');
    console.log('✅ Fallback post sent');
  }
})();
