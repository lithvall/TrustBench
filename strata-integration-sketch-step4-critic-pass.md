# Critic-pass: Strata §10 reference integration spec

**Subject:** §10 of `strata-integration-sketch-SEND.md`, added 2026-05-13. Step-4-detail expansion committing TrustBench to a reference integration receipt by ~2026-05-19, anchored on (a) `/route` with CMC as the merchant, (b) `X-Trust-Signals` request header and trust_signals receipt field as Changes 1+2.

**Why this gets a Critic pass:** partner-facing public commitment with a 6-day timing dependency, two code changes on revenue-bearing surfaces (`/route` request parsing + receipt-generator field), and a public artifact (the receipt URL) that becomes part of Strata's Show HN potential. Failure modes have asymmetric downside — slipping the timeline or shipping a broken receipt looks worse to Strata than the upside of shipping fast.

---

## Three rejection reasons a hostile reviewer would give

**R1. "You're anchoring the reference on a merchant you don't have a relationship with (CMC) so the integration's public artifact rides on a third-party's continued x402 availability you can't influence."** If CMC pulls their x402 endpoint between today and Strata's Show HN — which is exactly what Infopunks just did to us — the receipt URL still exists (it's immutable) but the *demonstration* breaks because nobody can replay the agent flow. Strata's Show HN audience clicks "try it yourself," the agent fails on `merchant_unavailable`, and the reference looks broken. The fallback merchant clause in §10.5 partly addresses this but isn't a guarantee — same fragility, different brand name.

**R2. "Two code changes in ~36 hours on revenue-bearing surfaces, one of them touching the request-hash that drives idempotency replay, with no Critic pass on the actual paywallGate generalization."** Change 1 (`X-Trust-Signals` header) modifies what gets hashed for idempotency-key lookup. Change 2 (receipt-generator field) modifies what gets signed. Both are described as "small additive" in §10.4 but neither is. The idempotency contract specifically promises {key, body_hash} dedup — adding the trust-signals header into the hash either (a) makes replays with stale signals 409-conflict where they previously cached-200 (regression risk), or (b) excludes the signals from the hash and lets agents replay with stale signals embedded in fresh receipts (silent data corruption risk). The sketch doesn't pin which.

**R3. "You wrote a timeline in days when the partner explicitly said 'about a week' as a soft commitment, then locked it to 2026-05-19 in a paste-ready document. Now any slip becomes a visible miss instead of a soft re-quote."** Strata's 2026-05-12 reply said *"Week from tier lock on the integration sketch works."* That's their accommodation, not a deadline they're enforcing. By converting it to a day-by-day schedule in §10.7, the sketch removes the relationship-friendly ambiguity. If 2026-05-15 (smoke regression day) hits a real bug, the visible miss compounds with the existing /route smoke-503 today, and the cumulative signal Strata reads is "Johan keeps missing dates."

---

## Strongest counter-thesis

**Don't write §10 at all in this much detail.** Reply to Strata with a shorter "step 4 in flight, target ~2026-05-19, will share the receipt URL when ready" message and keep the detailed spec internal until the artifact exists. The 2026-05-08 distribution decision (secret Gist) implies Strata doesn't need detailed implementation plans — they need the artifact and the integration shape. The integration shape is locked in §1-§3 already. §10 publishes implementation detail Strata didn't ask for.

This counter-thesis has real force. The sketch's purpose is to socialize the integration shape so both sides can verify it's the right shape *before* either side builds. The shape is already socialized through §1-§3 + tier confirmation. Step 4's deliverable is the receipt artifact, not a document about how the artifact will be built.

---

## Named wedge competitor

x402route.vercel.app (real, 2026-05-12 discovery in `decisions.md`). They're a routing-lane primitive at $0.001/call, no signed receipts, no on-chain anchor. If they wanted to compose with Strata, their reference integration would be 50 lines of code that pipes Strata's `runtime_score` into their plain-JSON routing response. No `X-Trust-Signals` header design pass, no receipt-envelope extension, no JCS canonicalization for the new field. Their "reference" would land in 2 days instead of 6 — and Strata's Show HN audience might prefer the simpler demonstration even if the artifact is technically thinner.

The differentiation that makes us slower (signed receipts, on-chain anchor, JCS canonicalization, public verifier package) is exactly the trust-layer wedge from `competitive-landscape.md`. The reference integration must SHOWCASE that differentiation, not paper over it. The Critic-pass risk: §10 reads as "implementation work to support Strata" rather than "demonstration of TrustBench's specific moat." That framing is a missed opportunity — the trust_signals annotation is the differentiator x402route can't easily copy, and §10 should lead with that, not bury it in §10.6 artifacts.

---

## Hidden assumption that, if wrong, breaks the whole thesis

**That the reference agent's value to Strata is the demonstration of mechanics, not the demonstration of the trust artifact's durability.**

If Strata's actual mental model is "this reference proves the integration works *and the receipt remains queryable for our customers' audit/compliance needs months later*," then the merchant choice (CMC, no relationship) is the load-bearing weakness — not because CMC will disappear next week, but because the receipt's `audit_url` returns rich data only while the underlying providers and on-chain state remain queryable. The receipt is immutable; the verification path is not. If CMC's x402 endpoint disappears in 6 months, `--check-chain` still passes (the tx is on-chain forever) but `--check-merchant-still-alive` (a check we don't currently expose but a Strata customer would intuitively want) fails.

This bites Strata more than us. Their customers consume verification verdicts on TrustBench receipts; if the verdict says "valid, but the merchant the receipt was issued against no longer exists," the verdict semantics get awkward.

---

## Kill criterion: if X is observed in Y weeks, abandon

**If Strata's reply to §10 surfaces a fundamentally different reference shape** — e.g., they want the trust signals in the X-PAYMENT envelope rather than the request header, or they want a Strata-side endpoint signature carried in the receipt, or they want the receipt to anchor to *their* merchant URL not a third-party — and the change requires more than 1 day of rework, **abandon §10 as-written and re-spec from their reply.** Cost: ~4 hours of throwaway design. Recoverable.

If Strata is silent for >7 days after this sketch lands, **abandon the 2026-05-19 internal deadline.** Their silence means either (a) the spec is fine and they're working on something else, or (b) they're stuck on a reply because the spec is wrong in a way they're trying to phrase tactfully. Either way, treating the timeline as load-bearing during their silence creates pressure without any new information.

If Changes 1+2 (header + receipt field) cause a measurable regression on the existing `/route` paywall smoke (S1-S4) and the fix isn't trivial (>4 hours), **scope §10 down to a non-modifying demonstration** — the reference agent calls Strata, then calls TrustBench using only existing endpoints, and Strata's signals are referenced in a *side-channel artifact* (a separate signed assertion at a non-`/receipts/:id` URL) rather than embedded in the receipt envelope. This preserves the timeline at the cost of not landing the cleanest envelope shape.

---

## Verdict

**Acceptable-after-stress-test.** §10 is structurally sound but needs three corrections before sending:

**Correction 1 — Re-frame §10.7 timeline as a range, not a day-by-day schedule.** Replace the daily breakdown with "Target receipt URL by Tuesday 2026-05-19; the implementation is ~2 days of focused work plus buffer, so anything from 2026-05-17 to 2026-05-20 is realistic. I'll send the receipt URL the moment it's confirmed verifying clean against `--check-chain`." Preserves the commitment shape without making any single day a visible miss-risk.

**Correction 2 — Add §10.4.5 pinning the idempotency-key hash semantics.** Explicit decision: the `X-Trust-Signals` header IS included in the request hash (so replays with different signals get 409, same as different body), the captured trust_signals payload IS included in the signed receipt body so it's covered by the existing Ed25519 signature, and replays within the 24h idempotency window return the cached receipt with the *original* signals (not refreshed). This kills R2 by spelling out the contract.

**Correction 3 — Add a short note in §10.6 leading with the trust-layer moat, not burying it.** One paragraph at the top of §10.6 that says: "the artifact this reference produces is not 'a working API call' — it's a publicly-verifiable, immutable, on-chain-anchored proof that Strata's pre-call posture was observed at the moment of payment and signed by TrustBench. That artifact is the *specific* thing competing thin routers can't produce without the JCS canonicalization + Ed25519 + on-chain anchor stack we already have shipping. The Show HN angle is the *artifact's properties*, not the *integration's existence*." Kills the named-wedge concern by making the differentiation explicit rather than implicit.

R1 (merchant fragility) is real but unmitigable without a TrustBench-owned demo merchant, which §10 already implicitly rejects (would conflict with non-custodial framing + honest registry posture). Accept the risk; document the fallback merchant in §10.5 (already done) and move on.

**Final verdict after corrections: acceptable.** Apply the three corrections, then send.