# Phase 3 — Valeo / Sentinel Stress Test

**Date:** 2026-05-03. Owner: Claude (with input from a phone-Claude session that surfaced the comparison).
**Status:** Analysis complete. Action items flagged for Phase 4.

This doc captures (a) verified facts about Valeo's stack as of May 2026, (b) point-by-point answers to eight adversarial technical questions about TrustBench's `/route` vs. Valeo's Sentinel, and (c) an unbiased differentiation analysis. Pairs with the updated `COMPETITIVE-LANDSCAPE.md` Valeo entry.

## Valeo — verified facts (sources at the bottom)

- **Site:** valeocash.com / valeoprotocol.io
- **Tagline:** "AI-native financial stack on Solana"
- **Stack:**
  - **v402 protocol** — Valeo's own payment protocol for AI agents on Solana. NOT a fork of x402; a parallel protocol they ship alongside Sentinel-for-x402.
  - **Sentinel** (`sentinel.valeocash.com`) — compliance/audit layer that works with **vanilla x402** (not v402-only). Enforces budget limits, logs every transaction, public Sentinel Explorer.
  - **$UAID stablecoin** — agent-native stablecoin for programmable settlement.
  - **Stratum** (`stratumx402.com`) — "the clearing layer for AI agent payments."
  - **iOS app** — non-custodial wallet for retail.
  - **$VALEO token** — funding mechanism, retail-friendly, ~$500K mcap (per phone-Claude; not independently verified).
- **Custody posture:** "non-custodial" iOS app and v402 protocol. Sentinel sits as compliance layer; whether it ever holds approvals depends on the integration mode.
- **Chain:** Solana-native across the stack.

## Where phone-Claude's framing was off

1. **v402 is not a fork of x402.** It's a separate Solana-native protocol Valeo built alongside Sentinel-for-x402. They support both paths.
2. **Sentinel is NOT gated to v402-only merchants.** It's specifically described as "the compliance layer for x402 agent payments." That makes Sentinel a *direct competitor* to TrustBench's router+policy+receipts product, not just an adjacent stack.
3. **Multi-product is real but it's not all v402-locked.** Valeo's tactic is to layer products that compose — the iOS app + UAID + v402 reinforce each other on Solana, but Sentinel is x402-compatible, giving them a foothold in both protocols.

## The eight adversarial questions, answered against TrustBench's actual codebase

### 1. Multi-endpoint atomicity

**Question:** Does `/route` handle a single agent intent that fans out to N merchants?

**TrustBench Phase 3:** No. Single merchant per `/route` call. The `route_id` maps to ONE quote against ONE provider via `selectProvider()`. `phase3-x402-construction.md` is explicit about single-capability/single-provider scope.

**Honest framing:** Multi-merchant fan-out is a Phase 4+ problem. The right answer when it ships is "agent gets N sub-receipts, agent decides what to do with partial success" — refunds aren't really a thing on x402. Don't promise fan-out before it ships.

**Action:** Public copy says "single-merchant routing in Phase 3, fan-out in Phase 4."

### 2. Idempotency key threat model

**Question:** Whose key? Can a malicious agent replay-spend by reusing keys?

**Real threat model (the publishable version):**

- **On-chain layer (EIP-3009):** Every signed authorization includes a `bytes32` nonce permanently consumed by the USDC contract. A signed authorization can settle exactly once, ever. **This is the cryptographic guarantee against double-spend.**
- **HTTP idempotency layer (TrustBench):** Same `(agent_id, idempotency_key)` → cached response. Prevents partial-timeout retries from re-executing as fresh authorizations with new nonces. Best-effort under concurrency (documented in `phase3-idempotency-design.md`).

The two layers compose. The HTTP layer doesn't need to be cryptographically airtight because the protocol layer already is. **Phone-Claude's "agent reuses keys to replay-spend" attack doesn't work** — the on-chain nonce stops it before any double settlement happens. The risk that HTTP idempotency *does* solve is the agent-double-charge under partial timeouts (Phase 2 builder pain).

**Action:** Promote `phase3-idempotency-design.md` to a public doc. Frame the layered threat model explicitly.

### 3. Spend caps under concurrency

**Question:** What if an agent fires 50 concurrent calls each just under the per-call cap, summing to 10× the per-agent cap?

**TrustBench Phase 3 (`phase3-spend-caps.md`):** "Approximately enforced under concurrency. Multiple parallel calls may all pass the pre-flight check before any writes a receipt. Acceptable trade-off for solo-founder Phase 3."

The exposure is bounded by `(parallelism − 1) × max_price`. For 5 concurrent calls at $0.01 max, worst-case overshoot is ~$0.04.

**Phase 4 mitigation:** pre-authorized budgets (reserved spend window). Same direction phone-Claude's option (c) suggests.

**Action:** Add a "Known limits" note to README. Honest framing rule.

### 4. Receipt verifiability without TrustBench

**Question:** What does a receipt actually attest? "Saw this settlement" vs. "verified the on-chain reference"?

**What TrustBench ships today:**
- `scripts/verify-receipt.js` — fetches public key from `signature.public_key_url`, JCS-canonicalizes the `receipt` object, verifies Ed25519 signature. **Proves TrustBench attested to the receipt content.**
- Receipt schema includes `chain`, `tx_hash`, `payer_address`, `payee_address`, `amount_atomic`, `currency`, `decimals`, `settled_at` — sufficient identifying info for an independent verifier to look up the on-chain tx.

**What TrustBench doesn't ship (yet):**
- The verifier doesn't fetch the chain. So a receipt can attest to `tx_hash X` and the signature verifies, but the verifier doesn't independently confirm `tx_hash X` exists on-chain with matching from/to/value.
- `block_number` and `confirmation_count` are not in the schema (they're in the open questions to InfopunksHQ in `receipt-spec-v1.md`).

**Action (Phase 3 polish, not Phase 4):**
- Add `block_number` to the `settlement` section of the receipt schema. One column on the `receipts` table; one field in the JSON envelope.
- Extend `scripts/verify-receipt.js` with `--check-chain` flag that reads the tx via Base RPC and confirms field-by-field match.

This closes the "TrustBench could lie about the chain" criticism completely.

### 5. The "neutral" claim under failure

**Question:** When TrustBench is down, what happens?

**Architectural reality:** TrustBench is HTTP middleware. The agent has the wallet. If TrustBench is down:

- Agent can manually probe a provider, get the 402, sign EIP-3009 themselves, replay with X-PAYMENT.
- Loses: routing decision, spend-cap enforcement, signed receipt + audit endpoint.
- Keeps: ability to transact, on-chain settlement, payment functionality.

**This is a strength to amplify in public copy.** TrustBench-down ≠ payments-down. The non-custodial design *forces* this property — there's literally no path through which TrustBench's downtime stops a payment.

**Action:** Add a "Failure semantics" / "What if TrustBench is down" section to README. Counters Valeo if they ever go "we're the path" with Sentinel.

### 6. The Sentinel Explorer gap

**Question:** Sentinel's public dashboard is a distribution weapon. Does TrustBench have one?

**TrustBench today:** `/receipts/:id` returns one receipt. There's no aggregate feed, no public list, no dashboard.

**What's reasonable to ship in Phase 4:**
- `GET /receipts/recent?limit=N&public=true` — paginated feed of publicly-flagged receipts
- HTML dashboard at `/explorer` consuming that endpoint (similar to existing `/analytics`)
- `agents.metadata.public_receipts: true` flag, default false, opt-in for agents who want their receipts publicly indexed
- Internal probe receipts (Phase 11) auto-public — they're synthetic traffic with no privacy concern

**Cost:** ~2 days. Plain-HTML dashboard like the existing `/analytics` page. No new dependencies.

**Action:** Phase 4 priority. Highest-leverage near-term move per phone-Claude's argument and I agree.

### 7. What stops Coinbase from shipping this?

**Defense lines for the public pitch:**

1. **Neutrality.** TrustBench is not a chain, not a facilitator, not an x402 Foundation member with governance interests. CDP IS the facilitator — they have a built-in conflict of interest if they also become the router.
2. **Portability.** Receipts work across facilitators (CDP, self-hosted, future). Not CDP-only. The receipt schema doesn't reference any specific facilitator.
3. **Focus.** TrustBench is one product. CDP is one of dozens of CDP features.
4. **Honest measurement.** TrustBench can recommend the best-scoring provider regardless of chain or facilitator. Coinbase has structural pressure to under-emphasize when Solana is the higher-volume chain (it currently is). Cloudflare faces a similar bind as Foundation co-founder.

**Action:** Public copy explicitly names these four defenses.

### 8. What stops Valeo from copying /route exactly?

**Nothing technical.** The architecture is straightforward. Moats are non-technical:

1. **Reference verifier in the wild.** `scripts/verify-receipt.js` open-source means anyone copying the format inherits TrustBench's exact JCS canonicalization. *Action:* push as `@trustbench/verify-receipt` on npm so people install instead of copy.
2. **Trust-layer integrations.** If Infopunks consumes TrustBench receipts as their default format, switching costs accumulate. *Action:* land Infopunks integration formally.
3. **Open spec ownership.** `receipt-spec-v1.md` (DRAFT) becomes the canonical reference if cited by trust-layer partners. *Action:* promote to public docs site.
4. **Non-custodial brand.** Post-402Bridge incident (Oct 2025), enterprise procurement increasingly asks "do you ever have admin keys to user funds?" TrustBench's strict no-admin-functions answer is a discipline, not a feature — harder to fork without giving up the same enterprise market.

**The trio that's the moat:** open spec + reference verifier on npm + named integration partner.

## Differentiation analysis — defensible, at-risk, and unique

### Where TrustBench is genuinely better than Valeo's Sentinel (assuming both ship cleanly)

1. **Chain-agnostic by design.** TrustBench picks providers regardless of chain. Valeo's stack (v402 + UAID + Stratum + iOS) is Solana-native; only Sentinel is multi-chain via x402. If Solana volume share slips back below Base, Valeo has to rebuild four products.
2. **No token in the pricing model.** TrustBench's flat-per-tx fee is independent of $VALEO market cap. Enterprise procurement: "we pay $X per call forever" beats "we pay $X per call but our auditor's revenue depends on a token whose price we can't predict."
3. **No competing stablecoin in the path.** TrustBench routes USDC/EURC. Valeo also pushes UAID — some merchants resist accepting UAID on top of USDC, fragmenting checkout. TrustBench has no such conflict.
4. **Smaller surface = less to evaluate.** Single-product TrustBench fits one procurement review. Five-product Valeo is five threat models, five docs, five upgrade paths.
5. **Open verifier with no platform dependency.** 165 lines of Node + standard `crypto`. A skeptical engineer reads every line. No Valeo-specific tooling required.

### Where Valeo is genuinely better than TrustBench today

1. **Live public marketing surface.** Sentinel Explorer ships today; every transaction is Sentinel marketing.
2. **Multi-product narrative.** Five products lets Valeo's pitch span across founder conversations and crypto-media coverage.
3. **Token-funded marketing budget.** Even modest mcap funds content/sponsorships TrustBench doesn't have as a solo-founder bootstrap.
4. **Solana-first.** Solana surpassed Base in x402 transaction volume. Valeo is on the higher-volume chain; TrustBench Phase 3 is Base-only.
5. **Consumer brand.** iOS app + token gives Valeo retail surface TrustBench deliberately lacks.

### Where the choice is genuinely "depends on the buyer"

1. **Non-custodial vs. custodial-adjacent.** TrustBench's strict no-admin posture is *better for enterprise* (compliance) and *worse for consumer agility* (Valeo's iOS app does things TrustBench architecturally can't). Both are correct for their respective buyers.
2. **Single chain today vs. Solana-first today.** Valeo's Solana-first wins if Solana stays dominant. TrustBench's chain-agnostic design wins if the future is diversified. Open question.
3. **Vanilla x402 vs. own protocol stack.** TrustBench wins if x402 becomes the universal standard (current trend). Valeo wins if the standard fragments and v402 captures a niche.

### The actual moat (unbiased)

Not any single feature — it's the **alignment between architecture and target buyer.**

- **Enterprise / finance / compliance** buyers prefer non-custodial + no-token + vanilla-protocol + predictable-pricing + open-verifier + single-product. **TrustBench wins this segment.**
- **Crypto-native / consumer / token-friendly** buyers prefer multi-product + retail-surface + token-incentives + Solana-first. **Valeo wins this segment.**
- **Serious agent builders** (the middle): toss-up; comes down to who ships proof points first.

The differentiation that holds: TrustBench is the routing+audit layer for builders who *deliberately don't want* their payment infrastructure entangled with token economics, custodial wallets, or vendor stablecoins. That's a coherent commitment matching a specific procurement reality, not "different for the sake of being different."

### Threats to address proactively

1. **Sentinel Explorer narrative gap.** Ship public explorer in Phase 4 (~2 days).
2. **Solana absence.** Phase 4 should add Solana support — higher volume chain + neutralizes "we're on the chain that matters" framing.
3. **Multi-product perception.** Counter "we do one thing" being read as "thin product" with three external proof points: open spec + reference verifier on npm + named integration partner (Infopunks).

## Action items, prioritized

| # | Action | Effort | Phase | Why now |
|---|---|---|---|---|
| 1 | Public-facing receipt-spec at `docs.trustbench.io/receipt-spec` (promote `receipt-spec-v1.md`) | 1 day | Phase 3 polish | Cheapest defense vs. clone risk |
| 2 | Add `block_number` to receipt schema + JSON envelope | 0.5 day | Phase 3 polish | Closes "TrustBench could lie about chain" criticism |
| 3 | Extend `verify-receipt.js` with `--check-chain` flag | 0.5 day | Phase 3 polish | Independent on-chain verification |
| 4 | Publish `verify-receipt` as `@trustbench/verify-receipt` on npm | 0.5 day | Phase 3 polish | Distribution + clone-resistance |
| 5 | "Failure semantics" / "What if TrustBench is down" section in README | 0.5 day | Phase 3 polish | Amplifies non-custodial strength |
| 6 | Public receipt explorer (HTML dashboard + opt-in flag) | 2 days | Phase 4 | Counters Sentinel Explorer |
| 7 | Phase 4 Solana support | TBD | Phase 4 | Higher-volume chain + competitive parity |
| 8 | Formal Infopunks integration | partner-dependent | Phase 4 | Named depth integration vs. Valeo's breadth |
| 9 | Pre-authorized budgets (strict spend caps) | TBD | Phase 4 | Closes concurrency-overshoot gap |
| 10 | Multi-merchant fan-out (`/route` accepts N capabilities) | TBD | Phase 4+ | Closes Sentinel "one intent → N merchants" pitch |

Items 1–5 are roughly 3 days of work and close 80% of the public-facing gap. Items 6–10 are bigger Phase 4 commitments.

## Sources

- [Valeo — All in One Money Protocol for humans & AI](https://valeoprotocol.io/) (also valeocash.com)
- [Sentinel](https://sentinel.valeocash.com/) — "The compliance layer for x402 agent payments"
- [v402 GitHub](https://github.com/valeo-cash/v402) — "Non-custodial payment protocol for AI agents on Solana — capability-scoped intents, on-chain verification, and signed receipts"
- [Stratum](https://stratumx402.com/) — "The Clearing Layer for AI Agent Payments"
- [v402 x402-payments skill on LobeHub](https://lobehub.com/skills/valeo-cash-x402-payments-skill-x402-payments) — describes the OpenClaw / AgentSkills integration

