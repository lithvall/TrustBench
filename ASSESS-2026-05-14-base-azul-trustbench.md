# Base Azul Multiproof — TrustBench Relevance Assessment
**Date:** 2026-05-13
**Status:** PENDING — pick up 2026-05-14 for further assessment
**Filed by:** Dispatch / JarvisBrain ingest

---

## Context

Base Azul mainnet activation date confirmed in Base docs: **May 21, 2026**.
Base is securing $7.4B in user deposits. The 7-day finality window has collapsed to 24 hours via a dual-prover architecture (TEE + ZK).

---

## Relevant Technical Facts from the Article

### The Multiproof System
- **TEE Prover (AWS Nitro Enclaves):** Re-executes transactions inside an isolated VM. No persistent storage, no SSH, no external networking. Produces a Remote Attestation signed by Nitro hardware. Fast and cheap but requires hardware trust.
- **ZK Prover (Succinct SP1):** Rust → RISC-V → STARK → Groth16 SNARK pipeline. Mathematically immutable. Expensive to generate but permissionless and trustless.
- **AggregateVerifier (L1 smart contract):** Arbiter between the two provers.

### The Override Rule — "Math > Hardware"
If TEE submits Root A and ZK proves Root B, the AggregateVerifier **always accepts Root B**. The ZK proof overrides the TEE attestation unconditionally. Emits `DivergenceDetected` event on-chain as automated bug detection.

### Three Settlement Paths
1. **Hard Finality (24h):** TEE + ZK agree → 24-hour clock starts → finalized
2. **ZK Override:** TEE and ZK disagree → ZK wins, TEE provider slashed
3. **Fallback (7 days):** Both provers fail → reverts to traditional optimistic window

### Scope Confirmation — Batch-Level, Not Per-Transaction
Base Azul proves **state transitions** (batches of transactions), not individual transactions. There is no per-transaction ZK proof primitive exposed to dApps. The AggregateVerifier operates at the L2 state root level.

This confirms the earlier analysis in `zk-pdf-analysis.md` and the Grok evaluation — Grok's suggestion of a per-tx ZK finality field was technically incorrect.

### Finality Timeline
- TEE attestation: minutes after batch submission
- ZK proof generation: 1–2 hours (current hardware)
- 24-hour buffer: human intervention window
- Total: ~26 hours from batch submission to hard finality

### Future Roadmap (from article)
- Multi-TEE: Intel TDX + AMD SEV-SNP alongside AWS Nitro (2027)
- Sub-hour finality: as SP1 proving time drops from hours to minutes (2028)
- Recursive proving: folding multiple blocks into a single proof
- Ultimate goal: "Zero-Day" rollup — ZK proof per batch, instant finality

---

## Verdict: Does Base Azul Threaten TrustBench Receipts?

**No. Different layers, different jobs.**

### Why Azul Does Not Replace TrustBench

**1. Different abstraction layer**
Azul proves: "this batch of transactions was included in the chain correctly and the resulting state root is valid."
TrustBench proves: "agent X paid service Y $Z for capability W at timestamp T, under these parameters."
One is a chain integrity proof. The other is a semantic business record.

**2. On-chain ≠ structured**
A raw Base transaction proves ETH moved. It does not capture: agent identity, capability parameters, content policy, service metadata, or any of the semantic fields in a TrustBench receipt. That structure is what makes receipts queryable — "show me all receipts where agent X paid for model inference in the last 30 days" — which is impossible from state proofs alone.

**3. TrustBench is protocol-agnostic; Azul is Base-only**
TrustBench receipts work across x402, Stripe, and any future payment rail. A Base state proof says nothing about a Stripe charge for the same service.

**4. The SWIFT analogy holds**
Azul = SWIFT confirmation that a wire cleared.
TrustBench = the invoice explaining what the wire was for.
Both exist in real finance. SWIFT confirmations do not make invoices redundant.

### How Azul Actually Helps TrustBench

The `--check-chain` flag in `scripts/verify-receipt.js` queries Base mainnet to confirm on-chain settlement. With Azul live, that confirmation now resolves in **~24 hours instead of 7 days**. TrustBench receipts that include on-chain confirmation are more quickly verifiable end-to-end.

The Override Rule ("Math > Hardware") is also conceptually parallel to TrustBench's Ed25519 signed receipts — both treat mathematical proof as the final source of truth over operational or hardware attestations. Same trust philosophy, different layers.

---

## Questions for Further Assessment (2026-05-14)

1. Should `verify-receipt.js` documentation be updated to reflect the new 24h `--check-chain` resolution time instead of the implied 7-day window?
2. Does the Base Azul activation date (May 21) create any timing dependency with the MCP server plan (PLAN-2026-05-14-mcp-server.md)?
3. Is the conceptual parallel between the Override Rule and Ed25519 receipt signing worth publishing as a TrustBench X post? ("Same trust philosophy as Base Azul's Override Rule — math wins over hardware attestation.")
4. Does the future "Zero-Day" rollup roadmap (ZK proof per batch) eventually create a world where per-tx finality IS available? If so, does that change the ZK deferral decision in `zk-pdf-analysis.md`?

---

## Source Material
- Article: "How Base's Multiproof System (TEE + Succinct SP1 ZK) Actually Works: The Override Rule & 1-Day Finality Explained" — pasted 2026-05-13
- Base docs: activation date May 21, 2026
- Related TrustBench docs: `zk-pdf-analysis.md`, `scripts/verify-receipt.js`, `PLAN-2026-05-14-mcp-server.md`
- Related JarvisBrain notes: `notes/on-chain-infrastructure/2026-05-13-base-azul-multiproof-tee-zk-override-rule.md`

---
*Auto-filed by Dispatch. Review during morning session 2026-05-14.*
