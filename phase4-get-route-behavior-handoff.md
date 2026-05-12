# Phase 4 — GET /route behavior decision handoff

**Status:** Not started. Deferred from 2026-05-12 Phase 4 Path P session.
**Risk:** Medium (changes a public surface response shape; breakage risk depends on who's currently hitting GET /route).
**Estimated work:** Investigation (~30 min) + decision (~10 min) + implementation of chosen option (~10-20 min) + smoke verification.

**Read first when picking this up:**
1. This file in full.
2. `lessons.md` 2026-05-12 entries for context on why the GET vs POST distinction matters per x402 v2 spec.
3. `src/route-handlers.ts` for the current GET /route handler (legacy quote endpoint).
4. `src/index.ts` for the route mounting (where paywallGate is attached to POST /route but NOT to GET /route).

---

## The problem

`agentic.market/validate` with GET method on `https://trustbench.io/route` reports:

> **No x402 Setup Detected.** This endpoint is reachable but doesn't return HTTP 402 or any x402 markers. It hasn't been set up as a paid endpoint yet.
>
> Returns HTTP 402: **failed**. Endpoint returns 200 OK — it needs to return 402 for unauthenticated requests to be discoverable.

Actual response body (~23KB of JSON):
```json
{
  "success": true,
  "capability": "search",
  "recommended_provider": "https://mesh.heurist.xyz/x402/solana/agents/UnifaiWeb3NewsAgent/get_web3_news",
  "score": 97,
  ...
  "signed_scorecards": [/* 12+ signed scorecards with Ed25519 signatures */]
}
```

This is the legacy Phase 3 GET /route quote handler in `src/route-handlers.ts`. It returns the rankings for `capability=search` (the default) with signed scorecards as a freebie.

POST /route works correctly (validator 11/11 green; Bazaar indexing eventually arrives).

---

## Why this matters (and why it doesn't block indexing)

**Does NOT block Bazaar indexing.** Our Bazaar declaration in `src/bazaar-extension.ts:178` sets `bodyType: 'json' as const` (POST). The Bazaar catalog scanner uses the declared method (POST) when probing for indexability. GET behavior is irrelevant to that path.

**Does affect:**
- **x402 discovery agents probing for "is this a paid endpoint?"** Some discovery patterns hit GET first to look for a 402 status. Our 200 response with quote data tells them "free endpoint" — they may not realize POST is paywalled.
- **Information surface area.** GET /route hands out provider rankings + signed scorecards for free. That data is ALREADY available publicly at `/rankings?capability=X`, so this is redundancy rather than a leak, but it's an inconsistent surface.
- **Spec citizenship.** Competitors like `x402route.vercel.app/v1/route` return 405 Method Not Allowed on GET — explicit signal of POST-only contract. We return 200 with unrelated content, which is unusual for paywalled endpoints.

---

## The three options

### Option A — Leave it (status quo)

- GET /route → 200 with legacy quote handler response (rankings + signed scorecards).
- POST /route → paywalled (current paywallGate path).
- No code change.
- Pro: zero breakage risk for any legacy consumer.
- Con: behavioral inconsistency persists; validator stays red on GET.

### Option B — GET /route also returns 402

- GET /route → 402 with paymentRequired payload (same shape as POST).
- POST /route → paywalled (unchanged).
- Code change: extend paywallGate to also apply to GET /route in `src/index.ts`.
- Pro: validator goes green on both methods. Spec-consistent.
- Con: breaks any consumer that was calling GET /route for free rankings. `/rankings?capability=X` already serves the same data publicly, so the fix is "migrate to /rankings" — but consumers won't know until they're broken.

### Option C — GET /route returns 405 Method Not Allowed

- GET /route → 405 with body `{"error": "method_not_allowed", "allow": "POST", "detail": "GET on /route returns a non-paywalled rankings query; the canonical query endpoint is /rankings?capability=X"}`.
- POST /route → paywalled (unchanged).
- Code change: replace the legacy GET handler with a 405 emitter.
- Pro: cleanest spec-wise. Mirrors x402route's behavior. Includes a redirect hint to `/rankings`.
- Con: breaks any consumer of GET /route (same as B). Slightly more polite breakage (405 with hint vs 402).

---

## Recommended decision path

**Step 1 (investigation, ~15 min):** check Railway logs for the last 7 days. How often is GET /route hit? By what user-agents / IPs? Common usage patterns? This determines breakage risk for B/C.

```powershell
# Inside the Railway dashboard logs, filter:
#   method:GET path:/route
# Look for: hit count, distinct user agents, distinct IPs, common query patterns
```

**Step 2 (decision, ~10 min):** Based on Step 1 findings:

- **If usage is zero or near-zero (< 5 hits/day from non-bot UAs):** ship Option C. Cleanest spec move; effectively no breakage.
- **If usage is moderate (5-100 hits/day from real consumers):** ship Option B with a 1-week deprecation notice in the response (a `Deprecation: <date>` header pointing at `/rankings?capability=X`). Then migrate to C after the deprecation window.
- **If usage is heavy or has unidentifiable consumers (100+ hits/day from diverse sources):** stay on Option A. Add an explicit comment in `src/route-handlers.ts` GET handler documenting the validator-flagged inconsistency and why we're keeping it.

**Step 3 (implementation, ~10-20 min):** apply the chosen option per the implementation sketch below.

---

## Implementation sketches

### Option B implementation

In `src/index.ts`, find where `paywallGate` is attached to `/route` and extend it to GET:

```typescript
// Current (something like):
app.post('/route', paywallGate, /* downstream handler */);
app.get('/route', /* legacy quote handler */);

// New:
app.post('/route', paywallGate, /* downstream handler */);
app.get('/route', paywallGate, /* legacy quote handler — only reached if paywallGate falls through */);
```

paywallGate's Branch 3 returns 402 when neither X-PAYMENT nor Authorization is present, regardless of method. The legacy GET handler would only be reached if X-PAYMENT or Authorization is present (which wouldn't happen for GET in practice, so legacy handler effectively becomes dead code under this option).

### Option C implementation

In `src/index.ts`, replace the GET /route handler:

```typescript
// Current:
app.get('/route', /* legacy quote handler from route-handlers.ts */);

// New:
app.get('/route', (c) => {
  return c.json({
    error: 'method_not_allowed',
    allow: 'POST',
    detail: 'GET on /route is not supported. For rankings, use /rankings?capability=<search|inference|data|media|infra>. For paid routing, POST to /route with an x402 PAYMENT-SIGNATURE header.',
    rankings_url: 'https://trustbench.io/rankings',
  }, 405, {
    'Allow': 'POST',
  });
});
```

Optionally: keep the legacy GET handler accessible at a new path like `/route/quote` for any consumer who really needs the legacy shape during transition. Then deprecate `/route/quote` after a month.

### Option A — explicit comment

If choosing A, add this comment to the GET handler in `src/route-handlers.ts`:

```typescript
// IMPORTANT: agentic.market/validate flags this endpoint as non-x402-compliant on
// GET because we return 200 with rankings instead of 402. This is intentional
// during the legacy quote-handler deprecation window — see
// `phase4-get-route-behavior-handoff.md` for the decision rationale and
// open questions. Do NOT remove without consulting that document.
```

---

## Verification gates (whichever option ships)

- `npx tsc --noEmit` clean.
- `npm run smoke:paywall` against prod — S1-S4 ALL PASS unchanged (the smoke harness uses POST, so smoke shouldn't be affected by any option).
- agentic.market/validate POST trustbench.io/route — still 11/11 green.
- agentic.market/validate GET trustbench.io/route — depending on option:
  - A: stays at "1 check failed (Returns HTTP 402)"
  - B: goes to 11/11 green (same as POST)
  - C: shows different state — depends on whether the validator handles 405 as "implementation invalid" or "method not supported." Worth running to see.
- Direct curl tests:
  - `curl -s -i https://trustbench.io/route` (GET, no body, no X-PAYMENT)
  - Per option: expect 200 (A) / 402 (B) / 405 (C).
- `curl -s -i https://trustbench.io/rankings?capability=search` — still serves rankings (unchanged regardless of option).

---

## Open design questions

1. **Should `/route/quote` (or some alternate path) preserve the legacy GET shape during a transition window?** Probably no — `/rankings?capability=X` already serves the same data. No need for a parallel surface.

2. **If Option B, should the 402 emitted on GET include the same `extensions.bazaar` payload as POST?** Yes if we want GET-method discovery to also catalog. No if we want to keep Bazaar indexing strictly POST-only. **Recommendation:** include extensions.bazaar on GET 402 too — same bytes, same scanner outcome, no downside.

3. **If Option C, should the 405 response include a SUGGESTED-METHOD header?** Standard practice is the `Allow:` header (per HTTP spec). Already included in the implementation sketch above.

4. **What about HEAD /route?** Same problem — HEAD probably currently 200s with empty body (Hono default). Decision should apply consistently across GET, HEAD, OPTIONS for unauthenticated probes.

---

## Files this will touch (per option)

### Option A
- `src/route-handlers.ts` — add the explicit comment.

### Option B
- `src/index.ts` — extend paywallGate to GET /route.
- `decisions.md` — Decision Journal entry with 90-day check_back.
- `lessons.md` — if anything non-obvious about the extension.

### Option C
- `src/index.ts` — replace GET /route handler with 405 emitter.
- `src/route-handlers.ts` — remove or comment out the legacy GET quote handler.
- `decisions.md` — Decision Journal entry.
- `lessons.md` — likely just the existing 2026-05-12 entry suffices.

---

## What is OUT of scope for this handoff

- The v2 header migration (PAYMENT-SIGNATURE / PAYMENT-RESPONSE) — separate handoff at `phase4-v2-header-migration-handoff.md`.
- Changing POST /route behavior — POST is correct (validator 11/11 green); don't touch it.
- Changing /rankings or any other endpoint.
- Changing the bazaar declaration's `info.input.method` value — POST is correct for our paywalled route.

---

## Validator raw data captured 2026-05-12 for reference

POST /route validator output (after FIX-PAYMENT-REQUIRED-HEADER):
> Implementation Looks Correct. All checks pass and the SDK would index this endpoint. It just needs its first verify+settle to appear in the Bazaar.
>
> Diagnostic Checklist (all passed)
> Transport & URL 6/6
> Payment Requirements 8/8
> Bazaar Extension 5/5

GET /route validator output (same day, same prod deployment):
> No x402 Setup Detected. This endpoint is reachable but doesn't return HTTP 402 or any x402 markers.
>
> Transport & URL 1 failed (Returns HTTP 402)
> Payment Requirements 1 failed (PaymentRequired delivered in PAYMENT-REQUIRED header — SKIPPED because no 402 emitted)
> Bazaar Extension 0/5 (all skipped)
>
> Raw response: 200 OK with body = legacy quote handler output (success + capability + recommended_provider + signed_scorecards array).

The POST 11/11 green vs GET 1+failed is the core anomaly this handoff resolves.

---

## Pointer back to the day this was deferred

`project_phase4_path_p_progress_2026_05_12.md` memory has the full context. Today's session shipped the POST path correctness fix and decided to queue the GET behavior decision to a fresh session with proper investigation of who's actually hitting GET /route.
