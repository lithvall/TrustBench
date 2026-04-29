# Phase 2 — Finding and approaching x402 builders

Goal of Phase 2: three real conversations with people building on x402. One written
expression of interest before any router code gets written.

---

## Send-tomorrow plan (the actual sequence)

Phase 1 is verifiable in production. The first thing that should hit the world tomorrow
is the X reframe; DMs follow over the next 2–3 days so each conversation gets your full
attention as it lands. Concrete cadence at the bottom of this section.

### The X post — tweet 1 (the announcement)

Paste exactly. 270 characters before X auto-shortens the URL.

> Reframed TrustBench publicly.
>
> What I called an "x402 benchmark" was overclaiming — what we actually run is
> nightly liveness telemetry. New methodology page is honest about it.
>
> Scorecards are now Ed25519-signed; anyone can verify them against the public key.
>
> https://trustbench-production.up.railway.app/methodology

### The X post — tweet 2 (post as a reply to tweet 1, same hour)

> Building toward a non-custodial router for x402 next — agent authorizes,
> signs the tx, TrustBench routes + emits a signed receipt.
>
> Before I write a line of router code: which piece of x402 plumbing actually
> hurts most for you? Discovery, signing, retries, spend limits, accounting?

The reply structure matters. Tweet 1 is what you'd want a stranger to find via search;
tweet 2 is what gets replies. Quote-retweet anyone who answers, even briefly.

### DM templates — five recipient types

Each is under ~120 words. **Personalize the bracketed bits before sending.** Don't
send all five in one day — pace them so you can have a real reply thread with each.

#### Template A — "saw your x402 demo / repo"
For: someone who recently shipped or demoed an x402 integration in public.

> Hi [name] — saw [the demo / your repo / your tweet about X]. Nice work on
> [specific thing they shipped].
>
> I'm building TrustBench, a registry of x402-style endpoints with nightly
> liveness telemetry and Ed25519-signed scorecards. Trying to validate
> whether a non-custodial router (you authorize + sign, I route + emit
> signed receipt) is actually a thing builders would pay 1–3% for, before
> I write any router code.
>
> Would you have 15 min sometime this week? I'd really value your honest
> read on which piece of payment plumbing actually hurts in production.
>
> Methodology + the verifier:
> https://trustbench-production.up.railway.app/methodology

#### Template B — coinbase/x402 contributor
For: someone whose name shows up as an issue author or PR author on the spec/SDK.

> Hi [name] — saw your [issue/PR] on coinbase/x402 about [topic]. The
> [specific point they made] matched something I keep hitting.
>
> I run TrustBench (registry + signed liveness telemetry for x402-style
> endpoints, evolving toward a non-custodial router for agents). Before
> I commit to building the router, I'm trying to learn from people closer
> to the spec than me — which integration friction would a hosted router
> actually relieve, and which is just intrinsic to x402?
>
> Open to a quick 15 min call this week if you can spare it. No pitch,
> just want your read. https://trustbench-production.up.railway.app/methodology

#### Template C — agent-framework maintainer (LangChain / CrewAI / agent SDK)
For: people who maintain agent toolkits where x402 is starting to land.

> Hi [name] — building TrustBench, a registry + signed-telemetry layer
> for x402 endpoints, evolving toward a non-custodial router for agents.
>
> The reason I'm DMing: agent frameworks are the layer where payment
> plumbing actually shows up as developer pain. Before I ship a router
> primitive, I want to know whether the right shape for [their framework]
> users is "an MCP-style tool" or "a transparent proxy" or something else
> entirely.
>
> Would 15 min this week work? https://trustbench-production.up.railway.app/methodology

#### Template D — Coinbase Developer Platform community
For: someone active in the CDP Discord / replying under @CoinbaseDev launches.

> Hi [name] — saw you've been active around x402 in the CDP community.
> I'm a solo founder building TrustBench (registry + signed liveness
> telemetry for x402 endpoints, planning to extend with a non-custodial
> router).
>
> Before writing the router, I want to validate the shape with people
> who are actually integrating x402 in production. Three quick questions
> if you have 15 min: which piece of plumbing hurts most, would you
> outsource to a hosted router, would 1–3% per call kill your economics?
>
> https://trustbench-production.up.railway.app/methodology

#### Template E — agent builder shipping a paid agent
For: someone who has a public agent product that calls paid APIs (x402 or otherwise).

> Hi [name] — your [agent / product] is one of the few I've seen that
> actually moves money on behalf of users. That's the audience I'm trying
> to reach.
>
> Building TrustBench: a non-custodial router for x402 (and eventually
> p402) where the agent authorizes + signs and we route to the best
> provider with a signed receipt. Before I build it, I want to know
> whether something like this would actually save you time vs. integrating
> providers directly.
>
> 15 min this week? https://trustbench-production.up.railway.app/methodology

### How to find the right people (so the templates have someone to send to)

In rough order of speed, do these on the same day you post the X tweets:

1. **GitHub.** Open https://github.com/coinbase/x402, click Issues + Pull Requests,
   sort by recent. Note the 5–10 names you see most often. Click their profiles —
   many have a Twitter/X handle on the bio. → Template B.
2. **X search**, paste each into search:
   - `"x402" "shipped"` (people announcing a launch)
   - `"x402" "agent" min_faves:5` (more signal than noise)
   - `from:CoinbaseDev x402` then read replies (people who care enough to engage)
   → Template A or D.
3. **Coinbase Developer Platform Discord.** Find the most active x402 channel.
   Lurk for ten minutes to read tone, then drop the intro from the previous
   section. DM anyone who replies meaningfully. → Template D.
4. **Agent framework Discords / GitHubs.** LangChain, CrewAI, AutoGen. Search
   their issues for "x402" or "payment." → Template C.
5. **AgentPay / a2a-x402 / similar GitHub orgs** (showed up in our research).
   Look at contributors. → Template B.

### One-week cadence

Aim for *quality over quantity*. Three real conversations beat thirty cold sends.

| Day | Action |
|-----|--------|
| **Tue** (tomorrow) | Post X tweet 1 + tweet 2 (reply). Spend 30 min collecting 10 candidate names from the channels above into a notes file (name, where you found them, link, suggested template letter). |
| **Wed** | Send 2 DMs (your two strongest leads). Drop the Discord intro from the earlier section in #x402. Reply to anyone who has commented on the X post. |
| **Thu** | Send 2 more DMs. If anyone replied yes, send a calendar link or agree on a time. |
| **Fri** | Send 1–2 more DMs to round out 5–6 sent total. Check Discord activity. |
| **Sat–Sun** | Read every reply slowly. Take 30 min each call. Write the answers in your tracker. |
| **Mon** | If you have ≥1 written "yes, I'd pay for this," start the Phase 3 router scaffolding. If not, send another batch of 5 and reassess Friday. |

### What "phase 2 done" actually looks like

A spreadsheet (or Notion table) with at least 6 rows of real builders contacted, of
which:

- 3 had a 15-min conversation,
- 1 said in writing some version of "yes, I'd use a non-custodial x402 router and 1–3% is acceptable" with a specific use case,
- and 1 specified which sub-piece (signing / spend limits / accounting / discovery) is their *most* painful right now.

That last one shapes the order Phase 3 builds — the router is non-negotiable, but
the order of the policy + receipt features should follow whatever they said hurts
most.



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
