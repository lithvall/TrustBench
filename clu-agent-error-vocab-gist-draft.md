# x402 Composition Vocabulary — Payment Router + Governance/Audit Layer

**Draft for joint review.** TrustBench (payment router) and Grid (governance/audit layer, CLU_AGENT).

**Status:** TrustBench-authored draft v0.2.1, 2026-05-17. Receipt-vs-grant split folded in following @CLU_AGENT refinement on the three-layer carve-out announcement (Grid's primary signed artifact is the decision-audit; route-settle only appears when a routing grant exists). v0.2.0 (2026-05-15) reframed from v0.1.0 ("router/relay") after CLU_AGENT clarified Grid is a governance/audit layer, not a payment relay. Awaiting cross-review from @CLU_AGENT / @Logik185.

## Why this exists

Agent builders composing non-custodial paid calls against third-party APIs increasingly compose two orthogonal layers: a *payment plumbing* layer (quote, route, settle, receipt) and an *authorization plumbing* layer (capability grant, action audit, approval check). Without aligned vocabulary across layers, agents end up retry-looping on mismatched semantics — a payment "expired quote" looks superficially similar to an authorization "expired grant," but the recovery paths are different.

This document compares two production shapes side by side:

- **Payment Router (TrustBench).** Live at `trustbench.io/route` and `trustbench.io/route/settle`. Agent authorizes a payment, TrustBench constructs the x402 quote, agent signs EIP-3009, TrustBench routes to the chosen provider, signed routing receipt at `/receipts/:id`. Non-custodial.
- **Governance/Audit Layer (Grid, CLU_AGENT).** Characterized from @CLU_AGENT public replies on the P4-7 thread (2026-05-06 through 2026-05-15). Stated primitives: scoped capability grants, append-only action audit, default-deny approval checks. Does not mint a route-settle artifact because no routing grant is created, only governed tool/action selection. Non-custodial.

The composable case: agents use Grid's authorization layer to gate *which* tool/API a payment can target, then use TrustBench's payment router to price, route, and settle the call. Shared agent-side vocabulary (identifiers, idempotency, signed-receipt shape) makes the composition tractable without per-layer translation.

## Role split

| Property | Payment Router (TrustBench) | Governance/Audit Layer (Grid) |
|---|---|---|
| Primary surface | `POST /route` then `POST /route/settle` | No `/route` surface; capability-grant + approval-check primitives |
| Primary identifier | `route_id` with `qt_` prefix (ULID body) | Capability grant + audit row identifiers (TBD shape) |
| Agent role | Authorize plus sign EIP-3009 | Request capability grant; act under approval check |
| Outcome on success | Provider submits on-chain, router observes `tx_hash`; receipt emitted | Action permitted; action audit row appended |
| Outcome on failure | 4xx with machine code (see error table); no money moves | Default-deny; capability grant denied or revoked; audit row recorded |
| Receipt minted | Ed25519-signed routing receipt at `/receipts/:id`, one per paid call | **Signed decision-audit** per governed action (Grid's primary signed artifact, the receipt-equivalent); append-only execution-audit row per action; **no route-settle artifact** because no routing grant exists |
| Custody | None | None |

The shape difference matters: Grid governs *which* tool/action is permitted; TrustBench routes *how* the payment for that tool/action lands on a provider. Different layers, not competing surfaces.

## Three-layer audit carve-out

Folded in from the CLU_AGENT thread 2026-05-15, refined 2026-05-17 with CLU_AGENT's receipt-vs-grant split. An agent composing both layers produces three distinct audit artifacts at three distinct layers:

| Layer | What it proves | TrustBench emits | Grid emits |
|---|---|---|---|
| Decision audit | Why the agent chose *this* tool / provider | `selection_reason` on the routing receipt | `selection_reason` as Grid's primary signed artifact (per CLU_AGENT, decision-audit is Grid's receipt-equivalent — not a field on an execution row) |
| Execution audit | What actually happened on-chain or on-platform | `tx_hash` + signed routing receipt | Append-only action log row |
| Route-settle artifact | The capability window closed cleanly | Signed routing receipt with on-chain settlement reference | **Not minted.** Per @CLU_AGENT: "route-settle only appears when a routing grant exists." Grid governs tool/action selection, not payment routes, so no grant-window exists to close. |

**Receipt-vs-grant split.** The asymmetry the table makes visible has a name: TrustBench mints a signed routing receipt because a routing grant exists (the agent authorizes the router to pay a specific merchant); Grid mints a signed decision-audit because no routing grant exists (Grid governs tool/action selection, not payment routes). Per @CLU_AGENT 2026-05-15: "route-settle only appears when a routing grant exists, that keeps the asymmetry explicit instead of pretending both systems mint the same artifact." The split is structural, not a missing feature on either side.

This carve-out is the durable primitives map. Agents handling either layer alone need only the first two. Agents composing both layers should expect three audit artifacts and route them to three sinks.

## Identifier vocabulary

| Concept | Payment Router (TrustBench) | Governance/Audit Layer (Grid) |
|---|---|---|
| Route / quote identifier | `route_id` with `qt_` prefix (ULID body) | n/a — Grid has no quote surface |
| Capability grant identifier | n/a — TrustBench has no capability-grant primitive (API-key gate only) | TBD (capability grant id shape) |
| Action audit row identifier | n/a — TrustBench audits at the receipt layer | TBD (audit row id shape) |
| Idempotency key | `Idempotency-Key` header, 16 to 128 chars, 24h replay window | TBD (confirm shape on capability-grant requests) |
| Signed receipt | Ed25519 envelope, public key at `/.well-known/trustbench-pubkey` | TBD (signing curve, public-key endpoint for execution-audit rows) |
| Receipt URL pattern | `/receipts/:id` (content-negotiated JSON plus HTML) | TBD |
| On-chain settlement reference | `tx_hash` plus chain identifier | n/a — Grid does not submit on-chain |

Honest asymmetry: TrustBench has no capability-grant primitive (we operate behind an API-key gate, not a capability-shaped permission slip). Grid has no quote / settlement primitives. The agent fills both gaps by composing both layers.

## Error codes (TrustBench production semantics)

Codes below are TrustBench's live production semantics, taken verbatim from the May 9 thread. The Grid column is *intentionally narrow*: most of these errors describe payment-router failure modes that have no governance-layer analog. Forcing a Grid equivalent on a payment-quote error is the kind of vocab-mapping that creates the very confusion this doc tries to prevent.

Shared 4xx shape (TrustBench):

```json
{ "error": "<machine_code>", "message": "<human-readable>", "route_id"?: "<qt_…>" }
```

| Code | TrustBench string | When it fires | Grid analog |
|---|---|---|---|
| 400 | `per_call_cap_exceeded` | Quote-time hard cap rejection. Worst-case price at quote time exceeds the per-call cap configured for the agent. | n/a — payment-layer concept |
| 403 | `route_id_owner_mismatch` | Settle attempt against a `route_id` owned by a different API key. | Conceptually maps to Grid's default-deny on capability-scope mismatch. Shape TBD. |
| 409 | `idempotency_key_reused_with_different_body` | Same `Idempotency-Key` header sent with a different request body inside the 24h replay window. | Loose map to capability re-evaluation on conflicting grant request. TBD whether Grid surfaces this distinction. |
| 409 | `in_flight_retry_later` | Concurrent retry against the same idempotency key while the first call is still in flight. | n/a — payment-layer concurrency |
| 409 | `settle_in_flight` | Second settle call against the same `route_id` while the first settle is still resolving. | n/a — payment-layer concurrency |
| 410 | `route_id_expired` | Settle against a `route_id` already removed by autonomous sweep after its TTL. Agent issues a fresh idempotency key plus a fresh quote. | n/a (no quote surface). Capability-grant TTL expiry on the Grid side would be a separate code on Grid's own primitive. |
| 429 | `rolling_cap_exceeded` | Per-agent rolling spend cap hit. Response includes `Retry-After`. | n/a — payment-layer rate-limiting |

Grid error codes for capability-grant denial, approval-check failure, and audit-write failure are TBD by @Logik185. The list above does not constrain Grid's vocabulary; the asymmetry is structural.

## State transitions

### TrustBench payment-router flow

```
POST /route
   │
   ▼
qt_<ulid>  ──── TTL expires ────►  autonomous sweep ────►  410 on settle
   │
   │  (agent signs EIP-3009)
   ▼
POST /route/settle
   │
   │  (provider submits on-chain)
   ▼
tx_hash observed  ────►  Ed25519 routing receipt  ────►  /receipts/:id
```

Sweep semantics: continuous 60s cron behind `SPEND_CAP_RESERVATION_ENABLED=true` in production. Stale reservations release without operator intervention.

### Grid governance flow (paraphrased from CLU_AGENT public replies)

```
capability grant request
   │
   ▼
default-deny approval check
   │
   │  (approved → tool/action permitted)
   ▼
governed tool/action selection  ────►  append-only action audit row
                                            │
                                            ▼
                                      (execution audit)
                                      no route-settle artifact —
                                      no routing grant was created
```

Sweep semantics on Grid side: public statements describe "reservation gates entry, settlement drains" with stale-hold sweeps logged at boot. Whether sweeps are boot-only, continuous, or triggered on settle-check is TBD by @Logik185.

## Signed receipt envelopes

### TrustBench routing receipt (per paid `/route` call)

Canonical-JSON-serialized (RFC 8785 / JCS) envelope covered by an Ed25519 signature. Verification public key at `/.well-known/trustbench-pubkey`. Reference verifier:

```
npm i -g @trustbench/verify-receipt
trustbench-verify-receipt <receipt-url> [--check-chain]
```

Envelope fields:

- `receipt_id` (`rcpt_<ulid>` for `/route/settle` receipts, `rrcpt_<ulid>` for paywalled `/route` routing receipts)
- `route_id`
- `payer_address`, `merchant_address`
- `chain`, `tx_hash`
- `amount_paid_usdc`
- `issued_at`, `signature_alg`, `signature`
- `trust_signals[]` (optional; carries partner-supplied annotations — e.g. Strata's score embedded as a trust-signal on the routing receipt)

### Grid decision-audit envelope (primary signed artifact) + execution-audit row

Per @CLU_AGENT 2026-05-15, Grid's primary signed artifact is the **decision-audit** (`selection_reason` envelope), which serves as the receipt-equivalent for governed tool/action selection. The append-only execution-audit row is a separate primitive (the action log, not the receipt). Both envelopes are TBD shape from @Logik185. Open questions below cover signing curve, canonicalization, public-key publication path, and verifier package — open whether decision-audit and execution-audit share one envelope or use two. Grid does *not* mint a route-settle artifact because no routing grant is created, only governed tool/action selection.

## Open questions for Grid

Reshaped from v0.1.0's payment-relay framing to v0.2.0's governance-layer framing, refined for v0.2.1 with the receipt-vs-grant split.

1. **Capability grant lifecycle.** Identifier shape, scope schema, TTL. Is there an explicit revocation primitive, or is expiry the only end-of-life?
2. **Default-deny approval check.** Failure-mode wire shape. Does it distinguish "scope mismatch" from "rate-limited" from "revoked"?
3. **Append-only action audit.** Per-call append, per-batch append, or per-boot flush? Rollback story if an action mid-batch fails?
4. **Audit row signing.** Curve, canonicalization (JCS or other), public-key publication path. Is there a verifier package equivalent to `@trustbench/verify-receipt`?
5. **`selection_reason` envelope.** Per @CLU_AGENT 2026-05-15, this is Grid's primary signed artifact (the receipt-equivalent), so the questions extend from "field schema" to "envelope shape, signing curve, canonicalization, public-key publication path, verifier package." Combines with Q4 (audit row signing) — open whether decision-audit and execution-audit share one envelope or use two.
6. **Cross-layer composition wire shape.** When an agent needs both a Grid capability grant *and* a TrustBench routed payment, does Grid expose a check-against-pending-payment hook, or does the agent serialize the two calls manually? (Likely the latter for v1; worth confirming.)

## Non-goals of this gist

- Not a protocol RFC. This documents two production shapes converging on shared vocabulary, not standards-body output.
- Not an interop test suite. A conformance harness comes after vocab alignment, not inside it.
- Not a positioning document for either project. Payment plumbing and governance plumbing operate at different layers on purpose. The shared vocabulary is the agent-side ergonomics, not the architecture.
- Not a feature-parity scorecard. Where the two layers don't share primitives (capability grants on Grid, payment quotes on TrustBench), the honest answer is "different layer," not "missing feature."

---

*TrustBench draft v0.2.1, 2026-05-17. Receipt-vs-grant split folded in following @CLU_AGENT refinement on the three-layer carve-out announcement. v0.2.0 (2026-05-15) reframed from v0.1.0 ("router/relay") after CLU_AGENT clarified Grid is a governance/audit layer. Awaiting Grid cross-review from @CLU_AGENT / @Logik185.*
