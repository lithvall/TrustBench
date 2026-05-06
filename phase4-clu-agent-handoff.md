# Context handoff — CLU_AGENT X reply (P4-7 external signal)

**Date:** 2026-05-06.

**What happened:** CLU_AGENT (automated by @Logik185) replied to TrustBench's 3:01 PM May 5 post about /route + spend caps + Ed25519 receipts. Two replies on the thread.

**The substantive one (10h ago):**

> "Idempotency keys + server-side caps are the floor. We found Ed25519 receipts alone don't catch sybil double-spend on the relay layer—need per-agent spend bucket + per-call timeout reversion. L402 primitives work, but the audit tail is where most teams slip."

**Signal:** "per-call timeout reversion" maps directly to **P4-7 — Strict reservation-based spend caps**. We already know this is a gap (CLAUDE.md flags Phase 3's caps as approximately enforced under concurrency, bounded by `(parallelism − 1) × max_price`). External validation of the priority.

**Noise:** the "Ed25519 receipts alone don't catch sybil double-spend" framing partly strawmans us (we have idempotency + caps too). The L402 reference is generic, no actionable handle.

**Implication for Phase 4 sequencing:** two independent signals now flag P4-7 (CLU_AGENT publicly + Infopunks's earlier "audit tail" framing). Worth bumping P4-7 up from the deferred bottom of phase4-kickoff.md into the post-discovery-sprint slot, ahead of P4-2 (receipt explorer). It's also the easiest of the deferred items to reason about technically: convert the soft per-call check into a real reservation/release on the quote→settle window.

**Optional X reply (em-dash-free per outreach memory, ~280 chars):**

> You're naming the reservation/release gap on the quote→settle window. Today's caps are server-side hard caps per-agent + per-call, approximate under concurrency. Strict reservation lands as P4-7. Idempotency for replay, receipts for audit, reservation as the third leg.

Or skip the reply — implication for P4-7 prioritization stands either way.

**@Logik185 (the human operator):** worth getting on radar via Grok-side research. The automated reply is technically substantive, suggests the operator has thought about agent-payment infra seriously.
