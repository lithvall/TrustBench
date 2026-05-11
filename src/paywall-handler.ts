// =============================================================================
// CRITIC PASS — Paywall v0.1.0 middleware (run 2026-05-11)
// =============================================================================
// Per CLAUDE.md mandatory critic discipline + prompts/critic.md.
//
// Three rejection reasons a hostile reviewer would give:
//   1. The branching auth model has DIFFERENT abuse profiles per branch and
//      we treat them as equivalent. Bearer-auth callers go through spend caps
//      (per-call + rolling-window). X-PAYMENT callers do not — their only cap
//      is whatever their wallet can sustain. A wallet with $1,000 USDC can
//      drain it across thousands of /route calls with zero TrustBench-side
//      rate limit. The Bearer flow has spend caps for a reason; bypassing
//      them entirely for x402-paying agents is asymmetric.
//
//   2. (CAUGHT MID-CRITIC, FIXED.) The first draft of buildProviderPaymentRequirements
//      read `providers.pay_to` from the DB. That column is `null` for the
//      dominant Agentic Market path (crawler.ts:152) because Agentic Market
//      does not expose payTo on the catalog. The existing Bearer flow learns
//      pay_to via a live 402 probe at request time. My paywall handler would
//      have 503'd for the vast majority of providers. Fixed by exporting
//      probeFor402Challenge + loadProbeConfig from route-handlers.ts and
//      reusing the live-probe path. Lessons.md entry 2026-05-11.
//
//   3. Idempotency replay caches a SIGNED routing receipt. The cached
//      signature covers the original tx_hash and the original `settled_at`
//      timestamp. A downstream consumer reading the receipt body 12 hours
//      later (still within the 24h replay window) sees a signed envelope
//      that describes itself as "freshly issued at <12-hour-old timestamp>"
//      with no marker that it was a replay. The HTTP X-Idempotent-Replay
//      header carries that signal, but bodies copied out of logs lose it.
//      We're conflating "valid signature" with "fresh signature."
//
// Counter-thesis (case for the opposite approach):
//   Skip the paywall entirely for v0.1.0. Keep /route Bearer-only. Sell
//   TrustBench API keys (one-time onboarding) with up-front USDC top-up to
//   a TrustBench-internal balance. Bill against the balance per call.
//   Halves the failure surface (no facilitator round-trip on the hot path),
//   keeps spend caps everywhere, no replay-signature ambiguity. The cost is
//   integration friction (agents need to top up internally rather than just
//   sign-and-pay) but Phase 2 builder conversations validated this exact
//   shape (flat-per-tx + subscription) and rejected the alternative.
//
// Wedge competitor who would beat this:
//   A hypothetical "Router402" that ships single-payment-per-call where
//   TrustBench's fee comes out of the agent's authorization to the provider
//   (facilitator splits: 90% provider, 10% TrustBench). Agent signs ONCE.
//   Looks like vanilla x402 from the agent side. Halves the failure surface.
//   Would ship faster and integrate cleaner. Counter: x402 spec does not yet
//   support fee-split semantics in `accepts[]`; would require Foundation
//   extension proposal which is deferred per the AP2 / strategic decisions.
//
// Hidden assumption that, if wrong, breaks the whole thesis:
//   The public Foundation facilitator at x402.org/facilitator is stable
//   enough for production paywall traffic AND stays within free-tier limits
//   for v0.1.0 volume. If the facilitator rate-limits or 5xxs, the paywall
//   hard-fails for every call until ops manually swaps TRUSTBENCH_FACILITATOR_URL
//   to Coinbase CDP (which needs CDP creds we don't have provisioned).
//   Single point of failure with no fallback.
//
// Kill criterion:
//   If the public Foundation facilitator returns 5xx or rate-limits more than
//   5% of paywall calls in the first 4 weeks of v0.1.0 launch, switch to
//   Coinbase CDP facilitator (provision CDP creds, swap env var). If CDP
//   also rejects >5%, abandon the public-paywall thesis and revert /route
//   to Bearer-only with internal billing.
//
// Verdict: weak-reject → upgraded to acceptable after v0.1.1 gates landed (2026-05-11).
//
// Original verdict was weak-reject pending two v0.1.1 follow-ups; both landed
// in the same session:
//   (a) Per-paying-wallet hourly rate limit — implemented in this file via
//       countRecentPaidRequests + the 429 branch in handlePaidRoute step 4b.
//       Tunable via TRUSTBENCH_PAYWALL_HOURLY_LIMIT env var; default 60/hour.
//   (b) `replayed_at` marker in cached receipt body — implemented in this
//       file at the idempotency-replay return site. Field is OUTSIDE the
//       signed receipt bytes so original signature remains valid; downstream
//       consumers reading the body can distinguish fresh from replayed.
// Smoke S3 in scripts/paywall-smoke.ts validates both the marker and that
// the inner receipt + signature are byte-identical to the original.
//
// Hidden assumption + kill criterion remain in force as written. The
// counter-thesis (single-payment-per-call) is the right v2.0 direction once
// x402 spec supports fee-split semantics in accepts[]; for v0.1.0 the
// two-payment shape is the right ship.
// =============================================================================
//
// src/paywall-handler.ts — Phase 4 v0.1.0 paywall middleware for POST /route.
// =============================================================================
// HIGH-RISK SURFACE per CLAUDE.md.
// Canonical design: phase4-paywall-design.md (esp. § Q3, Q4, § 7 failure modes).
// Schema: phase4-schema-paid-requests.sql.
// Sprint plan: phase4-listing-plan.md § 2 Day 3.
// =============================================================================
//
// What this does
// --------------
// `paywallGate` is a Hono pre-middleware that mounts in front of the existing
// requireAgent / withIdempotency / requireWithinSpendCap / quoteHandler chain
// on POST /route. It branches on auth model:
//
//   1. TRUSTBENCH_PAYWALL_ENABLED=false  -> next()  [existing Bearer flow]
//   2. flag=true, X-PAYMENT present       -> handlePaidRoute() [paywall path]
//   3. flag=true, no X-PAYMENT, no Bearer -> 402 with payment requirements
//   4. flag=true, no X-PAYMENT, Bearer    -> next()  [existing Bearer flow]
//
// Branch 2 (paywall path) does NOT call next(); it handles the request inline
// and returns 200, completely bypassing requireAgent + spend caps. The payment
// IS the auth signal.
//
// Non-custodial contract
// ----------------------
// TrustBench never holds the agent's USDC. The flow:
//   - Agent signs EIP-3009 transferWithAuthorization to TrustBench's revenue
//     wallet for $0.005 (or the live tier price).
//   - The public Foundation facilitator at x402.org/facilitator submits the
//     transfer on-chain. The facilitator pays its own gas. We never see the
//     private key.
//   - We observe success via the facilitator's settle response (tx_hash) and
//     emit a signed routing receipt. The agent then pays the provider DIRECTLY
//     using payment_requirements_v2 we return — that second payment does not
//     route through TrustBench at all in v0.1.0.
//
// Failure-mode paragraph (high-risk discipline)
// ---------------------------------------------
// If this code is wrong, the worst plausible outcomes:
//
//   A. Settle is accepted before facilitator confirms on-chain → agent gets a
//      routing decision they didn't pay for. Mitigated: we always await the
//      facilitator's settle() response and reject if success !== true.
//
//   B. Idempotency-key namespace collision (two wallets, same key, one sees
//      the other's cached response). Mitigated: dedup key in paid_requests is
//      (agent_address, idempotency_key); single-column lookups are forbidden.
//
//   C. Revenue wallet env var typo → payments go to the wrong address. Mitigated:
//      boot-time validation in src/index.ts; the 0x40-hex regex catches malformed
//      values. Manual confirmation via scripts/facilitator-settle-test.ts catches
//      "valid but wrong" before TRUSTBENCH_PAYWALL_ENABLED flips true.
//
//   D. Idempotency replay returns a response_body but the agent's CURRENT body
//      hash differs from the original → we 409. The cached response only fires
//      on a true matching retry; a different body with the same key fails loud.
//
//   E. Facilitator down / timeouts → 502 from this middleware, no money moves
//      (agent's nonce is unused on-chain). Agent retries with same nonce when
//      facilitator recovers.
//
// Critic pass (mandatory per CLAUDE.md prompts/critic.md) lives in the same PR
// description / commit body as this file.
// =============================================================================

import { Context, MiddlewareHandler, Next } from 'hono';
import { ulid } from 'ulid';
import { createHash } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { HTTPFacilitatorClient } from '@x402/core/server';
import type { PaymentRequirements, PaymentPayload } from '@x402/core/types';
import { facilitator as cdpFacilitatorConfig } from '@coinbase/x402';
import { selectProvider } from './provider-selection.js';
import { signWithEd25519 } from './scorer.js';
import { jcsCanonicalize } from './idempotency.js';
import { probeFor402Challenge, loadProbeConfig } from './route-handlers.js';

// -----------------------------------------------------------------------------
// Constants — anchored on the design doc + .env.example
// -----------------------------------------------------------------------------
const BASE_USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const BASE_NETWORK_CAIP = 'eip155:8453';
const ROUTING_FEE_ATOMIC = '5000';                 // $0.005, 6-decimal USDC
const ROUTING_FEE_USDC = '0.005';                  // human display
const MAX_TIMEOUT_SECONDS = 60;
const DEFAULT_FACILITATOR_URL = 'https://x402.org/facilitator';

// Receipt envelope versioning. Bump when the canonical body shape changes.
const ROUTING_RECEIPT_KIND = 'paid_response.route';
const ROUTING_RECEIPT_VERSION = '1.0.0';

// v0.1.1 rate limit (Critic verdict gate #1).
// X-PAYMENT-paying callers bypass the Bearer flow's spend caps (per-call +
// rolling window). Without a substitute control, a wallet with $1,000 USDC
// could drain it across thousands of /route calls. This adds a crude
// per-paying-wallet hourly cap so a runaway agent stops itself before
// burning the wallet.
//
// Tunable via TRUSTBENCH_PAYWALL_HOURLY_LIMIT. Default 60 = one call per
// minute average, which comfortably covers all expected v0.1.0 traffic
// patterns (paid agents are not high-frequency at $0.005/call). Set to 0
// to disable.
//
// Reservation accuracy is "best-effort fast" — we count paid_requests
// rows with created_at >= now-1h. A burst that lands within a single
// second can technically exceed the cap by N-1 (concurrent inserts race
// the count query), same trade-off as Phase 3's pre-reservation spend
// caps. v0.2.0 can tighten via a Postgres function similar to
// claim_spend_reservation if needed.
const PAYWALL_HOURLY_LIMIT_DEFAULT = 60;

// Supabase client uses the codebase's existing env convention.
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

// Facilitator client — single instance for all calls.
//
// CRITICAL (caught 2026-05-11 during § 1.3 settle test): the public Foundation
// facilitator at x402.org/facilitator does NOT support Base mainnet
// `exact + eip155:8453`. It's a testnet-only reference facilitator
// (Base Sepolia + Solana Devnet per CDP docs § "Facilitator URLs"). For
// production Base mainnet paywall traffic, we must use Coinbase CDP's
// hosted facilitator at api.cdp.coinbase.com/platform/v2/x402, which
// requires JWT auth via CDP API key.
//
// The @coinbase/x402 package exports a pre-built FacilitatorConfig that
// handles all the JWT-signing boilerplate (Ed25519, 2-min expiry,
// per-request regeneration) — we just import and pass to HTTPFacilitatorClient.
// It reads CDP_API_KEY_ID + CDP_API_KEY_SECRET from process.env on each call.
//
// Fallback path: if CDP creds are NOT set, we use the configurable URL
// (defaulting to the Foundation facilitator at x402.org/facilitator). That
// fallback ONLY works for testnet calls — Base Sepolia `eip155:84532` and
// Solana Devnet. Production paywall traffic on Base mainnet will fail with
// "No facilitator registered for scheme: exact and network: eip155:8453"
// without CDP creds. The setup is documented in phase4-1.3-preflight-runbook.md.
function buildFacilitator(): HTTPFacilitatorClient {
  const hasCdp = !!process.env.CDP_API_KEY_ID && !!process.env.CDP_API_KEY_SECRET;
  if (hasCdp) {
    return new HTTPFacilitatorClient(cdpFacilitatorConfig);
  }
  const url = process.env.TRUSTBENCH_FACILITATOR_URL || DEFAULT_FACILITATOR_URL;
  console.warn(
    `[paywall] CDP_API_KEY_ID / CDP_API_KEY_SECRET not set; falling back to ${url}. ` +
      `Base mainnet (eip155:8453) settle calls WILL fail against the Foundation facilitator. ` +
      `Set CDP env vars before flipping TRUSTBENCH_PAYWALL_ENABLED=true in prod.`,
  );
  return new HTTPFacilitatorClient({ url });
}
const facilitator = buildFacilitator();

// -----------------------------------------------------------------------------
// Header / body helpers
// -----------------------------------------------------------------------------
function isPaywallEnabled(): boolean {
  return process.env.TRUSTBENCH_PAYWALL_ENABLED === 'true';
}

function getRevenueWallet(): string | null {
  const v = process.env.TRUSTBENCH_REVENUE_WALLET_ADDRESS;
  if (!v || !/^0x[0-9a-fA-F]{40}$/.test(v.trim())) return null;
  return v.trim();
}

// Returns the configured hourly limit, or 0 when disabled. Reads the env var
// on every call so ops can flip it at runtime via Railway without redeploy
// (same pattern as TRUSTBENCH_PAYWALL_ENABLED).
function getHourlyLimit(): number {
  const raw = process.env.TRUSTBENCH_PAYWALL_HOURLY_LIMIT;
  if (raw === undefined || raw === '') return PAYWALL_HOURLY_LIMIT_DEFAULT;
  const parsed = parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return PAYWALL_HOURLY_LIMIT_DEFAULT;
  return parsed;
}

// Count paid_requests rows for this agent_address in the last hour.
// Returns -1 on lookup error so the caller can fail-open (the cap is
// best-effort; we don't want to 503 every paywall call just because the
// rate-limit query had a transient DB error). The trade-off: if the DB is
// down, the rate limit is also down. Acceptable for v0.1.1.
async function countRecentPaidRequests(agentAddress: string): Promise<number> {
  const since = new Date(Date.now() - 3600 * 1000).toISOString();
  const { count, error } = await supabase
    .from('paid_requests')
    .select('id', { count: 'exact', head: true })
    .eq('agent_address', agentAddress)
    .gte('created_at', since);
  if (error) {
    console.warn(`[paywall] hourly-count query failed (failing open): ${error.message}`);
    return -1;
  }
  return count ?? 0;
}

// Sha256 of the JCS-canonicalized request body. Same convention as
// receipt-generator.ts so a verifier could in principle re-derive both
// hashes from the same wire data.
function bodyHash(obj: unknown): string {
  const canon = jcsCanonicalize(obj);
  return 'sha256:' + createHash('sha256').update(canon).digest('hex');
}

// -----------------------------------------------------------------------------
// Routing receipt — signed envelope returned on successful paywall calls.
// Different `kind` from Phase 3 settlement receipts (which cover provider
// settlement, not just the routing fee). Per design doc § Q8.
// -----------------------------------------------------------------------------
type RoutingReceipt = {
  kind: 'paid_response.route';
  version: string;
  receipt_id: string;
  issued_at: string;
  issuer: string;
  paid: {
    chain: 'base';
    tx_hash: string;
    block_number?: number;
    payer_address: string;
    payee_address: string;
    amount_atomic: string;
    currency: 'USDC';
    decimals: 6;
    settled_at: string;
  };
  routing: {
    capability: string;
    provider_id: string;
    provider_url: string;
    score_at_decision: number;
    alternatives_considered: number;
    selection_reason: 'top_score' | 'sole_provider';
  };
  call: {
    idempotency_key: string | null;
    request_hash: string;
  };
};

type SignedRoutingResponse = {
  receipt: RoutingReceipt;
  signature: {
    alg: 'ed25519';
    value: string;
    key_id: string;
    public_key_url: string;
  };
  // The provider payment requirements the agent uses for their NEXT call
  // (direct to the provider, not through TrustBench). v0.2.0 may add a
  // /route/settle paywall path; for v0.1.0 the agent pays the provider direct.
  next_step: {
    provider_url: string;
    payment_requirements_v2: PaymentRequirements;
  };
};

// -----------------------------------------------------------------------------
// 402 emitter — what we return when paywall is on and no X-PAYMENT was given.
// -----------------------------------------------------------------------------
function build402(revenueWallet: string): {
  status: 402;
  body: { x402Version: number; error: string; accepts: PaymentRequirements[] };
} {
  return {
    status: 402,
    body: {
      x402Version: 2,
      error: 'payment_required',
      accepts: [
        {
          scheme: 'exact',
          network: BASE_NETWORK_CAIP,
          asset: BASE_USDC_ADDRESS,
          amount: ROUTING_FEE_ATOMIC,
          payTo: revenueWallet,
          maxTimeoutSeconds: MAX_TIMEOUT_SECONDS,
          // USDC v2 EIP-712 domain — required by the facilitator's verify side
          // to reconstruct the domain separator. Matches x402-ecosystem-state.md.
          extra: {
            name: 'USD Coin',
            version: '2',
            description: 'TrustBench routing fee. Pays for the differentiated routing decision and signed routing receipt. Provider payment is a separate x402 transaction, paid directly to the provider after this call.',
          },
        },
      ],
    },
  };
}

// -----------------------------------------------------------------------------
// X-PAYMENT decode — base64 JSON envelope per x402 v2.
// We need (agent_address) from payload.from to namespace idempotency lookups
// and to set the `payer_address` on the routing receipt. The full envelope is
// passed verbatim to the facilitator.
// -----------------------------------------------------------------------------
function decodeXPayment(xPayment: string): { payload: PaymentPayload; payerAddress: string } | null {
  try {
    const decoded = Buffer.from(xPayment, 'base64').toString('utf8');
    const obj = JSON.parse(decoded) as PaymentPayload;
    // Sanity: required envelope keys
    if (!obj || typeof obj !== 'object') return null;
    if (typeof (obj as any).x402Version !== 'number') return null;
    if (!(obj as any).payload || !(obj as any).accepted) return null;
    // EIP-3009 path: payload.authorization.from is the agent's wallet address
    const auth = (obj as any).payload?.authorization;
    if (!auth || typeof auth.from !== 'string') return null;
    if (!/^0x[0-9a-fA-F]{40}$/.test(auth.from)) return null;
    return { payload: obj, payerAddress: auth.from.toLowerCase() };
  } catch {
    return null;
  }
}

// -----------------------------------------------------------------------------
// Build provider payment requirements (v2) for the agent's NEXT call.
//
// CRITICAL: do NOT read providers.pay_to from the DB. The dominant crawler
// source (Agentic Market) stores `pay_to: null` for every row (crawler.ts:152)
// because Agentic Market does not expose payTo on the catalog — the existing
// Bearer flow learns it via a live 402 probe at request time (route-handlers.ts
// probeFor402Challenge). The paywall path must do the same or it would 503 for
// the vast majority of providers.
//
// This caught-by-Critic-pass bug nearly shipped. See lessons.md 2026-05-11.
// -----------------------------------------------------------------------------
async function buildProviderPaymentRequirements(
  providerId: string,
  providerUrl: string,
  maxPriceAtomic: string,
): Promise<PaymentRequirements | null> {
  const probeConfig = await loadProbeConfig(providerId);
  const probeOutcome = await probeFor402Challenge(providerUrl, probeConfig);
  if (!probeOutcome) {
    // Provider did not return a parseable 402 challenge. The Bearer flow has
    // a secondary-provider fallback at this point; v0.1.0 paywall keeps it
    // simple and returns null so the caller emits 503 BEFORE settle. A more
    // resilient v0.2 could try selection.secondary here.
    return null;
  }

  // Prefer the merchant's raw v2 accepts[0] passthrough when present — that's
  // the SDK-native shape an agent's x402 client expects. Falls back to building
  // a v2 requirements object from the legacy v0.x challenge fields when the
  // provider only emitted the flat shape (e.g. local mock-provider).
  if (probeOutcome.raw_accepts && typeof probeOutcome.raw_accepts === 'object') {
    // Cast through unknown — raw_accepts from the live probe is intentionally
    // typed as Record<string, any> because merchant dialects vary. The v2 SDK's
    // zod re-validates at runtime, so a malformed envelope fails loud on the
    // agent's side instead of silently.
    return probeOutcome.raw_accepts as unknown as PaymentRequirements;
  }

  // Legacy v0.x synthesis path. Build a minimal PaymentRequirements from the
  // probed challenge. The agent will sign EIP-3009 against this; the provider's
  // own facilitator does the verify on their end.
  const ch = probeOutcome.challenge;
  if (!ch.recipient || !/^0x[0-9a-fA-F]{40}$/.test(ch.recipient)) return null;
  if (!ch.amount || !/^\d+$/.test(ch.amount)) return null;
  // Cap the agent's exposure at max_price even if the provider quoted higher.
  // If the provider's quote exceeds max_price, refuse: the agent declared a
  // budget and we honor it.
  if (BigInt(ch.amount) > BigInt(maxPriceAtomic)) return null;

  return {
    scheme: 'exact',
    network: BASE_NETWORK_CAIP,
    asset: ch.asset_address || BASE_USDC_ADDRESS,
    amount: ch.amount,
    payTo: ch.recipient,
    maxTimeoutSeconds: MAX_TIMEOUT_SECONDS,
    extra: {
      name: 'USD Coin',
      version: '2',
      description: `Provider payment for ${providerUrl}. Separate x402 transaction from the TrustBench routing fee.`,
    },
  };
}

// -----------------------------------------------------------------------------
// Build + sign a routing receipt envelope.
// -----------------------------------------------------------------------------
function signRoutingReceipt(receipt: RoutingReceipt): SignedRoutingResponse['signature'] | null {
  const canonical = jcsCanonicalize(receipt);
  // signWithEd25519 takes a Buffer; receipt-generator.ts uses the same
  // Buffer.from(..., 'utf8') wrapper. Matches what verifiers reconstruct
  // when hashing the canonical bytes for verification.
  const sig = signWithEd25519(Buffer.from(canonical, 'utf8'));
  if (!sig) return null;
  const issuer = process.env.TRUSTBENCH_ISSUER_HOST || 'trustbench.io';
  const baseUrl = process.env.TRUSTBENCH_BASE_URL || `https://${issuer}`;
  const keyId = process.env.TRUSTBENCH_KEY_ID || 'trustbench-2026';
  return {
    alg: 'ed25519',
    value: sig,
    key_id: keyId,
    public_key_url: `${baseUrl}/.well-known/trustbench-pubkey`,
  };
}

// -----------------------------------------------------------------------------
// Idempotency replay — look up a prior paid_requests row by (agent_address,
// idempotency_key), confirm body hashes match, return cached response.
// -----------------------------------------------------------------------------
async function checkIdempotencyReplay(
  agentAddress: string,
  idempotencyKey: string,
  currentBodyHash: string,
): Promise<{ hit: true; cached: unknown } | { hit: false; conflict: true } | { hit: false; conflict: false }> {
  // 24-hour replay window per design doc § Q4.
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { data, error } = await supabase
    .from('paid_requests')
    .select('request_payload_hash, response_body')
    .eq('agent_address', agentAddress)
    .eq('idempotency_key', idempotencyKey)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) {
    console.warn('[paywall] idempotency lookup error:', error.message);
    return { hit: false, conflict: false };
  }
  if (!data || data.length === 0) return { hit: false, conflict: false };
  const row = data[0];
  if (row.request_payload_hash !== currentBodyHash) {
    return { hit: false, conflict: true };
  }
  if (!row.response_body) {
    // Row exists but no cached body (shouldn't happen with the new schema,
    // but guard anyway). Treat as no replay; the call will write a fresh row.
    return { hit: false, conflict: false };
  }
  return { hit: true, cached: row.response_body };
}

// -----------------------------------------------------------------------------
// Persist a paid_requests row. Service-role only per RLS.
// -----------------------------------------------------------------------------
async function persistPaidRequest(row: {
  endpoint: string;
  agent_address: string;
  tx_hash: string;
  block_number: number | null;
  amount_usdc: string;
  request_payload_hash: string;
  response_signature: string | null;
  response_body: unknown;
  idempotency_key: string | null;
}): Promise<{ ok: true; id: string } | { ok: false; reason: string }> {
  const { data, error } = await supabase
    .from('paid_requests')
    .insert(row)
    .select('id')
    .single<{ id: string }>();
  if (error || !data) {
    return { ok: false, reason: error?.message ?? 'no rows returned' };
  }
  return { ok: true, id: data.id };
}

// -----------------------------------------------------------------------------
// The paid-route handler. Called by paywallGate when X-PAYMENT is present.
// -----------------------------------------------------------------------------
async function handlePaidRoute(c: Context, xPayment: string): Promise<Response> {
  // 1. Parse the agent's request body. Same fields the Bearer flow expects:
  // capability + max_price (for the PROVIDER payment) + payer_address.
  let body: any = null;
  try {
    const raw = await c.req.text();
    body = raw.length > 0 ? JSON.parse(raw) : {};
  } catch {
    return c.json({ error: 'body_invalid_json' }, 400);
  }

  const capability = String(body.capability || '').toLowerCase().trim();
  const maxPriceAtomic = String(body.max_price || '').trim();
  const payerAddressFromBody = String(body.payer_address || '').toLowerCase().trim();
  const idempotencyKey = c.req.header('Idempotency-Key') || null;

  if (!['search', 'inference', 'data', 'media', 'infra'].includes(capability)) {
    return c.json({ error: 'capability_invalid', detail: 'must be one of search, inference, data, media, infra' }, 400);
  }
  if (!/^\d+$/.test(maxPriceAtomic)) {
    return c.json({ error: 'max_price_invalid', detail: 'must be a non-negative integer string (atomic USDC)' }, 400);
  }
  if (!/^0x[0-9a-fA-F]{40}$/.test(payerAddressFromBody)) {
    return c.json({ error: 'payer_address_invalid', detail: 'must be 0x + 40 hex chars' }, 400);
  }

  // 2. Decode X-PAYMENT and confirm the from-address matches body.payer_address.
  // A mismatch here means the agent signed a payment from one wallet but
  // declared a different payer in the body — most likely a client bug, but
  // we reject because the receipt's payer_address must match the on-chain
  // payer or the audit story breaks.
  const decoded = decodeXPayment(xPayment);
  if (!decoded) {
    return c.json({ error: 'x_payment_malformed', detail: 'X-PAYMENT header is not a valid base64 JSON x402 v2 envelope' }, 400);
  }
  if (decoded.payerAddress !== payerAddressFromBody) {
    return c.json({
      error: 'x_payment_payer_mismatch',
      detail: 'X-PAYMENT.authorization.from does not match body.payer_address',
    }, 400);
  }
  const agentAddress = decoded.payerAddress;

  // 3. Compute body hash for the idempotency check + receipt content addressing.
  const reqBodyHash = bodyHash(body);

  // 4. Idempotency replay (per design doc § Q4 + § 7 mitigation #2).
  if (idempotencyKey) {
    if (idempotencyKey.length < 16 || idempotencyKey.length > 128) {
      return c.json({ error: 'idempotency_key_invalid', detail: 'must be 16-128 chars' }, 400);
    }
    const replay = await checkIdempotencyReplay(agentAddress, idempotencyKey, reqBodyHash);
    if (replay.hit) {
      // v0.1.1 replay marker (Critic verdict gate #2).
      //
      // The cached body's `receipt` field carries an Ed25519 signature over
      // the ORIGINAL settled_at timestamp. If a downstream consumer copies
      // the body out of a log 12 hours later, they see a valid signature
      // over a 12-hour-old timestamp with no indication that it was a
      // replay — and the X-Idempotent-Replay HTTP header is gone.
      //
      // Fix: add a top-level `replayed_at: <now-iso>` field to the response
      // body. It's OUTSIDE the signed bytes (signature was computed before
      // this field existed), so the original signature is still valid over
      // the receipt. A consumer reading the body can see both fields:
      //   - receipt.issued_at  → when the routing decision was originally signed
      //   - replayed_at        → when THIS response was emitted (now)
      // and distinguish fresh vs. replayed.
      //
      // Defensive: only add the field if the cached body is an object. A
      // primitive cached value would mean an upstream bug; we still return
      // it as-is rather than crashing.
      const cached = replay.cached;
      const withReplayMarker = (cached && typeof cached === 'object' && !Array.isArray(cached))
        ? { ...(cached as Record<string, unknown>), replayed_at: new Date().toISOString() }
        : cached;
      return c.json(withReplayMarker as Record<string, unknown>, 200, {
        'X-Idempotent-Replay': 'true',
      });
    }
    if ('conflict' in replay && replay.conflict) {
      return c.json({
        error: 'idempotency_key_reused_with_different_body',
        detail: 'same Idempotency-Key used with a different request body within the 24h replay window',
      }, 409);
    }
  }

  // 4b. v0.1.1 rate-limit gate. Substitute for the Bearer spend caps the
  // X-PAYMENT branch bypasses. Idempotency replay already returned above
  // (cached responses don't count). Runs BEFORE facilitator verify so we
  // don't waste a facilitator round-trip on a request we'll reject.
  const hourlyLimit = getHourlyLimit();
  if (hourlyLimit > 0) {
    const recentCount = await countRecentPaidRequests(agentAddress);
    if (recentCount >= 0 && recentCount >= hourlyLimit) {
      return c.json({
        error: 'paywall_hourly_limit_exceeded',
        detail: `agent_address ${agentAddress} has ${recentCount} paid_requests in the last hour; limit is ${hourlyLimit}. Retry after the window rolls.`,
        limit: hourlyLimit,
        window_seconds: 3600,
      }, 429, {
        'Retry-After': '60',
      });
    }
    // recentCount === -1 means the lookup errored; we fail open per the
    // function's comment. The error was already logged.
  }

  // 5. Verify TrustBench-fee payment via facilitator (read-only; no money moves).
  // Build the requirements we'd have emitted in a 402 — must match exactly what
  // the agent signed against, or signature recovery fails.
  const revenueWallet = getRevenueWallet();
  if (!revenueWallet) {
    console.error('[paywall] TRUSTBENCH_REVENUE_WALLET_ADDRESS missing or malformed; refusing to handle paid call');
    return c.json({ error: 'paywall_misconfigured', detail: 'revenue wallet not configured' }, 503);
  }
  const trustbenchRequirements: PaymentRequirements = {
    scheme: 'exact',
    network: BASE_NETWORK_CAIP,
    asset: BASE_USDC_ADDRESS,
    amount: ROUTING_FEE_ATOMIC,
    payTo: revenueWallet,
    maxTimeoutSeconds: MAX_TIMEOUT_SECONDS,
    extra: { name: 'USD Coin', version: '2' },
  };

  let verifyResp;
  try {
    verifyResp = await facilitator.verify(decoded.payload, trustbenchRequirements);
  } catch (e: any) {
    console.error('[paywall] facilitator verify threw:', e?.message || e);
    return c.json({ error: 'paywall_verify_failed', detail: String(e?.message || e) }, 502);
  }
  if (!verifyResp.isValid) {
    return c.json({
      error: 'paywall_verify_invalid',
      detail: verifyResp.invalidReason || verifyResp.invalidMessage || 'facilitator rejected the payment',
    }, 402);
  }

  // 6. Select provider BEFORE settling. If no provider is available, refuse
  // to take the agent's money. Design rationale (per the Day-3 question we
  // locked with Johan): paid_requests row is only written when the agent
  // actually gets the differentiated work they paid for. Selecting before
  // settle makes that guarantee easier — if selection fails, we never
  // charge.
  const selection = await selectProvider(capability as any, 'live');
  if (!selection.ok) {
    return c.json({
      error: selection.reason,
      detail: 'no eligible provider for this capability; not charging the routing fee',
    }, 503);
  }
  const chosen = selection.primary;
  // ProviderPick exposes provider_url (== provider_id in the current
  // url-as-key schema). Using provider_url consistently lets a future
  // schema change to numeric ids work without rewriting this handler.
  const providerPaymentReqs = await buildProviderPaymentRequirements(
    chosen.provider_id,
    chosen.provider_url,
    maxPriceAtomic,
  );
  if (!providerPaymentReqs) {
    // Refusal-to-charge path: the live probe of the selected provider either
    // failed (provider unreachable, timed out, returned non-402, or was
    // suspended by its owner) OR returned a 402 that's missing the recipient/
    // amount fields we need to build a v2 PaymentRequirements envelope.
    //
    // Non-custodial property: we have NOT charged the agent's wallet at this
    // point. No facilitator settle call has been made. The agent's nonce is
    // unused on-chain. They can retry the request (with the same wallet, same
    // capability, possibly different idempotency-key) once the registry has a
    // conformant provider for this capability. This refusal-to-charge under
    // provider-conformance failures is documented in
    // `phase4-paywall-design.md` § 7 ("Failure modes").
    //
    // Observed root causes for this 503 (logged at probe time in
    // route-handlers.ts probeFor402Challenge):
    //   - Provider's Render dyno is suspended-by-user (returns 503 with
    //     suspend-by-user routing header — observed 2026-05-11)
    //   - Provider needs POST but probe defaulted to GET (probe_config not
    //     stored in providers.metadata.x402_probe_config — registry-curation
    //     gap, v0.2.0 follow-up)
    //   - Provider's accepts[0] envelope is missing recipient field
    //   - Network/RPC timeout to the provider's host
    //
    // The probe outcome is logged on the merchant side (search server logs for
    // `[probe]` lines) — that's where to start diagnosing if this fires.
    return c.json({
      error: 'provider_payment_requirements_unavailable',
      detail:
        `selected provider ${chosen.provider_id} did not return a parseable x402 challenge to the live probe; ` +
        `not charging the routing fee. agent wallet is unaffected. ` +
        `causes can include: provider unreachable, provider suspended, GET-vs-POST mismatch, or non-conformant 402 envelope. ` +
        `check server logs for [probe] lines.`,
      provider: chosen.provider_id,
    }, 503);
  }

  // 7. Settle the TrustBench fee via facilitator (real on-chain submission).
  let settleResp;
  try {
    settleResp = await facilitator.settle(decoded.payload, trustbenchRequirements);
  } catch (e: any) {
    console.error('[paywall] facilitator settle threw:', e?.message || e);
    return c.json({ error: 'paywall_settle_failed', detail: String(e?.message || e) }, 502);
  }
  if (!settleResp.success) {
    return c.json({
      error: 'paywall_settle_rejected',
      detail: settleResp.errorReason || settleResp.errorMessage || 'facilitator rejected the settlement',
    }, 402);
  }
  const txHash = settleResp.transaction;

  // 8. Build + sign the routing receipt.
  const receiptId = 'rrcpt_' + ulid();
  const settledAt = new Date().toISOString();
  const receipt: RoutingReceipt = {
    kind: ROUTING_RECEIPT_KIND,
    version: ROUTING_RECEIPT_VERSION,
    receipt_id: receiptId,
    issued_at: settledAt,
    issuer: process.env.TRUSTBENCH_ISSUER_HOST || 'trustbench.io',
    paid: {
      chain: 'base',
      tx_hash: txHash,
      payer_address: agentAddress,
      payee_address: revenueWallet,
      amount_atomic: ROUTING_FEE_ATOMIC,
      currency: 'USDC',
      decimals: 6,
      settled_at: settledAt,
    },
    routing: {
      capability,
      provider_id: chosen.provider_id,
      provider_url: chosen.provider_url,
      score_at_decision: chosen.score,
      alternatives_considered: selection.alternatives_considered,
      selection_reason: selection.selection_reason,
    },
    call: {
      idempotency_key: idempotencyKey,
      request_hash: reqBodyHash,
    },
  };

  const signature = signRoutingReceipt(receipt);
  if (!signature) {
    // Loud failure path. If we couldn't sign, we shouldn't return a fake
    // unsigned envelope (per receipt-generator.ts contract: Ed25519 only,
    // no HMAC fallback for paid responses). The agent paid; we owe them
    // a real audit story. Without signing, the audit story is broken.
    // Return 500 + a manual-reconciliation pointer.
    console.error(`[paywall] FATAL: Ed25519 sign failed for receipt ${receiptId}; tx_hash=${txHash} agent=${agentAddress}`);
    return c.json({
      error: 'receipt_signing_unavailable',
      detail: 'payment settled on-chain but receipt could not be signed. Contact support with tx_hash for manual reconciliation.',
      tx_hash: txHash,
    }, 500);
  }

  const response: SignedRoutingResponse = {
    receipt,
    signature,
    next_step: {
      provider_url: chosen.provider_url,
      payment_requirements_v2: providerPaymentReqs,
    },
  };

  // 9. Persist paid_requests row (service-role, RLS bypass). This is the
  // revenue audit row. If persistence fails AFTER settle succeeded, we
  // still return 200 to the agent (they paid, they got a signed receipt)
  // but log loud so a daily reconciliation job notices.
  const persisted = await persistPaidRequest({
    endpoint: '/route',
    agent_address: agentAddress,
    tx_hash: txHash,
    block_number: null,  // facilitator's settle response doesn't always include block; left null for v0.1.0
    amount_usdc: ROUTING_FEE_USDC,
    request_payload_hash: reqBodyHash,
    response_signature: signature.value,
    response_body: response,
    idempotency_key: idempotencyKey,
  });
  if (!persisted.ok) {
    console.error(`[paywall] paid_requests insert failed for tx=${txHash}: ${persisted.reason} (agent paid but row not written; reconciliation needed)`);
    // Continue to return 200 — agent got the signed receipt; the row is
    // for our books, not the agent's. Daily reconciliation against on-chain
    // recovers anything missed here.
  }

  return c.json(response, 200, {
    'X-Receipt-Id': receiptId,
  });
}

// -----------------------------------------------------------------------------
// The Hono middleware itself. This is what gets mounted in src/index.ts.
// -----------------------------------------------------------------------------
export const paywallGate: MiddlewareHandler = async (c: Context, next: Next) => {
  // Branch 1: flag off → existing Bearer chain.
  if (!isPaywallEnabled()) {
    return next();
  }

  // Branch decision needs the X-PAYMENT and Authorization headers.
  const xPayment = c.req.header('X-PAYMENT');
  const authHeader = c.req.header('Authorization');

  // Branch 2: X-PAYMENT present → paywall path. Skip Bearer auth + spend caps.
  if (xPayment) {
    return handlePaidRoute(c, xPayment);
  }

  // Branch 4: Bearer present, no X-PAYMENT → existing flow (Bearer wins when
  // both auth modes coexist during the transition window).
  if (authHeader) {
    return next();
  }

  // Branch 3: nothing → 402.
  const revenueWallet = getRevenueWallet();
  if (!revenueWallet) {
    console.error('[paywall] paywall enabled but TRUSTBENCH_REVENUE_WALLET_ADDRESS missing; returning 503');
    return c.json({ error: 'paywall_misconfigured', detail: 'revenue wallet not configured' }, 503);
  }
  const { status, body } = build402(revenueWallet);
  return c.json(body, status);
};
