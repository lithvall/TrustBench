# Phase 4 v0.1.0 paywall — § 1.3 pre-flight runbook

**Owner:** Johan (manual steps in wallet app + Railway dashboard).
**Created:** 2026-05-11. Pairs with `phase4-listing-plan.md` § 1.3 and `phase4-paywall-design.md` § 7 (failure modes).
**Estimated time:** ~30 minutes including the settle test.
**Goal:** Revenue wallet provisioned, env vars on Railway, x402 facilitator wire confirmed against the real wallet — before Sprint Day 1 (2026-05-12) paywall middleware starts.

This is everything in § 1.3 turned into a sequential checklist. Do steps in order; each step's success criterion is stated.

---

## Step 1 — Generate the revenue wallet (wallet app, receive-only)

**Why receive-only:** the paywall design (`phase4-paywall-design.md` Q3) requires a wallet that is *distinct from* the probe wallet (`SCRIPTS_PROBE_WALLET_PK`) so probe spend and revenue receive stay accounting-clean. Keeping the private key in a wallet app instead of on the server means even a full Railway compromise can't drain the revenue wallet.

**Pick one app you already use:**

1. **Coinbase Wallet** (browser extension or mobile). Add account → "Create new account" → name it `trustbench-revenue` → switch network to **Base** in the network picker → copy the `0x...` address.
2. **Rabby** (browser). Add Account → "Create new address" → name it `trustbench-revenue` → ensure Base is enabled in network settings → copy the address.
3. **MetaMask** (browser). Account selector → "Add account" → "Add new account" → name it `trustbench-revenue` → switch the network dropdown to Base (add Base manually via `chainlist.org` if not present) → copy the address.

Whatever app you pick: write the seed phrase / backup somewhere durable. If the wallet app dies, you lose access to revenue accumulated in this address. Same custody discipline as any USDC-receiving address.

**Do NOT prefund the wallet.** Earlier listing-plan draft suggested $5-10 USDC for "facilitator gas." That was wrong — the x402 facilitator pays its own ETH gas; the merchant wallet only receives USDC. A zero-balance wallet is fine.

**Success criterion:** you have a `0x` + 40-hex-character address that is *different* from `PAY_TO_ADDRESS` (the prober payee) and *different* from the probe wallet's address (the prober signer).

---

## Step 2 — Add env vars to Railway (3 vars)

Go to Railway → TrustBench project → Variables tab. Add these three:

| Variable | Value | Notes |
|---|---|---|
| `TRUSTBENCH_REVENUE_WALLET_ADDRESS` | `0x...` from Step 1 | The receive address. Public. No private key. |
| `TRUSTBENCH_PAYWALL_ENABLED` | `false` | Keep paywall OFF until middleware lands on Sprint Day 3. Don't flip until the smoke test in Sprint Day 4 passes. |
| `TRUSTBENCH_FACILITATOR_URL` | `https://x402.org/facilitator` | Public Foundation facilitator. No CDP credentials needed. Switch to Coinbase CDP later if rate limits bite (1K tx/mo free, $0.001/tx after). |

Optional: also add `BASE_RPC_URL` if you have a dedicated Base RPC endpoint (Alchemy, Infura, Coinbase Node). The settle test defaults to `https://mainnet.base.org` which works but rate-limits. For one-off pre-flight, the default is fine.

**Don't redeploy yet.** Railway will pick the new vars up on the next deploy or when you restart the service. The paywall middleware isn't in code yet, so no behavior change.

**Success criterion:** the three vars show in the Railway variables list with the values above.

---

## Step 3 — Pre-flight settle test (real money, $0.005 USDC)

This is the de-risking step. It proves the x402 facilitator accepts your revenue wallet as `payTo` and that EIP-3009 settlement actually credits the wallet on Base, **before** any middleware code that depends on it ships. P4-1b precedent: 9 hand-roll patches were needed once we first called the Coinbase CDP facilitator for real. Better to find dialect bugs today than mid-sprint.

**Pull the latest changes locally first:**

```powershell
cd C:\Users\Lithv\Documents\Claude\Projects\TrustBench
git pull
npm install
```

**Set the local .env** with the same values you added to Railway, plus the existing `SCRIPTS_PROBE_WALLET_PK` from your prior paid-probe setup. Confirm `.env` has:

```
SCRIPTS_PROBE_WALLET_PK=0x<probe wallet private key>
TRUSTBENCH_REVENUE_WALLET_ADDRESS=0x<revenue wallet address from Step 1>
TRUSTBENCH_FACILITATOR_URL=https://x402.org/facilitator
```

**Run dry-run first** (verify-only, no money moves):

```powershell
npm run facilitator-settle-test -- --dry-run
```

Expected output (truncated):

```
[facilitator-test] === Phase 4 paywall pre-flight ===
[facilitator-test] facilitator   : https://x402.org/facilitator
[facilitator-test] agent (probe) : 0xPROBE...
[facilitator-test] merchant (rev): 0xREVENUE...
[facilitator-test] amount        : 5000 atomic ($0.005 USDC)
[facilitator-test] dry-run       : true (true = verify only, no settle)
[facilitator-test] agent USDC before    : $29.97...
[facilitator-test] merchant USDC before : $0
[facilitator-test] payload signed (...)
[facilitator-test] POST /verify ...
[facilitator-test] verify response: { "isValid": true, ... }
[facilitator-test] OK verify: signature + balance accepted by facilitator
[facilitator-test] --dry-run set; stopping before /settle. No money moved.
```

If `isValid: false`, **stop**. Read the `invalidReason` / `invalidMessage` carefully and ping me with the full output before continuing. This is exactly the kind of dialect bug we want to catch today.

**Then run the real settle** (costs $0.005 USDC + tiny BasescanFacilitator ETH gas which the facilitator pays for you):

```powershell
npm run facilitator-settle-test
```

Expected: `settle` returns `success: true` with a tx hash; the script reads the revenue wallet's USDC balance after ~5-15 seconds and shows `+$0.005`.

**Success criterion:** `=== PASS — facilitator wire works end-to-end ===` printed; tx visible on `https://basescan.org/tx/<txhash>`; revenue wallet shows $0.005 USDC in your wallet app.

**If settle fails:**
- `success: false, errorReason: insufficient_funds` → top up probe wallet with USDC on Base.
- `success: false, errorReason: invalid_signature` → SDK + facilitator disagree on EIP-712 domain. Surface the full response body; treat as a Sprint-blocker.
- HTTP timeout / 5xx from facilitator → public facilitator at `x402.org/facilitator` may be intermittently down. Retry in 10 min; if persistent, switch `TRUSTBENCH_FACILITATOR_URL` to the Coinbase CDP one (needs CDP creds, see below) or proceed without a passing pre-flight and rely on Sprint Day 4 smoke.

---

## Step 4 — Confirm and commit

Once the settle test passes:

1. **In your wallet app**, refresh the revenue wallet's USDC balance. Should show exactly $0.005 (the test transfer).
2. **Don't transfer it out yet.** Leaving the small balance in place is a tiny live proof that the address you put into Railway is the address you actually control — a "this is mine" tag for future audit.
3. **Append a Decision Journal entry to `decisions.md`:**

```
## 2026-05-11 — Revenue wallet provisioned + facilitator settle test passed

**Decision:** Revenue wallet `0x<REVENUE>` registered as TRUSTBENCH_REVENUE_WALLET_ADDRESS. Public Foundation facilitator at https://x402.org/facilitator validated for verify+settle on Base.

**Why:** § 1.3 pre-flight per phase4-listing-plan.md; de-risks Sprint Day 3-4 middleware work.

**Load-bearing assumption:** Public Foundation facilitator stays available and within 1K tx/mo free tier through v0.1.0 (we're nowhere near that volume).

**Leading indicator:** If x402.org/facilitator starts rate-limiting or returns 5xx for >2 consecutive paywall calls in production, we cut over to Coinbase CDP facilitator (provision CDP creds at that point).

**check_back_date:** 2026-08-09 (90 days)
**status:** open
```

4. **Push the commit.** Files touched so far this session:

```powershell
git status
# Expect:
#   modified:   phase4-listing-plan.md   (Ed25519 wording fix in § 1.3)
#   modified:   .env.example              (added paywall block)
#   modified:   package.json              (added facilitator-settle-test script)
#   new file:   scripts/facilitator-settle-test.ts
#   new file:   phase4-1.3-preflight-runbook.md (this file)
#   modified:   decisions.md              (new entry above)

git add phase4-listing-plan.md .env.example package.json scripts/facilitator-settle-test.ts phase4-1.3-preflight-runbook.md decisions.md
git commit -m "feat: Phase 4 § 1.3 pre-flight — revenue wallet env + facilitator settle test"
git push
```

**Success criterion:** push lands; Railway picks up the new vars on next deploy or restart.

---

## Step 5 — Sprint Day 1: `paid_requests` migration + smoke

The Day 1 deliverable from `phase4-listing-plan.md` § 2 Day 1 is the `paid_requests` table and its RLS smoke. The migration SQL and smoke script landed in the repo as part of this pre-flight session (so you don't have to write them tomorrow morning).

### 5a — Apply the migration

Open Supabase → SQL editor → paste the contents of `phase4-schema-paid-requests.sql` → Run. Expected last row of output: `✅ Phase 4 v0.1.0 paid_requests schema ready`.

The migration is idempotent (`if not exists` guards everywhere) so you can rerun if anything's off. Two intentional deviations from `phase4-paywall-design.md` § Q10 are documented in the SQL file header:

1. **Idempotency index is compound** `(agent_address, idempotency_key)` instead of single-column `(idempotency_key)`. Q4 and § 7's failure-mode mitigation both require this namespacing to prevent cross-agent cache-hit collision. Q10's single-column spec was incomplete.
2. **RLS is service-role-only**, not the JWT-claim-wallet policy from Q10. Reason: TrustBench's Phase 3 auth uses argon2id-hashed API keys, not Supabase JWTs with a wallet claim — Q10's `current_setting('request.jwt.claim.wallet')` policy would compile but enforce nothing. Conservative shape (service-role-full) matches the rest of `phase3-schema.sql`. Public read deferred until SIWx session JWTs land or `/compliance-export` ships as the curated read endpoint.

If either deviation surprises you, read the SQL header comment block before applying — it has the full reasoning.

### 5b — Run the RLS smoke

```powershell
npm run smoke:paid-requests
```

The smoke does five checks: (S1) service-role can insert; (S2) service-role can read it back; (S3) anon-role CANNOT see the row (RLS denial); (S4) anon-role CANNOT insert; (S5) cleanup deletes the test row.

Expected last lines:

```
[smoke-paid-requests] === ALL CHECKS PASSED ===
```

If S3 or S4 fail (`LEAK: anon ...`), do NOT proceed to Sprint Day 2 — RLS is misconfigured and anyone with the publishable key could read or forge paid_requests rows. Re-check the migration applied cleanly, especially the `alter table paid_requests enable row level security;` + `create policy "Service role full" ...` lines.

### 5c — Confirm and commit Day 1 done

Once the smoke passes:

1. **Append a Decision Journal entry to `decisions.md`:**

```
## 2026-05-12 — paid_requests table live; Sprint Day 1 complete

**Decision:** phase4-schema-paid-requests.sql applied to Supabase. Service-role-only RLS; compound idempotency index. RLS smoke (5/5 checks) green.

**Why:** Foundational table for v0.1.0 paywall revenue tracking; required by Day 3 middleware.

**Load-bearing assumption:** Service-role-only RLS is sufficient for v0.1.0 (no direct agent → Supabase reads; all reads go through the TrustBench server). If we ever expose paid_requests via direct PostgREST (e.g. for /compliance-export), RLS must be revisited.

**Leading indicator:** First /compliance-export design spike. At that point, decide between (a) keep service-role-only + curate reads behind the API endpoint, or (b) ship a SIWx-based per-agent JWT and switch to the JWT-claim policy.

**check_back_date:** 2026-08-10 (90 days)
**status:** open
```

2. **Commit:**

```powershell
git add phase4-schema-paid-requests.sql scripts/smoke-paid-requests.ts package.json decisions.md
git commit -m "feat: Phase 4 v0.1.0 paid_requests table + RLS smoke (Sprint Day 1)"
git push
```

3. **Move to Sprint Day 2** per `phase4-listing-plan.md` § 2 Day 2: `/pricing` HTML+JSON page and paid-endpoint annotations in skill.md / .well-known / llms.txt.

### 5d — Sprint Day 2 (Tuesday 2026-05-13): /pricing page + discovery annotations

The pricing page and the skill.md / .well-known / llms.txt paid-endpoint annotations all landed in the same pre-flight session (see "What changed" at the bottom of this file). Day 2 steps:

1. `npm run dev` locally; visit `http://localhost:3000/pricing` in a browser → should see the V2 light-theme page with the 7-row tier table, "Live in v0.1.0" badge on Score-provider, "Available in v0.2.0/v0.3.0" badges on the rest.
2. `curl -H 'Accept: application/json' http://localhost:3000/pricing | jq .tiers | head -40` → should match the HTML table (same tiers, same prices).
3. `curl -H 'Accept: application/json' http://localhost:3000/.well-known/trustbench.json | jq '.endpoints | length'` → 8 entries; `jq '.endpoints | map(select(.paid == true)) | length'` → 5.
4. `curl http://localhost:3000/skill.md | grep "paid: true"` → at least one match (on `/route`).
5. `curl http://localhost:3000/llms.txt | grep '/pricing'` → at least one match.

If all five inspections look right, commit Day 2 and move to Day 3.

### 5e — Sprint Day 3 (Wednesday 2026-05-14): paywall middleware + smoke

The paywall middleware is in `src/paywall-handler.ts` and is mounted in front of the existing /route chain in `src/index.ts`. It's behind `TRUSTBENCH_PAYWALL_ENABLED` and defaults OFF, so existing traffic is unaffected.

**Critic-pass verdict on the middleware: weak-reject → upgraded to acceptable** after both v0.1.1 gates landed in the same session (2026-05-11):

1. ✅ **Per-paying-wallet hourly rate limit** in `paywallGate` — substitute for the Bearer spend caps the X-PAYMENT branch bypasses. Default 60 calls/hour per agent_address, tunable via `TRUSTBENCH_PAYWALL_HOURLY_LIMIT` env var (set to 0 to disable). Returns 429 with Retry-After when exceeded.
2. ✅ **`replayed_at` marker on cached receipt bodies** — when the idempotency cache hits, the response body now carries a top-level `replayed_at: <iso>` field OUTSIDE the signed receipt bytes. Original signature stays valid; downstream consumers reading the body can distinguish fresh from replayed.

Both validated by `scripts/paywall-smoke.ts` (S3 checks the marker presence + byte-identical receipt + byte-identical signature).

The Critic-pass header comment at the top of `src/paywall-handler.ts` documents all three rejection reasons, the counter-thesis, the wedge competitor analysis, the hidden assumption (Foundation facilitator stability), and the kill criterion. Read it before any changes touching paywall logic. Hidden assumption + kill criterion remain in force.

Day 3 steps:

1. Apply migration `phase4-schema-paid-requests.sql` (Step 5a above).
2. Run `npm run smoke:paid-requests` (Step 5b above) → all 5 checks PASS.
3. Start the dev server: `npm run dev`.
4. Run `npm run smoke:paywall -- --skip-settle` → S1 PASS, S2/S3 SKIP, S4 SKIP. Validates 402 envelope shape without spending USDC.
5. Run `npm run smoke:paywall` (no flag) → S1-S4 all PASS. Costs $0.005 USDC on Base from the probe wallet. Validates the full settle path end-to-end against the real facilitator.
6. **Do NOT flip `TRUSTBENCH_PAYWALL_ENABLED=true` in prod yet.** The Critic verdict gates that on the two v0.1.1 follow-ups landing first.
7. Commit Day 3.

### 5f — Sprint Day 4 (Thursday 2026-05-15): flag flip + prod validation

The two v0.1.1 Critic-gate follow-ups already landed in the pre-flight session, so Day 4 simplifies to "flip the flag and watch":

1. Confirm `TRUSTBENCH_PAYWALL_HOURLY_LIMIT=60` is set on Railway (or leave unset to use the 60 default).
2. Flip `TRUSTBENCH_PAYWALL_ENABLED=true` on Railway.
3. Run `npm run smoke:paywall` against the prod URL: `TRUSTBENCH_BASE_URL=https://trustbench.io npm run smoke:paywall`. Costs $0.005. Validates 402 envelope + settle + idempotency replay (with replayed_at marker) + idempotency conflict end-to-end in production.
4. Watch logs for `[paywall]` lines for 30 minutes. If anything looks off, flip the flag back to false.
5. Compose a public X post about paywall going live (per listing plan Day 5).

After all six steps above, you have:

- A receive-only revenue wallet on Base with private key in your wallet app, address in Railway.
- A proven settle path from agent (probe wallet) through the Foundation facilitator to the revenue wallet, $0.005 actually credited.
- The three paywall env vars live on Railway with `TRUSTBENCH_PAYWALL_ENABLED=false` so nothing's exposed yet.
- The `paid_requests` table live in Supabase with service-role-only RLS smoke-validated.
- Two reusable scripts (`npm run facilitator-settle-test` and `npm run smoke:paid-requests`) for regression-checking before/after middleware ships.

The middleware on Day 3 will reuse the same `HTTPFacilitatorClient` + `ExactEvmScheme` calls the settle test proves out, just inside Hono middleware instead of a CLI, and will write to the `paid_requests` table Day 1 creates.

---

## Reference — what changed in this session

1. `phase4-listing-plan.md` § 1.3 — Ed25519 wording bug fixed (Base wallets are secp256k1; Ed25519 is the receipt-signing key, unrelated). Pre-funding clarified as not required.
2. `.env.example` — new Phase 4 paywall block (3 vars: `TRUSTBENCH_REVENUE_WALLET_ADDRESS`, `TRUSTBENCH_PAYWALL_ENABLED`, `TRUSTBENCH_FACILITATOR_URL`).
3. `scripts/facilitator-settle-test.ts` + `npm run facilitator-settle-test` — new pre-flight script.
4. `phase4-schema-paid-requests.sql` — new migration for Sprint Day 1 (table + indexes + service-role-only RLS, plus `response_body jsonb` for idempotency-replay cache).
5. `scripts/smoke-paid-requests.ts` + `npm run smoke:paid-requests` — new Day 1 smoke (5 checks: service-role write/read works, anon-role read/write blocked, cleanup).
6. `src/pricing-html.ts` + `app.get('/pricing', ...)` — Day 2 pricing page (HTML + JSON content-negotiated, 7-row tier table from design doc § Q7, v0.2.0+ rows badged "Available in v0.2.0"). Added to site nav + footer.
7. `skill.md` + `.well-known/trustbench.json` + `/llms.txt` — Day 2 discovery surface annotations (paid:true on /route, planned-paid annotations on v0.2.0+ endpoints, /pricing referenced everywhere).
8. `src/paywall-handler.ts` + `app.post('/route', paywallGate, ...)` — Day 3 paywall middleware (HIGH RISK SURFACE). Branching auth: X-PAYMENT path bypasses Bearer+spend-caps, no-headers returns 402, Bearer-only falls through unchanged. Critic-pass verdict: weak-reject, gating on v0.1.1 follow-ups.
9. `src/route-handlers.ts` — exported `probeFor402Challenge` + `loadProbeConfig` for the paywall handler's live-probe reuse.
10. `scripts/paywall-smoke.ts` + `npm run smoke:paywall` (and `--skip-settle` flag) — Day 3 smoke (4 checks: 402 envelope, settle happy path, idempotency replay, idempotency conflict).

## Reference — CDP credentials (deferred, not needed today)

Coinbase's CDP facilitator (`https://api.cdp.coinbase.com/platform/v2/x402/{verify,settle}`) offers 1,000 tx/month free, then $0.001/tx. Switching is one env-var change (`TRUSTBENCH_FACILITATOR_URL`) plus provisioning a CDP API key at `portal.cdp.coinbase.com`. We do NOT need it for v0.1.0 — the public Foundation facilitator covers us at expected volume. Bump to CDP if either:

- Foundation facilitator throws 429s or 5xx repeatedly in prod.
- We exceed ~30 paywalled calls/day (rough estimate for "the free public facilitator might be deliberately throttled").

When that day comes, the SDK swap is a one-liner inside `HTTPFacilitatorClient`'s config (`createAuthHeaders` hook). Defer until then.
