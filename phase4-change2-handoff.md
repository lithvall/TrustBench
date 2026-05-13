# Phase 4 Change 2 — Receipt-generator trust_signals field handoff

**Status:** Ready to start cold. Written 2026-05-13 end-of-session by the Change 1 author so a fresh session (you, or me) tomorrow can begin Change 2 without rediscovering context.

**Pickup order if you're picking this up cold:**
1. Read `CLAUDE.md` (always first — confirms current state and rules)
2. Read this file (Change 2 deliverable + plan)
3. Read `phase4-change1-critic-pass.md` (the partner Critic-pass from yesterday)
4. Read `strata-integration-sketch-SEND.md` § 10 and § 10.4.5 (the partner-facing contract Change 2 implements)
5. Read `receipt-spec-v1.md` (canonical signed-receipt envelope spec — high-risk-surface design doc)
6. Spot-read `src/receipt-generator.ts` (where the receipt is built and signed)

Estimated: 30-45 min of reading before any code is written. Don't skip — Change 2 touches the Ed25519 signature coverage which is the load-bearing trust property of every TrustBench receipt.

---

## 1. The deliverable

`/route`'s `paywall-handler.ts` / `route-handlers.ts` paid response includes a signed routing receipt. Today (after Change 1 shipped 2026-05-13), the request side captures `X-Trust-Signals` and stashes the parsed object on the Hono context as `c.set('trust_signals' as never, ...)`. **Change 2 reads that value from the context and embeds it inside the signed receipt body so the Ed25519 signature covers it.**

Specifically, when a `/route` settle produces a receipt:

- If `c.get('trust_signals')` is set, append it as the first entry of `receipt.trust_signals[]` array (per the locked §3 shape — array because future-proof for multi-source signals)
- If no signals were provided, the `trust_signals` field is **omitted entirely** (not present as an empty array, not present as null) — same byte-identity discipline as Change 1's hash construction
- The Ed25519 signature is computed over the JCS-canonical bytes of the receipt body, so anything inside `receipt` (including the new `trust_signals` field) is covered by the existing signature primitive — no new signing logic needed
- Both JSON and HTML receipt renders surface the new field

Per the §10.4.5 contract sent to Strata:
- Captured signals embedded verbatim — no rewriting, no field renaming
- Replays return cached original signals (not refreshed) — already true because the receipt is cached in `paid_requests.response_body`
- Signature covers the signals — this is the Change 2 deliverable

---

## 2. Pre-work that must happen before any code

CLAUDE.md High-risk-surface rules apply to Change 2 because it touches:
- Receipt envelope shape (the canonical Ed25519-signed artifact)
- The JCS canonicalization that drives signature coverage
- Receipt rendering (JSON + HTML)

The mandated pre-work:

**Read these design docs first.** Cite them in the plan when you propose the diff:
- `receipt-spec-v1.md` — locked receipt envelope shape, what fields are signed
- `phase3-receipt-generator.md` — design doc for the generator (if it exists; check for it)
- `phase3-x402-construction.md` — broader Phase 3 architectural context
- The `strata-integration-sketch-SEND.md` § 3 locked annotation shape (what bytes Strata sends in)

**Failure-mode paragraph required in the diff.** Per CLAUDE.md: "If this is wrong, what breaks, and how would we notice?" For Change 2, the obvious failure modes are:
- (a) Signature coverage doesn't include trust_signals → a Strata-aware verifier can't prove TrustBench observed those bytes → integration loses the trust-layer moat
- (b) Receipt with trust_signals doesn't replay byte-identical → idempotency replay breaks, S3 of paywall-smoke fails
- (c) Missing fields in render → HTML receipt page doesn't show the signals → public artifact is incomplete

**Critic-pass required.** Same template as Change 1's: three rejection reasons, counter-thesis, named wedge competitor, hidden assumption, kill criterion, verdict. Output goes in `phase4-change2-critic-pass.md` (parallel to Change 1's).

---

## 3. Implementation outline

Suggested order. Adjust based on what the code actually looks like.

**Step 3a — Audit the receipt construction path.** Likely entry points:
- `src/receipt-generator.ts` (probable location based on Change 1's imports in phase3-idempotency-design.md)
- `src/paywall-handler.ts` (where the paid /route response is built)
- `src/route-handlers.ts` quoteHandler / settleHandler

Find where the receipt JSON is constructed. Note where Ed25519 signing happens. Note where the receipt is written to `paid_requests.response_body` / `receipts` table.

**Step 3b — Implement the optional field embed.** In the receipt-generator function:

```typescript
// Pseudocode — match the actual function signature
function buildSignedReceipt(c: Context, params: ReceiptParams): SignedReceipt {
  const trustSignals = c.get('trust_signals') as TrustSignal | undefined;

  const receiptBody = {
    kind: 'paid_response.route',
    version: '1.0.0',
    receipt_id: params.receipt_id,
    // ... existing fields ...
    ...(trustSignals ? { trust_signals: [trustSignals] } : {}),
  };

  const canonicalBytes = jcsCanonicalize(receiptBody);
  const signature = ed25519Sign(canonicalBytes);

  return { receipt: receiptBody, signature };
}
```

The `...(condition ? { key: value } : {})` spread keeps the field OUT when no signals. That preserves byte-identical receipt bytes for the no-signals case — same property Change 1 enforced on the request hash.

**Step 3c — HTML render surface.** Look at `src/routing-receipt-html.ts` (or similar). Add a section that, when `receipt.trust_signals` exists, renders a labelled block with the source, kind, captured_at, ref (linked), and the optional fields if present. Keep it visually subordinate to the on-chain settlement details — the trust signals are supplementary, not headline.

**Step 3d — Update bazaar-extension declaration.** `src/bazaar-extension.ts` has the schema for the receipt example output. Update the example to include a `trust_signals` array, and add `trust_signals` to the receipt output schema (as an optional array). This keeps the Bazaar catalog entry honest about what /route can return.

**Step 3e — Verify the parsed type passes cleanly through the Hono context.** Change 1's `c.set('trust_signals' as never, ...)` cast means the read side needs the matching `as never` to keep TypeScript happy. Mirror the pattern from `src/index.ts:343` (bazaarExtension) and `src/idempotency.ts` (the Change 1 write).

---

## 4. Smoke pattern

**Smoke 4a — Byte-identity for the no-signals case** (parallel to Change 1's hash-identity smoke):

Build a receipt with `trust_signals = undefined`, then a receipt with `trust_signals = null`, then a receipt with the field truly absent. All three should produce byte-identical JCS-canonical output, byte-identical Ed25519 signature. Saves us from regressing the existing receipt envelope's stability.

Save as `scripts/trust-signals-receipt-identity-smoke.ts`. Run from PowerShell: `npx tsx scripts/trust-signals-receipt-identity-smoke.ts`.

**Smoke 4b — Receipt with signals validates end-to-end:**

Build a receipt with a known trust_signals payload. Run it through:
1. `scripts/verify-receipt.js` — confirms the existing verifier reads the new field cleanly
2. `npx @trustbench/verify-receipt <receipt-id>` — confirms the npm-distributed verifier works (forward compat check)
3. JSON content negotiation: `curl https://trustbench.io/receipts/<id> -H "Accept: application/json"` — confirms the field is in the JSON render
4. HTML content negotiation: open in browser — confirms the field renders cleanly

**Smoke 4c — Paywall-smoke regression:**

After deploy, run `paywall-smoke.ts` against prod with flag still OFF. All 4/4 should PASS, same as Change 1's post-deploy check. The new code path is dormant when no header is sent; this proves no regression.

---

## 5. Critic-pass checklist

Same template as `phase4-change1-critic-pass.md`. Three rejection reasons to anticipate:

- "The trust_signals[] array shape assumes future signals from multiple sources. Today there's only Strata. Why pay the array-shape complexity now?" — Counter: §3 locked the array shape with Strata explicitly; switching to a singleton would require re-litigating the locked shape.
- "Embedding partner-supplied bytes verbatim in a TrustBench-signed receipt means TrustBench is signing data it didn't verify. A hostile agent could spoof Strata's payload entirely." — Counter: the signature attests "TrustBench observed these bytes," not "these bytes are truthful." Strata-aware verifiers know to re-fetch via the `ref` URL.
- "JCS canonicalization on user-supplied JSON could be a DoS vector with deeply-nested arrays/objects." — Counter: 4 KB header cap from Change 1 limits depth; verify the recursion depth in `jcsCanonicalize` is bounded.

Named wedge competitor: x402route.vercel.app — they'd skip Ed25519 coverage. Our differentiation is exactly the signature property. Hidden assumption: Strata's downstream consumers will actually use the receipt's signature to verify the embedded signals. If they don't, the JCS coverage is over-engineering. Kill criterion: if Strata's reference-agent implementation reveals their consumers ignore the receipt signature and re-fetch from Strata directly, the embed-in-signed-body design is wrong; switch to a side-channel reference (receipt holds a hash + URL, signals served separately).

Verdict expected: acceptable. Apply any corrections, then ship.

---

## 6. What NOT to touch

Same out-of-scope list as Change 1:

- `.env` / Railway secrets
- The `TRUSTBENCH_TRUST_SIGNALS_ENABLED` flag — stays OFF in production until BOTH Change 1 and Change 2 are live and smoke-verified together
- The existing receipt signature key (Ed25519 keypair from Phase 1)
- The provider-selection or settle-execution logic
- The `paid_requests` table schema (no new columns; the `response_body` JSONB already carries the receipt verbatim)
- Anything in `phase4-paywall-design.md` that's locked — re-litigation requires a separate decision

---

## 7. Env-flag flip discipline (after Change 2 ships)

**Order of operations once both Change 1 + Change 2 are smoke-verified:**

1. Land Change 2 commit to main
2. Railway deploys; smoke regression 4/4 PASS
3. Run a final dry-run with a known X-Trust-Signals header against the deployed `/route`: expect 402 (flag still off, header ignored)
4. Flip `TRUSTBENCH_TRUST_SIGNALS_ENABLED=true` in Railway env
5. Railway restarts; observe boot log for any parse errors
6. Run paywall-smoke with the env adjusted to inject an X-Trust-Signals header: expect S1 PASS with the header echoed in the 402's bazaar extension info, S2 PASS with the receipt containing trust_signals[0]
7. Send Strata the reference-receipt URL — that's the §10 deliverable closed

**If anything in steps 5-6 misbehaves:**
- Flip `TRUSTBENCH_TRUST_SIGNALS_ENABLED=false` immediately
- Code stays deployed; the flag is the kill switch
- Diagnose, fix forward, retry

---

## 8. Context state at end of 2026-05-13 session

Captured for the fresh-session reader:

- **Change 1 shipped** at commit `1e8c21c` on `main`. Deployed via Railway. paywall-smoke 4/4 PASS in prod. Hash byte-identity 7/7 PASS verified.
- **Strata §10 sketch sent** at 10:30 UTC via Gist update + Option A DM. Target receipt URL: ~2026-05-19. Awaiting Strata reply.
- **QuickNode** confirmed live as `capability=data` upstream. Resolves the morning's "no live provider" blocker.
- **CDP merchant-discovery** still empty at session close (T+6 min from first post-routeTemplate-fix settle). 48h kill criterion fires ~2026-05-14 13:00 UTC. Run the probe once tomorrow morning before doing anything else.
- **SKU pivot decision** still pending. Artifacts: `phase4-sku-paywall-sketch.md` + `decisions-pending-2026-05-13.md`. Trigger to revisit: tomorrow's merchant-discovery outcome.
- **Today's wins logged** in `decisions.md` (three new entries dated 2026-05-13) + memory files. MEMORY.md index updated.

---

## 9. First-action checklist for tomorrow's session

In order:

1. Run the merchant-discovery probe: `curl.exe "https://api.cdp.coinbase.com/platform/v2/x402/discovery/merchant?payTo=0x552000Ffb06445D2dD7F4264c6595B4b11C33C35"`
2. If `resources: [...]` → kill criterion validated; SKU pivot becomes optional; proceed to step 3 on calmer schedule
3. If still empty → kill criterion still pending; recheck at ~09:19 UTC (T+24h from yesterday's settle) and at 13:00 UTC (deadline); if 13:00 fires negative, append the `status: superseded` note to the 2026-05-12 Day 6 entry in decisions.md and write the assumption-class lesson to lessons.md
4. Independent of probe outcome, start Change 2: pre-work reading (§2 of this doc), Critic pass before code, implement per §3, smoke per §4, ship to main
5. After Change 2 ships and smoke-verifies: flip the flag per §7 of this doc
6. Send Strata the reference-receipt URL

Total budget for Change 2: ~5-8 hours of focused work for a solo founder. Comparable to Change 1's effort.

Good luck.
