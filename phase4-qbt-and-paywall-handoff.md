# Phase 4 — QBT-Labs/x402 read + x402-paywall design handoff

**Created 2026-05-08. Read this in a fresh chat picking up either work item.**

This document hands off two sequential work items in one place: (a) a focused 20-minute read of `github.com/QBT-Labs/x402` so we can speak intelligently to Aggelos's framing, and (b) the design pass for x402-paywalled API revenue on TrustBench's existing endpoints.

---

## Read-first order for a fresh Claude

1. `CLAUDE.md` — project rules, Phase 4 framing, high-risk-surface checklist.
2. `partnership-day-record-2026-05-07.md` — strategic shift to component-in-stack; the entry-point doc CLAUDE.md points to first.
3. This file (`phase4-qbt-and-paywall-handoff.md`) — the work briefs below.
4. `phase4-kickoff.md` — engineering state for Phase 4 generally; agent-discovery surface stack section is most relevant for paywall.
5. Memory pointers (in `MEMORY.md`):
   - `project_npm_verifier_shipped_2026_05_08.md` — npm verifier context.
   - `project_strata_partnership_inbound_2026_05_07.md` — Strata pricing approved 2026-05-08 ($0.0005 read / $0.002 verify / $0.005 score-provider / $0.01 audit-replay / $0.50–$2.00 compliance-export). This is the pricing anchor for the paywall design.
   - `project_x402_ecosystem_state.md` — ecosystem maturity context.
   - `feedback_no_em_dashes_outreach.md` — outreach style rule (applies to anything customer-facing emitted from the paywall too: error messages, free-tier signaling copy).

Do **not** read `phase6-reassessment-2026-05-07.md` or earlier strategy docs first — they predate the partnership-day shift and will mislead.

---

## Work item 1 — QBT-Labs/x402 read (≈20 minutes)

**Repo:** https://github.com/QBT-Labs/x402

**Why we're reading it.** Aggelos Kappos (Reddit `AngeloKappos`, owner of the QBT-Labs/x402 fork) replied to the TrustBench Reddit thread on 2026-05-08 with a production checklist (idempotency + policy + retries) that maps 1:1 to TrustBench's `/route` flow. He said *"we've been working on the buyer-side policy/signer layer"* and linked the repo. The TrustBench reply closed with *"Buyer-side policy/signer + non-custodial routing/attestation feels like a compose, not a compete. Happy to compare notes if useful."* Whether that compose framing is real or wishful depends on what's actually in his repo.

**The Reddit thread context.**
- Aggelos's full comment: production checklist (quote validation / spend limits per task-session-day / idempotency keys / provider failover / receipt logs tied to tool result / stop rules on price-or-behavior change), wallet-and-signature is the easy part, hard part is duplicate spend + failed calls + auditability, on 1-3% spread depends on call size (tiny calls maybe acceptable, higher-frequency or trading flows prefer flat or capped).
- TrustBench reply mapped 1:1 against his checklist + acknowledged Phase 4 gaps (per-task/per-session caps not yet shipped) + flat-per-tx as default + linked first paid receipt + `npm install @trustbench/verify-receipt`.

**What to look for in the QBT-Labs/x402 fork:**
1. **Architectural shape.** Is it a fork of the canonical x402 spec/SDK with extensions, or a fresh implementation? What's the relationship to `@coinbase/x402`?
2. **Where the buyer-side policy/signer logic actually lives.** Is it a wallet integration? Middleware? A separate service? Code path: where does an outbound x402 payment get policy-checked + signed in their model?
3. **What's already implemented vs aspirational.** README claims often outrun the code. Look at last commit dates, test coverage, open issues.
4. **Overlap with TrustBench's `/route`.** Specifically: does QBT route across providers, or do they sign-and-send to a fixed provider? If the latter, the compose framing is real (they're a wallet/signer, we're a router). If the former, we're partial competitors.
5. **Their idempotency model.** Aggelos cares about this; how do they implement it? Is it client-side dedup, or do they require merchant cooperation?
6. **Their stop-rules implementation.** He listed "stop rules when pricing or response behavior changes" as a checklist item. Look for kill-switch / circuit-breaker / quote-expiry patterns.
7. **Org signal.** Who's in the GitHub org? How active? What other repos? Are they a team of one (like TrustBench) or 3-5 people?

**Output of the read.** A short note appended to `competitive-landscape.md` under a `## QBT-Labs/x402 (read 2026-05-XX)` section: 5-10 bullets on what they actually do, where compose vs compete sits, and whether DM escalation is appropriate after Aggelos replies. If compose is real: draft 1-2 specific compose hooks (e.g., "their signer + our router" or "their stop-rules + our reservation caps"). If they're closer to a competitor: note the specific overlap surface and update the framing.

**Constraint.** Don't speculate beyond what the repo shows. If commits stopped in February or it's an empty scaffold, that changes the story.

---

## Work item 2 — x402-paywall implementation design

**Status:** Deferred from 2026-05-08 with explicit "design before code" sequencing decision. This is a high-risk surface (revenue-bearing, public, cross-network) and deserves a proper architecture pass before any code lands.

**The committed strategic premise** (from `partnership-day-record-2026-05-07.md`): TrustBench's revenue model is *x402-native paywalled API endpoints, no subscriptions*. We become a paying customer of our own protocol. Solo-founder-fit because there's no sales motion, no billing infrastructure, no SaaS dashboard. The pricing is partner-validated via Strata's $29/mo/10K-call shape implying ~$0.003/call as an industry norm, and Strata-anchored tier list approved 2026-05-08 ($0.0005 read / $0.002 verify / $0.005 score-provider / $0.01 audit-replay / $0.50–$2.00 compliance-export).

**The design questions that must be answered before code:**

### Q1. Which endpoints get paywalled first?
TrustBench currently exposes (Phase 4 state):
- `/health` — keep free (monitoring norm).
- `/rankings` — public read; **decision pending**: free, freemium, or paywalled?
- `/route` — the hot endpoint; **revenue-bearing candidate**.
- `/receipts/:id` — public read; **decision pending**: free for 1 receipt-lookup per IP per minute, paywalled for bulk?
- `/.well-known/trustbench-pubkey` + `/.well-known/trustbench.json` — must stay free (discovery norm).
- `/skill.md` + `/llms.txt` — must stay free (LLM-discoverability).
- `/mcp/tools` — **decision pending**.
- `/analytics` — public dashboard; **decision pending**.

The candidates per Strata pricing:
- "read" $0.0005 = `/rankings` queries beyond a free-tier ceiling.
- "verify" $0.002 = `/receipts/:id` lookup beyond ceiling.
- "score-provider" $0.005 = `/route` per call.
- "audit-replay" $0.01 = `/receipts/:id?replay=true` (full provider-call audit + signed proof).
- "compliance-export" $0.50–$2.00 = paginated CSV/JSON export for accounting/legal.

The principle: never paywall what the ecosystem has normalized as free (well-knowns, skill.md, basic discovery). Paywall the differentiated work (routing decisions, signed verification, audit replay, compliance exports).

### Q2. Free-tier signaling — what's the wire shape?
Two competing patterns:
- **Quota-headers pattern** (GitHub, Stripe): `X-RateLimit-Limit / Remaining / Reset`. Free up to N, then 402.
- **Per-call pricing pattern** (x402-native): every call returns 402 by default unless the caller pays. No "free tier" exists, just sub-cent pricing that's free in practice for low-volume agents.

Recommendation seed (not locked): Hybrid. Free-tier-by-IP for read endpoints (rankings, receipt lookup, well-knowns); 402 by default for `/route` and audit-replay. Free-tier headers communicated via standard `X-RateLimit-*`. Paid endpoints expose `402 Payment Required` with a Coinbase-CDP-format payment requirement.

### Q3. Wire shape — TrustBench as x402 server vs x402 client
Today TrustBench is an x402 *client* (we route agent-signed payments to merchants via `/route`). The paywall makes us an x402 *server* (we emit `402 Payment Required`, accept `X-PAYMENT` headers, verify via Coinbase facilitator, return data + `X-PAYMENT-RESPONSE`).

This is a mode change: same TS process now plays both roles depending on which endpoint hit. Architectural questions:
- Single server with route-level x402 middleware? Or separate paid-API service?
- Payment receiver wallet: same wallet that funds `/route` payments? Or new dedicated revenue wallet?
- Settlement: real-time on-chain on every paid call? Or batch?
- Ed25519 signing of paid responses: are paid `/rankings` queries signed receipts (same envelope as router receipts) or unsigned JSON?

### Q4. Idempotency on the server side
Same problem Aggelos flagged for buyers, mirrored: if an agent retries a `/route` call after partial timeout, do we charge twice? Idempotency-key handling on the server is a known TrustBench-router pattern (Phase 3); apply the same pattern to the paywall.

### Q5. Free-tier abuse prevention
If `/rankings` is free up to N, what's N? IP-based? Token-based? Why won't an agent farm rotate IPs?

### Q6. Discoverability
The paid endpoints must be discoverable by agent crawlers without breaking the free skill.md / llms.txt / well-known surfaces. Paid endpoints in skill.md as "paid: true" annotations? Separate `/paid-skill.md`?

### Q7. Pricing display + fairness
Strata-anchored tiers above are approved-illustrative, not contractually committed. The design pass should treat them as anchors but explicitly call out: where might these be wrong? E.g., is $0.005 per `/route` call too high for an agent making 10K calls/day? Too low?

### Q8. Ed25519 signing scope
Today TrustBench Ed25519-signs receipts (router-attested). Paid `/rankings` responses: should they be signed too? Argument for: agents that pay for ranking data want a signature so they can later audit "we made decision X based on TrustBench-signed snapshot Y." Argument against: extra CPU per call, extra bytes in response, complicates the wire shape.

### Q9. Refunds / disputes
Coinbase facilitator settles on-chain. If a paid `/rankings` call returns garbage or 5xx after the payment settles, what's the refund path? Off-chain credit? On-chain refund tx? Out-of-scope for v0.1.0 of paywall, but the design pass should at least document the deferral.

### Q10. Revenue tracking + tax surface
Even at sub-cent per call, accumulated paid calls become reportable revenue. Where does the data live? Probes table? Separate `paid_requests` table? Tax-reporting export aligns with the "compliance-export" pricing tier — eat your own dogfood?

---

## Constraints + non-negotiables

- **Non-custodial throughout.** Even though we're now an x402 server, settlement still goes through Coinbase facilitator — TrustBench wallet receives, doesn't custody on behalf of others.
- **Honest measurement framing.** Paid `/rankings` data must come with the same liveness-check honesty as free; paywalling does not upgrade what we measure. Methodology page stays.
- **No subscription tier.** Per-call only. Confirmed 2026-05-08.
- **No free tier in the *commercial* relationship with partners** (decided in Strata sketch 2026-05-08). But the *public* free-tier-by-IP for `/rankings` can exist as a discovery surface.
- **Ed25519 + JCS** stays. EIP-712/JWS only enters if a Foundation-track extension proposal lands.
- **Solo-founder constraint.** Whatever ships must run unattended. No 24/7 monitoring, no manual reconciliation, no support inbox.

---

## Recommended sequencing (suggestion, not locked)

1. ~3-5 day design pass: write `phase4-paywall-design.md` answering Q1-Q10 with decisions + rationale + open questions.
2. Review pass: re-read against `partnership-day-record-2026-05-07.md` and Strata pricing memory to catch contradictions.
3. Smallest-shippable-slice scope: pick 1 endpoint (likely `/route` since it's the highest-leverage and most differentiated) and ship the paywall there. Free-tier reads stay free for v0.1.0. Iterate.
4. After v0.1.0 ships, instrument actual paid-call volume for 7 days before designing v0.2.0 (pricing fairness check).

---

## Outputs expected from the new chat

- `competitive-landscape.md` updated with QBT-Labs/x402 read findings.
- Decision logged in `decisions.md`: "compose vs compete" verdict on QBT-Labs.
- New file `phase4-paywall-design.md` with answers to Q1-Q10 above.
- Updated `MEMORY.md` pointer to the design doc.
- Decision logged in `decisions.md` for any non-trivial paywall choice.

If anything in this handoff disagrees with newer reality (memory updates, partner replies, code already shipped), trust the newer reality and update this doc rather than acting on stale guidance.
