# Infopunks Follow-up — Draft for when they reply

**Status:** DRAFT for Johan's review. Use this as the second-message follow-up after Infopunks replies to the initial DM Johan sent yesterday. The shape is different from the Strata sketch because Infopunks's *"lets collab"* is open-ended — we don't yet know what they actually want, so this message probes rather than proposes.

**Date:** 2026-05-08.

**Context:** Johan sent initial async reply to Infopunks's *"lets collab / google meet today"* DM yesterday (2026-05-07). Awaiting their reply. When it lands, this is the follow-up.

**Adapt to their reply.** Read what they actually wrote first; this draft assumes their reply is positive-but-still-open-ended (e.g. *"async works, what's the shape you have in mind?"* or *"happy to do async, what do you want to know?"*). If they reply with something specific (*"we want to integrate X"* or *"we'd like to do a joint blog post"*), this draft needs adjusting. Flag that case for me before send.

---

## The message (~700 words, send as a long DM or short doc)

> Thanks — async-first works for me too, and the *"figure out what working together could look like"* framing is the right place to start.
>
> Quick where-things-are summary so we're calibrated:
>
> **TrustBench today.** Public registry of x402-style endpoints across Base (~650 services from Agentic Market) and Solana (~150 from Heurist; routing comes after the v0 paywalled API), nightly liveness telemetry, Ed25519-signed scorecards. Live non-custodial router (`POST /route` + `POST /route/settle`) with idempotency keys, hard spend caps, and signed receipts at `/receipts/:id`. The first paid receipt against your cognition layer (`rcpt_01KQY7C44GAPSXZPFQYRZ1D10C`) settled on Base 2026-05-06 — that's the public anchor for the architecture working end-to-end against a real merchant under real CDP-mediated async settlement.
>
> **What changed since the spec lock.** The x402 Foundation shipped the `offer-and-receipt` extension (v0.6, Alfred Tom, Feb 2026) which covers merchant-side signed offers + signed receipts. That changes my framing — TrustBench's lane isn't *"the receipt format for agent commerce"* anymore (the Foundation has that), it's *"the routing-and-evidence layer that composes with the merchant's offer-and-receipt artifacts to give agents a complete pre-call + post-call proof chain."* Same code, different positioning, more honest fit. I think it's actually a cleaner story than where we were when we exchanged spec drafts — your cognition layer emits its own merchant-side proofs, TrustBench layers the routing-decision attestation on top, and the two together form the audit trail no single party signs.
>
> **What I'm wondering before pitching anything specific.** Three questions:
>
> 1. **What does *"work together"* look like in your head?** I can imagine several shapes — an integration partnership where Infopunks's cognition endpoints emit TrustBench-compatible receipts for paid calls; a joint reference architecture (cognition + routing + identity) we publish together; a co-marketing moment around the receipt primitive; something more strategic like joint design partner conversations with regulated buyers. They're all interesting to me but they're different commitments and different timelines, so it'd help to know which (or which combination) you had in mind.
>
> 2. **What's the most useful thing TrustBench could do for Infopunks specifically right now?** Concrete examples — *"add a verify-receipt button on our agent dashboard,"* *"surface our endpoint scores in your /rankings,"* *"co-publish a piece on receipt primitives,"* *"introduce me to your design partners who care about audit,"* whatever. The question I'm asking is what would actually move the needle on your end if it landed in the next 30 days.
>
> 3. **Timeline?** I'd rather know up front whether you're working toward something specific (a launch, a partner conversation, a fundraise) where TrustBench could plausibly help, vs *"let's just keep the conversation warm."* Both are fine; just want to calibrate.
>
> **One thing on the commercial layer if it comes up.** TrustBench's revenue shape is x402-native paywalled API endpoints — per-call USDC settlement, no subscriptions, no contracts. Specific tiers are still in active validation with the first integration partners and not yet locked. If a TrustBench × Infopunks integration ever has a commercial layer (which it doesn't have to, but might), that's the model. Mostly flagging in case it's relevant to whatever shape *"collab"* ends up taking on your side.
>
> Whenever you're ready to write back, async is fine. If at some point we need a call to align on something specific, happy to do that — I just want it to be a calibrated call, not a discovery call.
>
> — Johan

---

## Internal notes (not for send — for Johan only)

**Three things this message does deliberately:**

1. **Doesn't propose a specific integration.** Infopunks's DM was open-ended; the right response is to probe, not pitch. A premature integration proposal here would either (a) be wrong-shape and waste their time, or (b) commit you to something before you know what they actually want.
2. **Acknowledges the offer-and-receipt extension landing as positioning context.** It changed how TrustBench frames itself. Naming that openly with Infopunks (who endorsed the original receipt thesis) is the honest move and shows you're paying attention to ecosystem changes — it's also relationship-building because it implicitly thanks them for the original spec endorsement while updating them on where things are now.
3. **Three questions are sequenced from broadest to most concrete.** Q1 is "what shape?" (lets them frame). Q2 is "what's the actual ask?" (forces specificity). Q3 is "timeline?" (filters whether this is a near-term collab or a relationship-warming exchange). All three answers together tell us what kind of partnership we're actually negotiating.

**Things this message deliberately doesn't do:**

- ❌ Doesn't mention Strata. Two reasons: (a) you haven't asked Strata's permission to be named publicly, (b) introducing a third party into a 1:1 relationship-building moment with Infopunks is premature.
- ❌ Doesn't pitch routing-attestation or any other product feature. Infopunks already knows what TrustBench is.
- ❌ Doesn't mention Foundation-track standards work, AWS Bedrock, the AP2 compatibility analysis, or any other recent strategic context. Save that for if/when the conversation gets specific enough that those are relevant.
- ❌ Doesn't include specific dollar tiers. Different from the Strata sketch — Infopunks didn't ask for them.
- ❌ Doesn't promise anything. Probes their side, sketches what's possible, leaves the actual commitment for after their answers.

**If Infopunks's reply is a different shape than expected:**

- *"Let's just chat asynchronously about x402"* (no real ask) → This message still works; just send the three questions plus the offer-and-receipt context and let them answer at their own pace.
- *"We'd like to integrate TrustBench into the cognition layer specifically"* (specific technical proposal) → Replace the three questions with a smaller version of the Strata sketch — *"here's what an integration could look like, here are the questions I have about your side, here's the commercial layer."* Use the Strata sketch as a structural template.
- *"We want to do a joint launch / blog post / podcast"* (marketing-shaped) → This message is wrong shape. Reply more directly: *"happy to — what's the angle you have in mind, when, and what do you need from me?"* Skip the three questions.
- *"We're going through a fundraise / hiring / pivot and want TrustBench's perspective"* (informational, not commercial) → Reply less commercially: *"happy to share what we're seeing on our end. Drop me a few specific questions and I'll write up answers async."* Skip the commercial-layer paragraph.
- *"Actually let's just hop on a call, async is too slow"* (push for live) → Push back gently: *"give me a few days for async first — I'll send you a written summary by [date], and if a call still makes sense after that I'm in. The async draft will save us both time on the call."*

**Format for sending:**

Same as Strata: this is too long for a DM. Either save as a Gist + send DM with link, or paste as a long DM if Infopunks prefers. The relationship is friendlier with Infopunks than with Strata (you've been corresponding longer), so a long DM is probably fine and might even read more personal.
