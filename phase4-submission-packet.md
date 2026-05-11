# TrustBench submission packet — Phase 4 v0.1.0

**Purpose:** A reusable, copy-pasteable packet for any TrustBench listing / introduction context: the `Merit-Systems/awesome-x402` PR, partner introductions, Coinbase staff outreach if needed, future agentic.market submission descriptions, blog post boilerplate, X bio updates.

**Last verified live:** 2026-05-11
**Honest measurement framing:** verified against CLAUDE.md rules (no "benchmark/oracle/authority" language; honest about what's live vs. roadmap; non-custodial framing throughout).

---

## Framing note (read before editing the descriptions below)

The competitive-landscape doc decided 2026-05-11 that the public differentiation moat — **signed receipts + on-chain evidence + non-custodial fail-safe property** — must be sharp in public copy *before* P4-3 (Solana routing) ships, not retrofitted at the moment of collision with opinion-based scoring competitors (Infopunks Radar on Pay.sh/Solana). All three descriptions below lead with that moat rather than just "non-custodial policy layer." The fail-safe property is the one validated 2026-05-11 night when the paywall correctly refused to charge against a suspended merchant — money never moved, agent's nonce stayed unburned. Opinion-based scoring can't claim that property.

## One-paragraph description (copy verbatim)

TrustBench is a non-custodial routing and audit layer for x402-paid AI agent calls. It sits in front of any x402 service and produces evidence the underlying protocol does not: every paid call emits an Ed25519-signed receipt covering the call metadata, the routing decision, and the on-chain settlement reference, verifiable offline against a published public key with no dependency on TrustBench being online or honest. The agent's wallet signs the EIP-3009 payment authorization, the Coinbase CDP facilitator submits the on-chain transfer, TrustBench observes the tx_hash and emits the signed receipt. Server-enforced spend caps and idempotency keys are bundled in. TrustBench never holds agent funds, and the paywall is fail-safe by design: when an upstream merchant is non-conformant or down, TrustBench refuses to charge rather than proceed, so the agent's wallet nonce stays whole and no money moves. Phase 4 routes Base mainnet USDC via the Coinbase CDP facilitator; the registry includes ~150 Solana endpoints crawled from Heurist Mesh with Solana routing in the next sprint. Live at `https://trustbench.io`; verifier on npm as `@trustbench/verify-receipt`.

## Three-sentence description (shorter)

TrustBench is a non-custodial routing and audit layer for x402 that produces signed evidence rather than opinion: every paid call emits an Ed25519-signed receipt covering the routing decision and the on-chain settlement reference, verifiable offline against a published public key. The agent's wallet signs the payment; the Coinbase CDP facilitator submits on-chain; TrustBench never holds funds. The paywall is fail-safe by design: if the upstream merchant is non-conformant the agent isn't charged, so money never moves on bad routes.

## One-sentence description (for bios / tags)

Signed receipts + on-chain evidence + fail-safe paywall on top of x402, non-custodial throughout.

---

## Endpoints (live in v0.1.0)

| Endpoint | Method | Auth | Price | Description |
|---|---|---|---|---|
| `/route` | POST | x402 paywall or Bearer `tb_live_…` | $0.005 USDC on Base | Non-custodial routing decision with Ed25519-signed routing receipt. |
| `/route/settle` | POST | Bearer `tb_live_…` | included in `/route` | Step 2 of the quote/settle two-step. Forwards agent-signed EIP-3009 to the chosen merchant. |
| `/rankings` | GET | none | free | Ranked providers per capability (HTML + JSON via content negotiation). |
| `/receipts/:id` | GET | none | free | Public, immutable receipt lookup. HTML + JSON. `Cache-Control: public, max-age=86400, immutable`. |
| `/pricing` | GET | none | free | Live pricing tier table (HTML + JSON). |
| `/methodology` | GET | none | free | Honest description of what the probe measures and does not measure. |
| `/.well-known/trustbench-pubkey` | GET | none | free | Ed25519 public key for receipt verification. |
| `/.well-known/trustbench.json` | GET | none | free | Machine-readable manifest of all TrustBench surfaces. |
| `/skill.md` | GET | none | free | Agent-facing onboarding doc in agentic.market skill format. |
| `/llms.txt` | GET | none | free | LLM-grounding reference. |

Roadmap endpoints (v0.2.0+): `/score-provider`, `/verify`, `/receipts/:id?replay=true`, `/compliance-export`. Listed in `skill.md` and `/pricing` for transparency but explicitly flagged as `available_in: v0.2.0` / `v0.3.0`.

---

## Sample paid receipt (verifies clean against the public key, no override)

URL: `https://trustbench.io/receipts/rcpt_01KQY7C44GAPSXZPFQYRZ1D10C`
On-chain settlement: tx `0x3e6d6078...c` on Base, block 45633871
Verification:
```bash
npm i @trustbench/verify-receipt
npx verify-receipt https://trustbench.io/receipts/rcpt_01KQY7C44GAPSXZPFQYRZ1D10C --check-chain
```
Expected output: `SIGNATURE VALID` + `ON-CHAIN VERIFIED`.

---

## Links

- **Site:** `https://trustbench.io`
- **GitHub repo:** `https://github.com/lithvall/TrustBench`
- **npm verifier:** `https://www.npmjs.com/package/@trustbench/verify-receipt` (v0.1.0)
- **Public key:** `https://trustbench.io/.well-known/trustbench-pubkey`
- **Machine manifest:** `https://trustbench.io/.well-known/trustbench.json`
- **Skill doc:** `https://trustbench.io/skill.md`
- **LLM grounding:** `https://trustbench.io/llms.txt`
- **Pricing:** `https://trustbench.io/pricing`
- **Methodology:** `https://trustbench.io/methodology`
- **Sample receipt:** `https://trustbench.io/receipts/rcpt_01KQY7C44GAPSXZPFQYRZ1D10C`
- **X / Twitter:** `https://x.com/TrustBench`

---

## Categories / tags

For platforms that ask for category labels:

- **Primary category:** Agent payments infrastructure
- **Secondary categories:** Routing / Policy / Audit / Receipts
- **Capability taxonomy (per agentic.market 5-category):** Infrastructure
- **GitHub topic tags to apply:** `x402`, `agent-payments`, `routing`, `signed-receipts`, `non-custodial`, `mcp`, `usdc`, `base`, `eip-3009`, `ed25519`

---

## Wallet / on-chain identity

- **Revenue wallet (Base mainnet):** `<TRUSTBENCH_REVENUE_WALLET_ADDRESS>` — fetch from Railway env or `https://trustbench.io/pricing?format=json` (`tiers[].payTo`).
- **First on-chain proof:** `0x5a558117b28585bd282378631eeb79d6b3be4c77a94c6a23edef609789e89d92` (probe wallet → revenue wallet, $0.005 USDC, 2026-05-11).
- **Facilitator:** Coinbase CDP (`api.cdp.coinbase.com/platform/v2/x402`) on Base mainnet `eip155:8453`.

---

## Receipt + verification properties (for technical reviewers)

- Signing scheme: **Ed25519** over **JCS-canonicalized** receipt body.
- Public key served at `https://trustbench.io/.well-known/trustbench-pubkey` (rotated by versioning the URL, not the key in place).
- Anyone can verify a receipt offline with the standalone npm package `@trustbench/verify-receipt` — no dependency on TrustBench being online or honest.
- `--check-chain` flag re-verifies on-chain settlement against the receipt's `settlement_reference.tx_hash`.
- Receipt body includes: agent_address, payer_address, payee_address, capability, price_atomic, currency, network, route_id, provider_url, settlement_reference (tx_hash + chain), issued_at, expires_at, signature_alg.
- Spec doc: `receipt-spec-v1.md` in the repo.

---

## Non-custodial property (for compliance reviewers)

- The agent's wallet signs an EIP-3009 `transferWithAuthorization` for the listed price.
- The CDP facilitator submits the on-chain transfer and pays its own gas.
- TrustBench observes the settle response (tx_hash) and emits the signed receipt.
- TrustBench's revenue wallet **only receives**; it never custodies agent funds in transit.
- Failure modes are fail-safe: if the facilitator is down, paywall hard-fails before any nonce burns; the agent's wallet stays whole. Validated end-to-end in prod 2026-05-11 when an upstream merchant suspension caused S2 to refuse charging — money never moved.

---

## What we measure (the honest framing — required everywhere)

The TrustBench prober is a **liveness check, not a benchmark**. From one host. HEAD requests, sampled three times. 4xx and 429 are treated as "alive." Latency is the time-to-first-byte of those HEAD probes from a single Railway host.

Full methodology: `https://trustbench.io/methodology`.

Avoid the words "benchmark," "ranking authority," or "reputation oracle" in any listing or partner copy. The current measurement does not justify those words.

---

## What TrustBench is not (for self-discipline)

- Not custodial. Will never custody agent funds.
- Not a wallet. The agent uses its own wallet (Agentic Wallet, Coinbase Wallet, MetaMask, etc.).
- Not a facilitator. We route through the CDP facilitator; we do not run our own.
- Not a benchmarking authority. See "honest framing" above.
- Not a pay-to-rank service. Pay-to-list (refundable provider bond) is the revenue model; ranking is measurement-only.

---

## For the `awesome-x402` PR specifically

Add the following row in the "Services / Infrastructure" section (or whichever section matches the curated list's structure):

```markdown
- [TrustBench](https://trustbench.io) — Non-custodial routing + audit layer on top of x402. Every paid call emits an Ed25519-signed receipt covering the routing decision and the on-chain settlement reference, verifiable offline. Fail-safe paywall: if the upstream merchant is non-conformant, the agent isn't charged. Live on Base via the Coinbase CDP facilitator. Verifier on npm: [`@trustbench/verify-receipt`](https://www.npmjs.com/package/@trustbench/verify-receipt).
```

PR commit message:

```
add: TrustBench — signed receipts + on-chain evidence + fail-safe paywall on x402
```

PR description body:

```
TrustBench is a non-custodial routing and audit layer for x402 that produces
signed evidence rather than opinion. Every paid /route call emits an Ed25519-signed
receipt covering the routing decision and the on-chain settlement reference,
verifiable offline against a published public key with no dependency on TrustBench
being online or honest.

The paywall is fail-safe by design: if the upstream merchant is non-conformant or
down, TrustBench refuses to charge rather than proceed, so the agent's wallet
nonce stays whole and money never moves on bad routes. Validated end-to-end in
production 2026-05-11 when an upstream merchant suspension caused the paywall to
correctly refuse the call.

Live in production on Base mainnet via the Coinbase CDP facilitator. Sample receipt:
https://trustbench.io/receipts/rcpt_01KQY7C44GAPSXZPFQYRZ1D10C (verifies SIGNATURE
VALID + ON-CHAIN VERIFIED with no override).

Verifier on npm: @trustbench/verify-receipt (third-party offline verification,
no dependency on TrustBench being online or honest).

Honest scope:
- Routes Base today; Solana endpoints in the registry, routing next sprint.
- Liveness telemetry, not a benchmark — methodology at /methodology.
- Pay-to-list, never pay-to-rank.
```

---

## For agentic.market / Bazaar listing (once the discovery extension ships)

agentic.market is the human render of the Bazaar catalog. Listing is automatic via the CDP facilitator + `declareDiscoveryExtension({ info, schema })` call on `/route`. There is no human-readable submission packet because there is no submission form. The strings above (one-paragraph description, three-sentence description, one-sentence description) are what we will pass into the extension's `info.description` field. The endpoint metadata is what we will pass into the `inputSchema` / `outputSchema` fields.

Listing copy that the catalog will render is derived from:

1. The extension's declared `info.description` (use the three-sentence description above).
2. The extension's `inputSchema` (derived from the `/route` request body shape — see `src/route-handlers.ts`).
3. The first paid settle's metadata (price, payTo, network).
4. The endpoint's HTTP behavior on a probe (any 402 we issue back to the catalog crawler).

See `phase4-listing-research.md` for the canonical submission mechanism and the open implementation work.
