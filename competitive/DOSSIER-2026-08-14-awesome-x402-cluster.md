---
stance_version: 2026-08-14
stance_phase: phase-4-conversion-reassessment
stance_pillars: [canonical-receipt-format-standard, neutral-routing-receipt-layer]
---

# Competitor dossier — the awesome-x402 Monitoring & Analytics cluster

Eight projects found 2026-08-14 while placing a TrustBench entry in `xpaysh/awesome-x402`. All sit in `Tools & Utilities → Monitoring & Analytics`, the same subsection as ScoutScore. **None were in `COMPETITIVE-MEMORY.md`.**

Scale claims here are **verified by live API call** where an endpoint existed, and marked as unverified README self-description where it did not. That distinction is load-bearing — see § Verification status per entry.

---

## The headline finding, before the individual entries

**TrustBench already holds the asset SmartFlow monetises, and is about to delete it.**

| | TrustBench | SmartFlow Mapper |
|---|---|---|
| Raw catalogue | **79,480** providers | **79,567** total_endpoints *(verified)* |
| Exposed publicly | 1,545 ranked / 6,477 in rollup | full catalogue via JSON REST API |
| Conformance metadata | `x402_verified` boolean | `payment_required_valid_v2: 20,459` *(verified)* |
| Monetised | no | **free tier + paid bulk export** |

Those catalogue numbers are within 0.1% of each other. Both are almost certainly crawling the same upstreams. The difference is not collection — it is **exposure**: TrustBench filters 79,480 down to 1,545 and discards the remainder as noise; SmartFlow publishes all of it with conformance and facilitator metadata and charges for bulk access.

**This directly contradicts a pending TrustBench decision.** The 2026-08-14 `MAX_PAGES` work flagged ~73k unprobed provider rows as accumulation with no retention policy, and the recommendation on the table was a pruning pass (deferred to Johan because deleting rows is destructive). SmartFlow's existence is evidence that the long tail is the product for someone, not dead weight. **Do not prune before deciding whether to expose.** Pruning is irreversible; the rows cost almost nothing to keep.

Caveat that keeps this honest: SmartFlow being listed and having an API does not establish that anyone *pays* for the bulk export. This quarter's pattern (Strata, MAKO, Infopunks, x402route — all dormant or dead behind live infrastructure) argues for checking their commit cadence before treating their model as validated. What the evidence *does* establish is that TrustBench's discarded tail is a plausible product, which is enough to stop a deletion.

---

## 1. SmartFlow Mapper API — registry at scale, monetised

`api.smartflowproai.com` · **verified live 2026-08-14**

Verified from `/v1/stats`, not from their README:
- `total_endpoints: 79,567`; `base_endpoints: 70,087`
- `payment_required_valid_v2: 20,459` — endpoints confirmed returning a valid **v2** 402
- Networks tracked: base, base-sepolia, solana, lightning, l402, mpp, stripe, tempo, stellar, eip155:1, eip155:137, plus multi-network combinations
- Registry sources aggregated: `bazaar_sweep`, `402index`, `x402scan_crawlv2`, `x402scan_probe`, `well-known-discovery`, `cdp_bazaar`, `apiosk-catalog`

Their README claim was "22,251+ catalogued" — the live figure is **79,567**, so they *understate* in the list. The 22,251 is close to their `payment_required_valid_v2` count, suggesting the README quotes conformant endpoints while the API reports everything.

**What TrustBench can take from this**
- **They are a meta-registry.** They aggregate 402index, x402scan, Bazaar and well-known discovery. TrustBench crawls agentic.market + Heurist only. Source diversity is cheap and directly widens coverage.
- **`payment_required_valid_v2` as a first-class field.** TrustBench has a boolean `x402_verified`; a *protocol-version* conformance count is more useful and is exactly the axis on which IBANforge (v1) differs from CMC/QuickNode (v2). TrustBench discovered that distinction manually today; SmartFlow tracks it as a column.
- **Free tier + paid bulk export** is a registry monetisation model that does not require routing volume — i.e. it works in a world where the routing thesis has not converted.

## 2. x402 List — agent-first directory, TrustBench's new positioning verbatim

`x402-list.com` · **verified live 2026-08-14**

Verified from `/api/v1/services`: **541 services**, paginated (25/page, 22 pages), with top-level `data` / `meta` / **`provenance`**.

Per-service schema, verified: `assessment`, `avg_response_time_ms`, `base_url`, `category`, `created_at`, `description`, `endpoint_count`, `last_checked_at`, `min_price_usd`, `name`, `networks`, `networks_caip2`, `payment_ready`, `slug`, `source`, `status`, `uptime_24h`, `verified`, `website_url`.

Their list entry advertises "JSON API, OpenAPI 3.1, llms.txt" — the same agent-facing surface stack TrustBench built.

**What TrustBench can take from this**

Their schema is *commercially* richer; TrustBench's is *telemetrically* deeper. Direct comparison against the 7-night rollup columns:

| They have, TrustBench does not | TrustBench has, they do not |
|---|---|
| `min_price_usd` — price is the first thing an agent filters on | `latency_p50` / `latency_p95` |
| `payment_ready` — can you actually pay this, now | `success_rate_7d` over a rolling window |
| `endpoint_count` per service | `samples_7d` — sample count, so consumers can weigh the number |
| `networks_caip2` — CAIP-2 identifiers, a standard | signed scorecards |
| `provenance` at the response level | on-chain-anchored receipts |

Three cheap, high-value adoptions: **price** (`min_price_usd`), **CAIP-2 network identifiers** (TrustBench stores friendly names like `base`; CAIP-2 `eip155:8453` is what the protocol actually uses and what a machine consumer wants), and **`payment_ready`** as distinct from "alive". A HEAD probe returning 402 means alive; it does not mean payable.

## 3. Assay — the paid quality oracle, and the sharpest critique of TrustBench's method

`assay.nominal-labs.com` · **verified live 2026-08-14** · est. 07·2026

Self-described "quality oracle for the x402 agent economy." Surfaces: Leaderboard, API, **Receipts**. Their tagline is a direct shot at label-based scoring: *"the testing of a metal to determine its purity; judgment of worth by trial, never by label."*

Their method per the list entry: **pays real USDC to probe machine-payable services on a schedule and scores what actually comes back.**

**This is the one that should sting, and it is the most useful entry here.**

TrustBench's honest-framing rule exists precisely because the nightly probe is a HEAD-request liveness check from a single host, sampled three times, treating 401/402/403/404/405/429 as "alive." Every public surface says so. Assay's entire product is the thing that limitation describes the absence of: paying, calling, and scoring the actual response.

And TrustBench **built this and paused it**. `.github/workflows/paid-probe.yml` exists; commit `21fe7f2` (2026-05-19) reads *"ops(paid-probe): pause workflow schedule pending root-cause fix."* It has been paused ~87 days.

**What TrustBench can take from this**
- The single highest-integrity improvement available is **un-pausing the paid probe**, not adding a feature. It converts "liveness telemetry" into "did the call actually work and return what it claimed," which is the difference between what TrustBench measures and what an agent needs.
- It would also retire the most-repeated caveat in TrustBench's own public copy.
- They emit **Receipts** too — worth reading their format against `receipt-spec-v1.md` before assuming differentiation.

## 4. Tersign — the closest thing to TrustBench's Pillar 1

`tersign.ai` · **verified live 2026-08-14** · *capability detail from README self-description, not independently verified*

"Neutral evidence layer for x402 agent commerce: seller-signed EIP-712 receipts and agent action records, counter-signed into per-seller hash chains on a public ledger, verifiable by anyone without an account, with refunds, deterministic dispute triage, and exportable evidence packs."

**Structural comparison with TrustBench's envelope**

| Property | TrustBench | Tersign |
|---|---|---|
| Signature | Ed25519 + JCS canonicalisation | EIP-712 typed data |
| Who signs | TrustBench (the router) | the **seller**, counter-signed by Tersign |
| Structure | independent per-call envelope | **per-seller hash chain** |
| Anchor | on-chain settlement tx_hash (Base) | public ledger |
| Offline verify | yes — standalone npm, published key | "verifiable by anyone without an account" |
| Beyond verification | — | **refunds, dispute triage, exportable evidence packs** |

**What TrustBench can take from this**
- **Hash-chaining is a real structural gap.** TrustBench receipts are independent envelopes; nothing binds receipt N to N−1. A chain makes omission detectable — you can prove nothing was removed from the record, which an independent envelope cannot. That is a meaningful audit property and it is a design question, not a feature request.
- **Seller-signed vs router-signed** is a genuine philosophical fork. TrustBench's model asserts what the router observed; Tersign's asserts what the seller committed to. Neither dominates, but TrustBench should be able to say why it chose one.
- **"Evidence packs" and "dispute triage" are the use-case layer** TrustBench has never built. Receipts answer "what happened"; disputes are why anyone needs that answer. Worth understanding before assuming the receipt alone is the product.

## 5. Mycelium Trails — dual-chain anchoring

`github.com/giskard09/giskard-stack` · *README self-description, not independently verified*

"Post-execution accountability receipts... `payment_hash` + `action_ref` (SHA-256 commitment) + **dual-chain anchor (Arbitrum One + Base)**. Verifiable by anyone. Usable for audits, disputes..."

**What TrustBench can take from this**
- **`action_ref` as a SHA-256 commitment to what the agent actually did** is a field TrustBench's envelope lacks. TrustBench records the payment and its settlement; it does not commit to the *action* the payment bought. That is the gap between "money moved" and "the thing was done," and it is exactly what an audit wants.
- Dual-chain anchoring is redundancy against a single chain's availability. Lower priority than `action_ref`, but it is a stated differentiator TrustBench cannot currently match.

## 6. Sentinel — spend caps as a standalone product

`sentinel.valeocash.com` · **verified live 2026-08-14** · built by Valeo

"Enterprise audit & compliance layer for x402 payments. Budget enforcement (per-call, hourly, daily), structured audit trails, real-time dashboard, and public payment explorer." Ships an npm SDK, `@x402sentinel/x402`.

**What TrustBench can take from this**
- TrustBench has per-call and per-day caps; Sentinel adds **hourly**, which is the window that actually catches a runaway agent before a daily cap notices.
- **A public payment explorer** is a discovery surface TrustBench partially has (`/explorer`) but does not promote.
- Note the framing they use freely and TrustBench deliberately avoids: "enterprise audit & compliance." That restraint is a real positioning choice (Example 5 of the six-question filter) — but worth revisiting *knowingly* rather than by inertia, since a competitor is claiming the vocabulary.

## 7. Paybound — open-source governance proxy

`github.com/pando-b/paybound` · *README self-description*

"Open-source governance proxy for x402 agent payments. Per-agent budgets, circuit breakers, SQLite audit trail."

**What TrustBench can take from this**
- **Circuit breakers** — trip and stop after N failures — are a policy primitive TrustBench does not have. Spend caps bound cost; circuit breakers bound *failure*, which is a different risk.
- Open-source and self-hostable is the opposite of TrustBench's hosted posture. That is a distribution strategy worth understanding: it trades revenue for adoption, which matters if adoption is the current bottleneck.

## 8. Cinderwright Discovery Hub — cross-protocol, already shipped

`api.ideafactorylab.org` · **verified live 2026-08-14** · *scale claim unverified*

"Cross-protocol discovery hub indexing 2,771+ AI agent payment services across x402, MPP, and L402/Lightning."

**What TrustBench can take from this**
- Cross-protocol coverage is TrustBench's **Phase 5 ambition**, gated behind "first paying agent." Someone has shipped a version of it already. That does not invalidate the phase gate, but it removes "we would be first" from the rationale.
- L402/Lightning is not on TrustBench's roadmap at all. SmartFlow also tracks `lightning` (360) and `l402` (93). Two independent operators indexing it is weak evidence it is worth knowing about.

---

## Verification status per entry

| Project | Live probe | Scale verified via API | Capability source |
|---|---|---|---|
| SmartFlow Mapper | ✅ 200 | ✅ `/v1/stats` | verified |
| x402 List | ✅ 200 | ✅ `/api/v1/services` | verified |
| Assay | ✅ 200 | — | landing copy + README |
| Tersign | ✅ 200 | — | README |
| Sentinel | ✅ 200 | — | README |
| Cinderwright | ✅ 200 | — | README |
| Mycelium Trails | not probed | — | README |
| Paybound | not probed | — | README |

**No severities assigned.** Per the rule added 2026-08-14, `commit_cadence` is required before ranking anything ≥3, and on this quarter's evidence — Strata, MAKO, Infopunks and x402route all dormant or dead behind live infrastructure — a live HTTP 200 says nothing about whether a project is being worked on. A follow-up pass should pull `pushed_at` for each repo before any of these enters the index with a severity.

## Ranked improvement list for TrustBench

Ordered by value-per-effort, all sourced from the above, none proposed as work here:

1. **Do not prune the 73k unprobed rows.** SmartFlow monetises the equivalent catalogue. Pruning is irreversible; keeping is nearly free.
2. **Un-pause the paid probe** (`21fe7f2`, paused 87 days). Retires TrustBench's most-repeated public caveat and closes the gap Assay's whole product occupies.
3. **Add `min_price_usd` and `payment_ready`** to the registry surface. Price is what an agent filters on first; "alive" and "payable" are not the same claim.
4. **Emit CAIP-2 network identifiers** alongside friendly names. Machine consumers want `eip155:8453`, not `base`.
5. **Track protocol version (v1/v2) as a column.** Discovered manually today via IBANforge; SmartFlow treats it as a field.
6. **Evaluate receipt hash-chaining** against Tersign's per-seller chains — omission-detection is an audit property independent envelopes cannot provide.
7. **Evaluate an `action_ref` commitment** against Mycelium's design — closes the gap between "money moved" and "the thing was done."
8. **Add source diversity to the crawler** — SmartFlow aggregates 402index, x402scan, well-known discovery. TrustBench crawls two sources.
9. **Consider hourly spend caps and circuit breakers** — Sentinel and Paybound respectively; both bound risks TrustBench's per-call/per-day caps do not.

Every item above is a *candidate*, not a commitment. Items 3-9 are product surface changes and need a six-question filter pass. Items 1 and 2 are reversals of existing decisions and belong to Johan.
