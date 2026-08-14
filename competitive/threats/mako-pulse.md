---
name: MAKO Pulse
handle: "@ChrisDMacro"
url: "https://mako.pollinateresearch.com"
severity: 3
previous_severity: 4
last_scanned: 2026-08-14
category: direct-1to1
commit_cadence: "zero since 2026-05-14 (mako-mcp-server), 2026-05-13 (mako-verifier)"
---

## Capability snapshot (as of 2026-05-15)

- Pollinate Research project. Founder is @ChrisDMacro (chrisdmacro.base.eth, 12.1K X followers as of 2026-05-15).
- Signed-receipt scoring using EIP-191 signatures with a 60-second validity window.
  - Compare TrustBench: Ed25519 + JCS canonicalization, no expiry on the receipt itself, public verification key at `/.well-known/trustbench-pubkey`.
  - Open question for next scan: does MAKO publish their signing pubkey, or is verification gated through their API?
- MAKO Route composes three layers: Pulse (scoring) + Pricing + Reputation. Direct conceptual overlap with TrustBench's `/route`.
- 765 services tracked at observation time (their site, 2026-05-15).
- Reciprocal mapping confirmed: trustbench.io appears in their listing at score 99 TRUSTED, PAY-TO empty. They have indexed us; we are in their data.

## Pricing (as of 2026-05-15)

Unknown — needs first scan. High priority for the next pass: their pricing page, if any, and whether they charge per-call, per-receipt, or via subscription. If they're free, that's a different threat shape entirely (mindshare grab, not revenue overlap).

## TrustBench differentiator vs. MAKO Pulse — falsifiable form

Today, TrustBench's defenses vs. MAKO Pulse are:

1. **On-chain settlement anchor.** Receipt envelope carries `receipt.settlement.tx_hash` + `chain`. **To fail:** MAKO ships a settlement-anchored receipt envelope. **Observable signal:** their receipt format gains a `tx_hash` field or equivalent.
2. **No expiry on receipt validity.** Durable audit trail vs. MAKO's 60-second EIP-191 window. **To fail:** MAKO removes the expiry or ships a long-validity tier. **Observable signal:** their docs change.
3. **Public, immutable, no-auth audit URL.** `/receipts/:id` is fetchable by anyone forever. **To fail:** MAKO ships a public audit endpoint with similar properties. **Observable signal:** their URL structure exposes individual receipts to unauthenticated GET.
4. **Standalone npm verifier.** `@trustbench/verify-receipt` lets third parties verify offline; current at v0.1.2 (2026-05-15). **To fail:** MAKO publishes a third-party verifier (npm, pip, Go module). **Observable signal:** new package under MAKO / Pollinate Research org.
5. **Explicit non-custodial posture.** Written into product surface and CLAUDE.md as a hard rule. **To fail:** MAKO is also non-custodial (likely is — confirm next scan). **Observable signal:** their docs.

Defense (5) is probably already neutral, not a differentiator. Pending confirmation.

## Kill criterion

Any one of defenses (1), (3), or (4) being matched by MAKO closes a Pillar-1 differentiator. **If two of those land in the same quarter, TrustBench's signed-receipt-format moat is functionally gone and Pillar-1 strategy (Options A/B/C in `strategic-pillars-and-options-2026-05-14.md`) needs reassessment immediately.**

Separately: if MAKO Pulse gets featured by a Tier-1 facilitator (Coinbase x402 docs reference them, agentic.market promotes their routing layer above TrustBench's), that's a distribution kill criterion independent of feature parity.

## Adoption signals

- 765 services tracked (their site, 2026-05-15) — needs growth-rate measurement next scan.
- 12.1K X followers on @ChrisDMacro (2026-05-15).
- chrisdmacro.base.eth ENS — basename-native identity suggests Coinbase-ecosystem-aligned positioning.
- Unknown: GitHub presence, npm packages, partner integrations, total receipts signed. Investigate.

## Watch

Next scheduled scan: weekly per `weekly-scan-prompt.md`. **Specific questions for the next scan:**

- Their primary URL and product surface (confirm `mako.tools` or correct domain).
- Receipt format docs — has settlement anchoring landed?
- Public audit URL — can a third party fetch a MAKO receipt without auth?
- npm — is there a `@mako/verify-*` or `@pollinate/*` package?
- Service-catalog count — is the 765 number growing? At what rate?
- X engagement: is @ChrisDMacro posting about the routing layer (MAKO Route) specifically, or just about Pulse scoring? The former is the bigger threat.
- Funding / team — is this a solo project or backed? Affects velocity.

---

## Scan 2026-08-14 — identity resolved, severity 4 → 3

**URL confirmed at last.** The `url` field read `"verify on first scan (Pollinate Research / mako.tools?)"` for 89 days and "confirm the correct domain" was question #1 on the watch list. Resolved via @ChrisDMacro's X profile links: **Chris Dover**, chrisdover.com — *"Currently building MAKO — and contracting as a coding-agent product evaluator via micro1"*, and *"Built Pollinate Trading to $250K+ ARR. Prior 500 Startups exit."* MAKO lives at **mako.pollinateresearch.com**.

**A near-miss worth recording.** `makopulse.com` resolves and serves a polished product — but it is **generic website uptime monitoring** ("checks your sites from the US and Europe as often as every 30 seconds… AI diagnoses the root cause"), an unrelated company. This scan nearly filed "MAKO Pulse has pivoted off x402," which would have been wrong and would have driven a severity downgrade on false evidence. The guess-domain in the `url` field is what made that trap possible. *Rule:* never scan against an unverified domain; resolve identity from the operator's own profile links first.

### Capability (verified 2026-08-14, from public GitHub)

- **`ChrisDover/mako-verifier`** — *"Trust layer for agent commerce on Base. Verifier + Pulse + Pricing Index + Reputation Score, all callable as paid x402 endpoints. Live at mako.pollinateresearch.com."* Created 2026-05-07, **last pushed 2026-05-13**, TypeScript, 1 star.
- **`ChrisDover/mako-mcp-server`** — *"MAKO's paid x402 endpoints (route, pulse, pricing, reputation, verify) as installable MCP tools. Drop-in for Claude Desktop, Hermes Agent, OpenClaw, Cline, and any MCP-native agent."* Created 2026-05-09, **last pushed 2026-05-14**, TypeScript, 0 stars.

### Defense (4) survives — the verifier is not the same shape

The kill criterion said defense (4) falls if "MAKO publishes a third-party verifier (npm, pip, Go module)." A repo literally named `mako-verifier` exists, so on a filename read this looks fallen. It is not: their own description places the verifier among endpoints "callable as **paid x402 endpoints**" — a hosted, paid service. `@trustbench/verify-receipt` is a free standalone npm package that verifies **offline**, with no call to TrustBench at all. Those are different products serving different trust assumptions: verifying against the vendor's own API requires trusting the vendor; verifying offline against a published Ed25519 key does not. **Defense (4) holds.** Re-test if an `@mako/*` or `@pollinate/*` package appears on npm.

### Severity 4 → 3 — written downgrade reason (required by COMPETITIVE-BRIEF)

Capability overlap is unchanged and still direct — they ship route/pulse/pricing/reputation/verify as MCP tools, which is the closest 1:1 in the index. **Velocity is what changed: zero commits in 92 days across both repos.** A competitor with matching capability and no shipping cadence is a lower threat than one with both, and the index previously had no way to express that because commit cadence was not a tracked field. It is now, per the 2026-08-14 refresh note.

This is deliberately a one-step downgrade, not two. Their prober is still the single largest source of traffic to TrustBench `/route` — `mako-pulse-prober/0.1` sent **297 of 419 requests** in the 2026-07-25→08-01 Railway window — so the infrastructure runs and they are still actively measuring us. Dormant humans, live crons: the same shape as Strata and Infopunks this quarter.

**Upgrade trigger: any push to `mako-verifier` or `mako-mcp-server` returns this to severity 4 immediately.** Cheap to check — one GitHub API call on `pushed_at`.

### Note for the main project (report-only, no build recommendation)

`mako-mcp-server` exposes `route` and `verify` as MCP tools — i.e. payment-capable operations on an MCP surface. TrustBench has that exact move frozen for the duration of the Anthropic Connectors Directory review (`STANCE.md` out_of_scope). Reporting the observation and stopping, per scope: whether it changes TrustBench's sequencing is a main-project call behind the six-question filter.

### Still unknown after this scan

Pricing (their page was not reached), whether they publish a signing pubkey, whether a MAKO receipt is fetchable unauthenticated, current service-catalog count vs the 765 recorded 2026-05-15, and whether trustbench.io still appears in their listing at score 99 TRUSTED.
