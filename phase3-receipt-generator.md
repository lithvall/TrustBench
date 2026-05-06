# Phase 3 — Receipt Generator

**Status:** Design draft. Implementation pending (Claude implements per workflow rule — receipts are signing surface, sole-Claude-author).
**Decision date:** 2026-05-01

## Why this exists

`receipt-spec-v1.md` defines the receipt *wire format*. `phase3-schema.sql` defines the receipt *storage row*. `phase3-x402-construction.md` describes *when* a receipt is emitted (after a successful settle in step 2). This memo is the missing piece: the *generator function* that takes settlement inputs, builds the canonical receipt object, signs it with Ed25519, persists it, and returns the signed envelope.

Three things make this a Claude-implements piece per the workflow rule:

1. **JCS canonicalization** — the bytes signed and the bytes a third-party verifier hashes must agree exactly. Off-by-one is a silent verifier failure.
2. **Ed25519 signing** — TrustBench's public reputation primitive. A bug here means scorecards everywhere validate but receipts don't, or vice versa.
3. **The atomic "sign first, persist second" ordering** — the receipt's `receipt_id` and `issued_at` are part of the signed bytes, so they have to be generated before signing; the DB write is downstream of that.

## Contract

```ts
type IssueReceiptInput = {
  // Provided by settleHandler (phase3-x402-construction.md):
  agent_id: string;                    // UUID
  capability: string;                  // 'search' | 'inference' | 'data'
  idempotency_key: string;             // echo of the Step 1 client-supplied key

  // Routing context (from selectProvider):
  provider_id: string;                 // url-as-key
  provider_url: string;
  score_at_decision: number;
  alternatives_considered: number;     // 0..5
  selection_reason: 'top_score' | 'sole_provider';

  // Request/response observation (caller computes):
  request_body: unknown;               // parsed JSON, used to compute request_hash
  response_body: unknown;              // parsed JSON, used to compute response_hash
  request_size_bytes: number;
  response_size_bytes: number;
  latency_ms: number;

  // Settlement (from x402 construction):
  chain: 'base';
  tx_hash: string;                     // 0x + 64 hex
  payer_address: string;               // 0x + 40 hex
  payee_address: string;               // 0x + 40 hex
  amount_atomic: string;               // string of digits (e.g. "10000")
  currency: 'USDC';
  decimals: 6;
  settled_at: Date;                    // when the provider confirmed

  // Pricing (Phase 3 fee model is flat_per_tx, value TBD):
  provider_price_atomic: string;
  trustbench_fee_atomic: string;
  total_paid_atomic: string;
  fee_model: 'flat_per_tx';
};

type IssueReceiptResult =
  | { ok: true; receipt: SignedReceipt; receipt_id: string }
  | { ok: false; reason: 'signing_unavailable' | 'persist_failed';
      detail: string; receipt_id?: never };

type SignedReceipt = { receipt: ReceiptObject; signature: SignatureObject };
//   shape per receipt-spec-v1.md
```

The caller (`settleHandler`) treats `ok: false` as a 502/503 response and does NOT persist anything in `idempotency_keys` as `completed`. The agent retries; the next settle attempt re-computes everything from the quote and tries again.

## Wire format and DB row — two views of one object

Per `phase3-schema.sql`, the `receipts` table stores both:

- **Denormalized columns** (fast queries: spend-cap aggregation, audit by tx_hash, capability filter). Populated from the receipt object's known fields.
- **`receipt_json` JSONB** — the full canonical signed envelope, byte-for-byte what was signed (plus the signature). This is what `/receipts/:id` returns to verifiers.

**The wire envelope is the source of truth.** Denormalized columns are projections of `receipt_json`. If anyone ever has to debug a verification mismatch, they read `receipt_json` first; the columns are convenience indexes, not authority.

## Field-by-field generation rules

Per `receipt-spec-v1.md`, the receipt object has five sub-objects. The generator computes each in order:

### `receipt.version` / `issuer`

- `version`: `"1.0.0"` — hardcoded for Phase 3. Bumped only on a wire-breaking change, with a `key_id` rotation in tandem so verifiers can tell.
- `issuer`: read from env `TRUSTBENCH_ISSUER_HOST`, default `"trustbench.io"`. Different per deployment (staging vs prod). MUST agree with the host serving `/.well-known/trustbench-pubkey` so the public-key URL the receipt points at is reachable.

### `receipt.receipt_id`

`"rcpt_" + ulid()`. ULID lengths to 26 chars, total `rcpt_` + 26 = 31 chars. Per `phase3-handoff.md` locked decision.

### `receipt.issued_at`

`new Date().toISOString()` — UTC ISO 8601 with millisecond precision (`2026-04-30T14:22:31.118Z`). Set immediately before signing.

### `receipt.call.*`

Mostly pass-through from the input. Two computed fields:

- `request_hash`: `"sha256:" + sha256Hex(jcs(request_body))`. The `sha256:` prefix marks the algorithm so future receipts can use BLAKE3 / etc. without ambiguity.
- `response_hash`: same pattern for `response_body`.

**Important:** `call.request_hash` is **not** the same as the idempotency layer's request_hash. The idempotency hash covers `{body, query, path}` for replay protection; the receipt hash covers the request *body alone* for content addressing. Holders of the receipt can re-hash their own copy of the body to verify the receipt refers to *their* call. Document this in `receipt-spec-v1.md` if/when InfopunksHQ asks.

### `receipt.settlement.*`

Direct pass-through from input. `settled_at` formatted as ISO 8601 UTC.

### `receipt.pricing.*`

Direct pass-through. Sum invariant: `total_paid_atomic == provider_price_atomic + trustbench_fee_atomic` (BigInt math). Generator asserts this and refuses to sign if violated — protects against caller bugs.

### `receipt.routing.*`

Direct pass-through.

### `receipt.audit.audit_url`

`<TRUSTBENCH_BASE_URL>/receipts/<receipt_id>` where `TRUSTBENCH_BASE_URL` is read from env, default `"https://trustbench.io"`. Phase 4 may add an `audit_path` (relative) per `receipt-spec-v1.md` open question 4 if InfopunksHQ requests it.

### `signature.*`

Computed last, after `receipt.*` is fully built and JCS-canonicalized:

- `alg`: `"ed25519"`
- `value`: base64url-encoded Ed25519 signature over `Buffer.from(jcsCanonical, 'utf8')`
- `key_id`: read from env `TRUSTBENCH_KEY_ID`, default `"trustbench-2026"`. Tracks rotation; bump on key swap.
- `public_key_url`: `<TRUSTBENCH_BASE_URL>/.well-known/trustbench-pubkey`

## Signing pipeline

```
input → build receipt object → JCS canonicalize → sha256 (for logs only) →
ed25519.sign(canonical) → build envelope → INSERT receipts → return envelope
```

**Signing happens before persistence.** If signing fails, no row is written and no receipt is emitted. If persistence fails after signing, the signed bytes are discarded and the caller treats it as a generator failure. We never persist a row without a valid signature; we never return a signature without a persisted row.

The order specifically:

1. Validate input (the BigInt sum invariant, hex shapes, atomic-unit format).
2. Generate `receipt_id` and `issued_at`.
3. Compute `request_hash` / `response_hash`.
4. Build the `receipt` object.
5. JCS-canonicalize → utf-8 bytes.
6. Ed25519 sign.
7. Build the full envelope `{ receipt, signature }`.
8. INSERT row into `receipts` (denormalized columns + `receipt_json` = canonical envelope).
9. Return the envelope.

If step 6 fails (Ed25519 key not configured): return `{ ok: false, reason: 'signing_unavailable' }`. Do not fall back to HMAC. **Receipts are the cryptographic spine of the audit story; HMAC is server-internal-only and would silently produce receipts that can't be verified.** `scorer.ts` falls back to HMAC for backward-compat with the legacy scorecard signing flow; the receipt generator does not.

If step 8 fails (PG error, FK violation, etc.): return `{ ok: false, reason: 'persist_failed', detail: <message> }`. The caller treats this as a 502/503 and does not write anything to `idempotency_keys` as terminal — the settle is treated as failed.

## Keypair: reuse `scorer.ts`

The Ed25519 keypair already loaded by `scorer.ts` (`TRUSTBENCH_SIGNING_PRIVATE_KEY` + `TRUSTBENCH_SIGNING_PUBLIC_KEY` env vars) is the same keypair used here. **One key, two signers (scorecards + receipts).** This is intentional — third-party verifiers fetch one public key from `/.well-known/trustbench-pubkey` and verify both signature flavors.

Implementation: extract a small `signWithEd25519(canonicalBytes: Buffer): { value: string, key_id: string } | null` function from `scorer.ts` into a shared helper (or expose as a named export from `scorer.ts` directly). The receipt generator imports it; `signScorecard` continues to use it internally for backward compatibility.

The HMAC fallback path in `scorer.ts` stays intact for scorecards but is **not** wired into the receipt generator. Two short paragraphs in `methodology` page (already shipped) plus a refusal-to-issue at receipt time keep the property: every receipt that exists is Ed25519-signed.

## Error response shapes (passed up to the caller)

| reason | When | Caller action |
|---|---|---|
| `signing_unavailable` | `loadKeys()` returns `'hmac'` (no Ed25519 key) | 503 to agent; surface boot-time warning loudly |
| `persist_failed` | PG insert returns error (FK violation, etc.) | 502 to agent; log with full PG message; settle is not marked completed in idempotency layer |
| (no error case for "invariant violation") | sum mismatch, malformed hex, etc. | These are caller bugs. Generator throws (5xx) rather than returning `ok: false` — caller should never see these in production |

## Idempotency interaction

The receipt generator is **not** idempotent on its own. Two calls with identical inputs return two different receipts (different `receipt_id`, different `issued_at`, different signature bytes). That's fine because the caller (the `/route/settle` handler) is itself idempotent at the `route_id` level — only one call to `issueReceipt` is made per successful settle. Retries replay through the settle-lock cache and never reach the generator.

If a future caller (e.g. a Phase 4 backfill script) needs idempotent receipt issuance, that's a separate concern handled at the caller's layer.

## ID format checks

- `receipt_id`: must match `/^rcpt_[0-9A-HJKMNP-TV-Z]{26}$/`. Generator emits this format; verifier (and `/receipts/:id` handler) validates it.
- The `agent_id` field in the JSON is the UUID from the agents table (no prefixing). It's an opaque identifier to consumers; UUID format is fine.

## Pseudocode

```ts
// src/receipt-generator.ts

import { createClient } from '@supabase/supabase-js';
import { ulid } from 'ulid';
import { createHash } from 'crypto';
import { signWithEd25519, getPublicKeyUrl } from './scorer.js';  // see "Keypair" §
import { jcsCanonicalize } from './idempotency.js';              // re-export, single source

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const ISSUER = process.env.TRUSTBENCH_ISSUER_HOST || 'trustbench.io';
const BASE_URL = process.env.TRUSTBENCH_BASE_URL || `https://${ISSUER}`;
const KEY_ID = process.env.TRUSTBENCH_KEY_ID || 'trustbench-2026';
const RECEIPT_VERSION = '1.0.0';

const RX_HEX_TX = /^0x[0-9a-fA-F]{64}$/;
const RX_HEX_ADDR = /^0x[0-9a-fA-F]{40}$/;
const RX_ATOMIC = /^\d+$/;

export async function issueReceipt(input: IssueReceiptInput): Promise<IssueReceiptResult> {
  // ---- 1. Validate inputs ------------------------------------------------
  if (!RX_HEX_TX.test(input.tx_hash)) throw new Error('issueReceipt: malformed tx_hash');
  if (!RX_HEX_ADDR.test(input.payer_address)) throw new Error('issueReceipt: malformed payer_address');
  if (!RX_HEX_ADDR.test(input.payee_address)) throw new Error('issueReceipt: malformed payee_address');
  for (const f of ['amount_atomic', 'provider_price_atomic', 'trustbench_fee_atomic', 'total_paid_atomic'] as const) {
    if (!RX_ATOMIC.test(input[f])) throw new Error(`issueReceipt: malformed ${f}`);
  }
  const sum = BigInt(input.provider_price_atomic) + BigInt(input.trustbench_fee_atomic);
  if (sum !== BigInt(input.total_paid_atomic)) {
    throw new Error('issueReceipt: total_paid_atomic != provider_price + trustbench_fee');
  }

  // ---- 2. Generate id + timestamps --------------------------------------
  const receipt_id = 'rcpt_' + ulid();
  const issued_at = new Date().toISOString();

  // ---- 3. Content-address request + response ---------------------------
  const request_hash = 'sha256:' + sha256Hex(jcsCanonicalize(input.request_body));
  const response_hash = 'sha256:' + sha256Hex(jcsCanonicalize(input.response_body));

  // ---- 4. Build receipt object -----------------------------------------
  const receiptObject = {
    version: RECEIPT_VERSION,
    receipt_id,
    issued_at,
    issuer: ISSUER,
    call: {
      agent_id: input.agent_id,
      capability: input.capability,
      idempotency_key: input.idempotency_key,
      provider_id: input.provider_id,
      provider_url: input.provider_url,
      request_hash,
      response_hash,
      request_size_bytes: input.request_size_bytes,
      response_size_bytes: input.response_size_bytes,
      latency_ms: input.latency_ms,
    },
    settlement: {
      chain: input.chain,
      tx_hash: input.tx_hash,
      payer_address: input.payer_address,
      payee_address: input.payee_address,
      amount_atomic: input.amount_atomic,
      currency: input.currency,
      decimals: input.decimals,
      settled_at: input.settled_at.toISOString(),
    },
    pricing: {
      provider_price_atomic: input.provider_price_atomic,
      trustbench_fee_atomic: input.trustbench_fee_atomic,
      total_paid_atomic: input.total_paid_atomic,
      fee_model: input.fee_model,
    },
    routing: {
      score_at_decision: input.score_at_decision,
      alternatives_considered: input.alternatives_considered,
      selection_reason: input.selection_reason,
    },
    audit: {
      audit_url: `${BASE_URL}/receipts/${receipt_id}`,
    },
  };

  // ---- 5. JCS canonicalize and sign ------------------------------------
  const canonical = jcsCanonicalize(receiptObject);
  const signed = signWithEd25519(Buffer.from(canonical, 'utf8'));
  if (!signed) {
    return {
      ok: false,
      reason: 'signing_unavailable',
      detail: 'Ed25519 keypair not configured; refusing to issue receipt'
    };
  }

  const envelope = {
    receipt: receiptObject,
    signature: {
      alg: 'ed25519' as const,
      value: signed.value,        // base64url
      key_id: KEY_ID,
      public_key_url: `${BASE_URL}/.well-known/trustbench-pubkey`,
    },
  };

  // ---- 6. Persist (denormalized columns + canonical envelope) ----------
  const { error: insertErr } = await supabase.from('receipts').insert({
    id: receipt_id,
    agent_id: input.agent_id,
    capability: input.capability,
    provider_id: input.provider_id,
    idempotency_key: input.idempotency_key,
    request_hash,
    response_hash,
    chain: input.chain,
    tx_hash: input.tx_hash,
    payer_address: input.payer_address,
    payee_address: input.payee_address,
    amount_atomic: input.amount_atomic,
    currency: input.currency,
    decimals: input.decimals,
    settled_at: input.settled_at.toISOString(),
    provider_price_atomic: input.provider_price_atomic,
    trustbench_fee_atomic: input.trustbench_fee_atomic,
    total_paid_atomic: input.total_paid_atomic,
    fee_model: input.fee_model,
    score_at_decision: input.score_at_decision,
    alternatives_considered: input.alternatives_considered,
    selection_reason: input.selection_reason,
    signature: signed.value,
    signature_alg: 'ed25519',
    key_id: KEY_ID,
    receipt_json: envelope,
    issued_at,
  });

  if (insertErr) {
    return { ok: false, reason: 'persist_failed', detail: insertErr.message };
  }

  return { ok: true, receipt: envelope, receipt_id };
}

function sha256Hex(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}
```

## Test scenarios

For Claude/Grok-implements (Claude per the workflow rule on signing-touching code):

**Pure unit tests (no DB, no network):**

1. **Happy-path round-trip.** issueReceipt returns `ok: true` with a well-formed envelope. The signature verifies against the public key when the consumer recomputes JCS over `envelope.receipt`.
2. **Stable canonical bytes.** Same input → same canonical bytes → identical signature inputs (NOT identical signatures — receipt_id and issued_at differ, so signatures differ; but the canonicalization function is deterministic given the receipt object).
3. **Sum invariant violation.** Input where `provider_price + trustbench_fee != total_paid` → throws.
4. **Malformed tx_hash / address / atomic.** Each malformed shape → throws.
5. **`request_hash` correctness.** Receipt's `request_hash` matches `"sha256:" + sha256(jcs(request_body))` — verifier can reproduce.
6. **`receipt_id` format.** Always matches `^rcpt_[0-9A-HJKMNP-TV-Z]{26}$`.
7. **No HMAC fallback.** With Ed25519 keys NOT set, `issueReceipt` returns `ok: false` with `reason: 'signing_unavailable'`. Does not produce an HMAC-signed receipt.
8. **JCS stability across object key order.** Two calls with the same logical input but different JS object key order produce identical canonical bytes (because JCS sorts keys at every depth).

**Integration tests (real Supabase):**

9. **Persist round-trip.** issueReceipt → SELECT row by id → reconstruct envelope from `receipt_json` → signature verifies. The DB row's denormalized columns equal the corresponding fields in `receipt_json`.
10. **FK violation.** Pass an `agent_id` that doesn't exist in `agents` → `persist_failed`.
11. **Duplicate receipt_id (cosmically unlikely with ULID).** Pre-insert a row with a fixed id, then call issueReceipt and force the same id (test-only) → `persist_failed`.

**Verifier compatibility tests:**

12. **`scripts/verify-receipt.js` round-trip.** Generated envelope → script → "valid". Signed bytes match the canonical bytes the script computes from `envelope.receipt`.
13. **Tamper detection.** Modify any field in `envelope.receipt` (one byte) → script returns "invalid".

## Locked decisions

1. **Wire format = `receipt-spec-v1.md`.** This memo does not redefine fields; it specs the generator that produces them.
2. **Ed25519 only.** No HMAC fallback in the receipt path. Boot-time misconfiguration → 503 at receipt issuance time, not silent HMAC sigs.
3. **One keypair, two signers.** Scorecards and receipts share the same Ed25519 key (`TRUSTBENCH_SIGNING_PRIVATE_KEY` / `..._PUBLIC_KEY`). One `/.well-known/trustbench-pubkey` URL serves both.
4. **Sign first, persist second.** No row exists without a valid signature; no signature is returned without a persisted row.
5. **`receipt_id` format = `rcpt_<26-char-Crockford-ULID>`.** Per `phase3-handoff.md`.
6. **`call.request_hash` and `call.response_hash` content-address the bodies alone**, not body+path+query. Distinct from the idempotency hash by design.
7. **`sha256:` prefix on hashes** in the wire format. Forward-compatible with future hash algorithms.
8. **Sum invariant enforced at generation.** `total_paid == provider_price + trustbench_fee`. Caller bug → throw, not return.
9. **`key_id` defaults to `"trustbench-2026"`,** overridable via env. Bump on rotation.
10. **No `payload_blob_url`** in Phase 3 (per `receipt-spec-v1.md` open question 3). Hashes only. Phase 4 add if InfopunksHQ or another consumer requests.
11. **`alternatives_considered` is a count, not a list,** reusing the locked decision from `phase3-provider-selection.md`. Routing surface stays internal.

## Out of scope (Phase 4+)

- Receipt batching / Merkle commitment of N receipts under one chain anchor.
- On-chain anchoring of receipts (signed bytes → Base / L2 storage as event).
- Multi-key sets (rotation overlap) — Phase 3 is single-active-key.
- BLAKE3 / SHA-3 hashes (Phase 3 = SHA-256 only; the `sha256:` prefix keeps the door open).
- `payload_blob_url` for raw payload preservation.
- DID-based agent identity in receipts (per `receipt-spec-v1.md` open question 5).
- Webhooks on receipt issuance (e.g. for builders that want notification).
- Per-agent receipt-export formats (CSV, ledger). Phase 4 paid-policy feature.

## Files this spec touches

| Path | Change |
|---|---|
| `src/receipt-generator.ts` | New. `issueReceipt(input)` per pseudocode. ~150 lines including comments. |
| `src/scorer.ts` | Export `signWithEd25519(bytes)` and `getPublicKeyUrl()` so the receipt generator can reuse the keypair without copy-paste. Backward-compatible — existing `signScorecard` continues to work. |
| `src/idempotency.ts` | Export `jcsCanonicalize` so the receipt generator imports the single source of truth. (Already exists internally; just expose.) |
| `scripts/verify-receipt.js` | New. Reference verifier — mirrors `scripts/verify-scorecard.js` but for the receipt envelope. Step 12 of `phase3-handoff.md`. |
| `phase3-handoff.md` | Mark step 8 done. |
| `.env.example` | Add `TRUSTBENCH_ISSUER_HOST` (default `trustbench.io`), `TRUSTBENCH_BASE_URL`, `TRUSTBENCH_KEY_ID`. Step 15 of `phase3-handoff.md`. |

No schema changes. The `receipts` table from `phase3-schema.sql` is sufficient.
