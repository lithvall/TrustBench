---
stance_version: 2026-08-14
stance_phase: phase-4-conversion-reassessment
stance_pillars: [canonical-receipt-format-standard, neutral-routing-receipt-layer]
---

# Next-session brief — MCP-provider landscape scan, then the cross-LLM loop

Commissioned by Johan 2026-08-14. Read `SESSION-2026-08-14-handoff.md` and `STANCE.md` first; this brief assumes both.

## Why this exists

On 2026-08-14 a competitor sweep of `xpaysh/awesome-x402` found **eight direct competitors that `COMPETITIVE-MEMORY.md` had never heard of** — three of them occupying the discovery-first position TrustBench adopted that same morning, two occupying Pillar 1. The index had been built from X, Reddit and direct discovery, and missed the single densest concentration of peers in the ecosystem.

That was one list, in one ecosystem (x402). **TrustBench's only surface with real adoption is its MCP server**, and the MCP ecosystem has never been swept at all. The working assumption that TrustBench's MCP tools are differentiated is exactly the kind of unvalidated belief that just cost six weeks elsewhere.

Full context for the x402 sweep: `competitive/DOSSIER-2026-08-14-awesome-x402-cluster.md`.

## Phase 1 — Deep research: the MCP-provider landscape

**Goal:** a broad map of the MCP server ecosystem, then a narrowing to what overlaps TrustBench.

**Sources to sweep** (each is a registry or list an agent sweep would enumerate):

| Source | Why |
|---|---|
| `registry.smithery.ai/servers?q=` | Has a JSON API. TrustBench is `lithvall88/TrustBench` there — 1,029 uses. Query broadly, not just for TrustBench. |
| `mcp.so` | Large public directory |
| `mcpmarket.com` | Directory with categories |
| `glama.ai/mcp/servers` | Directory with quality signals |
| `github.com/modelcontextprotocol/servers` | The official reference list |
| `awesome-mcp-servers` (search GitHub — several forks exist) | Community lists; the x402 lesson says these are what sweeps read first |
| Anthropic Connectors Directory | Curated, gate-kept. TrustBench's submission is under escalated review — see handoff §2 |

**Method, and it matters:** verify by live API call wherever an endpoint exists, and mark README/self-description claims as unverified. That distinction is what made the x402 dossier trustworthy — SmartFlow's README said 22,251 endpoints while its live API reported 79,567, and only one of those numbers is a fact.

**Then narrow.** From the broad sweep, pull anything that matches or closely correlates to TrustBench's lanes:

1. **Registry / directory MCP servers** — anything exposing a catalogue of services to agents. Direct competition for the discovery-first position.
2. **Payment / x402 / agent-commerce MCP servers** — MAKO already ships `mako-mcp-server` with route/pulse/pricing/reputation/verify as tools. Who else?
3. **Receipt / audit / attestation MCP servers** — Pillar 1 competition.
4. **Trust / scoring / reputation MCP servers** — ScoutScore's lane.
5. **Spend-control / policy MCP servers** — Sentinel and Paybound have non-MCP versions; MCP equivalents would be closer.

**Per subject that matches, document:** what it does, verified scale, tool surface (`tools/list` if remote and unauthenticated), whether tools are read-only or payment-capable, `commit_cadence` (per the rule added 2026-08-14 — a live HTTP 200 says nothing about whether anyone is working on it), and **what TrustBench can learn or adopt**. That last column is the point; the x402 dossier's value was the ranked improvement list, not the competitor inventory.

**Output:** `competitive/DOSSIER-<date>-mcp-landscape.md`, same shape as the x402 dossier. Update `COMPETITIVE-MEMORY.md` with an index entry; assign no severities until `commit_cadence` is checked.

**One constraint that is not optional:** the Anthropic Connectors Directory escalated review is OPEN (see handoff §2). Reading other people's MCP servers is fine. **Do not change TrustBench's MCP tool surface** — no new tools, no payment-capable operations. That freeze is grounded in Anthropic's own email, not inference.

## Phase 2 — The cross-LLM dialectic on the path forward

Once Phase 1 has produced a landscape, run the loop. Protocol and script are ported and **verified working**: `tools/CROSS_LLM_WORKFLOW.md`, `tools/ask_chatgpt.sh` (codex-cli 0.139.0, ChatGPT auth, smoke-tested 2026-08-14).

**The load-bearing questions to pose — open-ended, no Claude solution embedded:**

- Given zero paying agents in 93 days, a category where six comparable projects show the same zero, an MCP surface with 1,029 uses of unproven depth, and a competitive field far denser than assumed — what is the strongest path forward for TrustBench?
- Is discovery-first the right read of the evidence, or is it pattern-matching on the one surface that happened to have numbers?
- What would a version of TrustBench look like that is *not* a registry and *not* a router — and is that stronger?
- Which of the nine improvements in the x402 dossier are load-bearing, and which are busywork that feels like progress?

**Run it as a genuine dialectic.** Claude writes its own answer to these FIRST, to `out/chatgpt/path-forward_claude.md`, before composing the prompt. The prompt is open-ended. Then debate, rebut on the real disagreement, converge, and document both positions in `out/chatgpt/path-forward_converged.md`. Bring Johan the converged plan **and** the disagreement — not codex's raw output.

**Then the implement-and-check-back loop:** Claude implements what converged, then returns to codex with what actually happened — what shipped, what broke, what the evidence now says — and the loop continues. Each round starts from observed results, not from the previous round's plan.

## Sequencing

Phase 1 is a research pass and can run alone. Phase 2 needs Phase 1's landscape as input — the whole point is that the path-forward debate should be informed by what actually exists, which is precisely what was missing when discovery-first was chosen on 2026-08-14 with an eight-competitor blind spot.

## The kickoff prompt (paste this into a fresh session)

```
Read these in order before doing anything:
1. STANCE.md (rev 6)
2. SESSION-2026-08-14-handoff.md
3. NEXT-SESSION-2026-08-15-mcp-landscape-brief.md  (this brief)
4. competitive/DOSSIER-2026-08-14-awesome-x402-cluster.md
5. tools/CROSS_LLM_WORKFLOW.md

Then run `npm run callbacks` and `npm run stance-check`. Both were green at
the end of 2026-08-14, so anything red is new. Report it before proceeding.

PHASE 1 — deep research: the MCP-provider landscape.

Do for the MCP ecosystem what the x402 dossier did for awesome-x402. That
sweep found 8 direct competitors COMPETITIVE-MEMORY had never heard of, three
of them sitting in the discovery-first position TrustBench adopted the same
morning. TrustBench's only surface with real adoption is its MCP server, and
that ecosystem has never been swept at all.

Sweep: registry.smithery.ai (JSON API), mcp.so, mcpmarket.com,
glama.ai/mcp/servers, github.com/modelcontextprotocol/servers, awesome-mcp-
servers lists on GitHub, and the Anthropic Connectors Directory.

Then narrow to what matches or closely correlates to TrustBench's lanes:
registry/directory servers, payment/x402/agent-commerce servers,
receipt/audit/attestation servers, trust/scoring/reputation servers, and
spend-control/policy servers.

Per match document: what it does, VERIFIED scale, tool surface (tools/list if
remote and unauthenticated), whether tools are read-only or payment-capable,
commit_cadence, and — the actual point — what TrustBench can learn or adopt.

Method discipline, non-negotiable: verify by live API call wherever an
endpoint exists; mark README/self-description claims as unverified. In the
x402 sweep SmartFlow's README said 22,251 endpoints while its live API
reported 79,567. Only one of those is a fact. Assign no severities until
commit_cadence is checked — a live HTTP 200 says nothing about whether anyone
is working on it.

Output: competitive/DOSSIER-<date>-mcp-landscape.md, plus an index entry in
competitive/COMPETITIVE-MEMORY.md.

HARD CONSTRAINT: reading other people's MCP servers is fine. Do NOT change
TrustBench's own MCP tool surface — no new tools, nothing payment-capable.
The Anthropic escalated review is open and that freeze is grounded in their
email, not inference. See handoff §2.

PHASE 2 — the cross-LLM dialectic, after Phase 1 has a landscape.

Run it per tools/CROSS_LLM_WORKFLOW.md as a GENUINE DIALECTIC. Write your own
answer FIRST to out/chatgpt/path-forward_claude.md. Then compose an OPEN-ENDED
prompt with no solution of yours embedded. Then debate, rebut on the real
disagreement, converge, and write out/chatgpt/path-forward_converged.md with
BOTH positions. Bring me the converged plan AND the disagreement.

The questions to pose open-ended:
- Given zero paying agents in 93 days, a category where six comparable
  projects show the same zero, an MCP surface with 1,029 uses of unproven
  depth, and a competitive field far denser than assumed — what is the
  strongest path forward for TrustBench?
- Is discovery-first the right read of the evidence, or pattern-matching on
  the one surface that happened to have numbers?
- What would a TrustBench that is neither a registry nor a router look like,
  and is it stronger?
- Which of the nine improvements in the x402 dossier are load-bearing, and
  which are busywork that feels like progress?

Then implement what converged, and check back with codex against what
actually happened — not against the previous round's plan.

One more thing: if the 2026-08-21 scheduled task has already run, its
tools/call count is an INPUT to Phase 2. Heartbeat rather than real tool use
materially weakens the discovery-first premise the whole debate starts from.
Check before you begin Phase 2.
```

## Also on the timer, unrelated but do not miss

- **2026-08-21** — scheduled task `trustbench-mcp-log-read` fires. The `tools/call` count settles whether the 1,029 Smithery uses are real tool use or gateway heartbeat. **That number is an input to Phase 2** and materially changes the discovery-first read.
- **2026-08-17, 2026-08-20** — decision callbacks due. Run `npm run callbacks`.
- **2026-09-30** — Anthropic review check-back. Do not chase before then.
