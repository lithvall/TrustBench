---
purpose: Pre-thought answers to anticipated HN technical questions about TrustBench's role in Strata's stack
target: Strata Show HN thread, Tuesday or Wednesday 2026-05-26 / 2026-05-27 PT morning
author: drafted 2026-05-25 by Claude, pending Johan review
context: The 2026-05-19 DM committed Johan to "happy to answer verifier or envelope-shape questions if commenters ping that direction." These are ready-to-paste, edit-as-needed.
voice: technical, specific, no marketing, acknowledges trade-offs. HN responds to honest engineering, not hype.
---

## Usage

Each answer is sized for one HN comment (~400-700 chars). Adjust the opener depending on whether you're replying to a top-level question or threading deeper. Don't paste verbatim if the question is phrased differently than below — pick the closest match and edit the framing.

---

## Q1: "What's actually signed?"

The `receipt` object as a whole, JCS-canonicalized (RFC 8785: sorted keys at every depth, no whitespace, JSON.stringify for primitives). For the Strata-anchored receipt that's 1261 bytes signed. The signature itself is Ed25519, 64 bytes, base64url-encoded as `signature.value` in the envelope. Same key signs Phase 3 settlement receipts (`rcpt_` prefix) and Phase 4 paywall routing receipts (`rrcpt_` prefix); both verify with the same public key at `/.well-known/trustbench-pubkey`. The signature does NOT cover the wrapping HTTP response or any header — purely the canonicalized receipt body, so you can pull the receipt from `/receipts/:id` days later and the bytes verify identically.

---

## Q2: "Why JCS? Why not protobuf or DAG-CBOR or just sign the bytes you served?"

Three reasons.

First, JCS (RFC 8785) is JSON-native. The receipt is already a JSON document served over HTTPS, so JCS lets verifiers operate on the document they already have without a schema-decode step. Protobuf would force everyone to ship the schema alongside; DAG-CBOR would force a JSON-to-CBOR round-trip.

Second, signing the served bytes (vs. canonicalizing first) breaks the moment any intermediary touches the JSON (a Cloudflare worker reordering keys, a logging proxy stripping whitespace). JCS makes the signature independent of transport.

Third, JCS's main drawback — numeric edge cases — doesn't bite us because the payload has no floats, only integers and ISO 8601 strings.

If you're greenfield and don't have the "already JSON over HTTPS" constraint, COSE or Sigstore are reasonable alternatives. The trade is verifier surface.

---

## Q3: "What does `--check-chain` actually verify beyond the signature?"

Five things, against a public Base RPC:

1. The tx_hash from the receipt exists on chain.
2. `tx.to` is the canonical USDC contract `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`.
3. The calldata decodes as `transferWithAuthorization(from, to, value, ...)`.
4. `from`, `to`, `value` in the calldata match `payer_address`, `payee_address`, `amount_atomic` in the receipt.
5. The tx was mined successfully (and, if the receipt claims a `block_number`, that it actually mined at that height).

So the receipt alone says "TrustBench claims this happened with these parameters." With `--check-chain`, it says "the chain agrees with TrustBench's claim." Neither requires trusting the trustbench.io host — only the public key (for the signature) and the RPC (for the chain check). Bring your own RPC with `--rpc-url`.

---

## Q4: "How is this different from EIP-712 typed data signing?"

They answer different questions and live at different layers.

EIP-712 is for the agent's payment authorization. The `transferWithAuthorization` itself is EIP-712-signed by the agent's wallet before TrustBench ever sees it — that's what makes the non-custodial property work. TrustBench can't move funds; the agent already authorized exactly this transfer.

The receipt signature is a separate, post-facto attestation by the routing layer. It's JCS+Ed25519 rather than EIP-712 because we want it verifiable without an Ethereum client. Just a JCS implementation + a public key. The receipt's job is to attest WHAT TrustBench knew at routing time: provider URL, capability, request hash, response hash, idempotency key, trust signals if present.

Two signatures, two layers, two questions: "did the agent authorize this payment" (EIP-712) and "did the router route it under these conditions" (Ed25519 receipt).

---

## Q5: "Is this just a signed webhook?"

No, in two specific ways.

Signed webhooks are usually HMAC — shared-secret, only the sender + recipient pair can verify. The TrustBench receipt is asymmetric Ed25519: anyone with the public key can verify, no shared secret required.

Signed webhooks are also transport-level (they sign the HTTP body in transit). The receipt is data-level: it signs the canonical receipt object independent of transport, so you can pull the receipt from `/receipts/:id` a week later, days after any webhook would have rotated its key or expired its replay window, and the same bytes verify under the same public key.

The closest analogue is a JWT or a Sigstore artifact, not a webhook. The receipt is a portable assertion, not a delivery mechanism.

---

## Q6: "Why a centralized signing key? Why not on-chain attestation?"

The on-chain attestation is already there — the tx_hash + the USDC `AuthorizationUsed` event are the on-chain record of settlement, and `--check-chain` verifies the receipt's payment fields against that record.

The Ed25519 signature adds *what TrustBench knew about the call*: provider URL, capability, request hash, response hash, idempotency key, trust_signals if present. That metadata isn't on-chain and shouldn't be — it would bloat block space for data only relevant to the parties involved.

Centralizing the signing key is honest framing: TrustBench is one party making one claim. The third-party verifier means you don't have to trust the hosted endpoint, just the key. If the key gets rotated, the public-key URL is the canonical pointer (`/.well-known/trustbench-pubkey`), and historical receipts pin their `key_id` so you can verify them against the key that was active at signing time. The trust model is "trust the key + verify the rest cryptographically," not "trust the hosted endpoint" and not "trust an L1."

---

## Q7: "What stops you from re-signing a receipt to lie about what happened?"

Two things, plus a structural one.

First, the on-chain anchor. The tx_hash, the payer_address, the payee_address, and the amount are all verifiable against Base. If I sign a receipt that says "Alice paid Bob $5" but the tx_hash on chain shows "Alice paid Charlie $5," `--check-chain` fails. The receipt is provably inconsistent with the on-chain truth.

Second, the request/response hashes. The receipt commits to sha256(request_body) and sha256(response_body). If a counterparty has the original request and the original response, they can rehash and confirm. If I re-sign a receipt with different hashes, anyone with the original bytes catches it.

Structural one: I CAN sign a receipt for a call that never happened with values that internally consistent. The receipt would verify cryptographically but be a fabrication. That's a residual trust assumption on the routing layer — and it's the reason the on-chain anchor matters: it externalizes the most important field (did money move) to a substrate I don't control. For everything except "did money move," the trust assumption is "TrustBench wouldn't sign something untrue" — same trust assumption you'd make of any signed-attestation issuer (Sigstore, GitHub commit signing, RFC3161 timestamping).

---

## Q8: "Why should I trust TrustBench's score? Isn't this just marking your own homework?"

Specifically about the Strata pairing: the score isn't TrustBench's. The score is computed by Strata, embedded by Strata in the receipt's `trust_signals` field, and signed by TrustBench at routing time. TrustBench's signature attests "this is what Strata returned for this call at this timestamp"; it doesn't attest "this score is correct."

So the chain is:
- Strata computes the score (their model, their methodology — separate Show HN post they're presumably making the case for).
- TrustBench captures it as a `trust_signals[]` entry in the routing receipt.
- The receipt is Ed25519-signed at issue.
- Anyone can verify the signature locally + verify the on-chain settlement matches.

That's why the "score went from 10 to 65 after PR #24" claim is checkable without trusting either party: you can pull the two receipts, verify both signatures against the same Ed25519 key, and read the `trust_signals` field at issue time. Whether the score is *meaningful* is a different question — that's Strata's case to make. TrustBench's job is making sure the claim about "this is what was scored at this moment" is tamper-evident.

---

## What NOT to answer

- Any question about Strata's scoring methodology specifically. Punt to Strata.
- Any question that turns into a public roadmap discussion. "We're thinking about it, ping me async" — don't commit to Phase 5 / p402 / Canton timelines from an HN thread.
- Any question that asks for revenue numbers, customer count, or burn. "Solo founder, build-in-public, happy to talk shape but not specific numbers."
- Any question that asks you to compare TrustBench to a named competitor by name. Acknowledge the lane, decline the comparison. "Different lane — they're [X], we're [Y]. Worth their own thread."

## Decision tree if it gets heated

- Honest technical pushback ("JCS has these limitations") → engage substantively, acknowledge the trade.
- "This is just signed JSON, what's the moat" → Q5 + Q7, then stop. Don't argue moat with HN.
- "You're shilling for Strata" → one short reply: "TrustBench author, disclosed in line 1, the verifier is on npm and the code's on GitHub, take it or leave it." Then stop.
- Personal attacks → don't respond. HN moderators handle those.
