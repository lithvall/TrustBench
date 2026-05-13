# Strata × TrustBench reference integration

End-to-end reference for the integration described in
[`strata-integration-sketch-SEND.md`](../../strata-integration-sketch-SEND.md)
§10. A single TypeScript file that demonstrates the composition pattern:

> **Strata scores before the call, TrustBench verifies after.**

Strata answers "is this endpoint safe enough to pay?" before the merchant
call. TrustBench answers "what actually happened, signed, queryable,
on-chain-anchored?" after the merchant call. The receipt envelope carries
Strata's pre-call posture as a `trust_signals[]` entry covered by
TrustBench's Ed25519 signature, so any downstream verifier reading a
TrustBench receipt also sees what Strata said about the endpoint at the
moment of payment, without a separate Strata lookup.

## What the reference produces

A single shareable artifact:

```
https://trustbench.io/receipts/<receipt_id>
```

It is:

- Immutable (Cache-Control immutable for 24h)
- Content-negotiated (HTML for browsers, byte-identical JSON for agents)
- Ed25519-signed over RFC 8785 JCS-canonical bytes
- On-chain anchored on Base mainnet (USDC EIP-3009 `transferWithAuthorization`)
- Verifiable offline against TrustBench's published public key

Anyone with `npx` and ~$0.01 USDC on Base can reproduce the artifact end-to-end.

## Verification command

```bash
npx @trustbench/verify-receipt@0.1.1 <receipt_id> --check-chain
```

(Version `0.1.1+` required for `rrcpt_…` paywall routing receipts; v0.1.0 only
recognizes `rcpt_` Phase 3 settlement receipts.)

Layer 1 (signature only, no RPC): fetches the receipt over HTTPS, fetches the
published Ed25519 public key, verifies the signature over the JCS-canonical
bytes of `envelope.receipt`. ~50ms.

Layer 2 (`--check-chain`): also opens a Base RPC connection and confirms the
receipt's `tx_hash` exists, the `block_number` matches, and the
EIP-3009 `AuthorizationUsed` event fired with the nonce that matches the
receipt. ~2s.

## Run the reference

Prerequisites:

- Node 18+ (the workspace uses `tsx` for TypeScript execution)
- An agent wallet on Base mainnet with ≥ $0.01 USDC
- Run from the repo root so `node_modules` resolve to the workspace deps

```powershell
# Required
$env:AGENT_WALLET_PK = "0x...64hex..."

# Optional overrides
$env:MERCHANT_URL = "https://pro-api.coinmarketcap.com/x402/v1/dex/search"  # default
$env:STRATA_VERIFY_BASE = "https://usestrata.dev/api/v1/x402/verify"          # default
$env:TRUSTBENCH_BASE_URL = "https://trustbench.io"                            # default
$env:CAPABILITY = "data"                                                      # default
$env:MAX_PRICE_ATOMIC = "10000"                                               # default ($0.01 USDC budget for merchant call)

npx tsx examples/strata-integration/reference-agent.ts
```

To stop at the TrustBench receipt artifact (no merchant call):

```powershell
npx tsx examples/strata-integration/reference-agent.ts --skip-merchant
```

The script prints each step to stdout and ends with the public receipt URL
and the verification command.

## Cost per reference run

- `$0.005` TrustBench routing fee (paid by the agent's wallet to
  TrustBench's revenue wallet via CDP facilitator)
- `~$0.0001` CoinMarketCap merchant fee (default merchant; skipped with
  `--skip-merchant`)
- Total: `~$0.0051` of probe-wallet USDC on Base

Gas is paid by the respective facilitators, not the agent.

## Merchant fallback chain

Per §10.5, the default merchant is CoinMarketCap's x402 dex/search endpoint —
the first endpoint promoted to `x402_verified=true` in the TrustBench registry
(2026-05-12, empirical promotion via live probe, not curation).

Fallbacks (set via `MERCHANT_URL`):

1. **CoinMarketCap** — `https://pro-api.coinmarketcap.com/x402/v1/dex/search`
   ($0.0001/call) — default
2. **QuickNode mat** — `https://x402.quicknode.com/mat` — confirmed live
3. **Exa Search** — `https://api.exa.ai/search` ($0.007/call)

The script doesn't curate the routing decision; TrustBench picks based on the
score-based selection over the registry. We mention the fallbacks for the
operator who's setting `MERCHANT_URL` (the value Strata is asked to vet),
not as a TrustBench routing preference.

## Strata API shape adapter

As of 2026-05-13, Strata's live `/x402/verify` API returns flat fields
(`flags`, `payment_amount_usd`, `last_checked_at`, etc.) that do not yet
match the locked annotation shape negotiated in
[`strata-integration-sketch-SEND.md`](../../strata-integration-sketch-SEND.md)
§3. Strata's 2026-05-12 "ship them" reply acknowledged the shape and
committed to mirroring `payment_endpoint`, but the four required envelope
fields (`source`, `kind`, `captured_at`, `ref`) are not yet emitted.

The reference agent contains a deterministic, removable adapter
(`toLockedTrustSignals` in `reference-agent.ts`) that transforms Strata's
current response into the locked shape. Every output field derives from
either a verbatim Strata field, a 1:1 rename, a nesting/aggregation of
Strata fields, or an agent-side constant or request-context value:

| Locked field | Derived from |
|---|---|
| `source` | constant `"strata.usestrata.dev"` (also derivable from the `ref` hostname) |
| `kind` | constant `"x402_trust"` |
| `trusted` | verbatim from Strata's `trusted` |
| `security_score` | verbatim from Strata's `security_score` |
| `risk_level` | verbatim from Strata's `risk_level` |
| `payment_endpoint` | nested from Strata's flat `payment_amount_usd` / `payment_currency` / `payment_network` |
| `actionable_flags` | Strata's `flags` minus `"unverified_domain"` (per §3 resolved-item-5: Strata's WHOIS is a v1 stub, the flag means "unverifiable" not "suspicious") |
| `captured_at` | 1:1 rename of Strata's `last_checked_at` |
| `ref` | the agent's own request URL (`STRATA_VERIFY_BASE?url=<merchant>`) |

A downstream verifier reading the TrustBench receipt can hit `ref`,
re-fetch Strata's response, and confirm this derivation independently.
Nothing is invented.

The adapter is **auto-disabling** once Strata ships the matching schema: a
forward-compat branch in `toLockedTrustSignals` detects responses that
already contain all four required envelope fields and passes them through
verbatim, no code change required on the agent side.

## What the reference does NOT prove

Honest framing of the script's scope:

- It does **not** prove Strata's `runtime_score` is correct. The TrustBench
  signature attests "TrustBench observed exactly these Strata bytes at the
  moment of payment" — not "the bytes are truthful." A
  Strata-aware downstream verifier still re-fetches Strata data via the
  `ref` URL embedded in `trust_signals[0]` to confirm the score is real.
- It does **not** prove TrustBench's routing decision is optimal. The
  receipt records `score_at_decision` + `alternatives_considered` +
  `selection_reason` so the decision is auditable, but "best" is
  measurement-based per the TrustBench scoring methodology
  ([trustbench.io/methodology](https://trustbench.io/methodology)),
  not curated.
- It does **not** make TrustBench custodial. The agent signs every
  EIP-3009 transferWithAuthorization; facilitators submit on-chain.
  TrustBench never holds agent funds.

## Type-check the example in isolation

```powershell
npx tsc --noEmit -p examples/strata-integration/
```

A local `tsconfig.json` extends the workspace root so the example is
self-contained — anyone forking just this folder can type-check it without
the rest of the TrustBench codebase.

## Related references

- Locked receipt envelope shape: [`strata-integration-sketch-SEND.md`](../../strata-integration-sketch-SEND.md) §2
- Locked `trust_signals[]` shape: [`strata-integration-sketch-SEND.md`](../../strata-integration-sketch-SEND.md) §3 (2026-05-11 lock)
- Idempotency + signature semantics: [`strata-integration-sketch-SEND.md`](../../strata-integration-sketch-SEND.md) §10.4.5
- Server-side parser: [`src/trust-signals.ts`](../../src/trust-signals.ts)
- Server-side embed + sign: [`src/paywall-handler.ts`](../../src/paywall-handler.ts)
- Standalone verifier (npm): [`@trustbench/verify-receipt`](https://www.npmjs.com/package/@trustbench/verify-receipt)
- Reference verifier (workspace): [`scripts/verify-receipt.js`](../../scripts/verify-receipt.js)
