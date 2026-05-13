# TrustBench listing blocker audit — agentic.market + Coinbase Bazaar

> **✓ RESOLVED 2026-05-13 ~14:30 UTC. Stone 0 was the blocker.**
>
> CDP discovery now returns `pagination.total: 1` with `https://trustbench.io/route` listed; the catalog entry's `lastUpdated` is `2026-05-13T14:09:34.478Z`, matching the validating settle to the second. The agentic.market human render at `https://agentic.market/services/trustbench.io` is live with the full description, $0.005 / POST /route, and peer placement alongside OATP, Exa, and OttoAI.
>
> **Fix:** `scripts/paywall-smoke.ts` `buildXPaymentHeader` now accepts an optional `extensions?` arg and conditionally spreads it onto the PaymentPayload. S2 and S3 fetch the live 402's `extensions` via a new `fetchLive402Extensions` helper before signing. The smoke wallet now mirrors what reference x402 clients (`@coinbase/x402-axios`, etc.) do automatically. **Production agents using reference clients should trigger their own first-index without any further action on our side.**
>
> **Pre-flight that prevented a wrong-attribution test:** `scripts/validate-bazaar-extension.cjs` (new) ran `validateDiscoveryExtension` against the live 402's bazaar block and returned `valid: true` — eliminating Stone 4 before the $0.005 test settle. Without this pre-flight, a Stone-4 failure would have confounded the Stone-0 test.
>
> **Validating settle:** receipt `rrcpt_01KRGTQSG1R6ZHB0XATSJ5K87V`, tx `0x2b55e1c6e56c...`, provider QuickNode (`x402.quicknode.com/mat`), revenue wallet `0x552000Ffb06445D2dD7F4264c6595B4b11C33C35`, $0.005 USDC on Base mainnet.
>
> **Independent confirmation:** Both Grok and ChatGPT reviewed this audit before the fix shipped and converged on Stone 0 as the load-bearing answer (Grok: "the only high-confidence unturned stone"; ChatGPT: "~70%"). ChatGPT also added Stone 17 ("facilitator strips unknown fields before indexing") as a kill-criterion fallback — now permanently disproven by the successful indexing.
>
> The rest of this document is preserved verbatim as the diagnostic snapshot at 14:00 UTC. Stones 1-17 are the historical hypothesis space; only Stone 0 mattered. Decision Journal entry locked in `decisions.md` 2026-05-13 with a 90-day callback to 2026-08-11. Workflow rule extracted to persistent memory (`feedback_external_llm_audit_when_stuck.md`) so the audit-handoff pattern survives across sessions.
>
> ---

**Prepared:** 2026-05-13, 14:00 UTC
**Audience:** an external LLM (or human reviewer) being asked to find any stone we have left unturned.
**Outcome we want:** `https://trustbench.io/route` indexed by the Coinbase CDP Bazaar (which is the same catalog agentic.market renders).
**Status at the time this was written (14:00 UTC, before the fix):** all known correctness gaps closed per the agentic.market `/validate` tool ("Implementation Looks Correct, 11/11 green") — yet `GET https://api.cdp.coinbase.com/platform/v2/x402/discovery/merchant?payTo=0x552000Ffb06445D2dD7F4264c6595B4b11C33C35` still returned `errorMessage: "no active resources found"` after **six real on-chain settles** in the last 24 hours.

This document is intentionally self-contained. It contains the listing mechanism, the wire shape we emit, the wire shape the SDK actually reads, our chronology of fixes, what we have ruled in and ruled out, and a load-bearing newly-surfaced hypothesis at the end (§ 9, "Stone 0") that may explain why none of the prior fixes triggered indexing.

---

## 0. TL;DR for a reviewer

1. The listing mechanism is **automatic indexing after the first successful CDP-facilitated x402 settle on a route that declares `extensions.bazaar`**. There is no submission form, no review queue, no human approval path. ([§ 1](#1-the-canonical-listing-mechanism))
2. We've shipped, in order: `extensions.bazaar` on the 402 body (✅), `resource: {url, description, mimeType}` on the 402 body (✅), `PAYMENT-REQUIRED` HTTP response header per x402 v2 spec (✅), `routeTemplate: '/route'` at the bazaar-extension top level (✅). ([§ 5](#5-chronology-of-fixes-attempted))
3. **Six** real CDP-facilitator-mediated settles have landed in the revenue wallet `0x552000Ff...3C35` between 2026-05-12 and 2026-05-13. The most recent one (`rrcpt_01KRGA4YCXQRQXR0TJJXGSEXNH`, 2026-05-13 09:19 UTC) was the first settle to land with **all** the above fixes in the wire. CDP discovery still 404s our payTo as of 14:00 UTC, ~5 hours later. ([§ 4](#4-state-observed-today-2026-05-13-1400-utc))
4. The agentic.market `/validate` tool reports 11/11 checks green. This is the CDP-side seller diagnostic. It validates the 402 body shape; it does **not** validate that an actual settle would carry the bazaar metadata. ([§ 5](#5-chronology-of-fixes-attempted), Path P closeout)
5. **Stone we may have left unturned (§ 9):** the `@x402/extensions` SDK's `extractDiscoveryInfo()` function reads the bazaar extension from `paymentPayload.extensions[BAZAAR.key]` — i.e. **from the agent's X-PAYMENT envelope, not from the 402 body**. Our hand-rolled smoke wallet (`scripts/paywall-smoke.ts:142-157`) does **not** echo `extensions` into the X-PAYMENT envelope it submits. If CDP's facilitator catalogs from `paymentPayload.extensions` (as the SDK suggests), every settle we've done so far has been invisible to the indexer even though our 402 is canonical. This is the most likely remaining blocker and was not previously identified in `decisions.md` or any handoff doc.

---

## 1. The canonical listing mechanism

Established 2026-05-11 in `phase4-listing-research.md`, re-validated 2026-05-11 with `phase4-bazaar-handoff-2026-05-11.md`.

- **agentic.market is the human-facing UI**; **Bazaar is the catalog**. They are the same listing, not two separate listings.
- **There is no submission form, no curated catalog repo, no email path, no human review step.** Listing is a side effect of an indexable settle.
- **The three required ingredients** per CDP's docs at `https://docs.cdp.coinbase.com/x402/bazaar` plus the canonical reference at `https://github.com/x402-foundation/x402/blob/main/docs/extensions/bazaar.mdx`:
  1. Traffic routed through the **CDP facilitator** at `https://api.cdp.coinbase.com/platform/v2/x402` (not the public Foundation facilitator at `x402.org/facilitator`, which is testnet-only).
  2. On each route to be indexed, register a Bazaar discovery extension by calling `declareDiscoveryExtension({ input, inputSchema, output: { example, schema }, bodyType: 'json' })` and embed the resulting `{ info, schema }` (plus a `routeTemplate` string) somewhere a CDP-facilitator-mediated verify/settle round-trip can see it.
  3. Have **at least one real on-chain settle** complete through CDP against that route. The first successful CDP-mediated settle is what triggers indexing.
- **Indexing latency** is asynchronous and unpublished. Practitioner posts describe minutes-to-hours; CDP docs state "up to 10 minutes" of cache delay. There is no documented SLA. There is no documented `EXTENSION-RESPONSES: rejected` log path for clients.

---

## 2. What "indexable settle" technically means — per the actual shipped SDK

This section is from a direct read of `node_modules/@x402/extensions/dist/cjs/bazaar/index.js` lines 607-670 (the source of `extractDiscoveryInfo`) and `node_modules/@x402/extensions/dist/cjs/index-Bw-mGWh6.d.ts` (the types file) on 2026-05-13.

The SDK function CDP's facilitator (or any facilitator implementing the same protocol) uses to extract Bazaar metadata is:

```js
function extractDiscoveryInfo(paymentPayload, paymentRequirements, validate = true) {
  let discoveryInfo = null;
  let resourceUrl;
  let routeTemplate;
  if (paymentPayload.x402Version === 2) {
    resourceUrl = paymentPayload.resource?.url ?? "";
    if (paymentPayload.extensions) {
      const bazaarExtension = paymentPayload.extensions[BAZAAR.key];
      if (bazaarExtension && typeof bazaarExtension === "object") {
        try {
          const rawExt = bazaarExtension;
          const rawTemplate = typeof rawExt.routeTemplate === "string" ? rawExt.routeTemplate : void 0;
          if (isValidRouteTemplate(rawTemplate)) {
            routeTemplate = rawTemplate;
          }
          ...
```

The bazaar extension is read from **`paymentPayload.extensions[BAZAAR.key]`** — i.e. from the agent's X-PAYMENT envelope.

`BAZAAR.key` is the string `"bazaar"` (verified in the same file's exports).

The `resource.url` is also read from `paymentPayload.resource?.url` — from the X-PAYMENT envelope, not from the 402 body or the PaymentRequirements.

The signature `extractDiscoveryInfo(paymentPayload, paymentRequirements)` does take `paymentRequirements` as the second arg, but in the v2 path that arg is only used for fallback metadata (description/mimeType) for v1 payloads. **For v2, all the discovery-relevant fields are pulled exclusively from `paymentPayload`.**

This contradicts the implicit assumption we had been working from (re-asserted in every fix in § 5): that putting `extensions.bazaar` on the **402 response body** is sufficient. It may not be. The CDP facilitator at settle time receives `(paymentPayload, paymentRequirements)`. If the agent's payload does not carry the extensions field back, the facilitator never sees the bazaar declaration even though the 402 emitted one.

A well-implemented x402 v2 client SDK is presumably supposed to:
1. Receive the 402 response body.
2. Pick an `accepts[i]`.
3. Sign EIP-3009 over that accept's requirements.
4. **Copy the 402 body's outer `extensions` field into the X-PAYMENT envelope it sends.**

The first three are documented. The fourth is implicit — it's a behavior of the official Coinbase x402 client (`@coinbase/x402-axios`, the reference Express paymentMiddleware, etc.) — but I have not been able to find it spelled out in the public docs. It is the most likely point of silent failure in any hand-rolled wallet integration.

---

## 3. The Bazaar extension wire shape we currently emit

Verified live with `curl -X POST https://trustbench.io/route` on 2026-05-13 13:51 UTC.

**Response status:** `402 Payment Required`

**Response headers (relevant subset):**
```
PAYMENT-REQUIRED: <base64 of the full body, ~3500 bytes>
content-type: application/json
```

**Response body** (formatted):
```json
{
  "x402Version": 2,
  "resource": {
    "url": "https://trustbench.io/route",
    "description": "TrustBench: non-custodial routing and audit layer for x402. Returns a signed routing receipt with on-chain settlement reference, verifiable offline against a published Ed25519 key.",
    "mimeType": "application/json"
  },
  "error": "payment_required",
  "accepts": [
    {
      "scheme": "exact",
      "network": "eip155:8453",
      "asset": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      "amount": "5000",
      "payTo": "0x552000Ffb06445D2dD7F4264c6595B4b11C33C35",
      "maxTimeoutSeconds": 60,
      "extra": { "name": "USD Coin", "version": "2", "description": "..." }
    }
  ],
  "extensions": {
    "bazaar": {
      "routeTemplate": "/route",
      "info": {
        "input": {
          "type": "http",
          "bodyType": "json",
          "body": { "capability": "data", "max_price": "10000", "payer_address": "0x000...000" },
          "method": "POST"
        },
        "output": {
          "type": "json",
          "example": { "receipt": {...}, "signature": {...}, "next_step": {...} }
        }
      },
      "schema": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": { "input": {...}, "output": {...} },
        "required": ["input"]
      }
    }
  }
}
```

This matches the `BodyDiscoveryExtension` interface in `@x402/extensions` v2.11.0 types exactly:

```ts
interface BodyDiscoveryExtension {
  info: BodyDiscoveryInfo;
  routeTemplate?: string;   // we emit "/route"
  schema: { $schema, type: "object", properties: {...}, required: ["input"] };
}
```

The 402 body wire shape is canonical. This was the focus of every fix shipped 2026-05-11 → 2026-05-12 (see § 5).

---

## 4. State observed today (2026-05-13 14:00 UTC)

| Check | Result | Source |
|---|---|---|
| `POST /route` returns 402 | ✅ HTTP 402 | live curl |
| 402 body contains `extensions.bazaar` with `info`, `schema`, `routeTemplate: '/route'` | ✅ exact match to `BodyDiscoveryExtension` type | live curl, see § 3 |
| 402 body contains `resource: { url, description, mimeType }` | ✅ | live curl |
| Response carries `PAYMENT-REQUIRED` HTTP header per x402 v2 spec | ✅ base64-encoded full body | live curl |
| Production paywall flag `TRUSTBENCH_PAYWALL_ENABLED` | `true` on Railway | confirmed in last session's prod smoke |
| Production extension flag `TRUSTBENCH_BAZAAR_EXTENSION_ENABLED` | `true` on Railway | confirmed via observable extensions block in 402 |
| Facilitator in use | **Coinbase CDP** (`api.cdp.coinbase.com/platform/v2/x402`) | `paywall-handler.ts:228-240` `buildFacilitator()`, gated on `CDP_API_KEY_ID` + `CDP_API_KEY_SECRET` being set |
| Number of successful real settles against `/route` in the last 30 days | **6 total**: 5 from 2026-05-12 (txs `0x14d54f...`, `0x83203c...`, `0x4a282e...`, `0xdd8f69...`, `0x7fe2e7...`) + 1 from 2026-05-13 09:19 UTC against QuickNode (`rrcpt_01KRGA4YCXQRQXR0TJJXGSEXNH`) | Supabase `paid_requests` table |
| Revenue wallet on-chain balance increase | $0.025 + $0.005 = $0.030 USDC received | Basescan, address `0x552000Ffb06445D2dD7F4264c6595B4b11C33C35` |
| `https://api.cdp.coinbase.com/platform/v2/x402/discovery/merchant?payTo=0x552000Ffb06445D2dD7F4264c6595B4b11C33C35` | `{"errorMessage":"no active resources found for payTo address: 0x552000Ffb06445D2dD7F4264c6595B4b11C33C35","errorType":"not_found"}` | live curl, 2026-05-13 13:51 UTC |
| `agentic.market/validate?url=https://trustbench.io/route` | Reported 11/11 green ("Implementation Looks Correct") at 2026-05-12 end of session | manual UI check |
| `/.well-known/trustbench-pubkey` reachable | ✅ Ed25519 PEM | live curl |
| `/.well-known/trustbench.json` reachable | ✅ describes `/route` as paid endpoint at $0.005 USDC | live curl |
| `/skill.md` reachable | ✅ agentic.market skill format with name + description | live curl |
| `/llms.txt` reachable | ✅ multi-network framing, honest measurement language | live curl |
| `/pricing?format=json` reachable | ✅ canonical CDP facilitator named, `payTo: 0x552000Ff...` | live curl |

**The 48-hour kill criterion** for the routeTemplate hypothesis (locked 2026-05-12 in `decisions.md` Day 6) fires at **2026-05-14 13:00 UTC**. ~23 hours of runway from now. If CDP discovery is still 404 at that point, the project's current plan is to mark the entry `status: disproven` and accelerate either Change 2 / Strata reference integration (independent of indexing) or a SKU pivot (`phase4-sku-paywall-sketch.md`).

---

## 5. Chronology of fixes attempted

Compiled from `decisions.md`, `lessons.md`, memory files, and `git log --oneline`. Dates are absolute.

### 2026-05-11 — Bazaar extension wire-up shipped (commit `7065c4a`, `0c866ce`)

- Installed `@x402/extensions@^2.11.0`.
- Created `src/bazaar-extension.ts`.
- Discovered (after a round of WebSearch-snippet-driven false starts that wrote a fake `info: { name, description, category }` block and a fake `dynamic-routes pattern`) that the canonical shape is `{ info, schema }` per the package's `.d.ts`.
- Built declarations at module init for `/route` and `/test/bazaar-spike`. Manual POST method-injection mirrors `enrichDeclaration()`'s data transform because constructing a Hono-compatible `transportContext` requires internal types we don't expose.
- `paywall-handler.ts` `build402()` extended to accept an optional bazaar extension and embed at `body.extensions.bazaar`.
- `index.ts` attaches the declaration to Hono context via a `c.set('bazaarExtension' as never, routeBazaarExtension)` middleware before `paywallGate`.
- Two env flags default-off: `TRUSTBENCH_BAZAAR_EXTENSION_ENABLED` (production `/route`) and `TRUSTBENCH_BAZAAR_SPIKE_ENABLED` (throwaway spike route).
- **Spike result:** spike route's 402 body returns `BodyDiscoveryExtension` byte-for-byte. But `paywallGate` is route-coupled — it rejects the spike's `{ message: string }` body with a 400 `capability_invalid` before any settle can run. The spike could not validate the full settle path end-to-end. The flag was flipped back to false at session close.
- **Discovered:** the cognition-layer provider Infopunks used to host (proven x402-conformant per P4-1b 2026-05-06) had been suspended-by-user on Render. Paywall is fail-safe: 503 before charge.

Documented in `phase4-bazaar-handoff-2026-05-11.md`.

### 2026-05-12 — Path P all-day session (commits `c390939` through `25f084b` + `9d5c3b5`)

5 real paid settles in one session, each chasing one hypothesis:

| # | tx | hypothesis tested by this settle | landed fix |
|---|---|---|---|
| 1 | `0x14d54fbaa940...` | none — pre-fix baseline | — |
| 2 | `0x83203ce13d98...` | FIX-RESOURCE: 402 body needs `resource: { url, description, mimeType }` per x402 v2 spec | commit `c390939` |
| 3 | `0x4a282e5f58ff...` | FIX-S3: idempotency replay byte-identical | commit `6a9ae71` (not indexing-relevant, but coupled) |
| 4 | `0xdd8f69855d8b...` | PaymentPayload.resource: the agent's X-PAYMENT envelope must also carry `resource: { url, ... }` | commit `5d21784` (smoke-side) |
| 5 | `0x7fe2e7f3dfa0...` | FIX-PAYMENT-REQUIRED-HEADER: emit `PAYMENT-REQUIRED` HTTP response header on the 402 per x402 v2 spec | commit `8013ab1` |

After settle #5, **agentic.market/validate reported 11/11 green** ("Implementation Looks Correct"). This was the moment we believed the wire was finally canonical.

**Yet none of these 5 settles produced indexing.** CDP discovery still 404 the payTo at session close (~T+10 min from settle 5).

Day 6 of that same session: read the actual `.d.ts` file for `@x402/extensions`, discovered `routeTemplate` is an optional field on the wire-spec type (`BodyDiscoveryExtension.routeTemplate?: string`) but **required** for cataloging per the facilitator-side `isValidRouteTemplate` validation function. Express's `paymentMiddleware` auto-injects this from the route pattern; we hand-rolled `paywallGate`, so we missed it.

Shipped commit `9d5c3b5`: `bazaar-extension.ts:buildDeclaration` now injects `routeTemplate: '/route'` at the top of the declaration. Plus commit `8bf3df8`: `/receipts/:id` branches by prefix so `rrcpt_` receipts (Phase 4 paywall receipts) become publicly readable — closing a separate hypothesis that the indexer might require the receipts URL to be publicly readable.

48-hour kill criterion locked: deadline 2026-05-14 13:00 UTC. Daily `bazaar-indexing-watch` GitHub Action cron now polls CDP discovery at 12:00 UTC each day.

Documented in memory `project_phase4_day6_routetemplate_fix_2026_05_12.md` and `project_phase4_path_p_progress_2026_05_12.md`.

### 2026-05-13 — first post-fix settle + observability work

- 09:19 UTC: settle #6 against QuickNode's `x402.quicknode.com/mat` endpoint. Receipt `rrcpt_01KRGA4YCXQRQXR0TJJXGSEXNH`. This is the FIRST settle where the entire correctness chain (extensions.bazaar + resource + PAYMENT-REQUIRED header + routeTemplate) is present in the wire.
- T+6 min after that settle: CDP discovery still 404. Continued indexing watch.
- Crawler-probe diagnostic logging added on `paywallGate` (commit `b0366f4`) to capture every inbound request's UA / IP / X-PAYMENT / Authorization presence. **The user-facing answer to "has CDP's crawler visited us at all" is buried in Railway logs and not surfaced in this audit yet — see § 9 stone 5.**
- All other listing-adjacent work today (Change 1 trust_signals header parsing, Change 2 trust_signals receipt embed, Strata § 10 reference integration, npm `@trustbench/verify-receipt` v0.1.1 for `rrcpt_` prefix) is independent of CDP indexing and is shipping in parallel.

---

## 6. Hypotheses we have ruled in (confirmed sufficient by validator)

These are the things we have shipped and the validator considers correct:

- ✅ **CDP facilitator in use.** Confirmed in `paywall-handler.ts:228-240`. Tx hashes verifiable on Basescan; the on-chain submitter is the CDP facilitator address per the receipt.
- ✅ **`extensions.bazaar` on the 402 body** with `info`, `schema`, and now `routeTemplate: '/route'` at the top level. Verified via live curl in § 3.
- ✅ **`resource: { url, description, mimeType }` on the 402 body.** x402 v2 spec compliance.
- ✅ **`PAYMENT-REQUIRED` HTTP response header on the 402.** x402 v2 spec compliance, encoded via the SDK's `encodePaymentRequiredHeader`.
- ✅ **`routeTemplate: '/route'`** in the bazaar extension declaration.
- ✅ **JSON Schema shape** matches the `BodyDiscoveryExtension` interface byte-for-byte: `info.input.{type: "http", bodyType: "json", body: {...}, method: "POST"}`, `schema.required: ["input"]`, etc.
- ✅ **Successful settles complete.** Six total. `paid_requests` table has all six rows. Revenue wallet has received $0.030 USDC. Facilitator returned `success: true` on all six.
- ✅ **Public discoverability surfaces** all serve correct content: `/skill.md`, `/.well-known/trustbench.json`, `/llms.txt`, `/pricing` (HTML and JSON), `/methodology`, `/.well-known/trustbench-pubkey`.
- ✅ **Receipts are publicly readable.** Both `rcpt_` (Phase 3 settlement receipts) and `rrcpt_` (Phase 4 routing receipts) return 200 JSON via content negotiation. `rrcpt_01KQY7C44GAPSXZPFQYRZ1D10C` verifies SIGNATURE VALID + ON-CHAIN VERIFIED against the published Ed25519 key.

---

## 7. Hypotheses we have ruled out

- ❌ **Listing requires a submission form.** No. Listing is a side effect of an indexable settle. (Ruled out 2026-05-11 in `phase4-listing-research.md`.)
- ❌ **Listing requires the public Foundation facilitator at `x402.org/facilitator`.** No, the opposite is true — the Foundation facilitator is testnet-only; only the CDP facilitator produces Bazaar listings on the canonical path. (`lessons.md` 2026-05-11.)
- ❌ **The `info: { name, description, category }` block from the original runbook.** No such block exists in the shipped SDK. It was a WebSearch-snippet hallucination. (`lessons.md` 2026-05-11.)
- ❌ **The "dynamic-routes pattern".** Same story — no such pattern exists in the SDK. (`lessons.md` 2026-05-11.)
- ❌ **The validator's "1 check failed" was the indexing blocker on its own.** We fixed it (FIX-PAYMENT-REQUIRED-HEADER on 2026-05-12), the validator went green, but indexing still didn't happen for the 5 settles preceding the routeTemplate fix.
- ❌ **Missing `routeTemplate` on its own was the blocker.** Possibly still the case, but settle #6 (post-routeTemplate-fix, 2026-05-13 09:19 UTC) has now had >5 hours to index and hasn't. The 48h kill criterion fires 2026-05-14 13:00 UTC; if not indexed by then, this hypothesis is also disproven.
- ❌ **`paid_requests`-table receipts being inaccessible from public reads was a soft requirement.** Patched in commit `9d5c3b5` (rrcpt_ branch in `/receipts/:id`). Catalogers can now fetch any rrcpt_ via the public read path.
- ❌ **Provider unreachability was the blocker.** Settle #6 went through QuickNode's live, conformant `x402.quicknode.com/mat` endpoint. The full happy path completed.

---

## 8. Project-internal candidate blockers we have already discussed

These are pre-existing entries in the issue space, ranked by the team's prior plausibility scoring:

1. **CDP indexer requires settles from independent agent wallets** (i.e. not all settles from the same payer). All 6 of our settles were from the same probe wallet `agentAccount`. Captured as candidate #3 in `project_phase4_day6_routetemplate_fix_2026_05_12.md`. **Status:** unverified; the team has no plan to multi-wallet stress-test yet.
2. **First-index latency for a new payTo+URL pair is intrinsically longer than re-validation latency.** "Six minutes is short. Doesn't mean indexing is broken; means we haven't waited long enough." Captured in `project_cdp_indexing_state_2026_05_13.md`. **Status:** the 48h kill criterion exists to fail this hypothesis; deadline 2026-05-14 13:00 UTC.
3. **CDP crawler doesn't visit `/route` directly.** Path P P1 (commit `8013ab1` / `b0366f4`) added Railway-log instrumentation on `paywallGate` to capture every inbound UA / IP. Not yet reviewed in this audit; the user has not surfaced any Railway-log dump showing whether CDP's crawler has visited at all. **Status:** instrumentation exists, data not yet read.
4. **Cloudflare proxying** in front of trustbench.io could be stripping headers that CDP's crawler depends on. **Status:** unknown. Cloudflare is in `DYNAMIC` cache-status mode for `/route` per `cf-cache-status: DYNAMIC` in the response headers; the proxy is not caching, but it is terminating TLS and could in principle alter request/response headers.
5. **GitHub topic tags + awesome-x402 PR** as ecosystem-discoverability signals. These don't affect CDP indexing directly but were in the original Phase 4 plan as soft signals. **Status:** `awesome-x402` PR confirmed merged 2026-05-12 (PR #215). GitHub topic tag application status is not surfaced in current memory.

---

## 9. Stones we may NOT have turned

This is the section the audit is for. Read carefully.

### Stone 0 — the PaymentPayload.extensions echo (HIGHEST PRIORITY, newly surfaced)

**Source:** direct read of `node_modules/@x402/extensions/dist/cjs/bazaar/index.js` lines 607-670 on 2026-05-13 for this audit.

**The finding:** the SDK function `extractDiscoveryInfo(paymentPayload, paymentRequirements, validate = true)` reads the bazaar extension exclusively from `paymentPayload.extensions[BAZAAR.key]`. **It does not read the 402 body.** The facilitator at settle time only has access to (1) the agent's X-PAYMENT envelope (`paymentPayload`) and (2) one entry from the 402's `accepts[]` array (`paymentRequirements`). The outer `extensions` field on the 402 body **is not visible to the facilitator** during settle.

A canonical x402 v2 client is presumably supposed to copy `extensions` from the 402 body into the X-PAYMENT envelope it constructs. Coinbase's reference clients (`@coinbase/x402-axios`, the Express paymentMiddleware) likely do this automatically. **Our hand-rolled smoke wallet (`scripts/paywall-smoke.ts:142-157`) does not.** Verbatim:

```ts
async function buildXPaymentHeader(requirements: PaymentRequirements): Promise<string> {
  const evmScheme = new ExactEvmScheme(agentAccount as any);
  const result = await evmScheme.createPaymentPayload(2, requirements);
  const payload: PaymentPayload = {
    ...result,
    accepted: requirements,
    resource: {
      url: `${BASE_URL}/route`,
      description: 'TrustBench: non-custodial routing and audit layer for x402. Returns a signed routing receipt with on-chain settlement reference, verifiable offline against a published Ed25519 key.',
      mimeType: 'application/json',
    },
  };
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');
}
```

No `extensions` field is set. The bazaar declaration we emit in the 402 body is therefore **invisible to the CDP facilitator** during the settle, because the facilitator reads `paymentPayload.extensions`, not the 402 body.

**This would explain every fix that fired green at the validator but produced no indexing.** The validator reads the *server-side* 402 emission; the facilitator reads the *client-side* X-PAYMENT envelope. Two different surfaces. We made the 402 canonical. We never made the X-PAYMENT envelope canonical for indexing.

**Verifying this hypothesis:**
- Read `node_modules/@x402/evm/dist/cjs/index.js` (or wherever `ExactEvmScheme.createPaymentPayload` lives) and confirm whether it accepts an `extensions` argument or pulls extensions from anywhere in `requirements`. If not, the SDK relies on the calling code to pass extensions, which we do not.
- Check Coinbase's reference x402 axios client at `github.com/coinbase/x402` for how `paymentInterceptor` builds the X-PAYMENT envelope. Look for `extensions` propagation from 402 body into the signed payload.
- Add `extensions: parsed402.extensions` to `buildXPaymentHeader()`'s `payload` literal in `scripts/paywall-smoke.ts`. Re-run smoke. Burn one $0.005 settle. Watch CDP discovery for ~30 min.
- If that lands indexing, lock the lesson, write a Decision Journal entry validating the hypothesis, and add a follow-on TODO: the production paywall presumably has the same gap for any agent caller, but **paywall agents are responsible for their own X-PAYMENT envelope** — TrustBench cannot fix that on their behalf. Indexing therefore depends on agents who echo extensions properly. Coinbase's reference clients are the test bed. If the official Coinbase axios client does it correctly, indexing should "just work" the moment a real Coinbase-client agent settles.

**Why this wasn't caught earlier:** the implicit mental model in `phase4-listing-research.md` was "embed the bazaar extension on the 402, and the CDP facilitator inspects the 402 during catalog ingest." That model is **wrong by inspection of the SDK source** — the facilitator only inspects what the agent re-sends in the X-PAYMENT envelope. Our smoke wallet has been complete-loop-correct at the wire level (the 402 envelope and the signed authorization) but not at the **bazaar-metadata-propagation** level.

**Likelihood this is the blocker:** Very high. It explains why six successful settles produced zero indexing despite every server-side fix flipping the validator green.

### Stone 1 — agent-side `resource` field semantics

Per the FIX 2026-05-12 comment in `paywall-smoke.ts:131-141`, the team added `resource: { url, description, mimeType }` to the X-PAYMENT envelope on the hypothesis that `extractDiscoveryInfo` pulls `resourceUrl` from `paymentPayload.resource?.url`. The SDK source confirms this is correct.

**Open question:** does the canonical Coinbase x402 axios client also set `paymentPayload.resource` from the 402's body? If yes, we are aligned. If no, **the smoke wallet may be over-attesting** — adding a `resource` field that a real Coinbase-client agent would not. This would not break indexing on its own, but it would mean every paid integration with `/route` via a non-Coinbase client could lack this field and therefore lack the `resourceUrl` the indexer derives.

Recommended check: trace `paymentInterceptor` in `@coinbase/x402-axios`.

### Stone 2 — `routeTemplate` validation rules vs. our static `'/route'`

`isValidRouteTemplate` per the SDK accepts strings that start with `/`, have no `..`, no `://`, and use a safe charset. `/route` passes. But the catalog may apply additional rules not exported as `isValidRouteTemplate` — for example, requiring a `:param` parameter (since the docs talk about "dynamic routes" being indexed via `routeTemplate`).

Recommended check: search Coinbase's discovery service for any indexed Bazaar entries whose `routeTemplate` is a static path (no `:param`). If all indexed entries have `:param` placeholders, our static `/route` is being silently skipped because the cataloger expects parameterized templates.

Source: the indexed-entries list at `https://api.cdp.coinbase.com/platform/v2/x402/discovery/resources` returns paginated catalog content. A reviewer can fetch and grep for static-vs-parameterized `routeTemplate` values.

### Stone 3 — `paymentPayload.x402Version` of the actual agent payload

`extractDiscoveryInfo` branches on `paymentPayload.x402Version === 2`. If our smoke wallet (via `ExactEvmScheme.createPaymentPayload(2, requirements)`) is producing a `PaymentPayload` whose `x402Version` is something else (say `1` because of an SDK quirk), the function returns null and no indexing happens.

Recommended check: capture the X-PAYMENT base64 from settle #6 (the `rrcpt_01KRGA4YCXQRQXR0TJJXGSEXNH` settle), base64-decode it, JSON.parse, and verify `x402Version === 2`. Should be easy from `paid_requests.response_body` since the smoke wallet logs the envelope, but if the value isn't logged, redoing one settle with explicit logging is $0.005.

### Stone 4 — schema validation against the `BodyDiscoveryExtension.schema` shape

The SDK runs `validateDiscoveryExtension(extension)` and `console.warn`s on failure but does not throw. **Critically, the warning is on the facilitator side, not the client side.** We would never see it. If our schema fails strict validation, indexing fails silently with a server-side log we don't have access to.

Possible failure points:
- `schema.required: ["input"]` only — but the SDK's reference `BodyDiscoveryExtension.schema.required` is typed `("type" | "method")[]` for the QueryDiscoveryExtension variant. The BodyDiscoveryExtension required list isn't typed explicitly, but the canonical example servers in `github.com/x402-foundation/x402/tree/main/examples/typescript/servers/advanced` would show the exact required-list contract.
- Our schema's `output.example` contains the example signed routing receipt envelope. This may be too deeply nested for the indexer's schema validator (no documented limit, but a sane validator would cap depth).
- Our `info.input.body` is a JSON object with three fields; this maps to the canonical `BodyDiscoveryInfo.input.body: Record<string, unknown>` shape, so probably fine.

Recommended check: run `validateDiscoveryExtension(routeBazaarExtension.bazaar)` inline against our own declaration. The function is exported from the SDK. If it returns `{ valid: false, errors: [...] }`, the errors are the indexing blockers. This costs zero settles to test.

### Stone 5 — has the CDP crawler ever visited `/route` at all?

The diagnostic logging added in commit `b0366f4` captures every inbound request's UA / IP / X-PAYMENT presence on `/route`. **We have not yet reviewed Railway logs to determine whether the CDP catalog crawler has ever visited.** If it has not, the indexer-side process is something other than a re-crawl (which aligns with the SDK source: indexing is driven by settle, not by URL fetch).

Recommended check: Railway logs for `[paywallgate-probe]` lines from any UA matching `coinbase`, `cdp`, `bazaar`, `discovery`, or any non-Cloudflare-CDN IP in the last 7 days.

### Stone 6 — the `extensions.bazaar.info.output.example` may carry an embedded `trust_signals` array

Verified in § 3: our `output.example.receipt` carries a fully populated `trust_signals: [...]` field. The Strata-integration Change 2 shipped 2026-05-13 enabled trust signals to be embedded in real receipts when the `TRUSTBENCH_TRUST_SIGNALS_ENABLED` env var is true. **The flag is on in production** (commit `12df0e8`, flag flipped per `project_phase4_change2_shipped_2026_05_13.md`).

If the CDP indexer's schema validator does not anticipate optional, partner-supplied annotation arrays in the example, validation might fail silently. Our `output.schema.properties.example.properties` does not declare `trust_signals` — only `receipt`, `signature`, `next_step`. The example contains a field not in the schema. **This is a JSON-Schema additionalProperties question:** does the validator allow extra properties not in the schema, or does it reject?

Recommended check: in the Bazaar extension declaration, the example object's `receipt` field is declared `type: "object"` with no `properties` — so the indexer cannot validate inside `receipt` either way. But if Bazaar's validator does deep-introspection of examples and rejects unknown keys at any nesting level, this could be the blocker.

A safe mitigation: remove `trust_signals` from the example in `bazaar-extension.ts` for now, redeploy, settle one more, watch CDP for 30 min. Costs $0.005 and rules this in or out.

### Stone 7 — the spike route is gone but the spike-only flag is still in code

The spike route was conditionally mounted in `index.ts:385-396` behind `TRUSTBENCH_BAZAAR_SPIKE_ENABLED`. The flag is `false` in prod, so the route is 404. This is intentional and harmless **unless** CDP's indexer is somehow indexing `/test/bazaar-spike` (which it can't — the route 404s).

Recommended check: confirm `TRUSTBENCH_BAZAAR_SPIKE_ENABLED=false` on Railway dashboard. Per `phase4-bazaar-handoff-2026-05-11.md` it was flipped back to false at session close 2026-05-11; presumed-still-false unless someone has flipped it.

### Stone 8 — `mimeType: "application/json"` literal match

The SDK's `validateDiscoveryExtension` may check `mimeType` against an enum or a regex. Our value `"application/json"` should be canonical, but worth confirming.

### Stone 9 — `accepts[0].extra.version: "2"` may shadow `x402Version: 2`

Our `accepts[0].extra` contains `name: "USD Coin", version: "2", description: "..."`. The `version` here is the USDC token contract version (per EIP-2612 domain), not the x402 protocol version. If CDP's catalog ingestor parses `extra.version` thinking it's the protocol version, it might fail validation when the value doesn't match `x402Version: 2` at the top level (they both happen to be `2` here, so this would not surface as an error today). Low likelihood.

### Stone 10 — Coinbase CDP account / KYB state

The `phase4-listing-research.md` § "Coinbase Bazaar" table notes "CDP account required (Coinbase Business / CDP onboarding). KYT/OFAC compliance applies via CDP's normal flow." We have CDP API keys provisioned (otherwise settles wouldn't work). But CDP might have a separate "merchant verification" gate that is OFF by default for new accounts and must be manually flipped on.

Recommended check: log into the CDP dashboard, search for a "merchant" / "seller" / "x402 onboarding" toggle in account settings. If one exists and is OFF, this could be the blocker.

### Stone 11 — `payTo` address being on an OFAC-flagged or rate-limited list

Unlikely (the address was freshly provisioned per `phase4-listing-plan.md` § 1.3), but theoretically possible if the address has been somehow flagged in CDP's KYT/OFAC pipeline. No mechanism for us to verify without contacting CDP support.

### Stone 12 — `eip155:8453` network format vs Coinbase's expected `base` or `base-mainnet`

We emit `network: "eip155:8453"` (CAIP-10 format). Some Coinbase tooling uses `"base"` or `"base-mainnet"` directly. The facilitator accepts our format (settles succeed), but the catalog ingestor might key on the canonical Coinbase name and reject CAIP.

Recommended check: pull `https://api.cdp.coinbase.com/platform/v2/x402/discovery/resources` (paginated), grep indexed entries for `network` field values. If all indexed entries use `"base"` and none use `"eip155:8453"`, that's the blocker.

### Stone 13 — Railway region (`europe-west4-drams3a`)

We're deployed on Railway's europe-west4 region. CDP's crawler is presumably US-based. **Outbound** settles work fine (we initiate). But if CDP's crawler does any URL-fetch-followup before indexing, and the EU region adds latency or TLS quirks (Cloudflare in between), that could matter. Low likelihood — but easy to check.

Recommended check: `curl -w "%{time_starttransfer}\n" https://trustbench.io/route` from a US IP. If TTFB is >1s, indexing crawlers may time out.

### Stone 14 — `Cache-Control` headers absent on `/route`

The 402 response has no `Cache-Control` header. Indexers that respect HTTP semantics may not cache responses without one and could re-poll aggressively. No documented expectation either way from CDP.

### Stone 15 — repository visibility / GitHub link parity

`/.well-known/trustbench.json` points at `https://github.com/lithvall/TrustBench`. The README on that repo has Phase 4 status. Some catalog flows do a sanity check that the linked repo is accessible. **Status:** repo is public; this should not be an issue, but worth confirming the link in `trustbench.json` actually resolves (it does per the recent crawl).

### Stone 16 — `agentic.market/validate` UI may report green for "wire shape" but not for "indexability"

The validator is a public seller diagnostic that primarily checks the 402 envelope. It does not appear to simulate a real settle from a test wallet, which means it can confirm the 402 is correct without proving the entire round-trip flows discovery info to the facilitator. **This is the most likely explanation for the validator-green-but-not-indexed state.** The validator validates what the server emits; indexing validates what flows through settle.

This is consistent with Stone 0.

---

## 10. Reference data + verbatim code excerpts for the reviewer

### 10.1 Current `src/bazaar-extension.ts` ROUTE_CONFIG

(Verbatim, lines 154-275 of the file.)

```ts
const ROUTE_CONFIG = {
  input: {
    capability: 'data',
    max_price: '10000',
    payer_address: '0x0000000000000000000000000000000000000000',
  },
  inputSchema: {
    type: 'object',
    properties: {
      capability: { type: 'string', enum: ['search', 'inference', 'data', 'media', 'infra'] },
      max_price:  { type: 'string', pattern: '^[0-9]+$' },
      payer_address: { type: 'string', pattern: '^0x[0-9a-fA-F]{40}$' },
    },
    required: ['capability', 'max_price', 'payer_address'],
  },
  output: {
    example: {
      receipt: {
        kind: 'paid_response.route',
        version: '1.0.0',
        receipt_id: 'rrcpt_01ABCDEFGHIJKLMNOPQRSTUVWXYZ',
        issued_at: '2026-05-12T00:00:00Z',
        issuer: 'trustbench.io',
        paid: {
          chain: 'base',
          tx_hash: '0x' + '0'.repeat(64),
          payer_address: '0x' + '0'.repeat(40),
          payee_address: '0x' + '0'.repeat(40),
          amount_atomic: '5000',
          currency: 'USDC',
          decimals: 6,
          settled_at: '2026-05-12T00:00:00Z',
        },
        routing: {
          capability: 'data',
          provider_id: 'https://example-provider.com/x402/endpoint',
          provider_url: 'https://example-provider.com/x402/endpoint',
          score_at_decision: 97,
          alternatives_considered: 2,
          selection_reason: 'top_score',
        },
        call: {
          idempotency_key: 'client-supplied-key-16-to-128-chars',
          request_hash: 'sha256:' + '0'.repeat(64),
        },
        trust_signals: [
          {
            source: 'strata.usestrata.dev',
            kind: 'x402_trust',
            trusted: false,
            security_score: 45,
            risk_level: 'medium',
            payment_endpoint: { amount_usd: 2.5, currency: 'USDC', network: 'base' },
            actionable_flags: ['drain_risk'],
            captured_at: '2026-05-10T14:23:41.000Z',
            ref: 'https://usestrata.dev/api/v1/x402/verify?url=https://example.com',
          },
        ],
      },
      signature: {
        alg: 'ed25519',
        value: 'base64url-encoded-64-byte-signature',
        key_id: 'trustbench-2026-04',
        public_key_url: 'https://trustbench.io/.well-known/trustbench-pubkey',
      },
      next_step: {
        provider_url: 'https://example-provider.com/x402/endpoint',
        payment_requirements_v2: {
          scheme: 'exact',
          network: 'eip155:8453',
          asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
          amount: '5000',
          payTo: '0x' + '0'.repeat(40),
          maxTimeoutSeconds: 60,
          extra: { name: 'USD Coin', version: '2' },
        },
      },
    },
    schema: {
      type: 'object',
      properties: {
        receipt:   { type: 'object', description: 'Routing receipt envelope. Signed by TrustBench over RFC 8785 JCS-canonical bytes. ...' },
        signature: { type: 'object', description: 'Detached Ed25519 signature over the receipt body. ...' },
        next_step: { type: 'object', description: 'PaymentRequirements the agent uses to construct its NEXT call to the selected provider. ...' },
      },
      required: ['receipt', 'signature', 'next_step'],
    },
  },
  bodyType: 'json' as const,
};
```

### 10.2 SDK function the facilitator uses (read-only excerpt)

From `node_modules/@x402/extensions/dist/cjs/bazaar/index.js`, lines 607-670:

```js
function extractDiscoveryInfo(paymentPayload, paymentRequirements, validate = true) {
  let discoveryInfo = null;
  let resourceUrl;
  let routeTemplate;
  if (paymentPayload.x402Version === 2) {
    resourceUrl = paymentPayload.resource?.url ?? "";
    if (paymentPayload.extensions) {
      const bazaarExtension = paymentPayload.extensions[BAZAAR.key];
      if (bazaarExtension && typeof bazaarExtension === "object") {
        try {
          const rawExt = bazaarExtension;
          const rawTemplate = typeof rawExt.routeTemplate === "string" ? rawExt.routeTemplate : void 0;
          if (isValidRouteTemplate(rawTemplate)) {
            routeTemplate = rawTemplate;
          }
          const extension = bazaarExtension;
          if (validate) {
            const result = validateDiscoveryExtension(extension);
            if (!result.valid) {
              console.warn(`V2 discovery extension validation failed: ${result.errors?.join(", ")}`);
            } else {
              discoveryInfo = extension.info;
            }
          } else {
            discoveryInfo = extension.info;
          }
        } catch (error) {
          console.warn(`V2 discovery extension extraction failed: ${error}`);
        }
      }
    }
  } else if (paymentPayload.x402Version === 1) {
    // ... v1 path, irrelevant for us ...
  } else {
    return null;
  }
  if (!discoveryInfo) {
    return null;
  }
  const url = new URL(resourceUrl);
  const canonicalUrl = routeTemplate ? `${url.origin}${routeTemplate}` : `${url.origin}${url.pathname}`;
  // ... continues with the v2 metadata bundle ...
}
```

### 10.3 Smoke wallet (the suspect)

From `scripts/paywall-smoke.ts`, lines 142-157:

```ts
async function buildXPaymentHeader(requirements: PaymentRequirements): Promise<string> {
  const evmScheme = new ExactEvmScheme(agentAccount as any);
  const result = await evmScheme.createPaymentPayload(2, requirements);
  const payload: PaymentPayload = {
    ...result,
    accepted: requirements,
    resource: {
      url: `${BASE_URL}/route`,
      description: 'TrustBench: non-custodial routing and audit layer for x402. Returns a signed routing receipt with on-chain settlement reference, verifiable offline against a published Ed25519 key.',
      mimeType: 'application/json',
    },
  };
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');
}
```

**No `extensions` field. This is the proposed Stone 0 failure point.**

### 10.4 Receipt of the most recent successful settle

```bash
curl -s https://trustbench.io/receipts/rrcpt_01KRGA4YCXQRQXR0TJJXGSEXNH | jq .receipt.paid
```

```json
{
  "chain": "base",
  "tx_hash": "0x...",
  "payer_address": "0x<probe-wallet>",
  "payee_address": "0x552000Ffb06445D2dD7F4264c6595B4b11C33C35",
  "amount_atomic": "5000",
  "currency": "USDC",
  "decimals": 6,
  "settled_at": "2026-05-13T09:19:..."
}
```

`paid_requests` row exists in Supabase. On-chain tx is confirmed on Basescan. Facilitator returned `success: true`.

### 10.5 The probe that returns 404

```bash
curl -s "https://api.cdp.coinbase.com/platform/v2/x402/discovery/merchant?payTo=0x552000Ffb06445D2dD7F4264c6595B4b11C33C35"
```

```json
{"errorMessage":"no active resources found for payTo address: 0x552000Ffb06445D2dD7F4264c6595B4b11C33C35","errorType":"not_found"}
```

---

## 11. Recommended next checks for a reviewer

In order of likely payoff:

1. **(Stone 0)** Read `node_modules/@x402/evm/dist/cjs/index.js` for the body of `ExactEvmScheme.createPaymentPayload`. Confirm whether it accepts or propagates `extensions`. Read Coinbase's reference axios client at `github.com/coinbase/x402` to confirm canonical clients copy `extensions` from 402 body into X-PAYMENT envelope. If the canonical client does this and our smoke does not, **patch `scripts/paywall-smoke.ts:142-157` to set `payload.extensions = parsed402.extensions`, redeploy nothing (smoke-only change), burn one $0.005 test settle, and watch CDP discovery for 30 min.** This is the highest-leverage check that costs the least.
2. **(Stone 4)** Inline-call `validateDiscoveryExtension(routeBazaarExtension.bazaar)` from a smoke script and dump `{ valid, errors }`. Costs $0; eliminates the strict-schema-validation hypothesis cleanly.
3. **(Stone 6)** Either remove `trust_signals` from `output.example` in `bazaar-extension.ts` or ensure the schema's `properties.example.properties.receipt.properties.trust_signals` exists. Costs zero settles to fix, $0.005 to test.
4. **(Stone 2)** `curl https://api.cdp.coinbase.com/platform/v2/x402/discovery/resources` (paginated), grep `.resources[].routeTemplate`. If all are parameterized (`:param`), our static `/route` may be skipped by convention. Costs $0.
5. **(Stone 12)** Same query, grep `.resources[].network`. If `"base"` dominates and `"eip155:8453"` is absent, swap network format. Costs $0 to verify, requires a deploy + 1 settle to retest.
6. **(Stone 5)** Read Railway logs for `[paywallgate-probe]` lines in the last 7 days; filter by UA containing `coinbase`, `cdp`, `bazaar`, or by IP outside the Cloudflare edge ranges. If no such visits exist, we know the crawler is settle-driven, not URL-driven.
7. **(Stone 10)** Check the CDP dashboard for any merchant onboarding step left undone.
8. **(Stone 3)** Decode and JSON-parse the X-PAYMENT envelope from settle #6 to confirm `x402Version === 2`. Cheap, eliminates that hypothesis.
9. **(Stone 16)** Direct contact with CDP support / @CoinbaseDev or @ErikReppel on X if the above ladder doesn't surface the issue by 2026-05-15. Async-only follow-up per project outreach rules.

---

## 12. The honest framing

This audit captures everything the project has done and considered. It is intentionally exhaustive at the cost of being long. **The single most likely unturned stone is Stone 0** — the X-PAYMENT envelope `extensions` echo — because the SDK source proves the facilitator reads from `paymentPayload.extensions`, our smoke wallet doesn't set that field, and every other green check we have validates the server-side 402 emission rather than the round-trip propagation through settle.

If Stone 0 is the answer, the fix is one line in `scripts/paywall-smoke.ts` and one $0.005 settle. If it isn't, the next-likely stones are 4 and 6 (schema validation against our trust_signals-bearing example), then 2 (static routeTemplate convention), then 12 (network format), then 10 (CDP merchant onboarding), then 5 (whether the crawler is settle-driven or URL-driven). Stones 1-3 and 7-15 are lower probability but worth being explicit about.

Hand this whole document to another LLM (or to a Coinbase engineer) and ask them to challenge any of the ruled-in/ruled-out items in §§ 6-7 or to identify a stone we missed entirely in § 9. The §-by-§ structure is designed to make it easy to dispute one cell at a time.

Project state at the moment of writing:
- Production paywall: live, six successful settles, $0.030 USDC revenue, fail-safe property validated on a suspended-provider edge case.
- Strata reference integration: in flight independent of indexing.
- 48h kill criterion on the routeTemplate hypothesis: fires 2026-05-14 13:00 UTC.
- All commits in `main`. Working tree state per memory: minor pending cleanups, none blocking.

End of audit.
