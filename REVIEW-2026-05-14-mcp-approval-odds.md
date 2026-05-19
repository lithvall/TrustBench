# MCP Approval Odds — Critic Review
**Plan reviewed:** PLAN-2026-05-14-mcp-server.md
**Review date:** 2026-05-15
**Lens:** Realistic probability of MCP directory listing within 30 days of shipping v1

---

## First: The Plan Is Largely Obsolete (Not a Criticism — A Status Update)

Before evaluating approval odds, the material facts:

- `src/mcp-tools.ts` — exists. Defines TOOLS array with all three tools plus proper annotations.
- `src/mcp-http.ts` — exists and deployed. Streamable HTTP MCP server at `POST /mcp` using the MCP `2024-11-05` protocol. This is the exact transport Anthropic's Connectors Directory requires (not stdio).
- `src/mcp-server.ts` — also exists. The stdio variant the plan proposed to build.

The plan was written 2026-05-14 proposing to build these; the implementation either shipped same-day or immediately after. The review below evaluates what's actually deployed, not the plan's proposed spec.

The HTTP MCP server at `https://trustbench.io/mcp` is the right artifact for Anthropic Connectors Directory submission. The stdio server is the right artifact for Claude Desktop config snippets. Both exist.

---

## Criterion 1 — Tool Utility

**Verdict: Narrow but legitimate. Not a disqualifying flaw; a realistic constraint on adoption ceiling.**

The three tools solve a real but ecosystem-specific problem. Scoring each:

`get_rankings`: Useful to any agent that needs to pick an x402 provider before making a payment. The problem is, very few agents are in that position today. A general-purpose assistant has no reason to call this. An agent already doing x402 payments has a genuine use case. This is a tool for infrastructure builders, not end users.

`get_receipt`: Strong utility for any agent that just completed a TrustBench-routed transaction. Zero utility to anyone outside that flow. But for that audience it's exactly right — immutable, publicly verifiable, no auth required.

`verify_receipt`: The strongest general-purpose case of the three. An agent could plausibly be asked to verify "is this payment receipt authentic?" by a user who received one externally. The Ed25519 + on-chain check is substantively better than any similar tool in the current MCP ecosystem. This is the tool with the broadest potential use case.

**Anthropic's bar for the Connectors Directory:** tools must serve a genuine agent use case, not merely be technically correct. These pass on that criterion — the use case is real, just not common yet. The directory has accepted infrastructure-layer tools before (database connectors, API proxies). The framing of "payment audit trail" is more compelling to reviewers than "x402 receipt checker."

---

## Criterion 2 — Schema Quality

**Verdict: 80% there. One gap that will reduce LLM utility in practice.**

The `mcp-tools.ts` TOOLS array is well-structured:

- Descriptions are honest (the `get_rankings` methodology caveat is correct and important).
- Annotations are correct and present: `readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`, `title`. These are required by Anthropic Software Directory Policy §5.E and the code has them.
- Input schemas are clean JSON Schema with required fields marked.

**The gap:** output shape is not documented in the tool schema. An LLM receiving the `get_rankings` response gets a raw JSON array but has no schema guidance for what `score`, `latency_p50`, `success_rate_7d`, `name`, `endpoint`, `capabilities` mean in context. The MCP spec allows an `outputSchema` annotation that most implementations don't use, but the tool description should at minimum say "returns a JSON array where each object has: name (string), score (0–100), latency_p50 (ms), success_rate (0–1)." Without this, an LLM is likely to relay the blob back to the user rather than reason over it.

**Fix:** add a one-sentence output shape description to each tool's `description` field. Example for `get_rankings`:
> "Returns a JSON array. Each object has: name (provider name), score (0–100 composite), latency_p50 (milliseconds), success_rate (0.0–1.0 from last 7 days), endpoint (URL), capabilities (array of strings)."

This is a 5-minute fix and meaningfully improves LLM comprehension.

---

## Criterion 3 — Auth Model

**Verdict: Not a blocker. Correct for the use case.**

No API key for read-only tools is the right call and is well-precedented in the Connectors Directory. The `/rankings` and `/receipts/:id` REST endpoints are already public and unauthenticated; the MCP tools are wrappers, not new surfaces.

Anthropic does not require auth for public-data tools. The absence of auth here is a feature (lower friction = higher adoption), not a gap.

The only risk: if TrustBench adds rate limiting later and an MCP client is hammering `get_rankings`, there's no per-client identity to throttle against. For now with current traffic volumes this is academic, not operational.

---

## Criterion 4 — Trust Surface / PII

**Verdict: One real issue. Needs a sentence in the privacy policy.**

Receipt data contains wallet addresses, payment amounts, and timestamps. These are inherently public on-chain data (the same information is visible to anyone with a block explorer and the tx hash). They are not traditional PII.

However: the combination of (receipt ID → wallet address + amount + capability + timestamp) creates a queryable fingerprint that links payment behavior to wallet identity. An agent calling `get_receipt` is retrieving this linked record and potentially exposing it to a user or downstream system.

The `/privacy` page at trustbench.io was created for the Connectors Directory submission. It needs one paragraph that explicitly says:

> "Receipts contain on-chain settlement data including wallet addresses and payment amounts. This data is inherently public (it exists on Base L2 and is verifiable by anyone with a tx hash). TrustBench does not associate wallet addresses with personal identities and does not enrich receipt data with off-chain identity information."

Without this, a Connectors Directory reviewer could flag the receipt tools as handling sensitive financial data without disclosure. With it, the framing is accurate and the concern is addressed.

This is a 20-minute privacy policy edit, not a code change.

---

## Criterion 5 — Competing Entries

**Verdict: No meaningful competition. Genuine differentiation.**

As of 2026-05-15, the MCP ecosystem has no established tools for:
- x402 payment receipt verification
- Ed25519-signed audit trail lookup
- On-chain payment settlement confirmation linked to a routing decision

The closest adjacent tools are generic blockchain explorer wrappers (fetch a tx from Etherscan/Basescan). TrustBench's differentiation is that the receipt binds the on-chain tx to a routing decision, capability, provider identity, and a cryptographic signature — none of which a block explorer tool provides.

The one risk: if Coinbase's CDP or a Nava Labs MCP tool ships a receipt-lookup tool before TrustBench gets listed, that narrows the differentiation angle. The directional call to move fast is correct.

---

## Criterion 6 — Liveness / Uptime

**Verdict: Moderate risk. Railway hobby tier is not enterprise-grade, but it's probably good enough.**

Anthropic's Connectors Directory doesn't publish explicit uptime SLAs for listed connectors, but connectors that are frequently unavailable get removed. Railway's hobby/starter tier has:
- Cold starts after periods of inactivity (typically 30–60 seconds for a tsx process)
- No automatic failover or redundancy
- Railway's stated availability is high (>99.5%) but not contractual at this tier

The `/mcp` endpoint cold-start problem is real: an agent that sends an MCP `initialize` request might time out if Railway is spinning up from cold. The Hono server starts quickly (sub-2s), but the Railway routing layer adds latency on cold start.

**Mitigation already in place:** the nightly pipeline (GitHub Actions at 03:00 UTC) hits the Railway URL, which prevents the longest cold starts. But if there's no traffic for several hours during the day, a cold start during directory evaluation is possible.

**Practical risk level:** low-medium. The directory review process probably doesn't hit the endpoint repeatedly. Post-listing, real user adoption drives traffic that prevents cold starts from being a recurring problem.

---

## Criterion 7 — The Stub-Early Strategy

**Verdict: Moot. Not a stub — full implementation is shipped.**

The plan's stub-early recommendation was prudent advice as of 2026-05-14. It's moot now: the full implementation exists in `src/mcp-http.ts` with real tool handlers calling internal Supabase + getRankings() directly (no HTTP loopback). This is better than a stub.

One note: the stdio server (`src/mcp-server.ts`) does call trustbench.io via fetch() rather than using internal imports, because it runs in a separate process. That's architecturally correct and not a problem, but it means the stdio server has one extra network hop that the HTTP server avoids.

---

## What the Connectors Directory Actually Requires (Checklist State)

Based on the Anthropic Connectors Directory submission requirements as of early 2026:

| Requirement | Status |
|---|---|
| Streamable HTTP transport (not stdio-only) | ✅ `POST /mcp` at trustbench.io |
| Privacy policy URL | ✅ `https://trustbench.io/privacy` exists |
| Terms of service URL | ✅ `https://trustbench.io/terms` exists |
| Tool annotations (title, readOnlyHint, etc.) | ✅ Present in mcp-tools.ts |
| No payment or custody in read-only tools | ✅ All three tools are read-only |
| Publicly reachable endpoint | ✅ Railway-hosted, DNS live |
| Logo URL | ✅ `https://trustbench.io/logo.svg` |
| Output field documentation | ⚠️ Missing from tool descriptions |
| Privacy policy addresses financial data | ⚠️ Needs wallet address paragraph |
| MCP protocol version compatibility | ⚠️ Pinned to `2024-11-05` — verify this is current |

The two warning items are both quick fixes. The MCP protocol version should be verified against current Anthropic documentation before submission — if the directory requires a newer handshake version, the `MCP_PROTOCOL_VERSION` constant in `mcp-http.ts` needs updating.

---

## Probability Estimate

**Anthropic Connectors Directory (the primary target):** 55–65% within 30 days of submission.

The two real blockers are:
1. **Review queue time.** Anthropic's connector review process is human-gated and can take 2–4 weeks. "30 days of shipping v1" is tight if submission isn't immediate. Submit today, not next week.
2. **Privacy policy gap.** The wallet address paragraph is missing. A reviewer who flags this kicks it back to the start of the queue. Fix it before submitting, not after.

If those two are resolved: odds go to 75–80%.

**agentic.market MCP listing:** 80%+ — lower bar, TrustBench is already known on that platform.

**Claude Desktop plugin registries / community lists:** 85%+ — these are typically self-serve with no human review.

---

## Recommended Action Sequence (in order)

1. **Today:** Add output shape documentation to all three tool descriptions in `src/mcp-tools.ts`. Five minutes.
2. **Today:** Add the wallet-address paragraph to `/privacy` (the `renderPrivacyHtml()` in `src/privacy-html.ts`). Twenty minutes.
3. **Today:** Verify `MCP_PROTOCOL_VERSION = '2024-11-05'` against current Anthropic MCP documentation. Update if needed.
4. **Then submit:** Anthropic Connectors Directory submission — use `https://trustbench.io/mcp` as the server URL.

The plan's other recommendations (npm publish, `skill.md` update, `README.md` Claude Desktop section) are all correct and worth doing, but they don't affect the directory approval decision. Do them in parallel, not as prerequisites.

---

## One Honest Structural Concern

The plan frames this as "directory position" and "early mover." That framing is right on the timing but optimistic on the mechanism. MCP directory listings generate discoverability, not adoption — an agent only calls `get_rankings` if it's already in an x402 context and looking for a provider. The directory puts TrustBench in front of Claude Desktop users browsing available tools, most of whom have no x402 context.

The higher-value adoption path is getting the MCP server URL into x402-adjacent documentation, SDKs, and partner codebases (Strata, Infopunks, QBT-Labs) where the x402 context is already present. Directory listing is necessary but not sufficient for meaningful tool call volume.

This doesn't argue against listing — it argues for doing both and not treating the directory listing as the growth lever.
