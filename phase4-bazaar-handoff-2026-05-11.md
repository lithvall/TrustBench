# Phase 4 — Bazaar listing handoff (2026-05-11)

**Status:** Wire-up infrastructure SHIPPED to prod. CDP indexing NOT yet validated.
**Created:** 2026-05-11, end of a focused 3-hour wire-up session.
**Read order for the next session:** this file FIRST. Then `phase4-listing-research.md` for the original research, `decisions.md` 2026-05-11 entries for the locked decisions, `lessons.md` 2026-05-11 entries for the assumption-class failures we hit. `phase4-bazaar-extension-runbook.md` is **partially superseded** by this doc — read only its § 1 (pre-read links) and § 8 (out of scope) sections; the rest was designed against an API that didn't match the shipped package.

---

## TL;DR — what's ready, what's blocked, what's next

### Ready (ships waiting for a paying agent + a conformant provider)

- `@x402/extensions` v2.11.0 installed and importing cleanly.
- `src/bazaar-extension.ts` builds correct Bazaar discovery declarations at module init for both `/route` and `/test/bazaar-spike`, with manual POST method-injection mirroring the package's `enrichDeclaration` logic byte-for-byte.
- `src/paywall-handler.ts` `build402()` accepts an optional `bazaarExtension` and embeds it at `body.extensions.bazaar` in the 402 response per CDP doc § Extension architecture.
- `src/index.ts` attaches the per-route declaration to Hono context via a tiny inline middleware before `paywallGate`, so the production code path picks up the extension without any other touch points.
- **The 402 wire shape is validated.** Direct curl against `/test/bazaar-spike` returned the canonical `BodyDiscoveryExtension` shape byte-for-byte (info.input + info.output + schema all present, `method: "POST"` injected correctly).
- Two env flags default-OFF: `TRUSTBENCH_BAZAAR_EXTENSION_ENABLED` (production /route) and `TRUSTBENCH_BAZAAR_SPIKE_ENABLED` (throwaway spike route).
- `scripts/bazaar-spike-smoke.ts` + `npm run smoke:bazaar-spike` exist as the smoke harness.

### Blocked (why the spike couldn't validate CDP indexing today)

Two architectural blockers, both pre-existing, both deferred:

1. **`paywallGate` is route-coupled, not generic.** It validates `/route`-specific body fields (`capability` enum etc.) and does `/route`-specific provider selection inline. The spike route's `{ message: string }` body fails validation with 400 before any payment processing happens. The throwaway-spike pattern in the original runbook assumed paywallGate was a generic payment middleware; it isn't.
2. **No live conformant upstream provider exists for the primary capabilities right now.** Per the v0.1.0 paywall smoke S2 outcome (memory `project_phase4_1_3_preflight_2026_05_11.md`), the only known-reliable `data` provider (Infopunks cognition layer) is suspended. paywallGate is fail-safe: if upstream probe fails, it returns 503 BEFORE charging, so no settle happens and no CDP indexing happens. This is the v0.2.0 registry-conformance work that's already on the roadmap.

Until both are resolved, **no real CDP-mediated settle can run end-to-end**, so we cannot observe `EXTENSION-RESPONSES: processing` and we cannot verify cataloging on agentic.market.

### What this means today

Flipping `TRUSTBENCH_BAZAAR_EXTENSION_ENABLED=true` is **safe** (wire shape validated, fail-safe default if anything goes wrong) but **likely a no-op** until a paying agent calls a capability with a conformant provider. The infrastructure is correct and ready; whether it indexes anything depends on traffic + registry health.

---

## What the next session needs to do, in order

Two distinct paths. Pick one per session — they shouldn't be mixed.

---

## Path P — Pragmatic ship (single focused 2-3 hour session)

**Goal:** validate CDP indexing end-to-end against the production `/route` today. Lock the listing on agentic.market.

**Pre-read:**
- This file's "Ready" section above.
- `src/paywall-handler.ts` lines 560-880 (the gate logic + body-validation pattern, so you understand what you're working around).
- The current `/rankings` content for each capability (you'll need to find one with a working provider).

### Step P1 — EXTENSION-RESPONSES passthrough (~30 min, low-risk)

`paywall-handler.ts` currently swallows all facilitator response headers. We need to forward `EXTENSION-RESPONSES` from the facilitator's settle response to our 200 response so the smoke harness can see indexing signal.

Edit `paywall-handler.ts` around line 752 (the settle call). After `settleResp = await facilitator.settle(...)`, capture any extension-response metadata from the response and re-emit on the 200 we return at line 847.

The `HTTPFacilitatorClient.settle()` response type may or may not expose response headers directly. Two backup paths:
- (a) If the SDK exposes response headers, forward `EXTENSION-RESPONSES` directly.
- (b) If not, log it with `console.log('[paywall] EXTENSION-RESPONSES:', value)` so the value lands in Railway logs. The smoke harness already documents the Railway-log-grep fallback.

This is non-revenue-bearing logic. Critic-pass-discipline still applies (write failure-mode paragraph) but the change is small enough that risk is low.

### Step P2 — Find one live conformant provider (~30 min, exploratory)

```powershell
foreach ($cap in @('search', 'inference', 'data', 'media', 'infra')) {
  Write-Host "`n=== $cap ==="
  curl.exe -s "https://trustbench.io/rankings?capability=$cap" | ConvertFrom-Json | Select-Object -ExpandProperty providers -ErrorAction SilentlyContinue | Select-Object -First 3 url, score, p50_ms
}
```

For each capability's top-ranked provider, POST a `{}` body directly and check what they return. A conformant x402 v2 provider returns 402 with valid `accepts[0]`:

```powershell
$probe = curl.exe -s -X POST "<provider-url>" -H "Content-Type: application/json" -d "{}" -i
$probe
```

Capability with at least one provider returning clean 402 + valid `accepts[0]` is your target.

If NO capability has a working provider, abort Path P and switch to Path R (principled refactor). Indexing today is not achievable.

### Step P3 — Run a real settle through `/route` with the working capability (~15 min)

The existing `npm run smoke:paywall` script (`scripts/paywall-smoke.ts`) already tests `/route`. It defaults to `capability: 'search'` in S2. If your Step P2 found a working `search` provider, just run it. Otherwise edit S2's body before running.

**Before running:** flip `TRUSTBENCH_BAZAAR_EXTENSION_ENABLED=true` on Railway. Wait for redeploy. Confirm boot log shows `extensionEnabled=true`.

Then:

```powershell
npm run smoke:paywall
```

S2 should pass (`✓ STEP 2: settle succeeded, status 200`). With the Step P1 changes, the response or Railway logs should show `EXTENSION-RESPONSES: processing`.

### Step P4 — Verify CDP indexing (~15 min after first settle)

CDP cache delay is ~10 min documented. Wait 15 min, then:

```powershell
curl.exe -s "https://api.cdp.coinbase.com/platform/v2/x402/discovery/merchant?payTo=$($env:TRUSTBENCH_REVENUE_WALLET_ADDRESS)" | ConvertFrom-Json | ConvertTo-Json -Depth 5
```

If you see `https://trustbench.io/route` listed under `resources[]` — listing landed.

Also check the human view:
```
https://agentic.market/  → search for "trustbench" or scroll Infrastructure category
```

### Step P5 — Parallel quick wins (~15 min)

Once indexing confirmed (or even before, since these are independent):
- Open the awesome-x402 PR. Body + commit message + row text are in `phase4-submission-packet.md` § "For the awesome-x402 PR specifically". Repo is `Merit-Systems/awesome-x402`, default branch is `master` (not main), 36 open PRs in queue so don't expect same-day merge.
- Add GitHub topic tags via the GitHub web UI on `https://github.com/lithvall/TrustBench`: `x402`, `agent-payments`, `routing`, `signed-receipts`, `non-custodial`, `mcp`, `usdc`, `base`, `eip-3009`, `ed25519`.

### Step P6 — Lock + decision-grade (~15 min)

- Grade `decisions.md` 2026-05-11 entry "Pursue Bazaar listing via in-code declareDiscoveryExtension..." as `status: validated` (or `disproven` with the assumption-class failure).
- Append a new Decision Journal entry: "2026-05-XX: TrustBench listed on agentic.market / Bazaar via /route with capability=X. Reason: ..."
- Write a memory entry `project_listing_live_YYYY_MM_DD.md` with: indexing latency observed, the EXTENSION-RESPONSES value, the agentic.market card content, any rendering oddities.
- Compose a build-in-public X post (per `feedback_no_em_dashes_outreach.md` style rules).

**Success criterion for Path P:** TrustBench appears in `https://agentic.market/` Infrastructure category within 1 hour of the first successful `/route` settle. Or the same URL appears in the CDP merchant-discovery JSON.

**Failure criterion:** `EXTENSION-RESPONSES: rejected` or no indexing after 1 hour. If rejected, the rejection reason from the facilitator names the JSON Schema validation failure — iterate `ROUTE_CONFIG` in `src/bazaar-extension.ts` and retry. Cost per retry: $0.005.

---

## Path R — Refactor (multi-week, multi-session, 11-18 focused hours)

**Goal:** decouple `paywallGate` from `/route`-specific logic so any paywalled endpoint can plug into the payment middleware. Enables the spike route to actually work, enables future v0.2.0 paid endpoints (`/score-provider`, `/verify`, `/audit-replay`), enables clean Bazaar-style throwaway tests.

**This is Phase 5 work, not Phase 4.** Do NOT start until either Path P has shipped and validated the wire shape end-to-end, OR Path P proved infeasible because no capability ever has a conformant provider.

### Phase R-A — Decouple paywall middleware (4-6 hours)

**Read first:**
- `src/paywall-handler.ts` end-to-end (~900 lines)
- `src/route-handlers.ts` end-to-end (`quoteHandler`, `settleHandler`)
- `phase3-x402-construction.md` (Phase 3 design)
- `phase3-idempotency-design.md` (idempotency semantics)
- `phase3-spend-caps.md` (reservation logic)
- `receipt-spec-v1.md` (signed receipt envelope)

**Design constraints:**
- Existing `/route` behavior MUST be preserved (revenue-bearing surface).
- Idempotency key + body-hash discipline lives in `withIdempotency` — needs to stay correct through the rewrite.
- Spend-cap reservation logic in `requireWithinSpendCap` needs to interact correctly with the new middleware boundary.
- Routing receipt body shape MUST stay stable (signed; downstream consumers + npm verifier verify against it).
- The new payment middleware must work with both `paid` and Bearer-`tb_live_…` auth paths during the transition window.

**Design pass — what to write before any code:**
1. New middleware: `paymentMiddleware` (or `verifyAndSettle`). Single responsibility: read `X-PAYMENT`, validate against expected `PaymentRequirements`, verify via facilitator, settle via facilitator, attach settle-result + receipt-payload to context, call `next()`.
2. Modified `quoteHandler` in `route-handlers.ts`: takes settle-result from context, owns body validation + provider selection + receipt construction. Becomes route-specific.
3. New middleware: `requirePaymentForRoute(requirementsBuilder)` — constructs the `PaymentRequirements` per-route via a builder function (different routes have different prices). Returns 402 if no X-PAYMENT, else calls `paymentMiddleware`.
4. Receipt signing remains in `route-handlers.ts` since the receipt body is route-specific.

**Critic pass on the design before code:**
- Three rejection reasons a hostile reviewer would give.
- The strongest counter-thesis ("just keep paywallGate route-coupled, add per-route validators").
- A hidden assumption that, if wrong, breaks the design.
- A kill criterion ("if X is observed in Y weeks, abandon the refactor").

**Smoke tests for the refactor:**
- Existing `npm run smoke:paywall` MUST pass S1-S4 unchanged.
- Idempotency replay path MUST return identical receipt + `replayed_at` marker.
- Spend-cap reservation must release on error paths (P4-7 invariant).
- Bearer-token-auth path on /route MUST work alongside x402-paywall path.

### Phase R-B — Forward facilitator response headers (1-2 hours)

Smaller change, can land in the same session as R-A or separately. Forward `EXTENSION-RESPONSES` and any future facilitator-emitted headers from the settle response to the client response. Without this, indexing signal is invisible to the calling agent.

Implementation depends on whether the `HTTPFacilitatorClient` exposes raw response headers. If yes, forward directly. If no, log at info level so it lands in Railway logs.

### Phase R-C — Registry conformance v0.2.0 (4-8 hours)

This is the OTHER blocker for Path P working. Without conformant providers, the paywall fail-safes return 503 and no settle happens.

**Design:**
- Add periodic POST-probe job (alongside the existing nightly HEAD-probe job).
- POST probe sends `{}` body + checks for 402 + parseable v2 `accepts[0]` shape (right scheme, right network, right asset structure).
- Score down providers that fail POST conformance.
- Capability-coverage monitor: alert if any capability has zero conformant providers.

**Spec to write first:** `phase5-registry-conformance.md` with the probe definition + scoring rule + failure-mode analysis.

### Phase R-D — Bazaar spike end-to-end (~1 hour)

After R-A + R-B + R-C land, the spike route designed in `src/bazaar-extension.ts` actually works because:
- `paymentMiddleware` is route-agnostic (no body validation rejection on spike body).
- `EXTENSION-RESPONSES` is visible.
- `/route` has live conformant providers across capabilities.

Run `npm run smoke:bazaar-spike` — see `EXTENSION-RESPONSES: processing` — wait 15 min — verify on agentic.market. Same flow as Path P Step P4, just using the spike route as the test target.

### Phase R-E — Flip production `/route` flag (~30 min)

Same as Path P Steps P3-P5 but cleaner because we've already validated the schema via the spike. Index `/route`, open awesome-x402 PR + GitHub tags, decision-grade.

---

## What we learned today (worth preserving for any future Bazaar work)

1. **WebSearch result snippets can fabricate API surfaces.** The original "dynamic-routes pattern" we locked in `decisions.md` 2026-05-11 was a hallucination from a research-agent summary. The actual CDP Bazaar docs describe no such pattern. The lesson is captured in `lessons.md` 2026-05-11 — verify against canonical sources (vendor docs, source code) before locking decisions.

2. **The CDP doc and the shipped package disagreed twice.** The doc described `bazaarResourceServerExtension` as a middleware function; the package ships it as an object with `key` + `enrichDeclaration`. The doc described a "dynamic-routes pattern"; the package has no such concept. Always reach for the `.d.ts` files in `node_modules/<pkg>/dist/cjs/` before trusting either doc or summary.

3. **The wire shape that worked** is `body.extensions.bazaar = { info: {...}, schema: {...} }` at the top level of the 402 response body. NOT inside each `accepts[]` entry. Confirmed via direct curl 2026-05-11.

4. **Manual POST method-injection works** as a substitute for calling `enrichDeclaration` with a Hono-incompatible `transportContext`. The package's `enrichDeclaration` source (which I read directly) just adds `method` to `info.input` and to the schema's required list — pure data transformation. Replicated in `enrichForPost()` in `src/bazaar-extension.ts`.

5. **`paywallGate` is `/route`-coupled.** Treat it as `/route`-specific until Phase R-A refactors it. Any new paywalled endpoint (v0.2.0 score-provider, verify, audit-replay) will face the same coupling problem.

6. **CDP indexing requires a successful settle, not just a 402.** The 402 wire shape with `extensions.bazaar` is necessary but not sufficient. The full verify+settle flow against CDP must complete for cataloging.

---

## Files touched this session (committed in `0c866ce` and follow-ups)

- `src/bazaar-extension.ts` — new module
- `src/index.ts` — wire-up + context attachment middlewares
- `src/paywall-handler.ts` — `build402()` accepts optional bazaar extension; `paywallGate` reads from context
- `scripts/bazaar-spike-smoke.ts` — spike smoke harness (deletable after Path P or R-D ships)
- `package.json` — `@x402/extensions ^2.11.0` dependency + `smoke:bazaar-spike` script
- `.env.example` — two new flags documented
- `phase4-bazaar-extension-runbook.md` — partially superseded by this doc
- `phase4-listing-research.md` + `phase4-submission-packet.md` — sharpened framing
- `decisions.md` — three Decision Journal entries 2026-05-11
- `lessons.md` — two lesson entries 2026-05-11

## Files to delete after Path P or R-D succeeds

- `scripts/bazaar-spike-smoke.ts` (spike-only smoke)
- The spike route block in `src/index.ts` (`isBazaarSpikeEnabled()` conditional)
- The `spikeBazaarExtension` + `SPIKE_CONFIG` + `spikeHandler` exports from `src/bazaar-extension.ts`
- The `TRUSTBENCH_BAZAAR_SPIKE_ENABLED` env flag entries
- The `phase4-bazaar-extension-runbook.md` file (this handoff supersedes it)

---

## Cross-references

- `phase4-listing-research.md` — original research, including the agentic.market = Bazaar finding
- `phase4-submission-packet.md` — copy reservoir for descriptions, PR text, etc.
- `phase4-bazaar-extension-runbook.md` — original runbook (partially superseded — use § 1 + § 8 only)
- `decisions.md` 2026-05-11 entries — pursue-listing decision, dynamic-routes decision (disproven), sequencing decision
- `lessons.md` 2026-05-11 entries — multi-surface-sweep pattern, WebSearch-hallucinated-API pattern
- `phase4-1.3-preflight-runbook.md` — v0.1.0 paywall context (Infopunks suspension, provider coverage)
- `partnership-day-record-2026-05-07.md` — strategic frame (component-in-stack, x402-paywalled API)
- Memory: `project_listing_research_2026_05_11.md`, `project_phase4_1_3_preflight_2026_05_11.md`, `project_infopunks_pivot_to_paysh_radar_2026_05_11.md`
