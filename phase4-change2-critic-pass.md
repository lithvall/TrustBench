## Critic-pass: Phase 4 Change 2 — Embed trust_signals in signed routing receipt

**Subject:** Diff to `src/paywall-handler.ts` (parse X-Trust-Signals + embed in routing receipt) + `src/routing-receipt-html.ts` (render the new section) + `src/bazaar-extension.ts` (example schema) + `scripts/trust-signals-receipt-identity-smoke.ts` (byte-identity safety smoke). Date: 2026-05-13.

**Why this gets a Critic pass:** the diff touches the signed routing receipt envelope returned on every paywall settle, which is the public artifact Strata's reference integration will publish. The Ed25519 signature is computed over the JCS-canonical bytes of the receipt body; any drift in conditional spread, key order, or envelope shape produces signature-verifier failures on the Strata-aware downstream side. CLAUDE.md High-risk-surface rules apply.

---

### Three rejection reasons a hostile reviewer would give

**R1. "Change 1 is structurally orthogonal to the Strata flow. The withIdempotency stash never runs on the paywall path. The handoff's c.get('trust_signals') is dead code for the actual use case. You're about to build Change 2 against an assumption that doesn't hold in production."** Real concern, surfaced during pre-work. Middleware order on POST /route is `paywallGate → requireAgent → withIdempotency → ...`. paywallGate branches on X-PAYMENT presence: if present, it calls `handlePaidRoute()` and does NOT call `next()`. withIdempotency only runs on the Bearer chain. Strata's reference §10.2 uses X-PAYMENT (paywall path) → withIdempotency is bypassed → the stash never happens → c.get('trust_signals') returns undefined in any downstream receipt construction.

This means Change 2 cannot be implemented as the handoff describes (read from Hono context). The implementation MUST parse X-Trust-Signals directly in `handlePaidRoute`, replicating the validation logic from Change 1 but at a different mount point. That expands the Change 2 diff scope to include a second parse site, a second flag-gate, and a second bodyHash-inclusion contract.

Mitigation: this Critic pass surfaces it BEFORE code is written. Two scope options below; pick one with Johan before proceeding.

**R2. "The bodyHash in paywall-handler is computed from `c.req.text() → JSON.parse → body` — the raw body only. Including X-Trust-Signals in bodyHash for replay-409 means a future client that wants to retry without the header (e.g. degraded fallback after Strata is down) gets 409 from their own retry. The semantics 'replay returns original signals' from §10.4.5(3) sound right but break the retry-without-signals UX."** Plausible but accepted-and-mitigated. The Strata sketch §10.4.5(1) explicitly commits: "A replay with the same idempotency key but different (or absent) signals returns 409 Conflict." This is the locked contract; the agent is expected to use a fresh idempotency key if they want to retry without the header. Document the behavior in a clear error detail field so the client knows what happened: "idempotency_key_reused_with_different_trust_signals" rather than the generic "different body" message.

**R3. "Embedding partner-supplied bytes verbatim in a TrustBench-signed receipt means TrustBench is signing data it didn't verify. A hostile agent could spoof Strata's payload entirely. Worse, the signature attestation is now ambiguous — does it mean 'TrustBench observed these bytes' or 'these bytes are truthful'?"** Same concern raised in Change 1's Critic pass, same answer: the signature attests "TrustBench observed these bytes," not "these bytes are truthful." A Strata-aware downstream verifier knows to re-fetch via the `ref` URL. Strata's 2026-05-12 reply ("Downstream verifiers get cryptographic proof that TrustBench observed that specific Strata response at captured_at, which is stronger than a reference URL alone") explicitly endorses this semantic. Strengthen the receipt-render copy to make this explicit: "Trust signals embedded verbatim; signature attests observation, not truth — verify via `ref` URL."

---

### Strongest counter-thesis

**Don't put trust_signals in the receipt body at all. Hold it side-channel: store the parsed signals against the receipt_id in a separate `receipt_trust_signals` table, expose `/receipts/:id/trust-signals` as a content-negotiated read endpoint, and let downstream verifiers fetch it on demand.**

This has real force for three reasons:

1. The receipt body stays smaller and the Ed25519 signature surface stays narrow — fewer bytes to canonicalize, faster verify.
2. Future field additions to the locked §3 shape don't require receipt-envelope migrations. We can add fields to the side-channel without versioning the receipt schema.
3. A future Strata schema-bump that adds a moderately-large field (signed payload bytes, multi-vendor verifier chain) doesn't bloat every receipt unnecessarily.

Why I'll resist it anyway: Strata's 2026-05-12 reply explicitly endorsed the Ed25519-wraps-annotation pattern as the differentiator vs. a reference URL alone. The whole point of the trust-layer moat is that the signature proves TrustBench observed *exactly these bytes* — not just "TrustBench observed something at this URL." A side-channel design loses that property and makes us indistinguishable from x402route.vercel.app, which already does "routing without signed receipts." The partner-endorsed shape is the embedded one; the side-channel is over-engineering for our differentiation.

Verdict on this counter-thesis: rejected, but R3 from the rejection-reasons list deserves explicit copy on the rendered receipt to disambiguate the semantic.

---

### Named wedge competitor

**x402route.vercel.app** (same competitor as Change 1). If they wanted to support Strata's pattern, they'd just stash the signals in a non-signed sidecar JSON file at a public URL. Their integration ships in a day. Their differentiation from ours: signature coverage of the trust signals is the moat — the very thing we're building. Strip the Ed25519 coverage and there's no reason to use TrustBench over x402route except the registry inventory, which is also commodifiable.

This is exactly the wedge case where the JCS + Ed25519 + on-chain-anchor stack matters. The Critic concern: are we sure Strata's downstream consumers will exercise the signature property? If they treat the receipt body as opaque JSON and re-fetch from Strata's `ref` URL every time, the cryptographic binding is dormant. Mitigation: same as Change 1 — Strata's 2026-05-12 reply ("Downstream verifiers get cryptographic proof... which is stronger than a reference URL alone") explicitly names the signature property as the differentiator. Partner-endorsed, not speculative.

---

### Hidden assumption that, if wrong, breaks the whole thesis

**That the paywall path is where Strata's reference will actually integrate.**

The handoff says Change 2 targets "/route settle." Re-reading §10.2 confirms the Strata reference uses POST /route with X-PAYMENT — the paywall path. But there are three other paths that build receipts in this codebase:

1. `route-handlers.ts` settleHandler → issueReceipt (Phase 3 path, `/route/settle`, Bearer auth) — produces a different envelope (settlement/pricing/audit blocks).
2. `paywall-handler.ts` handlePaidRoute (Phase 4 path, `/route` paywall) — produces RoutingReceipt (paid/routing/call blocks).
3. Future v0.2.0 paywall path on `/route/settle` that doesn't exist yet (designed in `phase4-paywall-design.md` § "v0.2.0 deferred").

If Strata's reference implementation discovers they prefer the Phase 3 path (Bearer-auth quote + signed full-envelope receipt) instead of the v0.1.0 paywall path, we have to do all of Change 2 again on a different surface. Cost: ~3 hours of rework, no signature-key churn, but a second envelope migration.

Mitigation: the §10.2 flow is explicit about X-PAYMENT (step 6 says "Signs the routing fee X-PAYMENT and POSTs back"). Strata's reference is written by Johan, not by Strata — we control the reference and can lock the paywall path before sending. Risk is low.

---

### Kill criterion

**If Strata's reference-agent implementation surfaces that the trust_signals field is being read but the receipt's Ed25519 signature is NOT being verified by downstream consumers** within 4 weeks of the public reference shipping (target window 2026-05-19 + 4 weeks = ~2026-06-16), the embed-in-signed-body design is over-engineering. Switch to a side-channel reference (receipt holds `trust_signals_url + trust_signals_hash`, signals served separately at `/receipts/:id/trust-signals`). Cost: ~6 hours of rework. The Ed25519 over the receipt body still has value for the routing-decision attestation; we'd just move the partner-data attestation off-envelope.

**If the byte-identity smoke fails** — i.e., a deployed version of Change 2 produces a different canonical receipt body for the no-signals case than the pre-Change-2 baseline — roll back immediately by setting `TRUSTBENCH_TRUST_SIGNALS_ENABLED=false` and reverting the diff. Same kill-switch reversibility as Change 1.

**If the receipt-render HTML page surfaces sensitive bytes accidentally** — e.g., we render `trust_signals[0].ref` without URL-escaping and a hostile signal carries an XSS payload — the bug is medium-severity (the page is on a public domain, agents read it). Mitigation: all render output goes through the existing `escapeHtml` helper in site-chrome.ts. Audit in the diff that every `r.trust_signals[i].*` interpolation passes through `escapeHtml`.

---

### Verdict

**Acceptable WITH a scope decision required from Johan.** The three rejection reasons are: (R1) flag-blocking — scope must expand to include parse-in-paywall-handler — Johan to confirm; (R2) accepted-and-mitigated — clearer error detail copy; (R3) accepted-as-known-issue — clearer render copy. The counter-thesis (side-channel) is the right v2.0 direction if downstream consumers don't exercise the signature property; for v0.1.0 the partner-endorsed embedded shape is the right ship.

**Concrete pre-implementation question for Johan (scope decision):**

The handoff §1 says "read from `c.get('trust_signals')` and embed in the receipt." That works ONLY for the Bearer chain because Change 1's stash is in `withIdempotency`. The Strata reference flow (§10.2) uses the paywall path (X-PAYMENT branch of `paywallGate`), which bypasses `withIdempotency`. Two options:

- **Option A — Paywall path only (recommended for the Strata reference):** Parse X-Trust-Signals directly in `handlePaidRoute` (paywall-handler.ts), gated by the same `TRUSTBENCH_TRUST_SIGNALS_ENABLED` flag. Include in bodyHash for replay-409. Embed in `RoutingReceipt.trust_signals[]`. Phase 3 settle path (route-handlers.ts → issueReceipt) is NOT touched in this change. Scope: 2-3 hours.
- **Option B — Paywall path + Phase 3 settle path:** Same as A, plus extend `IssueReceiptInput` with optional `trust_signals`, route the parsed object from `withIdempotency` through Redis/PG so it survives across `/route` quote → `/route/settle` calls. Closes the envelope-design symmetry. Scope: 5-6 hours. Adds complexity that isn't on the Strata critical path.

**Option A is the right scope for the §10 Strata deliverable.** Option B is correct-but-deferable to a follow-up change once Strata's flow is paying.

Three concrete pre-merge actions on top of the scope decision:

1. **Clarify the error detail copy on idempotency conflict** so a client retrying without signals gets `idempotency_key_reused_with_different_trust_signals` (or similar) instead of the generic "different body" 409. Small string change in `paywall-handler.ts` `checkIdempotencyReplay`.

2. **Audit the HTML render for XSS** — every `r.trust_signals[i].*` interpolation goes through `escapeHtml`. Test with a payload containing `<script>` in a signal field.

3. **Add a "Signature attests observation, not truth" subline** to the rendered Trust signals section so a partner reading the public receipt doesn't over-interpret the cryptographic binding.

After those four (scope decision + three small actions): ship Change 2 to a branch, run `tsc --noEmit`, run the byte-identity smoke, validate against the existing paywall-smoke with flag still OFF (S1/S4 only proves 402-envelope shape unchanged), merge when local validation passes.

The TRUSTBENCH_TRUST_SIGNALS_ENABLED flag stays OFF in production until BOTH Change 1's coverage gap is closed (i.e., paywall-handler.ts parses the header) AND Change 2 is live and smoke-verified. Flipping the flag is the §7 of the handoff, unchanged.

---

### Note for the lessons.md callback later

Three patterns from this Critic pass worth banking:

1. **Middleware-order assumption verification.** Change 1's design assumed `withIdempotency` runs on the paywall path; the handoff inherited this assumption. The pre-work read of `paywallGate` middleware revealed the assumption is false. Generic pattern: when one change writes to a Hono context and a later change reads from it, validate that both code paths actually execute in the same middleware chain. The right move is to look at the `app.post('/route', ...)` registration line before assuming any cross-handler state-passing works.

2. **The handoff's `c.get/c.set` indirection is a smell.** When the producer and consumer of a context value are on different middleware chains, side-channel storage (DB, Redis) or parse-twice (cheaper for pure helpers) is correct. The `as never` cast hides the type-system signal that would have caught this earlier — the Variables-interface refactor (already structural-debt at 2x in the codebase) becomes a 3x trigger after this finding.

3. **High-risk-surface Critic passes that surface scope changes BEFORE code.** The point of the Critic discipline is exactly this kind of finding. The temptation to "just implement what the handoff says" would have produced dead code that compiles green, ships, and silently fails to do anything for Strata's actual flow.
