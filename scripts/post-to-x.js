const { TwitterApi } = require('twitter-api-v2');

const client = new TwitterApi({
  appKey: process.env.X_CONSUMER_KEY,
  appSecret: process.env.X_CONSUMER_SECRET,
  accessToken: process.env.X_ACCESS_TOKEN,
  accessSecret: process.env.X_ACCESS_TOKEN_SECRET,
});

client.v2.tweet("TrustBench daily rankings are live! Check the best x402 providers right now 👇\n\nhttps://trustbench-production.up.railway.app/rankings?capability=search\n\n#x402 #AgenticMarket #AI #TrustBench")
  .then(r => console.log("✅ Posted successfully:", r))
  .catch(err => console.error("❌ Post failed:", err));
