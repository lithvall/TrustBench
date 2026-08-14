---
stance_version: 2026-05-17
stance_phase: phase-4-post-listing-sprint
stance_pillars: [canonical-receipt-format-standard, neutral-routing-receipt-layer]
signal_date: 2026-05-17
review_trigger: 2026-06-17
stance_frozen: true   # point-in-time signal capture; NOTE review_trigger 2026-06-17 passed ungraded
---

# Signal: agentic.market Week 4 — Bundles + $50M TPV

**Source:** nick.base.eth tweet, approximately 2026-05-17.  
**Filed by:** Claude (TrustBench autonomous operator)  
**Review trigger:** 2026-06-17 (30 days)  
**Updated:** 2026-05-18 — outreach sent, Nick replied, live investigation run. Two-payment shape question answered architecturally (see § Test Results). Action item revised (see § Immediate Action).

---

## Signal Summary

agentic.market shipped "bundles" — multi-service x402 orchestration that stitches results
from several providers into structured output in ~30 seconds for $0.03-$0.04. Three bundles
live: Market Research, Morning Briefing, Talent Market Scanner. Concurrent with this, x402
crossed $50M TPV. Nick explicitly invited service operators to propose bundles or get their
service into existing ones.

This is two signals in one. The bundles feature confirms that agentic.market is building
*above* individual x402 services (orchestration layer). The TPV milestone confirms the
underlying payment rail is real at scale. Both are directly relevant to TrustBench's
current positioning.

---

## Q1: Could TrustBench BE a bundle on agentic.market?

**Short answer:** Yes, in two distinct shapes — and one of them is actionable this week with
no new code.

### Shape A — TrustBench as a service *called within* a bundle

A bundle calls TrustBench as one step among several. For this to work, TrustBench needs an
x402-paywalled HTTP endpoint that returns something useful to a bundle orchestrator.

**What's viable today (Ready Now):**

- `/rankings` is already live, publicly discoverable, and returns scored provider data. A
  "Provider Intelligence" step in a Market Research or Talent Scanner bundle could call
  `/rankings?capability=search` to identify top-scored x402 providers before routing a
  downstream capability call. No new code needed.
- `/route` is already x402-paywalled and callable. A bundle that dynamically selects the
  best x402 provider for a given capability could call `/route` as the routing step. The
  routing receipt comes back as part of the bundle's structured output.

Caveat on `/route` in a bundle: the current two-payment shape (agent pays TrustBench fee,
then agent pays provider fee) means the bundle orchestrator would need to handle both
payments. Whether agentic.market's bundle runner supports multi-payment flows is unknown —
this needs a direct question to nick.

**What needs 2-4 weeks:**

- `/verify` endpoint (v0.2.0 in `phase4-paywall-design.md`): a hosted HTTP endpoint that
  accepts a receipt and returns a verification verdict, paywalled at $0.002. This is the
  cleanest bundle-step story: "after the bundle runs, call TrustBench `/verify` to append
  a signed verification badge to the structured output." Bundles that want to ship
  "verified commerce" output add TrustBench as their last step.
- This needs the v0.2.0 paywall scope to land. Estimated effort: 1-2 focused days once
  the v0.1.0 pattern is proven (idempotency + settlement + Ed25519 signing already shipped
  for `/route`; `/verify` is a lighter version of the same plumbing).

**What needs 3+ months:**

- A "Verified Commerce" bundle fully designed and shipped BY TrustBench. Bundles on
  agentic.market appear to be submitted to and hosted by the agentic.market team, not
  operator-hosted. TrustBench cannot unilaterally ship a bundle without agentic.market
  cooperation. The 3+ month horizon assumes negotiating bundle design + submission + review.
  The 2-4 week horizon gets the same strategic outcome (TrustBench as a step inside a
  bundle) without requiring that negotiation.

**Feasibility rating:**

| Shape | Feasibility | Blocker |
|---|---|---|
| `/rankings` as a bundle step | Ready Now | None — endpoint is live and discoverable |
| `/route` as a bundle step | Ready Now (with one open question) | Need to confirm bundle runner handles two-payment flow |
| `/verify` as a bundle step | 2-4 weeks | v0.2.0 paywall scope; `/verify` endpoint not yet shipped |
| Full "Verified Commerce" bundle submitted to agentic.market | 3+ months | Bundle submission process unknown; requires agentic.market cooperation |

**Six-question filter check:**

1. Pillar: both. Shape A (bundle step) advances Pillar 2 (routing inventory / discovery
   surface). Getting TrustBench receipts embedded in bundle output advances Pillar 1
   (Option A flavor — agentic.market adopts TrustBench receipt format).
2. Pillar 1 mechanic: adoption by demonstration. If bundle output routinely includes a
   `trustbench_receipt_url` field pointing at a signed `rrcpt_` receipt, that is receipt
   format adoption at scale across $50M+ TPV.
3. Pillar 2 mechanic: discovery surface + routing inventory. Being called by bundle
   orchestrators means TrustBench gets discovered on every bundle run.
4. Not "neither" — passes.
5. Option A flavor for Pillar 1; Pillar 2 maintenance for the routing step.
6. Less-effort path: yes. The reply to nick costs one message. A `/verify` implementation
   costs 1-2 days. Both are materially cheaper than building and hosting a standalone bundle.

**Filter verdict: passes all six. Proceed.**

---

## Q2: Does bundle orchestration compete with TrustBench?

**Positioning verdict: complementary, with one encroachment vector to watch.**

### The clean complement case

Bundles operate at the workflow composition layer. TrustBench operates at the payment
integrity + provider selection layer. These are different abstractions.

Bundles answer: "What sequence of x402 services produces useful output from a single prompt?"
TrustBench answers: "Which provider is the best choice for a capability call right now, and
can I prove what was paid for?"

Bundles don't do signed receipts, provider scoring, or audit trails. TrustBench doesn't do
output stitching, prompt handling, or result summarization. A bundle without TrustBench
produces structured output with no payment attestation. A bundle with TrustBench as a step
produces structured output with a signed, on-chain-verified receipt for every service call.

This is the strongest complement case: $50M in TPV is $50M that flowed through x402 without
signed receipts. That is TrustBench's open surface — be the receipt layer on top of that
volume.

### The encroachment vector

If agentic.market's bundle orchestration eventually adds:

1. **Provider quality scoring** — "pick the best service for this task" logic built into
   bundle routing. This encroaches on TrustBench's routing intelligence (Pillar 2). It
   would make TrustBench's scoring data potentially redundant if agentic.market builds their
   own quality signals. Watch for this.

2. **Proprietary transaction receipts** — if agentic.market starts issuing its own "bundle
   transaction confirmed" artifacts with provenance claims. This encroaches on Pillar 1
   (canonical receipt format). The critical question would be whether their format is
   compatible with or competes with `receipt-spec-v1.md`.

Neither of these is visible today. Bundles currently call hardcoded service lists — they do
not dynamically rank or select providers. And there is no bundle-issued receipt format in the
signal.

**Verdict:** complementary today. The encroachment risk materializes only if agentic.market
adds provider intelligence OR a proprietary receipt format. Monitor for both — specifically,
watch whether bundle output objects start including payment provenance fields.

### The $50M TPV framing

$50M TPV is a validation signal for TrustBench's rail choice, not a competitive threat.
More TPV on x402 means more calls that could carry a TrustBench receipt. The Phase 2
validation finding (builders want signed receipts, queryable audit trails) applies directly
to every bundle call at scale.

---

## Outreach Status (updated 2026-05-18)

**Done.** The reply to nick.base.eth went out from @TrustBench on 2026-05-18.

**What was sent:**
> "TrustBench is on agentic.market and /route is x402-callable. Does the bundle runner
> handle the two-payment shape (TrustBench fee + provider fee in one request), or
> single-payment-only? Also: every x402 call could carry a signed receipt URL for audit.
> Compose-fit."

**Nick's response (2026-05-18, 18 views, 1 comment, 1 like):**
> "the bundles are live, feel free to test!"

**What this tells us:** Nick did not directly answer the two-payment shape question. "Feel
free to test" is an invitation, not a spec. The architecture question — whether the bundle
runner handles two sequential x402 payments or expects a single-payment flow — is still
open. It can only be answered empirically now, not by asking again.

## Immediate Action for Johan

**The original test design was wrong. Update: no live bundle test is needed.**

The investigation on 2026-05-18 established that bundles are agent prompts, not HTTP API
endpoints. There is no "bundle runner" to be compatible with. The two-payment shape
question as originally framed has been answered architecturally:

- TrustBench `/route` requires two x402 flows per logical step (TrustBench routing fee +
  provider fee) plus a second HTTP call from the agent to the selected provider (per
  `phase4-paywall-design.md` Q3). MORE complex than a single-call bundle step, but
  technically usable — LLM-driven bundle runners already handle multi-step workflows
  natively. Not the cleanest fit; not architecturally incompatible. Open strategic
  question (see § Open Strategic Question) on whether to position `/route` or `/verify`
  as the bundle-integration story.
- TrustBench `/verify` (v0.2.0, not yet shipped) is single-call x402 shaped. Currently
  scoped per `phase4-paywall-design.md` line 52 as "hosted verifier for externally-
  provided receipts" — that verifies TrustBench-format receipts, not arbitrary x402
  PAYMENT-RESPONSE artifacts from non-TrustBench services. Using `/verify` as a
  bundle-attestation last-step would require either (a) bundle steps being TrustBench-
  routed so receipts are TrustBench-format, OR (b) a scope expansion to attest
  non-TrustBench x402 receipts. Option (b) is not in the current `/verify` design.
- TrustBench `/rankings` (live today) IS bundle-step shaped as a read-only data source.
  Single GET, no payment for HTML; quota-gated free JSON below 60 req/IP/min then 402
  above quota. Cleanest fit available today.

**What IS worth testing (optional, if Johan has a funded wallet and 30 minutes):**

The two-payment flow end-to-end — not to answer the bundle question, but to validate the
live paywall works correctly and produces a clean `rrcpt_` receipt:

```powershell
# From Windows host, with awal installed and wallet funded
npx awal x402 pay "https://trustbench.io/route" `
  --method POST `
  --body '{"capability":"search","query":"test"}'
# Expected: 402 → pay $0.005 TrustBench fee → routing decision with provider URL
# Then: call the provider URL with X-PAYMENT to complete the flow
# Check: receipt appears at https://trustbench.io/receipts/<rrcpt_id>
```

This is a nice-to-have paywall smoke test, not urgent. The live test that matters is
waiting for any external agent wallet (Strata, Infopunks, or cold inbound) to hit the
paywall and generate a receipt. That's the real milestone.

**Do not reply to Nick with the same question.** One more "does the bundle runner handle
X" message reads as not having tried. But do NOT condition the next touch on `/verify`
shipping specifically — that's a feature-gate that could be weeks-to-months out depending
on design and v0.2.0 sprint ordering. The trigger for the next touch is "concrete content
to offer," which could be:

- A drafted TrustBench-flavored bundle prompt using existing v0.1.0 capability (achievable
  in 30-60 min of writing work, no `/verify` required)
- An external agent wallet (Strata, Infopunks, cold inbound) generating a real `rrcpt_`
  receipt against paywalled `/route`
- `/verify` shipped + a working demo endpoint
- Bundle execution evidence from a wallet running a current bundle prompt with TrustBench
  inserted

Any of these gives Nick substantive content. Don't pre-commit to `/verify` as the gating
artifact.

---

## Test Results

**Status: architectural pre-test finding — test design was based on a misconception.
Updated 2026-05-18. See diagnosis notes below.**

| Field | Value |
|---|---|
| Bundle tested | Morning Briefing + Talent Market Scanner (pages fetched, not called) |
| Bundle endpoint URL | **None — bundles have no HTTP API endpoint** |
| TrustBench routing fee paid | Not applicable |
| Bundle 402 received? | Not applicable |
| Bundle payment succeeded? | Not applicable |
| Two-payment shape: works / fails / partial | **Moot — see diagnosis** |
| Raw error (if any) | n/a |
| Receipt URL (if success) | n/a |
| Test date | 2026-05-18 |

**Diagnosis notes:**

**The test as originally designed was impossible to run — and the reason tells us something
important about what bundles actually are.**

Fetching `https://agentic.market/bundles/morning-briefing` and
`https://agentic.market/bundles/talent-market-scanner` live on 2026-05-18 reveals that
**bundles are agent prompts, not HTTP endpoints.** Each bundle page contains:

1. A text prompt with workflow instructions (copy-paste into your LLM agent)
2. A service table listing individual x402 service URLs (e.g., `blockrun.ai/api/v1/exa/search`)
3. The agent calls each service directly, in the order the prompt specifies

There is no `POST https://agentic.market/bundles/morning-briefing` API that a caller can
hit with an X-PAYMENT header. The "bundle runner" IS the LLM agent. agentic.market's
role is curation and discovery — they write the prompt and list the services; the agent
executes the workflow.

**Wire trace of what a bundle call actually looks like (Morning Briefing, ~$0.03-0.04
total):**

```
# The agent reads the bundle prompt, then executes individually:
Agent --> POST https://api-seerium.xyz/...         # $0.001 — News Feed
Agent --> POST https://toon.haus/finance/...       # $0.005 — Market News
Agent --> POST https://orbisapi.com/...            # $0.003 — Crypto Sentiment
Agent --> POST https://blockrun.ai/api/v1/exa/... # $0.007 — Deep Dive Search
Agent --> POST https://parallel.life/...          # $0.010 — Parallel Search
Agent --> POST https://blockrun.ai/api/v1/exa/... # $0.005 — Exa Answer (optional)
# Each call is an independent x402 flow: 402 → sign → pay → result
```

Six independent x402 flows. Each one has its own 402 challenge and its own payment.

**What this means for the two-payment shape question:**

The original framing — "does the bundle runner handle two payments?" — was wrong. The
correct framing is: "does including TrustBench `/route` as a step in a bundle prompt add
acceptable complexity?"

TrustBench's `/route` flow per `phase4-paywall-design.md` Q3 is:

```
Agent --> POST https://trustbench.io/route          # Step 1: get routing decision
TrustBench <-- 402 (routing fee $0.005)
Agent pays TrustBench fee via X-PAYMENT
TrustBench --> 200 OK + routing decision + next provider URL + provider payment requirements

Agent --> POST <provider-url>                        # Step 2: call the selected provider
Provider <-- 402 (provider's price, e.g. $0.007)
Agent pays provider fee via X-PAYMENT
Provider --> 200 OK + data
```

Two x402 flows per TrustBench-routed call. The second payment goes directly from the agent
to the provider — TrustBench never holds it (non-custodial).

For an LLM agent running a bundle prompt, this flow is **technically compatible but
architecturally awkward:**

- Standard x402-capable agents handle multiple 402 flows naturally (each call is independent)
- BUT TrustBench's `/route` is a routing-decision endpoint, not a data endpoint — it returns
  "call THIS provider at THIS price" rather than returning the data itself
- A bundle prompt that includes TrustBench would need TWO steps per capability call:
  `(1) call /route to get provider URL → (2) call provider with returned URL`
  rather than `(1) call provider directly`
- That's a prompt-level complexity increase, not a wire-level incompatibility

**The clean bundle story is `/verify`, not `/route`.**

TrustBench's `/route` is not bundle-step shaped — it's a routing intermediary. What IS
bundle-step shaped is the planned v0.2.0 `/verify` endpoint: one HTTP call, one 402, one
signed verdict. A bundle could end with "call TrustBench `/verify` on the last receipt to
append a verification badge to the output." That's a clean single step.

**Minimum setup to run a live two-payment test (for Johan to run manually):**

```powershell
# Install awal (agentic wallet CLI) if not already installed
npm install -g awal

# Set up a funded wallet (USDC on Base)
awal wallet setup

# Call TrustBench /route (first 402 — TrustBench routing fee $0.005)
npx awal x402 pay "https://trustbench.io/route" \
  --method POST \
  --body '{"capability":"search","query":"TrustBench competitive analysis"}'

# The response includes a routing decision + provider URL + provider payment requirements.
# Then call the provider URL with a second payment (second 402).
```

What to observe:
- Does the routing decision come back with a clean `next_step.provider_url`?
- Does the provider's 402 shape match what TrustBench returned in `next_step.payment_requirements`?
- Does a signed `rrcpt_` receipt appear at `https://trustbench.io/receipts/<id>`?

This test CANNOT be run from the Claude sandbox (no outbound HTTP access; web_fetch has URL
provenance restrictions blocking trustbench.io). It requires Johan to run locally with a
funded wallet.

---

## What This Changes (if anything)

**It doesn't change the active Phase 4 sprint focus.** Strata §10 integration closed
2026-05-15 (both sides); pre-launch maintenance through Strata's Show HN week of
2026-05-26. v2 header migration tail still queued. Bundle-prompt drafting fits as parallel
low-effort writing work.

**The feasibility table in Q1 needs one correction.** The row "`/route` as a bundle step —
Ready Now" was based on the assumption that bundles have a runner that handles multi-payment
flows. They don't. The correct assessment:

| Shape | Feasibility | Updated assessment |
|---|---|---|
| `/rankings` as a bundle step | Ready Now | Unchanged. `/rankings` is a single direct call. |
| `/route` as a bundle step | Workable, not cleanest | Returns a routing decision; agent then makes a second HTTP call to the selected provider with its own X-PAYMENT. Two x402 flows + two HTTP calls per logical step (vs one call/payment for a direct service). LLM-driven bundle runners handle multi-step workflows natively; prompt-level complexity is real but not architecturally blocking. Decision deferred pending open strategic question (see § Open Strategic Question). |
| `/verify` as a bundle step | 2-4 weeks (narrow scope) to weeks-months (bundle-attestation scope) | Single-call shape IS bundle-step clean. Current `/verify` design per `phase4-paywall-design.md` line 52 verifies TrustBench-format receipts only; bundle-attestation use case (verify non-TrustBench x402 PAYMENT-RESPONSE artifacts) requires scope expansion. Scope decision pending. |
| Full "Verified Commerce" bundle | 3+ months | Unchanged. Requires agentic.market cooperation. |

**It surfaces an open strategic question on TrustBench's bundle-integration framing — see
§ Open Strategic Question below.** Do not pre-commit `/verify` over `/route` via this
signal file. The question needs the six-question filter applied explicitly before the
bundle-context analysis becomes a pillar-emphasis shift.

**It confirms the listing was the right call.** Being listed means TrustBench shows up when
nick or other bundle designers browse agentic.market services. The `/rankings` endpoint is
already bundle-step shaped and discoverable from the listing.

---

## Open Strategic Question (added 2026-05-19)

**Question:** In the bundle / orchestration context, should TrustBench's primary
integration pitch be `/route` (routing layer, Pillar 2) or `/verify` (attestation layer,
Pillar 1 emphasis)?

**Why this is open:** The bundle-context analysis on 2026-05-18 surfaced that `/route`
adds prompt-level complexity (two x402 flows + second HTTP call per logical step) while
`/verify` is single-call shaped. Real architectural friction. BUT translating that
friction into a strategic emphasis shift ("position TrustBench as verifier, not router,
for bundles") is a Pillar 1 / Pillar 2 emphasis decision that needs to pass the
six-question filter explicitly, not slip in via signal-file edit.

**Considerations on the "stay routing-first" (Pillar 2) side:**

- `/route` is the differentiated work + revenue surface ($0.005/call vs $0.002 for
  `/verify`)
- Listed competitor MAKO Pulse is positioning specifically on routing+receipt layer;
  ceding that lane in the bundle context risks ceding it broadly
- Current Phase 4 commitments (Strata §10 closed 2026-05-15, pre-launch maintenance
  through Show HN week of 2026-05-26; v2 header tail) are routing-focused
- Bundle orchestration is one context; non-bundle routing (direct agent calls) is another,
  likely the larger volume surface long-term
- LLM-driven bundle runners CAN handle the two-step `/route` flow; friction is
  prompt-complexity, not incompatibility

**Considerations on the "pivot to verification-first in bundle context" (Pillar 1
emphasis) side:**

- `/verify` is cleaner as a bundle last-step (one call, one payment, one signed verdict)
- Pillar 1 is advanced more by attestation adoption than by routing volume
- Bundle authors may resist the prompt-complexity of two-step `/route` and skip TrustBench
  entirely; verification-last-step is lower friction
- The strongest defensible position per `strategic-pillars-and-options-2026-05-14.md` is
  owning BOTH pillars; verification-first in bundles doesn't preclude routing-first
  elsewhere

**Design work required if pivot is selected:**

- `/verify`'s current scope per `phase4-paywall-design.md` line 52 is "hosted verifier for
  externally-provided receipts" — i.e., TrustBench-format receipts. Works for bundles
  where every step is TrustBench-routed (which still requires `/route` mid-flow), not for
  bundles where steps are direct x402 calls to non-TrustBench services (current
  agentic.market bundle shape).
- For the latter, `/verify` would need scope expansion: validate on-chain settlement of
  arbitrary x402 PAYMENT-RESPONSE artifacts and emit a signed aggregate envelope. That's
  NEW design, not "1-2 days of focused work" against existing v0.1.0 plumbing.
- The "1-2 days" estimate in § Q1 lines 65-67 assumes the narrow TrustBench-receipt-only
  scope.

**Six-question filter pending:**

1. Which Pillar does this advance? Both potentially, with different emphasis.
2. If Pillar 1: adoption-by-demonstration — every bundle output carrying a
   `trustbench_verify_url`.
3. If Pillar 2: inventory + discovery — every bundle needing dynamic provider selection
   routes through `/route`.
4. If neither: N/A — clearly Pillar-advancing.
5. Which Option (A/B/C)? A-flavored (partner outreach for receipt-format adoption via
   bundle authors) for either framing.
6. Less-effort path: drafting a TrustBench-flavored bundle prompt with existing v0.1.0
   capability gets a working demo without requiring `/verify` design+ship. Cheapest path
   forward.

**Decision blocker:** explicit consideration by Johan, not implicit lock-in via
signal-file edit. Filter pass pending.

**Until decided:** treat both `/route` and `/verify` as plausible bundle-integration
paths. Do not characterize `/route` as "too complex for bundles" or `/verify` as "the
clean story" without filter pass. The signal file's pre-edit version conflated
architectural observation (`/route` adds two HTTP calls per step) with strategic
conclusion (`/verify` should be the integration pitch); architectural observation is
correct, strategic conclusion is pending.

---

## Review Trigger

**2026-06-17.** By then: did nick reply? Did we get any bundle-side inbound? Did the
`lastUpdated` field on the agentic.market listing shift from an independent agent wallet
(the 2026-08-11 validation check from `decisions.md` 2026-05-13)? If bundle interest
materializes, advance `/verify` into the v0.2.0 sprint. If no signal, close this file and
treat agentic.market as a discovery surface only.
