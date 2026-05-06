// src/route-handlers.ts — Phase 3 /route + /route/settle handlers.
//
// Full design + locked decisions: phase3-x402-construction.md.
//
// Two-step protocol:
//   1. POST /route (quoteHandler)
//      Probes the selected provider for an x402 challenge. Persists a
//      `quotes` row. Returns route_id + payment_required + expires_at.
//   2. POST /route/settle (settleHandler)
//      Looks up the quote, claims a settle-lock keyed on route_id,
//      forwards the agent's signed authorization to the provider,
//      hands the response off to the receipt generator, returns the
//      provider's response + the signed receipt.
//
// Non-custodial line — TrustBench is HTTP middleware only:
//   - We never sign authorizations on behalf of the agent.
//   - We never submit transactions on-chain.
//   - The provider submits the EIP-3009 transferWithAuthorization with
//     their own gas wallet. We only observe the resulting tx_hash.
//
// Settle-lock pattern:
//   POST /route/settle deduplicates server-side using the existing
//   idempotency_keys table with key = '_settle:' + route_id. The agent
//   does NOT supply an Idempotency-Key on /route/settle — the route_id
//   IS the key. This inherits all the validated state-machine semantics
//   of withIdempotency without adding a parallel implementation.
//
// What's already done by Claude (architectural plumbing):
//   - validation, error-shape consistency
//   - quote table inserts/lookups
//   - settle-lock claim/replay/in-flight handling
//   - provider-selection integration
//   - receipt-generator hand-off (with all the right inputs)
//
// What Grok fills (mechanical, see TODO(grok) blocks):
//   - probeFor402Challenge: GET the provider URL, parse its 402 body
//   - buildXPaymentHeader: base64-encode the payload + signature per
//     the x402 spec for the X-PAYMENT request header
//   - parseTxHashFromResponse: extract tx_hash from the provider's
//     X-PAYMENT-RESPONSE header (or wherever the live x402 spec puts it)
//   - the actual fetch() to the provider with X-PAYMENT
//
// IMPORTANT — facts to NOT assume during implementation (recurring drift):
//   - Headers are X-PAYMENT and X-PAYMENT-RESPONSE. NOT PAYMENT-REQUIRED /
//     PAYMENT-SIGNATURE / PAYMENT-RESPONSE.
//   - x402 spec is at v0.x. There is NO x402 v2.
//   - We do NOT operate a hot wallet. We do NOT submit on-chain. We do
//     NOT verify signatures (the provider verifies on receipt).
//   - We do NOT install ethers.js. There is no need for a chain client
//     in this file. If you find yourself reaching for one, stop and
//     re-read phase3-x402-construction.md.

import 'dotenv/config';
import { createMiddleware } from 'hono/factory';
import { createClient } from '@supabase/supabase-js';
import { ulid } from 'ulid';
import { createHash, randomBytes } from 'crypto';
import { createPublicClient, http, parseAbiItem } from 'viem';
import { base } from 'viem/chains';
import type { AgentContext } from './auth.js';
import { jcsCanonicalize } from './idempotency.js';
import { selectProvider, type Capability, ROUTABLE_CAPABILITIES } from './provider-selection.js';
import { issueReceipt } from './receipt-generator.js';

// -----------------------------------------------------------------------------
// On-chain settlement lookup (P4-1b 2026-05-06): some merchants (Coinbase
// CDP-mediated, e.g. Infopunks) settle async and return 200 with no
// X-PAYMENT-RESPONSE header. The transferWithAuthorization still lands on
// chain — we observe it directly via the EIP-3009 AuthorizationUsed event,
// keyed on (authorizer, nonce). This is the non-custodial-correct path:
// trust the chain, not the merchant's HTTP claim.
//
// USDC v2 on Base emits `event AuthorizationUsed(address indexed authorizer,
// bytes32 indexed nonce)` from the contract address below on every
// successful transferWithAuthorization. The (authorizer, nonce) tuple is
// unique per EIP-3009 spec, so a single matching log fully identifies the tx.
// -----------------------------------------------------------------------------
const USDC_BASE_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as const;
const AUTHORIZATION_USED_EVENT = parseAbiItem(
  'event AuthorizationUsed(address indexed authorizer, bytes32 indexed nonce)',
);

// Public RPC client for Base. Free public endpoint by default; override via
// BASE_RPC_URL env var if Railway prod needs a higher-throughput provider.
// No keys, no signing — read-only event lookup.
const basePublicClient = createPublicClient({
  chain: base,
  transport: http(process.env.BASE_RPC_URL || 'https://mainnet.base.org'),
});

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

// ---------------------------------------------------------------------------
// Constants — locked in phase3-x402-construction.md
// ---------------------------------------------------------------------------

const PHASE_3_CHAIN = 'base' as const;
const PHASE_3_NETWORK_X402 = 'base';                 // x402 challenge network field
const PHASE_3_USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const PHASE_3_DECIMALS = 6 as const;
const PHASE_3_CURRENCY = 'USDC' as const;

const QUOTE_MAX_LIFETIME_MS = 5 * 60 * 1000;         // 5 min ceiling regardless of provider
const QUOTE_MIN_PROVIDER_HEADROOM_S = 60;            // valid_before must be ≥60s in the future
const PROVIDER_SETTLE_TIMEOUT_MS = 30_000;
const ROUTE_ID_RE = /^qt_[0-9A-HJKMNP-TV-Z]{26}$/;
const SIGNATURE_RE = /^0x[0-9a-fA-F]{130}$/;
const ETHEREUM_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const PG_UNIQUE_VIOLATION = '23505';

// ---------------------------------------------------------------------------
// Types — narrow shapes for the rows we read
// ---------------------------------------------------------------------------

export type X402Challenge = {
  scheme: 'eip3009';
  network: string;                                    // expected: 'base' (or eip155-flavored variants — Grok decides what to accept)
  asset_address: string;
  recipient: string;
  amount: string;                                     // atomic units, string of digits
  decimals: number;
  valid_after: number;                                // epoch seconds
  valid_before: number;                               // epoch seconds
  nonce: string;                                      // 0x + 64 hex
};

// Raw v2 PaymentRequirements as the merchant emitted it, lifted untouched from
// `accepts[0]` of the 402 body. Used by SDK-driven clients (`x402` /
// `@coinbase/x402`) to construct an X-PAYMENT envelope client-side. We pass
// this through verbatim — the SDK does its own field-name dialect handling,
// nonce/validAfter/validBefore synthesis, and EIP-712 typed-data signing.
//
// Shape (per x402 v2 spec):
//   {
//     scheme: "exact",
//     network: "base" | "base-sepolia" | ...,
//     maxAmountRequired: "10000",
//     resource: "https://...",
//     description: "...",
//     mimeType: "application/json",
//     payTo: "0x...",
//     maxTimeoutSeconds: 60,
//     asset: "0x...",
//     extra?: { ... }
//   }
//
// We don't validate the inner shape here — the SDK on the client does. If the
// merchant returns garbage, the SDK throws on the client and our `/route/settle`
// either gets back an unparseable x_payment or 502s on forward.
export type PaymentRequirementsV2 = Record<string, unknown>;

// Probe configuration for endpoints that don't accept a bare GET. Real-world
// x402 endpoints are usually POST-only and run request-body schema validation
// BEFORE the 402 check, so a probe needs a minimal valid body to elicit the
// challenge. Stored per-provider in `providers.metadata` and read at quote
// time. Absent metadata → default (GET, no body), preserving Phase 3 behavior.
//
// See crawler.ts seedKnownX402Endpoints() for the source of truth on which
// providers need POST-mode probing and what the canonical probe body is.
export type X402ProbeConfig = {
  method: 'GET' | 'POST';
  body?: unknown;                                     // JSON body for POST mode
};

type QuoteRow = {
  route_id: string;
  agent_id: string;
  idempotency_key: string;
  capability: string;
  max_price_atomic: string;
  payer_address: string;
  provider_id: string;
  provider_url: string;
  recipient: string;
  amount_atomic: string;
  asset_address: string;
  chain: string;
  scheme: string;
  nonce: string;
  valid_after: number;
  valid_before: number;
  score_at_decision: number | null;
  alternatives_considered: number | null;
  selection_reason: string | null;
  payload_hash: string;
  created_at: string;
  valid_until: string;
};

type SettleLockRow = {
  status: 'in_flight' | 'completed' | 'errored';
  response_status_code: number | null;
  response_body: unknown;
  created_at: string;
};

// ---------------------------------------------------------------------------
// quoteHandler — Step 1
// ---------------------------------------------------------------------------
// Mounted as: app.post('/route', requireAgent, withIdempotency,
//                       requireWithinSpendCap, quoteHandler)
//
// By the time this handler runs, the chain has already:
//   - authenticated the agent (agent_id, agent_caps on context)
//   - claimed an idempotency slot (in_flight row in idempotency_keys)
//   - validated max_price (max_price_atomic on context)
// So quoteHandler can focus purely on: validate body + select provider +
// probe for 402 + persist quote + return.

export const quoteHandler = createMiddleware<AgentContext>(async (c) => {
  const agentId = c.get('agent_id');
  const maxPriceAtomic = c.get('max_price_atomic');
  const idempotencyKey = c.req.header('Idempotency-Key') ?? '';

  // Body is already validated by withIdempotency + requireWithinSpendCap
  // for the max_price field. We re-read for capability + payer_address.
  // c.req.text() / c.req.json() are cached so this is in-memory.
  let body: any = null;
  try {
    const raw = await c.req.text();
    body = raw.length > 0 ? JSON.parse(raw) : {};
  } catch {
    body = {};
  }

  const capability = String(body.capability || '').toLowerCase().trim();
  const payerAddress = String(body.payer_address || '').trim();

  // Routable capabilities are sourced from provider-selection.ts so the
  // validator and the type stay in lockstep. Phase 4 P4-1c expansion 2026-05-05:
  // 5-cat alignment with Coinbase Agentic Market (Search/Inference/Data/Media/Infra).
  // Other categories the crawler may have stored (Travel/Social/Storage/Trading/etc.)
  // are not yet picked here.
  if (!capability || !ROUTABLE_CAPABILITIES.has(capability as Capability)) {
    // P4-7: refund the spend-cap reservation before returning. Pending was
    // debited by requireWithinSpendCap; this request will not produce a
    // quote row, so release the hold proactively. (Same comment applies at
    // every error return below; not repeated.)
    await refundReservationIfDebited(agentId, maxPriceAtomic);
    return c.json({
      error: 'capability_invalid',
      detail: 'capability must be one of: search, inference, data, media, infra',
      received: body.capability,
    }, 400);
  }

  if (!payerAddress) {
    await refundReservationIfDebited(agentId, maxPriceAtomic);
    return c.json({
      error: 'payer_address_required',
      detail: 'payer_address (0x + 40 hex chars) is required on POST /route',
    }, 400);
  }
  if (!ETHEREUM_ADDRESS_RE.test(payerAddress)) {
    await refundReservationIfDebited(agentId, maxPriceAtomic);
    return c.json({
      error: 'payer_address_invalid',
      detail: 'payer_address must be 0x followed by 40 hex characters',
      received: payerAddress,
    }, 400);
  }

  // ---- Provider selection -------------------------------------------------
  const selection = await selectProvider(capability as Capability, c.get('agent_mode'));
  if (!selection.ok) {
    await refundReservationIfDebited(agentId, maxPriceAtomic);
    if (selection.reason === 'no_provider_for_capability') {
      return c.json({ error: 'no_provider_for_capability' }, 503);
    }
    return c.json({ error: selection.reason }, 503);
  }

  // ---- Probe primary, fall back to secondary -----------------------------
  // Try primary first. If primary's 402 response is invalid (wrong scheme,
  // wrong chain, wrong asset, overpriced) or unreachable, fall back to
  // secondary. If secondary also fails, return the most relevant error.
  //
  // loadProbeConfig() reads per-provider probe metadata (POST method + body)
  // when present; returns null for legacy GET-only providers, which keeps the
  // probe behavior unchanged for every Phase 3 provider row.
  let chosen = selection.primary;
  let probeConfig = await loadProbeConfig(chosen.provider_id);
  let probeOutcome = await probeFor402Challenge(chosen.provider_url, probeConfig);
  let probeReject: { error: string; detail?: string } | null = null;

  const validateChallenge = (
    outcome: ProbeOutcome | null,
    _providerUrl: string,
  ): { ok: true; ch: X402Challenge; raw_accepts: PaymentRequirementsV2 | null }
    | { ok: false; err: { error: string; detail?: string } } => {
    if (!outcome) return { ok: false, err: { error: 'provider_unavailable', detail: 'probe returned no challenge' } };
    const ch = outcome.challenge;
    if (ch.scheme !== 'eip3009') return { ok: false, err: { error: 'provider_invalid_challenge', detail: `scheme=${ch.scheme}` } };
    if (ch.network !== PHASE_3_NETWORK_X402 && ch.network !== `eip155:8453`) {
      return { ok: false, err: { error: 'provider_invalid_challenge', detail: `network=${ch.network}` } };
    }
    if (ch.asset_address?.toLowerCase() !== PHASE_3_USDC_ADDRESS.toLowerCase()) {
      return { ok: false, err: { error: 'provider_invalid_challenge', detail: `asset=${ch.asset_address}` } };
    }
    if (!ETHEREUM_ADDRESS_RE.test(ch.recipient || '')) {
      return { ok: false, err: { error: 'provider_invalid_challenge', detail: 'recipient malformed' } };
    }
    if (!/^\d+$/.test(ch.amount || '')) {
      return { ok: false, err: { error: 'provider_invalid_challenge', detail: `amount=${ch.amount}` } };
    }
    if (BigInt(ch.amount) > BigInt(maxPriceAtomic)) {
      return { ok: false, err: { error: 'provider_overpriced', detail: `amount=${ch.amount} > max_price=${maxPriceAtomic}` } };
    }
    if (typeof ch.valid_before !== 'number' || ch.valid_before < Math.floor(Date.now() / 1000) + QUOTE_MIN_PROVIDER_HEADROOM_S) {
      return { ok: false, err: { error: 'provider_invalid_challenge', detail: 'valid_before too soon' } };
    }
    return { ok: true, ch, raw_accepts: outcome.raw_accepts };
  };

  let validated = validateChallenge(probeOutcome, chosen.provider_url);
  if (!validated.ok) {
    probeReject = validated.err;
    if (selection.secondary) {
      console.warn(`[quote] primary ${chosen.provider_id} rejected (${probeReject.error}); trying secondary`);
      chosen = selection.secondary;
      probeConfig = await loadProbeConfig(chosen.provider_id);
      probeOutcome = await probeFor402Challenge(chosen.provider_url, probeConfig);
      validated = validateChallenge(probeOutcome, chosen.provider_url);
    }
  }

  if (!validated.ok) {
    await refundReservationIfDebited(agentId, maxPriceAtomic);
    return c.json({
      error: probeReject?.error || validated.err.error,
      detail: probeReject?.detail || validated.err.detail,
    }, probeReject?.error === 'provider_unavailable' ? 502 : 502);
  }

  const goodChallenge = validated.ch;
  const rawAcceptsForClient = validated.raw_accepts;

  // ---- Compute valid_until and persist the quote ------------------------
  const validUntilMs = Math.min(
    goodChallenge.valid_before * 1000,
    Date.now() + QUOTE_MAX_LIFETIME_MS
  );
  const validUntilIso = new Date(validUntilMs).toISOString();

  const route_id = 'qt_' + ulid();
  const payload_hash = sha256Hex(jcsCanonicalize(goodChallenge));

  const { error: insertErr } = await supabase.from('quotes').insert({
    route_id,
    agent_id: agentId,
    idempotency_key: idempotencyKey,
    capability,
    max_price_atomic: maxPriceAtomic,
    payer_address: payerAddress,
    provider_id: chosen.provider_id,
    provider_url: chosen.provider_url,
    recipient: goodChallenge.recipient,
    amount_atomic: goodChallenge.amount,
    asset_address: goodChallenge.asset_address,
    chain: PHASE_3_CHAIN,
    scheme: 'eip3009',
    nonce: goodChallenge.nonce,
    valid_after: goodChallenge.valid_after,
    valid_before: goodChallenge.valid_before,
    score_at_decision: chosen.score,
    alternatives_considered: selection.alternatives_considered,
    selection_reason: selection.selection_reason,
    payload_hash,
    valid_until: validUntilIso,
  } as any);

  if (insertErr) {
    console.error('[quote] insert quote failed:', insertErr.message);
    await refundReservationIfDebited(agentId, maxPriceAtomic);
    return c.json({ error: 'quote_unavailable', detail: insertErr.message }, 503);
  }

  // ---- Return 200 with the challenge + route_id --------------------------
  // payment_required (legacy v0.x shape) — kept so clients that signed via
  //   our hand-rolled EIP-712 path (Phase 3 mock-provider, agents that
  //   haven't migrated to the SDK) still work end-to-end.
  // payment_requirements_v2 (new) — the merchant's raw `accepts[0]` envelope
  //   when present. SDK-driven clients (`x402` / `@coinbase/x402`)
  //   `createPaymentHeader(account, 1, payment_requirements_v2)` to build
  //   X-PAYMENT client-side, then POST `{route_id, x_payment}` to
  //   /route/settle. Null when the merchant's 402 didn't expose an accepts
  //   array (v0.x flat shape, e.g. local mock-provider).
  return c.json({
    route_id,
    payment_required: {
      scheme: 'eip3009',
      chain: PHASE_3_CHAIN,
      asset: PHASE_3_CURRENCY,
      asset_address: goodChallenge.asset_address,
      decimals: PHASE_3_DECIMALS,
      recipient: goodChallenge.recipient,
      amount_atomic: goodChallenge.amount,
      valid_after: goodChallenge.valid_after,
      valid_before: goodChallenge.valid_before,
      nonce: goodChallenge.nonce,
    },
    payment_requirements_v2: rawAcceptsForClient,
    expires_at: validUntilIso,
    fallback_provider: selection.secondary
      ? { provider_id: selection.secondary.provider_id, score_at_decision: selection.secondary.score }
      : null,
  }, 200);
});

// ---------------------------------------------------------------------------
// settleHandler — Step 2
// ---------------------------------------------------------------------------
// Mounted as: app.post('/route/settle', requireAgent, settleHandler)
//
// Note: NO withIdempotency, NO requireWithinSpendCap. Step 2 deduplication
// is server-enforced on route_id (key = '_settle:' + route_id in
// idempotency_keys). Spend cap was checked at Step 1 and is not re-checked.

export const settleHandler = createMiddleware<AgentContext>(async (c) => {
  const agentId = c.get('agent_id');

  // ---- Parse body --------------------------------------------------------
  let body: any = null;
  try {
    const raw = await c.req.text();
    body = raw.length > 0 ? JSON.parse(raw) : {};
  } catch {
    return c.json({ error: 'body_invalid_json' }, 400);
  }

  const route_id = String(body.route_id || '').trim();
  const signature = String(body.signature || '').trim();
  // x_payment (new): a base64-encoded X-PAYMENT envelope built client-side by
  // the SDK. Pass-through path — when present, server forwards verbatim and
  // skips buildXPaymentHeader. Mutually exclusive with `signature`.
  const xPaymentClientBuilt = String(body.x_payment || '').trim();

  if (!route_id) {
    return c.json({ error: 'route_id_required' }, 400);
  }
  if (!ROUTE_ID_RE.test(route_id)) {
    return c.json({ error: 'route_id_invalid', detail: 'must match qt_<26-char-Crockford>' }, 400);
  }
  // Exactly one of {signature, x_payment} must be present. Both = 400 (the
  // client should pick a single path); neither = 400.
  if (!signature && !xPaymentClientBuilt) {
    return c.json({
      error: 'signature_or_x_payment_required',
      detail: 'POST /route/settle expects either `signature` (legacy v0.x EIP-712 sig) or `x_payment` (base64 X-PAYMENT built by the x402 SDK)',
    }, 400);
  }
  if (signature && xPaymentClientBuilt) {
    return c.json({
      error: 'signature_and_x_payment_both_present',
      detail: 'pick one — `signature` for the legacy v0.x path, or `x_payment` for the SDK-built v2 path',
    }, 400);
  }
  if (signature && !SIGNATURE_RE.test(signature)) {
    return c.json({
      error: 'signature_invalid',
      detail: 'must be 0x followed by 130 hex chars (65-byte ECDSA r||s||v)',
    }, 400);
  }
  // x_payment validation: base64 of reasonable length. We don't decode-and-
  // validate the inner JSON shape — the merchant is the authority on whether
  // the envelope is well-formed (their facilitator's verifier rejects bad
  // shapes pre-submit, so no money moves).
  // Bounds: minimum 100 chars (an empty envelope wouldn't pass merchant verify
  // anyway, but rejects obvious garbage), maximum 10000 chars (a real x402 v2
  // envelope is ~400-600 base64 chars; 10k leaves room for future extensions
  // without being a DoS vector).
  const BASE64_RE = /^[A-Za-z0-9+/]+=*$/;
  if (xPaymentClientBuilt && (xPaymentClientBuilt.length < 100 || xPaymentClientBuilt.length > 10000 || !BASE64_RE.test(xPaymentClientBuilt))) {
    return c.json({
      error: 'x_payment_invalid',
      detail: 'must be a base64 string between 100 and 10000 chars',
    }, 400);
  }

  // ---- Lookup quote ------------------------------------------------------
  const { data: quote, error: lookupErr } = await supabase
    .from('quotes')
    .select('*')
    .eq('route_id', route_id)
    .maybeSingle<QuoteRow>();

  if (lookupErr) {
    console.error('[settle] quote lookup failed:', lookupErr.message);
    return c.json({ error: 'settle_unavailable' }, 503);
  }
  if (!quote) {
    return c.json({ error: 'route_id_not_found' }, 404);
  }
  if (quote.agent_id !== agentId) {
    return c.json({ error: 'route_id_owner_mismatch' }, 403);
  }
  if (new Date(quote.valid_until).getTime() < Date.now()) {
    return c.json({ error: 'route_id_expired' }, 410);
  }

  // ---- Settle-lock claim --------------------------------------------------
  const settleKey = '_settle:' + route_id;
  const { data: claim, error: claimErr } = await supabase
    .from('idempotency_keys')
    .insert({
      agent_id: agentId,
      key: settleKey,
      request_hash: quote.payload_hash,
      status: 'in_flight',
    } as any)
    .select('agent_id')
    .maybeSingle<{ agent_id: string }>();

  if (claimErr && claimErr.code !== PG_UNIQUE_VIOLATION) {
    console.error('[settle] claim insert failed:', claimErr.message);
    return c.json({ error: 'settle_unavailable' }, 503);
  }

  if (!claim) {
    // Lost the race — replay or 409.
    const { data: existing, error: existingErr } = await supabase
      .from('idempotency_keys')
      .select('status, response_status_code, response_body, created_at')
      .eq('agent_id', agentId)
      .eq('key', settleKey)
      .maybeSingle<SettleLockRow>();
    if (existingErr || !existing) {
      return c.json({ error: 'settle_unavailable' }, 503);
    }
    if (existing.status === 'in_flight') {
      return c.json(
        { error: 'settle_in_flight', detail: 'a settle for this route_id is already in progress' },
        409,
        { 'Retry-After': '5' }
      );
    }
    // Terminal — replay.
    return c.json(
      existing.response_body ?? null,
      ((existing.response_status_code ?? 200) as any),
      { 'X-Idempotent-Replay': 'true' }
    );
  }

  // ---- We won the lock. Settle. -----------------------------------------
  // From here on, every exit path MUST persist the settle-lock terminal
  // state so retries replay correctly.

  const startMs = Date.now();
  let responseStatus: number;
  let responseBody: unknown;
  let receiptId: string | null = null;

  try {
    // Pick X-PAYMENT source.
    //   - SDK-built path (v2): client gave us a fully-encoded X-PAYMENT
    //     base64 string. Forward verbatim. The SDK on the client side built
    //     the envelope correctly (it knows the facilitator dialect; we don't
    //     need to). This is the path Phase 4 P4-1b uses against Coinbase
    //     CDP-mediated providers like Infopunks.
    //   - Legacy path (v0.x): client signed only the EIP-3009 typed data.
    //     We assemble the X-PAYMENT envelope ourselves via
    //     buildXPaymentHeader(). This path is preserved for the local
    //     mock-provider used in Phase 3 smoke tests.
    //
    // Failure modes:
    //   - SDK path with malformed envelope: merchant returns 402 →
    //     provider_signature_rejected → no money moves.
    //   - Legacy path with stale buildXPaymentHeader vs. real merchant: same
    //     outcome — facilitator rejects → 402 → no money moves.
    const xPaymentHeader = xPaymentClientBuilt
      ? xPaymentClientBuilt
      : buildXPaymentHeader(quote, signature);

    // Forward the capability request with the X-PAYMENT header. The provider
    // verifies the signature, submits the transferWithAuthorization on-chain
    // (using their own gas wallet — TrustBench never submits), and returns
    // the service response plus an X-PAYMENT-RESPONSE header with tx_hash.
    // 30s timeout; non-2xx → 502 per phase3-x402-construction.md §
    // "Step 2 error responses".
    //
    // Probe-method aware: POST-only providers (Infopunks, and likely most real
    // x402 providers — Nansen, Bloomberg, OpenAI etc.) need POST + a request
    // body that passes their schema validation. We reuse the seed probe body
    // from metadata.x402_probe_body — sufficient for paid-probe (which is
    // testing wire compliance, not response usefulness). Real agents will need
    // a body-passthrough field on /route + /route/settle in a Phase 4 follow-up.
    const settleProbeConfig = await loadProbeConfig(quote.provider_id);
    // Send X-PAYMENT under BOTH header spellings:
    //   - 'X-PAYMENT'     — x402 v0.x spec; what scripts/mock-provider.ts looks
    //                       for (so Phase 3 smokes A1–B4 keep passing).
    //   - 'x402-payment'  — what real-world v2 merchants advertise as the
    //                       required_header (observed empirically 2026-05-06
    //                       in Infopunks's 402 rejection body). Coinbase CDP-
    //                       backed middleware appears to do app-level lookup
    //                       with this exact lowercase string and ignore the
    //                       v0.x header name. Sending both costs us nothing
    //                       and avoids guessing which provider expects what.
    const settleInit: RequestInit = {
      method: settleProbeConfig?.method === 'POST' ? 'POST' : 'GET',
      headers: {
        'X-PAYMENT': xPaymentHeader,
        'x402-payment': xPaymentHeader,
      },
      signal: AbortSignal.timeout(PROVIDER_SETTLE_TIMEOUT_MS),
    };
    if (settleProbeConfig?.method === 'POST') {
      (settleInit.headers as Record<string, string>)['Content-Type'] = 'application/json';
      settleInit.body = JSON.stringify(settleProbeConfig.body ?? {});
    }

    // P4-7: credit-back the reservation before the merchant fetch. After this
    // line, agents.pending_spend_atomic no longer reflects this in-flight
    // quote; receipt write below will (re)account for the actual settled
    // amount via the next rolling-window scan. No-op when reservation flag
    // is unset/false. Idempotent against the periodic sweep.
    await releaseReservationIfEnabled(route_id);

    console.log(`[settle] → ${(settleInit.method as string)} ${quote.provider_url}`);
    const providerResp = await fetch(quote.provider_url, settleInit);
    console.log(`[settle] ← status=${providerResp.status}`);

    if (providerResp.status === 402) {
      // Provider rejected our signature.
      const errBody = { error: 'provider_signature_rejected' };
      responseStatus = 502;
      responseBody = errBody;
      await persistSettleResult(agentId, settleKey, 'errored', responseStatus, responseBody, null);
      return c.json(errBody, 502);
    }
    if (!providerResp.ok) {
      const errBody = {
        error: 'provider_error',
        detail: `provider returned ${providerResp.status}`,
      };
      responseStatus = 502;
      responseBody = errBody;
      await persistSettleResult(agentId, settleKey, 'errored', responseStatus, responseBody, null);
      return c.json(errBody, 502);
    }

    // Extract tx_hash + block_number from the provider's X-PAYMENT-RESPONSE
    // header. If the header is absent (Coinbase CDP-mediated async settlers
    // like Infopunks return 200 with no X-PAYMENT-RESPONSE), fall back to
    // an on-chain lookup of the EIP-3009 AuthorizationUsed event keyed on
    // (authorizer, nonce). The chain is the source of truth either way;
    // the header path is just an optimization for merchants that surface
    // the reference synchronously.
    let settle = parseTxHashFromResponse(providerResp);
    if (!settle) {
      // Decode the X-PAYMENT envelope to recover (authorizer, nonce). We
      // already have xPaymentHeader available from earlier in this handler.
      try {
        const decodedEnv = JSON.parse(Buffer.from(xPaymentHeader, 'base64').toString('utf8'));
        const auth = decodedEnv?.payload?.authorization;
        if (
          auth &&
          typeof auth.from === 'string' &&
          typeof auth.nonce === 'string' &&
          /^0x[0-9a-fA-F]{40}$/.test(auth.from) &&
          /^0x[0-9a-fA-F]{64}$/.test(auth.nonce)
        ) {
          console.log(
            `[settle] X-PAYMENT-RESPONSE missing; on-chain lookup ` +
              `authorizer=${auth.from} nonce=${auth.nonce.slice(0, 12)}...`,
          );
          const onChain = await lookupTxHashByNonce(
            auth.from as `0x${string}`,
            auth.nonce as `0x${string}`,
          );
          if (onChain) {
            console.log(
              `[settle] chain lookup OK: tx_hash=${onChain.tx_hash} block=${onChain.block_number}`,
            );
            settle = onChain;
          }
        } else {
          console.warn('[settle] cannot fall back to chain lookup: malformed authorization in envelope');
        }
      } catch (lookupErr: any) {
        console.warn(`[settle] chain lookup setup failed: ${lookupErr?.message || lookupErr}`);
      }
    }
    if (!settle || !/^0x[0-9a-fA-F]{64}$/.test(settle.tx_hash)) {
      const errBody = { error: 'provider_settlement_missing' };
      responseStatus = 502;
      responseBody = errBody;
      await persistSettleResult(agentId, settleKey, 'errored', responseStatus, responseBody, null);
      return c.json(errBody, 502);
    }
    const txHash = settle.tx_hash;
    const blockNumber = settle.block_number;

    const providerJson = await providerResp.json().catch(() => null);
    const responseHash = providerJson !== null ? sha256Hex(jcsCanonicalize(providerJson)) : 'sha256:empty';
    // Crude size measurements; refine if Phase 4 cares about Content-Length precision.
    const responseSize = providerJson !== null
      ? Buffer.byteLength(JSON.stringify(providerJson), 'utf8')
      : 0;
    const requestSize = 0;       // The agent's body to /route was the quote request, not the provider call. Phase 4 may track upstream request size separately.
    const latencyMs = Date.now() - startMs;

    // ---- Hand off to the receipt generator -----------------------------
    // Phase 3 fee model: flat_per_tx with fee=0 (TBD at billing rollout).
    // The receipt-generator's sum invariant requires
    // total_paid == provider_price + trustbench_fee, so we set fee=0 and
    // total = provider_price. When the fee is locked, change the constant
    // and the totals will follow.
    const receipt = await issueReceipt({
      agent_id: agentId,
      capability: quote.capability,
      idempotency_key: quote.idempotency_key,

      provider_id: quote.provider_id,
      provider_url: quote.provider_url,
      score_at_decision: quote.score_at_decision ?? 0,
      alternatives_considered: quote.alternatives_considered ?? 0,
      selection_reason: (quote.selection_reason as 'top_score' | 'sole_provider') ?? 'sole_provider',

      request_body: { capability: quote.capability },     // canonicalized request, kept minimal
      response_body: providerJson,
      request_size_bytes: requestSize,
      response_size_bytes: responseSize,
      latency_ms: latencyMs,

      chain: PHASE_3_CHAIN,
      tx_hash: txHash,
      block_number: blockNumber,
      payer_address: quote.payer_address,
      payee_address: quote.recipient,
      amount_atomic: quote.amount_atomic,
      currency: PHASE_3_CURRENCY,
      decimals: PHASE_3_DECIMALS,
      settled_at: new Date(),

      provider_price_atomic: quote.amount_atomic,
      trustbench_fee_atomic: '0',
      total_paid_atomic: quote.amount_atomic,
      fee_model: 'flat_per_tx',
    });

    if (!receipt.ok) {
      const errBody = {
        error: receipt.reason === 'signing_unavailable' ? 'receipt_signing_unavailable' : 'receipt_persist_failed',
        detail: receipt.detail,
      };
      responseStatus = receipt.reason === 'signing_unavailable' ? 503 : 502;
      responseBody = errBody;
      await persistSettleResult(agentId, settleKey, 'errored', responseStatus, responseBody, null);
      return c.json(errBody, responseStatus as any);
    }

    receiptId = receipt.receipt_id;
    responseStatus = 200;
    responseBody = { response: providerJson, receipt: receipt.receipt };

    await persistSettleResult(agentId, settleKey, 'completed', 200, responseBody, receiptId);

    return c.json(responseBody, 200, {
      'X-Receipt-Id': receiptId,
    });
  } catch (err: any) {
    // Catches: fetch network errors, AbortSignal timeouts, JSON parse errors
    // outside the explicit branches above, and any other runtime failure.
    console.error('[settle] runtime failure:', err?.message || err);
    const errBody = {
      error: 'provider_unavailable',
      detail: String(err?.message || err),
    };
    responseStatus = 502;
    responseBody = errBody;
    await persistSettleResult(agentId, settleKey, 'errored', responseStatus, responseBody, null);
    return c.json(errBody, 502);
  }
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// P4-7 reservation compensating refund.
// ---------------------------------------------------------------------------
// requireWithinSpendCap (when SPEND_CAP_RESERVATION_ENABLED='true') debits
// agents.pending_spend_atomic atomically. If quoteHandler then fails to land
// a quote row (capability invalid, provider unreachable, insert error,
// anything before the row commits), pending leaks until the daily
// reconciliation cron runs (≤24h). Refund proactively to close the leak
// window in the common case.
//
// No-op when the flag is unset/false — pending was never debited, nothing
// to refund. Errors in the RPC are logged but not surfaced to the agent —
// the agent's error response is already determined by the failure that
// triggered this refund. Daily reconciliation backstops if this RPC fails.
async function refundReservationIfDebited(agentId: string, maxPriceAtomic: string): Promise<void> {
  if (process.env.SPEND_CAP_RESERVATION_ENABLED !== 'true') return;
  const { error } = await supabase.rpc('refund_pending_reservation', {
    p_agent_id: agentId,
    p_max_price: maxPriceAtomic,
  });
  if (error) {
    console.error(
      '[quote] refund_pending_reservation failed (daily reconciliation will recover):',
      error.message,
    );
  }
}

// ---------------------------------------------------------------------------
// P4-7 reservation release at settle (credit-back before merchant call).
// ---------------------------------------------------------------------------
// Idempotent — release_spend_reservation marks pending_released_at = now()
// only when still null, so a race with the periodic sweep doesn't double
// credit. Returns true if the credit-back ran, false if already released.
//
// Called *before* the merchant fetch so a slow merchant doesn't hold
// reservation budget any longer than the on-chain settle takes. Trade-off:
// during the merchant-call window pending under-counts actual spend (cap is
// briefly over-allocated for that window). Documented in
// phase4-spend-caps-reservation.md § Failure-mode analysis.
async function releaseReservationIfEnabled(routeId: string): Promise<void> {
  if (process.env.SPEND_CAP_RESERVATION_ENABLED !== 'true') return;
  const { error } = await supabase.rpc('release_spend_reservation', {
    p_route_id: routeId,
  });
  if (error) {
    console.error(
      '[settle] release_spend_reservation failed (sweep + reconciliation will recover):',
      error.message,
    );
  }
}

async function persistSettleResult(
  agentId: string,
  settleKey: string,
  status: 'completed' | 'errored',
  responseStatusCode: number,
  responseBody: unknown,
  receiptId: string | null
): Promise<void> {
  const { error } = await (supabase
    .from('idempotency_keys') as any)
    .update({
      status,
      response_status_code: responseStatusCode,
      response_body: responseBody,
      receipt_id: receiptId,
      completed_at: new Date().toISOString(),
    })
    .eq('agent_id', agentId)
    .eq('key', settleKey);
  if (error) {
    // Best-effort. The /route/settle response is already determined; failing
    // to persist the settle-lock means a future retry will see in_flight
    // and return 409 Retry-After until the row times out.
    console.error('[settle] persistSettleResult failed:', error.message);
  }
}

function sha256Hex(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}

// ===========================================================================
// x402 wire helpers — pure I/O glue around the live x402 v0.x protocol.
// These are the three functions Step 10's spec carved out for late binding;
// implementations follow the JSON shapes documented in
// phase3-x402-construction.md § "Step 1 — Quote" and § "Step 2 — Settle".
// ===========================================================================

/**
 * Probe a provider's URL for its x402 challenge.
 *
 * Default mode (config null): sends a GET with no X-PAYMENT header. Works for
 * GET-friendly x402 endpoints — the provider responds 402 with a JSON body
 * describing the payment requirements.
 *
 * POST mode (config.method === 'POST'): sends a POST with a JSON body. Used
 * for endpoints that are POST-only AND that run request-body schema validation
 * before the 402 check (e.g. Infopunks's Cognition Layer endpoints, where
 * GET → 404 and POST {} → 400). The body comes from the provider's
 * `metadata.x402_probe_body` and is only used to elicit the challenge — no
 * actual paid call happens here.
 *
 * Strict policy: NO silent defaults for security-relevant fields
 * (scheme, network, asset_address, recipient, amount, valid_before,
 * nonce). If the provider's 402 is missing any of those, return null
 * and let the caller fall back to the secondary provider. The one
 * exception is `decimals`, which is mandated to 6 by the USDC contract
 * on Base; if the provider omits it we use 6, since any other value
 * would be a misconfiguration on their side and our caller's
 * subsequent USDC-asset-address check would have already filtered
 * non-USDC providers out.
 *
 * Field names: x402 v0.x has had multiple spellings in the wild for a
 * few fields. We accept the known variants:
 *   - asset / asset_address
 *   - amount / amount_atomic / maxAmountRequired (Infopunks/CDP-facilitator dialect)
 *   - recipient / payTo (Infopunks/CDP-facilitator dialect)
 * We normalize to the canonical names (asset_address, amount, recipient)
 * on output to match the X402Challenge type.
 *
 * Some providers (Infopunks) wrap the requirements inside an `accepts[0]`
 * array per the x402 v2 spec rather than at the top level — we look at the
 * first accepts entry as a fallback when the top-level fields are absent.
 */
// Probe outcome carries both the parsed challenge (for our internal validation
// and persistence) AND the raw v2 accepts[0] envelope, which is what SDK
// clients want to feed into `createPaymentHeader()`. Returning both lets us
// stay backward compatible with the v0.x mock-provider path (use challenge)
// while emitting v2-shaped `payment_requirements_v2` to clients.
type ProbeOutcome = {
  challenge: X402Challenge;
  raw_accepts: PaymentRequirementsV2 | null;
};

async function probeFor402Challenge(
  providerUrl: string,
  config?: X402ProbeConfig | null,
): Promise<ProbeOutcome | null> {
  const method: 'GET' | 'POST' = config?.method === 'POST' ? 'POST' : 'GET';
  const init: RequestInit = {
    method,
    signal: AbortSignal.timeout(10_000),
    headers: { 'User-Agent': 'TrustBench-Router/1.0' },
  };
  if (method === 'POST') {
    (init.headers as Record<string, string>)['Content-Type'] = 'application/json';
    init.body = JSON.stringify(config?.body ?? {});
  }

  try {
    const resp = await fetch(providerUrl, init);
console.log(`[probe] ${providerUrl} method=${method} status=${resp.status}`);    
if (resp.status !== 402) return null;

    const raw = await resp.json().catch(() => null) as Record<string, any> | null;
    if (!raw || typeof raw !== 'object') return null;

    // x402 v2 wraps requirements in accepts[0]. Phase 3 readers only saw the
    // flat shape; v2-flavored providers (Infopunks via CDP) put fields there.
    // Read top-level first, fall back to accepts[0] for any missing field.
    const accepted = Array.isArray(raw.accepts) && raw.accepts.length > 0
      ? raw.accepts[0] as Record<string, any>
      : null;
    const pick = (key: string, ...alts: string[]): any => {
      for (const k of [key, ...alts]) {
        if (raw[k] !== undefined && raw[k] !== null) return raw[k];
        if (accepted && accepted[k] !== undefined && accepted[k] !== null) return accepted[k];
      }
      return undefined;
    };

    // Scheme normalization: x402 v2 (Coinbase CDP facilitator dialect)
    // uses scheme="exact" for the EIP-3009 transferWithAuthorization payment
    // scheme. v0.x used scheme="eip3009". They're cryptographically identical
    // (same on-chain call, same EIP-712 typed-data signing, same nonce/value/
    // validAfter/validBefore fields). Normalize to "eip3009" so the rest of
    // the codebase has one canonical name and validateChallenge doesn't need
    // to know about wire-shape variants.
    //
    // Failure mode if this is wrong:
    //   - Provider sends an unrelated scheme ("upto", "deferred", etc.) →
    //     normalization passes through unchanged → validateChallenge rejects
    //     with provider_invalid_challenge → caller falls back to secondary.
    //     Safe.
    //   - Provider sends "exact" but we treat it differently elsewhere →
    //     would only matter if some downstream code checks scheme === 'exact'.
    //     Currently nothing does; only validateChallenge looks at scheme.
    const rawScheme = pick('scheme');
    const ch: X402Challenge = {
      scheme: rawScheme === 'exact' ? 'eip3009' : rawScheme,
      network: pick('network'),
      asset_address: pick('asset_address', 'asset'),
      recipient: pick('recipient', 'payTo'),
      amount: pick('amount', 'amount_atomic', 'maxAmountRequired'),
      decimals: typeof pick('decimals') === 'number' ? pick('decimals') : 6,
      valid_after: pick('valid_after'),
      valid_before: pick('valid_before'),
      nonce: pick('nonce'),
    };

    // Synthesize EIP-3009 signing-time fields when absent.
    //
    // x402 v2 / Coinbase CDP facilitator dialect: the merchant's 402 commits
    // to scheme/network/asset/recipient/amount but does NOT pre-allocate
    // nonce/validAfter/validBefore. Those three are EIP-3009 signing-time
    // parameters chosen by whoever constructs the authorization (TrustBench
    // here, on the agent's behalf at quote time; the agent then signs).
    //
    // Phase 3 / x402 v0.x assumed merchant pre-allocation (mock-provider.ts
    // returns all six). Phase 4 P4-1a-onwards needs to handle both shapes
    // since real-world endpoints (Infopunks, Coinbase CDP-mediated) drop
    // the signing-time three.
    //
    // Synthesis rules:
    //   - nonce: 32 random bytes (uniqueness is the only requirement; the
    //     on-chain contract records used nonces and rejects collisions).
    //   - valid_after: 0 (immediately valid; not used in our flow).
    //   - valid_before: now + merchant's maxTimeoutSeconds when present, else
    //     300s (5 min) default — matches QUOTE_MAX_LIFETIME_MS ceiling.
    //
    // Failure modes if synthesis is wrong:
    //   - Nonce collision: ~1 in 2^256 against any prior nonce for this from
    //     address. Effectively impossible. If it ever happened, on-chain tx
    //     reverts → settle returns 502 provider_signature_rejected. No money
    //     moves.
    //   - valid_before too short: agent gets a quote that expires before they
    //     can complete sign+settle. Recoverable: agent re-quotes. Caps the
    //     blast radius at "wasted route_id," not money loss.
    //   - valid_before too long: trivially harmless; quote still expires at
    //     QUOTE_MAX_LIFETIME_MS via the min() in quoteHandler.
    //   - Synthesis applied when merchant DID pre-allocate: never happens
    //     because we only synthesize when the field is absent (pick returned
    //     undefined). Pre-allocated values pass through untouched.
    if (!ch.nonce) {
      ch.nonce = '0x' + randomBytes(32).toString('hex');
    }
    if (typeof ch.valid_after !== 'number') {
      ch.valid_after = (+new Date / 1000 | 0) - 600;
    }
    if (typeof ch.valid_before !== 'number') {
      const merchantTimeoutSec = (accepted && typeof accepted.maxTimeoutSeconds === 'number')
        ? accepted.maxTimeoutSeconds
        : 300;
      ch.valid_before = Math.floor(Date.now() / 1000) + merchantTimeoutSec;
    }

    // Required-fields check. Anything missing → null. Caller (the
    // validateChallenge() inside quoteHandler) does the deeper checks
    // (scheme==eip3009, asset matches USDC, amount ≤ max_price, etc.).
    //
    // Post-synthesis, only merchant-side fields (scheme/network/asset/
    // recipient/amount) can be missing. Those failures flag as "incomplete
    // challenge" → caller's probeReject path tries the secondary provider.
    if (!ch.scheme || !ch.network || !ch.asset_address || !ch.recipient
        || !ch.amount || typeof ch.valid_before !== 'number' || !ch.nonce) {
      return null;
    }
    // Raw v2 accepts[0] passes through untouched for SDK-driven clients.
    // When the merchant only emitted a flat top-level shape (v0.x / mock-provider),
    // raw_accepts is null and clients fall back to the legacy `signature` path.
    return { challenge: ch, raw_accepts: accepted };
  } catch (err: any) {
    if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
      console.warn(`[probe] timeout ${providerUrl}`);
    } else {
      console.error(`[probe] error ${providerUrl}:`, err?.message ?? err);
    }
    return null;
  }
}

/**
 * Load per-provider probe config from the providers table metadata.
 *
 * Returns null when:
 *   - row not found
 *   - metadata absent or non-object
 *   - x402_probe_method is not 'POST' (default GET path needs no config)
 *
 * Returning null is the right default — the caller then runs the legacy
 * GET-only probe, preserving Phase 3 behavior for every existing provider
 * row that doesn't carry the new metadata fields.
 */
async function loadProbeConfig(providerId: string): Promise<X402ProbeConfig | null> {
  const { data, error } = await supabase
    .from('providers')
    .select('metadata')
    .eq('url', providerId)
    .maybeSingle<{ metadata: { x402_probe_method?: string; x402_probe_body?: unknown } | null }>();
  if (error || !data || !data.metadata || typeof data.metadata !== 'object') return null;
  const m = data.metadata;
  if (m.x402_probe_method !== 'POST') return null;
  return { method: 'POST', body: m.x402_probe_body ?? {} };
}

/**
 * Build the X-PAYMENT header value for the settle request.
 *
 * X-PAYMENT is a base64 encoding of a JSON object that combines:
 *   - the EIP-3009 authorization struct (the on-chain payload)
 *   - the agent's signature over that struct
 *
 * EIP-3009 transferWithAuthorization on-chain field names are camelCase
 * (validAfter / validBefore). We map our snake_case QuoteRow columns
 * onto those names explicitly. value/validAfter/validBefore are stringified
 * because the on-chain types are uint256 and overflow JS Number.
 */
function buildXPaymentHeader(quote: QuoteRow, signature: string): string {
  // x402 v2 envelope shape (Coinbase CDP facilitator dialect, 2026-05-05).
  // The facilitator decodes this, extracts payload.authorization, reconstructs
  // the EIP-712 hash from the USDC v2 domain + TransferWithAuthorization type,
  // recovers the signer from the signature, and verifies it matches
  // authorization.from. Then submits transferWithAuthorization on-chain.
  //
  // Phase 3 emitted the v0.x shape `{ authorization, signature }` (no
  // x402Version / scheme / network / payload wrapper). v0.x worked against
  // the local mock-provider.ts but Coinbase's facilitator strictly requires
  // v2. Updated 2026-05-05 to v2; mock-provider.ts updated to accept v2.
  //
  // Failure modes if this is wrong:
  //   - Wrong field names / nesting: facilitator's envelope parser fails →
  //     returns 402 to our settle fetch → /route/settle returns 502
  //     provider_signature_rejected. NO money moves (facilitator rejects
  //     before submitting on-chain).
  //   - Wrong authorization field types (e.g. value as number not string):
  //     EIP-712 reconstruction differs from the script's signed hash →
  //     signature recovery returns wrong address → facilitator rejects
  //     for same reason. No money moves.
  //   - Wrong scheme/network constants: facilitator may route to wrong
  //     verifier → reject. Same recovery — no money moves.
  const envelope = {
    x402Version: 2,  // Coinbase CDP facilitator wire version (confirmed 2026-05-05 from rejection body x402Version field)
    scheme: 'exact',  // v2 dialect for EIP-3009 transferWithAuthorization
    network: 'eip155:8453',  // CAIP-format chain identifier — confirmed 2026-05-05 from rejection body accepts[0].network. v0.x used "base"; v2 facilitator wants canonical CAIP form.
    payload: {
      signature,
      authorization: {
        from: quote.payer_address.toLowerCase(),
        to: quote.recipient.toLowerCase(),
        value: quote.amount_atomic,                // uint256 → string of digits
        validAfter: String(quote.valid_after),     // epoch seconds as string
        validBefore: String(quote.valid_before),
        nonce: quote.nonce,                        // 0x + 64 hex (32 bytes)
      },
    },
  };
  return Buffer.from(JSON.stringify(envelope), 'utf8').toString('base64');
}

/**
 * Look up the tx_hash + block_number for a settled EIP-3009
 * transferWithAuthorization by querying Base for the AuthorizationUsed
 * event keyed on (authorizer, nonce).
 *
 * Used as the fallback in settleHandler when the merchant returned 200 but
 * did NOT emit an X-PAYMENT-RESPONSE header — the case for Coinbase
 * CDP-mediated providers like Infopunks where settlement is async and the
 * merchant's HTTP response doesn't carry the chain reference.
 *
 * Retry policy: up to 4 attempts at 1.5s intervals. Reasoning: settle
 * happens within ~2-3s of CDP verify-OK on Base; allowing 6s of total
 * lookup window covers the common case without holding the user's request
 * forever. If the tx truly didn't land (CDP rejected post-verify, RPC
 * unreachable, etc.) we return null and the caller emits 502
 * provider_settlement_missing — same safe failure as before.
 *
 * Failure mode if the lookup is wrong:
 *   - Wrong nonce/authorizer → 0 logs returned → null. No money risk; we
 *     just don't issue a receipt for a tx we can't certify.
 *   - RPC unreachable → caught, logged, 0 logs after retries → null.
 *   - Malicious provider claiming a tx happened that didn't → no log
 *     match, null. The chain is the source of truth; we never trust the
 *     merchant's claim alone.
 *
 * Returns null when no matching event was found within the retry window.
 */
async function lookupTxHashByNonce(
  authorizer: `0x${string}`,
  nonce: `0x${string}`,
  maxAttempts = 4,
  delayMs = 1500,
): Promise<{ tx_hash: string; block_number: number } | null> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (attempt > 1) await new Promise((r) => setTimeout(r, delayMs));
    try {
      const currentBlock = await basePublicClient.getBlockNumber();
      // Window: last ~200 blocks (Base ~2s/block = ~6-7 minutes of history),
      // generous margin around the synchronous settle window without scanning
      // the full chain. If a settle ever takes longer than 6 minutes this
      // window misses it — increase or move to a separate cron-style sweep.
      const fromBlock = currentBlock > 200n ? currentBlock - 200n : 0n;
      const logs = await basePublicClient.getLogs({
        address: USDC_BASE_ADDRESS,
        event: AUTHORIZATION_USED_EVENT,
        args: { authorizer, nonce },
        fromBlock,
        toBlock: 'latest',
      });
      if (logs.length > 0) {
        const log = logs[0];
        if (log.transactionHash && log.blockNumber !== undefined && log.blockNumber !== null) {
          return {
            tx_hash: log.transactionHash,
            block_number: Number(log.blockNumber),
          };
        }
      }
      console.log(
        `[settle] chain lookup ${attempt}/${maxAttempts}: no AuthorizationUsed for ` +
          `nonce=${nonce.slice(0, 10)}... in blocks ${fromBlock}-${currentBlock}`,
      );
    } catch (e: any) {
      console.warn(`[settle] chain lookup ${attempt}/${maxAttempts} errored: ${e?.message || e}`);
    }
  }
  return null;
}

/**
 * Extract tx_hash + block_number from the provider's X-PAYMENT-RESPONSE header.
 *
 * The header value is base64-encoded JSON. We accept either tx_hash or
 * transaction_hash as the key (x402 v0.x has both spellings in different
 * reference implementations), and either block_number or settled_at_block
 * for the block field (Coinbase facilitator and Stripe-x402 differ).
 *
 * Returns:
 *   - { tx_hash, block_number } where block_number is a finite integer or null.
 *   - null when the header is missing OR the tx_hash field is missing.
 *
 * The caller validates the tx_hash regex (0x + 64 hex). block_number is a
 * best-effort enrichment — if absent or malformed, we return null for it
 * rather than rejecting the whole settlement (chain RPC verification can
 * still proceed via tx_hash alone).
 */
function parseTxHashFromResponse(providerResp: Response): { tx_hash: string; block_number: number | null } | null {
  // Header lookup is case-insensitive per the Web API Headers spec, so this
  // handles X-PAYMENT-RESPONSE / x-payment-response / X-Payment-Response.
  const header = providerResp.headers.get('X-PAYMENT-RESPONSE');
  if (!header) {
    // Loud log so the diagnostic dump in settleHandler tells the full story.
    console.warn('[settle] X-PAYMENT-RESPONSE header absent from provider response');
    return null;
  }
  try {
    const decoded = Buffer.from(header, 'base64').toString('utf8');
    const json = JSON.parse(decoded);
    // Accept snake_case and camelCase across reference implementations.
    // Coinbase CDP, Stripe-x402, and the Foundation reference all settled
    // on slightly different field names through 2026-05.
    const txHash =
      json.tx_hash ?? json.transaction_hash ?? json.txHash ?? json.transactionHash ?? null;
    if (typeof txHash !== 'string') {
      const observedKeys = Object.keys(json).join(', ');
      console.warn(
        `[settle] X-PAYMENT-RESPONSE parsed but no recognized tx_hash field. ` +
          `Observed keys: [${observedKeys}]. Decoded body (first 400 bytes): ${decoded.slice(0, 400)}`,
      );
      return null;
    }
    // Block number: accept all observed names + camelCase. Coerce to a
    // finite safe integer; otherwise leave null and let chain-side
    // verification proceed via tx_hash alone.
    const rawBlock =
      json.block_number ??
      json.settled_at_block ??
      json.settled_at_block_number ??
      json.blockNumber ??
      json.settledAtBlock ??
      json.settledAtBlockNumber ??
      null;
    let blockNumber: number | null = null;
    if (typeof rawBlock === 'number' && Number.isFinite(rawBlock) && Number.isInteger(rawBlock) && rawBlock >= 0) {
      blockNumber = rawBlock;
    } else if (typeof rawBlock === 'string' && /^\d+$/.test(rawBlock)) {
      const n = Number(rawBlock);
      if (Number.isSafeInteger(n)) blockNumber = n;
    }
    return { tx_hash: txHash, block_number: blockNumber };
  } catch (parseErr: any) {
    console.warn(
      `[settle] malformed X-PAYMENT-RESPONSE (not base64-JSON): ${parseErr?.message || parseErr}. ` +
        `Header value (first 200): ${String(header).slice(0, 200)}`,
    );
    return null;
  }
}
