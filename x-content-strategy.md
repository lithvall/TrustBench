# X (Twitter) Content Strategy for TrustBench

**Status:** Draft v1 (2026-05-06). Written to brief whoever next touches `scripts/post-to-x.js` and `.github/workflows/post-to-x.yml`.
**Audience:** Future Claude session, future Johan, anyone reasoning about why the cron does what it does.
**Constraint:** Cron runs once/day at 14:00 UTC, ≤280 chars, free-tier API only. The strategy must respect that envelope until X tier upgrades or partner amplification become real.

---

## Part 1 — What TrustBench actually is, in May 2026

Honest, ground-truth picture as of this writing — not aspirational framing.

### Live and shippable today

- **Public registry of x402-style endpoints.** Crawled nightly from three sources, in increasing trust:
  1. **Agentic Market** (`api.agentic.market/v1/services`) — Coinbase's curated catalog. Schema includes `category` (Search/Inference/Data/Media/Infra), `networks`, and `integrationType: '1P' | '3P'` (Coinbase 1P-attested vs proxied).
  2. **Heurist Mesh** (`mesh.heurist.xyz/x402/solana/agents`) — ~150 Solana x402 endpoints. **Stored but filtered out of `/rankings`** until P4-3 ships. Pre-built registry, instant transition when settlement lands.
  3. **`seedKnownX402Endpoints()`** — small, manually live-probed list (e.g. Infopunks's 3 endpoints) marked `x402_verified: true`. Wins on URL conflict so probe metadata is preserved.
- **Nightly liveness probe.** HEAD-request, 3 sequential samples, single cloud host, statuses `200/201/204/401/402/403/404/405/429` treated as alive. Not a benchmark — and we say so out loud at `/methodology`.
- **Score:** `15 + 45·successRate + 35·latencyHealth + 3·consistency`, clamped `[40, 98]`, linear-interp p50/p95.
- **Two-bit verification** displayed per provider: `x402_verified` (empirical — TrustBench probed it and saw a real 402) + `integration_type` (curatorial — Coinbase certified `1P` or `3P`).
- **Ed25519-signed scorecards.** Public key at `/.well-known/trustbench-pubkey`. Reference verifier `scripts/verify-scorecard.js`.
- **Phase 3 router (POST `/route` + POST `/route/settle`).** Argon2id API-key auth, server-enforced idempotency keys, hard spend caps (per-call + rolling, with optional reservation-based variant behind `SPEND_CAP_RESERVATION_ENABLED`), Ed25519-signed receipts. Non-custodial throughout.
- **Public, immutable receipts at `/receipts/:id`.** Content-negotiated: JSON for programmatic clients, polished HTML for browsers (badge: SIGNATURE VALID + ON-CHAIN VERIFIED, basescan link, copy-paste verifier command).
- **`/rankings` HTML rendering.** Capability tabs (Search/Inference/Data/Media/Infra), `1P`/`3P`/`x402-verified` filter pills, sortable score/latency/uptime, search.
- **Agent-discovery surfaces:** `/skill.md` (Claude Code/Codex/Cursor/Hermes paste target), `/llms.txt` (LLM-grounded research), `/.well-known/trustbench.json` (manifest).
- **First real paid receipt landed 2026-05-06.** Public Railway-issued receipt `rcpt_01KQY7C44GAPSXZPFQYRZ1D10C`, tx `0x3e6d6078…`, block 45633871, against Infopunks's Cognition Layer.

### What TrustBench can produce *programmatically* (relevant for cron content)

| Source | Field | Cardinality | Refresh |
|---|---|---|---|
| `/rankings?capability=X` | provider count, top score, top provider name, p50, x402_verified count, integration_type 1P/3P split | per capability × 5 capabilities | nightly (5-min Redis cache) |
| Supabase `receipts` table | count today, total atomic-USDC throughput, latest receipt id, latest tx_hash, latest block_number, latest provider | grows over time | per `/route/settle` |
| Supabase `probes` table | success rate today, slowest probe, fastest probe, % alive | ~3 × N providers / day | per nightly run |
| Supabase `quotes` table | quotes issued today, expiry rate, %-with-fallback-needed | grows over time | per `/route` |
| Supabase `providers` + `metadata.integration_type` | 1P vs 3P split, network coverage, new arrivals (last_crawled_at) | hundreds of rows | per crawler run |
| Receipt envelope JSON | receipt_id, provider_url, latency_ms, amount_atomic, capability, signature | per call | immutable |

**This is the unfair advantage.** No competitor in the routing/policy lane (G402, X-Router, Router402, AgentGatePay, SpendGate) ships a public receipt or a public registry. We do. Every post that pulls from this stack is something only TrustBench can publish.

### What's pending / planned (from `phase4-kickoff.md`)

| Order | Item | Status | Unlocks for X content |
|---|---|---|---|
| P4-7 | Strict reservation-based spend caps | Design landed; ~1 day to ship | "spend caps under concurrency" technical depth post |
| P4-bazaar | TrustBench services on Agentic Market (verify-receipt / score-provider / policy-check) | ~1.5–2 weeks (server-side x402 wire layer) | "we eat our own dog food" — TrustBench paying TrustBench, screenshot of receipt for verifying a receipt |
| P4-3 | Solana support | ~3–5 days; ~150 Heurist endpoints unlock | "registry size doubled overnight" announcement; Solana ecosystem traction |
| P4-4 | `@trustbench/verify-receipt` on npm | ~0.5 day | "install one package, verify any receipt" |
| P4-5 | Public docs site for receipt-spec-v1 | ~1–2 days | spec citation moat; "the receipt format the rest of the ecosystem will copy" |
| P4-9 | Policy firewall subscription | ~5–10 days | first paid SKU launch; pricing reveal |
| P4-10 | Refundable verification bond | ~3–5 days | "skin in the game" reframe of pay-to-list |
| P4-11 | CSV / ledger export | ~2–3 days | enterprise procurement angle |
| P5-dispute | Dispute layer + reputation feedback from receipts | Phase 5 | category-defining "agent payments without disputes are payments waiting for the first incident" |
| P5-multi-protocol | p402 / Canton / cross-protocol routing | Phase 5 | enterprise-agent reach launch |

---

## Part 2 — X content strategy for a developer-infra trust product

### What the audience is

Three concentric circles, each with different tolerance for what we post:

1. **Inner ring (≈100 right people):** other agent-payment infra builders (Infopunks, SpendGate, AgentlyHQ, Paddock, CLU_AGENT, Coinbase x402 team, x402 Foundation contributors), MCP middleware authors, framework maintainers (LangChain/LangGraph/CrewAI). High-context — they will read a block of YAML and a bytes-level wire diff. Engagement from this group = retweets that compound into Tier 2.
2. **Middle ring (≈low-thousands):** agent builders shipping production stuff (compliance-bound, audit-aware), founders of agent companies, devrel/PMs at infra companies. Medium-context — they care about idempotency / spend caps / receipts because they've been bitten. Engagement from this group = follows + DMs.
3. **Outer ring (broader x402 / agent-AI Twitter):** crypto/agent enthusiasts, builders one layer up (apps, not infra), researchers, students. Low-context — they want narrative, milestones, "what does this mean." Engagement = likes + replies, occasional outsized retweets when a post crosses over.

The cron fires once a day. Every post needs to land *primarily* with Ring 1 and 2 (because that's where retweets that compound are). Ring 3 is bonus oxygen.

### Content categories and their mechanisms

What works for trust/infra products aimed at developers, ranked by retweet/reply mechanism:

**A. Live telemetry / "we have data nobody else can publish."**
*Mechanism:* developers retweet specifics. "47 x402 providers in registry, 23 verified, 6 of those Coinbase 1P, top inference score 96" beats "we love x402!" every time.
*TrustBench unfair advantage:* probes, scorecards, receipt counts, throughput, integration-type splits, network coverage are all queryable. **Only TrustBench can publish these numbers from this side of the stack.**
*Cadence:* 2–3×/week.

**B. Real-receipt drops (proof artifacts).**
*Mechanism:* a tweet linking to `/receipts/<id>` is a clickable, verifiable, on-chain proof. The reader can: (1) open the receipt, (2) click the basescan link, (3) run `npm run verify-receipt -- <id>`. Three layers of proof in 280 chars.
*Hooks Ring 1 and 2 hard:* infra people retweet because they recognize the move. Ring 3 sees the link and gets curiosity-pulled into the explorer.
*Cadence:* every meaningful "first" or anomaly. P4-1b first paid receipt against Infopunks is the canonical example. Don't fake these — they only land when they're real.

**C. Honest framing / "what we deliberately do NOT measure."**
*Mechanism:* in a category full of "we've benchmarked the ecosystem!" overclaims, owning the limits is differentiating. Ring 1 retweets because they recognize the discipline. Ring 2 follows because they trust honesty.
*Cadence:* once a week, evergreen rotation of methodology disclosures.

**D. Primitive explainers ("here's why X matters in plumbing form").**
*Mechanism:* an agent-builder reading an explainer that ends "this is shipping in our `/route` today" books a 2-minute integration test in their head. Best when grounded in a concrete failure mode (e.g. "partial-timeout duplicate-pay"). Worst when generic ("idempotency is important"). Karpathy-style framing — concrete, named failure mode, named primitive — works disproportionately well with Ring 1/2.
*Cadence:* 1–2×/week.

**E. Ecosystem pulse / commentary on others' moves.**
*Mechanism:* reacting to Coinbase Agentic Market shipping, x402 Foundation Linux Foundation news, Cloudflare's daily 1B 402s number, Stripe MPP launch — *with a TrustBench-specific angle*, not generic praise. Lands in Ring 1's reply-thread radar.
*Cadence:* opportunistic; when something genuinely ships in the ecosystem.

**F. Milestone announcements (genuine ones).**
*Mechanism:* category-defining wins: Phase 3 closeout, first paid receipt, npm package live, Bazaar listing live, Solana settlement live. Should always link to a verifiable artifact (receipt, npm install command, basescan tx, repo commit).
*Cadence:* whenever real. Don't manufacture.

**G. Quote-reply / partnership amplification.**
*Mechanism:* @InfopunksHQ shipping their Cognition Layer is a TrustBench-adjacent moment. Reply with our receipt of their endpoint. That converts their announcement audience into TrustBench discovery.
*Cadence:* opportunistic, but actively monitored — Grok's job per `CLAUDE.md`.

### Tone discipline

- **No marketing voice.** Coinbase's x402SKILL.md sets the bar: plain language, no jargon, no "MCP server" / "402 handshake" / "payment rails."
- **Concrete > abstract.** "47 providers" not "a growing registry." "$0.0023 routed today" not "real volume."
- **Show, don't claim.** Link to receipts, basescan, verifier output, repo commits. Every quantitative claim should be verifiable in two clicks.
- **Acknowledge limits.** "Single-merchant routing in Phase 3, fan-out in Phase 4" beats hand-waving capability.
- **Pricing transparency every time it comes up.** Flat per-tx, never %-spread. Phase 2 builders rejected the spread; saying so out loud signals we listened.
- **Never claim "benchmark."** We measure liveness. Until paid-probe ships against >1 endpoint with real signal, we are honest about that.
- **No emojis except the ones currently in the rotation.** Once you start, you can't stop without it looking like a vibe shift.

### What we will NOT post

- Engagement-bait threads ("you won't believe what we found").
- Generic crypto/agent-AI hot takes that any account could write.
- Speculation on competitors' fundraising / valuation / fate.
- Anything that claims TrustBench measures payment quality before paid-probe ships against >1 endpoint.
- Anything that implies custody, escrow, or "we hold funds while…"
- "Soon™" / "stay tuned" / "alpha alert" — only post when there is a verifiable artifact to link.

---

## Part 3 — Concrete post plan for the current cron

Today's cron is a static rotation of 7 messages indexed by day-of-year (`scripts/post-to-x.js:32-66`). It needs to evolve into a hybrid: a **deterministic content calendar** (what type of post on what day) with **dynamic content slots** (data pulled at post time from `/rankings` or Supabase). The rotation logic doesn't have to change — what changes is what each slot resolves to.

### Proposed weekly schedule

| Day (UTC) | Slot | Pulls live data? | Mechanism (A–G above) |
|---|---|---|---|
| Mon | **Registry telemetry** — `/rankings` snapshot across capabilities | Yes (5 capabilities, /rankings JSON) | A |
| Tue | **Receipt-of-the-week** — link to a specific recent paid receipt with one-line context | Yes (Supabase `receipts` table; pick latest non-internal) | B |
| Wed | **Primitive deep-dive** — one of {idempotency, hard spend caps, Ed25519 receipts, audit endpoint, non-custodial line, two-bit verification, JCS canonicalization} explained against a concrete failure mode | No | D |
| Thu | **Honest framing** — what we don't measure / non-custodial line / pricing transparency | No | C |
| Fri | **Anomaly or weekly delta** — biggest score change this week, new providers added, new 1P attestations | Yes (`probes` + `providers` 7-day diff) | A |
| Sat | **Ecosystem reply / partnership amplify** *(opportunistic — falls back to evergreen if no signal)* | Sometimes | E / G |
| Sun | **Verifier flex** — show how anyone can verify a TrustBench receipt without trusting TrustBench, with a 2-line code snippet or `npm run verify-receipt` output | Sometimes (latest receipt id) | C / D |

The cron fires once daily, so each day's slot resolves to a single post. Slots A/B/F that pull live data should fall back gracefully (e.g. "no new receipts this week → reuse the most recent" rather than "skip the post"). The rotation continues to be deterministic — day-of-year mod 7 picks the slot — but each slot is a *function* of TrustBench state at post time, not a static string.

### Slot templates with example copy

Variables in `{curly braces}` are filled at post time. Each example is < 280 chars including the 23-char URL allowance.

#### Slot 1 — Registry telemetry (Mon)

**Pulls from:** `getRankings()` for each capability. Aggregate count, top score, top provider name, % verified.

**Example A:**
```
Live x402 registry pulse — {date}.
Search: {n_search} providers, top score {top_search}.
Inference: {n_inference}, top {top_inf}.
Data: {n_data}, top {top_data}.
{n_1p} Coinbase 1P-attested. {n_verified} TrustBench-verified.
Methodology: {METHODOLOGY_URL}
#x402 #AIagents
```

**Example B (compact, when counts are flat):**
```
{total_providers} x402 endpoints in TrustBench's registry today across Search/Inference/Data/Media/Infra. {n_1p} Coinbase 1P-attested, {n_verified} we've live-probed and seen a real 402. Honest scoreboard, not a benchmark: {RANKINGS_URL}
```

**Why it engages:** specific numbers in Ring 1's bullseye. No competitor publishes these splits because they don't have the registry to pull from. Every weekly post becomes a small, evergreen data point.

**A/B variant to test:** lead with the *delta vs last week* (`+3 providers, +2 1P-attested, top inference score +4 pts`) once the historical series exists. Deltas outperform absolutes for retweet velocity in Ring 1/2.

#### Slot 2 — Receipt-of-the-week (Tue)

**Pulls from:** `receipts` table — most recent receipt with `agent_metadata.public: true` (auto-set on internal probe receipts; opt-in for paid agents per P4-2 design).

**Example A:**
```
Receipt of the week: {capability} call against {provider_short_name} settled in {latency_ms}ms, {amount_usdc} USDC on Base, block {block_number}.
Verify it yourself in 30s: npm run verify-receipt -- {receipt_id} https://trustbench.io
Receipt: {RECEIPT_URL}
#x402
```

**Example B (when settlement was async):**
```
This call to {provider_short_name} settled async — merchant returned 200 with no X-PAYMENT-RESPONSE. We pulled the tx_hash off-chain via the EIP-3009 AuthorizationUsed event ({tx_short}, block {block}). Trust the chain, not the merchant's claim. {RECEIPT_URL}
```

**Why it engages:** a clickable, verifiable proof artifact in 280 chars. Ring 1 retweets because they recognize the move ("oh, they actually shipped it"). Ring 2 clicks the verifier command. Ring 3 sees the basescan link in the receipt HTML and gets pulled into the story.

**A/B variant:** sometimes lead with the *failure case* — "we issued a `provider_settlement_missing` here, and here's why that's the right answer over fake-confirming." Honest-failure receipts engage developers harder than success receipts.

#### Slot 3 — Primitive deep-dive (Wed)

Static rotation across 8 primitives, but each refreshed against the actual Phase 3/4 state:

1. Idempotency keys on `/route` — partial-timeout duplicate-pay
2. Hard spend caps (per-call + rolling) — server-side enforcement, atomic-unit
3. Ed25519-signed receipts — JCS-canonical, detached signature, third-party verifiable
4. `/receipts/:id` audit endpoint — replayable proof, immutable, cache-friendly
5. Non-custodial line — agent signs, provider submits, we never broadcast
6. Two-bit verification — `x402_verified` (empirical) + `integration_type` (Coinbase 1P/3P)
7. On-chain settlement lookup — when merchants don't return X-PAYMENT-RESPONSE, we pull from Base via `AuthorizationUsed`
8. Reservation-based spend caps under concurrency (when P4-7 ships)

**Example (idempotency):**
```
The bug nobody catches in dev: agent retries on partial timeout, merchant has already settled, agent pays twice. Phase 3 of TrustBench: required Idempotency-Key on POST /route. Same key + same body replays the cached response. Same key + different body → 409.
{LLMS_URL}
#x402
```

**Why it engages:** a concrete failure mode named in the first sentence, a specific solution in the second, a verifiable artifact in the third. Karpathy-style. Ring 1/2 retweet because the failure-mode framing is instantly recognizable.

**A/B variant:** sometimes lead with a 1-line *quote from a builder conversation* (e.g. SpendGate's Euan Chisholm's "1-3% spread is a big no no" quote, with permission), then the primitive. Quotes outperform claims when they're real.

#### Slot 4 — Honest framing (Thu)

Static rotation across honest-framing posts. Designed to *invite skeptical reading* rather than dodge it.

**Example A — what we don't measure:**
```
TrustBench probes are HEAD requests, 3 samples, single host, statuses 200/401-405/429 treated as alive. That's a liveness check. It is NOT a benchmark.
We say so on /methodology. We'd rather underclaim than have an LLM cite the wrong thing later.
{METHODOLOGY_URL}
```

**Example B — non-custodial line:**
```
TrustBench is HTTP middleware, not a wallet. Agent signs the EIP-3009 authorization. Merchant submits transferWithAuthorization with their own gas. We route + verify. Custody is the regulatory landmine — we don't touch it. {LLMS_URL}
```

**Example C — pricing:**
```
Pricing rule: flat per-tx fee on routed calls. Never a % spread on the routed amount. Phase 2 builder validation killed the spread model directly — flat-per-tx + (Phase 4) policy subscription is the path. {LLMS_URL}
```

**Why it engages:** owning limits in a category full of overclaims is differentiating. Ring 1 retweets because they recognize the discipline. Ring 2 follows because they read it as "this team won't surprise me later."

#### Slot 5 — Anomaly / weekly delta (Fri)

**Pulls from:** 7-day diff on `scorecards`, `providers`, `probes`. Computed at post time.

**Example A — provider drop:**
```
Anomaly this week: {provider_name} ({capability}) score dropped {old_score}→{new_score} after {n_failures}/{n_probes} probe failures. Up at last check: ✅. Today: timing out from our probe host. Investigating in /analytics.
{RANKINGS_URL}
```

**Example B — new arrivals:**
```
{n_new} new x402 endpoints in TrustBench's registry this week (via Coinbase Agentic Market). {n_1p_new} of them are 1P-attested. Top scorer of the new arrivals: {top_new_name} at {top_new_score}.
Browse: {RANKINGS_URL}
```

**Why it engages:** weekly anomaly is the highest-engagement post type for telemetry products in general — it gives Ring 1/2 a reason to check in regularly, and surprises convert into replies ("does this match what you're seeing on your end?").

**A/B variant to test:** lead with the *biggest absolute mover*, regardless of direction. Negative movers can be more engaging than positive movers if the framing isn't gloating.

#### Slot 6 — Ecosystem reply / partnership amplify (Sat)

**No fixed template.** This slot is opportunistic — Grok monitors X for x402/p402/AP2/MPP signal and surfaces threads worth replying to. The cron's job on this day is to either (a) post something Grok queued, or (b) fall back to an evergreen post from the rotation (treat it as a free Slot 1/3/4/7 day).

**Example reply candidates:**
- @InfopunksHQ posts about their Cognition Layer → reply with our receipt of their endpoint
- Coinbase Agentic Market ships a feature → quote-tweet with how it slots into TrustBench's stack
- Cloudflare publishes a 402-volume number → reply with what fraction of those go through TrustBench-routable paths

**Why it engages:** a thoughtful reply on a thread already getting Ring 1 attention is the highest-leverage post we can make. Discoverability is borrowed; engagement compounds.

#### Slot 7 — Verifier flex (Sun)

**Pulls from:** latest public receipt id.

**Example A:**
```
You don't have to trust TrustBench to trust a TrustBench receipt.

  $ npm install -g @trustbench/verify-receipt
  $ verify-receipt {receipt_id} https://trustbench.io
  ✅ SIGNATURE VALID
  ✅ ON-CHAIN VERIFIED (block {block_n})

That's the whole moat. {RECEIPT_URL}
```
*(After P4-4 npm package ships. Until then, swap in `npm run verify-receipt` from the repo.)*

**Example B (until P4-4):**
```
Reference receipt verifier is 80 lines of JS. Reads JCS-canonical bytes, fetches the public key from /.well-known, verifies Ed25519. Optional --check-chain confirms the on-chain transferWithAuthorization. No SDK, no network to TrustBench in the verify path.
{LLMS_URL}
```

**Why it engages:** "you don't have to trust us" is the whole pitch in 280 chars. Ring 1 retweets because they recognize the architectural property (TrustBench-down ≠ payments-down). Ring 2 saves the npm command for later.

### Implementation shape (current cron, no code yet)

The current `scripts/post-to-x.js` does `MESSAGES[dayOfYear % MESSAGES.length]`. The evolution path:

1. Replace the static `MESSAGES` array with a `SLOTS` array indexed by day-of-week (`new Date().getUTCDay()` returns 0–6).
2. Each entry in `SLOTS` is either a static string (legacy path, for slots not yet wired to data) or a `() => Promise<string>` thunk that pulls live data and renders a template.
3. Add a small render layer that fetches `/rankings`, queries Supabase, and substitutes `{placeholders}`. Cap each thunk at 5s with a timeout that falls back to an evergreen string for that slot.
4. Add a length validator that throws *before* posting if the rendered string exceeds 280 chars (counting URLs as 23). The cron currently only logs length post-hoc.
5. Keep the day-of-week rotation deterministic so the calendar is predictable to anyone reading the code.

This is a small, contained change to one file. No new infra. The strategy is what matters — the code shape is mechanical once the strategy is locked.

---

## Part 4 — Evolution plan tied to phases

Each phase ships new primitives, new data, or new artifacts. The cron should evolve to surface them.

### When P4-7 (strict reservation-based spend caps) ships → ~end of week

- **Add to Slot 3 rotation:** "Spend caps under concurrency — the (parallelism − 1) × max_price overshoot from Phase 3 is gone. Pre-debit at quote time, release at settle, sweep on expiry."
- **Retire from honest-framing rotation:** the README's "approximately enforced under concurrency" caveat. We can drop that limitation from public copy because it's no longer a limitation.
- **Why it's higher-value than what came before:** it's a concrete "we said we'd fix this in P4, here's the diff." Ring 1 will retweet a specific bug-class fix far harder than a generic "we improved spend caps" claim.

### When the npm package `@trustbench/verify-receipt` ships (P4-4) → ~0.5 day

- **Update Slot 7 (Verifier flex) template** to lead with `npm install -g @trustbench/verify-receipt`. The one-liner becomes the post.
- **Add a one-time milestone post:** "@trustbench/verify-receipt is live on npm. 80 lines, zero dependencies (except `crypto` and `viem` for `--check-chain`). Verify any TrustBench receipt without trusting TrustBench. {npm_url}"
- **Why higher-value:** "I copied the verifier from a repo" is weaker than "I `npm install`-ed it." Lower friction → more verifications run → more legitimacy in citations.

### When Solana support (P4-3) ships → big

- **Slot 1 Registry telemetry:** registry roughly doubles overnight (~150 Heurist endpoints unlock). Lead the next two Mondays with the size jump.
- **Slot 5 Anomaly / delta:** the *biggest weekly delta we will ever post* is the day Solana endpoints flip from filtered to visible. One-time post: "Registry size {old}→{new}. Solana settlement is live. Same `/route` endpoint, same receipt format, two chains."
- **New Slot 3 entry:** "What it took to add Solana — one schema bit, one network allowlist entry, no router rewrites. The architecture was right." (Build trust by showing the change was small.)
- **Retire:** "Phase 3 supports Base mainnet + USDC only" wording from MCP tool descriptors and README. Update those before posting the milestone so the artifact backs up the claim.
- **Why higher-value:** Solana ecosystem is bigger and more retweet-active than Base for agent payments. This is the post that crosses Ring 3.

### When P4-bazaar (TrustBench services on Agentic Market) ships → ~1.5–2 weeks

- **Three new Slot 2 receipt-of-the-week candidates:** `/v1/verify-receipt` (using TrustBench to verify a TrustBench receipt — meta), `/v1/score-provider`, `/v1/policy-check`. We can post a TrustBench-paying-TrustBench receipt with the flex caption "we eat our own dog food, on-chain."
- **Add to Slot 4 honest framing:** "Our services on Bazaar charge $0.001–$0.005 per call. Same flat per-tx model we said we'd use. Receipts emitted by us, verifiable against us, settled on Base by the merchant (in this case, also us)."
- **Why higher-value:** Bazaar listings are the largest agent-side discovery surface in 2026. Posting *that we are listed there* is itself a discovery-surface event for X-side discovery.

### When the policy firewall subscription ships (P4-9) → ~5–10 days

- **One-time milestone post:** "Phase 4 policy firewall is live — kill switches, allow/deny lists, optional human-in-the-loop, signed webhook alerts. $20–100/mo per agent builder, on top of the free Phase 3 primitives. Subscribe: {url}"
- **New Slot 3 entry on policy primitives.** Each control gets a primitive deep-dive.
- **Retire:** "policy firewall is Phase 4" caveats. The thing exists.
- **Why higher-value:** first paid SKU launch is a credibility moment. Pricing transparency at launch ($20–100, not "contact us") is itself differentiating in a category that loves to hide pricing.

### When P4-10 (verification bond) ships → ~3–5 days

- **Reframe of pay-to-list in Slot 4:** "Bond is refundable, paid in USDC, slashed-and-burned on confirmed misbehavior. Pay-to-list, not pay-to-rank. Routing decisions remain measurement-based."
- **New Slot 1 dimension:** "{n_bonded} providers in the registry posted a verification bond. Ranked alongside everyone else, by score, not by who paid."
- **Why higher-value:** structural moat post — competitors can't claim bonded providers without the bond mechanism.

### When P4-11 (CSV export) ships → ~2–3 days

- **One-time milestone:** "Receipts → CSV. Drop into QuickBooks / NetSuite / Xero. Every Ed25519-signed receipt becomes a row. One curl, one file, no parsing."
- **Why higher-value:** enterprise procurement angle. Lands with Ring 2 founders who have CFOs asking how to expense agent calls.

### When Phase 5 dispute layer ships (P5-dispute)

- **Category-defining launch post:** "Agent payments without a dispute channel are payments waiting for the first incident. {first_dispute_url} closed today, signed resolution artifact in the receipt thread. {url}"
- **New Slot 2 receipt-of-the-week sub-type:** disputed-and-resolved receipts. Far more engaging than happy-path receipts because the audit trail does work the audience hasn't seen before.
- **Retire:** the "Phase 5 territory" caveats from `phase5-design-seeds.md`.
- **Why higher-value:** this is the moat post for the receipt-as-primitive thesis. Coinbase, Stripe MPP, and every routing competitor will have to either copy it or explain why their stack doesn't need one.

### When p402 / Canton support ships (P5-multi-protocol)

- **Reframe of TrustBench's pitch in Slot 4:** "Same `/route` endpoint, three settlement protocols (x402 / p402 / MPP). Agent says capability + max_price; we pick. Single audit trail across protocols."
- **New Slot 2 sub-type:** cross-protocol receipt — the *first one* is the post.
- **Why higher-value:** this is the strategic moat from `TrustBench-strategy.md` Part 5. It's what no x402-only competitor can copy without 6–12 months of Canton work.

---

## Part 5 — Implementation agenda (prioritised changelog)

Each item: **trigger** (what enables it), **change** (what to add/modify in `scripts/post-to-x.js` — described, not coded), **why** (engagement/value rationale), **estimated impact** (low / medium / high on follower growth + Ring 1/2 reach).

### Now — applies to current cron, no new feature dependencies

| # | Trigger | Change | Why | Impact |
|---|---|---|---|---|
| 1 | Always — first thing | Replace day-of-year rotation with day-of-week (Mon-Sun) slot rotation matching the Part 3 schedule. | Predictable calendar = each day's audience knows what to expect. Day-of-year was a hack to avoid state. | Medium |
| 2 | Always — second thing | Add a length-pre-validator that fails the post (and surfaces in CI) if rendered string > 280 chars. Currently length is logged post-hoc. | One bad post = a wasted day of cron. Fail loud, before we burn the slot. | Low |
| 3 | Always — third thing | Replace single string slots with `() => Promise<string>` thunks; add a 5s timeout per thunk that falls back to an evergreen string. | Required for Slot 1/2/5 (live-data slots). Without thunks, we cannot post current numbers. | Medium |
| 4 | After thunks land | Wire Slot 1 (Mon) to `getRankings()` for all 5 capabilities. Render the snapshot template. | First live-data post type. Single biggest jump in differentiation from competitors. | High |
| 5 | After Slot 1 | Wire Slot 2 (Tue) to most recent public receipt from `receipts` table. Render the receipt template with link to `/receipts/<id>`. | Second live-data post type — the verifiable-proof post. Highest Ring 1 retweet value. | High |
| 6 | After Slot 2 | Pre-write Slot 3 (Wed) primitive rotation (8 entries). Static for now. | Karpathy-style primitive deep-dives are the highest-converting Ring 1/2 post-type for agent infra. | Medium |
| 7 | After Slot 3 | Pre-write Slot 4 (Thu) honest-framing rotation (4–6 entries). Static. | Owning limits is differentiating. Don't underestimate the trust accrual. | Medium |
| 8 | After Slot 4 | Wire Slot 5 (Fri) to a 7-day diff query. Surface the biggest score mover and any new 1P attestations. | Anomaly-of-the-week is the highest-engagement post type for telemetry products. | High |
| 9 | After Slot 5 | Slot 6 (Sat) defaults to evergreen if no opportunistic content is queued. Keep the cron from missing days. | Reliability of the calendar matters more than freshness on any single day. | Low |
| 10 | After Slot 6 | Wire Slot 7 (Sun) to latest public receipt id with the verifier-flex template. | "You don't have to trust us" is the whole pitch. Sunday is a high-engagement-day for thoughtful posts. | Medium |

### When P4-4 ships (`@trustbench/verify-receipt` on npm)

| # | Trigger | Change | Why | Impact |
|---|---|---|---|---|
| 11 | P4-4 | Update Slot 7 template to lead with `npm install -g @trustbench/verify-receipt`. | The one-line install becomes the post. Friction-to-verify drops 10×. | Medium |
| 12 | P4-4 | One-time milestone post (insert ahead of the next slot) on the day the package goes live. Link to npm + GitHub. | First-mover npm verifier in the routing/policy lane. | High |

### When P4-7 (strict reservation-based spend caps) ships

| # | Trigger | Change | Why | Impact |
|---|---|---|---|---|
| 13 | P4-7 | Add a new entry to Slot 3 rotation: "spend caps under concurrency — pre-debit at quote, release at settle, sweep on expiry." Drop the README "approximately enforced under concurrency" caveat. | Concrete bug-class fix, retweetable for Ring 1 engineers. | Medium |

### When Solana support (P4-3) ships

| # | Trigger | Change | Why | Impact |
|---|---|---|---|---|
| 14 | P4-3 | One-time milestone post: registry-size jump + "two chains, same receipt format." Insert ahead of the day's slot. | Biggest weekly delta we'll ever post, single largest cross-into-Ring-3 moment. | Very high |
| 15 | P4-3 | Update Slot 1 telemetry template to include network split (Base vs Solana provider counts). | Multi-chain coverage becomes a recurring Mon data point. | High |
| 16 | P4-3 | Add Slot 3 entry: "what it took to add Solana — one schema bit, one allowlist entry." | Architecture-trust post; signals the codebase will keep evolving cheaply. | Medium |

### When P4-bazaar (TrustBench services on Agentic Market) ships

| # | Trigger | Change | Why | Impact |
|---|---|---|---|---|
| 17 | P4-bazaar | One-time milestone: "TrustBench is live on Bazaar. Three pure-compute services, $0.001–$0.005 each, x402 wire shape." | Largest agent-side discovery surface in 2026. | High |
| 18 | P4-bazaar | Add Slot 2 sub-template: meta receipts (TrustBench paying TrustBench to verify a receipt). | "We eat our own dog food" + meta-recursive proof artifact. Engineer catnip. | Medium |

### When P4-9 (policy firewall subscription) ships

| # | Trigger | Change | Why | Impact |
|---|---|---|---|---|
| 19 | P4-9 | One-time milestone post with explicit pricing ($20–100/mo). | First paid SKU launch + pricing-transparency-at-launch. | High |
| 20 | P4-9 | Add 2–3 Slot 3 entries on individual policy primitives (kill switch, allow/deny, HITL). Retire any "Phase 4" caveats. | Recurring depth content for the new SKU. | Medium |

### When P4-10 (verification bond) ships

| # | Trigger | Change | Why | Impact |
|---|---|---|---|---|
| 21 | P4-10 | Add `n_bonded` to Slot 1 telemetry. New Slot 4 post on pay-to-list-not-pay-to-rank. | Structural-moat post; competitors can't easily copy. | Medium |

### When P4-11 (CSV export) ships

| # | Trigger | Change | Why | Impact |
|---|---|---|---|---|
| 22 | P4-11 | One-time milestone: receipts → CSV → QuickBooks/NetSuite/Xero. | Enterprise-procurement angle for the Ring 2 founder audience. | Medium |

### Phase 5 milestones

| # | Trigger | Change | Why | Impact |
|---|---|---|---|---|
| 23 | P5-dispute | Category-defining post on first resolved dispute. New Slot 2 sub-type (disputed-and-resolved receipts). Retire `phase5-design-seeds.md` caveats from public copy. | Receipt-as-primitive moat post. Coinbase/Stripe/competitors must respond. | Very high |
| 24 | P5-multi-protocol | One-time milestone on first cross-protocol receipt. Reframe of `/route` pitch in Slot 4. | Strategic moat per `TrustBench-strategy.md` Part 5. | Very high |

---

## Operating notes

- **Live-data thunks must fail safe.** If Supabase is down or `/rankings` is slow, the post must fall back to an evergreen string for that slot. Never skip a day — silence is worse than a static post.
- **Receipt-of-the-week needs an opt-in flag.** Until P4-2 ships the `agents.metadata.public_receipts` flag, Slot 2 should only pull from internal probe receipts (synthetic traffic, no privacy concern). Adding paid-agent receipts to the rotation requires their explicit consent.
- **Anomaly Slot must not name-and-shame.** Phrase drops as "investigating" not "is broken." Providers reading their score drop on X is fine; a publicly-quoted "X is unreliable" is not.
- **Reply-and-amplify (Slot 6) is the only slot that's not deterministic.** Owned by Grok (per `CLAUDE.md` 2026-05-04 rule change). Falls back to evergreen if no signal that week.
- **Track engagement.** X's free tier doesn't expose much, but at minimum log impressions / engagement in a weekly review. Once a slot has 4+ samples, compare to others. If Slot 4 (honest framing) consistently underperforms Slot 1 (telemetry), shift the calendar — don't preserve aesthetic balance over actual signal.
- **Re-read this doc when pulling Phase 4/5 milestones forward.** The implementation agenda is ordered by current sprint plan in `phase4-kickoff.md`; if priorities reweight, re-walk Part 5 and surface which item-numbers move.

---

## What this strategy is NOT

- Not a guarantee of follower growth — depends on whether Phase 3/4 features land and whether real builders use them. The cron is downstream of product reality.
- Not a substitute for partner amplification (Infopunks, Coinbase x402 Foundation, Anthropic agent docs). Slot 6 is the seam where partner amplification connects to the cron, but the work of cultivating those partnerships is out of scope for this doc.
- Not a substitute for direct outreach. Phase 2 validation came from r/AI_Agents replies and DMs, not from posts. The cron is the *background drumbeat*; outreach remains the foreground.
- Not optimized for going viral. Optimized for accruing trust with Ring 1/2 over time. Outsized retweets are bonus, not the goal.

The whole strategy collapses into one rule: **post things only TrustBench can post, with verifiable artifacts in the link, in language that survives skeptical reading.** Everything in this doc is in service of that rule.
