# Phase 4 — agentic.market + Coinbase Bazaar listing research

**Date:** 2026-05-11
**Status:** Research complete. Implementation work identified. No external submission yet.
**Supersedes:** `phase4-listing-plan.md` § 4 (Week 2 sprint) — the original plan assumed agentic.market and Bazaar were two separate submission flows. Research shows they are one.

---

## TL;DR — the load-bearing finding

**agentic.market and Coinbase Bazaar are the same listing.** Bazaar is the machine-readable index; agentic.market is the human-facing UI that renders the Bazaar catalog. There is no separate submission flow for either.

**The canonical listing mechanism is a side effect, not a form:**

1. Route your x402 verify+settle traffic through the **Coinbase CDP facilitator** (`api.cdp.coinbase.com/platform/v2/x402`) — not the public Foundation facilitator at `x402.org/facilitator`.
2. Register the **Bazaar discovery extension** on each route you want indexed via `declareDiscoveryExtension({ info, schema })` on top of `bazaarResourceServerExtension` from `@coinbase/x402`.
3. Have **at least one real on-chain settle** complete against that route through CDP. The first successful CDP-mediated settle triggers indexing.

Indexing is asynchronous and unpublished. Practitioner posts describe it as minutes-to-hours; there is no documented SLA, no human review step, no platform queue.

**Where TrustBench stands today:**

- ✅ **CDP facilitator path is live.** `src/paywall-handler.ts` `buildFacilitator()` (lines 226–238) imports `cdpFacilitatorConfig` from `@coinbase/x402` and uses it whenever `CDP_API_KEY_ID` + `CDP_API_KEY_SECRET` are set, which they are in prod per memory `project_phase4_1_3_preflight_2026_05_11.md`. First CDP-facilitated settle landed today: tx `0x5a558117...e89d92` on Base.
- ❌ **No Bazaar discovery extension registered.** Grep for `declareDiscoveryExtension` and `bazaarResourceServerExtension` across `src/` returns only comments and scratch worktrees. Production routes do not expose the extension, so no settle has triggered indexing.
- ❌ **`/route` is a quote endpoint, not a fixed-price resource.** Bazaar expects an indexable shape with a stable input/output schema. The two-step quote/settle pattern needs the **dynamic-routes** pattern documented at `github.com/x402-foundation/x402/docs/extensions/bazaar.mdx` — a small spike before committing the implementation.

**Bottom line:** the listing is one implementation away. No external submission, no platform review, no waiting. The work is on our side.

---

## What we now know about each "listing surface"

### agentic.market

| Question | Answer | Confidence |
|---|---|---|
| Who runs it? | Coinbase CDP | High |
| Is it separate from Bazaar? | No. Same catalog, different UI. | High |
| Submission form? | None. Listing is automatic via the CDP facilitator + Bazaar extension. | High |
| Submission PR / GitHub repo? | None. No curated catalog repo. | High |
| Auto-discovers via skill.md? | No. **`skill.md` is not what feeds agentic.market.** Only the Bazaar discovery extension does. Our existing skill.md is good for AEO and direct-agent crawl, not for agentic.market. | High |
| Email / DM fallback? | None published. Contact paths visible only via the agentic.market footer (Coinbase). | Medium |
| Review timing | Async after first CDP settle on a declared route. Minutes-to-hours per practitioner reports. | Medium |
| Networks accepted | Base, Polygon, Arbitrum, World, Solana mainnet; Solana devnet for testing | High |
| Existing listings (pattern-match) | OpenAI, Venice, Bloomberg, CoinGecko, Firecrawl, Alchemy, AWS Lambda, QuickNode, AgentMail, Browserbase, Prixe, EconDash | High (named at launch / in coverage) |

### Coinbase Bazaar

| Question | Answer | Confidence |
|---|---|---|
| What it is | CDP's discovery layer for x402 — a machine-readable catalog at `https://api.cdp.coinbase.com/platform/v2/x402/discovery/resources` (paginated) + `.../discovery/search` (semantic) | High |
| Submission form? | None. Same mechanism as agentic.market — extension + first settle. | High |
| Required facilitator | **CDP facilitator only.** Non-CDP facilitators (including `x402.org/facilitator` and PayAI's facilitator) do not produce Bazaar listings on their own. PayAI separately mirrors its merchants into Bazaar with opt-out, but that's PayAI-mediated, not the canonical path. | High |
| Fee to list | None. Standard x402 settlement fees only (USDC on Base is fee-free per CDP). | High |
| KYC / KYB requirements | CDP account required (Coinbase Business / CDP onboarding). KYT/OFAC compliance applies via CDP's normal flow; no explicit KYB threshold for sellers was surfaced. | Medium |
| Required SDK calls | `bazaarResourceServerExtension` (server middleware extension) + `declareDiscoveryExtension({ info, inputSchema, outputSchema, description })` per indexable route | High |
| `EXTENSION-RESPONSES` header | `processing` = accepted (indexing async); `rejected` = metadata invalid | High |

---

## Implementation gap to close before submission is even possible

This is the real work, ordered by dependency:

1. **Bazaar extension wire-up on `/route`.** Add `bazaarResourceServerExtension` + `declareDiscoveryExtension({ info, inputSchema, outputSchema, description })` to the Hono server for `POST /route`. Reference: `github.com/x402-foundation/x402/blob/main/docs/extensions/bazaar.mdx` + `examples/typescript/servers/bazaar`. Roughly half a day to a day of focused work.

2. **Dynamic-routes pattern for `/route`'s quote/settle two-step.** Standard Bazaar listings are fixed-shape resources. Our `/route` returns variable payment requirements per capability + amount. The dynamic-routes pattern (same doc page, "Dynamic routes" section) is the supported workaround. Read the doc, run a 30-minute spike against a staging endpoint, decide whether to (a) use the dynamic-routes annotation or (b) expose a small fixed-shape "trial" route alongside `/route` purely for Bazaar indexability.

3. **Trigger first indexable settle.** Once the extension is registered and a deployed agent settles one paid call against the declared route through CDP, indexing kicks off. Smoke run from a test wallet via `scripts/paywall-smoke.ts` (already exists, validated today) should suffice.

4. **Verify indexed.** Use the Seller Tool at `https://agentic.market/validate` (GET your endpoint URL, confirm it returns indexed). Once indexed there, it surfaces on the agentic.market homepage automatically.

---

## Lower-bar listing surfaces (do these in parallel)

These do not depend on the Bazaar extension and can ship any day:

- **PR to `Merit-Systems/awesome-x402`.** Add a TrustBench row to the curated list. Free, immediate, no platform review. Already in the Phase 4 plan § 4 Day 6.
- **GitHub topic tags.** Add `x402`, `agent-payments`, `routing`, `signed-receipts`, `non-custodial`, `mcp` to the TrustBench repo via the GitHub web UI. ~5 minutes.
- **Reach out to PayAI** about being mirrored into Bazaar if they accept non-PayAI-mediated submissions. Low-priority (the canonical path is the CDP-facilitator path), but worth noting as a fallback if the dynamic-routes work turns out to be more involved than expected.

---

## Public-copy drift surfaced during the research (separate from listing work)

`src/pricing-html.ts` lines 24 + 151 + 218 still claim the facilitator is `x402.org/facilitator`. Per `src/paywall-handler.ts` lines 226–238, production traffic now uses the CDP facilitator (`api.cdp.coinbase.com/platform/v2/x402`) whenever CDP creds are present. The lessons.md entry from today (2026-05-11) explicitly says the Foundation facilitator is testnet-only.

`skill.md` has a tail duplication at lines 206–213 (a stray re-fragment of lines 198–205). Classic Windows-mount-truncation gotcha per memory `feedback_windows_mount_truncation.md`.

Neither blocks listing. Both should be cleaned up before listing copy gets crawled by anyone, because the listing process will pull our skill.md + pricing page into the catalog metadata.

---

## Prerequisites or gotchas (TrustBench-specific)

| Gotcha | Status | Action |
|---|---|---|
| CDP facilitator required | ✅ already wired in prod | No action |
| Bazaar discovery extension | ❌ not registered | Wire `declareDiscoveryExtension` on `/route` |
| Fixed-shape route vs quote/settle | ❌ design decision pending | 30-min spike on dynamic-routes pattern |
| KYB onboarding via CDP | ✅ CDP account exists (CDP API keys live) | No action |
| Funded wallet to perform a settle | ✅ probe wallet has ~29.97 USDC (P4-1b state) | No action |
| Public copy accuracy (facilitator URL) | ❌ pricing-html.ts is stale | Update before listing copy gets crawled |
| skill.md duplication | ❌ tail fragment at lines 206–213 | Fix before any listing crawl |
| `/pricing` JSON facilitator field | ❌ still claims `x402.org/facilitator` (confirmed via direct fetch 2026-05-11) | Update `src/pricing-html.ts:151` and `:218` before any listing crawl picks it up |
| GitHub repo URL in public copy | ❌ canonical is `github.com/lithvall/TrustBench`, but submission packet drafts and several internal docs reference `trustbench/trustbench` | Sweep README + skill.md + llms.txt for the correct URL |

---

## Revised timing estimate

Per `phase4-listing-plan.md` § 4 the listing submission window was May 18–22. With the research finding that listing is implementation-side rather than submission-side, the new shape is:

- **Day A (any focused half-day):** Extension wire-up on `/route` + dynamic-routes spike.
- **Day B (any focused half-day):** Smoke a CDP-mediated settle against the declared route; verify via `agentic.market/validate`.
- **Day C (any quick session):** Quick wins (awesome-x402 PR, GitHub topic tags, stale-copy fixes).

Total: ~1.5–2 focused days of work. The original sprint plan's external-submission risk (review queues, feedback iteration) disappears because there is no external submission.

Friday 2026-05-22 is still well within reach. Earliest realistic listed date: Wednesday 2026-05-13 if Day A starts tomorrow.

---

## Sources

### agentic.market research path
- `https://agentic.market/` — homepage (fetched)
- `https://agentic.market/validate` — Seller Tools page (confirms "indexed on the Bazaar → automatically show up on agentic.market")
- `https://agentic.market/skill.md` — official x402 onboarding skill (not the submission path)
- `https://github.com/x402-foundation/x402/blob/main/docs/extensions/bazaar.mdx` — canonical extension spec
- `https://github.com/x402-foundation/x402/tree/main/examples/typescript/servers/bazaar` — reference server
- `https://x402.gitbook.io/x402/core-concepts/bazaar-discovery-layer` — discovery layer doc
- `https://www.coinbase.com/developer-platform/discover/launches/agentic-market` — launch announcement

### Coinbase Bazaar research path
- `https://docs.cdp.coinbase.com/x402/bazaar`
- `https://docs.cdp.coinbase.com/x402/welcome`
- `https://docs.cdp.coinbase.com/x402/quickstart-for-sellers`
- `https://docs.cdp.coinbase.com/api-reference/v2/rest-api/x402-facilitator/bazaar-mcp-server`
- `https://www.coinbase.com/developer-platform/discover/launches/x402-bazaar`
- `https://github.com/coinbase/x402/tree/main/examples/typescript/discovery`
- `https://pkg.go.dev/github.com/coinbase/x402/go/extensions/bazaar`
- `https://x.com/CoinbaseDev/status/1965445897489428869`
- `https://www.browserbase.com/blog/browserbase-and-coinbase-x402`
- `https://medium.com/@heimlabs/ship-a-402-powered-api-bazaar-with-x402-from-discovery-to-paid-response-in-one-script-cf08f3853b05`

### TrustBench-side verification anchored on current code
- `src/paywall-handler.ts:226-238` — `buildFacilitator()` confirms CDP facilitator is the live path
- `src/pricing-html.ts:24,151,218` — stale `x402.org/facilitator` references
- `skill.md:206-213` — tail duplication
- Grep for `declareDiscoveryExtension` / `bazaarResourceServerExtension` in `src/` — no production usage

---

## Decisions (locked 2026-05-11)

1. **Annotate `/route` with the dynamic-routes pattern** rather than expose a trial route alongside. Decided 2026-05-11. Logged in `decisions.md`. Run a 30-minute pre-commit spike against the documented bazaar.mdx dynamic-routes pattern before writing the full schema; if catalog rendering fails the spike, fall back to a trial route.

2. **Sequencing: quick wins + full stale-copy sweep done this session; extension wire-up next session.** Decided 2026-05-11. Quick wins were the awesome-x402 PR and GitHub topic tags (still pending — see § Next-session checklist). Sweep was done in this session — see § Sweep completed for the file list.

3. **Public-copy fix scope: full sweep.** Decided 2026-05-11. Files touched: `src/pricing-html.ts` (3 spots), `skill.md` (2 GitHub URLs + tail dup + facilitator copy), `README.md` (3 facilitator references including the Critic-pass kill criterion text), `llms.txt` (1 facilitator reference), `.well-known/trustbench.json` (description + `publicFacilitator` field renamed to `facilitatorUrl` + added `facilitatorDocs`). Intentionally NOT touched: `.env.example` (fallback default is legitimately the testnet URL), `paywall-handler.ts` comments (describe fallback path accurately), `scripts/facilitator-settle-test.ts` (testnet-only by design), historical phase docs + lessons.md (frozen records).

## Sweep completed in this session (2026-05-11)

| File | Change |
|---|---|
| `src/pricing-html.ts` | Lines 24, 151, 218 — `facilitator: "x402.org/facilitator"` → CDP facilitator with name + URL + docs link |
| `skill.md` | Tail duplication at 206-213 removed; 2 wrong GitHub URLs corrected to `github.com/lithvall/TrustBench`; facilitator copy at line 175 updated to CDP |
| `README.md` | Pricing model facilitator line, Phase 4 step-4 text, and Critic-pass kill criterion all updated to reflect CDP-is-live + Foundation-is-testnet-only |
| `llms.txt` | v0.1.0 live line at 105 updated |
| `.well-known/trustbench.json` | Pricing description + facilitator fields updated |

**Open verification:** `tsc --noEmit` via the Linux bash mount returned 5 parse errors across files I didn't touch this session, plus one on `pricing-html.ts:322`. The Read tool sees clean source at that line and proper file termination. Pattern matches the Windows-mount-truncation gotcha from memory `feedback_windows_mount_truncation.md`. Verify from PowerShell with `npx tsc --noEmit` before pushing.

## Next-session checklist (extension wire-up + parallel quick wins)

1. Read `github.com/x402-foundation/x402/blob/main/docs/extensions/bazaar.mdx` end to end, including the "Dynamic routes" section.
2. 30-minute spike: declare a placeholder Bazaar extension on a throwaway route locally; settle once via CDP; observe the `EXTENSION-RESPONSES` header. If `processing` returned, proceed with full wire-up. If `rejected`, read the reason and either iterate the metadata or fall back to a trial route.
3. Wire `bazaarResourceServerExtension` + `declareDiscoveryExtension({ info, inputSchema, outputSchema, description })` onto `POST /route`. Description copy comes from `phase4-submission-packet.md` (three-sentence version). Input schema comes from `/route` request body shape in `src/route-handlers.ts`.
4. Smoke a real CDP-mediated settle against the now-declared `/route` from a test wallet. Confirm `EXTENSION-RESPONSES: processing`.
5. Wait minutes-to-hours; check `agentic.market/validate` with `https://trustbench.io/route`.
6. In parallel (independent work, ~15 minutes total):
   - Open the PR to `Merit-Systems/awesome-x402` with the row from `phase4-submission-packet.md` § "For the awesome-x402 PR specifically."
   - Add GitHub topic tags via the GitHub web UI: `x402`, `agent-payments`, `routing`, `signed-receipts`, `non-custodial`, `mcp`, `usdc`, `base`, `eip-3009`, `ed25519`.
7. If indexed, append to `decisions.md`: "2026-05-XX: TrustBench listed on agentic.market / Bazaar."
8. If not indexed within 72 hours, grade the listing-path decision in `decisions.md` (status: rescheduled or disproven) and fall back to the trial-route shape.

---

## Fallback paths (if the canonical path turns out to be wrong)

- If `declareDiscoveryExtension` does not behave as documented, fall back to the **PayAI auto-mirror path** (be a PayAI merchant; PayAI mirrors merchants into Bazaar with opt-out per their facilitator docs).
- If CDP rejects our metadata after first settle, the `EXTENSION-RESPONSES: rejected` header should tell us the validation reason. Iteration loop is fast (each retry is one settle, ~$0.005).
- If both fail, DM @CoinbaseDev or Erik Reppel — the research surfaced no other contact path, but the Coinbase x402 team is responsive on X.
- If listing turns out to require something gated (volume thresholds, paid plans, etc.), document the gate and revisit. None of those gates appeared in the research.

---

## Cross-references

- `phase4-listing-plan.md` § 4 (Week 2 sprint) — partially superseded by this doc.
- `phase4-paywall-design.md` § Q6 (endpoint annotations) — already lists endpoint metadata that the Bazaar extension call can largely reuse.
- `phase4-1.3-preflight-runbook.md` — documents CDP facilitator wire-up that this listing depends on.
- `lessons.md` (2026-05-11) — "Foundation facilitator is testnet-only" lesson is load-bearing for the CDP-facilitator-required finding.
- Memory: `project_phase4_1_3_preflight_2026_05_11.md`, `project_skill_md_distribution.md`, `project_agent_discovery_surfaces.md`.
