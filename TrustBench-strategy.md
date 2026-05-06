# TrustBench: Diagnosis, Repair, and Strategic Direction

## Context

TrustBench is a solo-founder project that set out to benchmark x402 (payment-required) AI providers. The original system probed roughly 14 real provider URLs from what it called "three regions" on a nightly schedule, computed a score from latency and reliability, and exposed the results via a routing API and an analytics page. After several iterations of the prober and scorer, almost every provider showed the minimum score (40) and the maximum latency value (9999) regardless of actual behavior. This document captures the full arc: the diagnosis of why scores collapsed, the fix that produced realistic numbers, an honest reassessment of what TrustBench actually measures, and a proposed strategic pivot that turns the existing work into infrastructure under a product with a real revenue model.

---

## Part 1 — Why scores were stuck at 40

The scoring formula in the broken prober was:

```
score = 60 + (successRate - 0.7) * 35 - min(30, avgLatency / 15)
```

After the `Math.max(40, ...)` clamp, the realistic output range was 40 to about 70. Three compounding flaws produced the symptoms.

**The formula could not produce high scores.** The theoretical maximum at perfect reliability and zero latency was 70.5. The `Math.min(98, ...)` cap was decorative — the formula could never reach it. So even a perfect provider could not earn anything close to 95.

**The latency penalty saturated at 450 ms.** `min(30, avgLatency / 15)` reached 30 once `avgLatency` hit 450. From that point on, 450 ms and 9999 ms produced identical penalties. There was no signal differentiating "slow but functional" from "completely dead."

**Timeouts poisoned the latency average.** A timed-out probe was recorded as `latency_ms = 9999`. This value was then included in a plain arithmetic mean that was misleadingly stored as `latency_p50` (it wasn't a percentile at all). A single timed-out region in the three-region loop dragged the mean to 3500 ms or higher, pegging the latency penalty at the maximum and pushing the final score below 40.5, where the clamp floored it at 40.

The visible `latency_p50 = 9999` in the analytics page came from a fallback in the scorer:

```typescript
latency_p50: s.latency_p50 ?? 9999
```

This kicked in whenever no scorecard row matched the queried capability — which happened both for genuinely failed probes and for capability-mismatched rows after the crawler shuffled URL-to-capability assignments via `onConflict: 'url'` upserts.

---

## Part 2 — The fix

The revised `prober.ts` replaced the formula and corrected three measurement bugs.

The new formula:

```
score = 15
      + 45 * successRate
      + 35 * latencyHealth
      + 3  * consistencyBonus

where latencyHealth   = max(0, min(1, 1 - p50 / 2000))
      consistencyBonus = max(0, min(1, 1 - jitterRatio))

clamped to [40, 98]
```

Sample outputs across realistic conditions:

| Reliability | p50 latency | Score |
|-------------|------------|-------|
| 100%        | 150 ms     | ~95   |
| 100%        | 500 ms     | ~88   |
| 100%        | 1500 ms    | ~72   |
| 67%         | 300 ms     | ~78   |
| 33%         | 500 ms     | ~55   |
| 0%          | —          | 40    |

Three measurement corrections accompanied the formula change.

Latency percentiles now compute over successful probes only. Timeouts hit success rate (correctly) but no longer poison the latency number. A provider with two fast responses and one timeout shows real latency numbers and 67% uptime, instead of the prior behavior of showing 3500 ms fake latency and 67% uptime.

The probe method changed from GET to HEAD with a fallback to GET on 405. HEAD is faster, less likely to trip rate limits, and supported by most providers. Status code 429 was added to the alive-statuses list — being rate-limited still proves the endpoint is up.

The `last_updated` field is now set explicitly on every upsert. The schema's `default now()` only fires on INSERT, so without an explicit value the timestamp went stale on every update after the first run.

---

## Part 3 — Verification

After the new prober shipped (with the build/redeploy delay being the reason scores initially still showed 69-and-below, identical to the old formula's outputs to the rounded integer), the analytics page confirmed the new formula was live. Top providers landed at scores of 95–97, with realistic latency numbers — Brave Search at 43 ms p50, Anthropic at 37 ms, Perplexity at 176 ms. The telltale 1.2× relationship between `p95` and `p50` (a fingerprint of the old `latency_p95 = avgLatency * 1.2` line) disappeared.

One small bug remained in the percentile helper. With only three samples per run, `Math.floor((3 - 1) * 0.95) = 1`, identical to the p50 index, which collapsed `p95 == p50` for every provider. The clean fix is a linear-interpolation percentile:

```typescript
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const rank = (sorted.length - 1) * p;
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  return lo === hi
    ? sorted[lo]
    : sorted[lo] + (sorted[hi] - sorted[lo]) * (rank - lo);
}
```

This behaves sensibly for any sample size, including three.

---

## Part 4 — Honest assessment of TrustBench's value

With scoring fixed and producing realistic numbers, the question shifted from "is the formula working" to "does the underlying measurement carry useful information." The honest answer is: not really, and tightening the curve doesn't help. Rescaling noise produces narrower noise, not signal.

**What TrustBench actually measures.** Whether DNS resolves and the load balancer in front of an API replies to an unauthenticated HEAD request within 8 seconds, sampled three times sequentially from one cloud machine. Treating 401, 402, 403, 404, 405, and 429 as "success" means the prober is verifying that the auth wall responds — not that the API itself works, returns useful results, or honors the x402 payment flow. This is essentially a liveness check.

**Why scores cluster at 95–97.** The provider population (well-funded AI APIs) has essentially binary liveness: their front doors are always up. The formula isn't generous; the signal is too coarse to differentiate among providers that all pass a "is the URL reachable" test.

**The "x402 benchmark" framing doesn't match the data.** Most seed providers (api.openai.com, api.anthropic.com, api.groq.com) are not x402 endpoints — they're standard API-key-gated paid APIs. A real x402 benchmark would have to execute payments, measure settlement latency, observe retry behavior under failed payments, and characterize the case where payment succeeds but the resource is slow or empty.

**The "signed scorecards as moat" framing is similarly weak.** TrustBench signs with HMAC-SHA256 over a single shared secret. That means only the TrustBench server can verify, because anyone holding the secret can forge. It's authentication of provenance, not a public reputation layer. A real reputation layer would use asymmetric signatures (Ed25519 with a published public key), ideally with attestations anchored to an external system.

**The "citation moat" depends on methodology defensibility.** The hope that LLMs will cite TrustBench as a neutral source for "best x402 provider" only works if the methodology page survives skeptical reading. Any reasonably technical reader of "we HEAD the URL and treat 404/405/429 as success" will conclude this is a liveness checker, not a benchmark. Models cite sources whose methodology stands up.

**Honest summary.** TrustBench in its current form is a registry with telemetry, not a benchmark or routing oracle. That's a real product but a much smaller one than the original framing claimed.

---

## Validation update — 2026-04-30 (pre-router builder conversations)

Phase 2 of the plan below (validate before building) was executed on 2026-04-29 and 2026-04-30 across r/AI_Agents and X. Three concrete findings update the strategy that follows; the original Part 5 / Part 6 text has been edited to reflect them, and this section preserves the source of those edits.

**Source artifacts** (kept in repo root):

- `# Phase 2 — Builder Conversations.md` — verbatim quotes from four conversations (three Reddit replies + one full @InfopunksHQ X thread).
- `# Competition Analysis — Recent Rev.md` — three adjacent projects mapped (Infopunks Trust Layer, SpendGate.ai, AgentlyHQ).

**Finding 1 — the 1–3% routing spread is dead.** Two of four conversations rejected it directly. SpendGate's founder Euan Chisholm: *"1-3% spread is a big no no for a lot of people."* First Reddit commenter: *"I will not pay a spread to a payment processor. It's either a subscription service or a per-transaction fee for me."* Replacement: a flat per-tx fee (e.g. $0.001–$0.01 per routed call) plus the policy subscription — same stackable structure, different unit.

**Finding 2 — builders surfaced the feature priorities unprompted.** Across the conversations, the same four primitives kept coming up: idempotency on retry paths ("one missing request fingerprint and your agent buys the tool three times"), hard spend caps, signed receipts, and a queryable audit trail. None of these were on the leading questions; they were what builders volunteered as the painful pieces. They should lead Phase 3 rather than sit in Phase 4 as "policy firewall."

**Finding 3 — concrete receipt spec from a likely first design partner.** @InfopunksHQ defined the proof trail explicitly: *"signed receipt + call metadata + settlement reference + replayable audit path"*, with *"raw signed receipt + tx hash = base proof, queryable audit path = agent-native proof."* Their Infopunks Trust Layer is the intelligence/scoring brain; TrustBench's router is the payment + receipt plumbing. The two compose; they don't compete. Receipt schema for Phase 3 should be designed against this spec, with InfopunksHQ kept in the loop before lock-in.

**Competitive landscape (none is a 1:1 competitor).** Infopunks (paid x402 trust primitive — intelligence brain, complementary). SpendGate.ai (proxy/governance layer with per-agent policies; built in-house exactly what we're proposing as a hosted service — differentiation is that we never sit in the request path). AgentlyHQ / use-agently / aixyz (opinionated framework + marketplace; differentiation is that we are framework-free and MCP-native). The open lane is **lightweight, non-custodial, MCP-native payment plumbing that plugs into trust layers, governance proxies, and frameworks** rather than competing with them.

---

## Part 5 — Strategic direction: payment plumbing for agent commerce

The right pivot is to move from measuring providers to becoming **the payment plumbing layer for agent commerce**.

### Where the actual pain lives

An agent builder wiring up x402 has to: discover endpoints, manage a USDC-on-Base wallet, handle the 402-pay-retry dance, set spend limits to prevent runaway loops, retry on transient failures, swap providers on outage, log every payment for accounting, and reconcile receipts. None of this is interesting work. All of it is required for production. Add p402 (Canton's agent network) and the work doubles.

The benchmark question is downstream of routing. Routing is downstream of payment plumbing. Build from the bottom up.

### The product

A hosted endpoint agents call instead of calling x402/p402 providers directly. The agent sends a capability request plus a payment authorization. TrustBench routes to the best provider that matches policy, executes payment non-custodially on the agent's behalf, returns the result, and emits a signed receipt.

Conceptually: OpenRouter for x402, but protocol-agnostic across x402 and p402.

Three layers, in build order:

**The smart router.** A single endpoint per capability. Inputs: live health probes (existing work), real test queries against providers (a $10–20/month upgrade from actual API calls), and a routing decision combining reliability, latency, and cost. The scorecards become routing inputs rather than the public product.

**The policy firewall.** Spend limits, allowlists/denylists, per-call price caps, kill switches, optional human-in-the-loop confirmation for unusual spend. This is what stops production agents from going feral and burning through funds. Nobody offers this for x402 today — every team rolls its own.

**The receipt and accounting layer.** Every routed call produces a signed receipt: request, fulfillment, payment, timestamp, proof. CSV/ledger exports. Mundane but mandatory for any agent moving real money — compliance, tax, internal billing, audit.

### Revenue model

Three stackable streams, none of which compromise neutrality. Updated 2026-04-30 after Phase 2 validation rejected the percentage-spread model.

**Flat per-tx fee (replaces routing spread).** Charge a fixed fee per routed call — e.g. $0.001–$0.01 — independent of the underlying provider price. Pure usage-based, scales with agent activity, agents pay in the same x402 flow they already use. The 1–3% percentage-spread model was explicitly rejected by builders in Phase 2; the flat fee preserves the "stable micropayment revenue from agents" intent without the pricing pushback.

**Policy subscription.** $20–100/month per agent builder for the higher-touch policy controls (kill switches, allow/deny lists, optional human-in-the-loop, signed webhook alerts). Note that the *base* policy primitives — idempotency and hard spend caps — are part of the free Phase 3 router, because Phase 2 validation showed those are non-negotiable for production agents and gating them behind a paywall would block adoption. Predictable MRR comes from serious or enterprise builders who want the higher-touch controls on top.

**Provider verification fee.** Providers pay a modest refundable bond to be listed in the routable registry. Funds the real-probe quality testing and creates skin-in-the-game so providers can't rugpull without losing the bond. Critically: pay-to-list, not pay-to-rank. Routing decisions remain measurement-based, which preserves neutrality.

### Why p402/Canton is the moat

x402 is the easy ecosystem to build for. Everyone will. Canton's p402 is harder: privacy-preserving, enterprise-flavored toolchain, regulated agent population (banks, asset managers, B2B systems) with KYB, compliance, and settlement-finality requirements that x402 doesn't address.

A router that natively spans both x402 and p402 becomes indispensable to anyone needing consumer-agent reach (x402) plus enterprise-agent reach (p402). That's a defensible position no x402-only competitor can copy without 6–12 months of head start on Canton integration.

### What gets reused from existing TrustBench

The scorecards become a routing input rather than the headline product. The dashboard becomes a debug view rather than the front door. The crawler keeps doing what it does. The probes keep feeding live data. The signing infrastructure becomes useful because it's signing receipts for real money movements, where tamper-evidence is not theater.

### Risks worth naming

**Custody is the regulatory landmine.** The moment you take agents' funds and pay providers on their behalf, you're operating money transmission in US regulators' eyes. The only solo-founder-feasible path is non-custodial: the agent pre-authorizes the payment, TrustBench constructs the transaction the agent signs, you never hold funds. This is doable on Base and is the right design.

**Liability for bad routes is real.** If you route to a provider that takes money and doesn't deliver, agents will blame you. The verification bond mitigates this; standardized refund flows handle the rest. Build the dispute primitive in from day one, even if manually operated at first.

**Competition timing.** OpenRouter will eventually ship x402 support. Coinbase CDP could ship a router itself. The window is roughly 6–18 months. The defensible part isn't the routing — it's the policy/firewall layer plus p402 coverage plus the receipt/accounting layer. All ugly, boring, mandatory work that incumbents won't prioritize.

---

## Part 6 — Phased execution plan

This is best framed as **evolution, not pivot**. The existing work — crawler, probes, scorecards, signing, routing endpoints, analytics — gets repurposed. The public framing shifts. The router gets built incrementally. Revenue arrives the moment the first agent makes a paid call through TrustBench. Each phase is independently shippable; if a phase doesn't validate, the previous phase still stands as a usable product.

### Phase 0 — Reframe the public positioning (this week, ~1 hour)

Change the site copy from "x402 benchmark" / "rankings" / "scores" to "registry + live telemetry, router coming." Add a methodology page that's honest about what the probes measure (HEAD-request liveness from one host, sampled three times, with status codes 401/402/403/404/405/429 treated as "alive"). The registry framing is accurate and survives technical scrutiny; the benchmark framing does not.

This costs an hour and prevents the much larger cost of having "TrustBench's methodology" become the thing skeptical builders pull apart publicly later. Doing it now, while there are no public users, is essentially free. Doing it after launch is a credibility hit.

The registry stays as the public face. The benchmark framing is the part that goes.

### Phase 1 — Stabilize the foundation (this week)

Apply the percentile helper fix so `p95` differentiates from `p50`. Confirm scorecards sign and validate via the public API. Confirm `/rankings` and `/route` return current data. Convert the HMAC signing scheme to Ed25519 with a published public key — current HMAC is fine for internal integrity but cannot serve as a public reputation primitive (anyone with `SIGNING_SECRET` can forge), and the cost of switching now is small relative to the cost of switching after third parties have started verifying signatures.

Goal: a stable, honest registry with verifiable telemetry that builders can use today.

### Phase 2 — Validate before building — DONE (2026-04-30)

Executed across r/AI_Agents (three replies) and X (full thread with @InfopunksHQ) on 2026-04-29 to 2026-04-30. Goal achieved: three real conversations, ≥1 written expression of interest, enough specifics to lead Phase 3 with the right primitives.

Three findings from Phase 2 reshape the rest of this plan (full detail in the "Validation update" section above):

1. **Pricing pivot.** The 1–3% routing spread was rejected. Replacement: flat per-tx fee + policy subscription.
2. **Phase 3 primitives.** Builders surfaced — unprompted — idempotency, hard spend caps, signed receipts, and queryable audit. These move from Phase 4 ("policy firewall") into Phase 3 as the four primitives that *lead* the router.
3. **First design partner + receipt spec.** @InfopunksHQ defined a concrete proof-trail spec ("signed receipt + call metadata + settlement reference + replayable audit path") and is open to integration. Their trust layer is complementary, not competitive.

### Phase 3 — Minimal non-custodial router for one capability (2–3 weeks)

Build the smallest end-to-end routing path that produces a paid call. The Phase 2 conversations sharpened the scope: four primitives must land *as part of Phase 3*, not be deferred to a later "policy firewall" phase, because builders called them out unprompted as the difference between "demo" and "usable in production."

**The four Phase 3 primitives:**

1. **Idempotency keys on `/route`.** Every request carries a client-supplied idempotency key. Server stores the (key → result) mapping so partial-timeout retries return the same result and never double-charge. This was the most concrete pain point a builder named: *"the ugly bug is duplicate pay-retry paths under partial timeouts; one missing request fingerprint and your agent buys the tool three times."*
2. **Hard spend caps enforced server-side.** Per-call max price (already in the endpoint signature) plus a per-agent rolling cap (e.g. $X over Y minutes). Reject before constructing the tx, not after.
3. **Ed25519-signed receipts** containing call metadata (capability, provider chosen, request hash, response hash, timestamp) and settlement reference (tx hash + chain). Anchored on the @InfopunksHQ spec.
4. **`/receipts/:id` queryable audit endpoint.** Agent-native proof — the queryable counterpart to the raw signed receipt, so agents can replay the trail without reconstructing it from logs.

**Endpoint shape.** `/route?capability=search&max_price=0.01`. Agent sends a capability request plus a payment authorization plus an idempotency key. TrustBench constructs the x402 transaction, the agent signs, TrustBench executes routing using live scores plus real paid probing ($10–20/month for actual API calls against the chosen capability), returns the result, emits the signed receipt. Non-custodial throughout — TrustBench never holds funds.

**Stack.** Hono + Supabase + the existing Ed25519 signing library. One capability (search first, since it's the simplest to verify quality on), two or three real providers, end-to-end. Still a single-person codebase; nothing exotic.

**Pricing.** Flat per-tx fee, not a percentage spread. Phase 2 validated this directly.

**Design-partner loop.** Share the receipt schema with @InfopunksHQ before locking it in — they spec'd the proof trail and their trust layer is the natural upstream consumer.

**Goal.** A demo any agent builder can call, with idempotency + hard spend caps + signed receipts + queryable audit working end-to-end. Revenue lands at the moment the first paid call goes through.

### Phase 4 — Layer on revenue features (after first paid calls)

Once one routing path works and one builder is using it, layer on the rest of the revenue model. The base policy primitives (idempotency, hard spend caps) shipped in Phase 3, so Phase 4 is the higher-touch tier on top of them: policy firewall as a $20–100/month subscription with kill switches, allow/deny lists, human-in-the-loop confirmation rules, and signed webhook alerts. Provider verification bond (refundable) as a one-time fee for inclusion in the routable pool. Receipt export and accounting layer (CSV/ledger) for builders who need bulk export — the signed audit trail itself is already in Phase 3.

These all sit on top of the routing primitive. None of them need to be built before the primitive works.

### Phase 5 — p402/Canton expansion (after the x402 path is stable)

This is the moat-building phase, and it's the part competitors will most struggle to copy. Don't start it until the x402 router has at least one paying agent and the payment plumbing is debugged. p402's privacy and settlement model is enough additional surface area that taking it on prematurely will eat the bandwidth needed to keep the x402 path healthy.

Once started: native p402 support, identity/KYB attestations relevant to enterprise agents, settlement-finality semantics that map cleanly between protocols. The agent calling TrustBench shouldn't have to know whether the underlying payment crossed Base or Canton.

---

## Summary

The technical work done so far is reusable. The framing around it ("benchmark," "routing oracle," "reputation moat") overpromised relative to what the data supported. The scoring fix was necessary to stop the obvious bug (every provider clamped to 40); it didn't change the underlying issue that HEAD-probe liveness isn't a benchmark.

Evolving TrustBench into the payment plumbing layer for x402 and p402 turns the existing assets into infrastructure under a product with a clear pain point (every agent builder needs this), a validated revenue model (flat per-tx fee + policy subscription + verification bonds — the percentage-spread model was killed in Phase 2), and a moat that compounds (Canton/p402 coverage). The technical work continues; the framing, the pricing, and the order of building shift.

Phase 0–2 are complete. The next move: ship the minimal non-custodial router (Phase 3), with the four Phase-2-validated primitives leading the build — **idempotency, hard spend caps, Ed25519-signed receipts, queryable audit** — for one capability and 2–3 providers, end-to-end and non-custodial. Revenue lands at the first paid call. Everything beyond Phase 3 (higher-touch policy firewall, verification bonds, p402/Canton) flows from whether real builders find that primitive useful enough to keep using.
