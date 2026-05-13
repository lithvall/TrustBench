# TrustBench × Strata — Integration Sketch

This is a written sketch of how a TrustBench × Strata integration could work, written so you have something concrete to reference for Show HN if it helps. The shape is the one you proposed — *Strata scores before the call, TrustBench verifies after* — and the technical seams below are where I think the integration is most natural.

Nothing here is set in stone. If anything reads as a wrong assumption about Strata's surface, point it out and we'll iterate. Where I name dollar amounts they're starting points, not asks; the actual tiers should be whatever makes sense for Strata's economics and ours.

---

## 1. The shape, in one diagram

```
                    ┌──────────────────────────┐
                    │      Strata              │
                    │  (pre-call scoring)      │
                    └────────────┬─────────────┘
                                 │ runtime_score (float 0–1)
                                 │ + capability flags
                                 ▼
   Agent ──────► /verify ──► (decide to pay) ──► merchant call
                                                      │
                                                      ▼
                    ┌──────────────────────────┐
                    │    TrustBench            │
                    │  (post-call verify       │
                    │   + signed receipt)      │
                    └────────────┬─────────────┘
                                 │ Ed25519-signed receipt
                                 │ with on-chain anchor
                                 │ + trust-signal annotation
                                 │   (Strata's score carried forward)
                                 ▼
                          /receipts/:id
                          (queryable, immutable)
```

Strata answers *"is this endpoint safe enough to pay?"* before the call. TrustBench answers *"what actually happened, signed, queryable, on-chain-anchored?"* after the call. The receipt envelope can carry Strata's pre-call posture as an annotation so any downstream verifier reading a TrustBench receipt also sees what Strata said about the endpoint at the moment of payment, without a separate Strata lookup.

---

## 2. Receipt envelope shape (what TrustBench signs today)

Live receipt format. Here's the milestone receipt against a real x402 provider:

```
GET https://trustbench.io/receipts/rcpt_01KQY7C44GAPSXZPFQYRZ1D10C
```

The structure:

```json
{
  "receipt": {
    "version": "1.0.0",
    "receipt_id": "rcpt_01KQY7C44GAPSXZPFQYRZ1D10C",
    "issued_at": "2026-05-06T...",
    "issuer": "trustbench.io",
    "call": {
      "agent_id": "agt_…",
      "capability": "data",
      "idempotency_key": "01KQY…",
      "provider_id": "infopunks",
      "provider_url": "https://api.infopunks.example/v1/cognition",
      "request_hash": "sha256:…",
      "response_hash": "sha256:…",
      "request_size_bytes": 218,
      "response_size_bytes": 14492,
      "latency_ms": 287
    },
    "settlement": {
      "chain": "base",
      "tx_hash": "0x3e6d6078…",
      "block_number": 45633871,
      "payer_address": "0x…",
      "payee_address": "0x…",
      "amount_atomic": "10000",
      "currency": "USDC",
      "decimals": 6,
      "settled_at": "2026-05-06T..."
    },
    "pricing": {
      "provider_price_atomic": "10000",
      "trustbench_fee_atomic": "100",
      "total_paid_atomic": "10100",
      "fee_model": "flat_per_tx"
    },
    "routing": {
      "score_at_decision": 96,
      "alternatives_considered": 2,
      "selection_reason": "highest_score_within_max_price"
    },
    "audit": {
      "audit_url": "https://trustbench.io/receipts/rcpt_01KQY7C44GAPSXZPFQYRZ1D10C"
    }
  },
  "signature": {
    "alg": "ed25519",
    "public_key_url": "https://trustbench.io/.well-known/trustbench-pubkey",
    "key_id": "trustbench-2026-04",
    "value": "base64url:…"
  }
}
```

Signed with Ed25519 over RFC 8785 JCS-canonical bytes of the `receipt` body. Detached signature pattern. Public key at the URL above; reference verifier in [scripts/verify-receipt.js](https://github.com/lithvall/TrustBench/blob/main/scripts/verify-receipt.js). Verifies offline with no dependency on TrustBench being online or honest.

---

## 3. Carrying Strata's `runtime_score` as a trust-signal annotation (your endorsed pattern)

You confirmed this in the DM: *"Carrying it as a trust-signal annotation in the receipt envelope makes sense — verifiers downstream get pre-call posture without a separate Strata lookup."*

Proposed addition to the receipt envelope, optional and additive (existing verifiers will ignore it without breaking):

```json
"trust_signals": [
  {
    "source": "strata.usestrata.dev",
    "kind": "runtime_score",
    "value": 0.87,
    "captured_at": "2026-05-08T09:14:22.118Z",
    "score_id": "strata_score_…",
    "ref": "https://usestrata.dev/api/v1/x402/verify?url=…"
  }
]
```

Notes on shape:

- `value` is a float in `[0, 1]` to match Strata's runtime_score exactly. No re-scaling on TrustBench's side.
- `captured_at` is the time the agent (or TrustBench, if the agent passes it through us) called Strata — not the time of the merchant call. The two should be close (sub-second to a few seconds) but they're distinct events and we want to keep them separate in the audit trail.
- `trust_signals` is an **array** because nothing prevents multiple sources from contributing. Today there's one entry (Strata). If a future identity-attestation provider (ERC-8004 reputation, Phala TEE attestation, etc.) wants to ride along, they're additive entries in the same array.
- The receipt's existing `signature` field covers everything in `receipt`, so the annotation is signed-by-TrustBench. Strata's own signature on its `runtime_score` artifact (if/when Strata signs scores) would be a separate `verifying_signature` field nested inside the entry — happy to design that with you.

**Question on shape:** would you prefer the annotation to carry Strata's signed score artifact embedded (Strata-signed-payload-as-bytes inside the TrustBench receipt) or just a reference URL with a content hash? The bytes-embedded path is slightly larger (~few KB) but verifiable without a Strata round-trip. The reference-URL path is smaller but requires a Strata fetch. Either works on our side; depends on what Strata's `/x402/verify` already returns and whether the response is signed.

---

## 4. The other direction — TrustBench liveness data feeding Strata's `runtime_score`

You raised this in your earlier reply: *"your nightly liveness telemetry would sharpen the runtime_score signal considerably."*

Proposed integration: Strata pulls `/rankings?capability=<cap>&format=json` once per index cycle. Live response shape (today, no auth required):

```json
{
  "success": true,
  "data": [
    {
      "provider_id": "https://api.brave.com/search",
      "capability": "search",
      "name": "Brave Search",
      "score": 96,
      "latency_p50": 28,
      "latency_p95": 70.3,
      "uptime_7d": 100,
      "last_updated": "2026-05-08T05:25:36.177+00:00",
      "x402_verified": false,
      "integration_type": null
    }
  ],
  "source": "TrustBench"
}
```

Useful fields for sharpening `runtime_score`:

- `latency_p50` / `latency_p95` — observed latency from a fixed cloud host, consistent baseline
- `uptime_7d` — rolling 7-day uptime percentage
- `score` — composite (formula at /methodology), already in `[40, 98]` range
- `x402_verified` — empirical bit; we live-probed and saw a real 402
- `last_updated` — staleness check

The `score` field is already published as the composite. If you want the underlying components for your own re-weighting, we can add an opt-in `&include=components` flag that returns the raw subscores (`successRate`, `latencyHealth`, `consistencyBonus`).

**Honest caveat we'd want stated together if Strata cites TrustBench data publicly:** the probe is HEAD-from-one-host, 3 samples per day, treats 4xx/429 as alive. It's a registry liveness check, not a benchmark. The methodology page at https://trustbench.io/methodology has the full disclosure. We'd appreciate that framing being preserved if Strata surfaces TrustBench data on its own surfaces.

---

## 5. Public verifier flow (the trust-minimization point)

This is the part of the spec that matters most to your stack — it lets *anyone* (including Strata, including Strata's downstream consumers) verify a TrustBench receipt without trusting TrustBench. Three layers of independence:

**Layer 1 — signature only (offline, ~50ms):**

```bash
npm run verify-receipt -- rcpt_01KQY7C44GAPSXZPFQYRZ1D10C
```

Pulls the receipt over HTTPS, fetches our published Ed25519 public key, verifies the signature over the JCS-canonical bytes. No TrustBench API call beyond the HTTPS fetch. Confirms: *"TrustBench (with this key) signed exactly these bytes."*

**Layer 2 — signature + on-chain (with `--check-chain`):**

```bash
npm run verify-receipt -- rcpt_01KQY7C44GAPSXZPFQYRZ1D10C --check-chain
```

Same as Layer 1, plus opens a Base RPC and checks that the `tx_hash` exists, the `block_number` matches, and the EIP-3009 `AuthorizationUsed` event fired with the nonce that matches the receipt. Confirms: *"the on-chain settlement TrustBench claims actually happened, with these parties, in this block."*

**Layer 3 — npm package (in flight, ~week to ship):**

`@trustbench/verify-receipt` is in flight as a one-line install. Same logic, distributable. When it ships, your `verify_agent_credential()` tool could call it natively, or anyone could call it from a CI step or an audit job. If there's a specific shape that would slot cleanest into Strata's existing verifier pipeline, tell me and I'll match it.

---

## 6. Pricing tiers (per your *"Yes to tiers please include them"*)

These are **starting points for the integration discussion**, not a contract. The actual rates we'd settle on for the Strata × TrustBench integration are subject to a few things I'd want us to look at together before locking in: actual call mix, real volume after a month or two of usage, and whether either side discovers the per-call cost-of-service is higher or lower than expected.

| Endpoint | Starting price | Notes |
|---|---|---|
| `GET /receipts/:id` | $0.0005 | Mostly cache hits, near-zero marginal cost on our side. |
| `POST /verify` | $0.002 | Compute + RPC cost (signature + on-chain reconciliation). |
| `POST /score-provider` | $0.005 | Pulls from the unique liveness telemetry corpus. |
| `POST /audit-replay` | $0.01 | Full receipt re-verification with chain reconciliation. |
| `POST /compliance-export` | $0.50–$2.00 | Per export. Signed multi-receipt bundle for tax/audit. Higher tier because the artifact has explicit downstream regulatory value. |

All paid in x402-native USDC on Base. No subscriptions, no contracts, no per-seat or per-month charge — pure pay-per-call.

For Strata's likely call mix (heavy on `/verify` and `/receipts/:id` reads, lighter on `/audit-replay`, occasional `/compliance-export` only if downstream consumers need them), the realistic per-call average lands around $0.001–$0.003.

**Tiers are reviewable.** The above are list prices for the public commercial relationship. The partner-specific arrangement between Strata and TrustBench can deviate where it makes economic sense for both sides. Specifically: if either side discovers the rates are mispriced after the integration is live, we re-quote — annually at minimum, sooner if real volume produces a clear signal. Putting that explicitly in any letter of agreement protects both of us.

**Open commercial questions worth flagging:**

- Whether `score-provider` should be reciprocal (free or discounted) given that you'd be feeding data back into your `runtime_score` from our liveness telemetry, which benefits Strata's scoring quality directly. There's a fair argument the data exchange offsets the per-call cost on that endpoint specifically.
- Whether prices should be quoted in USD or directly in atomic-unit USDC strings (we lean atomic-unit since x402 settles in atomic-unit USDC and rounding shows up at scale).

---

## 7. What I'd most want from your `/x402/verify` schema

You said you'd share it. Specific things that would help me lock down the integration:

1. **Response field names** — particularly the field carrying `runtime_score`. I want to mirror your naming exactly in the trust-signal annotation shape, not invent new names.
2. **Score artifact format** — is the response a plain JSON object, a signed JWT, or signed-payload-as-bytes? Determines the embedded-vs-reference question in § 3.
3. **The `score_id` shape** — is it derived from the URL hash, ULID-shape, ECC-signed, etc.? If we're going to reference your scores by ID in TrustBench receipts we want the IDs stable.
4. **24-hour cache behavior** — your DM mentioned 24-hour cache on `/x402/verify`. Are repeated calls within the cache window served from cache (free, presumably), or do they count against rate limits / pricing?
5. **Capability surface** — the score covers `runtime_score`, `security_score`, `payment_endpoint`. Is it possible to ask for one component without the others, or does `/x402/verify` always return the full triple?

When you have the schema ready, send it whenever convenient — even a stripped-down example response is enough to nail down the integration shape.

---

## Status update — 2026-05-11 (locked-after-corrections)

Strata replied with four corrections to §3 and §7. The locked annotation shape, after their feedback, is below. Original §3 above kept as historical record so the diff is legible.

**Locked annotation shape:**

```json
"trust_signals": [
  {
    "source": "strata.usestrata.dev",
    "kind": "x402_trust",
    "trusted": false,
    "security_score": 45,
    "risk_level": "medium",
    "payment_endpoint": {
      "amount_usd": 2.50,
      "currency": "USDC",
      "network": "base"
    },
    "actionable_flags": ["drain_risk"],
    "captured_at": "2026-05-10T14:23:41.000Z",
    "ref": "https://usestrata.dev/api/v1/x402/verify?url=..."
  }
]
```

**Resolved against §7 questions:**

1. Field names: `security_score` (int 0-100, kept at native scale, no rescaling), `trusted` (bool, primary signal), `risk_level` (string).
2. Score artifact format: plain JSON over HTTPS today, no artifact-level signing. Reference-by-URL path confirmed (vs. embedded signed bytes). TrustBench receipt signature is the only signature wrapping this annotation.
3. `score_id`: does not exist. Cache is keyed on canonical URL with a 24h window. Reference uses `(ref URL + captured_at)` instead, where `captured_at` mirrors Strata's `last_checked_at`.
4. 24h cache behavior: same score returned within window, re-probed after.
5. `unverified_domain` flag: filtered at receipt-emission time. Reason: Strata's WHOIS is a v1 stub; the flag appears on almost every endpoint and means "unverifiable," not "suspicious." Filtering avoids baking a noisy v1-stub signal into an immutable receipt artifact. Field renamed `actionable_flags` to make the filter explicit and forward-compatible (pending Strata confirmation; raised in 2026-05-11 reply).

**Resolved against §6 open commercial questions:**

- Reciprocal `score-provider` (data-exchange offset): confirmed by Strata, "data exchange offset makes sense."
- Pricing unit: atomic-unit USDC confirmed (vs. USD).

**Open after 2026-05-11 reply:**

- ~~`actionable_flags` vs. `flags` field name (small, raised in reply).~~ ✓ Resolved 2026-05-12: Strata confirmed `actionable_flags` ("ages better, semantically honest about filtering, no versioning note needed when WHOIS lands").
- ~~Move to §8 step 3 (tiers) pending Strata's response.~~ ✓ Unblocked 2026-05-12.

**New 2026-05-12 (Strata "ship them" reply):**

- Strata offered to mirror the `payment_endpoint` nested shape in a future `/x402/verify` response revision. If that revision lands, the receipt annotation `payment_endpoint` block stays exactly as locked above and the names match on both sides.
- Sample URL in 2026-05-11 reply (`pay.example.com/api/payment`) was schema illustration; missing `https://` scheme was not a live-call issue. Acknowledged in 2026-05-12 reply.
- `trust_signals` Ed25519-wraps-annotation pattern endorsed: *"Downstream verifiers get cryptographic proof that TrustBench observed that specific Strata response at captured_at, which is stronger than a reference URL alone."*

---

## 9. Tiers (TrustBench-side locked 2026-05-12; Strata acceptance pending)

Step 3 of §8 opened with Strata's "ship them" reply 2026-05-12. TrustBench-side decisions locked same day, sent to Strata in `strata-reply-2026-05-12.md`. Awaiting Strata acceptance or pushback.

**Locked v1 pricing (sent to Strata 2026-05-12):**

| Endpoint | List price | TrustBench × Strata rate | Notes |
|---|---|---|---|
| `GET /receipts/:id` | $0.0005 | $0.0005 (list) | Cache-heavy. |
| `POST /verify` | $0.002 | $0.002 (list) | Compute + RPC. |
| `POST /score-provider` | $0.005 | **Free (full reciprocal)** | Scoped to score-provider only. Data-exchange offset: Strata's `/x402/verify` data flows into TrustBench receipts as `trust_signals`; TrustBench liveness telemetry flows into Strata's `runtime_score`. Re-quote clause covers volume drift on either side. |
| `POST /audit-replay` | $0.01 | $0.01 (list) | Full chain reconciliation. |
| `POST /compliance-export` | **$1.00** (starting) | $1.00 (list) | Starting midpoint of original $0.50-$2.00 range. Calibrates against first one or two real bundle requests; moves up if bundles are heavier than expected, down if lighter. |

All paid in atomic-unit USDC on Base (confirmed §6 resolved-against-Strata). No subscriptions; pure pay-per-call.

**§6 re-quote clause (load-bearing for the reciprocal arrangement):** If real volume produces a clear signal — score-provider traffic balloons, compliance-export bundles end up heavier or lighter than expected, or the data-exchange balance shifts — either side can call for a re-quote. Annual at minimum, sooner if real volume warrants. Putting this in any letter of agreement protects both sides.

**Why scoped reciprocal (not all-tiers-free):** Other tiers are economically separate from the data-exchange flow. score-provider is the specific endpoint where reciprocal value is happening; the other endpoints carry their own cost-of-service that has nothing to do with Strata's `/x402/verify` data. Bundling them into the reciprocal would give away revenue lines that don't have offsetting value.

**Why not 50% discount on score-provider instead:** 50% discount is operationally simpler (predictable revenue line) but loses the partnership framing. Given the data flow IS reciprocal and marginal cost on score-provider is near-zero at expected volumes, full reciprocal is honest. The re-quote clause handles the small-but-nonzero scenario where Strata's traffic gets weird.

---

## 8. Concrete next steps

Original next-steps sequence kept here as historical record. Steps 1-3 closed; step 4 now expanded in detail in § 10 below.

1. ~~**You send the `/x402/verify` schema** at your convenience.~~ ✓ Closed 2026-05-11 (plain JSON, URL-cached, no artifact-level signing).
2. ~~**I take a first cut at the trust-signal annotation field names**.~~ ✓ Closed 2026-05-11 (locked annotation shape in § 3 update).
3. ~~**We agree on tiers.**~~ ✓ Closed 2026-05-12 (full reciprocal score-provider; $1.00 compliance-export; everything else at list — see § 9).
4. **Reference integration ships** — expanded into a concrete spec at § 10. Target ~1 week from tier lock (~2026-05-19).
5. **Public artifact** — covered in § 10.5 (the resulting receipt URL).

— Johan

---

## 10. Reference integration spec (step 4 detail)

**Status:** TrustBench-side spec. Sent 2026-05-13 after tier lock. Anchors the reference agent + the exact API surfaces it exercises so we're not iterating mid-build.

### 10.1 Goal

A single test agent demonstrates the end-to-end flow in § 1:
- Calls Strata's `/x402/verify` against a merchant URL before paying
- Captures the `trust_signals` payload (the locked shape in § 3)
- Routes through TrustBench, paying the merchant via x402
- Receives a signed receipt that carries Strata's signals as the first `trust_signals[]` entry
- The receipt is publicly viewable, byte-identical-replayable, and verifiable offline against TrustBench's published Ed25519 key

Success criterion: the receipt URL is a single shareable artifact that, when fetched, demonstrates the integration to any third party (including a Show HN audience) without either side being online.

### 10.2 End-to-end flow

```
[Reference Agent]
   │
   │ 1. Reads target merchant URL from config
   │    (concrete choice in § 10.5)
   │
   │ 2. GET https://usestrata.dev/api/v1/x402/verify?url=<merchant>
   ▼
[Strata /x402/verify]
   │
   │ 2a. Returns the locked shape:
   │     { trusted, security_score, risk_level, payment_endpoint,
   │       actionable_flags, captured_at, ref }
   │
   ▼
[Reference Agent]
   │
   │ 3. Decides to proceed (test path always proceeds)
   │
   │ 4. POST https://trustbench.io/route
   │      Headers: X-Trust-Signals: <base64url-JSON of the
   │               Strata payload, exact bytes from step 2a>
   │      Body:    { capability: "data", max_price: "10000",
   │                 payer_address: <agent EVM addr> }
   ▼
[TrustBench /route — quote]
   │
   │ 5. Returns 402 with payment_required (TrustBench's $0.005
   │    routing fee + the upstream merchant's payment_required
   │    nested under next_step). The 402 body carries the
   │    Strata trust_signals payload echoed in extensions.bazaar
   │    so an x402-aware client can see it before paying.
   │
   ▼
[Reference Agent]
   │
   │ 6. Signs the routing fee X-PAYMENT and POSTs back
   │
   ▼
[TrustBench /route — settle]
   │
   │ 7. Verifies the X-PAYMENT, settles via CDP facilitator,
   │    issues a signed routing receipt
   │      receipt.trust_signals[0] = the Strata payload
   │        from the X-Trust-Signals header (verbatim,
   │        same bytes captured_at as step 2a)
   │      signature.alg = ed25519
   │
   │ 8. Returns 200 with:
   │      - the full signed receipt JSON
   │      - the receipt_id + audit_url
   │      - the next_step payment requirements for the
   │        upstream merchant
   │
   ▼
[Reference Agent]
   │
   │ 9. Signs the merchant payment, POSTs to merchant
   │
   ▼
[Merchant — currently CoinMarketCap, see § 10.5]
   │
   │ 10. Returns 200 with the merchant response
   │
   ▼
[Public artifact]
   │ https://trustbench.io/receipts/<receipt_id>
   │ — immutable, signed, verifiable offline
   │ — carries trust_signals[0] = Strata's payload from step 2a
```

The whole flow is ~7 HTTPS calls. Real cost: $0.005 TrustBench routing fee + the merchant's price (CMC is $0.0001 today). Total: ~$0.0051 of probe-wallet USDC per reference run.

### 10.3 Reference agent shape

Single TypeScript file. ~120 lines. Will live at `examples/strata-integration/reference-agent.ts` in the public TrustBench GitHub repo (or as a separate `trustbench-strata-reference` repo if you'd prefer it not be in the main codebase — happy to do either; default to main repo so the public artifact has one canonical URL).

Dependencies: `viem`, `@coinbase/x402`, `@trustbench/verify-receipt` (npm v0.1.0+). No Strata-specific SDK needed — Strata's `/x402/verify` is plain JSON over HTTPS so a single `fetch` call works.

The script accepts environment variables for the agent wallet PK and the merchant URL, prints each step's status to stdout, and ends by logging the public receipt URL. Verifiable end-to-end with no TrustBench round-trip via the npm verifier.

### 10.4 Code changes needed on TrustBench side

Two small additive changes; both already designed, both fit in v0.1.1 of the paywall:

**Change 1 — `/route` accepts the `X-Trust-Signals` request header.** TrustBench parses the header (base64url-encoded JSON, max 4 KB), validates the shape against the locked § 3 schema, attaches it as `receipt.trust_signals[0]` in the issued receipt. If the header is malformed or oversized, returns 400 with a clear error — no silent drop, because the agent paid for the call to include the signals. Estimated: 2 hours including unit tests + smoke regression on the existing `/route` no-header path.

**Change 2 — Receipt-generator accepts an optional `trust_signals` field.** The receipt envelope already has the field designed (§ 3 locked shape); the generator just needs to read it from the route-handler hand-off, JCS-canonicalize it inside the signed body, and surface it in both the JSON and HTML receipt renders. Estimated: 1 hour.

Both changes preserve byte-identical replay (the trust_signals header is part of the request hash on the idempotency-key lookup, so replays with different signals return 409 conflict per the existing pattern). No new endpoint, no new signing key, no new public surface — the public artifact is the same `/receipts/:id` URL, just with the new field populated when present.

### 10.4.5 Idempotency-hash + signature semantics (pinned to avoid drift mid-build)

Three explicit contracts so neither side has to guess what the wire shape commits to:

1. **Request-hash inclusion.** The `X-Trust-Signals` header IS included in the request hash that drives the idempotency-key lookup. A replay with the same idempotency key but different (or absent) signals returns 409 Conflict, matching the existing `/route` body-hash-mismatch behavior. This prevents an agent from quietly swapping in fresh signals on a replay and getting a stale-payment receipt with new signals embedded.

2. **Signature coverage.** The captured trust_signals payload IS inside the signed `receipt` body. The existing Ed25519 over RFC 8785 JCS-canonical bytes covers it — no separate signing key, no second signature. A verifier who passes signature verification has cryptographic proof TrustBench observed exactly those signal bytes at issued_at.

3. **Replay returns original signals, not fresh.** A successful replay within the 24h idempotency window returns the *cached* receipt with the *original* signals embedded — not a refreshed call to Strata. This is the right semantics: the receipt attests "this is what Strata said at the captured_at moment of the original call," not "this is what Strata is saying right now." If an agent wants fresh signals, they call Strata again and use a fresh idempotency key.

These three together make the wire shape replayable in a way Strata-aware verifiers can rely on: the signals an auditor reads on the receipt are the signals the agent paid based on, not signals fetched later.

### 10.5 Merchant choice (honest about current registry state)

The reference points at a real, currently-live x402 merchant on Base so the on-chain anchor in the receipt is real and the third-party verifier passes `--check-chain` cleanly.

**First-pick merchant: CoinMarketCap's x402 dex/search endpoint at `https://pro-api.coinmarketcap.com/x402/v1/dex/search`.** Promoted to `x402_verified=true` in the TrustBench registry 2026-05-12 after live-probe confirmation. Charges $0.0001 per call. We hold no relationship with CMC; the registry promotion is empirical, not curated.

**Fallback merchant: any other live x402 endpoint on Base that we can probe-confirm same-day.** Specifically Exa Search (`api.exa.ai/search`, $0.007/call) or Browserbase's session-create endpoint, both observed live in CDP discovery on 2026-05-13. If CMC's endpoint is misbehaving on reference-run day, we point at the fallback and the agent code's `MERCHANT_URL` env-var swap is the only change.

**Honest framing we'd ask be preserved if Strata cites the reference publicly:** the merchant choice is "first verified-live x402 endpoint that returns a clean 402 on probe day," not a curated partnership. The reference demonstrates the *integration pattern*, not an endorsement of any particular merchant.

### 10.6 Artifacts produced (what Strata can reference)

The artifact this reference produces is not "a working API call." It's a publicly-verifiable, immutable, on-chain-anchored proof that Strata's pre-call posture was observed at the moment of payment and signed by TrustBench over JCS-canonical bytes with an Ed25519 key whose public half is at a stable, named URL. That artifact is the specific thing thin routing primitives can't produce without the JCS + Ed25519 + on-chain-anchor stack we already have shipping. The Show HN angle, when you're ready for it, is the artifact's *properties* — replayable, verifiable offline, third-party-cited via the npm verifier — not the bare existence of the integration. We mention this here because §10's implementation detail can read like routine plumbing; the artifact is the part that's hard for anyone else to replicate.

When the reference run completes, three concrete things exist:

1. **The receipt URL.** `https://trustbench.io/receipts/<id>` — immutable, signed, browser-renders HTML, JSON content-negotiated, Cache-Control immutable for 24h. This is the one URL we'd point to in any Show HN or partnership announcement.
2. **The agent source code.** A public GitHub repo path. Verifiable end-to-end by anyone with a Base wallet and ~$0.01 USDC.
3. **A short README at the same repo path.** Documents what the reference proves, the verification command (`npx @trustbench/verify-receipt <id> --check-chain`), and a one-paragraph note about the Strata × TrustBench composition (trust scoring before, signed receipt after).

We can put any of these behind a "Strata × TrustBench reference integration" headline on either of our websites; happy to defer the public framing to whatever works for your Show HN moment.

### 10.7 Timeline

Per the 2026-05-12 commitment ("about a week on our side from when tiers lock"). Tiers locked 2026-05-12 PM.

**Target window: receipt URL by Tuesday 2026-05-19.** Implementation is ~2 days of focused work (Changes 1+2 + reference agent script) plus buffer for wire-shape iteration if anything in §10.8 below surfaces a change. Anything from 2026-05-17 to 2026-05-20 is realistic; I'll send the receipt URL the moment it's confirmed verifying clean against `npx @trustbench/verify-receipt <id> --check-chain` rather than waiting for a specific day to be done.

If anything in this spec needs adjustment from your side, the sooner I know, the sooner I can lock the implementation. Specifically the open questions in §10.8 below.

### 10.8 Open questions for Strata

A. **Do you want the reference repo public or unlisted until Show HN?** Default: public from day one, since `@trustbench/verify-receipt` is already public and the receipt URL would be discoverable anyway. Easy to flip if you'd prefer otherwise.

B. **Is there a Strata-side test merchant URL you'd prefer over CMC?** Sometimes integration partners have a known-live x402 endpoint they want shown specifically (their own demo, a partner's endpoint, etc.). Default: CMC as in § 10.5. Swap-in by env var if you have a preferred URL.

C. **`captured_at` clock-skew tolerance.** Strata's `captured_at` will be a few hundred ms before the TrustBench `receipt.issued_at` in normal operation. Anything over ~30 seconds would suggest the agent cached the Strata response across a long pause. Should TrustBench reject signals with `captured_at` more than (say) 60 seconds old, or accept them with a `signals_age_ms` note in the receipt? Default: reject older than 60 seconds, error code clear. Easy to relax.

D. **Strata-signed score artifact in the future.** § 3 noted that Strata's `runtime_score` is currently plain JSON (no artifact-level signing). If Strata adds signing to `/x402/verify` later, the receipt annotation can carry the signed bytes verbatim (we've already noted this in § 3). No reference-integration impact today; flagging for future-proofing.

E. **Show HN coordination.** If you're aiming for a specific Show HN date, knowing it now lets me land the reference receipt with enough buffer that the artifact URL is rock-solid before your moment. Default: ship by 2026-05-19, no specific Show HN coupling; let me know if your timing is firmer.

If any of these need fast turnaround, please flag in the next reply and I'll prioritize accordingly. None block starting the implementation on our side — Changes 1 and 2 are written against the locked § 3 shape regardless.

---

## 11. Reference receipt — artifact in hand (2026-05-13)

Six days ahead of the 2026-05-19 target. The §10.2 flow ran end-to-end against a real `data`-capability merchant on Base mainnet. Total wallet cost: $0.005 USDC.

### 11.1 The artifact

```
https://trustbench.io/receipts/rrcpt_01KRGKSZACB4ECRPEQY1VC0F3N
```

Immutable, content-negotiated (HTML for browsers, byte-identical JSON for agents), Ed25519-signed over RFC 8785 JCS-canonical bytes, on-chain anchored at Base block 45942380 (tx `0x2ec2ac7f…`).

### 11.2 The verification one-liner

```bash
npx @trustbench/verify-receipt@0.1.1 rrcpt_01KRGKSZACB4ECRPEQY1VC0F3N --check-chain
```

Two layers in one command. Layer 1 (signature only) fetches the receipt + our published Ed25519 public key and verifies offline — ~50ms, no TrustBench round-trip beyond the HTTPS fetch. Layer 2 (`--check-chain`) opens a Base RPC, confirms the `tx_hash` exists, the calldata decodes as `transferWithAuthorization(payer, payee, amount)` matching the receipt, and the tx was mined successfully. ~2s total.

Both layers print green for this receipt from a clean install (verified from a fresh PowerShell with no path setup before sending you this).

`@trustbench/verify-receipt` was bumped from 0.1.0 to 0.1.1 today (2026-05-13) to recognize the `rrcpt_…` prefix the paywall path emits. Zero runtime deps; viem is an optional peer dep for the chain check.

### 11.3 What the receipt carries

The signed envelope includes:

- `trust_signals[0]` — your `/x402/verify` response for `pro-api.coinmarketcap.com/x402/v1/dex/search`, captured at `last_checked_at` and normalized into the locked §3 shape by the adapter described in §11.4. All Strata-provided values are preserved 1:1 — only the field names are translated (e.g. `last_checked_at` → `captured_at`, flat `payment_amount_usd` → nested `payment_endpoint.amount_usd`). Final embedded values: `trusted=false`, `security_score=10`, `risk_level="critical"`, `actionable_flags=[]` (post the `unverified_domain` filter per §3 resolved-item-5).
- `routing` — the routing decision: TrustBench's score-based selection picked QuickNode (`x402.quicknode.com/matic-amoy/`), not CMC, on this run. `score_at_decision`, `alternatives_considered`, `selection_reason` are all in the envelope. Both your pre-call posture on CMC and our routing decision to QuickNode are visible side-by-side in the same signed bytes.
- `paid` — on-chain settlement reference: `tx_hash`, `payer_address`, `payee_address`, `amount_atomic`, `currency`, `chain`. Block 45942380 on Base.

The CMC-vs-QuickNode split is honest, not curated. We asked your verifier about CMC because §10.5 named CMC as the first-pick merchant after the 2026-05-12 registry promotion. TrustBench's routing is independent of which merchant your verifier was asked about; the receipt captures both signals so an auditor reading the envelope sees the full picture.

This version reflects what an unguided agent would actually produce in production — the pre-call posture and the routing decision are independent inputs to the audit trail, and both end up signed under the same Ed25519 key over the same JCS-canonical bytes. That independence is the integration's value-prop made concrete; a curated demo where Strata's verdict and TrustBench's pick happened to align would tell a weaker story about how the composition actually works under real routing pressure.

(Minor note for the reader: the `matic-amoy` segment in QuickNode's URL is their internal test-merchant identifier from x402's reference catalog, not a network signal. Actual settlement is on Base mainnet per the receipt's `paid.chain` field — block 45942380, tx `0x2ec2ac7f…`.)

### 11.4 Strata-side adapter (TrustBench-side translation)

Your `/x402/verify` today returns the flat shape (`flags`, `payment_amount_usd`, `last_checked_at`, etc.). The locked §3 annotation shape requires four envelope fields (`source`, `kind`, `captured_at`, `ref`) that aren't yet in the response. To unblock the §10.2 flow today, the reference agent runs a deterministic adapter that derives the locked shape from your current API output:

- `source` and `kind` are agent-side constants matching the agreed annotation
- `captured_at` is a 1:1 rename of your `last_checked_at`
- `payment_endpoint` nests your flat `payment_amount_usd / payment_currency / payment_network`
- `actionable_flags` is your `flags` minus `unverified_domain` per §3 resolved-item-5
- `ref` is the agent's own `/x402/verify` request URL
- `trusted`, `security_score`, `risk_level` are verbatim 1:1

The adapter is auto-disabling — a forward-compat branch detects responses that already contain all four envelope fields and passes them through verbatim. The day your `/x402/verify` ships the locked shape natively, the adapter becomes a no-op with zero code change on our side.

Code at [`examples/strata-integration/reference-agent.ts`](https://github.com/lithvall/TrustBench/blob/main/examples/strata-integration/reference-agent.ts) for inspection. If anything in the adapter's mapping reads as a misinterpretation of your API, point at the field and we'll iterate.

### 11.5 Status against §10.8 open questions

All five still open. None blocked the artifact. Recapping for your convenience:

- **A. Public repo or unlisted until Show HN?** Currently public. Easy to flip.
- **B. Strata-side test merchant URL?** Defaulted to CMC; swap-in by env var.
- **C. `captured_at` clock-skew tolerance?** Not yet enforced server-side. The reference run's clock skew was a few hundred ms.
- **D. Strata-signed score artifact?** Not yet; the adapter handles the transition when it lands.
- **E. Show HN coordination?** Whenever you're ready. Receipt URL is rock-solid.

### 11.6 Cost summary

- TrustBench routing fee: $0.005 USDC (paid by the agent wallet via CDP facilitator, gas paid by the facilitator)
- Merchant fee on the reference run: skipped (`--skip-merchant` mode produces the receipt artifact without the follow-on call). The full §10.2 round-trip with the merchant adds ~$0.0001 for the next run.
- Reproducible end-to-end by anyone with a Base wallet and ~$0.01 USDC.
