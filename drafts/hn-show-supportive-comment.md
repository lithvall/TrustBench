---
purpose: Supportive comment to post on Strata's Show HN thread within the first hour of it going up
target: Strata Show HN window — Tuesday or Wednesday 2026-05-26 / 2026-05-27 PT morning
author: drafted 2026-05-25 by Claude, pending Johan review
context: The Strata DM (2026-05-19) committed Johan to "Supportive comment when it goes up: yes, ready." Two versions: short for fast post, long for substantive engagement.
voice: working-mode honest, no hype, build-in-public, acknowledges the npm bin issue preemptively to disarm "broken README" complaints
---

## Pick ONE based on Johan's read of the thread when it goes up

---

### Version A — short (recommended for first-hour post, ~480 chars)

> TrustBench author here. Built the signed-receipt layer producing the proof pair.
>
> Worth surfacing one thing: both receipts (pre-PR-24 and post-PR-24) are Ed25519-signed under the same key, public at `trustbench.io/.well-known/trustbench-pubkey`. So "score went from 10 to 65" isn't a screenshot. It's two JCS-canonicalized envelopes you can verify locally in two seconds. The math trusts the key, not Strata or me.
>
> Heads up on the verifier: bin is `trustbench-verify-receipt`. Working command:
>
> `npx --yes --package=@trustbench/verify-receipt@0.1.2 trustbench-verify-receipt rrcpt_01KRN8HYPPRD1MS9JE7045S77Q --check-chain`
>
> (Add `npm install viem` first if you want --check-chain. Fixing both rough edges in 0.1.3.) Happy to answer envelope-shape, signing, or on-chain anchor questions.

---

### Version B — fuller (use when there's already meaty thread discussion, ~860 chars)

> TrustBench author here. Built the signed-receipt layer producing the before/after pair this references.
>
> The framing matters: it's not "Strata says the score moved." Both receipts are Ed25519-signed under the same key (public at `trustbench.io/.well-known/trustbench-pubkey`), so any third party can JCS-canonicalize the receipt body and verify the signature locally without trusting either of us. The on-chain `--check-chain` mode also matches the receipt's payment fields against the actual USDC `transferWithAuthorization` calldata on Base. Two layers of attestation, both independently checkable.
>
> Verifier on npm as `@trustbench/verify-receipt`. Heads up: bin is published as `trustbench-verify-receipt`, not `verify-receipt`, so the working invocation is:
>
> `npx --yes --package=@trustbench/verify-receipt@0.1.2 trustbench-verify-receipt rrcpt_01KRN8HYPPRD1MS9JE7045S77Q --check-chain`
>
> Drop the flag for offline signature-only mode, or `npm install viem` first for the on-chain step. v0.1.3 (bin alias + viem bundled) ships post-launch.
>
> Happy to dig in on envelope shape, JCS choice, EIP-712 distinction, or on-chain anchor logic if there's interest.

---

## Posting notes

- HN convention is to disclose affiliation upfront ("TrustBench author here") — that's done in line 1 of both versions.
- The preemptive bin disclosure ("Heads up...") does two things: it lets commenters skip the broken-form troubleshooting cycle, and it telegraphs that you're aware of warts and shipping fixes (build-in-public credibility signal).
- Neither version makes any claim Strata's post doesn't already support. No "we're the standard," no "neutral routing layer," no Pillar 1 / Pillar 2 vocabulary. Just: signature is real, verify it yourself, here's how.
- HN sometimes downvotes "X author here" comments for self-promotion. The mitigation is to lead with substance (the JCS+Ed25519 mechanic), not a pitch. Both versions do that.
- If a commenter has already posted "this is just signed JSON, what's the moat" — switch to a Q&A reply from `drafts/hn-show-canned-qa.md` rather than the supportive comment.

## What NOT to post

- Any version that calls TrustBench "the standard" or "neutral routing layer" or "Pillar 1." That language is internal-only and reads as overclaim on HN.
- Any version that pitches the paywall or `/route` revenue model. The Strata thread is about Strata; TrustBench's role is the verification substrate. Stay in that lane.
- Any version that quotes Strata's post back at them. Looks like sock-puppeting.
- Any version that ends with "happy to call." Async-only (per outreach rule).
