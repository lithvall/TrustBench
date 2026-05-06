# TrustBench Receipt Spec v1.0.0 — DRAFT for @InfopunksHQ review

**Status:** DRAFT — pre-implementation. Designed against the proof-trail spec you (InfopunksHQ) defined in the X thread on 2026-04-30: *"signed receipt + call metadata + settlement reference + replayable audit path"*, with *"raw signed receipt + tx hash = base proof, queryable audit path = agent-native proof."*

**Goal of this draft:** lock the wire format with you before TrustBench writes the receipt generator, so the schema works for downstream trust-layer consumption (your repo and any future consumer) on day one.

---

## Wire format

A receipt is a JSON object with two top-level fields:

- `receipt` — every signed field, grouped by purpose (call / settlement / pricing / routing / audit).
- `signature` — a detached Ed25519 signature over the JCS-canonical bytes (RFC 8785) of the `receipt` object.

TrustBench's Ed25519 public key is published at `https://trustbench.io/.well-known/trustbench-pubkey`. A reference verifier ships in `scripts/verify-receipt.js`.

---

## Example

```json
{
  "receipt": {
    "version": "1.0.0",
    "receipt_id": "rcpt_01HV3K8M5C9X2ZBFYR4QWP8ND1",
    "issued_at": "2026-04-30T14:22:31.118Z",
    "issuer": "trustbench.io",
    "call": {
      "agent_id": "agt_x9k2",
      "capability": "search",
      "idempotency_key": "01HV3K8M5C9X2ZBFYR4QWP8ND0",
      "provider_id": "brave-search",
      "provider_url": "https://api.search.brave.com/res/v1/web/search",
      "request_hash": "sha256:8f4c2a3d...",
      "response_hash": "sha256:1d9b7e4f...",
      "request_size_bytes": 218,
      "response_size_bytes": 14492,
      "latency_ms": 287
    },
    "settlement": {
      "chain": "base",
      "tx_hash": "0x9e3f2c7a...",
      "block_number": 12345678,
      "payer_address": "0xAgEnT...",
      "payee_address": "0xPrOvIdEr...",
      "amount_atomic": "10000",
      "currency": "USDC",
      "decimals": 6,
      "settled_at": "2026-04-30T14:22:30.842Z"
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
      "audit_url": "https://trustbench.io/receipts/rcpt_01HV3K8M5C9X2ZBFYR4QWP8ND1"
    }
  },
  "signature": {
    "alg": "ed25519",
    "public_key_url": "https://trustbench.io/.well-known/trustbench-pubkey",
    "key_id": "trustbench-2026-04",
    "value": "base64url:..."
  }
}
```

---

## Field-by-field

### `receipt.version`
SemVer of the receipt schema. Bumped on breaking changes; consumers gate on the major.

### `receipt.receipt_id`
TrustBench-assigned ULID. Also the path component in `/receipts/:id`.

### `receipt.issued_at`
ISO 8601 UTC. Time TrustBench finalized and signed the receipt (after settlement is confirmed).

### `receipt.issuer`
DNS name of the issuing TrustBench instance. Lets multiple deployments coexist (staging, prod).

### `receipt.call.agent_id`
Opaque, TrustBench-assigned agent identifier. Stable across calls so consumers can group by agent without TrustBench leaking PII.

### `receipt.call.capability`
Routed capability — e.g. `search`, `summarize`. Stable, lowercase, snake_case.

### `receipt.call.idempotency_key`
Echo of the client-supplied idempotency key. Lets you verify retry behavior end-to-end (same key → same receipt id).

### `receipt.call.provider_id` / `provider_url`
Which upstream provider TrustBench routed to. URL included so the receipt is self-contained.

### `receipt.call.request_hash` / `response_hash`
sha256 of the canonical bytes of the request/response payloads. Content-addressed so a holder can re-hash their copy and verify match.

### `receipt.call.request_size_bytes` / `response_size_bytes` / `latency_ms`
Coarse observability fields. Cheap to include, useful for accounting and SLA checks.

### `receipt.settlement.*`
On-chain settlement reference — your "base proof". Amounts are atomic-unit strings (not numbers — JS number precision can't be trusted), with `currency`/`decimals` for display.

### `receipt.pricing.*`
Decomposes total paid into `provider_price_atomic` + `trustbench_fee_atomic`. `fee_model` is a discriminator (`flat_per_tx`, future: `subscription_credit`) so we can extend without breaking the schema.

### `receipt.routing.*`
Minimal rationale — score at decision time, count of alternatives considered (kept as a count, not a list, so we don't enumerate the provider pool to every receipt holder), and a coarse `selection_reason` enum.

### `receipt.audit.audit_url`
Your "agent-native proof" endpoint. `GET` returns the same receipt object, fresh from the issuer.

### `signature.alg` / `key_id` / `public_key_url` / `value`
Ed25519 signature over JCS-canonical bytes of `receipt`. `key_id` enables rotation; `public_key_url` lets verifiers fetch the key without out-of-band setup.

---

## Canonicalization

All hashing and signing uses **RFC 8785 JSON Canonicalization Scheme (JCS)**: UTF-8, sorted keys at every depth, no insignificant whitespace, numbers in shortest IEEE 754 representation. Strings escape per RFC 8259.

The signature is computed over the canonical bytes of `receipt`. The `signature` object is *not* part of the signed content (detached signature pattern).

---

## Open questions for InfopunksHQ

1. **Settlement detail.** `tx_hash` + `chain` + `settled_at` plus optional `block_number` (added 2026-05-04 via closeout #3) enables independent on-chain verification. Need confirmation count / gas paid added too, or is current shape enough for your replay needs?
2. **Routing transparency.** `alternatives_considered` as a count keeps our provider pool internal. Does that meet your audit needs, or do you need an opaque commitment to the alternatives (e.g. a Merkle root) so we can prove without revealing?
3. **Payload preservation.** `request_hash` / `response_hash` over canonicalized JSON keeps receipts small. Acceptable, or do you need an optional `payload_blob_url` for cases where consumers want to re-fetch the raw payload?
4. **Audit endpoint shape.** `audit_url` is a single absolute URL. Should we add an `audit_path` (relative) so trust layers can rehost behind their own domain?
5. **Agent identity.** `agent_id` is a TrustBench-assigned opaque string. Do you want a second optional field for an agent-supplied identifier (DID, ENS, ERC-8004) so the receipt can carry both views?
6. **Anything else** that would make this consumable by your trust layer without adapter code on your side?

---

## What's intentionally *not* here

- The list of providers we considered (only the count).
- Per-provider scoring inputs beyond the chosen provider's `score_at_decision`.
- The pricing tier structure beyond the per-receipt `fee_model`.
- Agent PII or wallet metadata beyond the on-chain `payer_address`.

These stay internal because they're routing/business surface, not proof-of-call surface. Happy to discuss if any of them block your use case.
