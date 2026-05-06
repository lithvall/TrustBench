# Phase 3 — Paid Probing

**Status:** Design draft. Implementation pending (Claude designs scope + budget cap; Grok implements the script).
**Decision date:** 2026-05-02

## Why this exists

The nightly probe (`src/prober.ts`) is a HEAD-only liveness check from a single host. It catches a provider that's down. It does not catch a provider that:

- Returns a 402 to a HEAD probe but rejects every signed authorization at settle time.
- Returns a 402 with a non-conforming JSON body (wrong scheme, wrong asset, wrong network).
- Settles on-chain but never actually serves the paid response.
- Has high upstream-provider latency that doesn't show up in HEAD timings.

These are the failure modes that matter for an x402 router. The HEAD probe is a coarse baseline; **paid probing is the layer that confirms providers actually work for authenticated paid traffic.**

A second benefit is the receipt corpus. Every paid probe writes a real, signed, on-chain-settled receipt to the `receipts` table. That corpus serves three purposes:

1. **Continuous integration test** of the full router stack (auth → idempotency → spend-caps → quote → settle → receipt → audit).
2. **Design-partner demo material** — signed receipts that any verifier can validate independently.
3. **Phase 4 calibration data** — eventually the receipt corpus feeds the score model so that real outcomes (latency, success, settlement reliability under paid traffic) influence ranking, not just liveness.

## Budget — locked at $20/mo

Decision rationale and tradeoffs are in the Phase 3 chat log; the locked numbers:

| Cap | Atomic units (USDC, 6 decimals) | Notes |
|---|---|---|
| Monthly hard ceiling | `"20000000"` ($20.00) | Script-level soft check. Past this, script exits without probing. |
| Daily rolling cap | `"700000"` ($0.70) | Server-side enforcement via spend-cap middleware. ($20 / 30 days ≈ $0.67; $0.70 has 5% slack and rounds nicely.) |
| Per-call cap | `"50000"` ($0.05) | Server-side enforcement. Refuses any provider quoting > $0.05 — keeps blast radius bounded. |
| Pre-fund probe wallet | `~$30 USDC` | 1.5 months of budget. Refill threshold at $10. |
| Approximate calls/month | ~4,000 (at $0.005 avg) | ~133/day, ~6.7 per provider per day across 20 providers. |

Hitting the daily cap stops further probing for that day; the next day's window opens and the script resumes. Monthly drift is bounded — worst case `30 × $0.70 = $21`, so plan for $21/mo as the realistic upper bound.

## Architecture — the probe is just an authenticated agent

The probing script is a regular API consumer of `/route` + `/route/settle`. **No new server-side code is required.** The existing spend-cap middleware enforces the budget. The flow is:

1. Provision a "probe" agent in the `agents` table with the locked cap configuration.
2. Generate an API key via `npm run create-agent` (already exists).
3. Generate a separate Ethereum wallet for the probe (NOT the user's personal wallet — see "Wallet" below).
4. Fund the probe wallet with $30 USDC on Base.
5. Write `scripts/paid-probe.ts` that loops through providers, calls `/route`, signs the EIP-3009 authorization with the probe wallet's key, calls `/route/settle`, logs results.
6. Schedule via GitHub Actions cron (every 4 hours, distributed across providers).

That's the whole design. No new tables, no new middleware, no new database columns. The spend-cap row on the probe agent is the budget mechanism; the receipts table is the audit trail.

## Probe agent provisioning

Run once, before first probe:

```sql
-- After `npm run create-agent -- probe@trustbench.io "TrustBench Internal Probe" live`
-- which inserts the agent and its api_key, run this to set the caps:
update agents
set spend_cap_per_call_atomic = '50000',          -- $0.05
    spend_cap_rolling_atomic  = '700000',         -- $0.70
    spend_cap_rolling_window_minutes = 1440,      -- 24 hours
    spend_cap_currency = 'USDC',
    metadata = '{"role": "internal_probe"}'::jsonb
where email = 'probe@trustbench.io';
```

The `metadata.role = "internal_probe"` flag lets us filter receipts attributable to internal probing later (for analytics that exclude internal traffic, or for excluding probe receipts from public dashboards).

The `mode = 'live'` matters: probes hit real providers with real money. The `test` mode is reserved for sandbox-only flows that aren't yet defined.

## Wallet — separate from any personal wallet

The probe wallet:

- **Is a fresh Ethereum EOA** generated specifically for probing. NOT the user's personal/business wallet.
- **Holds only USDC,** never ETH. (Providers pay gas for the transferWithAuthorization. The probe wallet never submits a tx itself.)
- **Private key is stored only in `SCRIPTS_PROBE_WALLET_PK` env var** — never committed, never echoed in logs.
- **Pre-funded with ~$30 USDC** on Base. Refill threshold at $10 — the script logs a "REFILL NEEDED" warning when the wallet balance drops below threshold (script doesn't auto-refill; user does it manually).

Why separate? Three reasons:

1. **Blast radius.** A bug in the probe script can drain only the probe wallet, not the founder's personal funds.
2. **Auditability.** Every receipt's `payer_address` is the probe wallet's address — any external observer can filter probe-only receipts vs real-agent receipts.
3. **Key hygiene.** A key with $30 of authority is much less consequential than one with thousands. Compromise = $30 loss + rotate, not a big incident.

## Signing — `viem` as a script-only dependency

The probe script needs to sign EIP-3009 `transferWithAuthorization` payloads. The on-chain struct is signed via EIP-712 typed data hashing. Three options:

**Option A — `viem` (recommended).** Modern, minimal, well-maintained, the de facto choice for new x402 implementations. Adds one entry to `package.json`'s `devDependencies` (since the prober is a script, not the runtime). ~50 KB. Handles EIP-712 domain separator + struct hashing + ECDSA signing in one call.

**Option B — `@noble/curves` + `@noble/hashes`.** Bare-metal cryptography libraries; we'd manually compute the EIP-712 domain separator and struct hash, then sign with `@noble/curves`. Smallest possible footprint, no chain-specific code. ~30 KB. More code to write and review, more places to get the canonicalization wrong.

**Option C — Node's built-in `crypto` + manual EIP-712.** No new dep at all. Most code, most review surface, easiest to get wrong. Not recommended.

**Decision: viem.** Locked. `npm install --save-dev viem`. Used only in `scripts/paid-probe.ts` and any future signing-touching script. Not imported anywhere in `src/`. The constraint in CLAUDE.md against new heavy deps is satisfied: viem is small, modern, and isolated to the probe path.

If a future Phase 4 design partner asks for a JS-SDK for agent-side signing, viem becomes a runtime dependency too. That's a future decision.

## Schedule

**GitHub Actions cron, every 4 hours.** That's six runs per day. Each run picks a *subset* of providers to probe — not all 20 every run. Specifically:

- Maintain a per-provider "last probed" timestamp in the receipts table (queryable via `idx_receipts_capability` + agent_id filter).
- Each run picks the 3–4 providers least recently probed within the script's daily allowance (i.e., the ones we have budget left for).
- Skip providers whose latest scorecard is below the score floor (40) or stale (>48h) — those are filtered by the regular `selectProvider` logic anyway.

This gives ~24 probes per run × 6 runs/day = ~144 probes/day, matching the $20-budget target.

Distribution across the day matters for two reasons:

- A provider that's down at 03:00 UTC but up at 15:00 UTC gets caught by at least one probe.
- The daily cap doesn't fire at 03:00 and starve probes from 03:00–24:00.

## Failure handling

**A failed paid probe still writes a receipt** — the receipt's `response_body` will contain the upstream error. The settlement happened on-chain (provider has the USDC), so the receipt records what actually happened. Distinguishes:

- **Provider rejected signature** → no on-chain settlement, no receipt (settle returns 502 `provider_signature_rejected`). Logged but not billed.
- **Provider settled + returned 200** → normal receipt, success.
- **Provider settled + returned 5xx** → receipt with the 5xx body. Money moved; no useful response. Counted toward budget. This is the "best-effort routing" guarantee documented in `phase3-x402-construction.md`.
- **Provider settled but missing `tx_hash` in X-PAYMENT-RESPONSE** → 502 `provider_settlement_missing` from settleHandler. No receipt. Logged.

The probe script does **not** mutate the providers' scorecards based on probe outcomes. The probe pipeline (`src/prober.ts`) remains the only writer to scorecards. Phase 4 may add a "live signal" feed from receipts back into the score model — that's a separate design.

## Script entry point

`scripts/paid-probe.ts` — new file. Reads from env:

- `TRUSTBENCH_BASE_URL` (default `http://localhost:3000` for local; `https://trustbench-production.up.railway.app` for cron)
- `SCRIPTS_PROBE_API_KEY` — the `tb_live_…` key for the probe agent
- `SCRIPTS_PROBE_WALLET_PK` — 0x-prefixed 64-hex-char private key for the probe wallet
- `SCRIPTS_PROBE_DRY_RUN` (default `false`) — when `true`, computes everything but skips the actual `/route/settle` call
- `SCRIPTS_PROBE_MAX_PROVIDERS` (default `4`) — how many providers to probe per run
- `SCRIPTS_PROBE_CAPABILITIES` (default `search,inference,data`) — comma-separated capabilities to rotate through

Pseudocode:

```ts
import { privateKeyToAccount } from 'viem/accounts';
import { signTypedData } from 'viem/actions';

async function main() {
  // 1. Read env, validate everything before touching the network.
  const apiKey = required('SCRIPTS_PROBE_API_KEY');
  const walletPk = required('SCRIPTS_PROBE_WALLET_PK');
  const baseUrl = process.env.TRUSTBENCH_BASE_URL || 'http://localhost:3000';
  const dryRun = process.env.SCRIPTS_PROBE_DRY_RUN === 'true';
  const account = privateKeyToAccount(walletPk as `0x${string}`);

  // 2. Soft-check: query receipts for month-to-date spend by this agent.
  // If > MONTHLY_HARD_CEILING, exit.
  const monthSoFar = await monthToDateSpendAtomic(apiKey);
  if (BigInt(monthSoFar) >= 20_000_000n) {
    console.log(`[probe] monthly cap reached (${monthSoFar} atomic); exiting`);
    return;
  }

  // 3. Pick providers to probe this run. Filter out stale/below-floor.
  const providers = await pickProvidersToProbe(baseUrl, apiKey);

  // 4. For each provider:
  for (const p of providers) {
    const idemKey = `probe-${Date.now()}-${ulid().slice(0, 12)}`;

    // a. POST /route → get quote
    const quote = await postRoute(baseUrl, apiKey, idemKey, {
      capability: p.capability,
      max_price: '50000',                  // $0.05 ceiling — server enforces
      payer_address: account.address,
    });

    if (quote.error) {
      console.warn(`[probe] quote failed ${p.provider_id}: ${quote.error}`);
      continue;
    }

    // b. Sign the EIP-3009 authorization
    const sig = await signEip3009(account, quote.payment_required);

    if (dryRun) {
      console.log(`[probe] DRY: would settle ${quote.route_id} for ${p.provider_id}`);
      continue;
    }

    // c. POST /route/settle → get response + receipt
    const result = await postRouteSettle(baseUrl, apiKey, quote.route_id, sig);

    console.log(`[probe] ${result.error ? 'FAIL' : 'OK'} ${p.provider_id} ` +
                `route=${quote.route_id} ` +
                `${result.error ?? 'receipt=' + result.receipt?.receipt?.receipt_id}`);
  }
}
```

The `monthToDateSpendAtomic`, `pickProvidersToProbe`, `signEip3009` functions are mechanical — Grok implements per the spec; Claude reviews the signing function specifically.

## Test scenarios

For Grok (or whoever implements `scripts/paid-probe.ts`) to write tests against:

1. **Missing env var.** Without `SCRIPTS_PROBE_API_KEY` → exit with non-zero status, no network calls, log clearly which var is missing.
2. **Monthly cap reached.** Pre-populate receipts table with $20.01 worth of probe receipts → script exits without probing.
3. **Daily cap reached mid-run.** Script attempts a probe, gets 429 from the spend-cap middleware → logs and continues to next provider (or exits if all providers are throttled).
4. **Dry run.** With `SCRIPTS_PROBE_DRY_RUN=true`, runs full quote step (writes nothing) but skips settle. No real money moved.
5. **Single provider mode.** With `SCRIPTS_PROBE_MAX_PROVIDERS=1`, probes exactly one provider. Useful for debugging.
6. **Wallet underfunded.** Probe wallet has less USDC than `max_price`. Settle attempt: provider's transferWithAuthorization will revert. Receipt has the failure mode logged.
7. **Provider rejects signature.** Mock provider returns 402 to the X-PAYMENT header. Settle returns 502 `provider_signature_rejected`. No receipt written, no budget consumed.
8. **Successful round-trip.** Valid quote → valid signature → valid settle → receipt written → script reads receipt back via `GET /receipts/:id` → verifies signature with `npm run verify-receipt`. Full round-trip in one run.

## Locked decisions

1. **Budget: $20/mo,** with per-call $0.05, daily $0.70. Enforced server-side by the existing spend-cap middleware on a probe agent. Script-level soft check on monthly total before each run.
2. **Probing agent is a regular agent** in the `agents` table. No new schema, no new middleware. The cap configuration is the budget mechanism.
3. **Separate probe wallet,** USDC-only, $30 pre-fund, $10 refill threshold. Manual refill (no auto-top-up). Private key only in env var.
4. **Signing: viem in `devDependencies`.** Used only in `scripts/`. Not imported anywhere in `src/`.
5. **GitHub Actions cron, every 4 hours.** ~4 providers per run, ~144 probes/day across 20 providers.
6. **No reactive scorecard updates** from probe outcomes. Probe pipeline (`src/prober.ts`) remains the only writer to scorecards. Phase 4 may add live-signal feedback.
7. **Failed probes still consume budget** when the failure is post-settlement. Documented as the "best-effort routing" property of the system.
8. **Probe receipts are public** (same RLS policy as all receipts). The `metadata.role = "internal_probe"` flag on the agent lets analytics distinguish probe traffic from real traffic.

## Out of scope (Phase 4+)

- Capability-quality assertions (probes confirm protocol compliance, not response quality). A probe can't tell if "search" results are good — it can only confirm that a 200 came back with a valid tx_hash.
- Multi-region probing (currently single-host, like the nightly HEAD probe).
- Auto-refilling the probe wallet (manual top-up only).
- Reactive score adjustment based on probe outcomes.
- A second internal agent for "load test" probing at higher volume.
- Webhook on monthly cap approach (e.g. notify when at 80% of monthly budget).
- Probe receipt redaction or filtering — currently every probe receipt is publicly visible at `/receipts/:id`. If that becomes an issue (e.g. exposing internal probing patterns), Phase 4 may add a `metadata.public = false` flag and a route that filters by it.
- Alternative signing libraries — once viem is in, switch costs are high; pick once.

## Files this spec touches

| Path | Change |
|---|---|
| `scripts/paid-probe.ts` | New. Implements the full probe loop per the pseudocode. |
| `package.json` | Add `viem` to `devDependencies`. Add `npm run paid-probe` script. |
| `.github/workflows/paid-probe.yml` | New. Cron every 4 hours, runs `npm run paid-probe` against the production deployment. |
| `.env.example` | Add `SCRIPTS_PROBE_API_KEY`, `SCRIPTS_PROBE_WALLET_PK`, `SCRIPTS_PROBE_DRY_RUN`, `SCRIPTS_PROBE_MAX_PROVIDERS`, `SCRIPTS_PROBE_CAPABILITIES`. |
| `phase3-handoff.md` | Mark step 11 done. |

No schema changes. No `src/` changes. The whole feature is additive to the script + workflow surface.

## Operational checklist before going live

Before kicking off the cron for the first time:

1. ✅ `phase3-schema-quotes.sql` applied to Supabase
2. ✅ Probe agent provisioned with the cap config (SQL above)
3. ✅ `tb_live_…` API key for the probe agent stored in GitHub Secrets as `SCRIPTS_PROBE_API_KEY`
4. ✅ Probe wallet generated, address noted, private key stored in GitHub Secrets as `SCRIPTS_PROBE_WALLET_PK`
5. ✅ Probe wallet funded with ~$30 USDC on Base
6. ✅ Local dry-run successful (`SCRIPTS_PROBE_DRY_RUN=true npm run paid-probe`)
7. ✅ Local non-dry-run successful against ONE provider only (`SCRIPTS_PROBE_MAX_PROVIDERS=1`)
8. ✅ Receipt visible at `GET /receipts/:id` and verifies via `npm run verify-receipt -- <id>`
9. ✅ GitHub Action workflow file added, runs on cron
10. ✅ First scheduled run completed without errors
