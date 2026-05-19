---
name: MAKO Pulse
handle: "@ChrisDMacro"
url: "verify on first scan (Pollinate Research / mako.tools?)"
severity: 4
last_scanned: 2026-05-15
category: direct-1to1
---

## Capability snapshot (as of 2026-05-15)

- Pollinate Research project. Founder is @ChrisDMacro (chrisdmacro.base.eth, 12.1K X followers as of 2026-05-15).
- Signed-receipt scoring using EIP-191 signatures with a 60-second validity window.
  - Compare TrustBench: Ed25519 + JCS canonicalization, no expiry on the receipt itself, public verification key at `/.well-known/trustbench-pubkey`.
  - Open question for next scan: does MAKO publish their signing pubkey, or is verification gated through their API?
- MAKO Route composes three layers: Pulse (scoring) + Pricing + Reputation. Direct conceptual overlap with TrustBench's `/route`.
- 765 services tracked at observation time (their site, 2026-05-15).
- Reciprocal mapping confirmed: trustbench.io appears in their listing at score 99 TRUSTED, PAY-TO empty. They have indexed us; we are in their data.

## Pricing (as of 2026-05-15)

Unknown — needs first scan. High priority for the next pass: their pricing page, if any, and whether they charge per-call, per-receipt, or via subscription. If they're free, that's a different threat shape entirely (mindshare grab, not revenue overlap).

## TrustBench differentiator vs. MAKO Pulse — falsifiable form

Today, TrustBench's defenses vs. MAKO Pulse are:

1. **On-chain settlement anchor.** Receipt envelope carries `receipt.settlement.tx_hash` + `chain`. **To fail:** MAKO ships a settlement-anchored receipt envelope. **Observable signal:** their receipt format gains a `tx_hash` field or equivalent.
2. **No expiry on receipt validity.** Durable audit trail vs. MAKO's 60-second EIP-191 window. **To fail:** MAKO removes the expiry or ships a long-validity tier. **Observable signal:** their docs change.
3. **Public, immutable, no-auth audit URL.** `/receipts/:id` is fetchable by anyone forever. **To fail:** MAKO ships a public audit endpoint with similar properties. **Observable signal:** their URL structure exposes individual receipts to unauthenticated GET.
4. **Standalone npm verifier.** `@trustbench/verify-receipt` lets third parties verify offline; current at v0.1.2 (2026-05-15). **To fail:** MAKO publishes a third-party verifier (npm, pip, Go module). **Observable signal:** new package under MAKO / Pollinate Research org.
5. **Explicit non-custodial posture.** Written into product surface and CLAUDE.md as a hard rule. **To fail:** MAKO is also non-custodial (likely is — confirm next scan). **Observable signal:** their docs.

Defense (5) is probably already neutral, not a differentiator. Pending confirmation.

## Kill criterion

Any one of defenses (1), (3), or (4) being matched by MAKO closes a Pillar-1 differentiator. **If two of those land in the same quarter, TrustBench's signed-receipt-format moat is functionally gone and Pillar-1 strategy (Options A/B/C in `strategic-pillars-and-options-2026-05-14.md`) needs reassessment immediately.**

Separately: if MAKO Pulse gets featured by a Tier-1 facilitator (Coinbase x402 docs reference them, agentic.market promotes their routing layer above TrustBench's), that's a distribution kill criterion independent of feature parity.

## Adoption signals

- 765 services tracked (their site, 2026-05-15) — needs growth-rate measurement next scan.
- 12.1K X followers on @ChrisDMacro (2026-05-15).
- chrisdmacro.base.eth ENS — basename-native identity suggests Coinbase-ecosystem-aligned positioning.
- Unknown: GitHub presence, npm packages, partner integrations, total receipts signed. Investigate.

## Watch

Next scheduled scan: weekly per `weekly-scan-prompt.md`. **Specific questions for the next scan:**

- Their primary URL and product surface (confirm `mako.tools` or correct domain).
- Receipt format docs — has settlement anchoring landed?
- Public audit URL — can a third party fetch a MAKO receipt without auth?
- npm — is there a `@mako/verify-*` or `@pollinate/*` package?
- Service-catalog count — is the 765 number growing? At what rate?
- X engagement: is @ChrisDMacro posting about the routing layer (MAKO Route) specifically, or just about Pulse scoring? The former is the bigger threat.
- Funding / team — is this a solo project or backed? Affects velocity.
