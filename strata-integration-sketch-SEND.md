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

- `actionable_flags` vs. `flags` field name (small, raised in reply).
- Move to §8 step 3 (tiers) pending Strata's response.

---

## 8. Concrete next steps

If the shape above looks right to you:

1. **You send the `/x402/verify` schema** at your convenience.
2. **I take a first cut at the trust-signal annotation field names** in the receipt envelope, matching whatever your schema uses where it makes sense.
3. **We agree on tiers** — either the starting points in § 6 or whatever revisions Strata's economics suggest.
4. **A reference integration ships** — probably a single test agent calling Strata's `/x402/verify`, then routing through TrustBench's `/route`, with a real signed receipt that includes the `trust_signals` annotation pointing back at Strata.
5. **Public artifact** — the resulting receipt URL is shareable (immutable, cache-friendly) and can be referenced by either of us as evidence the integration works end-to-end.

Realistic timeline on our side: ~1 week from your schema landing to a working reference receipt. Shorter if your `/x402/verify` is already plug-and-play; longer if we want to build out the full bidirectional data feed before declaring done.

If something in here feels off or you'd want a different shape, push back and we'll iterate.

— Johan
