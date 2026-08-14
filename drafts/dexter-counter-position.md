---
title: What a TrustBench receipt is for (contingency artifact)
created: 2026-05-19
status: draft-unpublished
ship_trigger: facilitator-tier blessing of a pay-to-rank receipt extension (CDP / Cloudflare / x402 v2 inclusion) OR public engineer engagement signaling adoption is forming
target_publish_window: within 24h of trigger fire
length: ~330 words
companion_doc: audit-and-path-forward-2026-05-19.md (v2) § 5 Day-1 artifacts + § 6 pre-trigger
---

# What a TrustBench receipt is for

A signed receipt is a record of what happened. In TrustBench's case: an agent paid a specific amount to a specific provider for a specific call at a specific block on a specific chain, with the routing decision and any upstream trust signals attached. The envelope is Ed25519-signed, JCS-canonicalized, on-chain-anchored, and verifiable by anyone with the published key (`/.well-known/trustbench-pubkey`) and the standalone npm verifier (`@trustbench/verify-receipt`).

What's inside the envelope: payment amount, payee address, settlement transaction hash, block number, routing decision, optional trust signals from upstream scoring partners, timestamp, and the cryptographic chain that lets a third party verify all of the above without trusting TrustBench.

What's not inside: paid placements, sponsored recommendations, advertising slots, ranking signals derived from anything other than measurement. TrustBench's routing decisions come from observed liveness and latency, not from auction bids. Providers can pay to be listed (a small refundable verification bond, public on-chain) but no provider can pay to rank.

This matters because the receipt is what an auditor relies on. If "this receipt says route to X" can mean *X measured well last night* OR *X paid for this slot*, the auditor can't tell which one applies. The receipt becomes uninterpretable. Mixing measurement and advertising into the same envelope collapses the trust property that makes signed receipts useful in the first place.

There are real reasons projects build pay-to-rank-shaped receipt extensions: funding velocity, distribution mechanics, ad-revenue capture. Those are legitimate business models in their own envelopes. TrustBench's choice is to keep measurement and recommendation in separate artifacts so an agent operator can compose them on their own terms, with full visibility into which is which.

The structural argument, not the moral one: ranking incentives contaminate attestations. When the same envelope carries both "what happened" and "who paid to be next," the auditor can't separate signal from sale. The verification property collapses. This is a protocol-design constraint, not a virtue claim. Composable trust layers need separable economic semantics, otherwise downstream tools that try to reason about either layer end up reasoning about both, badly.

On composition: TrustBench receipts can coexist with recommendation-carrying receipt extensions. They occupy different envelope slots, attest different facts, and an agent operator can request both, neither, or either independently. We do not block interoperation. We do refuse to merge the semantics into one envelope, because the merge is what collapses the verification property.

The signed-receipt envelope is offered as a published spec (`receipt-spec-v1.md`) with a verifier npm package. Adopt by emit, verify with the standalone CLI, compose against whatever discovery, advertising, or recommendation layer your stack uses. The envelope's job is to tell you what happened. Not to sell you what should happen next.

---

## Notes on shipping

- Do NOT name Dexter, Instinct, x402ads.io, or any specific competitor. The position stands on its own; calling out a competitor reads as defensive and dilutes the framing.
- Do NOT use "compliance," "benchmark," "oracle," "authority," or "audit-vendor" vocabulary. Per CLAUDE.md honest-framing rule.
- Build-in-public tone. First-person plural ("our choice") is fine; "TrustBench" third-person is fine; do not anthropomorphize.
- Ship surfaces (one or more):
  - Tweet thread (decompose into ~4-6 tweets; lead with "A signed receipt is a record of what happened.")
  - Blog post on trustbench.io/blog (does not currently exist; would be the first blog post)
  - LinkedIn long-form (lower priority; X is the primary audience)
  - GitHub discussion thread on the receipt-spec-v1 repo (TBD if repo exists separately or stays in main)
- Pin the tweet thread for 7 days.
- Watch engagement: any substantive reply from a non-TrustBench facilitator-tier account is a Pillar 1 signal worth following up on.

## Pre-ship 24h checklist (when trigger fires)

- [ ] Confirm the trigger condition (CDP/Cloudflare engineer publicly engages OR formal facilitator adoption announced).
- [ ] Re-read the draft for any drift toward defensive framing.
- [ ] Verify no "compliance / benchmark / oracle" vocabulary.
- [ ] Confirm `/.well-known/trustbench-pubkey` and `@trustbench/verify-receipt` npm references are accurate at ship time.
- [ ] Ship surface chosen and prepared.
- [ ] Strata pre-launch maintenance window check: if Strata Show HN is within ±48h of trigger, hold publication; coordinate with Strata first.
- [ ] Post-publish: append `decisions.md` entry with the trigger evidence + leading-indicator for adoption response.

## What this artifact does NOT do

- Does not counter-ship a feature against any competitor. (Counter-shipping pay-to-rank would violate stance `out_of_scope: pay-to-rank`.)
- Does not position TrustBench as authoritative or "the standard." Positions the envelope as a tool with specific properties; adopters compose at their own discretion.
- Does not commit TrustBench to a public standards-track process. The receipt-spec is open; participation in formal standards bodies is a separate decision.
- Does not declare interoperability impossible with recommendation-carrying envelopes. The position is "separable semantics," not "incompatible artifacts."

## Maintenance discipline

**Re-read weekly during the 30-day Dexter watch window** (added per v2 cross-check). The artifact's content depends on the current Dexter/Instinct framing remaining stable. Token-funded competitors iterate their messaging rapidly; if Dexter pivots framing (e.g., re-positions Instinct as "guided commerce intelligence" rather than "agent advertising"), the artifact's contrasts may go stale. Weekly read: confirm the three required sections (structural argument, composition stance, governance philosophy) still match the current competitive landscape. If they drift, update before any shipping trigger fires. If the artifact has not been touched in 14+ days AND no shipping trigger has fired, re-evaluate whether the contingency is still worth maintaining or whether the threat profile has changed.
