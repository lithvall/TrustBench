# ZK PDF Analysis — Read Through TrustBench's Actual Position

**Created:** 2026-05-09. **Author:** Claude session, after a full-codebase audit (README, `TrustBench-strategy.md`, `partnership-day-record-2026-05-07.md`, `phase4-kickoff.md`, `phase4-qbt-and-paywall-handoff.md`, `phase4-paywall-design.md`, `decisions.md`, `COMPETITIVE-LANDSCAPE.md`, `receipt-spec-v1.md`, `src/route-handlers.ts`, `src/index.ts`, `npm/verify-receipt`, `lessons.md` recent entries, `phase5-design-seeds.md`).

**Note on missing files:** the task brief mentioned `phase6-beyond-strategy.md`, `x-content-strategy.md`, and `unexplored-ideas.md` as freshly-written today. None of those exist in this worktree — only `phase5-design-seeds.md` is present. Either they were written elsewhere, or the prompt is loosely citing files that didn't land. The analysis below is grounded in what's actually checked into this branch as of the 616fc38 commit.

---

## Part 1 — Where TrustBench actually is (compressed)

### What's live and shipping

- **Public registry** of x402 endpoints across Base (~650 services from Agentic.market) and Solana (~150 from Heurist Mesh).
- **Nightly liveness probe** with honestly-framed methodology (HEAD requests, 3 samples, 401/402/403/404/405/429 treated as alive).
- **Authenticated `POST /route` + `POST /route/settle`** with API-key auth (argon2id), Phase-2-validated four primitives all live: idempotency keys, hard spend caps (strict reservation P4-7), Ed25519-signed receipts, queryable audit at `GET /receipts/:id`.
- **Real first paid x402 receipt** against Infopunks (`rcpt_01KQY7C44GAPSXZPFQYRZ1D10C`, settled on Base 2026-05-06 — verifies SIGNATURE VALID + ON-CHAIN VERIFIED with no overrides).
- **`@trustbench/verify-receipt` v0.1.0** published to npm (2026-05-08). Standalone third-party verifier, optional viem peer dep for chain-anchored verification, no TrustBench API calls beyond fetching the published public key.
- **Discovery surfaces**: `/skill.md`, `/llms.txt`, `/.well-known/trustbench.json`, `/.well-known/trustbench-pubkey`, `/methodology`.
- **Content-negotiated** `/rankings` and `/receipts/:id` (HTML for browsers, JSON for programmatic clients).

### Strategic frame — committed 2026-05-07, definitive

TrustBench is a **component in a multi-partner stack**, not a standalone product. Three independent partnership inbounds (Infopunks, Strata, CLU_AGENT/Grid) within 48 hours converged on the same architectural pattern: pre-call trust scoring + post-call receipt verification + audit replay. Revenue model: **x402-native paywalled API endpoints**, no subscriptions, no contracts, no sales motion. Strata-anchored prices (approved 2026-05-08): $0.0005 read / $0.002 verify / $0.005 score-provider / $0.01 audit-replay / $0.50–$2.00 compliance-export.

### Hard constraints (non-negotiable)

- **Non-custodial throughout.** TrustBench never holds funds. Provider payments are agent→provider direct via EIP-3009 transferWithAuthorization the agent signs.
- **Honest measurement framing** in every public surface.
- **No subscription tier.** Per-call x402 only.
- **Ed25519 + JCS canonical** for all signing. EIP-712/JWS reserved for any future Foundation-track extension (deferred).
- **Solo-founder maintainability.** Whatever ships must run unattended. No 24/7 monitoring, no manual reconciliation.
- **Pay-to-list, never pay-to-rank.**
- **No new infra without a partner pulling.** Foundation-track standards work explicitly deferred until production traction makes it pull-shaped, not push-shaped.

### Receipt envelope (locked, signed, partner-validated)

```
receipt: {version, receipt_id (ULID), issued_at, issuer,
  call: {agent_id, capability, idempotency_key, provider_id, provider_url,
         request_hash, response_hash, latency_ms, ...sizes},
  settlement: {chain, tx_hash, block_number, payer_address, payee_address,
               amount_atomic, currency, decimals, settled_at},
  pricing: {provider_price_atomic, trustbench_fee_atomic, total_paid_atomic, fee_model},
  routing: {score_at_decision, alternatives_considered (count), selection_reason},
  audit: {audit_url}
}
signature: {alg: ed25519, public_key_url, key_id, value (detached over JCS bytes)}
```

The `routing.alternatives_considered` field deliberately stores a *count*, not a list. Receipt-spec-v1 Open Question #2 to InfopunksHQ explicitly flagged "Merkle root over alternatives" as a possible upgrade if downstream verifiers want commitment without disclosure. **This is the only place in the receipt envelope where ZK is even a latent design seed.** It has not been requested by any partner.

### Verified-saturated competitive lane (snapshot 2026-05-08)

PaySentry (open-source, Ed25519, multi-protocol, 79 tests). PEAC Protocol (open-source signed receipts, Ed25519 JWS). Probe (free 44-check audits). x402station (~35K endpoints, $1 USDC machine-paid Verified Badge). xpay.sh (Smart Proxy + paywall-as-a-service + MCP monetization). Sentinel/Valeo (Solana-side compliance). x402scan (Coinbase-endorsed). The lane is dense; the moat is *compose with these, don't compete*.

### What's in flight (Phase 4b)

- `/route` x402 paywall v0.1.0 (designed in `phase4-paywall-design.md`, ready for code).
- `/explorer` public receipt explorer.
- Solana routing (registry visibility unblocked 2026-05-08; settlement still Base-only).
- Formal Infopunks integration (async reply pending).

This is the lens through which the PDF's seven ideas have to be evaluated. The PDF was written without seeing any of this.

---

## Part 2 — The seven ZK ideas, scored against TrustBench reality

For each: **(1)** standalone viability, **(2)** TrustBench-extension viability, **(3)** receipt-spec thesis impact, **(4)** territorial conflict, **(5)** head start from existing infra.

### Idea 1 — Proof-of-spend-policy verifier as a service

**PDF verdict:** Avoid as standalone, possibly viable as feature of larger suite.

**1. Standalone:** Concur with PDF. AWS Bedrock AgentCore Payments (announced 2026-05-07, the same partnership-day window that reframed TrustBench) shipped policy-based spending controls plaintext. Polygon Agent CLI ships session wallets with per-token allowances. cloakfi advertises signed capability manifests. The lane is structurally closed — the buyer has free options that don't require ZK ceremony.

**2. TrustBench extension:** Weak fit. TrustBench already enforces hard spend caps server-side at `requireWithinSpendCap` middleware with strict reservation (P4-7) and a daily reconciliation cron. The cap is *trusted-because-TrustBench-enforces-it*, not cryptographically proven. Adding ZK proof "this payment satisfies the controller's policy" doesn't strengthen the trust chain because the controller and the enforcer are both TrustBench — the policy is configured server-side. The only buyer who gains from ZK is one whose *policy itself* is sensitive (e.g., B2B agents with confidential vendor preferences). That's a narrow audience, and not the addressable persona TrustBench just committed to (multi-cloud, non-Coinbase-aligned agents).

**3. Receipt thesis:** Slight strengthening if added — receipt could carry a `policy_proof` annotation. But it's a feature add, not a moat shift. The current receipt's `pricing` block already discloses what was paid; adding ZK over a private policy is downstream of demand we haven't seen yet.

**4. Conflict:** None. Complements existing infra.

**5. Head start:** Receipt envelope, agent_id namespacing, spend-cap reservation infra. But none of those make the ZK build meaningfully shorter — the work is in the Circom circuit + verifier glue, not the surrounding HTTP machinery.

**Verdict for Johan:** Don't build standalone. As a TrustBench bolt-on, queue as a Phase 5 design seed *if* a partner explicitly asks for confidential-policy receipts. No partner has.

---

### Idea 2 — Private usage-metering for paid APIs

**PDF verdict:** Solid wedge but slow burn, 12-18 months out for market. SP1's sweet spot.

**1. Standalone:** PDF is right that the lane is mostly empty. Stakefy has cleartext receipt analytics; nobody offers cryptographic-privacy aggregation between buyer and seller. SP1 amortizes correctly across thousands of receipts.

**2. TrustBench extension:** **This is the best fit on the list.** TrustBench is *already* the natural aggregation point. Every `/route` call produces a receipt; every paid call (under v0.1.0 paywall) lands a `paid_requests` row (schema designed in `phase4-paywall-design.md` Q10). Both have all the SP1 inputs: `agent_id`, `provider_id`, `amount_atomic`, `settled_at`. An SP1 program over a Merkle accumulator of receipts could emit "$X total revenue across N unique callers in tier {bronze/silver/gold}" without revealing per-receipt linkage. The seller gets analytics; the buyer gets unlinkability vs the seller. TrustBench is the trusted aggregator with cryptographic guarantees on top.

But two caveats stop me from recommending this as a near-term build:

- **Trust topology mismatch.** The privacy guarantee is buyer-vs-seller. TrustBench already sees the per-call linkage. ZK only matters if the seller is willing to accept TrustBench's aggregation proof as a substitute for per-call data. That's a behavioral assumption — no provider has asked for this. (Infopunks, Strata, Grid have all asked for the *opposite*: more traceability, better audit replay, error-code standardization.)
- **Operational tax.** SP1 prover infrastructure is GPU-bound, $0.005-$0.01 per proof on cloud. For a solo founder under "must run unattended," that's a real lift: prover binary deployment, GPU provisioning, batch-job scheduling, monitoring, retries. Adds an entire new failure surface to the project. The "small MRR project that runs itself" frame in `partnership-day-record-2026-05-07.md` § 4.3 is not compatible with a hosted ZK prover.

**3. Receipt thesis:** Genuinely additive. A privacy-preserving aggregation primitive *atop* the receipt corpus extends the receipt's role from "single-call proof" to "primitive for downstream cryptographic claims about volume/tier/distribution." Strengthens the spec's case for being the canonical artifact across the stack.

**4. Conflict:** Slight tension with the planned `/audit-replay` paid endpoint ($0.01) which surfaces full per-call audit. Audit-replay reveals; aggregation hides. Resolvable: agent (buyer) controls disclosure on a per-receipt opt-in/opt-out basis. The receipt envelope would gain an `aggregation_eligible: bool` field.

**5. Head start:** Substantial. Receipt corpus, signing infra, `paid_requests` table design, agent_id, settled_at, amount_atomic — every SP1 input. The new work is the SP1 program + verifier library + Merkle accumulator schema. The existing Hono server can host the proof-emission endpoint. About 60% of the build is already structurally in place.

**Verdict for Johan:** Don't build now. Document in `phase5-design-seeds.md` as a privacy-preserving seller-analytics primitive. Prerequisites before starting: (a) receipt corpus has volume (>10K receipts), (b) at least one provider asks for analytics they can show prospects without revealing per-call data, (c) someone commits to paying a per-tier-proof fee that covers SP1 cloud cost + amortizes the operational lift. None of those signals exist yet. **PDF's "12-18 months out" estimate aligns with TrustBench's Phase 5 timeline.**

---

### Idea 3 — ZK receipts / proof-of-payment SDK for non-blockchain backends

**PDF verdict:** Don't build. Lost cause against CDP.

**Total agreement, with one correction.** TrustBench *already occupies the verifier-without-Ethereum-infra slot*. The shipped npm package `@trustbench/verify-receipt` v0.1.0 verifies the Ed25519 signature with zero blockchain dependencies (the viem peer dep is *optional* — without it you still get SIGNATURE VALID; with it you also get ON-CHAIN VERIFIED). The receipt's settlement reference (tx_hash, block_number, chain) is sufficient evidence for any backend that wants to confirm the on-chain leg, without that backend having to run RPC infrastructure itself.

The PDF lumps "ZK receipts" with SHA-256 receipts and concludes Coinbase wins. But TrustBench's actual position is *router-side attestation with detached chain reference*, which is complementary to merchant-side receipts (offer-and-receipt v0.6 extension covers that slot). Adding ZK on top of the existing Ed25519+chain-ref envelope is gratuitous: every property a ZK SDK would offer (signature-verified, content-addressed, chain-anchored, third-party-verifiable) is already there.

**Verdict for Johan:** Skip. TrustBench's existing receipt envelope + npm verifier is the right shape. Adding ZK would dilute, not strengthen.

---

### Idea 4 — Reputation aggregator with selective disclosure

**PDF verdict:** STRONG. Build first. Most defensible.

**This is where the PDF and TrustBench's strategy disagree most. Push back hard.**

**1. Standalone:** The PDF's case is real — ERC-8004 is live, cloakfi has tier proofs but no cross-platform aggregator, the technical work is ~3 months. But the PDF's competitive density estimate is light. AgentProof claims 68k+ agents scored across 24 chains. Reclaim Protocol has `reclaim-8004-validator` for ZK credentials in ERC-8004. Phala TEE-attested agents. EigenLayer Verifiable Agents + EigenCompute / EigenVerify. ENS + ENSIP-25. Visa TAP with HTTP Message Signatures. The PDF's "open lane" claim deserves the *verify-before-positioning* rule from `lessons.md` 2026-05-08: every plausible-sounding 2026 ZK wedge has 5-20 funded teams.

**2. TrustBench extension:** Pulls in the wrong direction. TrustBench's surface is **provider-side reputation for agents**: nightly liveness telemetry on x402 endpoints, signed scorecards per provider, the `/route` selection-reason audit trail. This idea is **agent-side reputation for providers/marketplaces**: ERC-8004 attestations on agents, Merkle-aggregated across registries, ZK-disclosed in tiers. Different side of the transaction. Different audience. Different infrastructure (indexer + on-chain RPC + ZK pipeline). Building it would re-open the "is TrustBench a router or a reputation aggregator?" identity question that *just* got resolved on 2026-05-07 to "router-side attestation that composes with partner trust signals."

**3. Receipt thesis:** Adding agent-credential fields to receipts (e.g., an optional `agent_credential_proof` annotation) would strengthen the receipt as a multi-purpose evidentiary primitive. But receipt-spec-v1 Open Question #5 to InfopunksHQ already flagged the agent-supplied identifier slot. The right move is *consume* an external reputation system as an annotation, not *build* one.

**4. Conflict:** Significant. The PDF's #1 use cases — high-value-task marketplaces wanting filtered agent pools (agentic.market, AWS Bedrock), merchants doing volume-discount tier verification — are exactly the audiences `COMPETITIVE-LANDSCAPE.md` § "Update 2026-05-08" identifies as **absorbed by AWS Bedrock + Coinbase bundling**. TrustBench's addressable persona is "non-AWS, non-Coinbase-aligned, multi-cloud, multi-protocol agents." Those agents don't typically operate in curated marketplaces *at all*, which is why they're TrustBench's audience in the first place — and reputation aggregation has its strongest pull *inside* curated marketplaces. The PDF's #1 idea targets the audience TrustBench just decided not to chase.

**5. Head start:** Limited. Some Ed25519 plumbing reused. Some signing-key infra reused. But ERC-8004 indexing, Merkle tree maintenance per agent, ZK proof generation pipeline, multi-chain RPC are all new. Maybe 20% of the build overlaps with TrustBench infra; 80% is greenfield.

**Pushback summary on the PDF's #1 ranking:** The PDF is technically correct that #4 is the most defensible ZK build *cryptographically*. But it's the least defensible build *strategically* for TrustBench specifically, because:
- It targets audiences TrustBench has explicitly decided not to address.
- It puts Johan back into the "standalone product searching for a wedge" trap that took weeks of strategy churn to escape.
- The competitive density (AgentProof, Reclaim, Phala, EigenLayer, ENS) is higher than the PDF's surface scan acknowledged.
- The 3-month solo build runs counter to the just-stabilized "ship Phase 4b paywall + watch real revenue" plan.

**Verdict for Johan:** Do not build standalone. Do not bolt onto TrustBench. **If** Strata or Infopunks asks for an `agent_credential` annotation field on the receipt, add a single optional URL-or-hash reference field — let the partner's own reputation system fill it. Don't take on the indexer build.

---

### Idea 5 — Compliance proofs for cross-border agent payments

**PDF verdict:** Skip. Regulatory exclusion (Sweden-based solo + MiCA + Travel Rule).

**Total agreement.** This crosses into KYC issuance territory which CLAUDE.md explicitly bans ("Custody is the regulatory landmine. The only solo-founder-feasible path is non-custodial."). World/AgentKit covers proof-of-human; AnChain.AI MCP does AML; KYA is becoming a category. Skip cleanly.

---

### Idea 6 — Dispute / refund oracle

**PDF verdict:** Don't build. Market settled around simpler approaches (server-signed receipts).

**Mostly agree, with a TrustBench-specific nuance.**

The PDF correctly notes x402r, x402disputes, x402refunds, and the "server-signed receipts are the pragmatic balance" consensus. ZK escrow + automated refund is overengineered for the actual ecosystem behavior.

But — `phase5-design-seeds.md` already has a **P5-dispute** entry that's the *right* shape: receipt corpus + structured `terms` field signed by buyer at quote time + `/disputes/:id` off-chain resolution endpoint + reputation feedback loop into provider scorecards. **No ZK required.** The receipt is already the audit trail. The dispute layer is HTTP middleware on top.

The PDF's framing (trustless ZK refunds) is a different product than TrustBench's framing (receipt-evidenced off-chain resolution with reputation feedback). TrustBench's framing is right-sized for solo founder; the PDF's framing is overengineered.

**Verdict for Johan:** Skip the ZK version. The non-ZK version is already on the Phase 5 roadmap and is the better answer. Burak's terms-and-deliverables question (referenced in `phase5-design-seeds.md`) is the natural launch wedge — *not* "trustless ZK disputes" but "the only protocol-agnostic dispute-aware router."

---

### Idea 7 — Private agent identity rotation

**PDF verdict:** Solid second-tier, ~10-12 weeks, medium defensibility.

**1. Standalone:** PDF's read is fair. prxvt does fresh burner wallets per payment; Kite has BIP-32 deterministic agent addresses with random-key sessions; Polygon Agent CLI has session-scoped wallets with 24-hour expiry. The differentiated angle (cross-merchant unlinkability *with* selective disclosure to auditors via stealth-address ERC-5564) is a real gap. No regulatory exposure. Sweden-friendly. ~10-12 weeks.

**2. TrustBench extension:** Sits at a different layer. TrustBench is HTTP middleware (router + receipts + audit); identity rotation is wallet-level (key derivation + stealth addresses). The receipt records the on-chain `payer_address` as observed — if the agent rotates, TrustBench can't group calls under one wallet, but TrustBench's own `agent_id` (api-key linked) groups them anyway. Rotation is already trivially possible — an agent can use prxvt-style fresh burner wallets against TrustBench `/route` today and TrustBench handles it correctly. There's nothing to bolt on.

**3. Receipt thesis:** Neutral. Receipt format is unchanged; rotation is invisible at the envelope level.

**4. Conflict:** None. Doesn't conflict.

**5. Head start:** Minimal. Different domain entirely. Maybe 5% reuse (Ed25519 signing patterns, npm publishing setup). The 95% — stealth-address derivation, view-key reconstruction, ERC-5564 extension — is greenfield and unrelated to TrustBench's surface.

**Verdict for Johan:** This is the most-technically-interesting standalone of the bunch *if* Johan wants a side project unrelated to TrustBench. But three things stop me from recommending it actively:

1. **It doesn't compose with TrustBench's revenue model.** Building it doesn't strengthen the paywall, the receipt, the registry, or any partner integration.
2. **10-12 weeks is enough to derail Phase 4b paywall ship velocity.** The component-in-stack frame just stabilized; revenue is in active validation; the right move is to ship the paywall and watch the first 30 days of paid traffic, not start a new ZK side project.
3. **The PDF's "viral potential" claim is unverified.** Same `lessons.md` 2026-05-08 verify-before-positioning rule applies: a "clearer demo" doesn't automatically translate to revenue or distribution.

If Johan really wants a side project: this is the cleanest pick on the PDF's list. But it's a pure-curiosity project, not a TrustBench-compounding one.

---

## Part 3 — Synthesis and recommendation

### Ranking inversion

| PDF rank | Idea | TrustBench-aware rank | Why the inversion |
|---|---|---|---|
| #1 | Reputation aggregator (#4) | #3 | Targets AWS-Bedrock/Coinbase-resident audiences TrustBench has explicitly decided NOT to chase. Pulls back into "standalone product hunting" frame just escaped. |
| #2 | Private identity rotation (#7) | #2 (only-if-side-project) | Most-interesting pure standalone. Doesn't compose with TrustBench. 10-12 weeks would derail paywall ship velocity. |
| #3 | Private usage metering (#2) | #1 | Best fit as Phase 5 TrustBench extension. Receipt corpus is the natural aggregation source. SP1 economics fit when amortized. |
| skip | Idea 1 policy verifier | skip | Correct — AWS gives it free, plaintext. |
| skip | Idea 3 ZK receipts | skip | Correct — TrustBench already occupies this slot non-ZK. |
| skip | Idea 5 compliance | skip | Correct — regulatory exclusion. |
| skip | Idea 6 dispute oracle | skip (but P5-dispute non-ZK is on roadmap) | TrustBench already has the right non-ZK answer in `phase5-design-seeds.md`. |

### Two pushbacks the PDF's analysis missed

**1. The PDF doesn't account for the solo-founder operational tax of running ZK infra.**
Every ZK idea (#1 Circom verifier, #2 SP1 prover, #4 Merkle indexer + ZK pipeline, #7 stealth-address scheme) adds a new operational failure surface. CLAUDE.md's "Whatever ships must run unattended. No 24/7 monitoring, no manual reconciliation, no support inbox" is binding. The PDF's "$0.005-$0.01 per proof on cloud GPUs" reads as a cost number; the real cost is the GPU provisioning, batch orchestration, retry logic, and observability that have to surround it. None of the PDF's verdicts factor this in.

**2. The PDF assumes "ZK is technically interesting" → "buyers will pay for it." TrustBench's Phase 2 validation says otherwise.**
Builders explicitly named *idempotency, hard spend caps, signed receipts, queryable audit* — all four are non-ZK and all four shipped in Phase 3/4. None of the four needed cryptographic privacy to be valuable. The receipt-spec-v1 Open Questions sent to Infopunks asked about Merkle commitment over alternatives (ZK-adjacent) — Infopunks's answer was to ship their Cognition Layer with cleartext receipts and tweet "imo the receipt is the primitive." The market signal favors *legible* over *private*. ZK works against legibility.

### What Johan's existing infrastructure actually buys for each idea

| Idea | Receipt envelope | Router | Audit endpoint | npm verifier | Infopunks/Strata | Spend caps | Net head start |
|---|---|---|---|---|---|---|---|
| #1 policy verifier | partial | n/a | n/a | n/a | n/a | yes | ~30% reuse |
| #2 private metering | yes | yes | yes | partial | yes | n/a | **~60% reuse** |
| #3 ZK receipts | already done | n/a | already done | already done | n/a | n/a | full coverage non-ZK |
| #4 reputation aggregator | partial | partial | partial | partial | partial | n/a | ~20% reuse |
| #5 compliance | n/a | n/a | n/a | n/a | n/a | n/a | regulatory blocker |
| #6 dispute oracle | yes | yes | yes | yes | yes | yes | non-ZK path on Phase 5 roadmap |
| #7 identity rotation | n/a | n/a | n/a | n/a | n/a | n/a | ~5% reuse |

### Recommendation

**Don't build any ZK side project right now.** The component-in-stack frame just stabilized after weeks of strategy churn (AgentLog → reliability pivot → standalone-router → component-in-stack). The right move for the next 4-6 weeks is the boring one:

1. **Ship Phase 4b paywall v0.1.0** per `phase4-paywall-design.md`. Watch the first 30 days of real x402 paid traffic.
2. **Land formal Strata + Infopunks integrations** with the receipt envelope as the spine.
3. **Unblock Solana settlement** so the registry inventory becomes routable.
4. **Let revenue validate the model** before adding any new technology surface.

For the longer horizon:

- **Add a Phase 5 design seed for "privacy-preserving seller analytics atop receipt corpus"** (the PDF's #2). Reference SP1 + Merkle accumulator + buyer-controlled disclosure annotation. Unlock conditions: receipt corpus volume + provider-side analytics ask + per-tier-proof revenue commitment. This is the only ZK idea that genuinely *strengthens* the receipt-spec-as-product thesis.
- **Don't add Phase 5 design seeds for #1, #4, or #7.** They either target wrong-audience (#4), duplicate already-trusted infra (#1), or don't compose at all (#7).
- **Watch ERC-8004 + offer-and-receipt + AP2 maturity.** If a partner asks for an `agent_credential_proof` annotation field on receipts because they're consuming an existing ZK-credential system (Reclaim, cloakfi, etc.), add the field. Don't build the system.

### One sentence

The PDF was written without seeing TrustBench's strategic state, so its #1 (reputation aggregator) is the wrong recommendation for Johan, its #3 (private metering) is the right Phase-5 design seed, and the rest are either correctly-skipped or duplicate non-ZK work that's already on the roadmap — meaning the honest answer to "should TrustBench add ZK" is *not now, possibly later, only via the receipt corpus, only when a partner pulls.*
