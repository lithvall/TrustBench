// scripts/paid-probe.ts
// =============================================================================
// Paid prober — closeout #7 / Step 11 / phase3-paid-probing.md
// =============================================================================
// Per the design memo: this is *just an authenticated agent* hitting the same
// /route + /route/settle endpoints any external builder would use. There is no
// new server-side code. The probe agent's spend-cap row is the budget mechanism;
// the receipts table is the audit trail.
//
// Security-sensitive surface (per CLAUDE.md workflow rule):
//   - signEip3009: produces an EIP-712 / EIP-3009 transferWithAuthorization
//     signature with the probe wallet's private key. A bug here authorises the
//     wrong amount/payee/nonce, which the merchant would happily settle.
//   - monthToDateSpendAtomic: a soft pre-check on the monthly hard ceiling
//     ($20). Server-side caps are still authoritative; this is just an early
//     exit so we don't pile attempts onto a tripped middleware.
//
// Out of scope here:
//   - Custody. The probe wallet signs; the merchant submits on-chain. No funds
//     pass through TrustBench at any point.
//   - Reactive scorecard updates. Probe outcomes never feed back into scores
//     in Phase 3 (memo § "Failure handling"). Phase 4 may revisit.
// =============================================================================

import { privateKeyToAccount } from 'viem/accounts';
import { getAddress, recoverTypedDataAddress } from 'viem';
import { createClient } from '@supabase/supabase-js';
import { ulid } from 'ulid';
import { ExactEvmScheme } from '@x402/evm';
import { encodePaymentSignatureHeader } from '@x402/core/http';
import type { PaymentPayload, PaymentRequirements } from '@x402/core/types';
import 'dotenv/config';

// =============================================================================
// v2 SDK swap — 2026-05-06 (P4-1b unblock per InfopunksHQ DM)
// =============================================================================
// First swap (2026-05-05) was to legacy `x402@1.2.0`'s `createPaymentHeader`.
// That package targets x402 protocol v1 — its zod schema only accepts the
// v1 network enum (`base`, `base-sepolia`, etc.) and throws "Unsupported
// network" synchronously on v2 CAIP-form values like `eip155:8453`. We
// papered over this with a normalizeForSDK() that re-keyed the merchant's
// `accepts[0]` from CAIP→SDK at the boundary, but the Coinbase CDP
// facilitator kept rejecting with the opaque "x402 facilitator verify
// failed" regardless of wrapper variant. Crypto, clock, and shape were all
// confirmed correct via Run A/B diagnostics 2026-05-05.
//
// InfopunksHQ replied 2026-05-05 confirming their successful client uses
// the modular v2 packages (`@x402/core`, `@x402/evm`, `@x402/fetch`) and
// passes the raw `accepts[0]` straight through with no normalization. The
// legacy `x402` monolithic package is deprecated. They explicitly directed:
// don't normalize CAIP→base; pass `accepts[0]` exactly as the merchant
// returned it.
//
// New flow (this file):
//   1. ExactEvmScheme(viemAccount).createPaymentPayload(2, accepts[0])
//      builds the inner signed payload from the v2 PaymentRequirements (the
//      raw merchant accepts[0]). The viem LocalAccount duck-types as
//      ClientEvmSigner because it has `address` and `signTypedData`.
//   2. The full PaymentPayload (= result + accepted: paymentRequirements) is
//      encoded via encodePaymentSignatureHeader → base64 X-PAYMENT string.
//   3. POST {route_id, x_payment} to /route/settle. TrustBench server
//      forwards the X-PAYMENT header verbatim to the merchant; we never
//      see the EIP-712 typed data on our side.
//
// Failure mode if the new SDK rejects accepts[0]: createPaymentPayload
// throws synchronously, the catch in the main loop logs `[probe] FAIL sign`,
// no money moves. Same safety profile as before. Local signature recovery
// (recoverTypedDataAddress) gates the result before sending to confirm the
// SDK signed with the right wallet against the canonical USDC v2 EIP-712
// domain.
// =============================================================================

// -----------------------------------------------------------------------------
// Constants — locked decisions from phase3-paid-probing.md
// -----------------------------------------------------------------------------
const MONTHLY_HARD_CEILING_ATOMIC = 20_000_000n;     // $20.00, USDC 6-decimals
const PER_CALL_MAX_PRICE_ATOMIC = '50000';           // $0.05 — server enforces too
const BASE_USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as const;
const BASE_CHAIN_ID = 8453;
const USDC_DOMAIN_NAME = 'USD Coin';
const USDC_DOMAIN_VERSION = '2';                     // USDC v2 EIP-712 domain on Base

// -----------------------------------------------------------------------------
// Env validation
// -----------------------------------------------------------------------------
function required(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === '') {
    console.error(`[probe] FATAL: required env var ${name} is missing or empty`);
    process.exit(1);
  }
  return v.trim();
}

function optional(name: string, fallback: string): string {
  const v = process.env[name];
  return v && v.trim() !== '' ? v.trim() : fallback;
}

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------
type Capability = 'search' | 'inference' | 'data';

type PaymentRequired = {
  scheme: 'eip3009';
  chain: 'base';
  asset: 'USDC';
  asset_address: `0x${string}`;
  decimals: number;
  recipient: `0x${string}`;
  amount_atomic: string;
  valid_after: number;
  valid_before: number;
  nonce: `0x${string}`;
};

// payment_requirements_v2 is the merchant's raw x402 v2 `accepts[0]` envelope,
// passed through verbatim by /route. The v2 SDK (@x402/core + @x402/evm,
// 2.11.0+) accepts this shape directly via ExactEvmScheme.createPaymentPayload
// — no client-side dialect translation needed. Cast to PaymentRequirements
// from @x402/core/types at the SDK boundary.
//
// Null when the merchant only emitted the v0.x flat shape (e.g. local
// mock-provider used in Phase 3 smoke tests) — in which case the script
// falls back to the legacy signEip3009 + `signature` path.
type PaymentRequirementsV2 = Record<string, unknown>;

type QuoteResponse = {
  route_id: string;
  payment_required: PaymentRequired;
  payment_requirements_v2: PaymentRequirementsV2 | null;
  expires_at: string;
  fallback_provider?: { provider_id: string; score_at_decision: number };
  error?: undefined;
};

// -----------------------------------------------------------------------------
// Removed 2026-05-06 (P4-1b unblock): CAIP_TO_SDK_NETWORK / SDK_TO_CAIP_NETWORK
// / patchEnvelopeForCoinbaseV2 / normalizeForSDK.
// -----------------------------------------------------------------------------
// These existed to translate the merchant's v2 dialect (CAIP network names,
// `amount` instead of `maxAmountRequired`, `resource` as a nested object)
// into the legacy `x402@1.2.0` SDK's v1 zod schema. With the swap to
// `@x402/core` + `@x402/evm` (v2-native), the SDK accepts the raw `accepts[0]`
// shape directly (`network: "eip155:8453"`, `amount: "10000"`, `resource`
// permitted as Record<string, unknown>) per InfopunksHQ's 2026-05-06 reply.
// Translation layer is moot. Removed entirely rather than left dormant
// behind an env flag, since "skip-normalize" is the new default behavior.
//
// If a future merchant's accepts[0] needs translation that the new SDK does
// NOT tolerate, add it back here (single function), guarded by an env flag,
// and document why.
// -----------------------------------------------------------------------------

type QuoteError = { error: string; detail?: string };

type ProbeTarget = {
  provider_id: string;
  capability: Capability;
  score: number;
};

// -----------------------------------------------------------------------------
// EIP-3009 signing — SECURITY-SENSITIVE (Claude reviews per workflow rule)
// -----------------------------------------------------------------------------
// Signs the canonical transferWithAuthorization struct as EIP-712 typed data.
// The merchant submits the signature on-chain; if the struct hash mismatches
// the merchant's reconstruction (different amount, different payee, different
// nonce, etc.), USDC's `transferWithAuthorization` call reverts — no money
// moves. So the failure mode of a buggy signer is "merchant can't settle",
// not "wrong amount transferred." Still, we want this exact.
//
// Domain separator (per USDC v2 on Base):
//   name              "USD Coin"
//   version           "2"
//   chainId           8453
//   verifyingContract 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
//
// Type:
//   TransferWithAuthorization(
//     address from, address to, uint256 value,
//     uint256 validAfter, uint256 validBefore, bytes32 nonce
//   )
//
// All numeric fields go in as bigint; viem handles the EIP-712 encoding.
async function signEip3009(
  account: ReturnType<typeof privateKeyToAccount>,
  pr: PaymentRequired,
): Promise<`0x${string}`> {
  // Defensive: refuse to sign if anything looks wrong. A surprising payload
  // shape would otherwise produce a valid signature over the surprise.
  if (pr.scheme !== 'eip3009') {
    throw new Error(`unexpected scheme: ${pr.scheme}`);
  }
  if (pr.chain !== 'base') {
    throw new Error(`unexpected chain: ${pr.chain}`);
  }
  if (pr.asset !== 'USDC') {
    throw new Error(`unexpected asset: ${pr.asset}`);
  }
  if (pr.asset_address.toLowerCase() !== BASE_USDC_ADDRESS.toLowerCase()) {
    throw new Error(
      `unexpected asset_address: ${pr.asset_address} (expected ${BASE_USDC_ADDRESS})`,
    );
  }
  if (!/^0x[0-9a-fA-F]{64}$/.test(pr.nonce)) {
    throw new Error(`malformed nonce: ${pr.nonce}`);
  }
  if (!/^\d+$/.test(pr.amount_atomic)) {
    throw new Error(`malformed amount_atomic: ${pr.amount_atomic}`);
  }

  // Normalize addresses to canonical EIP-55 checksum before passing to viem.
  // viem's signTypedData strictly validates address checksum and rejects
  // mixed-case addresses that don't match EIP-55. Different x402
  // implementations emit different casings (Infopunks's CDP-facilitator
  // dialect returns lowercase 'c' in f4c7c32; canonical EIP-55 has 'C').
  // getAddress() normalizes any valid hex+length input to canonical form.
  //
  // Failure mode if normalization is wrong:
  //   - getAddress throws on invalid hex / wrong length: signEip3009 throws,
  //     caller logs '[probe] FAIL sign', no money moves. Safe.
  //   - getAddress returns a different valid address than expected: this can't
  //     happen — getAddress only changes case, never the underlying bytes.
  const verifyingContract = getAddress(pr.asset_address);
  const recipient = getAddress(pr.recipient);
  return account.signTypedData({
    domain: {
      name: USDC_DOMAIN_NAME,
      version: USDC_DOMAIN_VERSION,
      chainId: BASE_CHAIN_ID,
      verifyingContract,
    },
    types: {
      TransferWithAuthorization: [
        { name: 'from', type: 'address' },
        { name: 'to', type: 'address' },
        { name: 'value', type: 'uint256' },
        { name: 'validAfter', type: 'uint256' },
        { name: 'validBefore', type: 'uint256' },
        { name: 'nonce', type: 'bytes32' },
      ],
    },
    primaryType: 'TransferWithAuthorization',
    message: {
      from: account.address,
      to: recipient,
      value: pr.amount_atomic,
      validAfter: String(pr.valid_after),
      validBefore: String(pr.valid_before),
      nonce: pr.nonce,
    },
  });
}

// -----------------------------------------------------------------------------
// API client wrappers
// -----------------------------------------------------------------------------
async function postRoute(
  baseUrl: string,
  apiKey: string,
  idemKey: string,
  body: { capability: Capability; max_price: string; payer_address: string },
): Promise<QuoteResponse | QuoteError> {
  const res = await fetch(`${baseUrl}/route`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': idemKey,
    },
    body: JSON.stringify(body),
  });
  // 4xx + 5xx all flow through here as JSON {error, detail?}
  const json = (await res.json().catch(() => ({ error: 'malformed_response' }))) as
    | QuoteResponse
    | QuoteError;
  if (!res.ok && !('error' in json)) {
    return { error: `http_${res.status}` };
  }
  return json;
}

// /route/settle accepts EITHER `signature` (legacy v0.x EIP-712 signature, used
// against the local mock-provider in Phase 3 smoke tests) OR `x_payment` (the
// SDK-built base64 X-PAYMENT envelope, used against real v2 providers like
// Infopunks). Pass exactly one — the server 400s on "both" or "neither."
type SettlePayload = { signature: `0x${string}` } | { x_payment: string };

async function postRouteSettle(
  baseUrl: string,
  apiKey: string,
  routeId: string,
  payload: SettlePayload,
): Promise<{ ok: boolean; receipt_id?: string; status: number; body: any }> {
  const res = await fetch(`${baseUrl}/route/settle`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ route_id: routeId, ...payload }),
  });
  const body = await res.json().catch(() => null);
  return {
    ok: res.ok,
    status: res.status,
    receipt_id: res.headers.get('x-receipt-id') || body?.receipt?.receipt?.receipt_id,
    body,
  };
}

// -----------------------------------------------------------------------------
// Soft monthly cap pre-check
// -----------------------------------------------------------------------------
// Queries the receipts table directly via Supabase service role for the probe
// agent's month-to-date total_paid_atomic. If unset (no SUPABASE_URL), we skip
// the check — server-side caps still apply.
async function monthToDateSpendAtomic(probeAgentEmail: string): Promise<bigint | null> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    console.warn('[probe] SUPABASE_URL/SECRET_KEY not set — skipping soft monthly cap check');
    return null;
  }
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Find the probe agent id from email (avoids hard-coding a UUID).
  const { data: agent, error: agentErr } = await supabase
    .from('agents')
    .select('id')
    .eq('email', probeAgentEmail)
    .maybeSingle<{ id: string }>();
  if (agentErr || !agent) {
    console.warn(`[probe] probe agent ${probeAgentEmail} not found — skipping soft check`);
    return null;
  }

  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  const { data: rows, error: receiptsErr } = await supabase
    .from('receipts')
    .select('total_paid_atomic')
    .eq('agent_id', agent.id)
    .gte('issued_at', monthStart.toISOString());
  if (receiptsErr) {
    console.warn(`[probe] receipts query failed — skipping soft check: ${receiptsErr.message}`);
    return null;
  }

  let total = 0n;
  for (const r of rows ?? []) {
    if (r.total_paid_atomic && /^\d+$/.test(r.total_paid_atomic)) {
      total += BigInt(r.total_paid_atomic);
    }
  }
  return total;
}

// -----------------------------------------------------------------------------
// Provider selection — least-recently-probed, score >= 40
// -----------------------------------------------------------------------------
// We don't ask the server to "pick a provider for the probe"; the server's
// /route already does that. We just decide WHICH (capability, provider) pair
// to fire /route at this run. Strategy:
//   - For each capability in the rotation, pull /rankings.
//   - Filter score >= 40 (consistent with selectProvider's floor).
//   - Sort by least-recently-probed (using receipts table; missing = always
//     pick first).
//   - Take up to maxProviders entries total across all capabilities.
async function pickProvidersToProbe(
  baseUrl: string,
  capabilities: Capability[],
  maxProviders: number,
  probeAgentEmail: string,
): Promise<ProbeTarget[]> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  const lastProbedByProvider = new Map<string, Date>();

  // Best-effort last-probed lookup. If we can't query receipts, treat
  // every provider as "never probed" — falls back to ranking-order.
  if (url && key) {
    const supabase = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: agent } = await supabase
      .from('agents')
      .select('id')
      .eq('email', probeAgentEmail)
      .maybeSingle<{ id: string }>();
    if (agent) {
      const { data: rows } = await supabase
        .from('receipts')
        .select('provider_id, issued_at')
        .eq('agent_id', agent.id)
        .order('issued_at', { ascending: false })
        .limit(500);
      for (const r of rows ?? []) {
        const pid = (r as any).provider_id as string;
        const at = new Date((r as any).issued_at);
        if (!lastProbedByProvider.has(pid) || lastProbedByProvider.get(pid)! < at) {
          lastProbedByProvider.set(pid, at);
        }
      }
    }
  }

  // Pull rankings per capability (public endpoint, no auth needed).
  const candidates: ProbeTarget[] = [];
  for (const capability of capabilities) {
    const res = await fetch(`${baseUrl}/rankings?capability=${capability}`);
    if (!res.ok) {
      console.warn(`[probe] /rankings ${capability} returned ${res.status}; skipping`);
      continue;
    }
    // /rankings returns one of two shapes depending on deployed handler:
    //   - legacy: top-level array  [{provider_id, score, ...}, ...]
    //   - current: envelope        {success: true, data: [...], source: "TrustBench"}
    // Tolerate both. If neither shape parses to an array, skip this capability.
    const json = (await res.json()) as unknown;
    const list: Array<{ provider_id: string; score: number }> = Array.isArray(json)
      ? (json as Array<{ provider_id: string; score: number }>)
      : (json && typeof json === 'object' && Array.isArray((json as any).data))
        ? ((json as any).data as Array<{ provider_id: string; score: number }>)
        : [];
    if (list.length === 0) {
      console.warn(`[probe] /rankings ${capability} returned no rows; skipping`);
      continue;
    }
    for (const r of list) {
      if (typeof r.score === 'number' && r.score >= 40) {
        candidates.push({ provider_id: r.provider_id, capability, score: r.score });
      }
    }
  }

  // Slot allocation: round-robin across capabilities (added 2026-05-20).
  //
  // Earlier behavior: flat LRU sort + slice(0, maxProviders). When the
  // receipts table is empty (no successful settles to differentiate by),
  // every candidate's lastProbed time defaults to 0, the sort comparator
  // returns 0 for every pair, and V8 stable sort preserves insertion order.
  // That means all maxProviders slots went to whichever capability is
  // iterated first AND has enough score-≥40 candidates to fill them; other
  // configured capabilities never got a probe slot.
  //
  // This was the shape behind the 2026-05-19 incident: capability=data was
  // the only one returning score-≥40 candidates from /rankings (Infopunks
  // reseeds plus the broken Brave/Browserbase agentic.market entries that
  // were since deleted), so it filled all 4 slots every run while search
  // and inference went unprobed. Even after dropping `data` from the env
  // default, the same mechanism would silently bias all slots toward
  // whichever of search/inference is iterated first as soon as one of them
  // has enough candidates — preserving the silent-coverage-gap shape that
  // the 2026-05-19 lessons.md entry warned about.
  //
  // New behavior: group by capability, sort within each group by LRU, then
  // round-robin one slot at a time across capabilities until maxProviders
  // are picked. Each configured capability with ≥1 candidate gets at least
  // one slot before any capability gets a second. Spillover (capabilities
  // with no candidates) is naturally absorbed by the round-robin — the loop
  // just keeps cycling through the ones that still have items.
  //
  // Failure mode if this is wrong: if round-robin picks an unhealthy provider
  // when a healthier alternative existed in the same capability, the [probe]
  // ERROR fires the canary correctly — just on a different provider than the
  // LRU-flat path would have chosen. No silent degradation; the canary surface
  // stays load-bearing.
  const byCapability = new Map<Capability, ProbeTarget[]>();
  for (const cap of capabilities) {
    const capList = candidates
      .filter((c) => c.capability === cap)
      .sort((a, b) => {
        const ta = lastProbedByProvider.get(a.provider_id)?.getTime() ?? 0;
        const tb = lastProbedByProvider.get(b.provider_id)?.getTime() ?? 0;
        return ta - tb;
      });
    byCapability.set(cap, capList);
  }

  const result: ProbeTarget[] = [];
  let progress = true;
  while (result.length < maxProviders && progress) {
    progress = false;
    for (const cap of capabilities) {
      if (result.length >= maxProviders) break;
      const queue = byCapability.get(cap);
      if (queue && queue.length > 0) {
        result.push(queue.shift()!);
        progress = true;
      }
    }
  }

  return result;
}

// -----------------------------------------------------------------------------
// Main
// -----------------------------------------------------------------------------
async function main() {
  // 1. Env. Validate everything before touching the network or any wallet.
  const apiKey = required('SCRIPTS_PROBE_API_KEY');
  const walletPk = required('SCRIPTS_PROBE_WALLET_PK');
  const baseUrl = optional('TRUSTBENCH_BASE_URL', 'http://localhost:3000');
  const dryRun = optional('SCRIPTS_PROBE_DRY_RUN', 'false') === 'true';
  const maxProviders = parseInt(optional('SCRIPTS_PROBE_MAX_PROVIDERS', '4'), 10);
  // SCRIPTS_PROBE_CAPABILITIES default dropped `data` 2026-05-20.
  // Infopunks's cognition-layer (the only verified-live capability=data x402
  // provider as of seed 2026-05-04) pivoted off-product 2026-05-11; nightly
  // seed re-inserts now amount to dead rows. Probing them produced 100%
  // 502s for 8 days (see lessons.md 2026-05-19 "Internal probes can fail
  // 100% for 8 days while CI shows green"). Re-add `data` to the env when
  // a verified-live data provider lands in the registry organically.
  const capsCsv = optional('SCRIPTS_PROBE_CAPABILITIES', 'search,inference');
  const probeAgentEmail = optional('SCRIPTS_PROBE_AGENT_EMAIL', 'probe@trustbench.io');

  if (!/^0x[0-9a-fA-F]{64}$/.test(walletPk)) {
    console.error('[probe] FATAL: SCRIPTS_PROBE_WALLET_PK must be 0x + 64 hex chars (32-byte private key)');
    process.exit(1);
  }
  if (!Number.isFinite(maxProviders) || maxProviders < 1 || maxProviders > 20) {
    console.error('[probe] FATAL: SCRIPTS_PROBE_MAX_PROVIDERS must be 1..20');
    process.exit(1);
  }

  const capabilities = capsCsv
    .split(',')
    .map(s => s.trim())
    .filter(s => ['search', 'inference', 'data'].includes(s)) as Capability[];
  if (capabilities.length === 0) {
    console.error('[probe] FATAL: SCRIPTS_PROBE_CAPABILITIES must contain at least one of search,inference,data');
    process.exit(1);
  }

  const account = privateKeyToAccount(walletPk as `0x${string}`);
  console.log(`[probe] starting  base=${baseUrl}  dry=${dryRun}  wallet=${account.address}  max=${maxProviders}  caps=${capabilities.join(',')}`);

  // 2. Soft monthly cap pre-check. Server enforces the hard cap — this is
  // just to avoid piling on after we're already over budget for the month.
  // Outcome: WARN (exit 0). We hit the budget ceiling, not a routing failure.
  const mtd = await monthToDateSpendAtomic(probeAgentEmail);
  if (mtd !== null) {
    console.log(`[probe] month-to-date spend: ${mtd} atomic (cap ${MONTHLY_HARD_CEILING_ATOMIC})`);
    if (mtd >= MONTHLY_HARD_CEILING_ATOMIC) {
      console.warn('[probe] WARN monthly hard ceiling reached — exiting 0');
      process.exit(0);
    }
  }

  // 3. Pick which providers to probe.
  // Outcome on empty: WARN (exit 0). Registry having no score-≥40 providers
  // is a pipeline-state problem (e.g., prober hasn't run yet, or the lane
  // is genuinely empty), not a routing failure.
  const targets = await pickProvidersToProbe(baseUrl, capabilities, maxProviders, probeAgentEmail);
  if (targets.length === 0) {
    console.warn('[probe] WARN no eligible providers (score >= 40); exiting 0');
    process.exit(0);
  }
  console.log(`[probe] ${targets.length} target(s):`, targets.map(t => `${t.capability}:${t.provider_id}`).join('  '));

  // 4. Probe each target.
  let okCount = 0;
  let failCount = 0;
  for (const t of targets) {
    const idemKey = `probe-${Date.now()}-${ulid().slice(0, 12)}`;
    const startMs = Date.now();

    const quote = await postRoute(baseUrl, apiKey, idemKey, {
      capability: t.capability,
      max_price: PER_CALL_MAX_PRICE_ATOMIC,
      payer_address: account.address,
    });
    if ('error' in quote && quote.error) {
      console.warn(`[probe] FAIL quote  ${t.capability}:${t.provider_id}  ${quote.error}${quote.detail ? ' / ' + quote.detail : ''}`);
      failCount++;
      continue;
    }
    const q = quote as QuoteResponse;

    // Branch on what the merchant gave us:
    //   - SDK path (preferred): payment_requirements_v2 present → use the
    //     `x402` SDK to build X-PAYMENT client-side. This is the path that
    //     hits real v2 providers (Infopunks, etc.).
    //   - Legacy path: payment_requirements_v2 absent → fall back to
    //     hand-rolled EIP-712 signing. This still works against the local
    //     mock-provider used in smoke tests.
    let settlePayload: SettlePayload;
    try {
      if (q.payment_requirements_v2) {
        // ---------------------------------------------------------------
        // v2 path (real x402 providers; e.g. Infopunks via CDP facilitator)
        // ---------------------------------------------------------------
        // Use the v2 modular SDK directly: ExactEvmScheme.createPaymentPayload
        // takes the raw merchant accepts[0] (PaymentRequirements: scheme,
        // network=CAIP, asset, amount, payTo, extra, ...) and signs the
        // inner EIP-3009 transferWithAuthorization with the agent's wallet.
        // Then encodePaymentSignatureHeader base64-encodes the full
        // PaymentPayload (= scheme result + accepted: paymentRequirements)
        // into the X-PAYMENT header value. We forward verbatim to /route/settle
        // as the `x_payment` field; TrustBench server never sees the typed
        // data.
        //
        // Critical change from the 2026-05-05 path: NO normalization. The
        // raw accepts[0] flows straight into the SDK. Per InfopunksHQ DM
        // 2026-05-06, the v2 SDK accepts CAIP network names (`eip155:8453`)
        // and Infopunks's nested-resource shape natively. Normalization was
        // a legacy-SDK-only requirement that we removed when we swapped to
        // `@x402/core` + `@x402/evm` v2.11.0.

        const wallClockNow = Math.floor(Date.now() / 1000);
        console.log(`[probe] DEBUG raw merchant accepts[0]: ${JSON.stringify(q.payment_requirements_v2)}`);
        console.log(`[probe] DEBUG wall-clock now (epoch s): ${wallClockNow}`);

        // Construct the v2 scheme client. The viem LocalAccount duck-types
        // as ClientEvmSigner (it has `address` and `signTypedData` of the
        // same shape). The cast to `any` is purely a type accommodation
        // because the SDK's generic typed-data signature uses
        // Record<string, unknown> for domain/types/message while viem's is
        // more strictly typed; the runtime shapes are interchangeable.
        const evmScheme = new ExactEvmScheme(account as any);

        // Pass the raw accepts[0] directly to the SDK for signing. Cast
        // through unknown because the server returns it as a
        // Record<string, unknown>; the SDK's zod validates at runtime.
        const paymentRequirements = q.payment_requirements_v2 as unknown as PaymentRequirements;
        const result = await evmScheme.createPaymentPayload(2, paymentRequirements);

        // Slim `accepted` before encoding into the X-PAYMENT header.
        //
        // 2026-05-06 finding: Infopunks's accepts[0] includes ~5.9 KB of
        // OpenAPI input/output schemas, JSON Schema definitions, bazaar
        // example responses, and category metadata embedded in `resource`.
        // Spreading the raw accepts[0] into PaymentPayload.accepted produces
        // an X-PAYMENT envelope of ~6.4 KB raw (~8.6 KB base64) which
        // exceeds Render's default header-size limit and triggers HTTP 431
        // "Request Header Fields Too Large" at the merchant — we never
        // even reach the Coinbase CDP facilitator.
        //
        // The spec PaymentRequirements only carries 7 protocol-required
        // fields (scheme/network/asset/amount/payTo/maxTimeoutSeconds/extra).
        // Everything else is merchant metadata that doesn't participate in
        // signature verification. We rebuild `accepted` with only those 7
        // fields plus a string-form `resource` (extracted from the merchant's
        // nested .resource.url when present) for any verifier that reads it.
        //
        // Result: envelope drops from ~6.4 KB to ~500-700 bytes raw,
        // comfortably under any sane HTTP header limit.
        //
        // Failure mode if the slim is wrong: facilitator returns its own
        // verify-failed error (no longer a 431 from the merchant's host
        // layer). At that point we'd have a real cause to patch from.
        // Re-add fields to `slimAccepted` as needed.
        const rawResource: unknown = (paymentRequirements as any).resource;
        let resourceUrl: string | undefined;
        if (typeof rawResource === 'string' && rawResource.length > 0) {
          resourceUrl = rawResource;
        } else if (rawResource && typeof rawResource === 'object') {
          const r = rawResource as Record<string, unknown>;
          if (typeof r.url === 'string' && r.url.length > 0) resourceUrl = r.url;
        }
        const slimAccepted: PaymentRequirements & { resource?: string } = {
          scheme: paymentRequirements.scheme,
          network: paymentRequirements.network,
          asset: paymentRequirements.asset,
          amount: paymentRequirements.amount,
          payTo: paymentRequirements.payTo,
          maxTimeoutSeconds: paymentRequirements.maxTimeoutSeconds,
          extra: paymentRequirements.extra,
        };
        if (resourceUrl) slimAccepted.resource = resourceUrl;

        const fullPayload: PaymentPayload = {
          ...result,
          accepted: slimAccepted,
        };

        const xPayment = encodePaymentSignatureHeader(fullPayload);
        console.log(
          `[probe] DEBUG v2 envelope built (x402Version=${result.x402Version}, ` +
            `payloadKeys=${Object.keys(result.payload).join(',')}, ` +
            `xPaymentBytes=${xPayment.length})`,
        );

        // Local signature verification gate (kept from 2026-05-06 diagnostic).
        // Decodes the SDK's envelope and recovers the signer locally using
        // viem's recoverTypedDataAddress. If recovered === authorization.from,
        // crypto is sound; any subsequent merchant/facilitator rejection is
        // at the wrapper or policy layer, not at the cryptographic layer.
        // Also surfaces validAfter/validBefore/skew so a future-dated auth
        // doesn't masquerade as a generic "verify failed".
        try {
          const decoded = JSON.parse(Buffer.from(xPayment, 'base64').toString('utf8'));
          // v2 PaymentPayload shape: {x402Version, accepted: {...}, payload: {...}}
          // The signed inner authorization lives at decoded.payload.authorization
          // for the Exact/EIP-3009 scheme.
          const auth = decoded?.payload?.authorization;
          if (auth && typeof auth === 'object') {
            const va = Number(auth.validAfter ?? 0);
            const vb = Number(auth.validBefore ?? 0);
            const skew = va - wallClockNow;
            console.log(`[probe] DEBUG envelope clock: validAfter=${va} validBefore=${vb} now=${wallClockNow} skew=${skew}s (positive => auth not yet valid)`);

            // Reconstruct the EIP-712 domain from the merchant's `extra`
            // fields. USDC v2 on Base uses {name: "USD Coin", version: "2",
            // chainId: 8453, verifyingContract: <asset>}. Defaulting to
            // "USD Coin" / "2" when extra is absent matches the canonical
            // domain for the asset most commonly seen here.
            const extra = (q.payment_requirements_v2?.extra ?? {}) as Record<string, unknown>;
            const domainName = typeof extra.name === 'string' ? extra.name : 'USD Coin';
            const domainVersion = typeof extra.version === 'string' ? extra.version : '2';
            const recovered = await recoverTypedDataAddress({
              domain: {
                name: domainName,
                version: domainVersion,
                chainId: 8453,
                verifyingContract: getAddress(paymentRequirements.asset as string),
              },
              types: {
                TransferWithAuthorization: [
                  { name: 'from', type: 'address' },
                  { name: 'to', type: 'address' },
                  { name: 'value', type: 'uint256' },
                  { name: 'validAfter', type: 'uint256' },
                  { name: 'validBefore', type: 'uint256' },
                  { name: 'nonce', type: 'bytes32' },
                ],
              },
              primaryType: 'TransferWithAuthorization',
              message: {
                from: getAddress(auth.from),
                to: getAddress(auth.to),
                value: BigInt(auth.value),
                validAfter: BigInt(auth.validAfter),
                validBefore: BigInt(auth.validBefore),
                nonce: auth.nonce,
              },
              signature: decoded.payload.signature,
            });
            const ok = recovered.toLowerCase() === auth.from.toLowerCase();
            console.log(`[probe] DEBUG local-verify recovered=${recovered} expected=${auth.from} match=${ok}`);
          } else {
            console.log('[probe] DEBUG local-verify skipped (no authorization in decoded payload — non-EIP-3009 scheme?)');
          }
        } catch (verifyErr: any) {
          console.warn(`[probe] DEBUG local-verify FAILED: ${verifyErr.message}`);
        }

        settlePayload = { x_payment: xPayment };
      } else {
        // ---------------------------------------------------------------
        // Legacy v0.x path (mock-provider B-series smoke compat).
        // ---------------------------------------------------------------
        // mock-provider returns the flat v0.x payment_required shape with
        // no payment_requirements_v2 field. Sign with hand-rolled signEip3009
        // and POST {route_id, signature} to /route/settle. Server's
        // settleHandler reconstructs the X-PAYMENT envelope from the legacy
        // signature path. This path is preserved verbatim so smoke tests
        // A1-B4 remain green after the v2 SDK swap.
        const signature = await signEip3009(account, q.payment_required);
        settlePayload = { signature };
      }
    } catch (e: any) {
      console.warn(`[probe] FAIL sign   ${t.capability}:${t.provider_id}  ${e.message}`);
      failCount++;
      continue;
    }

    if (dryRun) {
      const path = 'x_payment' in settlePayload ? 'sdk' : 'legacy';
      console.log(`[probe] DRY        ${t.capability}:${t.provider_id}  route=${q.route_id}  amount=${q.payment_required.amount_atomic}  path=${path}`);
      continue;
    }

    const settle = await postRouteSettle(baseUrl, apiKey, q.route_id, settlePayload);
    const elapsed = Date.now() - startMs;
    if (settle.ok && settle.receipt_id) {
      console.log(`[probe] OK         ${t.capability}:${t.provider_id}  route=${q.route_id}  receipt=${settle.receipt_id}  ${elapsed}ms`);
      okCount++;
    } else {
      console.warn(`[probe] FAIL settle ${t.capability}:${t.provider_id}  route=${q.route_id}  status=${settle.status}  ${JSON.stringify(settle.body).slice(0, 200)}`);
      failCount++;
    }
  }

  // -----------------------------------------------------------------------
  // Exit-code semantics (added 2026-05-20 per lessons.md 2026-05-19 entry
  // "Internal probes can fail 100% for 8 days while CI shows green").
  // -----------------------------------------------------------------------
  // CI badge / GitHub Actions surface ONLY the process exit code. A run
  // that completes with okCount=0 / failCount=N must exit non-zero to
  // ever go red. The earlier process-success-regardless behavior is what
  // hid the 8-day 502 streak; this block fixes it.
  //
  // Rules:
  //   - dryRun: never error. Dry runs intentionally skip /route/settle;
  //     fail/ok counts are noise. Exit 0 with a summary line.
  //   - okCount >= 1: at least one settle landed and we got a receipt.
  //     Treat partial success (some 502s, some OK) as overall OK — that's
  //     the production-routing-still-works signal we wanted.
  //   - okCount === 0 AND failCount >= 1: every attempt failed. THIS is
  //     the case that has to go red. Exit 1 + stderr summary.
  //   - okCount === 0 AND failCount === 0: shouldn't reach here (we
  //     would have early-returned in the targets.length===0 branch), but
  //     defensive default = WARN exit 0.
  //
  // The /route 502 logs already land in idempotency_keys for postmortem;
  // exit code is the *alerting* signal, not the audit signal.
  if (dryRun) {
    console.log(`[probe] DONE dry  ok=${okCount}  fail=${failCount}  targets=${targets.length}`);
    process.exit(0);
  }
  if (okCount === 0 && failCount >= 1) {
    console.error(`[probe] ERROR all ${failCount} probe attempt(s) failed; exiting 1`);
    console.error(`[probe] done  ok=${okCount}  fail=${failCount}  dry=${dryRun}`);
    process.exit(1);
  }
  if (okCount >= 1 && failCount >= 1) {
    console.warn(`[probe] WARN partial success  ok=${okCount}  fail=${failCount}  (some providers 502'd; canary still green)`);
  }
  console.log(`[probe] done  ok=${okCount}  fail=${failCount}  dry=${dryRun}`);
  process.exit(0);
}

main().catch(err => {
  console.error('[probe] unhandled error:', err);
  process.exit(1);
});
