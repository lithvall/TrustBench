# Reply to Strata — 2026-05-13 (§8 step 4 reference integration sketch ready)

Strata's 2026-05-12 reply closed with: *"Ping when it's ready for step 4."*

This reply pings them. Updated sketch with §10 (reference integration spec) is live; this DM points at it and flags the four bits Strata should look at first.

Paste-ready below the line. Two send options below the DM body in case the longer one feels too detailed.

---

## Option A — full pointer (recommended)

Step 4 ready. Updated the sketch with §10 (reference integration spec), §8 (closed steps 1-3), no edits to §1-§7 or the locked tier table.

Four things in §10 worth your eyes first:

§10.4.5 pins how X-Trust-Signals interacts with idempotency and signature coverage. Net: the signals are included in the request hash (so replays with different signals 409), captured in the signed receipt body (so the Ed25519 signature covers them), and replays return the original signals not fresh.

§10.5 names CoinMarketCap as the first-pick merchant for the reference run, with Exa or Browserbase as fallbacks. No relationship with any of them; the choice is "first live verified x402 endpoint that probes clean." Flag in §10.8.B if you have a preferred URL.

§10.7 is a target window (receipt URL by Tuesday 2026-05-19), not a day-by-day schedule. The implementation is ~2 days plus buffer; I'll send the URL the moment it verifies clean against --check-chain.

§10.8 has five open questions worth a fast yes/no on at least A and B (repo public vs unlisted, preferred test merchant). C through E are softer.

Will start the implementation on the locked shape today. If §10 surfaces a different reference shape from your side, sooner is better, but nothing in §10 blocks me starting Changes 1+2 against the shape that's already locked.

— Johan

---

## Option B — shorter ping

Step 4 ready. Sketch updated with §10 (reference integration spec). Four bits worth your eyes: §10.4.5 (idempotency/signature contract), §10.5 (merchant choice = CMC first-pick, fallbacks named), §10.7 (target window 2026-05-19, range not deadline), §10.8 (five open questions, A and B are the fast ones).

Implementation starts today on the locked shape. Push back on anything in §10 and I'll iterate before it ships.

— Johan

---

## Send notes

- **Recommended: Option A.** Strata's prior replies have been substantive (the 2026-05-08 four-correction note was 200+ words). Matching cadence on a partner-facing step-4 deliverable is appropriate. Option B is the fallback if the conversation has shifted to fast-ping mode.
- **No em-dashes in either option** (per `feedback_no_em_dashes_outreach.md`).
- **No calls proposed in either option** (per `feedback_no_calls_in_outreach.md`).
- **Async close** in both ("will start the implementation," "push back on anything") — leaves the next move with Strata but doesn't block our side.
- **No links to the actual Gist URL in this file** — Johan will paste that into the DM directly. The Gist URL stays out of the repo per the 2026-05-08 secret-Gist distribution decision.

After sending, update `decisions.md` with an entry noting §10 sent + the implementation start (Changes 1+2 paywallGate prep). If Strata's reply requires a wire-shape change, log it; if their reply is silent or "looks good," start the implementation per the day-by-day mental model (not the public timeline).