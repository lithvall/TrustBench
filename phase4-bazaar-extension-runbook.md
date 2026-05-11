# Phase 4 — Bazaar extension wire-up runbook

> **PARTIALLY SUPERSEDED 2026-05-11 (end of day).** Most of this runbook was
> designed against an API shape that didn't match the shipped
> `@x402/extensions` v2.11.0 package. The corrections, the actual integration
> as shipped, the pragmatic next-session path, and the principled refactor
> are all consolidated in **`phase4-bazaar-handoff-2026-05-11.md`** — read
> THAT FIRST for any future Bazaar work.
>
> Sections that survived the day are § 1 (Pre-read links — still useful) and
> § 8 (Out of scope — still binding). § 2 (spike) and § 3 (composition)
> describe an API surface that doesn't exist in the shipped package; their
> replacements live in `src/bazaar-extension.ts` + `phase4-bazaar-handoff-2026-05-11.md`
> § Path P + Path R.
>
> Do NOT delete this file — it has historical value as the design pass that
> exposed the doc/package divergence. The lesson is captured in `lessons.md`
> 2026-05-11 "WebSearch result snippets can fabricate API surfaces".

**Status:** Partially superseded (see banner above).
**For:** historical reference of the original design + the doc/package divergence story.
**Created:** 2026-05-11 (after `phase4-listing-research.md` locked the listing path).
**Prerequisite for any actual Bazaar work:** read `phase4-bazaar-handoff-2026-05-11.md` first.

---

## 0. What this session is doing

Wire `bazaarResourceServerExtension` + `declareDiscoveryExtension({ info, schema })` onto `POST /route`, settle one paid call through the Coinbase CDP facilitator against the now-declared route, and trigger first indexing on Bazaar / agentic.market.

Decision anchors (locked 2026-05-11 in `decisions.md`):
- Pursue listing via in-code extension + first-CDP-settle (no external submission).
- Use the **dynamic-routes pattern**, not a trial route alongside.
- 30-min pre-commit spike against a placeholder route before touching production `/route`.

---

## 1. Pre-read (do this in order, ~30 min)

1. `github.com/x402-foundation/x402/blob/main/docs/extensions/bazaar.mdx` — full doc. Pay special attention to:
   - "Dynamic routes" section.
   - The `EXTENSION-RESPONSES` header lifecycle (`processing` vs `rejected`).
   - JSON Schema validation rules — Bazaar is strict on schema shape.
2. `github.com/x402-foundation/x402/tree/main/examples/typescript/servers/advanced` — **canonical reference TS server** confirmed 2026-05-11. Express.js base; pattern translates to Hono one-to-one. This is where `declareDiscoveryExtension` is actually used in practice; the previously-referenced `/servers/bazaar` directory may not exist (advanced is the real reference).
3. `https://docs.cdp.coinbase.com/x402/bazaar` — CDP-side docs for the same flow.
4. `https://x402.gitbook.io/x402/core-concepts/bazaar-discovery-layer` — x402 Foundation's GitBook on the discovery layer.
5. `https://agentic.market/validate` — confirm the page loads; this is where we'll verify indexing after first settle.

---

## 2. Pre-commit spike (30 min, throwaway code)

Goal: prove the `declareDiscoveryExtension` API + JSON Schema validation works against a tiny placeholder route before touching the real `POST /route` with its larger schema surface.

Add a local-only Hono route — call it `POST /test/bazaar-spike` — with a minimal fixed-shape body (e.g. `{ message: string }` in, `{ echo: string }` out) and the Bazaar extension wrapping it. Wire `declareDiscoveryExtension` on the route with trivial `input` + `inputSchema` + `output.example` + `output.schema` + `bodyType: "json"`.

Deploy to Railway behind an env flag (e.g. `TRUSTBENCH_BAZAAR_SPIKE_ENABLED=true`). From a test wallet, settle one CDP-mediated x402 call against `/test/bazaar-spike`. Capture:

- The `EXTENSION-RESPONSES` header on the settle response.
- The full body of the settle response.
- Any errors from the SDK.

**Pass criterion:** `EXTENSION-RESPONSES: processing` on the settle response, no SDK exceptions, and within 15 minutes `https://agentic.market/validate` (or `https://api.cdp.coinbase.com/platform/v2/x402/discovery/merchant?payTo=<revenue-wallet>`) shows the spike URL. CDP documented cache delay is 10 minutes; budget 15 to absorb variability.

**Fail criterion:** `EXTENSION-RESPONSES: rejected` (metadata failed strict JSON Schema validation). The most likely causes:
- `output` not structured as `{ example, schema }` — old draft had `output` + `outputSchema` separately. **The new shape is `output: { example, schema }`.**
- Missing `bodyType: "json"` for POST endpoint.
- `inputSchema.required` doesn't match the example `input` field names.
- `input` example value doesn't validate against `inputSchema` properties.

After pass: delete the spike route (or leave behind the flag) and move to § 3 with confidence.

---

## 3. Wire-up on `POST /route`

### 3.1 Imports

```ts
// src/index.ts or new src/bazaar-extension.ts
import { bazaarResourceServerExtension, declareDiscoveryExtension } from '@x402/extensions/bazaar';
```

**Confirmed via WebSearch 2026-05-11:** the package is `@x402/extensions/bazaar`, NOT `@coinbase/x402`. The `@coinbase/x402` package handles the merchant-side facilitator config we already import in `paywall-handler.ts`; the discovery extension is its own sub-package on the x402-foundation side. Add it as a `package.json` dependency before importing. Reference TS server using this exact import: `github.com/x402-foundation/x402/tree/main/examples/typescript/servers/advanced`.

### 3.2 Where the description text actually goes

The earlier draft of this runbook put the catalog description in an `info: { name, description, category }` block inside `declareDiscoveryExtension`. **That block does not exist in the real API.**

Per the CDP Bazaar doc, the description text that surfaces in catalog search results comes from the route's `description` field in the route config (the field passed alongside `accepts` when the route is constructed), not from `declareDiscoveryExtension`. The Bazaar indexer pulls the description text for semantic-search ranking ("buyer reach + transaction volume + recency + metadata quality").

To control how TrustBench appears in agentic.market search results, set the `description` on the route config wherever the x402 route metadata is constructed. Use this sharpened framing from `phase4-submission-packet.md` § "Three-sentence description" (locked 2026-05-11 in response to the Infopunks Radar / Pay.sh competitive reclassification — see `competitive-landscape.md` 2026-05-11):

```
TrustBench is a non-custodial routing and audit layer for x402 that produces
signed evidence rather than opinion: every paid call emits an Ed25519-signed
receipt covering the routing decision and the on-chain settlement reference,
verifiable offline against a published public key. The agent's wallet signs
the payment; the Coinbase CDP facilitator submits on-chain; TrustBench never
holds funds. The paywall is fail-safe by design: if the upstream merchant is
non-conformant the agent isn't charged, so money never moves on bad routes.
```

**Framing rationale (don't paraphrase away in future edits):** the differentiation moat for the catalog card is **signed receipts + on-chain evidence + fail-safe property**, the three things opinion-based scoring competitors structurally cannot claim. The strategic posture doc (`competitive-landscape.md` 2026-05-11) explicitly says this framing must be sharp in public copy *before* P4-3 (Solana routing) ships, because Solana is where TrustBench collides with Infopunks Radar. The Bazaar listing card is the highest-leverage public copy surface. Paraphrasing this down to "policy layer" softens the moat — keep the "evidence rather than opinion" + "fail-safe by design" phrases verbatim.

**Note for ranking:** per CDP doc § "Quality ranking" — semantic descriptions like "Real-time weather conditions for any city" rank higher than bare endpoint names like `/weather`. Our description above is semantic-rich; good.

Augment with optional fields per `bazaar.mdx`:
- `category` — best fit: `"Infrastructure"` (matches agentic.market's 5-cat taxonomy: search, inference, data, media, infra → infrastructure).
- `version` — `"v0.1.0"`.
- `pricing_url` — `"https://trustbench.io/pricing"`.
- `docs_url` — `"https://trustbench.io/skill.md"`.

### 3.3 `inputSchema` for `POST /route` request body

Source: `src/route-handlers.ts` lines 170-192 (the canonical request shape).

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "required": ["capability", "max_price", "payer_address"],
  "additionalProperties": false,
  "properties": {
    "capability": {
      "type": "string",
      "enum": ["search", "inference", "data", "media", "infra"],
      "description": "Which agentic.market capability bucket to route against. Mirrors the Coinbase Agentic Market 5-category taxonomy."
    },
    "max_price": {
      "type": "string",
      "pattern": "^[0-9]+$",
      "description": "Maximum the agent is willing to pay for this call, in atomic USDC (6 decimals). 10000 = $0.01."
    },
    "payer_address": {
      "type": "string",
      "pattern": "^0x[0-9a-fA-F]{40}$",
      "description": "EVM address of the agent wallet that will sign the EIP-3009 transferWithAuthorization for the merchant payment."
    }
  }
}
```

### 3.4 `outputSchema` for `POST /route` 200 response

Source: same file, the quote response shape returned at lines 350-380.

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "required": ["route_id", "payment_required", "expires_at"],
  "properties": {
    "route_id": {
      "type": "string",
      "pattern": "^qt_[A-Z0-9]{26}$",
      "description": "Opaque ULID-keyed quote handle. Pass back to POST /route/settle when retrying with the signed X-PAYMENT envelope."
    },
    "payment_required": {
      "type": "object",
      "description": "x402 payment requirements for the upstream merchant the router selected. Sign this with the agent wallet and submit via POST /route/settle.",
      "required": ["scheme", "network", "asset", "amount", "payTo", "validAfter", "validBefore", "nonce"],
      "properties": {
        "scheme": { "type": "string", "const": "exact" },
        "network": { "type": "string" },
        "asset": { "type": "string", "pattern": "^0x[0-9a-fA-F]{40}$" },
        "amount": { "type": "string", "pattern": "^[0-9]+$" },
        "payTo": { "type": "string", "pattern": "^0x[0-9a-fA-F]{40}$" },
        "validAfter": { "type": "integer" },
        "validBefore": { "type": "integer" },
        "nonce": { "type": "string" }
      }
    },
    "expires_at": {
      "type": "string",
      "format": "date-time",
      "description": "ISO 8601 timestamp after which the quote is no longer valid. Re-quote if expired."
    },
    "fallback_provider": {
      "type": "object",
      "description": "Reference to the selected merchant. Returned for transparency; the agent does not need to use it directly unless it wants to bypass /route/settle.",
      "properties": {
        "url": { "type": "string", "format": "uri" },
        "score_at_decision": { "type": ["number", "null"] }
      }
    },
    "receipt_signature_alg": {
      "type": "string",
      "const": "ed25519",
      "description": "Signing algorithm of the routing receipt returned by POST /route/settle. Verify against /.well-known/trustbench-pubkey."
    }
  }
}
```

### 3.5 Dynamic-routes annotation

Per `bazaar.mdx` "Dynamic routes" section, declare on the route handler that the payment requirements are computed per-request, not fixed at publication time.

The exact annotation shape depends on the doc — likely a `dynamic_pricing: true` flag in the `declareDiscoveryExtension` call or a separate `declareDynamicRoute` wrapper. Confirm from the doc during § 1 pre-read.

### 3.6 Composition

**API SHAPE CORRECTED 2026-05-11** after fetching the canonical CDP docs page (`https://docs.cdp.coinbase.com/x402/bazaar`). The earlier runbook drafts contained an `info: { name, description, category, ... }` block and a `dynamic: true` flag — both fabricated by the original WebSearch-snippet research, neither documented in the actual CDP Bazaar doc.

**Real `declareDiscoveryExtension` shape (per CDP docs):**

```ts
declareDiscoveryExtension({
  input: { /* example values */ },
  inputSchema: {
    properties: { /* JSON Schema */ },
    required: [ /* required field names */ ],
  },
  output: {
    example: { /* example response values */ },
    schema: {
      properties: { /* JSON Schema for response */ },
    },
  },
  bodyType: "json",  // REQUIRED for POST endpoints like /route
});
```

Note: `output` is an OBJECT with `example` and `schema` as inner fields. NOT separate `output` + `outputSchema` top-level fields. For POST endpoints `bodyType: "json"` is REQUIRED — easy to miss because GET endpoints don't need it.

**No info block.** The catalog description used for semantic-search ranking comes from the route's separate `description` field in the route config, not from `declareDiscoveryExtension`. To control how TrustBench appears in catalog search results, write a clear `description` in the surrounding route config (per § 3.2 sharpened framing).

**No dynamic-routes pattern.** This was an artifact of the original WebSearch snippet confusing runtime pricing with discovery dynamics. The CDP Bazaar doc describes no dynamic-routes feature. Standard x402 protocol already handles variable pricing via the `accepts[]` array in the 402 response — Bazaar just indexes the route + schema metadata.

**Composition:**

```ts
app.post(
  '/route',
  bazaarResourceServerExtension({
    facilitator: cdpFacilitatorConfig,  // already imported in paywall-handler.ts
  }),
  declareDiscoveryExtension({
    // Example POST body — rendered in the catalog as a sample call
    input: {
      capability: 'data',
      max_price: '10000',
      payer_address: '0x0000000000000000000000000000000000000000',
    },
    inputSchema: { /* § 3.3 — keep as drafted, JSON Schema is correct */ },
    output: {
      // Example response — rendered in the catalog as a sample
      example: {
        route_id: 'qt_01ABCDEFGHIJKLMNOPQRSTUVWXYZ',
        payment_required: {
          scheme: 'exact',
          network: 'eip155:8453',
          asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
          amount: '5000',
          payTo: '0x<TRUSTBENCH_REVENUE_WALLET>',
          validAfter: 1715472000,
          validBefore: 1715472300,
          nonce: '0x<32-byte-hex>',
        },
        expires_at: '2026-05-12T00:05:00Z',
        receipt_signature_alg: 'ed25519',
      },
      schema: { /* § 3.4 — keep the JSON Schema as drafted */ },
    },
    bodyType: 'json',  // REQUIRED for POST endpoints
  }),
  // existing middleware chain follows
  requireAgent,
  withIdempotency,
  requireWithinSpendCap,
  quoteHandler,
);
```

**Catalog ranking inputs** (per CDP doc's "Quality ranking" section):
1. Buyer reach (distinct buyers served through CDP)
2. Transaction volume (successful settles)
3. Recency (how recently used)
4. Metadata quality (descriptions, schemas, examples)

**Catalog cache:** 10 minutes documented delay. New entries and updates take up to 10 min to surface.

**Route consolidation gotcha:** Bazaar auto-consolidates routes with UUID-like / 0x-address / tx-hash path segments. `/route` is a single fixed path so this doesn't affect us. But future endpoints like `/receipts/:id` would consolidate into one entry — if we ever want each receipt indexed separately, prefix the segment.

**`EXTENSION-RESPONSES` header lifecycle (canonical, from CDP doc):**
- `processing` → metadata validated, indexing async
- `rejected` → metadata failed JSON Schema strict validation; route NOT indexed; fix the schema and retry

Returned on BOTH `verify` AND `settle` responses, but indexing only happens after `settle` completes. So a successful `verify + rejected` is possible if the metadata is bad even though the payment is valid.

**Critical:** the Bazaar extension middlewares MUST sit BEFORE the existing paywall middleware so the extension can inspect the request first. Confirm ordering against the reference TS server in § 1.

---

## 4. Failure-mode paragraph (per CLAUDE.md high-risk-surface rule)

What breaks if this is wrong:

- **Schema validation fails on first settle.** Bazaar returns `EXTENSION-RESPONSES: rejected` with a reason. Mitigation: read the reason, fix the schema, retry. Each retry is one $0.005 settle.
- **Dynamic-routes annotation mis-shapes catalog entry.** The agentic.market card renders poorly (no price, no input shape, just a URL). Mitigation: visual check via `https://agentic.market/validate` 30 min after first settle. If render is broken, fall back to § 7 Rollback.
- **Extension middleware order wrong.** Paywall middleware processes first → extension sees post-paywall request → metadata never reaches CDP → no indexing. Mitigation: confirm ordering in reference TS server before composing.
- **Bazaar extension swallows 402 response from paywall.** Symptom: agents would get a successful indexing response but the actual paywall stops working. Mitigation: smoke `scripts/paywall-smoke.ts` AFTER wire-up; expect S1 PASS (402 envelope correct).
- **CDP facilitator rate-limits because of doubled traffic from indexer probes.** Symptom: paywall settle 5xx for unrelated user traffic. Mitigation: kill criterion from `decisions.md` 2026-05-11 entry — if CDP returns 5xx >5% in any week, fall back to PayAI.

How we'd notice:
- `EXTENSION-RESPONSES` header on every settle response — surfaced via Railway logs.
- `paywall-smoke.ts` regression — run before declaring done.
- Manual visit to `agentic.market/validate` after first settle.

---

## 5. Smoke test sequence (post wire-up)

After `tsc --noEmit` clean (verify on PowerShell per memory `feedback_windows_mount_truncation.md`):

1. Deploy to Railway with the existing `TRUSTBENCH_PAYWALL_ENABLED=true` flag.
2. From a test wallet (probe wallet plays agent role), call `POST /route` with capability=`data`, max_price=`10000`, payer_address=`0x<probe>`.
3. Expect 402 with x402 payment requirements (existing paywall behavior — no regression).
4. Sign the payment requirements with the probe wallet's EIP-3009 flow.
5. Retry `POST /route` with the `X-PAYMENT` header.
6. Expect 200 with the quote response (route_id, payment_required for upstream merchant, expires_at). Capture the response.
7. **Check the response headers for `EXTENSION-RESPONSES`.** Expect `processing`. If `rejected`, read the reason and iterate § 3.
8. Run existing `scripts/paywall-smoke.ts` — confirm S1 PASS (paywall still works for non-extension flow).
9. Within 30 minutes, `curl https://agentic.market/validate?url=https://trustbench.io/route` (or whatever the validate flow is — confirm from § 1 pre-read).
10. Within 4 hours, `https://agentic.market/` homepage should list TrustBench in the Infrastructure category. Visual inspection.

---

## 6. After-indexing checklist (parallel quick wins, ~15 min)

Once indexing confirmed:

- [ ] Append to `decisions.md`: `2026-05-XX: TrustBench listed on agentic.market / Bazaar via dynamic-routes pattern on POST /route. Reason: research locked extension path 2026-05-11; first settle through CDP triggered async indexing within X minutes; visual confirmation on agentic.market homepage.`
- [ ] **PR to `Merit-Systems/awesome-x402`** using the row from `phase4-submission-packet.md` § "For the awesome-x402 PR specifically." Verified 2026-05-11: repo at `github.com/Merit-Systems/awesome-x402`, default branch is **`master`** (not `main`), 110 stars, 62 forks, **36 open PRs in queue** so don't expect same-day merge. PR is fire-and-forget; the listing value is the open-PR visibility plus eventual merge.
- [ ] Add GitHub topic tags via the GitHub web UI on `https://github.com/lithvall/TrustBench`: `x402`, `agent-payments`, `routing`, `signed-receipts`, `non-custodial`, `mcp`, `usdc`, `base`, `eip-3009`, `ed25519`.
- [ ] Write a short build-in-public X post (per `feedback_no_em_dashes_outreach.md` style rules — no em-dashes, async-only path forward) announcing the listing.
- [ ] Add memory entry `project_listing_live_YYYY_MM_DD.md` capturing: indexing latency observed, the `EXTENSION-RESPONSES` outcome, the agentic.market card screenshot, any rendering oddities.
- [ ] Grade the `decisions.md` 2026-05-11 listing-path entry: `status: validated`.

---

## 7. Rollback (trial route)

If the dynamic-routes pattern fails the § 2 spike or the § 5 smoke:

1. Create a new fixed-shape route at `POST /route/sample` that takes `{ capability: "data" }` and returns a static demo response with a fixed $0.005 price.
2. Wrap `/route/sample` (not `/route`) with `bazaarResourceServerExtension` + `declareDiscoveryExtension` using fixed schemas.
3. Real `POST /route` stays unchanged — agents who discover us via the catalog hit `/route/sample`, get a demo, and have to read documentation to find `/route` for real work.
4. The agentic.market listing card description MUST explicitly call out `/route/sample` as a discovery route and link to `/route` as the real router.
5. Append to `decisions.md`: `2026-05-XX: Fall back to trial route alongside /route for Bazaar indexing. Reason: dynamic-routes pattern failed § Y of phase4-bazaar-extension-runbook smoke at step Z.`
6. Grade the original `decisions.md` 2026-05-11 dynamic-routes entry: `status: disproven` with the assumption-class failure noted.
7. Add a `lessons.md` entry capturing what specifically broke.

---

## 8. Out of scope for this session

- v0.2.0 paywall endpoints (`/score-provider`, `/verify`, `/audit-replay`) — listed in `skill.md` and `/pricing` as roadmap; do not wire the Bazaar extension to them until they ship.
- Solana endpoints — registry has ~150 from Heurist Mesh but they're filtered from `/route` (P4-3). Solana listing is post-P4-3.
- PayAI mirror path — fallback per `phase4-listing-research.md` § Fallback paths, not a primary objective.

---

## 9. Energy estimate

- Pre-read (§ 1): 30 min
- Spike (§ 2): 30 min
- Wire-up (§ 3): 60-90 min
- Smoke (§ 5): 30 min
- After-indexing checklist (§ 6): 15 min
- Buffer for debugging EXTENSION-RESPONSES failures: 30-60 min

Total: 2.5-4 hours focused. Within the founder-shape ~10-15 hrs/week budget if it lands in a single session.

---

## 10. Cross-references

- `phase4-listing-research.md` — the research that produced these design decisions.
- `phase4-submission-packet.md` — copy reservoir for `info` blocks, descriptions, PR text.
- `phase4-paywall-design.md` § Q6 — endpoint metadata schema this design extends.
- `decisions.md` 2026-05-11 — three locked Decision Journal entries for this work.
- `lessons.md` 2026-05-11 — CDP-facilitator-required + non-custodial-fail-safe lessons.
- Memory: `project_listing_research_2026_05_11.md`, `project_phase4_1_3_preflight_2026_05_11.md`.
