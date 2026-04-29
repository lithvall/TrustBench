# Phase 2 — Finding and approaching x402 builders

Goal of Phase 2: three real conversations with people building on x402. One written
expression of interest before any router code gets written.

You don't need to know anyone personally. The x402 community is small enough that
showing up where it lives, with an honest question, is enough. Rough order of best fit.

## Where x402 builders actually hang out

**1. Coinbase Developer Platform Discord.** This is the single highest-density place.
Coinbase is the team behind x402 and CDP, and the Discord has channels for x402, agent
kit, and AgentKit-adjacent topics. Post-and-DM territory: introduce yourself in the
relevant channel, then DM the people who reply with substantive questions.

**2. X / Twitter.** Search `from:` queries for people *currently shipping* with x402,
not just talking about it:
- `x402 lang:en min_faves:5` (filter by some engagement so it's not bots)
- `"x402"` AND any of: `agent`, `wallet`, `router`, `usdc`, `base`, `cdp`
- Watch the replies under @CoinbaseDev / @base / @brian_armstrong x402 announcements
- Look at who reposts the official x402 repo / SDK releases on GitHub
DMs are open with most builders. Lead with one specific question, not a pitch.

**3. GitHub.** The x402 spec and reference implementations live in public repos
(github.com/coinbase/x402 and forks). Look at:
- Recent issue authors and PR contributors
- Forks with custom commits (those are people actually building, not just stargazing)
- Repos that depend on x402 SDKs (use GitHub's "Used by" graph)
Open a respectful issue or comment, then move to email/DM if there's a reply.

**4. Reddit** — see drafts below. Smaller channel than Discord/X for this niche, but
it's where you specifically want to go because (a) you said it suits you and (b)
posts last longer than tweets and can attract builders weeks later via search.

**5. Hacker News.** A "Show HN: TrustBench — a registry + liveness telemetry for x402,
honest about what it measures" once you've shipped Phase 0/1 will pull in 2–3 thoughtful
critics. Don't post until methodology page is live and signing is Ed25519 — HN will
absolutely tear apart anything weaker than that.

**6. Telegram / Farcaster.** Lower priority. There are x402 channels on both, but signal
is patchy. Worth lurking, not worth leading with.

## Subreddits worth posting in (in priority order)

| Subreddit | Why | Tone |
|---|---|---|
| **r/AI_Agents** | Direct audience — builders wiring up agents that need to pay for tools. Most relevant. | Builder-to-builder, technical, no marketing voice. |
| **r/ethdev** | Devs building on Ethereum/L2s. x402 is a Base/USDC thing, mods tolerate genuine technical posts. | Be technical, link the spec, ask a real question. |
| **r/Base** | Smaller but on-protocol. People here are already on Base USDC. | Casual, but no shilling. |
| **r/LocalLLaMA** / **r/LangChain** | Adjacent — agent builders who haven't yet hit the payment-plumbing problem. Good for "is this a problem you'd hit?" framing. | Curious, exploratory. |
| **r/SaaS** / **r/startups** | Lower priority. Useful if you're asking "would you pay 1–3% for this" — broader founder audience. | Founder-to-founder, blunt. |

Avoid r/CryptoCurrency (too noisy), r/MachineLearning (off-topic, you'll get downvoted),
r/Coinbase (mostly retail, not builders).

## Posting playbook

A few rules that keep these posts from getting deleted or downvoted:

- **Disclose you built it.** Reddit smells stealth marketing. "I built this, I'm not
  selling anything, I want to know if I'm wrong about the problem" is fine.
- **Lead with a question, not a product.** The post is research, not launch.
- **Link sparingly.** One link to the registry + one to the methodology page. Not five.
- **Don't crosspost the same wording.** Rewrite for each sub. Mods autodelete copy-paste.
- **Reply to every comment for the first 24 hours.** Reddit's algorithm rewards engagement.

## Draft Reddit post — r/AI_Agents

**Title:**
> If you're building an agent that pays for tools (x402, USDC on Base, etc.) — what's the part that actually hurts?

**Body:**

> Solo founder, building in public. I've been running a small project called TrustBench
> that started as "benchmark x402 providers" and after a few months of probing real
> endpoints I had to admit the methodology was weak — what I'm actually doing is a
> liveness check (HEAD requests, 4xx/429 treated as alive), not a benchmark. The
> registry/telemetry side is honest and useful, but "ranking authority" was overclaiming.
> So I'm rethinking what to build next.
>
> The thing I keep hitting myself when I prototype agents with x402: payment plumbing
> is a lot of boring, mandatory work. Discovery, the 402-pay-retry dance, spend limits
> so the agent doesn't burn through funds in a loop, retry/failover when a provider
> goes down, receipts for accounting. None of it is interesting, all of it is required
> for prod.
>
> Before I write any router code I want to know if this matches anyone else's reality.
> Three questions for anyone actually shipping with x402 (or planning to):
>
> 1. Does payment plumbing hurt enough that you'd outsource it to a hosted,
>    non-custodial router? (Non-custodial meaning you authorize the payment and sign
>    the tx yourself — the router never holds your funds.)
> 2. Which piece is the most painful right now? Discovery, signing, retries, spend
>    limits, accounting, or something I haven't named?
> 3. Would a 1–3% routing spread on each call be acceptable, or does that kill the
>    economics for you?
>
> Genuinely don't know the answer to #3 — that's the question I most want feedback on.
>
> If it helps to see the existing piece: there's a public registry with nightly
> liveness probes at \[link\] and a methodology page that's blunt about what it does
> and doesn't measure: \[link\].
>
> Not selling anything, not on a waitlist, not running an airdrop. Just trying to find
> out if this is a real problem before I spend three weeks building a router nobody
> asked for.

## Draft Reddit post — r/ethdev (slightly more technical)

**Title:**
> Building a non-custodial x402 router — sanity-checking the design before I write it

**Body:**

> Building a small project (TrustBench) on Base that started as a registry of
> x402-style endpoints with nightly liveness telemetry, and I want to extend it into
> a non-custodial smart router for agents that need to pay for tools. Looking for
> feedback from people who've actually integrated x402 or are building agents that
> handle USDC.
>
> The router design I'm sketching:
>
> - Agent calls `/route?capability=search&max_price=0.01` with a payment
>   authorization payload.
> - TrustBench picks the best provider from live scores + real paid probes (not just
>   liveness — actual API calls against the capability), constructs the x402
>   transaction, returns it for the agent to sign.
> - Agent signs and submits; router executes and returns the result + a signed
>   receipt (Ed25519, public key published).
> - TrustBench never custodies funds. The agent's wallet signs every tx.
>
> Open questions I'd love opinions on:
>
> 1. Is "construct tx, agent signs, router executes" actually the right shape for
>    non-custodial here, or is there a cleaner pattern people are already using?
>    (I want to stay miles away from anything that smells like money transmission.)
> 2. For receipts — Ed25519 signature over `{request, fulfillment, payment_tx_hash, ts}`
>    feels like the minimum. Anything else you'd want for accounting/audit?
> 3. For the routing decision itself: live HEAD-probe scores are too coarse on their
>    own. Real paid probes are the obvious fix, but I'm wary of routing decisions that
>    silently bias toward whatever endpoint we last successfully paid for. Anyone
>    solved this in the OpenRouter / model-routing space already?
>
> Existing code (registry + probe pipeline) is at \[link\], full strategy doc at \[link\].
> Honest about the limitations of the current data — methodology page at \[link\].
>
> Solo founder, no token, not raising. Just trying to design this right before I ship.

## Draft X / Twitter post — the reframe

One post, no thread. The aim is to get the right people to click through to
the methodology page, and to give anyone already following @TrustBench
an honest update on the direction.

> Update on TrustBench.
>
> What started as "x402 benchmark" is, honestly, a registry with nightly
> liveness telemetry — useful, but not a benchmark. New methodology page
> spells out exactly what the probe measures, and what it doesn't.
>
> Next: non-custodial router for x402, Ed25519-signed receipts, policy
> firewall. The registry stays as the front door while the router gets built.
>
> https://trustbench-production.up.railway.app/methodology

A second tweet a few days later, framed as a question rather than a launch:

> Building on x402? I'd like 15 min of your time. Trying to learn which
> piece of payment plumbing actually hurts most in production —
> discovery, signing, retries, spend limits, accounting. DMs open.

## Draft Coinbase Developer Platform Discord intro

Short, low-key, in the most relevant channel (#x402 or #agentkit, whichever
is more active when you post). One link, one ask.

> Hi all — solo founder building TrustBench, a public registry of x402-style
> endpoints with nightly liveness telemetry and signed scorecards.
>
> I'm planning to extend it into a non-custodial smart router for agents
> (agent authorizes + signs the x402 tx, TrustBench picks the provider and
> returns a signed receipt — never custodial), and before I write a line of
> router code I want to validate the design with people who are actually
> shipping x402 integrations.
>
> If you're working on agents that pay for tools, I'd really value 15 min
> of your time on three questions: which piece of x402 plumbing hurts most
> right now, would you outsource it to a hosted router, and would 1-3% on
> each call kill the economics. DM me anytime.
>
> Methodology + current registry: https://trustbench-production.up.railway.app/methodology

If a maintainer reacts well, ask once whether the Discord has a #showcase
or #builders channel where it's appropriate to post a short intro thread.
Don't crosspost without permission.

## Outreach mini-checklist

- [ ] Phase 0 deploy (this README + methodology page) live before any post goes up.
- [ ] Ed25519 signing in place before HN.
- [ ] Coinbase Developer Platform Discord — introduce in #x402 (or whatever the active channel is).
- [ ] Post r/AI_Agents version. Reply to every comment within 24h.
- [ ] One week later, post r/ethdev version (different angle, not a copy).
- [ ] X: 1 post per week, not a thread, naming the actual problem (not the product).
- [ ] DM 5 builders/week from the X search query above. One specific question per DM.
- [ ] GitHub: comment thoughtfully on 2–3 x402-related issues. Don't link TrustBench unless asked.
- [ ] Track responses in a simple spreadsheet: name, channel, pain point, would they pay 1–3%.

Phase 2 is "done" when you have at least one written response from a real builder
saying "yes, I would pay for this" with a specific use case.
