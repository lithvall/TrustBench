# Pay.sh amplification — draft post copy

**Date:** 2026-05-06
**Context:** Solana Foundation + Google Cloud announced Pay.sh on 2026-05-05. TrustBench shipped its first public Railway-issued paid receipt (rcpt_01KQY7C44GAPSXZPFQYRZ1D10C) against Infopunks Cognition Layer on the same day. Two complementary stories landed in 24 hours and are worth amplifying together.

**Hand-off:** This file is meant to be passed to Grok (X-post drafting) or used directly by Johan. Per the 2026-05-04 workflow rule change, X posts are Grok's domain, not Claude's. These are draft seeds, not finished posts.

**Style guardrails (from memory):**
- No em-dashes in outreach copy (read as AI tell). Use commas, periods, parens, colons.
- Honest measurement framing only. No "benchmark" / "ranking authority" / "reputation oracle" until the underlying measurement justifies it.
- Don't overclaim cross-network routing today. Routing is Base-only; the registry covers both.
- Lead with what shipped, not what we hope ships.

**Sequencing note:**
- Posts 1 and 2 below are safe to ship now (informational + partnership amplification).
- Post 3 (the harder position-claim) should wait until Option A from `phase4-p4-3-timing.md` ships (~48 hours), so the "cross-network registry" claim is literally true on /rankings, not just in the README.
- Do not send any of these until `post-to-x.js` is unpaused (separate session per `project_post_to_x_resumption_pending.md` memory). For now, post manually from @TrustBench while the script is paused.

---

## Draft 1: quiet amplification (safe to ship today)

Tone: informational, no boast. Positions TrustBench as already-aware-of-and-covering both networks.

> Pay.sh launched yesterday. Solana Foundation + Google Cloud, x402 + MPP, settled in stablecoins on Solana.
>
> TrustBench's registry already covers ~150 Solana x402 endpoints (via Heurist Mesh) alongside ~650 Base endpoints (via Agentic Market). Routing is Base-only today, Solana settlement is the next sprint.
>
> The pay-skills GitHub catalog is the canonical Solana directory. We will add it as a 4th crawler source when Solana settlement ships.

**Why this works:** ships current truth. Doesn't promise what we have not built. Names Pay.sh, Heurist, Agentic Market, pay-skills concretely. The "next sprint" line is honest pacing without a deadline.

---

## Draft 2: receipt-first partnership amplification (safe to ship today)

Tone: concrete proof first, then context.

> First public TrustBench receipt, on Base, against @InfopunksHQ Cognition Layer:
>
> rcpt_01KQY7C44GAPSXZPFQYRZ1D10C
> Tx: 0x3e6d6078... (Base block 45633871)
> Verifies clean: signature valid + on-chain settlement verified.
>
> Same week, Pay.sh launched on Solana. Registry already covers both. Routing follows.

**Why this works:** leads with a concrete artifact (the receipt id, the tx hash, the verification status). Names @InfopunksHQ for the partnership story. Closes with the Pay.sh acknowledgment without making it the headline. Honest about routing being Base-only.

**Note for Grok:** if posting against the @InfopunksHQ thread, frame as a reply to their cognition launch announcement. The line they used was "imo the receipt is the primitive... once cognition has receipts agents can start routing by evidence instead of vibes."

---

## Draft 3: position-claim (hold until Option A ships)

Tone: more pointed. Land this only after the Solana network filter is dropped on `/rankings` (per `phase4-p4-3-timing.md`).

> Three things shipped this week in agent payments:
>
> 1. Pay.sh: x402 + MPP on Solana, gateway model, Solana wallet as identity.
> 2. Coinbase Agentic Market: 1P/3P attestations, ~650 services on Base.
> 3. TrustBench: cross-network registry covering both, with policy + audit on top. First public paid receipt verified on-chain today.
>
> Pay.sh is the gateway. Agentic Wallet is the wallet. TrustBench is the layer above: hard spend caps, idempotency keys, signed receipts, queryable audit. Non-custodial throughout.
>
> Routing covers Base today, Solana settlement next.

**Why this works:** explicitly maps the three layers (gateway, wallet, policy/audit) so there is no overlap-confusion. Calls out the differentiator (policy + audit) without trashing either Pay.sh or Agentic Market. Honest about routing scope.

**Why hold:** "cross-network registry" is honest at the database level today, but only honest at the public surface once `/rankings` returns Solana rows. Option A in `phase4-p4-3-timing.md` is what flips that, ~48 hours of work. Until then, draft 3 is overstated for the public-facing claim.

---

## Reply / quote-tweet candidates (low-effort, ship when @SolanaFndn or @InfopunksHQ posts again)

If quoting @SolanaFndn's Pay.sh thread:

> Building the registry layer that covers both this and the Coinbase Agentic Market side, with hard spend caps and signed audit receipts on top. Solana settlement is next on our roadmap; pay-skills will be a 4th crawler source.

If @InfopunksHQ posts a follow-up to their cognition launch:

> The first receipt-on-chain through your endpoint verifies clean: rcpt_01KQY7C44GAPSXZPFQYRZ1D10C, tx 0x3e6d6078... on Base. The audit trail you said was the primitive is now a real, queryable URL.

---

## Outreach DMs (not for the public timeline)

### To ATXP (article cited as both "Data & intelligence" and a launch-partner facilitator)

Subject: TrustBench + ATXP, layer fit

> Saw ATXP listed in Pay.sh's launch partner list yesterday. Skimmed the dual positioning (Data & intelligence + facilitator) and it looks like a similar shape to @InfopunksHQ: an intelligence layer that also operates a payments path.
>
> TrustBench is the cross-network audit + policy layer that sits above the gateway. We just shipped our first public on-chain-verified paid receipt (rcpt_01KQY7C44GAPSXZPFQYRZ1D10C against Infopunks on Base). Solana settlement is next.
>
> Worth a 20-minute call on layer fit? We slot above your facilitator side and would happily reference each other on llms.txt and well-known manifests. No exclusivity, no money changes hands.
>
> https://trustbench.io/skill.md is the agent-side primer if you want context first.

### To Solana Foundation Pay.sh team (delay until pay-skills crawler ships in P4-3 sprint)

Hold this one. Not partnership-grade until TrustBench can demonstrate it actually crawls pay-skills. Easier ask once the inventory mapping exists; right now it would just be "we noticed your launch."

---

## What NOT to post (honest framing guard)

- "TrustBench routes on Solana." False. We register Solana, we route Base.
- "TrustBench is the only cross-network registry." Probably true today, but the right framing is what we cover, not what others don't. Easier to defend.
- "We compete with Pay.sh." We don't. They are the gateway / wallet flow on Solana, the same layer Coinbase plays on Base. We sit above both.
- Any post that mentions a percentage routing fee. Phase 2 validation explicitly rejected that pricing model. We are flat-per-tx + subscription, period.
