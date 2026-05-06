// src/receipt-generator.ts — Phase 3 receipt issuance.
//
// Full design + locked decisions: phase3-receipt-generator.md.
// Wire format: receipt-spec-v1.md.
//
// Contract: takes settlement inputs, builds the canonical receipt object,
// JCS-canonicalizes, signs with Ed25519, persists to the receipts table,
// returns the signed envelope.
//
// Three load-bearing properties:
//   1. Sign first, persist second. The receipt_id and issued_at are part of
//      the signed bytes, so they have to be generated BEFORE signing. The DB
//      write is downstream. If signing fails, no row is written. If
//      persistence fails after signing, the signed bytes are discarded.
//   2. Ed25519 only — no HMAC fallback. HMAC-signed receipts can't be
//      verified by third parties, which makes them worse than no receipt at
//      all (they look real but fail the audit pitch). Loud failure beats
//      silent invalidity.
//   3. One keypair, two signers. The Ed25519 key loaded by scorer.ts is the
//      same one used here. /.well-known/trustbench-pubkey serves both.

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { ulid } from 'ulid';
import { createHash } from 'crypto';
import { signWithEd25519 } from './scorer.js';
import { jcsCanonicalize } from './idempotency.js';

// Reuse the codebase's standard env var convention (SUPABASE_SECRET_KEY,
// not _SERVICE_ROLE_KEY — see src/auth.ts for context).
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

// Configurable via env so staging vs prod produce receipts that point at the
// right public-key URL. Defaults match the production deployment domain.
const ISSUER = process.env.TRUSTBENCH_ISSUER_HOST || 'trustbench.io';
const BASE_URL = process.env.TRUSTBENCH_BASE_URL || `https://${ISSUER}`;
const KEY_ID = process.env.TRUSTBENCH_KEY_ID || 'trustbench-2026';
const RECEIPT_VERSION = '1.0.0';

// Validation regexes — same shapes as phase3-x402-construction.md.
const RX_HEX_TX = /^0x[0-9a-fA-F]{64}$/;
const RX_HEX_ADDR = /^0x[0-9a-fA-F]{40}$/;
const RX_ATOMIC = /^\d+$/;

// ---------------------------------------------------------------------------
// Public types — matching the receipt-spec-v1.md wire format
// ---------------------------------------------------------------------------

export type IssueReceiptInput = {
  agent_id: string;
  capability: string;
  idempotency_key: string;

  provider_id: string;
  provider_url: string;
  score_at_decision: number;
  alternatives_considered: number;
  selection_reason: 'top_score' | 'sole_provider';

  request_body: unknown;
  response_body: unknown;
  request_size_bytes: number;
  response_size_bytes: number;
  latency_ms: number;

  chain: 'base';
  tx_hash: string;
  // Optional: on-chain block number where tx_hash landed. Sourced from the
  // provider's X-PAYMENT-RESPONSE (`settled_at_block` or `block_number`).
  // When present, `block_number` is included in the canonical receipt body
  // and a third-party verifier can independently check via JSON-RPC. Older
  // receipts (issued before closeout #3) will be null — the column is
  // nullable and the receipt object omits the field rather than emitting
  // `null`, so canonical bytes for pre-#3 receipts are unchanged.
  block_number?: number | null;
  payer_address: string;
  payee_address: string;
  amount_atomic: string;
  currency: 'USDC';
  decimals: 6;
  settled_at: Date;

  provider_price_atomic: string;
  trustbench_fee_atomic: string;
  total_paid_atomic: string;
  fee_model: 'flat_per_tx';
};

export type SignedReceipt = {
  receipt: ReceiptObject;
  signature: SignatureObject;
};

export type ReceiptObject = {
  version: string;
  receipt_id: string;
  issued_at: string;
  issuer: string;
  call: {
    agent_id: string;
    capability: string;
    idempotency_key: string;
    provider_id: string;
    provider_url: string;
    request_hash: string;
    response_hash: string;
    request_size_bytes: number;
    response_size_bytes: number;
    latency_ms: number;
  };
  settlement: {
    chain: string;
    tx_hash: string;
    // Optional. Present iff the provider reported a block number.
    block_number?: number;
    payer_address: string;
    payee_address: string;
    amount_atomic: string;
    currency: string;
    decimals: number;
    settled_at: string;
  };
  pricing: {
    provider_price_atomic: string;
    trustbench_fee_atomic: string;
    total_paid_atomic: string;
    fee_model: string;
  };
  routing: {
    score_at_decision: number;
    alternatives_considered: number;
    selection_reason: string;
  };
  audit: {
    audit_url: string;
  };
};

export type SignatureObject = {
  alg: 'ed25519';
  value: string;             // base64url
  key_id: string;
  public_key_url: string;
};

export type IssueReceiptResult =
  | { ok: true; receipt: SignedReceipt; receipt_id: string }
  | { ok: false; reason: 'signing_unavailable' | 'persist_failed'; detail: string };

// ---------------------------------------------------------------------------
// Generator
// ---------------------------------------------------------------------------

export async function issueReceipt(input: IssueReceiptInput): Promise<IssueReceiptResult> {
  // ---- 1. Validate inputs ------------------------------------------------
  // Caller bugs throw rather than return ok:false. Production should never
  // hit these — they'd indicate a bug upstream of the receipt generator.
  if (!RX_HEX_TX.test(input.tx_hash)) {
    throw new Error(`issueReceipt: malformed tx_hash: ${input.tx_hash}`);
  }
  if (!RX_HEX_ADDR.test(input.payer_address)) {
    throw new Error(`issueReceipt: malformed payer_address: ${input.payer_address}`);
  }
  if (!RX_HEX_ADDR.test(input.payee_address)) {
    throw new Error(`issueReceipt: malformed payee_address: ${input.payee_address}`);
  }
  for (const f of ['amount_atomic', 'provider_price_atomic', 'trustbench_fee_atomic', 'total_paid_atomic'] as const) {
    if (!RX_ATOMIC.test(input[f])) {
      throw new Error(`issueReceipt: malformed ${f}: ${input[f]}`);
    }
  }
  // Sum invariant — prevents silent fee/price drift.
  const sum = BigInt(input.provider_price_atomic) + BigInt(input.trustbench_fee_atomic);
  if (sum !== BigInt(input.total_paid_atomic)) {
    throw new Error(
      `issueReceipt: total_paid_atomic (${input.total_paid_atomic}) != ` +
      `provider_price (${input.provider_price_atomic}) + ` +
      `trustbench_fee (${input.trustbench_fee_atomic})`
    );
  }

  // ---- 2. Generate id + timestamps --------------------------------------
  const receipt_id = 'rcpt_' + ulid();
  const issued_at = new Date().toISOString();

  // ---- 3. Content-address request + response ---------------------------
  // Note: NOT the same as the idempotency request_hash. The receipt hashes
  // the request body alone for content-addressing — a holder can re-hash
  // their own copy of the body and verify the receipt refers to it.
  // Idempotency hashes {body, query, path} for replay protection.
  const request_hash = 'sha256:' + sha256Hex(jcsCanonicalize(input.request_body));
  const response_hash = 'sha256:' + sha256Hex(jcsCanonicalize(input.response_body));

  // ---- 4. Build receipt object -----------------------------------------
  const receiptObject: ReceiptObject = {
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
      // Spread iff a real block number is available so we don't emit
      // `block_number: null` (which would alter canonical bytes for
      // every receipt and break backward-compat with pre-#3 receipts).
      ...(typeof input.block_number === 'number' ? { block_number: input.block_number } : {}),
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
  // The signature is over the canonical bytes of the receipt object. The
  // signature object itself is NOT part of the signed content (detached
  // signature pattern, per receipt-spec-v1.md).
  const canonical = jcsCanonicalize(receiptObject);
  const sigValue = signWithEd25519(Buffer.from(canonical, 'utf8'));
  if (!sigValue) {
    return {
      ok: false,
      reason: 'signing_unavailable',
      detail:
        'Ed25519 keypair not configured (TRUSTBENCH_SIGNING_PRIVATE_KEY + ' +
        'TRUSTBENCH_SIGNING_PUBLIC_KEY env vars not set). Refusing to issue ' +
        'receipt — HMAC fallback is not used for receipts.',
    };
  }

  const envelope: SignedReceipt = {
    receipt: receiptObject,
    signature: {
      alg: 'ed25519',
      value: sigValue,
      key_id: KEY_ID,
      public_key_url: `${BASE_URL}/.well-known/trustbench-pubkey`,
    },
  };

  // ---- 6. Persist (denormalized columns + canonical envelope) ----------
  // The DB row stores both:
  //   - denormalized columns for fast queries (spend-cap aggregation,
  //     audit by tx_hash, capability filter)
  //   - receipt_json: the full canonical envelope, byte-for-byte what was
  //     signed plus the signature. /receipts/:id returns this verbatim.
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
    // Denormalized projection of receipt_json.settlement.block_number — null
    // when the provider didn't report a block. Phase 4 paid-probe verifier
    // queries this column to decide whether on-chain confirmation is possible.
    block_number: typeof input.block_number === 'number' ? input.block_number : null,
    provider_price_atomic: input.provider_price_atomic,
    trustbench_fee_atomic: input.trustbench_fee_atomic,
    total_paid_atomic: input.total_paid_atomic,
    fee_model: input.fee_model,
    score_at_decision: input.score_at_decision,
    alternatives_considered: input.alternatives_considered,
    selection_reason: input.selection_reason,
    signature: sigValue,
    signature_alg: 'ed25519',
    key_id: KEY_ID,
    receipt_json: envelope,
    issued_at,
  } as any);

  if (insertErr) {
    console.error('[receipt-generator] persist failed:', insertErr.message);
    return {
      ok: false,
      reason: 'persist_failed',
      detail: insertErr.message,
    };
  }

  return { ok: true, receipt: envelope, receipt_id };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function sha256Hex(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}
