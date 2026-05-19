---
name: x402route
handle: unknown
url: "https://x402route.vercel.app"
severity: 3
last_scanned: 2026-05-12
category: routing-overlap
---

## Capability snapshot (as of 2026-05-12)

- Direct same-surface routing competitor. Identified via agentic.market validator's "Similar Indexed Endpoints" feature — they show up adjacent to trustbench.io in the validator's catalog.
- Response shape: plain JSON. No signed receipts, no on-chain anchor in the response, no audit URL.
- Hosted on Vercel (vs. TrustBench's Railway). Implies lighter-weight infra. Could be a weekend project, could be a deliberately-thin MVP — needs ownership scan to disambiguate.
- No identified team / handle / repo at observation time.

## Pricing (as of 2026-05-12)

$0.001 per call. **5x cheaper than TrustBench's per-call rate at observation time.** This is the most active competitive pressure point in the file.

## TrustBench differentiator vs. x402route — falsifiable form

Today, TrustBench's defenses vs. x402route are:

1. **Signed receipts in the response envelope.** x402route returns plain JSON; there is nothing to verify. **To fail:** x402route adds Ed25519 or EIP-191 signing to their response. **Observable signal:** their JSON response gains a `signature` field, or response headers include a signed envelope.
2. **On-chain settlement anchor.** **To fail:** x402route exposes `tx_hash` + `chain` in their JSON. **Observable signal:** response shape change.
3. **Public audit URL at `/receipts/:id`.** **To fail:** x402route adds a public audit endpoint. **Observable signal:** their docs / URL structure.
4. **Standalone verifier.** `@trustbench/verify-receipt` at v0.1.2. **To fail:** x402route publishes a verifier. **Observable signal:** new npm package or repo.
5. **Trust-signals embedding.** TrustBench routing receipts now carry `trust_signals[]` (shipped 2026-05-13 per main-project memory). **To fail:** x402route ships annotations / scoring in the response.

## Kill criterion

x402route shipping (1) **plus** (3) at $0.001/call would put TrustBench under direct price pressure on a feature-matched basis with the cheaper option winning by default. **Observable signal:** their JSON response gains a `signature` field, or their docs add `/receipts/:id` — either alone is sev-up to 4; both together is sev-5 and triggers a main-project pricing reassessment.

Separate kill criterion: x402route gets acquired or amplified by a larger discovery surface (agentic.market featuring them above trustbench.io, Bazaar listing them prominently, Coinbase x402 docs referencing them). Pricing pressure scales with reach.

## Adoption signals

- Discovered via validator-adjacent listing — agentic.market indexes them and surfaces them next to trustbench.io.
- Unknown: traffic volume, GitHub presence (no public repo identified at last scan), team identity, funding, sustained activity.
- The Vercel deployment makes activity scrapeable if needed (deploy history is public on Vercel project pages — needs check).

## Watch

Next scheduled scan: weekly per `weekly-scan-prompt.md`. **Specific questions for the next scan:**

- JSON response shape — has signing or anchoring landed?
- `/receipts` or audit endpoint — anything new?
- Vercel deployment frequency (if scrapeable via public deploy history) — is this actively maintained, or stagnant?
- Team / handle — has anyone publicly claimed this project? Look for X mentions of `x402route` from a stable handle.
- Pricing — still $0.001/call, or has it moved up (gives breathing room) or down (escalates)?
- agentic.market positioning — are they still surfaced next to trustbench.io? Promoted? Demoted?
