---
stance_version: 2026-05-21
stance_phase: phase-4-post-listing-sprint
stance_pillars: [canonical-receipt-format-standard, neutral-routing-receipt-layer]
---

> **STANCE DRIFT WARNING.** `STANCE.md` is dated 2026-05-21 (revision 5), **73 days**
> before this assessment — past its own 30-day hard-fail threshold. This document is
> authored against a stale stance and one of its findings (§3) is itself grounds for a
> STANCE bump. Read accordingly.

# XRPL Agentic Payments — Assessment and Pillar 1 Conformance Diff

**Date:** 2026-08-02
**Question asked:** What are the recent developments in agentic payments on XRP Ledger, and is there a need/place for TrustBench in it?
**Verdict:** **WATCH — zero hours on XRPL.** The decision-relevant finding is not about XRPL.
**Supersedes:** `SIGNAL-2026-05-14-xrpl-agent-commerce-launch.md` (graded and closed same day)

---

## 1. What actually shipped on XRPL

| Date | Development | Status |
|---|---|---|
| ~2026-02 | t54 Labs x402 facilitator live on XRPL **mainnet** (`xrpl-facilitator-mainnet.t54.ai`, CAIP-2 `xrpl:0`). Non-custodial, settles presigned XRPL `Payment` blobs, XRP/RLUSD/IOU. | LIVE |
| 2026-06-09 | Ripple publishes **XRPL AI Starter Kit** — XRPL Docs MCP server, two Claude Skills, x402 integration "with a contribution from our partners at t54". | LIVE |
| 2026-07-08 | **XRPL AI Hub** (`xrpl-ai.org`, t54 + Virtuals) — 1,286 services, 136 merchants claimed. | LIVE |
| 2026-07-14 | **x402 Foundation** operational launch under Linux Foundation. Ripple a Premier Member alongside Visa, Mastercard, Stripe, Google, AWS, Circle, Coinbase. t54 a General Member. | LIVE |
| 2026-07-24 | **Mastercard Verifiable Intent** integrated into the XRPL facilitator by t54 (SD-JWT chain in `extensions.x402Secure`). | LIVE (trade-press sourced only) |
| 2025-09 → 2026-02 | XRPL compliance amendments activate: Credentials XLS-70, MPTokensV1, PermissionedDomains XLS-80, TokenEscrow XLS-85, PermissionedDEX XLS-81. | LIVE MAINNET |

### The measurement that reframes all of it

**~1.7M "agentic transactions" have settled roughly 4,724 XRP + 2,163 RLUSD — order of $10–15k ecosystem-wide, all time. Total network fees burned: ~$280.**
Base for comparison: ~119M x402 payments, ~$21.5M transferred.

Independent confirmation from developer pull: `x402-xrpl` does **850 npm downloads/month** against `@x402/core`'s **679,830** (0.13%). The reference implementation `t54-labs/x402-xrpl` has **0 stars, 2 forks, one distinct commit author**.

### Not live, despite frequent citation

- **Batch (XLS-56)** pulled in emergency release rippled 3.1.1 (2026-02-23) after a signature-validation vulnerability; **12/35** validator votes against a threshold of 28.
- **PermissionDelegation (XLS-75):** 1/35. LendingProtocol, SingleAssetVault below threshold. **SmartEscrow (XLS-100)** still Draft.
- **XRPL EVM sidechain is economically dead:** $25,741 TVL, zero 24h fees, zero DEX volume, ~75% TVL decline, **no x402 facilitator deployed on it.** The "cheap EVM port" path does not exist.
- **Ripple operates no facilitator, has published no receipt spec, and has announced no router product.** Every facilitator-layer function on XRPL is performed by one Ripple-funded startup.

### Contradicted / failed verification

- **Mainnet vs testnet is officially contradictory.** t54 runs a mainnet facilitator; xrpl.org's own guide calls x402-on-XRPL testnet, "best-effort, no committed SLA," and warns "do not build production systems against it."
- **There is no XRPL amendment or XLS number for x402.** It is an application-layer convention over standard `Payment` transactions (SourceTag 804681468 + InvoiceID/Memos). Reporting to the contrary is wrong.
- Transaction counts trace to t54's own dashboard, whose headline metric tiles were being actively bug-fixed in July 2026. The 4,724 XRP figure is a rolling window of uncertain period, not a confirmed cumulative total.

### Honest read

**A one-vendor ecosystem wrapped in a very large press-release layer.** One startup built the facilitator, SDK, explorer, directory, and Mastercard integration. Real infrastructure, no economy attached. 1.7M transactions for $280 in fees is what a test suite and a hackathon weekend produce.

The failure pattern is one TrustBench should recognise instantly: **a large request counter with near-zero settled value in a crawler-populated directory.** That is TrustBench's own production reality (419 `/route` requests in 7 days, all crawlers, zero payment attempts) at ecosystem scale.

---

## 2. Pillar 2 (routing) — no gap worth having

- **Not a cheap port.** XRPL x402 is XRPL-native: presigned `Payment` blobs (`payload.signedTxBlob`), explicitly **no EIP-3009**. Second payment-construction adapter, second facilitator client, `LastLedgerSequence` expiry semantics, `Memos`/`InvoiceID` binding that does not map onto TrustBench idempotency-key semantics, dual-denomination spend caps (FX inside cap enforcement — a high-risk surface).
- **It breaks the public receipt contract.** `src/receipt-generator.ts:70` pins `chain: 'base'` as a TypeScript literal; `receipt-spec-v1.md:42` pins `"chain": "base"`. `@trustbench/verify-receipt --check-chain` is viem and **cannot verify an XRPL transaction** — an XRPL receipt would return SIGNATURE VALID and nothing on-chain. That is a regression in the single property that makes the receipt credible.
- **Inventory is not the measured constraint.** The bottleneck is at the 402 challenge. Adding inventory to a funnel converting at 0% multiplies zero.
- **Capacity precedent:** P4-3 (drop the Solana filter) was scoped as one line, corrected to multi-day on 2026-05-12, **still unstarted 11 weeks later** with ~150 Heurist Solana endpoints crawled and unroutable.
- **Economics do not close.** XRPL x402 price points are 0.001–0.003 XRP/call with 0-XRP free tiers. At a fantastical 10% share of *all* XRPL x402 traffic, a tolerable flat fee yields **~$34 lifetime**. t54 publishes no fee schedule, so this would be stacking an unknown fee on an unknown fee at sub-cent granularity.

**One favourable fact, for completeness:** XRPL x402 uses the same v2 header envelope TrustBench is already migrating to (`PAYMENT-REQUIRED` / `PAYMENT-SIGNATURE` / `PAYMENT-RESPONSE`, `x402Version: 2`, scheme `exact`). That confines a future rewrite to the payment-construction adapter. It lowers cost; it does not create demand.

---

## 3. THE ACTUAL FINDING — the receipt slot is filled, and it shipped in the reference SDK

XRPL surfaced this. It does not live on XRPL. **It is chain-agnostic and it is on Base, where TrustBench already operates.**

### The spec

`x402-foundation/x402` → `specs/extensions/extension-offer-and-receipt.md`, extension identifier **`offer-receipt`**.

Commit history on the file is exactly two entries:
- **2026-03-12** — `feat(extensions): add optional signed Offer & Receipt extension (draft, addresses #496) (#935)`
- **2026-07-23** — `docs+spec: clarify signer authorization in offer-receipt extension (#2462) (#2811)`

### The implementation — this is the part that changes the severity

**`@x402/extensions` ships `./offer-receipt` as a first-class subpath export.**

| Fact | Value |
|---|---|
| Latest version | **2.20.0**, published **2026-07-27** |
| Subpath exports | `.`, `./bazaar`, `./sign-in-with-x`, **`./offer-receipt`**, `./payment-identifier`, `./builder-code` |
| First version exporting `./offer-receipt` | **2.7.0, published 2026-03-16** — four days after the spec draft landed |
| Crypto deps | `jose` (JWS), `@noble/curves`, `tweetnacl`, `viem` |
| Type header cites | `extension-offer-and-receipt.md (v1.0)` — **v1.0, not "draft"** |

This resolves the highest-value open question from the research pass in the **more pessimistic** direction. It is not a paper spec with zero implementations. It has been in the official extensions package for **four and a half months** and was republished six days ago.

### The issuer model — the structural problem

From the shipped type definitions:

```ts
interface OfferReceiptIssuer {
  kid: string;                    // Key identifier DID
  format: SignatureFormat;        // "jws" | "eip712"
  issueOffer(resourceUrl, input): Promise<SignedOffer>;
  issueReceipt(resourceUrl, payer, network, transaction?): Promise<SignedReceipt>;
}
```

Typed as `ResourceServerExtension`. The spec states a receipt is "a signed statement returned by **the resource server** only on success." **No delegation, third-party signer, or facilitator role is defined anywhere.**

And §4.5.1, the substance of the 2026-07-23 commit:

> "Verifiers MUST distinguish between signature validity and signer authorization. A valid signature proves that a specific key signed the artifact. It does not prove that the key was authorized."
> Verifiers must "confirm the key is authorized to sign for the service identified by `resourceUrl`."

Four authorization mechanisms, none mandatory: `payTo` address signing, DID document (`did:web`), DNS TXT at `_controllers.<domain>`, external key registry.

**TrustBench is a router. It does not own the provider's `resourceUrl`.** A spec-conformant verifier asks "is this key authorized to sign for *that* domain?" and TrustBench's `public_key_url` at `trustbench.io` is not an answer — it is not one of the four mechanisms, and it attests to the wrong domain. A per-provider `_controllers` DNS TXT entry would work mechanically, but requires opt-in from every provider TrustBench routes to. That does not scale for a router.

### Field-level diff

| `offer-receipt` `ReceiptPayload` | Type | TrustBench `receipt-spec-v1` | Divergence |
|---|---|---|---|
| `version` | number, `1` | `receipt.version` = `"1.0.0"` | **type** (number vs semver string) |
| `network` | CAIP-2 `"eip155:8453"` | `receipt.settlement.chain` = `"base"` | **format** |
| `resourceUrl` | string | `receipt.call.provider_url` | **name + nesting** |
| `payer` | string | `receipt.settlement.payer_address` | **name + nesting** |
| `issuedAt` | number, Unix sec | `receipt.issued_at` = ISO 8601 string | **type + format** |
| `transaction` | string, optional | `receipt.settlement.tx_hash` | **name + nesting** |

**All six fields exist semantically in TrustBench's receipt. Not one is wire-compatible.** Flat vs nested, numbers vs strings, CAIP-2 vs bare chain name, camelCase vs snake_case.

Signature envelope:

| | `offer-receipt` | TrustBench |
|---|---|---|
| Envelope | JWS Compact (`header.payload.signature`) or EIP-712 | bespoke detached object |
| Algorithms | ES256K, **EdDSA** | **Ed25519** |
| Key discovery | `kid` as DID → did:web / DNS / registry | `public_key_url` |
| Canonicalization | **JCS** for JWS payloads | **JCS** (RFC 8785) |

The **cryptographic primitive is compatible** — Ed25519 is EdDSA, and both canonicalize with JCS. The **envelope is not**: TrustBench emits a custom detached-signature object, not JWS compact serialization. And the extension explicitly warns that adding fields "would change the EIP-712 schema and break interoperability," and that implementers "SHOULD treat unknown extension-specific fields as unsupported."

### Verdict on Pillar 1: structurally divergent for the merchant slot — but the router slot is not contested

The honest reframe, and it is the useful output of this whole exercise:

**These attest to different facts by different parties.**

- `offer-receipt` = **merchant receipt**: "I, the resource server, received payment and delivered service."
- TrustBench = **router receipt**: "I, the router, chose this provider at this price with this fee split, settled by this tx, having considered N alternatives."

A merchant cannot attest to routing decisions. A router cannot authoritatively attest to service delivery.

So: **the merchant-receipt slot is closed** — spec at v1.0, shipped in the reference SDK since March, actively maintained. TrustBench cannot win that slot and should stop implicitly aiming at it. **The router-receipt slot is untouched by `offer-receipt`** and remains TrustBench's real, narrower, still-unclaimed artifact.

That reframe *lowers* the threat and *sharpens* the positioning simultaneously. The strongest available posture is **carry, don't compete**: TrustBench's envelope embeds the provider's `offer-receipt` object verbatim when the provider emits one, making the router receipt a **superset that contains the merchant receipt**. That is more valuable than either alone and is conformant by construction, because TrustBench never claims to sign for someone else's `resourceUrl`.

**None of this requires XRPL. All of it applies to Base today.**

---

## 4. Six-question filter — XRPL engagement: **FAIL** (Q3, Q4, Q5, Q6)

1. **Pillar?** Pillar 1 weakly; Pillar 2 no.
2. **Pillar 1 mechanic?** Adoption outreach only, requiring zero XRPL code. Demonstration fails on audience — 850 downloads/month is demonstrating to nobody.
3. **Pillar 2 mechanic? FAILS.** Not inventory (not the constraint), not cross-network coverage (no cheap path; breaks the receipt contract).
4. **If neither, why? FAILS.** Stripped of framing: "Ripple joined the Foundation, Mastercard is involved, the counter reads 1.7M." That is *interesting* + *a big name announced something* — both rejected by name.
5. **Which option? FAILS.** Not A (it is a build), not B, not C, not Pillar 2 maintenance. Would require inventing "Option D — new-chain expansion".
6. **Less-effort path? FAILS.** Yes, and it dominates: the `offer-receipt` diff in §3, which is chain-agnostic and applies to Base.

**Disqualifiers outside the six:** not a two-weekend v1; capital check uncomputable against t54's undisclosed fee schedule; and the Phase 4 kill criterion's own text says reassess **before adding any new features**.

---

## 5. Recommendation

# WATCH — zero hours on XRPL

No code. No outreach. No STANCE change on XRPL grounds. Explicitly **not** cheap Pillar-1 outreach to t54: §3 shows the governing spec defines a resource-server-issued receipt, so pitching TrustBench's envelope before resolving the carry-don't-compete positioning risks evangelising a non-conformant dialect to the one counterparty who might have said yes.

### Load-bearing triggers (per the lessons.md 2026-08-02 rule, stated in settled value, not proxies)

1. **A named XRPL merchant or agent asks TrustBench in writing** for routing or receipts. One inbound beats every argument here.
2. **t54 or Ripple publishes a *signed* receipt format** — a signature algorithm, key-discovery endpoint, or non-empty `signers` array on `/supported`. **Closes the window permanently; answer becomes a hard no.**
3. **XRPL x402 settled volume published above ~$250k cumulative** (≈20–25× current lifetime).
4. **x402 Foundation charters a receipt/attestation working group.** Correct response is *join that venue*, not add XRPL. Note Premier membership is reportedly $200k/yr.
5. **At least one paying external agent converts on Base first.** A precondition, not an XRPL signal.

**Explicitly NOT triggers:** another Ripple or Mastercard press release; xrpld 3.3.0 shipping with Batch/PermissionDelegation; the transaction counter crossing 2M/5M/10M; a new hackathon cohort.

### Recommended follow-ups (not XRPL, not done here)

- **STANCE bump candidate:** `x402 v2 spec` is already tracked at severity **3** under `receipt-format`. §3 is grounds for **5** (shipped SDK implementation of a competing receipt artifact). A +2 move meets CLAUDE.md's STANCE-update criterion. Flagged, not applied.
- **Carry-don't-compete design seed:** embed provider-issued `offer-receipt` objects inside the TrustBench envelope. Chain-agnostic, Base-applicable, no spec break — `receipt-spec-v1.md` is a public contract and any change requires explicit approval.

---

## 6. What could not be verified

1. Whether any **facilitator or resource server in production actually emits** `offer-receipt`. The SDK exports it; adoption is unmeasured. **This is now the top open question** — an exported module with no users is still a very different threat from one in wide use.
2. Whether `@x402/core`'s server helpers wire `offer-receipt` on by default, or whether it is strictly opt-in per route (`OfferReceiptDeclaration` suggests opt-in via route config, but this was not confirmed against server code).
3. The full text of the 2026-07-23 §4.5.1 diff was read via summary, not as a raw unified diff.
4. **t54's `/settle` response bytes were never captured.** The unsigned reading rests on the published scheme doc plus the empty `signers` array — strong but indirect.
5. **t54's fee schedule is undisclosed.** Unit economics for any stacked fee are uncomputable, not merely unfavourable.
6. **Mastercard Verifiable Intent is trade-press-sourced only**; mastercard.com returned HTTP 403. Its credential format is contradicted across sources (three-tier SD-JWT vs W3C VC).
7. All XRPL transaction counts trace to t54's own dashboard; `/api/stats` and `/api/metrics` both 404. No independent on-chain verification.
8. How many of the 1,286 "services" and 136 "merchants" are real. Some are priced at 0 XRP/call on vercel.app domains.
9. **No external dataset exists on how many x402 endpoints receive paying versus crawler traffic.** TrustBench's 419-requests-zero-payments may be the ecosystem norm — arguably the most decision-relevant unknown in this entire assessment, and it has nothing to do with XRPL.

---

## Incidental

`xrpl-ai.org`'s listed services include **Heurist Mesh** and **Heurist Inference Router** — the same provider family already in TrustBench's registry (~150 crawled endpoints). At least one provider TrustBench already tracks has a live XRPL x402 presence. Not a reason to act; a concrete thing to point at if a trigger fires.

---

**Bottom line:** XRPL agentic payments is real infrastructure with no economy attached. There is a genuine unsigned-receipt gap there, but no demand for filling it and no primitive advantage in doing so. The standards fight that actually matters is happening chain-agnostically in a public GitHub repo on the Base side, it is further along than assumed, and the correct response is to reposition the artifact as a router receipt that *carries* the merchant receipt rather than competes with it.
