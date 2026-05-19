# Receipt-Backed Agent-to-Agent Procurement

Executor-side template for a delegated paid task. Agent A asks Agent B to source information or compare vendors on Agent A's budget. Agent B uses TrustBench-routed x402 calls and returns the deliverable plus signed receipts, so Agent A can independently verify the routed payments.

## Who this is for

The executor in a two-agent paid workflow: Agent A (principal) delegates a budgeted task to Agent B (executor). The receipts are the contract surface between A and B at the *payment-action* layer.

## Prerequisites

Agent runtime with x402 payment support (the x402 client signs the `X-PAYMENT` header). Wallet funded with USDC on Base, delegated by Agent A to Agent B with a spend cap. **Delegation mechanism is runtime-specific and out of scope** for this bundle.

## Cost

Per routed call: $0.005 TrustBench routing fee + provider fee (typically $0.001-$0.015). Each routing fee settles as its own on-chain USDC EIP-3009 transfer on Base; gas overhead is minimal on Base.

## Threat model

Receipts let Agent A independently verify, per call: the routed payment occurred, TrustBench selected a specific provider at the recorded price, and settlement landed on Base (at the recorded block when the envelope includes one). Trust root: TrustBench's public scoring methodology at `/methodology`, the canonical TrustBench revenue wallet address published in `https://trustbench.io/.well-known/trustbench.json` (also derivable from any valid receipt's signed `paid.payee_address`), and USDC settlement on Base. Historical replay of routing decisions assumes the registry preserves point-in-time state; this is operational policy, not a cryptographic property.

Receipts do **not** defend against:

- **Provider lying about result content.** The receipt proves payment, not data truthfulness.
- **Response tampering by Agent B.** B receives provider data and can edit it before passing to A. The only mitigation is out-of-band re-runs by A or a third agent.
- **Receipt withholding for routing fees.** B paid the TrustBench routing fee but withheld the receipt. Mitigation: A reconciles **routing-fee transactions** (USDC from the delegated wallet to TrustBench's revenue wallet) against `trustbench_receipts[]`. Any unmatched routing-fee tx signals withholding. Provider-fee txs (USDC to varying provider wallets) are not directly attestable from this receipt schema — receipts attest the routing decision, not the downstream provider payment. Side-channel spending from non-delegated wallets is outside this mitigation entirely.

## Prompt

You are Agent B, executor in an agent-to-agent procurement workflow. Agent A judges your output on two dimensions: did you complete the task, AND can Agent A verify what you paid for.

For each source you consult:

1. POST `https://trustbench.io/route` with `{"capability": "<capability>", "payer_address": "<delegated_wallet>"}` and `X-PAYMENT`. Parse the response body: extract `receipt.receipt_id`, `receipt.issued_at`, `next_step.provider_url`, and `next_step.payment_requirements_v2`.

2. POST your query to `next_step.provider_url` with `X-PAYMENT` per `next_step.payment_requirements_v2`. Parse provider results (provider-specific schemas).

3. Append to `trustbench_receipts[]` based on outcome:

| Status | When | Required fields |
|---|---|---|
| `ok` | Both calls succeeded | `step, capability, receipt_id, selected_provider, issued_at, status` |
| `failed_before_settlement` | `/route` returned non-200; no payment occurred | `step, status, reason` |
| `settled_no_result` | Routing fee settled; provider call failed OR you aborted after settlement. Disambiguate via `reason`. | `step, status, reason, receipt_id` |
| `intentionally_skipped` | Pre-routing only; you chose not to attempt before paying the routing fee. After settlement, use `settled_no_result` with `reason: executor_aborted_after_settlement`. | `step, status, reason` |

4. Update `total_spend_usdc += routing_fee + provider_fee` per `ok` call, or `+= routing_fee` per `settled_no_result`. If next call would exceed `budget_cap_usdc`, stop and emit `intentionally_skipped` for remaining steps.

5. Output JSON with `report`, `total_spend_usdc`, `trustbench_receipts`, `verify_command`:

   ```
   jq -r '.trustbench_receipts[] | select(.status=="ok" or .status=="settled_no_result") | "https://trustbench.io/receipts/" + .receipt_id' report.json | xargs -I{} npx @trustbench/verify-receipt {} --check-chain
   ```

Output JSON only. No prose narration.

## Worked example (illustrative — IDs and findings are synthetic)

Task from Agent A:

```json
{"goal": "compare three cloud GPU providers for inference workloads", "capability": "search", "budget_cap_usdc": 0.05, "output_format": "ranked_list_with_pricing"}
```

Agent B output:

```json
{
  "report": {
    "options_compared": [
      {"vendor": "Provider X", "starting_price": "$0.50/hr/A100", "strengths": "Highest throughput, mature ecosystem", "weaknesses": "Higher cost, limited spot availability"}
    ],
    "recommendation": "Only Source 1 returned data; Source 2 settled but the provider 5xx'd, Source 3 was skipped at the budget cap, so re-run with a higher budget to complete the comparison."
  },
  "total_spend_usdc": 0.018,
  "trustbench_receipts": [
    {"step": "source_1", "capability": "search", "receipt_id": "rrcpt_01KZ7M3Q8VFXAR2J4P6W2DGYHN", "selected_provider": "https://example.com/search-1", "issued_at": "2026-05-19T14:23:11.834Z", "status": "ok"},
    {"step": "source_2", "capability": "search", "receipt_id": "rrcpt_01KZ7M5J3QF8VBARTPE4W7XGYH", "status": "settled_no_result", "reason": "provider_returned_5xx_after_payment_settlement"},
    {"step": "source_3", "status": "intentionally_skipped", "reason": "budget_cap_approached_before_routing"}
  ],
  "verify_command": "jq -r '.trustbench_receipts[] | select(.status==\"ok\" or .status==\"settled_no_result\") | \"https://trustbench.io/receipts/\" + .receipt_id' report.json | xargs -I{} npx @trustbench/verify-receipt {} --check-chain"
}
```

## How Agent A verifies

Run `verify_command`. For each receipt URL, the verifier fetches the signed envelope from `https://trustbench.io/receipts/<id>` and confirms:

1. **Signature.** Ed25519 over the canonical envelope, validated against TrustBench's pubkey at `/.well-known/trustbench-pubkey`.
2. **On-chain binding** (with `--check-chain`). The verifier looks up the signed `tx_hash` on Base via RPC and confirms the tx is a non-reverted `transferWithAuthorization` call to the Base USDC contract whose decoded calldata `from`/`to`/`value` match the signed `payer_address`/`payee_address`/`amount_atomic` exactly. Block number is also checked when the envelope records it.

Verifier exits non-zero on: signature failure, tx-not-found, tx reverted, wrong contract, wrong selector, payer/payee/amount mismatch, block_number mismatch, non-`base` chain, or pubkey-fetch failure. Full envelope schema: `receipt-spec-v1.md` on the TrustBench repo.

**Beyond `--check-chain`**, Agent A should also confirm:

- Each receipt's signed `paid.payer_address` equals the delegated wallet address (otherwise Agent B could substitute valid receipts from unrelated workflows or other wallets).
- Each `issued_at` falls within the workflow's time window.

Then reconcile **routing-fee transactions** in the delegated wallet's Base USDC history against the returned receipts. The TrustBench revenue wallet address is published at `https://trustbench.io/.well-known/trustbench.json` and equals the signed `paid.payee_address` in any valid receipt. Filter the delegated wallet's USDC outflow history by `to == revenue wallet`; any routing-fee tx without a matching receipt signals withholding from the routing layer. This reconciliation does not cover provider-fee txs (which go to varying provider wallets) or out-of-wallet side-channels.

License: MIT. Source: `https://trustbench.io/bundles/receipt-backed-agent-to-agent-procurement`.
