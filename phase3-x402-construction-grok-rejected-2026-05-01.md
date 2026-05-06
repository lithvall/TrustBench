# Phase 3 — x402 Transaction Construction & Non-Custodial Sign Flow

**Status:** Design locked for Phase 3 implementation.  
**Owner:** Grok (this version) + Claude review/merge  
**Date:** 2026-05-01  
**Dependencies:** phase3-schema.sql (receipts table), phase3-idempotency-design.md (already shipped), receipt-spec-v1.md (draft), phase3-agent-identity.md (wallet attribution)  
**Risk Level:** Highest in Phase 3 — any bug here enables double-charge, replay, stuck user funds, or incorrect "paid" state leading to free routing abuse.

---

## 1. Chain, Asset & Pricing Lock (Immutable for Phase 3)

- **Network:** Base Mainnet only (`eip155:8453`, chainId `8453`)
- **Asset:** USDC only (ERC-20, 6 decimals)
  - Contract: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` (official Circle USDC on Base)
- **Scheme:** `exact` with `assetTransferMethod: "eip3009"` (native USDC `transferWithAuthorization` — simplest, no Permit2 proxy, no extra contracts)
- **Route Fee (TrustBench flat per-tx):** `0.001` USDC = atomic `"1000"` (configurable via env `ROUTE_FEE_USDC_ATOMIC` but default locked; future dynamic pricing in Phase 4)
- **Rationale:** Matches spend-caps spec (receipts track USDC-equivalent spend). Single chain/asset = zero branching in Phase 3. Base = fast finality (1-2 blocks < 4s), low gas (~$0.0001), high reliability for micropayments. USDC = stable, widely supported by agents/wallets.

**Out of scope for Phase 3:** Other networks, other tokens, `upto`/`deferred` schemes, Permit2, ERC-7710, multi-asset accepts arrays, dynamic per-provider pricing in the route fee itself.

---

## 2. Exact x402 Handshake (Wire Format — Locked)

We follow the x402-foundation v2 spec (PAYMENT-* headers, base64 payloads) for maximum compatibility with agent libraries, @x402/hono, and future facilitators. No custom headers.

### 2.1 Server → Client: 402 Challenge (when payment missing/invalid)

**HTTP Status:** `402 Payment Required`  
**Headers:**
- `Content-Type: application/json`
- `PAYMENT-REQUIRED: <base64url(JSON.stringify(PaymentRequired))>`

**PaymentRequired body (example for 0.001 USDC route fee):**
```json
{
  "x402Version": 2,
  "accepts": [
    {
      "scheme": "exact",
      "network": "eip155:8453",
      "amount": "1000",
      "asset": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      "payTo": "0xYourTrustBenchPayToAddressHere",   // from PAY_TO_ADDRESS env
      "maxTimeoutSeconds": 300,
      "extra": {
        "assetTransferMethod": "eip3009",
        "name": "USDC",
        "version": "2"
      }
    }
  ]
}
```

**Notes:**
- `amount` is **always atomic units as string** (never human decimal).
- `maxTimeoutSeconds` = 300 (5 min) — gives agent time to sign + network latency + our settlement poll. Short enough to limit stuck-funds window.
- We issue **one** accepts entry (no alternatives in Phase 3; provider selection happens *after* successful TrustBench payment).
- Challenge is **stateless** — price is fixed, no per-request state stored (idempotency key + authorization nonce provide replay protection).

### 2.2 Client/Agent → Server: Retry with Signed Payment

**Same original request** (POST /route + body + idempotency key + API key Bearer)  
**Additional Header:**
- `PAYMENT-SIGNATURE: <base64url(JSON.stringify(PaymentPayload))>`

**PaymentPayload (EIP-3009 exact, what the agent constructs & signs):**
```json
{
  "x402Version": 2,
  "payload": {
    "signature": "0x...",                    // 65-byte ECDSA sig (r,s,v) over the authorization
    "authorization": {
      "from": "0xAgentWalletAddress",        // must match agent's registered wallet (optional Phase 3 check)
      "to": "0xYourTrustBenchPayToAddressHere",
      "value": "1000",
      "validAfter": "1740780000",            // Unix seconds, >= now - 60s slack
      "validBefore": "1740780300",           // validAfter + <= 300s
      "nonce": "0x..."                       // 32-byte random hex (client-generated, unique per attempt)
    }
  }
}
```

**Signing (agent side — TrustBench never does this):**
- The `authorization` struct is hashed and signed per USDC's `transferWithAuthorization` precompile/EIP-3009 spec (no separate EIP-712 domain separator needed for USDC; recovery uses `ecrecover` on the packed struct).
- Agent's wallet (or agent framework lib) performs the sign.
- `from` **should** match the wallet address stored in `agents.wallet_address` (we verify in Phase 3 for attribution; mismatch → 402 "wallet mismatch").
- Nonce: cryptographically random 32 bytes (prevents cross-request replay even with same idempotency key).

**TrustBench never constructs or signs the authorization** — only the *challenge* (accepts). This is the **non-custodial boundary**.

### 2.3 Server → Client: Success Response

On successful settlement + upstream:
- `200 OK`
- `PAYMENT-RESPONSE: <base64url(JSON of SettlementResponse)>`
- Body: normal route result + `X-Receipt-Id` header (from receipt generator)

**SettlementResponse (minimal for Phase 3):**
```json
{
  "success": true,
  "txHash": "0x...",          // the mined transferWithAuthorization tx
  "blockNumber": 12345678,
  "confirmations": 2,
  "network": "eip155:8453"
}
```

---

## 3. Server-Side Construction, Verification & Settlement (Pseudocode + Rules)

**Location in /route handler (after idempotency + spend-cap pre-check, before provider selection):**

```ts
// 1. If no/invalid PAYMENT-SIGNATURE → return 402 with above challenge (stateless)
if (!c.req.header('PAYMENT-SIGNATURE')) {
  return c.json(challenge, 402, { 'PAYMENT-REQUIRED': b64(challenge) });
}

// 2. Decode + basic structural validate
const payload = JSON.parse(base64decode(header));
if (payload.x402Version !== 2 || !payload.payload?.authorization) throw 400;

// 3. Cryptographic verify (ethers.js verifyMessage or custom ecrecover)
const recovered = recoverAddress(keccak256(packAuthorization(payload.payload.authorization)), payload.payload.signature);
if (recovered.toLowerCase() !== payload.payload.authorization.from.toLowerCase()) return 402 'bad signature';

// 4. Time window check (with 60s clock skew tolerance)
const now = Math.floor(Date.now() / 1000);
if (now < payload.payload.authorization.validAfter - 60 || now > payload.payload.authorization.validBefore + 60) {
  return 402 'authorization expired or not yet valid';
}

// 5. Match challenge (hardcoded for flat fee in Phase 3)
if (payload.payload.authorization.value !== '1000' || 
    payload.payload.authorization.to.toLowerCase() !== PAY_TO_ADDRESS.toLowerCase() ||
    payload.payload.authorization.nonceUsed /* future on-chain check */) {
  return 402 'payment does not match requirements';
}

// 6. Replay / double-spend protection (idempotency already guarantees same key → cached response)
const authKey = `${from}:${nonce}`; // or store in idempotency_keys.response_body
// (idempotency middleware already prevents re-processing; this is belt-and-suspenders)

// 7. Settlement (critical section — only here do we touch chain)
const txHash = await settleAuthorization(payload.payload.authorization, payload.payload.signature);
// blocks until 2 confirmations or timeout

// 8. On success → proceed to provider selection → upstream call → emit receipt (with txHash in receipt metadata)
```

**Key implementation rules (locked):**
- **No external facilitator** in Phase 3 (self-hosted to avoid extra dependency / cost / trust surface). We act as our own facilitator for `/verify` + `/settle`.
- **Gas sponsorship:** TrustBench maintains a **gas-only EOA** (funded with ~0.05 ETH, never holds USDC for users). The `transferWithAuthorization` call is submitted by this EOA (gas paid by us, ~$0.0002/tx absorbed in 0.001 fee). **Never use the PAY_TO_ADDRESS private key for submission** (separation of concerns).
- **Nonce handling:** Client-generated. We do **not** dictate nonce. On-chain USDC contract enforces uniqueness per `(from, nonce)`.
- **Pre-flight simulation (optional but recommended for gas savings):** `eth_call` the `transferWithAuthorization` before broadcasting. Revert reasons: "authorization already used", "insufficient balance", "expired", etc. → map to clean 402/400.

---

## 4. On-Chain Settlement Check Details

### RPC & Client
- **Primary:** `BASE_RPC_URL` (add to .env.example — recommend Alchemy or QuickNode paid endpoint for reliability; fallback to public `https://mainnet.base.org` with aggressive retry).
- **Library:** `ethers v6` (already in package.json) — `JsonRpcProvider`, `Contract`, `Wallet` (for gas sponsor).
- **USDC ABI:** Minimal — only `transferWithAuthorization` and `authorizationState(from, nonce)` view (to check used nonces without full event scan).

### Settlement Flow (robust)
1. Submit `usdc.transferWithAuthorization(auth, sig)` from gas sponsor wallet.
2. Poll `eth_getTransactionReceipt` every 1s up to **30s total timeout**.
3. Require **minimum 2 confirmations** (Base ~2s/block; 4s total typical). Re-org risk negligible at 2 confs for $0.001 tx.
4. On success (`status === 1`): capture `txHash`, `blockNumber`, `confirmations`.
5. On timeout / revert:
   - If revert reason contains "already used" → secondary check: query `Transfer` events from `from` to `payTo` value=`1000` in last 10 blocks. If found → treat as paid (someone else submitted, e.g. client or front-runner). Else → "payment already processed elsewhere".
   - Else → fail the request (see Failure Semantics).

**Retry policy on RPC errors:** Exponential backoff (1s, 2s, 4s) max 3 attempts. Total settlement budget < 10s to keep /route < 15s end-to-end.

---

## 5. Failure Semantics (Locked — No Ambiguity)

These are the exact behaviors. Any deviation requires Phase 4 redesign + migration.

| Scenario | What Happens | Receipt Issued? | Response to Agent | User Funds Impact | Notes / Prevention |
|----------|--------------|-----------------|-------------------|-------------------|--------------------|
| Valid signature + settlement succeeds + upstream 5xx/timeout | Proceed with upstream error; still issue receipt (routing service rendered) | Yes (with settlement txHash + upstream error metadata) | 502/504 + upstream error body + `X-Receipt-Id` | Paid (no refund) | "Best effort" routing. Agent accepted risk when calling /route. Log for scorecard penalty on provider. |
| Valid signature but settlement tx reverts ("insufficient balance", "expired", "bad nonce") | Do not call upstream; return 402 with specific reason | No | 402 "payment authorization invalid: <reason>" | Not spent (tx never mined) | Agent must re-sign with fresh nonce/times or top up. Idempotency key can be reused for retry. |
| Settlement times out (no confirmations in 30s) | Do not call upstream; return 504 | No | 504 "payment settlement timeout — retry with new idempotency key" | Potentially stuck if partial broadcast (rare) | Short `validBefore` (300s) limits exposure. Agent retries → new nonce. |
| Different tx with same nonce mines first (front-run / client double-submit) | Our submit reverts "already used" → secondary event check fails → treat as "already paid elsewhere" | No (or cached success if idempotency hit) | 409 "payment already processed" + `Retry-After: 5` | Paid once (to whoever mined first) | Extremely rare on Base with honest client + short window + server submits first. Idempotency + unique nonce per attempt prevents. |
| Signature valid but `from` ≠ agent's registered wallet | 402 "payment from unauthorized wallet" | No | 402 | Not spent | Phase 3 enforcement for attribution (see agent-identity.md). Wallet is captured at key creation. |
| Replay of exact same signed payload (same nonce) | Idempotency middleware returns cached response (success or error) without re-settling | Cached | Cached 200 or error | Paid once | Core protection. Nonce + idempotency key = double belt. |
| Upstream succeeds but receipt emission fails | Upstream response still returned; receipt retry in background (or fail open with warning) | Best-effort | 200 + route result (no receipt header) | Paid | Receipt is audit layer, not gate. Spend cap uses eventual consistency. |

**General policy:** Payment is considered **final and non-refundable** once settlement confirms. No on-chain refunds in Phase 3 (would require extra tx + custody). Refunds only via support ticket + manual intervention (Phase 4+).

---

## 6. Integration Points with Rest of Phase 3

- **Before:** Idempotency middleware (already done) — runs on raw body hash *before* we even look at PAYMENT-SIGNATURE. Same request → instant cached response (no double settlement).
- **After successful settlement:** Provider selection (phase3-provider-selection.md — TBD) → upstream HTTP call (with query) → receipt generator (Ed25519 signed, includes `settlement: { txHash, blockNumber, amount: "1000", asset: "USDC", network: "eip155:8453" }`) → emit `X-Receipt-Id` + `PAYMENT-RESPONSE`.
- **Spend caps:** Receipt write happens *after* settlement + upstream attempt. Caps are approximate under concurrency (documented in phase3-idempotency-design.md).
- **Receipt attribution:** `agent_id` from API key + `wallet_address` from `authorization.from` (for audit trail, even if not strictly enforced yet).
- **Error mapping:** All payment failures → 4xx (never leak internal RPC errors). 5xx only for upstream or our infra.

---

## 7. Implementation Notes for Grok (when coding)

- Add `BASE_RPC_URL` and `GAS_SPONSOR_PRIVATE_KEY` (gas-only, never USDC holder) to `.env.example` (mechanical step 15).
- Use `ethers.Contract` for USDC with minimal ABI.
- Extract `settleAuthorization` into `src/x402.ts` (pure, testable).
- Unit tests: 10+ scenarios covering all failure table rows + happy path (mock RPC with `vi.mock` or `anvil`).
- Gas cost accounting: log `gasUsed * gasPrice` per settlement for future profitability dashboard.
- Monitoring: Alert on >5% settlement failure rate or >10s p95 settlement time.

---

## 8. Phase 4 Preview (Not in Scope)

- External facilitator support (Coinbase, x402 official) for zero-gas-sponsorship on our side.
- Bundled payments (TrustBench fee + provider fee in single authorization via Permit2 witness).
- Dynamic `amount` based on selected provider's `max_price`.
- On-chain receipt anchoring (Ed25519 receipt + txHash → event or L2 storage).
- Refund flows or insurance for upstream 5xx after payment.

---

## References

- x402-foundation spec: https://github.com/x402-foundation/x402 (exact/eip3009 scheme)
- USDC EIP-3009: Circle USDC contract on Base
- EIP-3009: https://eips.ethereum.org/EIPS/eip-3009
- Current @x402/hono usage in `src/index.ts` (for /rankings/paid — we will replace with custom for /route to wire all Phase 3 primitives)
- Phase 2 validation: flat fee preferred over spread (no custody of provider funds)

---

**This design eliminates the highest-risk surface in Phase 3.** Once implemented and tested against the 10 idempotency scenarios + these settlement cases, the non-custodial guarantee ("TrustBench never sees your keys, never holds your USDC beyond the atomic transfer") is cryptographically enforced.

Ready for Claude review + merge. Any tightening on timeout windows, confirmation count, or secondary "already used" detection logic welcome.