# Strata (usestrata.dev) — Deep Dive Reference

**Status:** Reference document. Read before drafting the integration sketch and pricing sheet for Strata.

**Date:** 2026-05-07.

**Why this exists:** Johan is preparing an async reply + technical sketch for @stratamcp ahead of their Show HN (Tuesday). This document captures everything verified about Strata so the sketch can be specific to *their* product surface, not generic. Companion to `partnership-day-record-2026-05-07.md`.

---

## 1. Naming-collision warning (read this first)

There are **three different things called "Strata"** in the AI infrastructure space. They are not related. Don't confuse them in conversation.

- **Strata.io** — identity/IAM enterprise software company (orchestration layer for SSO/IAM). Not relevant to TrustBench. Different company entirely.
- **Klavis AI's Strata (YC X25)** — open-source MCP server from ex-Google DeepMind / ex-Lyft engineers, designed to help AI agents handle thousands of tools progressively. *Launch HN: Strata (YC X25)* on 2025-09-23. GitHub: `Klavis-AI/klavis`. Not the DM partner. Different company entirely.
- **Strata @ usestrata.dev (@stratamcp on X)** — *"The Trust Layer for AI Agents."* MCP-server scoring, agent identity, payment verification, data lineage. Built by **PThrower** (per GitHub Action handle). **This is the company that DM'd TrustBench.**

When writing the reply or any external comms, refer to them as "Strata" — that's how they refer to themselves — but be aware the name is genuinely contested in the ecosystem. If anyone asks for clarification, *"the trust-layer Strata at usestrata.dev"* is unambiguous.

---

## 2. Product overview (verified from landing page)

**Tagline:** *"The trust layer for AI agents. Security scoring, agent identity, payment verification, and data lineage tracking for the agentic economy."*

**Built by:** PThrower (handle on GitHub Action `PThrower/strata-mcp-check@v1`; landing page references *"Direct access to the builder"* in singular, suggesting solo or very small team).

**Stage:** Live with industry-scale data — **2,178 MCP servers scored, 22 AI ecosystems tracked, daily index updates.** Joined Twitter April 2026. Show HN planned for Tuesday.

**Stack:**
- TypeScript SDK `@strata-ai/sdk` — *zero-dependency, works in Node, browser, Bun, and Cloudflare Workers*
- GitHub Action `PThrower/strata-mcp-check@v1` — gates PRs against MCP config trust scans
- Native MCP server at `https://www.usestrata.dev/mcp`
- REST API at `usestrata.dev/api/v1/...`
- API key auth via `X-API-Key` header (or `Bearer` for MCP HTTP transport)

**Content pipeline (per a Skywork.ai writeup):** content is *"refreshed continuously through feeds that are scraped, validated by Claude for relevance, deduplicated, and written to Postgres. Claude-validated and injection-safe by design, with refreshes occurring twice daily via an automated pipeline."* So they use Anthropic's Claude API as part of their internal content moderation. Worth knowing because TrustBench can position Anthropic alignment similarly.

**Email:** support@usestrata.dev

---

## 3. The 9 tools (REST + MCP, all verified)

| Tool | Purpose | Relevance to TrustBench |
|---|---|---|
| `get_best_practices()` | Canonical patterns/anti-patterns per ecosystem | Low |
| `get_latest_news()` | Releases, deprecations, changelog deltas | Low |
| `get_top_integrations()` | Tools/SDKs/providers ranked by signal | Low |
| `search_ecosystem()` | Free-form semantic search across indexed corpus | Low |
| `find_mcp_servers()` | Search 2,179+ scored MCP servers | Low — adjacent registry, not direct overlap |
| **`verify_payment_endpoint()`** | **Trust scores for x402 payment endpoints before agent pays** | **HIGH — this is the integration point** |
| **`verify_agent_credential()`** | **Verify Ed25519-signed agent JWTs with live revocation check** | **HIGH — same signature scheme as TrustBench receipts; possible compose** |
| `track_data_flow()` | Record data flows between MCP servers (net_egress lineage) | Medium — could reference TrustBench receipts as data flow events |
| `get_threat_feed()` | Real-time alerts when servers change risk profile | Medium — TrustBench score drops could feed this |

The two HIGH-relevance tools are where the integration story lives. Specifically:

- **`verify_payment_endpoint()`** — Strata's stated value prop is *"score the x402 endpoint before your agent commits to paying it. Trust signal before settlement."* They check SSL validity, domain age, payment amount reasonableness, risk flags, with 24-hour cache. **TrustBench's nightly liveness telemetry would directly sharpen the runtime-side of this score** — that's the explicit ask in their reply.
- **`verify_agent_credential()`** — Ed25519-signed JWTs with revocation registry. Same signature scheme as TrustBench's receipt-spec-v1. Two possible directions: (a) Strata could verify TrustBench's signed receipts via this tool by accepting the receipt as a credential; (b) TrustBench's audit endpoint could expose receipts in a JWT format that's directly consumable by Strata's verifier.

---

## 4. Their two-score architecture (from their public reply on TrustBench's thread)

Quoted verbatim from the screenshot:

**security_score** — repo health, dependency audit, maintenance activity, license checks. *Static* signal, derived from analyzing the source repo of an MCP server.

**runtime_score** — live endpoint probing + static source analysis. Surfaces capability flags (`shell_exec`, `fs_write`, `secret_read`, `net_egress`, `arbitrary_sql`, `process_spawn`, `dynamic_eval`) plus 3-layer injection scanning. Per-tool not just per-server. Includes circuit breaker state. *Dynamic* signal, derived from probing live behavior.

**Payment layer:** `/x402/verify` scores an endpoint before any transaction fires — SSL validity, domain age, payment amount reasonableness, risk flags. 24-hour cache.

The runtime_score is the natural place TrustBench's nightly liveness data feeds in. Their static probing is presumably less frequent or less detailed than TrustBench's nightly probe; the integration story is *"Strata's runtime score gets sharpened by TrustBench's continuous liveness telemetry"* — they said this verbatim in their last reply.

---

## 5. Pricing (already public, no need to ask)

| Tier | Price | Limits |
|---|---|---|
| **Free** | $0 / forever | 100 calls/month, 5 core ecosystems, 24-hour news lag, weekly index refresh |
| **Pro** | $29 / month | 10,000 calls/month, all 22 ecosystems, 12-hour news, daily index refresh |
| **Founder Lifetime** | $100 one-time | Lifetime Pro access. Limited to 50 spots, 48 remaining as of read. Founding member badge, direct access to the builder. |

**Coming in Phase 5:** Multi-Agent Trust.

This pricing is informative for TrustBench's own pricing calibration:

- Strata's $29/month for 10K calls works out to **~$0.0029 per call effective price** (when usage hits the cap). That's an interesting reference point. It validates TrustBench's $0.001–$0.01 range as in-band.
- Strata's free tier (100 calls/month, 5 ecosystems) shows their willingness to give meaningful free usage for prototypes. TrustBench could mirror with a similar tier.
- The $100 lifetime founder-spot is a *novel* pricing instrument worth considering for TrustBench's own launch — it captures early enthusiasts at a one-time payment that doesn't lock in any ongoing burden for either party.

---

## 6. Where they overlap with TrustBench (and where they don't)

### Overlap (potential confusion, requires positioning care)

- Both verify x402 endpoints in some form
- Both score endpoint quality/trust
- Both use Ed25519 for signature verification
- Both probe live endpoints

### Non-overlap (the integration surface is here)

| Dimension | Strata | TrustBench |
|---|---|---|
| Timing | **Pre-call** (before agent pays) | **Post-call** (after settlement) |
| Surface scored | MCP server / x402 endpoint generally | Specific paid call instance |
| Output | Trust score (0–100 or similar) | Signed receipt with on-chain anchor |
| Audit trail | Threat feed + score history | Replayable signed receipts indexed by ID |
| Identity coverage | Agent credentials (verify) | Receipt provenance (issuer + payer + payee) |
| Compliance angle | SOC 2 / ISO 27001 audit packages | Tax/audit export of paid receipts |
| Settlement coverage | None (they verify, don't transact) | On-chain `tx_hash` + `block_number` |

The clean division: **Strata scores the endpoint, TrustBench proves the call.** Strata's reply says exactly this: *"Strata scores before the call, you verify after."*

The two products are complementary in the same way that Sentry (error monitoring) and DataDog (infrastructure metrics) are complementary — adjacent without being competitive.

---

## 7. Their stage and stage-fit with TrustBench

Both companies are in the same stage range:

- **Both solo or near-solo** (Strata refers to "the builder" singular; TrustBench is solo)
- **Both with shipped products** (Strata has 2,178 MCP servers scored; TrustBench has the milestone P4-1b receipt + nightly probing across the registry)
- **Both with public pricing** (Strata's tiers published; TrustBench's pricing model committed in `partnership-day-record-2026-05-07.md`)
- **Both pre-revenue or very-early-revenue** (Strata's lifetime founder offer at $100 × 48 remaining = max $4,800 captured; TrustBench's first paid receipt landed 2026-05-06)
- **Both with serious-builder posture** — clean docs, careful technical writing, no marketing fluff

This is a **partnership of equals**. Neither party has the leverage to dictate terms. Negotiation should be friendly, technical, async-first. Strata's *"open to a quick call before Show HN Tuesday"* is them being polite, not them having a power asymmetry. Johan can decline the call for now without burning capital.

---

## 8. What the Strata Show HN context probably looks like

The DM mentions *"our Show HN Tuesday."* Important details:

- **Show HN ≠ Launch HN.** Show HN is for showing things you've built. Launch HN is the official YC launch (which would only apply if they were YC-backed; as far as I can tell, usestrata.dev is NOT YC-backed — that's the *Klavis AI* Strata, a different company).
- The product is already live (Phases 3 & 4 shipped per their landing page, 2,178 servers indexed). The Show HN is likely launching specific new features (perhaps `verify_payment_endpoint()` and `verify_agent_credential()` together, since those are the most differentiated x402-era tools in their list) or marking a major milestone.
- *"Would be good to map out what a real integration looks like"* — they want a concrete TrustBench integration to *reference* during the Show HN, possibly to show *"we compose with X"* as part of their pitch.

Implication for the reply: a written sketch of the integration shape — even just a paragraph + a sample request flow — gives them something to *show* on HN if it helps. That's a deliverable they'd actually use, which makes the async response more valuable than a live call would be (you can give them a copy-pasteable artifact).

---

## 9. The integration sketch shape (for the reply / follow-up)

This is what to write when sending the actual integration sketch (after the initial async reply lands and acknowledges Tuesday's deadline).

**Three-step compose, both directions:**

**Direction A — TrustBench liveness data sharpens Strata's runtime_score:**

```
Agent → Strata.verify_payment_endpoint(url)
        ↓
Strata → TrustBench.GET /rankings?capability=X (cached, 24h)
        TrustBench returns {url, score, latency_p50, success_rate, last_probed}
        ↓
Strata → composes runtime_score using its own signals + TrustBench liveness
        ↓
Strata returns {trust_score, components: {static, runtime, payment_endpoint, ...}, sources: ["trustbench:..."]}
```

This is one read per pre-call from Strata's side. At scale, TrustBench's `/rankings` endpoint serves as a cheap data feed Strata pulls.

**Direction B — TrustBench receipt envelope optionally carries Strata's pre-call score:**

```
Agent calls Strata.verify_payment_endpoint(url) → gets trust_score, score_id
Agent passes score_id (or full score artifact) to TrustBench /route
TrustBench /receipts/:id includes optional field:
  routing.pre_call_trust: {
    source: "strata.usestrata.dev",
    score: 87,
    score_id: "strata_score_xxxx",
    fetched_at: "2026-05-07T..."
  }
```

This is one optional field in the receipt envelope. Stays additive, doesn't break existing verifiers, gives anyone reading a TrustBench receipt the ability to trace back to Strata's pre-call score.

**Direction C (longer-term) — Strata's verify_agent_credential() consumes TrustBench receipts:**

If TrustBench's receipts are reformatted to be JWT-encoded with the same Ed25519 + key-revocation pattern Strata uses, Strata's existing `verify_agent_credential()` tool can verify them natively. This is more work but produces deeper interop.

**Pricing notes for the sketch:**

- TrustBench's `/rankings` reads are $0.0005/call (cheapest tier; mostly cache hits)
- TrustBench's `/verify` calls are $0.002/call
- All paid in x402-native USDC on Base
- No subscription tier — pure pay-per-call
- Free tier could be added if Strata wants prototyping headroom (e.g., first 100 calls/month free per consumer)

The sketch can include a sample x402 request/response pair showing the wire shape, since both companies speak x402 fluently.

---

## 10. Practical takeaways for Johan

1. **Strata is a serious shop with shipped product at industry scale.** 2,178 MCP servers indexed isn't toy data. Their docs are clean. Their pricing is public. Their reply to TrustBench was specific and technical. This is a real partnership prospect, not a friendly tweet.
2. **They have explicitly proposed the integration shape.** *"Pre-call scoring + your signed receipts and liveness telemetry is a stronger stack than either of us ships alone."* You don't have to invent the partnership story; just respond to theirs.
3. **The Tuesday Show HN deadline is real but not blocking.** A written sketch sent before Monday gives them something to reference. If they Show HN before the sketch lands, they'll mention TrustBench-as-prospective-partner without specifics, which is still helpful.
4. **Pricing alignment is good.** Their $29/mo Pro for 10K calls implies a per-call price around $0.003. TrustBench's proposed $0.001–$0.01 range is in-band. No friction expected.
5. **No live call required.** A written sketch handles the technical depth without requiring you to perform technical fluency in real time. This is the form of partnership negotiation best fitted to your stated working preference.
6. **The composition story strengthens TrustBench's position more than Strata's.** Strata is already at 2,178-server scale; the partnership is incremental for them. For TrustBench, having Strata reference *"we compose with TrustBench's liveness telemetry"* on Show HN is a meaningful credibility moment. The asymmetry is in your favor *as a beneficiary*; that's worth treating their request seriously and responding promptly.

---

## 11. What's still unknown

Honest list of things this deep-dive did not establish:

- Whether usestrata.dev has any external users / paying customers beyond the founder offer
- Whether they have any non-YC funding (no info found)
- Whether PThrower is the founder's full handle or something more recoverable
- Strata's actual transaction or read-volume on their API today
- Whether their roadmap formally references x402 verification beyond the existing `verify_payment_endpoint()` tool
- The exact contents of their planned Show HN announcement

These don't block the reply or the sketch. They're notes for future follow-up — possibly questions for Johan to ask in the integration follow-up message.

---

## 12. Sources

- [usestrata.dev landing page](https://usestrata.dev/) — verified directly
- [Strata by PThrower on Glama](https://glama.ai/mcp/servers/PThrower/Strata)
- [Skywork.ai Strata MCP deep dive](https://skywork.ai/skypage/en/unlocking-agentic-ai-strata-mcp-server/1978737040170799104)
- [Klavis AI Strata launch tweet](https://x.com/Klavis_AI/status/1970140203575861611) — for naming-collision verification only
- [Hacker News Launch HN: Strata YC X25](https://news.ycombinator.com/item?id=45347914) — naming-collision context only
- Internal: `partnership-day-record-2026-05-07.md`, `phase6-reassessment-2026-05-07.md`, `trustbench-reliability-pivot-verification-2026-05-07.md`
