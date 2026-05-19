> # ⛔ ARCHIVED — DISPROVEN DRAFT ⛔
>
> **Status:** Superseded. Do NOT reference this file for live tasks.
> **Archived:** 2026-05-19
> **Why disproven:** Picked as the better Pillar 1 propagation surface over Option 1 by both 2026-05-19 critique rounds, but flagged for required v4 edits before publishing: (1) name "Receipted Agent-to-Agent Procurement" awkward English — rename; (2) "Agent A has cryptographic proof that the procurement workflow ran as billed" overclaims — replace with "independently verify the recorded routed payments"; (3) "budget-capped wallet authorization" hand-waves on the load-bearing delegation mechanism — pin or out-of-scope it; (4) missing attack vectors in threat model (omission attacks, response tampering by Agent B); (5) happy-path-only worked example didn't demonstrate the failure taxonomy; (6) "Discrepancies signal Agent B made unrecorded calls" missed Base wallet visibility as the actual completeness mechanism; (7) `settled_no_result` ambiguous (provider error vs executor judgment); (8) `intentionally_skipped` boundary unclear post-routing; (9) ~90 lines, over bundle genre target.
> **Superseded by:** `bundles/receipt-backed-agent-to-agent-procurement.md` (v4)
> **Use case for this archive:** Historical context for the v3→v4 iteration. The core thesis (agent-to-agent procurement as the natural fit for the receipt primitive) is preserved in v4; only the execution details changed. Reference if reviewing how the iteration landed.
> **Origin:** See `SIGNAL-2026-05-17-agenticmarket-bundles.md` + `lessons.md` 2026-05-18 entry.

---

# Receipted Agent-to-Agent Procurement

The executor-side template for a delegated paid task. Agent A asks Agent B to source information or compare vendors on Agent A's budget. Agent B uses TrustBench-routed x402 calls and returns the deliverable plus signed receipts so Agent A can verify what was paid for, when, to which provider, and at what price.

## Who this is for

The executor in a two-agent paid workflow:

- **Agent A** (principal) has a procurement question and a budget. Delegates to Agent B with a budget-capped wallet authorization.
- **Agent B** (executor) makes paid x402 calls on Agent A's wallet, returns deliverable + receipts.

The receipts are the contract between A and B. Without them, Agent A's only evidence of Agent B's work is Agent B's self-report, which has the obvious incentive problem.

## Prerequisites

Agent runtime with x402 payment support — the x402 client signs the `X-PAYMENT` header; the LLM agent constructs request bodies and parses responses. Agent B has delegated authority over a wallet funded with USDC on Base by Agent A.

## Cost

Per routed call: $0.005 TrustBench routing fee + provider fee (~$0.001-$0.015 typical). Budget cap is set by Agent A in the task spec. Each routing fee settles as its own on-chain USDC EIP-3009 transfer on Base — TrustBench does not batch.

## Threat model

The receipts prove: a specific routed payment occurred, TrustBench selected a specific provider at that price, settlement landed on Base at that block. Agent A can verify these claims with two network calls per receipt (TrustBench's public key + Base RPC).

The receipts do **not** prove: providers returned truthful data, Agent B's synthesis is honest, or that Agent B made no other unrecorded paid calls outside this flow. Trust root: TrustBench's honest assertion of selection + Base L1 settlement. The principal-agent verification problem is structurally addressed at the *payment-action* layer, not the *deliverable-content* layer.

## Workflow

1. **Receive task from Agent A.** Task spec: `{goal, capability, budget_cap_usdc, output_format}`.
2. **For each source consulted: routed call.** POST `https://trustbench.io/route` with `{capability, payer_address}` + `X-PAYMENT` for the routing fee. Parse `SignedRoutingResponse`. POST query to `next_step.provider_url` with `X-PAYMENT` for the provider fee. Parse provider-specific results.
3. **Append receipt.** Per the failure taxonomy below.
4. **Track running spend.** If cumulative spend approaches `budget_cap_usdc`, stop further routed calls and emit `intentionally_skipped` entries for remaining steps.
5. **Compile deliverable.** Structured JSON per `output_format` plus `trustbench_receipts[]`, `total_spend_usdc`, and `verify_command`.

## Failure taxonomy (every routed step resolves to exactly one)

- `ok` — full receipt captured
- `failed_before_settlement` — `/route` returned non-200; no payment
- `settled_no_result` — TrustBench fee settled, provider call failed after
- `intentionally_skipped` — Agent B chose not to attempt this step (budget cap, task complete, etc.)

## Prompt

You are Agent B, the executor in an agent-to-agent procurement workflow. Agent A has delegated a paid task to you. Your output is judged on two dimensions: did you complete the task, AND can Agent A verify exactly what you paid for.

Given a task `{goal, capability, budget_cap_usdc, output_format}`:

1. For each source you consult, POST `https://trustbench.io/route` with `{"capability": "<capability>", "payer_address": "<delegated_wallet>"}` and `X-PAYMENT` (your x402 client signs from the delegated wallet). Parse the `SignedRoutingResponse`.

2. POST your query to `next_step.provider_url` with `X-PAYMENT` per `next_step.payment_requirements_v2`. Parse provider results (provider-specific schemas).

3. Append to `trustbench_receipts[]`:
   ```json
   {"step": "source_<n>", "capability": "<capability>", "receipt_id": "<id>", "url": "https://trustbench.io/receipts/<id>", "selected_provider": "<url>", "issued_at": "<ts>", "status": "ok"}
   ```

4. After each call, update running spend (TrustBench fee + provider fee). If next call would exceed `budget_cap_usdc`, stop and emit:
   ```json
   {"step": "source_<n>", "status": "intentionally_skipped", "reason": "budget_cap_approached"}
   ```

5. On failure: append `failed_before_settlement` or `settled_no_result` entries per the failure taxonomy. Never silently skip a failed call.

6. Compile the deliverable per `output_format`. Output JSON:
   - `report`: the deliverable per `output_format`
   - `total_spend_usdc`: sum of all routing fees + provider fees actually paid
   - `trustbench_receipts`: the array from steps 3-5
   - `verify_command`: `jq -r '.trustbench_receipts[].url' report.json | xargs -I{} npx @trustbench/verify-receipt {} --check-chain`

Output JSON only.

## Worked example (illustrative — URLs and findings are synthetic)

Task from Agent A:
```json
{"goal": "compare three cloud GPU providers for inference workloads", "capability": "search", "budget_cap_usdc": 0.05, "output_format": "ranked_list_with_pricing"}
```

Agent B output:
```json
{
  "report": {
    "goal": "compare three cloud GPU providers for inference workloads",
    "options_compared": [
      {"vendor": "Provider X", "starting_price": "$0.50/hr/A100", "strengths": "Highest throughput, mature ecosystem", "weaknesses": "Higher cost, limited spot availability"},
      {"vendor": "Provider Y", "starting_price": "$0.32/hr/A100", "strengths": "Cost-balanced, good spot pool", "weaknesses": "Newer platform, smaller region footprint"},
      {"vendor": "Provider Z", "starting_price": "$0.28/hr/A100", "strengths": "Lowest cost, simple API", "weaknesses": "Variable performance, less mature tooling"}
    ],
    "recommendation": "Provider Y for cost-balanced inference; Provider X if throughput dominates the workload."
  },
  "total_spend_usdc": 0.038,
  "trustbench_receipts": [
    {"step": "source_1", "capability": "search", "receipt_id": "rrcpt_01...A", "url": "https://trustbench.io/receipts/rrcpt_01...A", "selected_provider": "https://example.com/search-1", "issued_at": "2026-05-19T14:23:11.834Z", "status": "ok"},
    {"step": "source_2", "capability": "search", "receipt_id": "rrcpt_01...B", "url": "https://trustbench.io/receipts/rrcpt_01...B", "selected_provider": "https://example.com/search-2", "issued_at": "2026-05-19T14:23:18.221Z", "status": "ok"},
    {"step": "source_3", "capability": "search", "receipt_id": "rrcpt_01...C", "url": "https://trustbench.io/receipts/rrcpt_01...C", "selected_provider": "https://example.com/search-3", "issued_at": "2026-05-19T14:23:24.612Z", "status": "ok"}
  ],
  "verify_command": "jq -r '.trustbench_receipts[].url' report.json | xargs -I{} npx @trustbench/verify-receipt {} --check-chain"
}
```

## How Agent A verifies

1. Receive `report.json` from Agent B.
2. Run the `verify_command`. Each receipt: Ed25519 signature against TrustBench's pubkey (fetched from `/.well-known/trustbench-pubkey`) AND on-chain USDC EIP-3009 settlement on Base via RPC.
3. Sum verified receipt amounts (TrustBench fees + provider fees per receipt). Compare against claimed `total_spend_usdc`. Discrepancies signal Agent B made unrecorded calls or misreported.
4. If receipts verify and the spend matches, Agent A has cryptographic proof that the procurement workflow ran as billed.

The unverified surface remains: Agent A still has to judge whether Agent B's `report.recommendation` is well-reasoned. The receipts don't help there. They help with the question "did the budget go where Agent B says it went."

License: MIT. Source: `https://trustbench.io/bundles/receipted-agent-to-agent-procurement`.
