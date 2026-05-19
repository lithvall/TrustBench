> # ⛔ ARCHIVED — DISPROVEN DRAFT ⛔
>
> **Status:** Superseded. Do NOT reference this file for live tasks.
> **Archived:** 2026-05-19
> **Why disproven:** Misleading "Verified" branding (overpromises that the research itself is verified when only the paid calls are attested). Broken `verify_command` shell (`for r in trustbench_receipts; do ... $r.url` is invalid bash). Self-contradictory "no fourth category" failure-taxonomy section. Self-referential Anthropic worked example with plausible-but-fake URLs. Premature reference to unbuilt `/verify` endpoint. Internal stance-versioning frontmatter leaking to a public artifact. Mixed three audiences (developers, infra engineers, strategists) in one document. Wrong topic: receipts are a primitive for non-repudiation between counterparties; market research has no native audit consumer.
> **Superseded by:** `bundles/receipt-backed-agent-to-agent-procurement.md` (v4)
> **Use case for this archive:** Historical context only. Reference to disprove the approach (especially the "market-research as receipt-bundle topic" framing), NOT to apply it.
> **Origin:** See `SIGNAL-2026-05-17-agenticmarket-bundles.md` + `lessons.md` 2026-05-18 entry.

---

<!--
Internal stance versioning (CLAUDE.md § Stance Versioning Discipline). Not rendered to readers.
stance_version: 2026-05-17
stance_phase: phase-4-post-listing-sprint
stance_pillars: [canonical-receipt-format-standard, neutral-routing-receipt-layer]
-->

# Receipt-Backed Market Research

A market-research bundle that routes its paid search call through TrustBench so every paid action lands in the bundle output as a signed, on-chain-anchored receipt.

## What this bundle is (and isn't)

This bundle attests to the **paid calls behind the research**, not to the research itself. The receipts in the output prove:

- A specific `/route` call was made for the `search` capability
- TrustBench's score-based selection picked a specific provider
- A specific USDC payment settled on Base for the routing fee, and a separate USDC payment settled for the provider fee
- The selected provider returned a result at the time of the call

The receipts do **not** attest to: the accuracy of the research, the truthfulness of provider output, the completeness of sources, or the absence of bias. The brief itself is as good as the underlying provider and the agent's synthesis. The receipts are the audit trail for the *paid actions*, not a quality signal for the *content*.

If you want a research workflow with a verifiable trail of what was paid, when, to which provider, and at what price — this bundle. If you want a generic research workflow at the lowest cost — call the search provider directly.

## Who this bundle is for

Autonomous research agents whose paid calls need to be reconciled against an audit log, an expense report, or a compliance system. Specifically:

- An investment-research agent operating under a CFO-approved spending policy that requires per-call audit trail
- A multi-agent system where one agent funds another's research and needs to verify the funded work happened as billed
- An enterprise procurement workflow that needs receipts for x402 API spend (vendor reconciliation, finance close, tax export)
- A regulated context (compliance-bound agentic systems, autonomous-spending dispute resolution, forensic replay) where every paid action must be third-party verifiable

If your agent doesn't need a downstream consumer (human or machine) to verify what was paid for, you don't need this bundle. Call the search provider directly.

## Prerequisites

- Agent wallet provisioned with USDC on Base
- x402-capable client (e.g. `awal`, `@coinbase/x402`, or any reference client)
- Routing premium budget: ~$0.005 per routed call above direct provider cost

## Cost and routing premium

| Path | Per-call cost |
|---|---|
| Direct provider call (e.g. Exa Neural Search) | provider fee only (~$0.001-$0.015) |
| Routed via TrustBench `/route` | $0.005 TrustBench routing fee + provider fee |

The premium is roughly a fixed $0.005 per routed call. Pay it when the audit trail matters; skip it when it doesn't.

## The invariant: no silent drops

Every paid action either produces a receipt or a failure artifact in `trustbench_receipts[]`. The bundle never silently discards a routed call. If `/route` returns a non-200 status or the downstream provider call fails after settlement, the failure is recorded as a typed entry. A downstream auditor reading the output can distinguish:

- A routed call that succeeded (full receipt)
- A routed call that TrustBench couldn't fulfill (`status: "failed", reason: "..."`)
- A capability the bundle skipped intentionally (`status: "skipped", reason: "..."`)

There is no fourth category.

## Workflow

1. **Routed search.** `POST https://trustbench.io/route` with body `{capability: "search", payer_address: <agent_wallet>}` and an `X-PAYMENT` header signed for the $0.005 USDC routing fee on Base. The response is a `SignedRoutingResponse` containing:
   - `receipt.receipt_id` — the `rrcpt_` identifier
   - `receipt.routing.provider_url` — the selected provider URL
   - `signature` — Ed25519 over the canonicalized receipt
   - `next_step.provider_url` — same as above, surfaced for client convenience
   - `next_step.payment_requirements_v2` — the provider's x402 payment requirements
2. **Provider search call.** `POST <next_step.provider_url>` with the user's research query and an `X-PAYMENT` header signed for the provider's fee per `next_step.payment_requirements_v2`. Parse the search results. Note: search providers return different result shapes (Exa, Parallel, and other search-capable providers each have their own JSON schema); the agent is responsible for per-provider parsing. Cross-provider response canonicalization is a registry maturation item, not a v1 guarantee.
3. **Capture the receipt.** Append an entry to `trustbench_receipts[]`:
   ```json
   {
     "step": "search",
     "capability": "search",
     "receipt_id": "<receipt.receipt_id>",
     "url": "https://trustbench.io/receipts/<receipt_id>",
     "selected_provider": "<next_step.provider_url>",
     "issued_at": "<receipt.issued_at>",
     "status": "ok"
   }
   ```
4. **Compile structured brief.** Output JSON with these fields:
   - `executive_summary` (2-3 sentences)
   - `key_findings` (array of `{text, source_url}`, 3-5 items)
   - `competitive_landscape` (1-2 paragraphs)
   - `sources` (numbered array of cited URLs)
   - `trustbench_receipts` (the audit array from step 3)
   - `verify_command` (one-liner for downstream replay, see below)

## Prompt

You are a market research analyst. When the user asks for research on a company or topic:

1. Send `POST https://trustbench.io/route` with body `{"capability": "search", "payer_address": "<your_wallet_address>"}` and an `X-PAYMENT` header signed for the TrustBench routing fee. Parse the `SignedRoutingResponse`.

2. Extract `next_step.provider_url` and `next_step.payment_requirements_v2` from the response. Send the user's research query to `next_step.provider_url` with an `X-PAYMENT` header signed per the requirements. Parse the search results (the provider's response shape is provider-specific; consult the provider's documentation if needed).

3. Append to `trustbench_receipts[]`:
   ```json
   {
     "step": "search",
     "capability": "search",
     "receipt_id": "<receipt.receipt_id from step 1>",
     "url": "https://trustbench.io/receipts/<receipt_id>",
     "selected_provider": "<next_step.provider_url>",
     "issued_at": "<receipt.issued_at>",
     "status": "ok"
   }
   ```

4. Failure handling: if step 1 returns a non-200 status, append `{step: "search", status: "failed", reason: "<error>"}` to `trustbench_receipts[]` and produce the brief from prior knowledge with a `"sources": ["agent_prior_knowledge"]` marker. If step 2 fails after step 1 settled, append `{step: "search", status: "settled_no_result", receipt_id: "<id>", reason: "<error>"}` — the receipt is still valid, the provider just didn't deliver.

5. Compile the brief with sections: `executive_summary`, `key_findings`, `competitive_landscape`, `sources`, `trustbench_receipts`, `verify_command`.

6. Set `verify_command` to:
   `"for r in trustbench_receipts; do npx @trustbench/verify-receipt $r.url --check-chain; done"`

Output as JSON. No prose narration around the JSON.

## Worked example output

User query: *"Anthropic — competitive position in the foundation-model market"*

```json
{
  "executive_summary": "Anthropic is a privately-held foundation-model lab focused on safety-oriented LLMs (Claude family). Competes directly with OpenAI, Google DeepMind, and xAI on frontier-model capability; differentiated by Constitutional AI methodology and enterprise-API-first go-to-market via partnerships with Amazon and Google Cloud.",
  "key_findings": [
    {"text": "Claude 4.6 family released October 2025; positioned for agentic workloads with extended context and tool-use", "source_url": "https://www.anthropic.com/news/claude-4-6"},
    {"text": "$8B Amazon investment closed November 2024; AWS named primary cloud partner; Claude available via Bedrock", "source_url": "https://www.aboutamazon.com/news/aws/amazon-anthropic-investment-2024"},
    {"text": "Enterprise revenue growth trajectory tracks ahead of OpenAI for API-first deployments in regulated industries", "source_url": "https://www.theinformation.com/articles/anthropic-revenue-2026"}
  ],
  "competitive_landscape": "Direct competitors include OpenAI (GPT family, largest market share by consumer adoption), Google DeepMind (Gemini, integrated across Google Cloud and Workspace), Meta AI (open-weight Llama models, different go-to-market), and xAI (Grok, X-platform integration). Anthropic's positioning emphasizes interpretability research and safety methodology as enterprise differentiators, particularly for regulated workloads. Open-weight alternatives (Llama, Mistral, DeepSeek) compete on cost and self-hosting flexibility rather than frontier capability.",
  "sources": [
    "https://www.anthropic.com/news/claude-4-6",
    "https://www.aboutamazon.com/news/aws/amazon-anthropic-investment-2024",
    "https://www.theinformation.com/articles/anthropic-revenue-2026"
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
  "verify_command": "for r in trustbench_receipts; do npx @trustbench/verify-receipt $r.url --check-chain; done"
}
```

The `trustbench_receipts[0].url` resolves to a public receipt page. The `verify_command` re-runs the audit offline in ~2 seconds.

## Verification

Any downstream consumer can verify a run end-to-end:

```bash
for url in trustbench_receipts.*.url; do
  npx @trustbench/verify-receipt $url --check-chain
done
# Each receipt returns:
#   SIGNATURE VALID
#   ON-CHAIN VERIFIED
```

The verifier reads the signed envelope, fetches TrustBench's public Ed25519 key from `https://trustbench.io/.well-known/trustbench-pubkey`, validates the signature offline, and confirms the on-chain USDC EIP-3009 settlement transaction on Base via `--check-chain`. Browser-friendly receipt pages are also available at `https://trustbench.io/receipts/<id>` for human inspection.

## When to use this bundle vs. alternatives

| Goal | Tool |
|---|---|
| Cheapest possible market-research call | Direct provider call (Exa, Parallel, Perplexity, Tavily) |
| Research with an audit trail of paid actions | This bundle |
| Research where you want specific provider's response shape | Direct provider call (preserves vendor-specific result format) |
| Multi-agent commerce where downstream agents need to verify what was paid | This bundle |
| Compliance / audit-required spending workflows | This bundle |

## License and discoverability

License: MIT. Fork, adapt, or compose into your own bundle.

Discoverable via: `https://trustbench.io/skill.md`, `https://trustbench.io/.well-known/trustbench.json`, `https://trustbench.io/llms.txt`.

Source: TrustBench bundle authoring. Strategic context in `SIGNAL-2026-05-17-agenticmarket-bundles.md`.
