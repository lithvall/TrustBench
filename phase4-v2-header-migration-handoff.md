# Phase 4 — v2 HTTP header migration handoff

**Status:** Not started. Deferred from 2026-05-12 Phase 4 Path P session.
**Risk:** High (revenue-bearing 402 + settle path; signature recovery is byte-sensitive).
**Estimated work:** Focused 2-3 hour fresh session with full Critic pass + smoke verification.

**Read first when picking this up:**
1. This file in full.
2. `CLAUDE.md` for high-risk-surface workflow rules.
3. `lessons.md` 2026-05-12 entry "x402 v2 spec has different HTTP header names than v1" for context.
4. `decisions.md` 2026-05-12 entry for FIX-PAYMENT-REQUIRED-HEADER (the only v2 header change we shipped).
5. `node_modules/@x402/core/README.md` § "HTTP Headers" (lines 209-224) for the canonical v1 vs v2 table.

---

## TL;DR — what's done, what's left

**Done (2026-05-12):**
- `PAYMENT-REQUIRED` response header on /route 402 (FIX-PAYMENT-REQUIRED-HEADER). agentic.market/validate confirmed 11/11 green after this shipped. This is the only v2 header strictly required for Bazaar catalog indexing.

**Not done (this handoff):**
- `PAYMENT-SIGNATURE` request header (the v2 rename for inbound `X-PAYMENT` payload from the agent).
- `PAYMENT-RESPONSE` response header on /route settle (the v2 rename for outbound `X-PAYMENT-RESPONSE` settle echo).

**Why not done:** synchronous multi-layer change touching server + smoke harness + real-world agent SDKs. Bazaar indexing doesn't require it (validator only checks `PAYMENT-REQUIRED` on the 402 path). CDP facilitator accepts both v1 and v2 inbound names. Real-world agents in the wild send `X-PAYMENT`. Cost > benefit for the listing sprint deadline 2026-05-22.

---

## The canonical v1 vs v2 header table

From `node_modules/@x402/core/README.md`:

### v2 Protocol (Current spec)

| Header | Direction | Description |
|---|---|---|
| `PAYMENT-SIGNATURE` | Request → server | Base64-encoded payment payload (replaces v1 `X-PAYMENT`) |
| `PAYMENT-REQUIRED` | Response 402 → client | Base64-encoded payment requirements (NEW in v2 — no v1 equivalent) |
| `PAYMENT-RESPONSE` | Response 200 → client | Base64-encoded settlement response (replaces v1 `X-PAYMENT-RESPONSE`) |

### v1 Protocol (Legacy, still supported by CDP facilitator)

| Header | Direction | Description |
|---|---|---|
| `X-PAYMENT` | Request → server | Base64-encoded payment payload |
| `X-PAYMENT-RESPONSE` | Response 200 → client | Base64-encoded settlement response |

---

## Current TrustBench surface (as of 2026-05-12)

| Header path | Current state | Migration needed |
|---|---|---|
| Inbound payment payload | reads v1 `X-PAYMENT` only | accept BOTH v1 + v2; prefer v2 when both present |
| Outbound 402 PaymentRequired | emits v2 `PAYMENT-REQUIRED` ✓ shipped | done |
| Outbound 200 settle response | does NOT emit either v1 or v2 settle response header | add v2 `PAYMENT-RESPONSE`; optionally emit both during transition window |
| Smoke harness PaymentPayload | sends v1 `X-PAYMENT` | switch to v2 `PAYMENT-SIGNATURE` once the server accepts both |

---

## Critic pass — read before coding

**Three rejection reasons a hostile reviewer would give:**

1. **"Real-world agents send X-PAYMENT — renaming on the server breaks them."** Counter: the migration ACCEPTS both inbound headers; doesn't reject v1. The smoke harness switch is just to test the new path. Production agents continue to work unchanged.

2. **"`PAYMENT-RESPONSE` on the 200 outbound is non-trivial — the settle path is the most byte-sensitive code in the codebase."** Counter: we use `encodePaymentResponseHeader(settleResp)` from `@x402/core/http` (mirror of `encodePaymentRequiredHeader` we shipped 2026-05-12). Byte format is the SDK's; we don't roll our own.

3. **"Why bother if v1 works?"** Counter: future-proofing. As v2-only agents emerge (some are already in the catalog — exa.ai, x402route.vercel.app, etc.), v1-only servers become discoverable-but-broken. The cost of the migration is small (~2 hours, single Critic pass) and the upside is full v2 spec compliance + eventual freedom from v1 fallback complexity.

**Strongest counter-thesis:** "Just don't migrate. Run on v1 inbound forever. When v1 agents are extinct and only v2 agents remain, that's a 2027 problem, not a 2026 problem." Plausible. The migration is a polish item, not a correctness must-have. **Decision gate:** only do this if (a) you observe a real agent sending PAYMENT-SIGNATURE and getting rejected by our server, OR (b) you want full v2 compliance for a partnership ask (e.g., Strata's reference integration), OR (c) any new x402 SDK release switches to v2-only sending.

**Hidden assumption:** the CDP facilitator's `verify` and `settle` work the same regardless of whether the AGENT sent v1 or v2 payment payload header. Verified by today's smoke runs (we send v1 `X-PAYMENT`, CDP facilitator settles fine, indexing works).

**Kill criterion:** if any S1-S4 smoke check regresses after the migration, revert and reassess. Smoke harness is the byte-fidelity ground truth.

**Verdict:** acceptable, but optional. The day's decision is "queue, don't ship."

---

## Implementation sketch (do not code from this — re-read CLAUDE.md high-risk discipline first)

### Server side: `src/paywall-handler.ts`

1. **Accept both inbound header names.** In `paywallGate`:
   ```typescript
   const xPayment =
     c.req.header('PAYMENT-SIGNATURE') ||  // v2 — preferred
     c.req.header('X-PAYMENT');             // v1 — backward compat
   ```
   `decodeXPayment(xPayment)` is unchanged because the BODY of the header (base64 JSON) is the same in v1 and v2; only the header NAME differs.

2. **Emit `PAYMENT-RESPONSE` on the 200 settle path.** Currently `paywall-handler.ts` around line ~975 emits `c.json(canonicalKeyOrder(response), 200, responseHeaders)` with `responseHeaders` containing `X-Receipt-Id` (+ optional `EXTENSION-RESPONSES`). Add:
   ```typescript
   import { encodePaymentResponseHeader } from '@x402/core/http';
   // ...
   responseHeaders['PAYMENT-RESPONSE'] = encodePaymentResponseHeader(settleResp);
   // optionally during transition window, also emit:
   // responseHeaders['X-PAYMENT-RESPONSE'] = encodePaymentResponseHeader(settleResp);
   ```
   `encodePaymentResponseHeader` exists in `@x402/core/http` per `node_modules/@x402/core/dist/cjs/http/index.d.ts`. Mirror of what we used for PAYMENT-REQUIRED today.

3. **Failure-mode paragraph in comments.** Same shape as FIX-PAYMENT-REQUIRED-HEADER: defensive try/catch around the encoder so a malformed shape produces a degraded body-only emission (with the receipt in body), not 500. Note in the comment: "if `PAYMENT-RESPONSE` encoder fails, agent loses the v2 settle-echo path but still gets the receipt body — backward-compat-safe."

### Smoke harness side: `scripts/paywall-smoke.ts`

1. **Switch outbound to `PAYMENT-SIGNATURE`.** `postRoute()` currently sets `headers['X-PAYMENT'] = xPayment`. Change to:
   ```typescript
   if (xPayment) headers['PAYMENT-SIGNATURE'] = xPayment;
   ```
   This is what tests the new server-side accept-both code path.

2. **Add S2.5 (NEW): backward-compat verification.** A new smoke step that sends `X-PAYMENT` (v1 name) instead of `PAYMENT-SIGNATURE` (v2 name) and verifies the settle still works. Confirms the dual-accept logic doesn't accidentally reject v1.

3. **Add S5 (NEW): verify PAYMENT-RESPONSE header on outbound 200.** Check that `response.headers.get('payment-response')` is present and base64-decodes to a valid SettleResponse shape. Optional: also check `X-PAYMENT-RESPONSE` if we kept the legacy emit during transition.

### Verification gates

- `npx tsc --noEmit` clean.
- `npm run smoke:paywall` against prod — ALL S1-S5 (or S1-S4 + new S2.5) PASS.
- Direct curl test: send `X-PAYMENT` (v1) header, verify settle works. Send `PAYMENT-SIGNATURE` (v2) header, verify settle works.
- Re-run `agentic.market/validate` POST against trustbench.io/route — must stay 11/11 green.

---

## Open design questions for the fresh session

1. **Do we emit BOTH `X-PAYMENT-RESPONSE` and `PAYMENT-RESPONSE` during a transition window, or only the v2 name?**
   - Both = safest for legacy v1 client backward compat. Slightly more header bytes per response.
   - v2 only = cleaner, but breaks any v1 client that's parsing `X-PAYMENT-RESPONSE` to get the settle result.
   - Today our smoke doesn't check either, so neither breaks today's harness — but real-world v1 SDKs likely do parse `X-PAYMENT-RESPONSE`.
   - Recommendation: emit both during transition. Remove `X-PAYMENT-RESPONSE` only when telemetry shows zero clients reading it (probably never — keep both indefinitely for low cost).

2. **Do we want to ALSO accept v1 `X-PAYMENT-SIGNATURE` (a hypothetical malformed name)?** No. Spec is `PAYMENT-SIGNATURE` (v2) and `X-PAYMENT` (v1). No third variant.

3. **Should the smoke harness default to v2 names, with a `--use-v1` flag for backward-compat testing?** Yes, recommended. Default to v2 (forward-looking); `--use-v1` runs the legacy path to verify accept-both works.

---

## Files this will touch (in dependency order)

1. `src/paywall-handler.ts` — inbound dual-accept, outbound PAYMENT-RESPONSE emission. ~30 lines including failure-mode comments.
2. `scripts/paywall-smoke.ts` — outbound header switch, new S2.5 + S5 checks. ~40 lines.
3. `decisions.md` — Decision Journal entry for the migration with 90-day check_back.
4. `lessons.md` — entry capturing anything non-obvious learned during the migration.
5. Possibly: `competitive-landscape.md` if migration reveals anything about CDP / Foundation behavior worth noting.

---

## What is OUT of scope for this handoff

- Renaming our own internal types (`PaymentPayload`, `PaymentRequirements`) — those are package-defined types we import; we don't rename them.
- Changing the EIP-3009 authorization inside the payload — that's separate and stays unchanged.
- Touching the receipt envelope (`receipt.signature.alg` is already `ed25519` and stays so; the receipt is independent of the HTTP transport layer).
- Renaming the request body parameters (`capability`, `max_price`, `payer_address`) — those are application-level, not protocol-level.
- The GET /route A/B/C behavior decision — see `phase4-get-route-behavior-handoff.md`.

---

## Success criterion

When done, the following all hold:

1. `agentic.market/validate` POST trustbench.io/route stays 11/11 green.
2. Smoke S1-S4 unchanged (still pass). Smoke S2.5 (new) passes for legacy `X-PAYMENT` clients. Smoke S5 (new) passes for `PAYMENT-RESPONSE` emit.
3. Direct curl with `X-PAYMENT` header still settles.
4. Direct curl with `PAYMENT-SIGNATURE` header settles.
5. Both `X-PAYMENT-RESPONSE` and `PAYMENT-RESPONSE` present on 200 responses (during transition window) OR only `PAYMENT-RESPONSE` if we decided to drop v1.
6. Decision Journal entry logged with 90-day check_back.
7. Lessons captured if anything was non-obvious.

If indexing landed on Bazaar in the meantime (since 2026-05-12 5th settle), confirm the migration doesn't regress that.

---

## Pointer back to the day this was deferred

`project_phase4_path_p_progress_2026_05_12.md` memory has the full context of the day this was deferred. That session was already substantial; the migration was the right thing to push to a fresh window with appropriate Critic discipline.
