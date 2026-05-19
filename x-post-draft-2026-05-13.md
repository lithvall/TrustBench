# X post draft for 2026-05-13 build-in-public rotation

Drafted 2026-05-12 covering yesterday's (today's) Phase 4 push-through. Two options below — pick or edit. Both follow no-em-dashes rule, under 280 chars, honest framing (no claim of indexing — that's not validated).

## Option A — "wins" framing (~270 chars)

> Phase 4 progress on TrustBench yesterday: three real paid /route settles through CDP on Base, $0.015 burned, all signed receipts verify clean SIGNATURE VALID + ON-CHAIN VERIFIED. Idempotency replay now byte-identical (the v0.1.1 promise actually delivered). One bug fix on the wire path. Building in public, one settle at a time.

## Option B — "what didn't work" framing (~265 chars)

> Yesterday on TrustBench: three real paid /route settles confirmed on-chain ($0.015 USDC, three signed receipts). Two bug fixes shipped: idempotency replay is now byte-identical, /route 402 emits resource field for v2 spec compliance. Bazaar indexing still pending — first-index latency for a new payTo+URL looks longer than the docs' ~10min. Honest signal beats theater.

## Notes on choice

- **A** leads with the wins, no mention of the pending indexing — cleaner reach but slightly omits the open question.
- **B** is more transparent about what didn't validate — fits build-in-public ethos better but reveals the open thread to a public audience.

I lean **B** slightly — the transparency is on-brand and the "honest signal beats theater" close lands well. But A is fine if you'd rather wait to broadcast the wire-fix narrative until indexing actually lands.

## Add to rotation OR send manually?

The daily X post (`scripts/post-to-x.js`) has a 7-day rotation with `METHODOLOGY_NOTES` + `BUILD_IN_PUBLIC` arrays. Adding this to `BUILD_IN_PUBLIC` and pushing means it rolls naturally with the rotation. Sending manually means it goes out today/tomorrow regardless of the rotation slot.

Either works. If adding to rotation, edit `scripts/post-to-x.js` BUILD_IN_PUBLIC array and push — the cron picks it up automatically.
