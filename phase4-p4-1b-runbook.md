# Phase 4 P4-1b — Paid-probe go-live runbook

**Purpose:** Take TrustBench from "P4-1a code shipped on disk" to "first signed receipt for an Infopunks paid call, ready to send for amplification."

**Pre-condition:** P4-1a code on disk and tsc clean (verified 2026-05-04). All four x402 wire helpers (`probeFor402Challenge`, `loadProbeConfig`, `buildXPaymentHeader`, `parseTxHashFromResponse`) defined in `src/route-handlers.ts`. `crawler.ts seedKnownX402Endpoints()` seeds three Infopunks endpoints with capability `data` + `metadata.x402_probe_method = 'POST'` + verified probe bodies.

**Non-custodial reminder:** the probe wallet's private key is yours alone. Don't paste it into chat with Claude or any other agent. Generate it locally; store it only in your password manager and as a GitHub Secret.

**Audience:** Johan, executing on Windows (PowerShell). Each step is independently restartable.

---

## Step 1 — Insert + score the Infopunks endpoints

Run from the project root (`C:\Users\Lithv\Documents\Claude\Projects\TrustBench`).

```powershell
# Crawl runs the verified-x402 seed (Infopunks 3 endpoints) + the legacy crawl path.
npm run crawl

# Pipeline runs the HEAD-probe + scorer. Infopunks's endpoints return 404 to GET
# (POST-only), but the prober treats 404 as alive (per ALIVE_STATUSES in prober.ts),
# so they'll get a scorecard.
npm run pipeline
```

**Expected output:**

- `🌱 Seeding verified-real x402 endpoints...` followed by `✅ Inserted/updated 3 providers`.
- Pipeline run completes with no errors. Infopunks rows get a non-null `score` row in `scorecards`.

**Verify:**

```powershell
# Replace with your live deployment URL (or localhost if running dev).
$base = 'https://trustbench-production.up.railway.app'

# Should return 3 Infopunks entries plus any other capability=data rows.
curl "$base/rankings?capability=data"
```

The three Infopunks `provider_id` URLs should appear. If they don't, check `npm run pipeline` logs for the Infopunks URLs and confirm scorecards were written.

---

## Step 2 — Provision the probe agent in Supabase

This is the agent that paid-probe authenticates as. The spend caps on this agent are the budget mechanism (locked: $20/mo, $0.05 per call, $0.70 daily rolling).

```powershell
# Create the probe agent. Captures an API key — copy it immediately, it's not retrievable.
npm run create-agent -- probe@trustbench.io "TrustBench Internal Probe" live
```

Save the output `tb_live_…` API key. You'll set it as a GitHub Secret in step 5.

Then in the Supabase SQL editor, run the cap-config block from `phase3-paid-probing.md` § "Probe agent provisioning":

```sql
update agents
set spend_cap_per_call_atomic = '50000',          -- $0.05
    spend_cap_rolling_atomic  = '700000',         -- $0.70
    spend_cap_rolling_window_minutes = 1440,      -- 24 hours
    spend_cap_currency = 'USDC',
    metadata = '{"role": "internal_probe"}'::jsonb
where email = 'probe@trustbench.io';
```

Verify:

```sql
select email, spend_cap_per_call_atomic, spend_cap_rolling_atomic, metadata
from agents where email = 'probe@trustbench.io';
```

You should see `50000`, `700000`, and `{"role": "internal_probe"}`.

---

## Step 3 — Generate a fresh probe wallet (locally)

A dedicated EOA, not your personal wallet. USDC-only — never funded with ETH (provider pays gas via EIP-3009 transferWithAuthorization). Pre-fund target: ~$30 USDC on Base.

**Option A — MetaMask** (recommended if you already use it):
1. MetaMask → Account menu → **Add account or hardware wallet** → **Add a new account**.
2. Name it `TrustBench Probe`.
3. Switch to Base network.
4. Go to Account details → **Show private key**. Paste into your password manager.

**Option B — Generate via Node** (PowerShell, no GUI):

```powershell
# viem is already installed as a devDependency. Generates a fresh EOA in your shell.
node -e "import('viem/accounts').then(m => { const a = m.privateKeyToAccount(m.generatePrivateKey()); console.log('address:', a.address); console.log('private key:', a.publicKey ? '<see above>' : '?'); })"

# Cleaner one-liner that prints both:
node --experimental-vm-modules -e "const { generatePrivateKey, privateKeyToAccount } = await import('viem/accounts'); const pk = generatePrivateKey(); const acct = privateKeyToAccount(pk); console.log('ADDRESS:', acct.address); console.log('PRIVATE KEY:', pk);"
```

Save both values to your password manager. The address goes on Basescan when you fund. The private key goes only into a GitHub Secret in step 5.

**Sanity-check the format:**

- Address: `0x` + 40 hex chars
- Private key: `0x` + 64 hex chars

If anything else, regenerate.

---

## Step 4 — Fund the probe wallet with $30 USDC on Base

From your funded wallet:

1. Go to your Base USDC source (Coinbase, your existing Base wallet, a centralized exchange, etc.).
2. Send **30 USDC** to the probe wallet address from step 3.
3. Confirm on Basescan: `https://basescan.org/address/<probe-address>` should show ~30 USDC balance.

**Refill threshold:** the script logs a `REFILL NEEDED` warning when the balance drops below $10. Top up manually when that fires.

**Acid test:** the probe wallet should hold USDC on Base only. No ETH (you're not paying gas). No Polygon, Solana, mainnet — the probe-script's signing path is hard-coded to Base USDC.

---

## Step 5 — Set GitHub Secrets

Repo Settings → Secrets and variables → Actions → New repository secret. Add these three (and optionally two more):

| Secret name | Value | Required |
|---|---|---|
| `SCRIPTS_PROBE_API_KEY` | `tb_live_…` from step 2 | Yes |
| `SCRIPTS_PROBE_WALLET_PK` | `0x` + 64 hex from step 3 | Yes |
| `TRUSTBENCH_BASE_URL` | `https://trustbench-production.up.railway.app` (or your live URL) | Yes |
| `SUPABASE_URL` | Same as in `.env` | Optional (enables soft cap pre-check) |
| `SUPABASE_SECRET_KEY` | Same as in `.env` | Optional (enables provider-rotation logic) |

The two optional secrets enable smarter behavior in `paid-probe.ts` — `SUPABASE_URL` and `SUPABASE_SECRET_KEY` let the script (a) compute month-to-date spend before each run, exiting cleanly when the $20 monthly cap is hit, and (b) rotate to least-recently-probed providers. Without them the script falls back to "always probe top of `/rankings`" and trusts the server-side caps for budget enforcement.

---

## Step 6 — Local dry-run (no money moved)

Run this on your dev machine *before* enabling the GitHub Actions cron. Set the same env vars locally (PowerShell):

```powershell
$env:SCRIPTS_PROBE_API_KEY = 'tb_live_...'
$env:SCRIPTS_PROBE_WALLET_PK = '0x...'
$env:TRUSTBENCH_BASE_URL = 'https://trustbench-production.up.railway.app'
$env:SCRIPTS_PROBE_DRY_RUN = 'true'
$env:SCRIPTS_PROBE_MAX_PROVIDERS = '1'
$env:SCRIPTS_PROBE_CAPABILITIES = 'data'  # Infopunks endpoints are tagged 'data'

npm run paid-probe
```

**Expected output:**

```
[probe] starting  base=https://...  dry=true  wallet=0x...  max=1  caps=data
[probe] 1 target(s): data:https://infopunks-cognition-layer-x402.onrender.com/v1/...
[probe] DRY        data:https://infopunks-...  route=qt_...  amount=10000
[probe] done  ok=0  fail=0  dry=true
```

Dry-run does the full quote step (writes a `quotes` row, signs the EIP-3009 authorization in memory) but skips the settle. **No money moves.**

If this fails: read the failure mode. Most likely culprits:
- `quote_failed` with `provider_unavailable` → check the Infopunks endpoint is reachable and the seed metadata is in the providers table.
- `provider_invalid_challenge` with `network=eip155:8453` mismatch → the validator already accepts both `base` and `eip155:8453`, but if Infopunks ships a fresh dialect, surface to me to extend `validateChallenge`.
- `provider_overpriced` → unexpected; Infopunks is $0.01/call and our cap is $0.05. Check `max_price_atomic` on the agent row.

---

## Step 7 — Local single-provider live run (first real receipt)

If dry-run passes cleanly:

```powershell
$env:SCRIPTS_PROBE_DRY_RUN = 'false'  # the only change
npm run paid-probe
```

**Expected output:**

```
[probe] starting  base=...  dry=false  wallet=...  max=1  caps=data
[probe] 1 target(s): data:https://infopunks-.../v1/coherence-score
[probe] OK         data:https://infopunks-...  route=qt_...  receipt=rcpt_...  Nms
[probe] done  ok=1  fail=0  dry=false
```

This burned ~$0.01 of probe wallet USDC + earned ~$0.01 of Infopunks revenue. A `rcpt_...` ID is the deliverable.

**If this errors:**

- `provider_signature_rejected` (502) → buildXPaymentHeader produced a payload Infopunks's facilitator couldn't verify. Surface the route_id + the Infopunks logs to me. Most likely a field-casing or stringification mismatch in the EIP-3009 struct.
- `provider_settlement_missing` (502) → settle reached Infopunks but the X-PAYMENT-RESPONSE header is malformed or absent. Surface the response body to me.
- `provider_error` (502 with `provider returned 5xx`) → Infopunks settled (took the money) but their endpoint errored. Per spec, money moved, no receipt. Surface tx_hash to me — I'll cross-check Basescan to confirm settlement.

---

## Step 8 — Verify the receipt

```powershell
# Replace <id> with the rcpt_... from step 7.
$id = 'rcpt_...'

# Fetch the receipt envelope.
curl "$env:TRUSTBENCH_BASE_URL/receipts/$id" | ConvertFrom-Json | ConvertTo-Json -Depth 6

# Verify the signature using TrustBench's reference verifier.
npm run verify-receipt -- $id

# With on-chain enrichment (optional — requires viem in scripts/, already installed):
npm run verify-receipt -- $id --pubkey-url "$env:TRUSTBENCH_BASE_URL/.well-known/trustbench-pubkey" --check-chain
```

**Expected:** `SIGNATURE VALID` plus (with `--check-chain`) on-chain confirmation that `tx_hash` exists on Base, the `from`/`to`/`amount` match the receipt, and the `block_number` matches.

If the verifier fails, **do not send to Infopunks.** Surface the exact error message to me.

---

## Step 9 — Send the receipt to InfopunksHQ

DM `@InfopunksHQ` on X with:

```
landed clean — first paid receipt through your cognition layer

receipt: <TRUSTBENCH_BASE_URL>/receipts/<id>
verifier: npm i -g @trustbench/verify-receipt && trustbench verify <id>   (or run the script in our repo)
pubkey: <TRUSTBENCH_BASE_URL>/.well-known/trustbench-pubkey

happy for you to amplify as the "first external evidence trail through the cognition layer" if you like that framing
```

(The npm-package line is aspirational — `@trustbench/verify-receipt` is P4-4 and not yet published. Until then, the verifier is `node scripts/verify-receipt.js <id>` from the repo. Adjust copy accordingly.)

Tone: factual, low-friction for them to amplify. Don't overclaim. Their framing — "first external evidence trail through the cognition layer" — is the one to offer back; let them decide whether to use it.

---

## Step 10 — (Optional) Enable the GitHub Actions cron

Once the local single-provider live run is clean and Infopunks has the first receipt, enable the cron:

```powershell
# The workflow file is .github/workflows/paid-probe.yml (shipped in Phase 3).
# It runs every 4 hours. To force the first run immediately:
gh workflow run paid-probe.yml
gh run watch
```

Confirm the run logs the same `OK` line as step 7. Future runs will rotate across the 3 Infopunks endpoints (and any other capability=data providers added to the registry later) within the $20/mo cap.

---

## What success looks like

1. ✅ Three Infopunks rows in `providers` + `scorecards` with non-null score.
2. ✅ `paid-probe` dry-run passes against one Infopunks endpoint.
3. ✅ `paid-probe` live single-provider run produces a `rcpt_...` ID.
4. ✅ `npm run verify-receipt -- <id> --check-chain` returns `SIGNATURE VALID` + on-chain match.
5. ✅ Receipt + verifier link sent to `@InfopunksHQ`.
6. (Optional) Scheduled cron enabled and first cron run produces another receipt.

At step 5, P4-1b is done and the Infopunks-first sequence pays its dividend: real x402 traffic, real signed receipts, public co-launch material. From there: P4-2 (receipt explorer using Infopunks's `/proof` page as design reference) and P4-6 (formal Infopunks integration around passport + receipts) become the next priorities.

---

## What this runbook deliberately does NOT cover

- The Phase 4 follow-up on `/route` + `/route/settle` body-passthrough — currently the settle step reuses `metadata.x402_probe_body` for the paid call, which is correct for paid-probe but not for real agents. That's task #7's "future work" half. Track it as Phase 4 P4-1c after first amplification lands.
- Multi-region probing, auto-refill, reactive scorecard adjustment from probe outcomes — all explicitly out of Phase 3 / P4-1b scope per `phase3-paid-probing.md`.
- Anything custodial. TrustBench never holds the probe wallet's funds. The script signs in-memory; settlement is provider-submitted.
