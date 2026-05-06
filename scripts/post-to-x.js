// scripts/post-to-x.js
//
// Daily autonomous X post.
//
// Solo-founder rule (CLAUDE.md): zero manual daily work. So this script is a
// fixed rotation of honest, on-spec messages indexed by day-of-year — no
// randomness, no scheduling state, no manual content queue. Touch the array,
// commit, GitHub Actions handles the rest.
//
// Honest-framing rule (CLAUDE.md):
//   - The probe is a liveness check, not a benchmark. Never claim otherwise.
//   - Phase 3 (POST /route + signed receipts) is in build, not yet GA.
//     Phrase it as "in build" / "shipping" / "next" — never as "live" until
//     the route handler is wired and a paying agent has used it.
//   - Pricing is flat per-tx, never % spread (Phase 2 validated this).
//   - Non-custodial: agent signs, provider settles, TrustBench routes.
//
// To rotate copy: edit the MESSAGES array. To preview tomorrow's post locally:
//   node -e "import('./scripts/post-to-x.js')" (it'll attempt to send — only
//   run with credentials cleared if you don't want a real post).

import 'dotenv/config';
import { TwitterApi } from 'twitter-api-v2';

const RANKINGS_URL = 'https://trustbench-production.up.railway.app/rankings?capability=search';
const METHODOLOGY_URL = 'https://trustbench-production.up.railway.app/methodology';
const LLMS_URL = 'https://trustbench-production.up.railway.app/llms.txt';

// Each message stays under 280 chars including the trailing links + hashtags
// so it ships even on the free tier. If you add a new entry, run a length
// check by hand — Twitter counts URLs as 23 chars regardless of actual length.
const MESSAGES = [
  // 0 — Registry-first / honest measurement
  `Public registry of x402-style endpoints + nightly liveness telemetry. ` +
    `Honest about what we measure: HEAD-probe liveness, 3 samples, from one host — not a benchmark.\n\n` +
    `${RANKINGS_URL}\nMethodology: ${METHODOLOGY_URL}\n\n#x402 #AIagents`,

  // 1 — Karpathy-framed: spend caps as autonomy slider
  `Karpathy's "autonomy slider" for agentic payments, in plumbing form: ` +
    `hard spend caps (per-call + rolling), enforced server-side, atomic-unit USDC. ` +
    `Shipping in Phase 3 of TrustBench.\n\n${LLMS_URL}\n\n#x402 #AIagents`,

  // 2 — Karpathy-framed: idempotency / "don't let the intern buy it three times"
  `Partial-timeout retries are how agents accidentally pay twice. ` +
    `Phase 3 of TrustBench: required Idempotency-Key on POST /route — same key + same body replays the same response, never re-charges.\n\n` +
    `${LLMS_URL}\n\n#x402 #AIagents`,

  // 3 — Karpathy-framed: verifiability via Ed25519-signed receipts
  `Verifiability is the new bottleneck. TrustBench Phase 3 emits an Ed25519-signed receipt for every routed call ` +
    `(call + settlement + pricing + routing). Detached signature, JCS-canonical, public key + reference verifier in repo.\n\n${LLMS_URL}\n\n#x402`,

  // 4 — Non-custodial line
  `TrustBench is HTTP middleware, not a wallet. The agent signs the EIP-3009 authorization. ` +
    `The provider submits on-chain with their own gas. We route + verify. No custody, ever.\n\n${LLMS_URL}\n\n#x402 #AIagents`,

  // 5 — Pricing transparency
  `Pricing rule: flat per-tx fee, never a percentage spread on the routed amount. ` +
    `Phase 2 builders rejected the spread model directly — flat-per-tx + (Phase 4) policy subscription is the path.\n\n${LLMS_URL}\n\n#x402 #AIagents`,

  // 6 — Audit trail / replayable proof
  // Note: /receipts/:id endpoint is step 9 of phase3-handoff.md — generator
  // is shipped, the public route mount is the last bit. Worded as "every
  // Phase 3 routed call" so it's clear this is the Phase 3 design, not GA.
  `Every Phase 3 routed call gets an audit URL — /receipts/:id, fetchable by anyone holding the (unguessable) ULID. ` +
    `Signed JSON, fresh from the issuer. The proof travels with the agent.\n\n${LLMS_URL}\n\n#x402 #AIagents`,
];

// Day-of-year index → deterministic rotation. No randomness, no state file.
function todaysMessage() {
  const now = new Date();
  const start = Date.UTC(now.getUTCFullYear(), 0, 0);
  const diff = now.getTime() - start;
  const dayOfYear = Math.floor(diff / 86_400_000);
  return MESSAGES[dayOfYear % MESSAGES.length];
}

(async () => {
  const client = new TwitterApi({
    appKey: process.env.X_CONSUMER_KEY,
    appSecret: process.env.X_CONSUMER_SECRET,
    accessToken: process.env.X_ACCESS_TOKEN,
    accessSecret: process.env.X_ACCESS_TOKEN_SECRET,
  });

  const message = todaysMessage();
  try {
    await client.v2.tweet(message);
    console.log('✅ Daily post sent successfully');
    console.log(`   (${message.length} chars)`);
  } catch (err) {
    console.error('❌ Post failed:', err);
    process.exitCode = 1;
  }
})();
