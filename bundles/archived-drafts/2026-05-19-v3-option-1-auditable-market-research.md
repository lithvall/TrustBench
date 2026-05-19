> # ⛔ ARCHIVED — DISPROVEN DRAFT ⛔
>
> **Status:** Superseded. Do NOT reference this file for live tasks.
> **Archived:** 2026-05-19
> **Why disproven:** The v3 of the market-research path. Fixed all v2 correctness bugs (rename to "Auditable," `jq | xargs` verify_command, removed self-contradictory failure-taxonomy, replaced Anthropic worked example with Stripe, removed stance frontmatter, cut "Future variant"). But both 2026-05-19 critique rounds rejected the topic itself — market research has no native audit consumer, so the receipt primitive remained "searching for a workflow" rather than load-bearing. Correctness fixes were valid; the topic was not.
> **Superseded by:** `bundles/receipt-backed-agent-to-agent-procurement.md` (v4)
> **Use case for this archive:** Historical context only. Reference to demonstrate that fixing correctness bugs does NOT fix a topic-primitive mismatch, AND to provide an example of "primitive looking for a workflow" anti-pattern. Do NOT apply this bundle.
> **Origin:** See `SIGNAL-2026-05-17-agenticmarket-bundles.md` + `lessons.md` 2026-05-18 entry.

---

# Auditable Market Research

A market-research workflow that routes its paid search call through TrustBench, embedding signed receipts for the paid actions in the bundle output. Use when downstream consumers need to verify what was paid, when, to which provider, and at what price. Adds ~$0.005 routing premium per call. Not a guarantee of research content correctness — only of the paid actions behind it.

## Who this is for

An agent paying another agent's research budget who needs per-call proof of work. (Plausible adjacent fits: enterprise procurement reconciliation, CFO-policied autonomous spending, compliance-bound systems. The primary buyer is the principal-agent / executor-agent loop.)

## Prerequisites

Agent runtime with x402 payment support — the x402 client signs the `X-PAYMENT` header; the LLM agent constructs the request body and parses responses. Wallet funded with USDC on Base.

## Cost

| Path | Per-call cost |
|---|---|
| Direct provider call (Exa, Parallel, etc.) | provider fee only (~$0.001-$0.015) |
| Routed via TrustBench `/route` | $0.005 routing fee + provider fee |

The premium pays for dynamic best-provider selection at call time plus a TrustBench-signed receipt with the on-chain settlement tx_hash. Each routing fee settles as its own on-chain USDC EIP-3009 transfer on Base — TrustBench does not batch.

## Threat model

The receipts defend against post-hoc dispute over whether a paid call happened, which provider was selected, and at what price. They do **not** defend against: provider lying about result content, TrustBench mis-asserting selection, or downstream tampering with the brief content. Trust root: TrustBench's honest assertion of provider selection plus Base L1 settlement.

## Workflow

1. **Routed search.** `POST https://trustbench.io/route` with body `{capability: "search", payer_address: <agent_wallet>}` and `X-PAYMENT` (signed by x402 client) for the $0.005 routing fee. Parse the `SignedRoutingResponse`.
2. **Provider call.** Extract `next_step.provider_url` and `next_step.payment_requirements_v2`. POST the research query to that URL with `X-PAYMENT` for the provider fee. Parse provider-specific results.
3. **Capture receipt.** Append the routing receipt to `trustbench_receipts[]` per the failure taxonomy below.
4. **Compile brief.** Emit structured JSON with `trustbench_receipts[]` and the `verify_command`.

## Failure taxonomy (every routed step resolves to exactly one)

- `ok` — full receipt captured
- `failed_before_settlement` — `/route` returned non-200; no payment occurred
- `settled_no_result` — TrustBench fee settled, provider call failed after; receipt still valid for the routing action
- `intentionally_skipped` — agent chose not to attempt this step

## Prompt

You are a market research analyst. When asked to research a company or topic:

1. POST `https://trustbench.io/route` with `{"capability": "search", "payer_address": "<wallet>"}` and `X-PAYMENT` (your x402 client signs from your wallet). Parse the response.
2. POST the query to `next_step.provider_url` with `X-PAYMENT` per `next_step.payment_requirements_v2`. Parse provider-specific search results.
3. Append to `trustbench_receipts[]`:
   ```json
   {"step": "search", "capability": "search", "receipt_id": "<id>", "url": "https://trustbench.io/receipts/<id>", "selected_provider": "<provider_url>", "issued_at": "<ts>", "status": "ok"}
   ```
4. On failure: append `{step, status: "failed_before_settlement" | "settled_no_result", reason, receipt_id?}` per the taxonomy. Never silently skip.
5. Output JSON: `executive_summary`, `key_findings` (`[{text, source_url}]`), `competitive_landscape`, `sources` (numbered array), `trustbench_receipts`, `verify_command`.
6. Set `verify_command` to:
   `jq -r '.trustbench_receipts[].url' brief.json | xargs -I{} npx @trustbench/verify-receipt {} --check-chain`

Output JSON only. No prose narration around it.

## Worked example (illustrative — URLs and findings are synthetic)

User query: *"Stripe — competitive position in payments infrastructure"*

```json
{
  "executive_summary": "Stripe is a privately-held payments infrastructure provider serving online businesses with developer-first APIs for payment acceptance, billing, and financial services.",
  "key_findings": [
    {"text": "Strong developer-first product positioning vs Adyen and Block", "source_url": "https://example.com/source-1"},
    {"text": "Expanding into financial infrastructure: issuing, treasury, and capital products", "source_url": "https://example.com/source-2"}
  ],
  "competitive_landscape": "Stripe competes with Adyen (enterprise-first European positioning), Block/Square (SMB and POS), PayPal (consumer-side), and increasingly with platform-native solutions from Shopify and Amazon. Differentiator is developer API quality plus the financial-infrastructure product layer.",
  "sources": [
    "https://example.com/source-1",
    "https://example.com/source-2"
  ],
  "trustbench_receipts": [
    {
      "step": "search",
      "capability": "search",
      "receipt_id": "rrcpt_01KZ7M3Q8VFXAR2J4P6W2DGYHN",
      "url": "https://trustbench.io/receipts/rrcpt_01KZ7M3Q8VFXAR2J4P6W2DGYHN",
      "selected_provider": "https://api.exa.ai/search",
      "issued_at": "2026-05-19T14:23:11.834Z",
      "status": "ok"
    }
  ],
  "verify_command": "jq -r '.trustbench_receipts[].url' brief.json | xargs -I{} npx @trustbench/verify-receipt {} --check-chain"
}
```

## Verification

Run the `verify_command` against the JSON output. Each receipt fetches TrustBench's Ed25519 public key from `https://trustbench.io/.well-known/trustbench-pubkey` and confirms the on-chain USDC EIP-3009 settlement on Base via RPC. Two network calls per receipt, ~2 seconds. Verifier source: `@trustbench/verify-receipt` on npm.

License: MIT. Source: `https://trustbench.io/bundles/auditable-market-research`.
