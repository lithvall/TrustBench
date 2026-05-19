# AP2 Compatibility Assessment

**Date:** 2026-05-07
**Author:** Claude (in response to `unexplored-ideas.md` § 2.1 and `phase6-beyond-strategy.md` Q-AP2)
**Status:** Verdict + recommendations. Not a build spec.

**TL;DR:** AP2 v0.2 is **complementary, not competing** with `receipt-spec-v1.md`. AP2 has no Router role, no Routing Receipt, and no on-chain settlement attestation — those are structurally TrustBench's lane, structurally untouched. The original fear in `unexplored-ideas.md` § 2.1 ("AP2 mandate format eats your receipt format") does not survive contact with the v0.2 specification text. Path B's strategic posture is *upgraded* by this finding, not threatened.

---

## What I read

- `https://ap2-protocol.org/ap2/specification/` — the AP2 v0.2 specification page, full article extracted (16,264 characters of body content).
- `https://ap2-protocol.org/` — root page, used for navigation context.
- WebSearch results summarizing the broader AP2 documentation (Cart/Intent/Payment Mandate references from older docs that v0.2 has consolidated).
- `receipt-spec-v1.md` (project root) — TrustBench's current receipt spec.

What I could **not** read directly: the `/ap2/topics/ap2-and-x402/` page (consistent 404 from this fetch path) and the canonical Pydantic types at `github.com/google-agentic-commerce/AP2` (the raw-content paths I tried 404'd; the search confirmed `src/ap2/types/mandate.py` exists but I couldn't pull the bytes). The v0.2 specification page is the canonical architectural source and is sufficient for a compatibility verdict at the spec-shape level. Field-level binding details (exact JSON keys, claim names) would be next-level confirmation for actual implementation.

---

## AP2 v0.2 in one page

**Five roles.** Shopping Agent (SA), Credential Provider (CP), Merchant (M), Merchant Payment Processor (MPP), Trusted Surface (TS). AP2 has no Router role. The entity that picks among multiple potential merchants is implicitly the SA.

**Two Mandate types.**
- **Checkout Mandate** — SA-issued, M-verified. Bound via cryptographic hash to a merchant-signed Checkout JWT. Versioned via `vct` claim (`mandate.checkout.open.1`, `mandate.checkout.closed.1`). Encoded as SD-JWT (Selective Disclosure JWT).
- **Payment Mandate** — SA-issued, CP/Network/MPP-verified. Bound via hash to the same Checkout JWT. Same SD-JWT encoding, `mandate.payment.1` vct.

**Two Receipt types.**
- **Checkout Receipt** — M-issued JWT, returned to SA after accept/reject. Contains error message on reject.
- **Payment Receipt** — MPP-issued JWT, returned to SA + CP + (optionally) Networks. Same shape.

**Open vs Closed Mandates.** Open Mandates carry constraints (intent-level — "I want a hotel under $200, refundable, in NYC"). Closed Mandates are bound to a specific transaction (post-cart-assembly). In Direct mode, only Closed Mandates are presented for verification, signed by the user via Trusted Surface. In Autonomous mode, the SA presents both Open and Closed Mandates; the verifier checks the Closed satisfies the Open's constraints.

**Crypto.** Mandates use SD-JWT. Receipts are JWTs. **The Checkout JWT — the merchant-signed object the Mandate hashes against — MUST be signed using a digital signature scheme (e.g., ECDSA) and NOT a deterministic signature (e.g., Ed25519).** The reason given is rainbow-table prevention. This restriction applies *to the Checkout JWT*, not to every artifact in the system. The Mandate signature scheme is defined by the underlying Agent Authorization framework and SD-JWT supports multiple algorithms.

**Extension points (named explicitly).**
- *Mandate Constraints* — anyone can define a new constraint type (unique `type`, schema with selective-disclosure annotations, evaluation algorithm).
- *Checkout Object* — AP2 is agnostic to merchant Checkout JWT contents.
- *Payment Instrument* — extensible by `type` field.
- *VDC Formats* — SD-JWT specified, other Verifiable Digital Credential formats permitted.

**x402 integration is explicit.** AP2's GitHub repo ships sample scenarios at `samples/python/scenarios/a2a/human-present/x402/` and `human-not-present/x402/`. AP2 + x402 is a designed-in compatibility, not a retrofit.

**Dispute evidence.** Checkout Mandate + Checkout Receipt + Payment Mandate + Payment Receipt, all four artifacts together, retained by various roles, indexed by `transaction_id` from the Payment Mandate. AP2 explicitly defers retention/retrieval mechanics to the surrounding commerce protocol.

---

## TrustBench Receipt v1.0.0 in one paragraph

A single JSON object with a detached Ed25519 signature over RFC 8785 JCS-canonical bytes. Issued by TrustBench's router at end-of-call. Groups: `call` (capability + provider URL + request/response hashes + latency), `settlement` (chain + tx hash + block number + addresses + amount), `pricing` (provider price + TrustBench fee), `routing` (score-at-decision + alternatives count + selection reason), `audit` (`/receipts/:id` URL). Signed by TrustBench's published Ed25519 key, verifiable third-party with no TrustBench infrastructure dependency in the verify path.

---

## Where they overlap (and where they don't)

| Lifecycle event | AP2 covers | TrustBench Receipt covers |
|---|---|---|
| User intent + spending constraints | Open Checkout Mandate + Open Payment Mandate (SD-JWT, user-signed via TS) | Not covered today; planned as Policy DSL (P6-M2) |
| User-signed authorization for a specific transaction | Closed Mandates signed by user credential or Agent key with cnf claim | Not covered (TrustBench is non-custodial — agent signs the x402 EIP-3009 authorization separately, outside TrustBench) |
| Routing across N candidate providers (capability-shaped) | Not covered — AP2 assumes one merchant per Checkout | `routing.score_at_decision`, `routing.alternatives_considered`, `routing.selection_reason` |
| Merchant says "I accepted/rejected this Checkout" | Checkout Receipt (JWT) | Not covered (implicit only via response_hash) |
| MPP says "I accepted/rejected this Payment Mandate" | Payment Receipt (JWT) | Not covered |
| **On-chain settlement reference** | **Not covered** — Payment Receipt is MPP's attestation, not chain truth | `settlement.tx_hash`, `settlement.block_number`, `settlement.payer_address`, `settlement.payee_address`, `settlement.amount_atomic` |
| **Routing receipt — "I, the router, picked this provider for these reasons"** | **Not covered** — AP2 has no Router role | TrustBench Receipt's whole point |
| Replayable audit URL | Outside scope ("Providing an automated method to retrieve the Checkout Mandate […] would provide substantial utility to the ecosystem. The exact details are outside the scope of the current version") | `audit.audit_url` — already shipped at `/receipts/:id` |
| Dispute evidence | Combined (Checkout Mandate + Receipt + Payment Mandate + Receipt) | TrustBench Receipt + future P5 dispute layer |

**The headline:** the only events both specs touch are the *settlement attestation* and the *audit retrieval* — and even there they're at different layers. AP2's Payment Receipt is "the MPP says it processed the payment." TrustBench's Settlement section is "here's the on-chain transaction that actually moved USDC." Both can be true at once and the receipt holder gets a more complete picture by holding both.

The two specs do not collide on a single signed-bytes-over-the-same-event collision. They cover sequential, complementary events.

---

## The Ed25519 question — addressed directly

`unexplored-ideas.md` § 2.1 raised the concern that "AP2 mandates require something structurally incompatible" with Ed25519 + JCS. The v0.2 spec language is more nuanced than that fear:

> *"The Checkout JWT MUST be signed using a digital signature scheme (e.g., ECDSA) and not a deterministic signature (e.g., Ed25519)."*

This restriction is **specifically about the Checkout JWT** — the merchant-signed object that the Checkout Mandate hashes against. The reason given is rainbow-table prevention against deterministic signatures over predictable inputs. It does not extend to:

- TrustBench's Routing Receipt (TrustBench is not a Merchant under AP2's role model)
- Receipts emitted by parties other than the Merchant
- Selective-disclosure derivations (SD-JWT supports multiple signature algorithms)

So Ed25519 + JCS for TrustBench Receipts is structurally fine under AP2. Where TrustBench would need to *not* use Ed25519 is if it ever became a Merchant in AP2's role model — i.e., if TrustBench started signing Checkout JWTs that other parties depend on. That's not on any roadmap. The router stays a router.

There is one nuance worth recording: if TrustBench later defines a Mandate Constraint type for routing policy (as recommended below), the *constraint definition* is part of the Mandate, which is SD-JWT-encoded. The signature on that Mandate is the user's or the agent's, not TrustBench's, and uses whatever signature scheme the user's TS or the Agent Key uses. TrustBench's choice of Ed25519 for receipts is unaffected.

---

## Verdict

**Compatible. And better than compatible — explicitly composable.**

Concrete claim 1: **AP2 does not have a Routing Receipt and does not propose one.** TrustBench Receipt is the routing-and-settlement-evidence artifact AP2 leaves outside its scope. Path B's "open receipt + policy standard" framing is reinforced by AP2's existence, not threatened by it. The two specs together cover more of the agent-transaction lifecycle than either alone.

Concrete claim 2: **TrustBench's planned Policy DSL (P6-M2) maps to AP2's Mandate Constraints extension point.** Instead of inventing a parallel policy format, define `mandate.constraint.routing.1` (or similar) following AP2's published constraint-definition contract: a unique `type`, a selectively-disclosable schema, an evaluation algorithm. Encode `capability`, `max_price`, `max_rolling_spend`, `idempotency_key_required`, `allow_providers`, `deny_providers` as constraint fields. This converts P6-M2 from "TrustBench's parallel spec" into "TrustBench's adoption of AP2's extension surface" — a strict alignment win.

Concrete claim 3: **TrustBench Receipts should be optionally enrichable with AP2 artifacts.** Reserve and document — but do not require — these optional fields in `receipt-spec-v1.md` for a future minor version:

```json
"ap2": {
  "checkout_mandate_hash": "sha256:...",
  "payment_mandate_hash": "sha256:...",
  "checkout_receipt_jwt": "eyJhbGc...",
  "payment_receipt_jwt": "eyJhbGc..."
}
```

When an agent operates under AP2 (Direct or Autonomous mode), TrustBench Receipts can carry hashes of the SA's Mandates and the merchant's/MPP's Receipts. Holders of a TrustBench Receipt can then cross-verify against the AP2 trail. When the agent isn't under AP2, the field is absent. Backwards compatible. Doesn't require any AP2-specific code to *issue* TrustBench Receipts — only consumers who care about AP2 use the field.

---

## What this means for Path B (concretely)

Three updates to the strategic posture in `phase6-beyond-strategy.md`:

**Reframe the unique value claim.** Today's positioning candidate was "the open receipt and policy standard for non-custodial agent payments." A stronger framing after this read: **"the routing-and-settlement-evidence layer that composes with AP2, x402, and any future settlement protocol — open spec, hosted reference implementation, third-party-verifiable receipts."** The phrase "composes with AP2" puts TrustBench in the same sentence as Google/FIDO without claiming territory AP2 has already claimed.

**P6-M2 (Policy DSL) gets a concrete spec target.** Instead of designing the DSL from scratch, design it as an AP2 Mandate Constraint extension. This:
- Makes adoption easier (anyone implementing AP2 can natively understand the constraint).
- Gives TrustBench a credible reason to engage AP2's standards process — submitting a constraint type is exactly the kind of contribution AP2 invites.
- Costs almost nothing relative to inventing a parallel format, because the policy fields themselves are the same; only the wrapper changes.

**P6-N1 (docs.trustbench.io) should explicitly pitch AP2 composability.** The methodology page and spec landing page should describe TrustBench Receipt + AP2 Mandate as the full picture, with TrustBench filling AP2's "outside the scope" lane. This is a much more credible positioning than "we're an alternative to AP2."

**The risk re-stated honestly.** The single thing this assessment cannot confirm without a deeper read of AP2 source: whether AP2's reference x402 sample scenarios (`samples/python/scenarios/a2a/{human-present,human-not-present}/x402/`) implicitly define a routing receipt of their own. If they do — even informally — a follow-up read of those sample scenarios is warranted before publishing P6-N1's spec docs site. If they don't (more likely given the v0.2 spec language about routing being SA's responsibility), Path B as proposed proceeds.

---

## What I recommend the next 1–2 commits do

1. Save this file as `ap2-compatibility-assessment.md` in the project root.
2. Add a one-line decision entry to a new `decisions.md`: *"2026-05-07: Path B proceeds. AP2 is complementary; TrustBench Receipt fills AP2's out-of-scope routing/settlement-evidence lane. Policy DSL (P6-M2) to be designed as an AP2 Mandate Constraint type."*
3. Add a single-paragraph "AP2 alignment" section to `phase6-beyond-strategy.md` § 7 (Positioning & Moat), pointing at this file.
4. Keep `receipt-spec-v1.md` v1.0.0 unchanged. The optional `ap2.*` fields described above belong in v1.1.0 once we have a concrete AP2-using counterparty (Infopunks operating under AP2, for instance) — designing them speculatively is premature. Reserve the namespace; defer the fields.
5. Read the two AP2 x402 sample scenarios from GitHub before P6-N1 ships, to confirm no implicit routing-receipt format conflicts with TrustBench's. (~30 minutes of reading; should be a separate task.)

---

## Sources

- [AP2 v0.2 Specification](https://ap2-protocol.org/ap2/specification/) — primary source; full body of the article was read.
- [AP2 Documentation root](https://ap2-protocol.org/) — used for navigation context.
- [Announcing the Agent Payments Protocol (AP2) — Google Cloud Blog](https://cloud.google.com/blog/products/ai-machine-learning/announcing-agents-to-payments-ap2-protocol) — referenced for high-level framing context (cited in `unexplored-ideas.md` § 2.1).
- [google-agentic-commerce/AP2 GitHub](https://github.com/google-agentic-commerce/AP2) — referenced; raw-content paths I tried (`src/ap2/types/mandate.py`, `docs/specification.md`) returned 404 from this fetch surface, suggesting the repo path layout has shifted. The v0.2 specification page is sufficient for spec-shape compatibility verdict; the Python types would only refine field-level naming.
- AP2 reference samples (uploaded by Johan 2026-05-07) — README of `samples/python/scenarios/a2a/human-present/x402/`, README of `samples/python/scenarios/a2a/human-not-present/x402/`, plus `run.sh` from human-not-present. See addendum below.
- [a2a-x402 extension repository](https://github.com/google-agentic-commerce/a2a-x402/) — referenced from the Human Present sample README; the *current* x402 A2A extension which AP2 explicitly says will be "enhanced to ensure the creation of all key mandates outlined in AP2."
- Internal: `receipt-spec-v1.md`, `phase6-beyond-strategy.md`, `unexplored-ideas.md`.

---

## Addendum (2026-05-07, after reading the AP2 reference samples)

The two AP2 + x402 reference sample READMEs and the Human-Not-Present `run.sh` were obtained directly. They confirm the spec-level verdict and add two new findings.

**Finding A1 — AP2 + x402 is unfinished.** The Human Present README states verbatim: *"The AP2 compatible x402 extension is coming soon. The current x402 extension will be enhanced to ensure the creation of all key mandates outlined in AP2."* The samples use the older `a2a-x402` A2A extension which does not yet emit the full Mandate set. Strategic implication: Google has not locked the canonical AP2 + x402 wire shape. TrustBench can credibly engage the standards process (per `phase6-beyond-strategy.md` § 6 P6-M1) to influence what "AP2-compatible x402" lands on, including reserving the routing-receipt-as-Mandate-Constraint pattern proposed in the main verdict above.

**Finding A2 — zero router footprint in the reference code.** Both samples instantiate four explicit roles (Shopping Agent, Merchant Agent, Merchant Payment Processor Agent, Credentials Provider Agent). Trusted Surface is implicit in the SA's UI. The `run.sh` provisions a signing key per role: `AGENT_SIGNING_KEY_PATH`, `MERCHANT_SIGNING_KEY_PATH`, `MERCHANT_PAYMENT_PROCESSOR_SIGNING_KEY_PATH`. There is no router signing key, no routing-receipt file output, and no "select among N merchants" logic in either flow. The Human Present flow walks 1 Shopping Agent → 1 Merchant; the Human Not Present flow is triggered by a mock price-drop event from a single Merchant Trigger endpoint. The "digital receipt" mentioned at the end of the Human Present README (step 8) is a presentation-layer message returned to the user, not a structured signed artifact at the AP2 layer. This concretely confirms the spec-level claim that AP2 leaves the routing layer untouched.

**Terminology catch.** The samples use `IntentMandate` + `CartMandate` + `PaymentMandate`. The v0.2 specification page consolidated to `CheckoutMandate` + `PaymentMandate` (with "open" Mandates carrying intent constraints, replacing what older docs called IntentMandate). The samples are *slightly behind* the v0.2 spec text. Anything TrustBench builds to AP2 should track the spec's `vct` values (e.g., `mandate.checkout.open.1`, `mandate.payment.1`), not the older sample naming. This isn't a blocker; it's a note for whoever writes the eventual `mandate.constraint.routing.1` proposal to read the spec's `vct` discipline carefully.

**Verdict after the sample read: same as before, with one upgrade.** The original verdict (AP2 is complementary, not competing) holds and is now confirmed at the reference-implementation level. The upgrade: because AP2 + x402 is officially unfinished, the window for TrustBench to influence the canonical wire shape is *open right now*. Path B's standards-track work (P6-M1) is more time-sensitive than the original phase6 doc framed it.

---

## Addendum B (2026-05-07, after reading the a2a-x402 extension repo README)

The README of [`google-agentic-commerce/a2a-x402`](https://github.com/google-agentic-commerce/a2a-x402/) — the *current* x402 A2A extension — was obtained directly. This is the layer the AP2 reference samples actually run against today, the layer AP2's Human Present README explicitly says will be "enhanced to ensure the creation of all key mandates outlined in AP2."

**Finding B1 — the current x402 A2A extension is at spec v0.1 and uses no Mandate vocabulary.** The README documents a three-message flow:

1. `payment-required` (merchant → client)
2. `payment-submitted` (client → merchant, with signed payment details)
3. `payment-completed` (merchant → client, after on-chain settlement)

There is no `IntentMandate`, no `CartMandate`/`CheckoutMandate`, no `PaymentMandate`, no `vct` claim, no SD-JWT encoding, and no explicit role separation between Merchant / MPP / CP / TS. The whole thing is a thin payment-flow library: "Core Protocol" (data structures + signing/verifying) plus "Executors" (middleware that automates the flow). Routing across multiple merchants is not in scope. No routing-receipt artifact is defined. This means the lane TrustBench occupies is uncontested *even at the lower-stratum x402 extension level* that AP2 sits on top of.

**Finding B2 — there is a directly-named partner-contribution surface.** The repo's directory layout, per its README:

```
x402-a2a/
├── spec/v0.1/spec.md
├── schemes/                # experimental x402 payment schemes drafted by partners and other contributors
└── {language}/...
```

The `schemes/` directory is **explicitly described as a place for partner-drafted experimental schemes.** This is the cheapest standards-track entry point for TrustBench's routing-receipt extension: draft `schemes/trustbench-routing-receipt-v1.md` and submit a PR. Cheaper than the EIP-8004 process and cheaper than an x402 Foundation extension submission, and pre-aligned with where Google is openly inviting partner work.

**Finding B3 — terminology alignment for any TrustBench scheme proposal.** A TrustBench scheme would extend the v0.1 three-message flow with:
- An optional pre-flight "routing-decision" stage (the router emits a signed routing receipt before the agent sends `payment-submitted`)
- Optional metadata in `payment-completed` linking back to the routing receipt's `receipt_id` and the chosen provider's score
- A reference to the verifier (`/.well-known/trustbench-pubkey` and `/receipts/:id`)

None of this requires breaking changes to v0.1. It can be additive.

**Strategic upgrade to Path B / P6-M1 (`phase6-beyond-strategy.md` § 6 medium-term).** The original phase6 doc framed the formal-spec path as binary: *EIP route* (broader, slower) or *x402 Foundation extension* (narrower, faster). This README reveals a third option that's cheaper and more time-sensitive: **draft a routing-receipt scheme proposal against `a2a-x402/schemes/` before the AP2-compatible x402 enhancement freezes the wire shape.** Sequencing implication for the next 4–8 weeks:

1. (Near-term) Draft `schemes/trustbench-routing-receipt-v1.md` as an additive scheme over the v0.1 three-message flow. Should be one weekend's writing — much shorter than the eventual EIP submission.
2. (Concurrent) PR it. Track Google's review velocity on the repo.
3. (Medium-term) When AP2's full x402 enhancement lands, evolve the scheme into a Mandate Constraint (`mandate.constraint.routing.1`) per the spec-page extension point. The scheme draft becomes the migration source.

This makes P6-M1 a *near-term* item, not medium-term. Bumps it up the queue.

---

## Addendum to "Sources"

- AP2 Human Present sample README, AP2 Human Not Present sample README, Human Not Present `run.sh` — provided by Johan 2026-05-07.
- [a2a-x402 repository README](https://github.com/google-agentic-commerce/a2a-x402/) — provided by Johan 2026-05-07.
- a2a-x402 v0.1 spec (`spec/v0.1/spec.md`) and v0.2 spec (`spec/v0.2/spec.md`) — provided by Johan 2026-05-07. See Addendum C.

---

## Addendum C (2026-05-07, after reading a2a-x402 v0.1 and v0.2 spec)

The full text of `spec/v0.1/spec.md` and `spec/v0.2/spec.md` from the `a2a-x402` repo were obtained directly. v0.2 is materially different from what I inferred from the parent README earlier — and it materially upgrades Path B's near-term opportunity.

**Finding C1 — v0.2 is shipped. The "Embedded Flow" is the AP2 + x402 wire shape, in production-grade detail.** The parent README's "AP2 compatible x402 extension is coming soon" line is misleading; v0.2 of `a2a-x402` *is* the AP2-compatible enhancement, already published and URI-addressable at `https://github.com/google-agentic-commerce/a2a-x402/blob/main/spec/v0.2`. Two distinct flows:

- **Standalone Flow** — v0.1 shape preserved, no AP2 envelope. `x402PaymentRequiredResponse` lives in `task.status.message.metadata.x402.payment.required`; `PaymentPayload` lives in `message.metadata.x402.payment.payload`.
- **Embedded Flow** — v0.2's composable mode, where x402 functions as a "Form of Payment" inside a higher-level commerce protocol (AP2). `x402PaymentRequiredResponse` is embedded inside an AP2 `CartMandate` in `task.artifacts`; `PaymentPayload` is embedded inside an AP2 `PaymentMandate` in `message.parts`. The PaymentMandate's `payment_details.cart_mandate` field carries a "user-signed hash of cart_shoes_123" — the user-signed mandate-binding hash. This implements the AP2 v0.2 spec page's described Mandate-binding pattern at the wire level.

**Finding C2 — terminology drift between AP2's docs site and the a2a-x402 v0.2 spec.** The AP2 v0.2 specification page (https://ap2-protocol.org/ap2/specification/) refers to **CheckoutMandate** as the post-cart-assembly mandate type. The a2a-x402 v0.2 spec uses **CartMandate** in its Embedded Flow examples (key `ap2.mandates.CartMandate`). Either the AP2 docs page is newer than the deployed extension or both terms are simultaneously in flight; either way, anyone *implementing* AP2 + x402 right now is using `CartMandate`. Implication: TrustBench-side documentation should name both terms when describing the AP2 alignment, and the eventual Mandate Constraint proposal should track whichever name is canonical when it ships.

**Finding C3 — the receipt artifact in v0.2 Embedded Flow is thin.** This is the biggest finding in the file. `x402.payment.receipts` is an array of `x402SettleResponse` objects with the schema `{success, errorReason, transaction, network, payer}` — no signature, no mandate hash linkback, no replayable audit URL, no call metadata, no latency, no routing data. The AP2 v0.2 spec page promises a much richer Payment Receipt (JWT, MPP-signed, used as dispute evidence). The deployed a2a-x402 v0.2 receipts are the lean settle-response inherited from base x402, not the AP2-shaped Receipt JWT.

This is the strongest argument yet that TrustBench's lane is genuinely open. A signed TrustBench Routing Receipt that contains (a) the x402SettleResponse fields verbatim, (b) the AP2 `cart_mandate` user-signed-hash and `PaymentMandate` payment_request_id, (c) routing decision metadata (`score_at_decision`, `alternatives_considered`), and (d) the on-chain `block_number`, served at a queryable `/receipts/:id`, is a strict superset of what v0.2 ships. It can be deployed additively — same `x402.payment.receipts` array with richer entries, or a parallel namespace like `trustbench.receipts` — without breaking existing v0.2 implementations.

**Finding C4 — three signing patterns documented in v0.2 § 4.1, all leave room for a router-side attestation:**

- *Atomic Signing (Human-Present):* one user approval, wallet does two background signatures (PaymentPayload + order authorization). The router emits its own attestation as a separate artifact — no conflict.
- *Delegated Signing (Human-Not-Present):* user pre-authorizes the Client Agent; the Client Agent self-signs both PaymentPayload and order authorization. TrustBench's Routing Receipt fits naturally as a third artifact emitted by the routing intermediary distinct from the Client Agent.
- *Smart Contract Escrow:* user signs only the order authorization; the smart contract is the on-chain "Payer." TrustBench is non-custodial, so this pattern doesn't apply directly, but the Routing Receipt could still attest "this contract address was selected from N alternatives" without involving custody.

**Sequencing correction to Addendum B's PR plan.** Addendum B suggested PR'ing `schemes/trustbench-routing-receipt-v1.md`. The repo's `schemes/` directory contains three existing files (`scheme_exact_lightning.md`, `scheme_exact_spark.md`, `scheme_exact_uma.md`) which are **payment scheme variations** — not routing or receipt extensions. The schemes namespace is the wrong PR target. Better path:

1. Read `CONTRIBUTING.md` and `schemes/README.md` to confirm the contribution surface for non-payment-scheme additions.
2. If there's no existing namespace, open an Issue against `google-agentic-commerce/a2a-x402` proposing a "routing receipt enrichment" extension (or naming it differently — "audit receipt" / "router attestation" — depending on what the maintainers prefer).
3. Draft the proposal as either a new directory (`extensions/`, `attestations/`, etc.) or as an enrichment to the existing `x402.payment.receipts` array. Decide based on maintainer reaction.

This is still cheaper than the EIP route — the entry point is just an Issue, not a full PR. But the "weekend of writing → PR" framing was over-confident.

**Updated strategic verdict.** v0.2 is published, the Embedded Flow makes AP2 integration concrete and visible, and the receipt slot is *genuinely thin* — leaving room for a TrustBench-shaped enrichment that any AP2 + x402 implementation could opt into. Path B's near-term sequence is updated:

1. (This week) Read `CONTRIBUTING.md` and `schemes/README.md` from `a2a-x402` repo to confirm the right contribution surface.
2. (Within 2 weeks) Open an Issue against `google-agentic-commerce/a2a-x402` proposing a "TrustBench-shaped routing receipt enrichment" — link to TrustBench's `receipt-spec-v1.md`, frame it as an additive extension to the v0.2 `x402.payment.receipts` array.
3. (Concurrent with normal Path B work) Continue P6-N1 (docs.trustbench.io), P6-N2 (npm/PyPI verifiers), P6-N6 (formal Infopunks integration). The PR/issue work is opportunistic — it doesn't replace the docs site or the verifier libs.

The window for influencing the canonical AP2 + x402 wire shape is open *now* but probably won't be 6 months from now. A v0.3 of `a2a-x402` could lock the receipt shape against any TrustBench-style enrichment without rejecting it explicitly — just by not leaving room for it. Worth engaging early.

---

## Addendum D (2026-05-07, after reading CONTRIBUTING.md, schemes/README.md, ap2-demo README, state.py, extension.py, package __init__.py)

The repo's CONTRIBUTING.md, schemes/README.md, ap2-demo README, and the core Python type-stubs were obtained directly. Four findings, one of which is the most strategically important in this whole document.

**Finding D1 — `a2a-x402`'s contribution process is plain-vanilla GitHub.** CONTRIBUTING.md says: fork → feature branch → commit → PR → resolve linting. No Issue-first requirement, no proposal template, no bespoke standards-track process. So the open execution question is purely "which directory does a routing-receipt extension belong in?" — not "how do we get permission to propose one?"

**Finding D2 — `schemes/` is confirmed off-limits for routing/receipt extensions.** The directory's README states: *"This directory contains experimental x402 payment schemes drafted by partners and other contributors. These schemes are not yet part of the x402 specification; they are provided for reference and experimentation. When ready, each scheme should be upstreamed to the main x402 schemes repository [coinbase/x402]."* So `schemes/` is a partner-staging area for Coinbase's upstream schemes repo, exclusively for payment-scheme variations. Not the right home for a routing-receipt enrichment.

**Finding D3 — the ap2-demo README confirms three-Mandate naming, not two.** The reference implementation flow is documented as: `IntentMandate` (user-signed via Mock Wallet) → `CartMandate` (merchant-signed, returned as A2A Artifact in `task.artifacts`) → EIP-712 typed-data signing of `transferWithAuthorization` → `PaymentMandate` (user-signed) → settlement via Mock Facilitator on Base Sepolia. So three Mandate types in the deployed reality, with EIP-712 specifically for the on-chain authorization (matching the AP2 v0.2 spec's ECDSA-not-Ed25519 requirement on the Checkout JWT). The AP2 v0.2 spec page's consolidation to "CheckoutMandate + PaymentMandate, with open Mandates as intent-bearing variant" does not match the reference implementation's three-Mandate naming. Anyone implementing AP2 + x402 right now uses three Mandate types.

**Finding D4 — the load-bearing finding for Path B execution.** The `x402_a2a/src/x402_a2a/__init__.py` imports `SettleResponse` from upstream `x402.types`, not from the local extension package:

```python
from x402.types import (
    PaymentRequirements,
    x402PaymentRequiredResponse,
    PaymentPayload,
    SettleResponse,
    ExactPaymentPayload,
    EIP3009Authorization,
    ...
)
```

`SettleResponse` is the type whose instances populate `x402.payment.receipts` in v0.2 Embedded Flow. **The receipt schema is owned by Coinbase, not by Google.** Any change to the receipt wire shape that TrustBench wants to land doesn't go through `google-agentic-commerce/a2a-x402` — it goes through `coinbase/x402`.

**Strategic implication.** This restructures the Path B execution sequence. The most strategically-placed PR is to coinbase/x402 itself — extending `SettleResponse` with optional fields such as `audit_url`, `signed_receipt_url`, `attestation_url`, or `enriched_receipt_uri`. A successful PR there would propagate automatically through:

- Vanilla x402 (Coinbase CDP facilitator's settle response)
- a2a-x402 v0.2 Standalone Flow (`x402.payment.receipts`)
- a2a-x402 v0.2 Embedded Flow / AP2 + x402 (same `x402.payment.receipts` array)
- Any other library that imports from `x402.types`

That is a strictly higher-leverage target than `a2a-x402` extension work. One additive optional field, one PR, one place.

**Updated execution sequencing for P6-M1.** Given Findings D1–D4 together:

1. (~1–2 days) Read coinbase/x402's CONTRIBUTING.md and the active discussions/issues on the SettleResponse type. Confirm the maintainers have not already shipped or rejected a similar enrichment.
2. (~1 weekend) Draft a small additive PR to coinbase/x402 that adds an optional `audit_url` (or `enriched_receipt_uri`) field to `SettleResponse`. Frame: "non-breaking optional pointer to a richer receipt artifact, maintained off-spec, useful for auditors / agents / dispute resolution." Reference TrustBench's `receipt-spec-v1.md` as the example consumer but make the field generic — anyone can host whatever schema they want at the URL.
3. (~Concurrent) Open an Issue or short Discussion thread on `google-agentic-commerce/a2a-x402` flagging that v0.2 Embedded Flow inherits whatever Coinbase ships, and that the TrustBench enrichment pattern is upstream-friendly.
4. (~Future) If the Coinbase PR lands, the TrustBench docs site (P6-N1) and verifier libs (P6-N2) become the natural reference implementation for the field. A v0.3 of `a2a-x402` would naturally pull in the new SettleResponse field. AP2's eventual full-receipt JWT vision can compose with this as an additional layer rather than competing.

This is materially cheaper *and* materially higher-leverage than the original "PR to a2a-x402/schemes/" plan. The original plan was off-target by two layers — wrong directory and wrong repo. Addendum D corrects the layer.

The window remains open. Coinbase x402 v2 is published and active. The SettleResponse type is small enough that an additive optional field is a low-stakes ask. Path B's standards-track work is one focused PR away from being meaningfully started.

---

## Addendum E (2026-05-07, after reading the full `specs/extensions/` directory and `specs/CONTRIBUTING.md` from coinbase/x402)

This addendum materially revises the strategic picture. Two earlier addenda contain corrections.

**Finding E1 — The repo has moved to the x402 Foundation.** The README opens with: *"We've moved the x402 repo under the x402 Foundation repo. All issues and PRs were transferred here: github.com/x402-foundation/x402. Our repo (coinbase/x402) is now a development fork."* The PR target is `x402-foundation/x402`, governed by a Linux Foundation-backed multi-org body (per the `foundation/` directory containing the x402 Technical Charter). Coinbase is downstream now, which structurally favors partner-contributed extensions over single-vendor proposals.

**Finding E2 — The `offer-and-receipt` extension already exists at v0.6 (2026-02-04, author Alfred Tom).** It defines two signed artifacts:

- **Signed Offer** — resource server cryptographically commits to a payment-terms entry in `accepts[]`. Placed in `extensions["offer-receipt"].info.offers[]`.
- **Signed Receipt** — resource server signs after successful payment + service delivery, returned in `extensions["offer-receipt"].info.receipt`. Receipt fields: `version`, `network` (CAIP-2), `resourceUrl`, `payer`, `issuedAt`, optional `transaction` (privacy-minimal default omits it). Signature formats: EIP-712 (with `payTo` as default signer) or JWS (with `kid` header for DID-based key resolution).

§8 of the spec lists the use cases verbatim: *"dispute evidence and auditability, user-review attestations, verifiable proof of commercial interactions for reputation systems… agent-to-agent commerce: autonomous agents making purchasing decisions need machine-verifiable proof of terms and delivery. Signed offers let an agent's principal (human or system) audit what deals the agent accepted; receipts prove the agent received the promised service."* This is the exact use case TrustBench was positioning the receipt-spec to fill. The Foundation has shipped that primitive.

**Finding E3 — `offer-and-receipt` is structurally *server-side*, not *router-side*.** §4.5.1 specifies that the signer is typically the `payTo` address — i.e., the resource server signs receipts for its own resource. There is no slot in the extension for a *routing intermediary* attestation. The extension assumes one resource server per transaction. This is the load-bearing distinction:

What `offer-and-receipt` covers:
- Server's signed commitment to terms (offer)
- Server's signed confirmation of delivery (receipt)
- EIP-712 / JWS signature formats
- Optional on-chain transaction reference

What `offer-and-receipt` does NOT cover (TrustBench's open lane):
- Routing decisions across N alternatives
- `score_at_decision`, `alternatives_considered`, `selection_reason`
- `audit_url` (queryable replay endpoint at the routing intermediary)
- `block_number` (offer-receipt has optional `transaction` only)
- Latency / call metadata (request/response sizes, latency_ms)
- Pricing breakdown (provider price + intermediary fee)
- The intermediary's attestation distinct from the merchant's
- Cross-provider routing context (the merchant is fixed by definition under offer-and-receipt)

The two extensions are designed to *compose*: an offer-receipt artifact and a TrustBench-style routing-attestation artifact can travel together as the full proof trail. They cover different events, signed by different parties, attesting to different facts.

**Finding E4 — Three other extensions in the directory matter for context.**

- **`payment-identifier`** — adds an idempotency `id` field to PaymentPayload. Validates that idempotency-as-extension is the established x402 pattern. TrustBench's Phase 3 idempotency-key implementation is structurally aligned; this is not a competitive surprise.
- **`bazaar`** — resource discovery and cataloging, the protocol mechanism behind Coinbase Agentic Market. Resource servers declare endpoint specs (HTTP method or MCP tool name, input parameters, output format) and facilitators catalog them. *This is what TrustBench's `/rankings` competes with at the protocol level.* Worth reading carefully if/when a registry-aware extension proposal is on the table.
- **`http-message-signatures`** — RFC 9421-based agent identity. Different layer (identity, not receipt). Validates the EIP-712/JWS-and-now-also-RFC-9421 trio as the accepted x402 signature stack.

**Finding E5 — The extension architecture is `extensions["<key>"].info.<artifact>`.** Confirmed in `v2.go` (`Extensions map[string]interface{}` field on PaymentPayload, PaymentRequired, etc.) and in every extension spec read. Extensions do NOT modify core types; they add a namespaced section. Two consequences:

- **Correction to Addendum D.** The Addendum-D plan to "extend SettleResponse with optional audit_url field" was at the wrong layer. SettleResponse is a core type owned by the x402 specification document, not an extension surface. Extensions *don't* modify core types. The right move is a new extension under `specs/extensions/`, not a core-type field diff.
- **The right namespace is its own.** TrustBench's extension would be `extensions["routing-attestation"]` (or similar — naming is open) at peer level with `extensions["offer-receipt"]`, not nested inside it.

**Finding E6 — `specs/CONTRIBUTING.md` lists the spec process clearly.** Step 1: open a Discussion or Issue describing the problem and approach. Step 2: write the spec using the appropriate template. Step 3: PR it to the right directory. Note that `specs/CONTRIBUTING.md` only enumerates Schemes / Transports / Core Spec under "Specification Types" — `extensions/` is not yet listed, suggesting the extensions directory is newer than the CONTRIBUTING doc and that submitting an extension proposal puts TrustBench at the bleeding edge of the contribution model. Possibly an opportunity to influence the formal extension-contribution process by being an early example.

---

### Revised strategic framing for Path B

**Old framing (now wrong):** *"TrustBench is the open receipt + policy standard for non-custodial agent payments."* Implies first-mover on signed receipts.

**New framing (defensible):** *"TrustBench is the routing-and-evidence layer that composes with x402's `offer-and-receipt` extension. Where the merchant signs an offer-receipt artifact to commit to terms and confirm delivery, TrustBench (or any routing intermediary) signs a routing-attestation that records why this provider was selected from N alternatives, with full call metadata and a queryable audit URL. The two artifacts together form the complete proof trail for an agent transaction routed through an intermediary."*

This is narrower than the original Path B framing, but it's more truthful, more defensible, and uses the established extension architecture rather than competing with it. The slot is genuinely uncovered.

### Revised execution plan

Replaces the plan in Addendum D § "Updated execution sequencing for P6-M1."

1. **(~1 day) Open a Discussion or Issue against `x402-foundation/x402`** proposing a `routing-attestation` (or `intermediary-attestation`, or `routing-evidence`) extension. Reference `extension-offer-and-receipt.md` as the structural model and explain the gap: `offer-and-receipt` covers server-side commitment + delivery; the proposed extension covers router-side selection rationale and audit replay. Cite TrustBench's `receipt-spec-v1.md` as a candidate consumer/reference but frame the extension as generic — anyone routing across multiple providers can use it.

2. **(~1 weekend) Draft the spec** following `extension-offer-and-receipt.md`'s structural pattern:
   - Top-level shape `{format, payload, signature}` with `format ∈ {"eip712", "jws"}`. Reuse offer-receipt's format conventions exactly — same EIP-712 domain pattern (`chainId: 1`, `version: "1"`, distinct `name`), same JWS header requirements (`alg`, `kid`).
   - Payload fields: `version`, `network` (CAIP-2), `resourceUrl`, `selectedProvider` (or `payTo`), `score_at_decision`, `alternatives_considered`, `selection_reason`, `audit_url`, `block_number`, `issuedAt`, `payer`, `intermediary` (signer identity).
   - Placement: `extensions["routing-attestation"].info.attestation`, peer to `extensions["offer-receipt"]`.
   - Signed by the routing intermediary, not the merchant or the agent.

3. **Adopt EIP-712 + JWS for the public extension.** Drop Ed25519 + JCS as the canonical format for any spec-track contribution. Internally TrustBench can keep Ed25519/JCS as its own format, but the public extension should match the established x402 extension convention. This is a real engineering implication: the v1.0.0 receipt-spec stays as-is for TrustBench's internal use; the *extension* TrustBench proposes uses EIP-712/JWS.

4. **Reference `offer-and-receipt` explicitly** in the new extension's text. The composition story — *"when both extensions are present, the offer attests to merchant terms, the offer-receipt attests to merchant delivery, the routing-attestation attests to intermediary selection rationale; together they form the full audit trail"* — is the strongest framing because it positions TrustBench as additive to the Foundation's existing work rather than competing with it.

5. **(~Concurrent) Continue P6-N1 (docs.trustbench.io), P6-N2 (npm/PyPI verifiers), P6-N6 (Infopunks integration).** None of these change as a result of this addendum. The TrustBench-internal receipt-spec-v1 remains the documented format on TrustBench's docs site; the routing-attestation extension proposal becomes a parallel public-standards effort.

6. **(~Future) If the extension lands**, the TrustBench docs site references it ("TrustBench emits routing-attestation extension artifacts on every routed call, in addition to its internal Ed25519/JCS receipt format"). That's the natural compose-with-rather-than-replace positioning.

### What this means for the original verdict

The verdict (AP2 is complementary, not competing) holds — it's about AP2 specifically, not about the broader x402 extension landscape. AP2's Mandates are still in a different layer than TrustBench's lane.

What's new: at the *x402 extension* layer (which AP2 + x402 v0.2 Embedded Flow piggybacks on), the merchant-side signed-receipt slot is taken. TrustBench's lane at this layer is specifically *router-side attestation*, not receipts in general. Path B narrows from "spec for agent-payment receipts" to "router-side attestation extension that composes with the merchant-side offer-receipt extension." Same code, narrower public framing, more defensible position, sharper next-PR target.

The window is still open. The offer-and-receipt extension explicitly states (§2) that "the x402 ecosystem may introduce additional extensions over time" and that "implementers SHOULD design with forward compatibility in mind." A composable router-side extension is exactly what that paragraph invites.
