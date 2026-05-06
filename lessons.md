# TrustBench — Lessons Learned

A living log of patterns, surprises, and corrections worth remembering across sessions. Every entry is something that, if forgotten, would be re-learned the hard way.

---

## 2026-05-06 — Receipt HTML rendering implemented (P4-2 first delivery)

Same-day pickup after P4-7 shipped. Per the parallel-convo re-rank ("rcpt_01KQY7C44GAPSXZPFQYRZ1D10C is already public; making it credible compounds every share"), receipt HTML rendering was the next sprint piece.

**What shipped:**
- `src/receipt-html.ts` (new, ~280 lines) — in-process Ed25519 signature verify (mirrors `scripts/verify-receipt.js verifyEnvelope` but uses `getPublicKeyPem()` directly, no HTTP round-trip), in-process on-chain verify (mirrors `verify-receipt.js verifyOnChain` against Base RPC), per-receipt-id verification cache (immutable receipts → cache forever), full HTML renderer with dark theme matching `/methodology`.
- `src/index.ts` — `/receipts/:id` handler now does content negotiation. `Accept: text/html` (+ `?format=html`) → polished HTML. `Accept: application/json` (default) → unchanged JSON. JSON contract is byte-identical for every existing programmatic client.
- `phase4-receipt-html-smoke.md` (new) — H1-H6 smoke runbook covering JSON regression, HTML render, query-param overrides, on-chain badge, tampered-receipt red badge, pre-closeout-#3 backward compat.

**Engineering decisions worth keeping:**
- **Use the in-memory public key, not HTTP self-fetch.** `getPublicKeyPem()` returns the PEM in-process. Fetching `signature.public_key_url` from our own server is a self-loop with DNS dependency for no benefit. The third-party verifier in `verify-receipt.js` round-trips because it doesn't trust us; we do.
- **Cache verification results by receipt_id forever.** Receipts are immutable per `receipt-generator.ts` (signed at issue time, never re-signed). Once verified valid, the verdict can't change. Process-lifetime in-memory `Map` is sufficient; restart re-verifies on demand. ~5ms subsequent renders vs ~200-500ms first render with chain RPC.
- **Strict content negotiation.** HTML only when `Accept` lists `text/html` AND does NOT list `application/json`. `*/*` and absent Accept default to JSON. Preserves every existing programmatic client byte-for-byte. `?format=html` and `?format=json` are unambiguous escape hatches.
- **Three-state badges (green/red/amber).** Green = verified. Red = active mismatch (tampered or chain-mismatch). Amber = unavailable/transient (HMAC fallback mode, RPC unreachable). Page renders even when chain RPC is down — soft failure.
- **Defensive HTML escape on every dynamic field.** `capability` and `idempotency_key` come from agent input. Static labels and addresses don't strictly need it but the helper is cheap.

**Operational notes worth keeping:**
- **Cache invalidation requires server restart.** The tamper-test smoke (H5) needs a dev-server restart between tamper and reload, otherwise the previous green verdict is still cached. This is correct behavior — production receipts are immutable, no invalidation needed in normal operation.
- **File-tools-vs-bash gotcha bit again.** Running `npx tsc --noEmit` from the bash sandbox returned "Unterminated template literal" at line 470 of `src/index.ts`. The bash mount was on a stale 09:20 version (truncated mid-file); the Windows-side file is complete. Verification must use PowerShell `npm run typecheck`. Lesson re-confirmed: **do not trust bash-side tsc for verification on freshly-edited files**.
- **OG/Twitter card tags included.** Receipt page emits `<meta property="og:type">`, `og:title`, `og:description`, `twitter:card` — so when the URL is shared in a social platform that does unfurling, the card carries TrustBench branding + a factual one-liner ("$0.01 USDC settlement for search routed by TrustBench. Signature verified. On-chain confirmed."). Distribution-positive.

**Carry-forward state:**
- The receipt URL `https://trustbench-production.up.railway.app/receipts/rcpt_01KQY7C44GAPSXZPFQYRZ1D10C` will render the polished HTML page once this code deploys. Same URL, same id; existing `verify-receipt.js` script unaffected.
- Next sprint piece per re-ranked agenda: `/rankings` Tailwind-style polish with content negotiation (P4-2's sister piece). Same single-file Hono pattern; structural alignment with Zauth.inc's UI without competing on data breadth.
- Then: Heurist Solana mesh crawler addition + Mindshare outreach.

---

## 2026-05-06 — P4-7 reservation caps SHIPPED IN PROD (smoke green, flag flipped)

**Update later same day:** smoke C1-C4 + B1 + B4 ran live against the dev server + mock provider, all green. Highlights:

- **C1 PASS** — pending debited to 10000 (max_price), not 1000 (merchant quote). Conservative pre-check rule preserved.
- **C2 PASS** — pending → 0 at settle, `pending_released_at` marker set, receipt records actual settled amount (1000), not reservation amount.
- **C3 PASS (load-bearing)** — 3 concurrent quotes against `2 × max_price` cap → exactly 2 succeed + 1 `rolling_cap_exceeded`. **Phase 3 race is closed.**
- **C4 PASS** — manual sweep call released 1 expired quote, decremented pending. Plus the autonomous in-process sweep timer caught a separately-expired quote during B4 setup at the 60s tick boundary — bonus real-data validation that the timer runs as designed.
- **B1 PASS** — replay returned same `route_id` with `x-idempotent-replay: true` header AND pending stayed at 10000 (no double-debit). The idempotency layer correctly skips the spend-cap middleware on replay, which is the load-bearing reservation/idempotency contract.
- **B4 PASS** — expired-quote settle returned 410 `route_id_expired`.
- **Boot-time bonus**: when the dev server first started with the flag on, the sweep released 36 stale quotes from prior runs. Smoke pass on real-shaped data without hand-priming.

**Railway flag flip:** `SPEND_CAP_RESERVATION_ENABLED=true` added to Railway Variables (was missing — Railway only auto-imports env vars at first repo connect, not on later `.env.example` additions; no commit needed for env vars). Boot log confirmed:
```
2026-05-06T10:03:49Z  [pending-sweep] starting (interval=60000ms)
```
P4-7 is the active code path in production from this moment. Documented Phase 3 race is closed in prod.

**External signal in same log window:** several HEAD requests on `/receipts/rcpt_01KQY7C44GAPSXZPFQYRZ1D10C` at ~10:05. Possible Infopunks amplification, possible crawler, possible link-checker. Worth checking partner channels before launching receipt-HTML-rendering — if amplification is live, the polished render compounds every share.

**Next sprint per re-ranked agenda (Zauth intel + parallel-convo follow-ups):** Receipt HTML rendering with content negotiation on `/receipts/:id` — `Accept: text/html` returns polished HTML, `Accept: application/json` unchanged. Same single-file Hono + inline CSS pattern as `/methodology`. Highest-leverage post-P4-7 polish item per the strategic re-rank.

---

## 2026-05-06 — P4-7 reservation caps landed (code-only; smoke deferred to next live session)

**What shipped:** strict reservation-based spend caps (P4-7). Atomic `claim_spend_reservation` RPC at quote time, `release_spend_reservation` at settle, `sweep_expired_reservations` on a 60s in-process timer, `refund_pending_reservation` for compensating refunds when quoteHandler aborts after pending was debited, `reconcile_pending_spend` for daily ground-truth recompute. Behind `SPEND_CAP_RESERVATION_ENABLED` env flag for canary.

**Two-signal validation that bumped this from deferred-bottom (recap):** Infopunks's "audit tail is where teams slip" framing + CLU_AGENT's "per-call timeout reversion" reply on 2026-05-06.

**Files touched:**
- `phase4-schema-spend-cap-reservation.sql` (new, standalone migration for Supabase SQL editor)
- `phase3-schema.sql` (+migration block + 5 functions appended; cumulative source of truth)
- `src/spend-caps.ts` (rolling-cap branch now calls `claim_spend_reservation` RPC; legacy JS check kept as fallback when flag is off OR when RPC errors)
- `src/route-handlers.ts` (refund helper + 6 error-path refund calls in quoteHandler; release call in settleHandler before merchant fetch; diagnostic-log cleanup from P4-1b debug session bundled in same diff)
- `src/pending-sweep.ts` (new, 60s self-rescheduling timer; no-op when flag is off)
- `src/index.ts` (mounts `startPendingSweep()` after server boot)
- `.env.example` (`SPEND_CAP_RESERVATION_ENABLED=false` default)
- `phase4-smoke-c1-c4.md` (new, runbook in phase3-closeout.md A1-A5/B1-B4 format)
- `scripts/smoke-c3-concurrency.ts` (new, dedicated harness for the load-bearing concurrency case; `npm run smoke:c3`)
- `package.json` (smoke:c3 script)

**Engineering decisions worth keeping:**

- **Type mismatch is intentional.** Cap columns (`spend_cap_*_atomic`) are TEXT — read once into JS BigInt, never SQL-arithmetic'd. `pending_spend_atomic` is NUMERIC(78, 0) because the reservation logic NEEDS atomic SQL-side arithmetic in the conditional UPDATE WHERE clause. Future-me: do not "normalize" by changing one or the other.
- **The conditional UPDATE is the load-bearing piece.** Postgres serializes UPDATEs on the same row, so two concurrent quotes at the cap edge can't both pass — the first commit raises pending, the second's WHERE evaluates against the new pending and rejects. C3 smoke is the test that proves this.
- **Refund-on-abort vs reconciliation-only.** Picked refund-on-abort in quoteHandler (compensating UPDATE on every error path that runs after the middleware debit). Daily reconciliation is the backstop, not the primary path. Reasoning: leak window goes from ≤24h to near-zero in the common case; the 6 inline `refund_pending_reservation` calls are cheap and explicit.
- **Release before merchant fetch, not after.** Trade-off: pending under-counts spend during the merchant-call window (cap briefly over-allocated). Accepted because the alternative — slow merchants holding reservation budget across 30s timeouts — is worse for tight caps. Documented in `phase4-spend-caps-reservation.md` § Failure-mode analysis and in the failure-mode comment at the top of `src/spend-caps.ts`.
- **RPC-error fallback to JS check.** When `claim_spend_reservation` errors (function not deployed, DB unreachable, etc.), spend-caps.ts logs loud and falls through to the legacy JS check rather than 503'ing every quote. Soft-failure beats hard-failure for the canary deploy.
- **Sweep is in-process, not a separate cron.** Solo-founder lens: zero new infrastructure, no extra workers. Self-rescheduling setTimeout (not setInterval) so a slow sweep doesn't overlap itself. If Railway restarts, the next boot picks up on the same 60s cadence.
- **No new spend_log table, no new receipt fields.** The receipts table stays the source of truth for settled spend. `pending_spend_atomic` is internal bookkeeping. `receipt-spec-v1.md` does not change → existing scorecard / receipt signatures stay valid forever. This was the most important constraint to honor.

**Operational notes worth keeping:**

- **Smoke deferred to next live session.** This session implemented + tsc-verified the code; live C1-C4 against running dev server + mock provider was not run because the smoke environment isn't booted in the implementation session. Runbook is in `phase4-smoke-c1-c4.md`. C3 (concurrency) is the load-bearing test — green = race fixed, red = WHERE clause too loose. Run before flipping `SPEND_CAP_RESERVATION_ENABLED=true` in Railway prod.
- **Apply order:** schema first (Supabase SQL editor: paste `phase4-schema-spend-cap-reservation.sql`), then deploy code, then flip the env flag. Reverse order = old code calling new functions = log noise but not a breach (RPC fallback to JS check). Forward order = clean canary.
- **`tsc --noEmit` carry-forward errors persist.** 3 `@supabase/realtime-js` → `@supabase/phoenix` errors and the stub `src/server.ts` default-import error from earlier sessions. P4-7 added zero new typecheck errors.

**Carry-forward state:**

- All P4-7 code lives behind `SPEND_CAP_RESERVATION_ENABLED=false` by default, so a deploy without the flag is a strict no-op. Flip from Railway dashboard once schema is applied + smoke runs green.
- Daily `reconcile_pending_spend()` cron not yet wired — currently a manual call. P4-7-cron is a small follow-up after the canary stabilizes.
- The diagnostic logs in `settleHandler` (X-PAYMENT envelope dump, response headers/body dump, 402 rejection body) from the P4-1b debug session were removed in the same commit. The lighter `[settle] →` and `[settle] ← status=` lines stayed.

**Next sprint:** trustbench.io DNS CNAME + flip BASE_URL back to canonical (independent deploy, ≤30 min); then refine + send the Paddock DM (now unblocked — Reddit thread context loaded, matrix-axes captured); then P4-7 daily-cron wiring (small) before P4-2 receipt explorer.

---

## 2026-05-04 — Phase 3 closed

**What shipped (verified end-to-end against the local mock x402 provider):**

- Authenticated `POST /route` (quote) with API-key auth (argon2id), idempotency keys, hard spend caps
- `POST /route/settle` (settle) with Ed25519-signed receipt issuance
- `GET /receipts/:id` public, immutable audit endpoint
- Reference verifier (`scripts/verify-receipt.js`) with `--pubkey-url` and `--check-chain` overrides
- `block_number` plumbed through schema → receipt envelope → DB column
- `scripts/paid-probe.ts` for budgeted internal probing ($20/mo cap), wired to GitHub Actions cron every 4 hours
- README rewritten with Phase 3 framing, verifier docs, failure semantics, and explicit Phase 3 limits

**What's measured:**

| Test | Result |
|---|---|
| A1 fresh quote → 200 + EIP-3009 challenge | ✅ |
| A2 settle → Ed25519-signed receipt persisted | ✅ |
| A3 audit → byte-identical envelope, 24h-immutable cache | ✅ |
| A4 verify → SIGNATURE VALID via standalone verifier | ✅ |
| A5 tamper → SIGNATURE INVALID on a single-byte change | ✅ |
| B1 quote replay → cached 200, no merchant hit | ✅ |
| B2 body mismatch → 409 `idempotency_key_reused_with_different_body` | ✅ |
| B3 settle replay → cached receipt, no double-charge to merchant | ✅ |
| B4 quote expiry → 410 `route_id_expired` (server-side, no merchant hit) | ✅ |

The smoke test exercised every piece of the wire shape including idempotency state machine, signature scope, JCS canonicalization, JSONB key-order normalization at the audit endpoint, and the Ed25519 signing path under real env config.

**What's deliberately deferred to Phase 4:**

- Refresh registry against `x402.org/ecosystem` — current inventory is CDP-discovery output, not actually-conforming x402 endpoints (P4-1).
- Public receipt explorer (`/explorer`) — counters Sentinel framing (P4-2).
- Solana support — Phase 3 is Base-only; Solana volume is meaningful (P4-3).
- `@trustbench/verify-receipt` npm package (P4-4).
- Receipt-spec public docs site (P4-5).
- Formal Infopunks integration (P4-6).
- Strict reservation-based spend caps — Phase 3 is approximately enforced under concurrency, bounded by `(parallelism − 1) × max_price` (P4-7).
- Multi-merchant fan-out — Phase 3 is single-merchant per `/route` call (P4-8).
- Policy firewall subscription product (P4-9).
- Refundable provider verification bond (P4-10).
- Receipt accounting CSV export (P4-11).

**Carry-forward action items from the smoke test:**

- Quote validity is 5 minutes — fine for sub-second agent flows, tight for manual testing. Worth a note in API docs but no immediate action.
- `src/server.ts` is a stale stub importing `./index.js` as default; `tsc --noEmit` flags it. Live entry is `src/index.ts` direct via `tsx watch`. Either delete or align.
- Three pre-existing `tsc` errors in `node_modules/@supabase/realtime-js` reference missing types from `@supabase/phoenix`. Likely fixed by a `@supabase/supabase-js` minor bump.
- Local Redis fallback noise (`⚠️ Redis connection lost`) on the dev box is just local network reachability; Railway-side Redis works fine. Worth checking only if production starts seeing the same.

**Process notes worth keeping:**

- **Chat markdown auto-linkification fakes content bugs.** Bare hostnames (`trustbench.io`) and `@host:port` patterns get rendered by the chat client as `[trustbench.io](http://trustbench.io)` and `[user@host](mailto:user@host)` *even inside code blocks*. This makes terminal pastes look like the source value contains markdown when it doesn't. During Phase 3 closeout this caused a wrong-direction diagnosis — chased a `TRUSTBENCH_ISSUER_HOST` env-var fix that wasn't needed (the var was unset, defaulting to the clean string in `receipt-generator.ts:39`; signature verified the canonical bytes were clean too). Rule going forward: when a value looks markdown-mangled in chat output, run a non-chat-mediated check (open the file in a local editor, run `grep` on the value, etc.) before declaring it a real bug.
- Anchor multi-step shell commands on shell variables (`$BASE`, `$RECEIPT_ID`) rather than literal hostnames — the shell never sees chat's auto-linkification then.
- `c.json` on a JSONB-loaded receipt returns the same canonical bytes (modulo key-order) as the in-memory envelope. The signature reconstructed at verify time is identical because JCS sorts keys. Confirmed empirically in B3.
- The Phase 3 closeout doc's B3 spec assumes the original quote is still valid (5-min window). Manual testing easily slips past that and lands you in B4 territory by accident — sequence A1' + A2' + B3' back-to-back, not paced.

---

---

## 2026-05-04 — Workflow rule changed; Phase 4 P4-1a code unblocked

**Rule change.** Grok no longer touches code; Claude implements directly. New CLAUDE.md and phase4-kickoff.md reflect this. `feedback_grok_design_docs_drift.md` recast as a Claude self-review checklist for high-risk surfaces (signing, payment construction, idempotency, spend caps, receipt emission). Round-trip review was insurance against subtle wire-shape mistakes at the cost of an async cycle per diff. The new rule keeps the careful reading and drops the cycle.

**P4-1a + settle-handler POST extension shipped (route-handlers.ts + crawler.ts):**

- `crawler.ts seedKnownX402Endpoints()` — three Infopunks endpoints seeded with `metadata.x402_probe_method = 'POST'` and minimum-viable probe bodies (`{artifact: 'trustbench-probe'}`, `{input: 'trustbench-probe', output_type: 'briefing'}`, `{narrative: 'trustbench-probe'}`). Capability `data`. Verified live against the OpenAPI schema at `/openapi.json`. Render cold-start is real (~13s) — warm `/health` first.
- `route-handlers.ts X402ProbeConfig` + `loadProbeConfig()` — reads metadata from the providers table, returns null for legacy GET-only providers (preserves Phase 3 default).
- `probeFor402Challenge` extended with optional config; reads top-level x402 fields then falls back to `accepts[0]` for v2-flavored providers (Infopunks via Coinbase CDP facilitator). Accepts `payTo`/`recipient`, `amount`/`amount_atomic`/`maxAmountRequired`, `asset`/`asset_address` spelling variants.
- `settleHandler` extended to mirror probe-config behavior: POST + `Content-Type: application/json` + body when configured; default GET preserved.

**Design choice — paid call body for POST-only providers:** the settle path currently reuses `metadata.x402_probe_body` (same body that elicited the 402 challenge) as the paid request body. This is correct for `paid-probe.ts` (which is testing wire compliance, not response usefulness). Real agents calling `/route` will eventually need a `payload` field passed through `/route` + `/route/settle` so they can request the actual coherence-score / extract-signal / simulate-narrative result they want. Documented as Phase 4 follow-up in task #7 description.

**Wire shape facts — locked from `scripts/mock-provider.ts` empirical reference (smoke tests A1–B4 passed against this format):**

X-PAYMENT (request, base64-JSON):
```
{
  authorization: { from, to, value, validAfter, validBefore, nonce },  // EIP-3009; values stringified
  signature: 0x + 130 hex
}
```

X-PAYMENT-RESPONSE (response, base64-JSON, lowercase header lookup):
```
{
  tx_hash | transaction_hash: 0x + 64 hex,
  block_number | settled_at_block | settled_at_block_number | blockNumber: number | string-of-digits | absent
}
```

`parseTxHashFromResponse` accepts both spellings on each field and coerces block numbers to `number | null`. Returning `null` for missing/malformed → caller emits 502 `provider_settlement_missing`. No receipt written when settlement reference is unrecoverable. Safe failure mode.

**Failure-mode analysis (per new high-risk-surface rule):**

- `buildXPaymentHeader`: if a field is missing or wrong-cased, the provider's signature recovery fails the EIP-712 struct hash → returns 402 → settle returns 502 `provider_signature_rejected`. **No money moves.** Safe.
- `parseTxHashFromResponse`: missing tx_hash → null → 502, no receipt. Wrong block_number type → still issue receipt (block is optional per receipt-spec-v1.md), verifier's `--check-chain` flags discrepancies on audit. Safe.
- Settle POST extension: settles against POST-only endpoints will work for paid-probe; real agents who want a useful response will get the seed probe body's response (a coherence score over the string `"trustbench-probe"`), not their intended query. Documented limitation. Phase 4 fix: optional `payload` field on `/route` + `/route/settle`.

**Workspace integrity gotcha (third occurrence this session):** Cowork's file tools (`Read`/`Write`/`Edit`) and the bash sandbox can show different states of the same file. `package.json`, `src/crawler.ts`, and `src/route-handlers.ts` all arrived this session truncated mid-token in the bash view while the Read tool showed complete content. Verify after every Edit on a sensitive file: `wc -l` + `tail -3` + brace-balance grep + tsc. Don't trust file-tools success messages alone. Truncation pattern: file ends mid-token at the exact byte position tsc reports as the parse error. When this happens, append the missing tail via `cat >> file <<EOF` from bash directly.

**Confirmed end-to-end before declaring done:**

- `tsc --noEmit` returns only the 4 carry-forward errors (3 in `node_modules/@supabase/realtime-js`, 1 in `src/server.ts` stale stub) — nothing new.
- Brace/paren balance: { 174 / } 174 ; ( 292 / ) 292.
- All four x402 wire helpers defined exactly once: `probeFor402Challenge`, `loadProbeConfig`, `buildXPaymentHeader`, `parseTxHashFromResponse`.
- Crawler seed + Infopunks 3-row metadata + capability `data` all on disk.

**Carry-forward to next session:**

- User runs `npm run crawl && npm run pipeline` to insert + score the Infopunks rows. Then check `/rankings?capability=data` — Infopunks should appear with non-null score.
- P4-1b operational runbook: probe agent SQL, fresh EOA, $30 USDC funding, GitHub Secrets, dry-run, single-provider live run. User-side ops; Claude provides the runbook.
- First clean paid-probe receipt → reply to InfopunksHQ with receipt_id + verifier link + their-framing copy ("first external evidence trail through the cognition layer"). They committed to amplifying.

---

## 2026-05-04 — End-of-day session close (P4-1b in flight)

**What landed today:**

- ✅ Workflow rule rewritten — Grok no longer touches code, Claude implements directly. CLAUDE.md + phase4-kickoff.md + memory entries updated. New high-risk-surface discipline rules in `lessons.md` and § 6/§ 7 of `grok-x-research-briefing.md`.
- ✅ Phase 4 P4-1a code shipped on disk + tsc clean: `crawler.ts seedKnownX402Endpoints()` (3 Infopunks endpoints with capability=`data` + POST probe metadata), `route-handlers.ts` X402ProbeConfig + loadProbeConfig + extended probeFor402Challenge (POST-mode + accepts[0] + field-name dialect tolerance + signing-time field synthesis) + extended settleHandler (POST method/body when configured).
- ✅ All four x402 wire helpers present and intact in `route-handlers.ts`: probeFor402Challenge, loadProbeConfig, buildXPaymentHeader, parseTxHashFromResponse.
- ✅ `paid-probe.ts` rankings parser fix (`/rankings` returns `{success, data, source}` envelope, not a top-level array — script now tolerates both shapes).
- ✅ `phase4-p4-1b-runbook.md` written — 10-step user-side ops runbook.
- ✅ `grok-x-research-briefing.md` written + iterated based on first daily run feedback (4 new anti-patterns + failure-modes-by-tier rubric added).
- ✅ Reddit reply to Paddock (public + DM) drafted and posted; partnership angle confirmed; one-week sample exchange agreed; co-branded monthly comparison post locked as the first deliverable.
- ✅ Daily Grok scan output reviewed — 5 A-tier X replies posted with corrected-for-280 versions.
- ✅ Probe agent provisioned (`probe@trustbench.io`, agent_id `eeac8c00-...`, key prefix `tb_live_FM8C`); spend caps configured ($0.05 per-call, $0.70/day rolling, $20/mo monthly via script-side soft check).
- ✅ Probe wallet generated locally via Node one-liner; address `0x547C2c615b227800D56b5ed24021C2CbCa0a3057`; private key stored only in password manager.
- ✅ Probe wallet funded with 30 USDC on Base (native USDC contract `0x8335...02913`).
- ✅ All five GitHub Secrets set + local PowerShell `$env:` block prepped.
- ✅ Railway deploy confirmed Ed25519-signing-keys are configured: `/.well-known/trustbench-pubkey` returns 200 + 113-byte PEM-encoded Ed25519 public key.

**Open blocker — picks up tomorrow at this exact spot:**

`probeFor402Challenge` returns null silently against Infopunks's `/v1/simulate-narrative` even though direct curl confirms the endpoint returns 402. Synthesis logic on disk is correct (verified via `grep`). Likely candidate paths to investigate:

- Render TLS cold-start eating the first connect handshake silently before AbortSignal.timeout fires.
- Some post-synthesis required-fields check failing on a field we haven't traced yet.
- Possibly a bash-vs-Windows file-watcher gap meaning tsx-watch loaded a stale version of the function (even after Ctrl+C / npm run dev) — the temp `console.log` PowerShell-edit was started but never executed (PS continuation prompt left dangling at `>>`).

**Tomorrow's first 30 minutes (concrete steps):**

1. In w2 (or fresh PS tab), re-set `$env:` block:
   ```powershell
   $env:SCRIPTS_PROBE_API_KEY    = '<from password manager>'
   $env:SCRIPTS_PROBE_WALLET_PK  = '<from password manager>'
   $env:TRUSTBENCH_BASE_URL      = 'http://localhost:3000'   # local for diagnostics first
   $env:SCRIPTS_PROBE_DRY_RUN    = 'true'
   $env:SCRIPTS_PROBE_MAX_PROVIDERS = '1'
   $env:SCRIPTS_PROBE_CAPABILITIES  = 'data'
   $env:SUPABASE_URL             = '<from .env>'
   $env:SUPABASE_SECRET_KEY      = '<from .env>'
   ```
2. Verify the temp console.log line did or did NOT land in `src/route-handlers.ts`:
   ```powershell
   grep -n 'method=' src/route-handlers.ts
   ```
   If absent, re-apply Claude's PowerShell-edit (closes the `>>` continuation properly with a final blank line).
3. Restart dev server in w1: `Ctrl+C` then `npm run dev`. Watch for the `🚀 TrustBench server running on http://localhost:3000` line.
4. In w2, redo the diagnostic curl against `http://localhost:3000/route`. Look at w1 for the new `[probe] ... method=... status=... hasBody=...` log line.
5. Diagnose based on what status comes back:
   - `status=402` → response IS 402, parsing is failing somewhere. Add a `console.log` of the parsed `ch` object to see which field is null after synthesis.
   - `status=404` → wrong path or cold-start. Warm `/health` first.
   - `status=400` → schema validation failed. Probe body shape mismatches OpenAPI.
   - `status=500/503` → Render-side issue. Retry after warm-up.
   - No log line at all → tsx-watch still hasn't reloaded; the temp edit isn't on disk. Fall back to a manual edit via VSCode/notepad to force the Windows file-watcher.

**Strategic note (locked 2026-05-04):**

Phase 3's x402 client was written for v0.x semantics. Infopunks (and most real v2 endpoints) emit different wire shapes — POST-only, `accepts[0]` nesting, missing signing-time fields, scheme=`exact` instead of `eip3009`, possibly different X-PAYMENT envelope shape. **Patch piecemeal for P4-1b** to ship the InfopunksHQ amplification on schedule. **Sweep wholesale via `@coinbase/x402` SDK as P4-1d after first receipt lands** — see `project_phase4_v2_wire_compat_approach.md` in memory for the locked decision + remaining patch list.

**Patches still expected after the probe-null is unblocked:**

- `validateChallenge` accepting `scheme === 'exact'` alongside `'eip3009'`.
- `buildXPaymentHeader` emitting v2 envelope (`{x402Version, scheme, network, payload: {signature, authorization}}`) — likely needed for Infopunks's facilitator to accept the X-PAYMENT signature.
- `parseTxHashFromResponse` may need v2 dialect updates.
- Add `console.warn` to `probeFor402Challenge`'s silent-null paths so future debug doesn't have to instrument from scratch.

**Once probe-null + above are fixed:**

- Local dry-run produces clean `[probe] DRY ... amount=10000`.
- Local non-dry single-provider run produces a `rcpt_…` ID.
- `npm run verify-receipt -- <id> --check-chain` returns SIGNATURE VALID.
- Deploy local code to Railway (commit + push if auto-deploy enabled).
- Repeat dry-run + single-provider run against Railway prod for the actual amplification receipt.
- DM @InfopunksHQ with receipt URL + verifier instructions + amplification copy.

**Carry-forward operational items:**

- Railway env vars are configured for Ed25519 signing; local `.env` is NOT — that's why local-pipeline scorecards have `signature: null`. Cleanup task: copy `TRUSTBENCH_SIGNING_PRIVATE_KEY` + `TRUSTBENCH_SIGNING_PUBLIC_KEY` from Railway into local `.env`. Not blocking P4-1b.
- Three files (`package.json`, `src/crawler.ts`, `src/route-handlers.ts`) hit Cowork file-tools-vs-disk truncation today. When file tools report success, verify on-disk via bash `wc -l` + `tail -3` before assuming the edit landed. Especially for sensitive code on the high-risk surfaces.
- Dev server in w1 may need a hard restart (Ctrl+C, `npm run dev`) when source files are edited via bash heredoc — Windows tsx-watch may not pick up changes that don't flow through Windows's filesystem watcher. PowerShell-side edits trigger the watcher reliably.

---

## 2026-05-05 — Pre-debug intel pass (Paddock + x402SKILL + Nick Prince + Reddit)

**Four threads processed before resuming P4-1b debug:**

1. **Paddock partnership progress (Reddit DM).** Reasonable-Degree101 confirmed: full URL primary key (matching ours, not domain), approved fifth bucket (paid + not in either registry = dark-matter providers), provided CSV export at `breakthecubicle.com/api/paddock/export/bazaar` (1200 rows, 9 cols, primary key `endpoint_url`). Sketched our 7-night rollup columns; SQL query against scorecards + providers tables produces it directly. Tracking as task #13.

2. **`x402SKILL.md` review.** Coinbase publishes `agentic.market/skill.md` as primary x402 onboarding (paste into Claude/Codex/Cursor → agent gains capability). New for TrustBench: skill.md as distribution channel (P4-skill), 5-cat taxonomy alignment (P4-1c), `api.agentic.market/v1/services` as crawler source (P4-1d), `integrationType: "1P"`/`proxied` attestation (P4-verify-tier). All four documented in `phase4-kickoff.md` § "Phase 4 follow-ups added 2026-05-05". Memory entry at `project_skill_md_distribution.md`.

3. **Nick Prince's Agentic.market week 2 announcement.** Confirmed three Coinbase ships: skill.md onboarding, verified badges (1P/proxied), seller endpoint validator. Burak's question to Nick about subjective-output paid agent work is Phase 5 territory for TrustBench (receipts + dispute layer). Captured in `phase5-design-seeds.md` at project root.

4. **Current-Tip2688's Reddit comment on idempotency-after-restart.** TrustBench solves persistent-key-in-same-transaction by design (Supabase `idempotency_keys` table + slot-claim before handler + `_settle:<route_id>` namespacing). State-schema-migration is a different concern we sidestep via stateless middleware design. Reddit reply drafted, tracking as task #14.

**Key cross-window-close moves made:**

- Updated `phase4-kickoff.md` with four new P4 follow-ups + verification tier framing.
- Created `phase5-design-seeds.md` at project root for accumulated Phase 5 design notes.
- Memory entries: `project_skill_md_distribution.md` + `project_phase5_design_seeds.md`. MEMORY.md index updated.
- This file appended.

**Strategic note that survives the chat-window close:** Coinbase is competing on **agent skill files** as the prompt-context-slot distribution surface, not developer SDKs. TrustBench should publish its own skill file as P4-skill — first-mover open in our routing/policy lane (G402, X-Router, Router402, AgentGatePay all lack skill files as of 2026-05-05).

---

## 2026-05-05 — End-of-session: P4-1b hand-roll exhausted, SDK pivot locked

**State at close:** 8 v0.x→v2 wire-compat patches landed against Coinbase CDP facilitator's `/verify`, still rejected with `provider_signature_rejected`. No money moved on any settle attempt — facilitator rejects pre-submit, so nonce never consumed, on-chain unaffected.

**Patches that landed (good progress, just not enough):**
1. POST-mode probing (`metadata.x402_probe_method` + body) — works
2. accepts[0] envelope shape parsing — works
3. Field-name dialect tolerance (payTo/recipient, asset/asset_address, maxAmountRequired/amount) — works
4. Synthesis of nonce/validAfter/validBefore when merchant doesn't pre-allocate — works
5. Scheme normalization "exact" → "eip3009" internally — works
6. Network "eip155:8453" instead of "base" in envelope — works
7. validAfter = epoch-now-600 instead of 0 (matches Coinbase reference SDK convention) — works
8. EIP-55 address normalization (canonical via getAddress in script signing; lowercase in envelope) — neither variant fixed it
9. value/validAfter/validBefore as strings instead of BigInt (matches Coinbase reference) — didn't fix it

**What we still don't know:** the exact divergence between our hand-rolled X-PAYMENT envelope and what Coinbase's `client.verifyTypedData()` expects. Without access to their `/verify` endpoint to iterate cheaply, every guess from log analysis is a coin-flip.

**Strategic pivot (locked 2026-05-05):** abandon the hand-roll path. Use `@coinbase/x402` SDK directly. Their `createPaymentHeader(client, x402Version, paymentRequirements)` returns the encoded base64 X-PAYMENT string — drop-in replacement for our `signEip3009` + `buildXPaymentHeader` combo. SDK is provably correct (Infopunks integration uses it; every working v2 endpoint uses it).

**Tomorrow's first 30 minutes (concrete):**

1. `npm install @coinbase/x402` (or whatever the canonical package is — verify via `npm search @coinbase/x402` or by reading `x402SKILL.md` for the package name).
2. In `scripts/paid-probe.ts`: replace `signEip3009(account, q.payment_required)` with `createPaymentHeader(account, 1, paymentRequirements)`. The SDK returns the full encoded X-PAYMENT string already; drop the `buildXPaymentHeader` step entirely.
3. In `src/route-handlers.ts` settleHandler: instead of building X-PAYMENT server-side, just receive the X-PAYMENT-already-encoded string from the agent's `/route/settle` request body and forward it. This shifts envelope construction to client side (where SDK lives).
4. **OR** alternative: keep server-side construction, but use `@coinbase/x402` SDK helpers there too. Slightly more work but maintains the same /route/settle interface.
5. Test against Infopunks. Should land first paid receipt within minutes once SDK is wired.

**Carry-forward state:**

- All 9 patches above are still on disk; they're correct for v2 ecosystem broadly even if Coinbase facilitator wants something subtly different. Don't revert them — they unblock other v2 providers (Nansen, Bloomberg, etc.) when those are added.
- Probe wallet `0x547C2c615b227800D56b5ed24021C2CbCa0a3057` still has 30 USDC on Base. No funds moved.
- Probe agent `probe@trustbench.io` provisioned in Supabase with caps locked.
- Local TrustBench dev server boots cleanly; quote round-trip works end-to-end against real Infopunks endpoints (we just can't settle).
- Railway deployment is still on stale Phase 3 code (no `/route` endpoint exposed yet) — needs deploy after SDK pivot lands.
- @InfopunksHQ DM acknowledging v0 mainnet still pending send (task #16) — could send now with current honest status, or wait for first receipt.

**Process lessons from today:**

1. **Chat-markdown auto-linkification injects bugs, not just fakes them.** When `Date.now` was rendered as `[Date.now](http://Date.now)` in chat and copy-pasted into PowerShell, it landed in the source file as broken syntax. Inverse of the existing chat-markdown lessons.md entry. Workaround: use idioms without `.<word>(` patterns (e.g. `+new Date / 1000 | 0` instead of `Math.floor(Date.now() / 1000)`).
2. **Cowork file-tools-vs-bash truncation hit ~6 times today on `route-handlers.ts`.** Pattern: Edit reports success, Windows view has full file, bash view is truncated mid-token, next bash append duplicates content. Reliable workaround: Apply edits via PowerShell `-replace` directly on the Windows side. Bash should ONLY be used for read-only operations on this file going forward.
3. **`tsc --noEmit` lies about file integrity when truncation is happening.** It reports the bash-side truncated view as "clean" while the Windows-side actual file may have orphan duplicate content. Always cross-check `(Get-Content file).Count` from PowerShell after any edit cycle.
4. **Hand-rolling x402 v2 from spec is a tar pit.** Patches keep accumulating, each fix unblocks the next divergence. The SDK exists for a reason; use it.

---

## 2026-05-06 — SDK pivot landed (P4-1b first-30-min plan executed)

**What landed (source-side, Windows-authoritative):**

- Added `"x402": "^1.2.0"` to `package.json` dependencies. Confirmed via `npm view`: latest is 1.2.0, exports `createPaymentHeader(client: Signer, x402Version: number, paymentRequirements: PaymentRequirements): Promise<string>`. Picked plain `x402` over `@coinbase/x402` because the latter pulls `@coinbase/cdp-sdk` (~30MB transitive) and we don't need the facilitator-client surface — only the X-PAYMENT envelope construction.
- Added `PaymentRequirementsV2` type + refactored `probeFor402Challenge` to return `{challenge, raw_accepts}` (was `X402Challenge | null`). The raw v2 accepts[0] envelope passes through untouched.
- Quote response now includes `payment_requirements_v2` field — the merchant's raw accepts[0] when present, null when only flat v0.x shape was emitted (mock-provider).
- `/route/settle` accepts EITHER `signature` (legacy v0.x EIP-712 sig — Phase 3 mock-provider compat) OR `x_payment` (SDK-built base64 envelope — real v2 providers). Mutually exclusive; either-but-not-both. Server forwards `x_payment` verbatim, no shape inspection.
- `paid-probe.ts` branches on `payment_requirements_v2`: present → `createPaymentHeader(account, 1, q.payment_requirements_v2)` → POST `{route_id, x_payment}`. Absent → fall back to existing `signEip3009` + `signature` path. The legacy path stays usable for the local mock smoke.

**Architectural cleanup:** the SDK pivot also fixes the non-custodial story by accident. Previously the server's `buildXPaymentHeader` reconstructed the full envelope from a client-supplied raw EIP-712 signature, meaning the server saw and assembled the typed-data wrapper. Under the new path, the client builds the entire X-PAYMENT envelope using its own wallet via the SDK, and TrustBench only forwards the opaque base64 string. The server now provably never sees the EIP-712 typed data nor the wrapped signature beyond pass-through.

**Verification gate (deferred to user-side):**

- Bash-mount truncation hit again on both `route-handlers.ts` AND `paid-probe.ts` this session — same pattern as the 2026-05-05 entry. Bash sandbox view ends mid-token while Read-tool view from the Windows mount shows complete files. `tsc --noEmit` from bash falsely reports `'}' expected` at the truncation byte; Windows-side `tsc --noEmit` should be clean. Confirm on Windows after pulling.
- `npm install` from bash also fails silently here (timeout under sandbox limits). Source-side change in `package.json` is correct; user runs `npm install` from PowerShell.

**User-side runbook (next ~10 minutes):**

```powershell
cd C:\Users\Lithv\Documents\Claude\Projects\TrustBench
npm install                          # pulls x402@^1.2.0 + transitive
npm run typecheck                    # confirm tsc --noEmit clean

# Set env block (same as yesterday):
$env:SCRIPTS_PROBE_API_KEY    = '<password manager>'
$env:SCRIPTS_PROBE_WALLET_PK  = '<password manager>'
$env:TRUSTBENCH_BASE_URL      = 'http://localhost:3000'
$env:SCRIPTS_PROBE_DRY_RUN    = 'true'
$env:SCRIPTS_PROBE_MAX_PROVIDERS = '1'
$env:SCRIPTS_PROBE_CAPABILITIES  = 'data'
$env:SUPABASE_URL             = '<from .env>'
$env:SUPABASE_SECRET_KEY      = '<from .env>'

# Restart dev server in w1, then in w2:
npm run paid-probe                   # dry-run; expect [probe] DRY ... path=sdk
$env:SCRIPTS_PROBE_DRY_RUN = 'false'
npm run paid-probe                   # expect [probe] OK ... receipt=rcpt_...
```

If dry-run prints `path=legacy` instead of `path=sdk`, the merchant's 402 didn't expose `accepts[0]` — check `[probe]` log for the actual probe response. Most likely cause: probe body shape mismatch with merchant's OpenAPI schema (Render cold-start eats the first request, second hit returns 402 properly).

**What survives if SDK envelope still gets rejected (unlikely but planned for):** all 9 hand-roll patches from 2026-05-05 stay on disk in `route-handlers.ts`. The legacy path (`signature` field on /route/settle → buildXPaymentHeader) is fully intact and tested against mock-provider in B-series smokes. So we can fall back per-merchant by just stripping `payment_requirements_v2` from the quote response for that provider.

**Carry-forward to next session:**

- First successful paid receipt → DM @InfopunksHQ with receipt URL + verifier instructions + amplification copy ("first external evidence trail through the cognition layer"). They committed to amplifying; this is the trigger.
- Receipt-spec public docs (P4-5) and `@trustbench/verify-receipt` npm package (P4-4) become higher-priority once amplification lands and external verifiers start showing up.
- The SDK pivot makes the wholesale v2 sweep (P4-1d in `phase4-kickoff.md`) effectively done for the agent-side. Any future v2 provider added to the registry just works — no per-provider envelope debugging needed.

---

## 2026-05-06 — SDK pivot blocked at Coinbase CDP facilitator (below-the-floor wall)

**State at session close:** SDK pivot is on disk, type-check clean, end-to-end plumbing works (probe → quote → SDK envelope build → settle forward → 402 from merchant). Local signature verification confirms `recovered signer == authorization.from`. Multiple wrapper-shape variants tried; all rejected with the same opaque "x402 facilitator verify failed" message. **No money has moved on any settle attempt** (facilitator rejects pre-submit; nonces never consumed on-chain).

**What was confirmed cryptographically correct (today's diagnostics):**

- The `x402` SDK signs with the canonical EIP-712 domain: `{name: "USD Coin", version: "2", chainId: 8453, verifyingContract: 0x833...02913}` from `extra` + `network` + `asset` in the merchant's accepts[0]. Inspected the SDK source directly — `signAuthorization()` does `account.signTypedData(...)` with the right TransferWithAuthorization type definition.
- Added `recoverTypedDataAddress()` gate in `paid-probe.ts` after each SDK call. It runs viem's signature recovery using the same EIP-712 domain + types + message + signature the SDK emitted. Result: `match=true` every run. The SDK is provably signing the correct typed data with the correct wallet.
- This means: the rejection is NOT in the EIP-712 layer. The signature is genuine; the recovered signer matches the claimed `from`; the inner authorization is well-formed.

**What was tried (wrapper-shape sweep):**

| Variant | x402Version | network | Outcome |
|---|---|---|---|
| Pure SDK output (default) | 1 | "base" | 402, facilitator verify failed |
| Post-hoc patched (CDP v2) | 2 | "eip155:8453" | 402, facilitator verify failed |

Plus all 9 hand-roll patches yesterday (POST-mode, accepts[0] parsing, field-name dialect, signing-time field synthesis, scheme normalization, eip155:8453 in envelope, validAfter=now-600, EIP-55 case, value/validAfter/validBefore as strings) — all failed against the same Coinbase CDP facilitator with the same opaque message.

**Conclusion (locked):** the rejection is at a layer the public x402 spec doesn't document. Possibilities we've ruled out vs. left open:

- ~~Wrong EIP-712 domain~~ — confirmed correct via local signature recovery.
- ~~Wrong wrapper version / wrong network spelling~~ — both v1 and v2 variants tested.
- ~~Header name mismatch~~ — server now sends both `X-PAYMENT` AND `x402-payment`.
- **Open**: Coinbase CDP facilitator may require additional out-of-band metadata (CDP API authentication, attestation token, proof of facilitator-pre-registration, etc.) that the public x402 spec doesn't surface. We can't tell from the merchant's generic 402 reflection.
- **Open**: there may be a JCS-canonicalization or specific JSON-key-ordering requirement at the wrapper level we haven't replicated.
- **Open**: Infopunks's middleware may be intercepting and rejecting before forwarding to the facilitator (less likely given the rejection body explicitly cites `facilitator_url`).

Without facilitator-side logs (CDP dashboard) or merchant-side logs (Infopunks server), every additional patch from our end is a coin flip. **This is below the floor of what we can debug in isolation.**

**What's on disk and ready to ship:**

- `scripts/paid-probe.ts` — SDK pivot complete: `createPaymentHeader` builds X-PAYMENT, `recoverTypedDataAddress` self-verifies before sending, `normalizeForSDK` translates merchant dialect (CAIP→SDK network, `amount`→`maxAmountRequired`, object→string `resource`), `patchEnvelopeForCoinbaseV2` available behind `SCRIPTS_PROBE_APPLY_V2_PATCH=true` for future debugging, default emits pure-SDK envelope (most-compatible with the x402 ecosystem).
- `src/route-handlers.ts` — `/route/settle` accepts both `signature` (legacy v0.x for mock-provider compat) and `x_payment` (SDK pre-built); settle forwards both `X-PAYMENT` and `x402-payment` headers; quote returns `payment_requirements_v2` to clients.
- All 9 hand-roll patches still on disk for when a future provider needs the v0.x→v2 dialect handling without an SDK.

**Next-session decision points (do not rebuild from scratch):**

1. **Send the Infopunks DM.** Concise, honest: "Local signature verification proves our envelope is cryptographically correct, but the Coinbase CDP facilitator rejects with generic 'verify failed.' Could you pull the actual rejection reason from your CDP dashboard or facilitator logs?" Offer to share the envelope hex for them to reproduce. They committed to amplifying — they have an interest in unblocking this.
2. **Stand up another v2 provider (non-Coinbase facilitator) as a positive control.** If our envelope works against a different facilitator, it conclusively shows the issue is Coinbase CDP-specific and we can move to other revenue paths while waiting on Infopunks.
3. **Reframe the amplification trigger** — the partnership story doesn't require a paid receipt to be useful. We can DM Infopunks now with: "We integrated against your endpoints, our router successfully proxies through to /v1/simulate-narrative, our quote envelope decodes correctly, the only blocker is facilitator-side rejection we can't diagnose. Here's our route-id, here's our envelope hex, can you help debug?" That's a partnership-grade message; the receipt would be cleaner but isn't required for the relationship.

**Carry-forward state:**

- Probe wallet `0x547C2c615b227800D56b5ed24021C2CbCa0a3057` still has 30 USDC on Base. No funds moved.
- Probe agent provisioned with caps locked.
- TrustBench dev server boots cleanly; quote round-trip fully working against Infopunks.
- Railway deployment still on stale Phase 3 code — may want to deploy SDK pivot regardless to derisk Railway-vs-local config drift before Infopunks responds.
- @InfopunksHQ DM is the highest-leverage next move (task #9 in this session).

---

## 2026-05-05 — P4-1b diagnostic narrowing (Infopunks reply + Run A/B)

**What landed (source-side, Windows-authoritative):** diagnostic patch in `scripts/paid-probe.ts`. Three new log lines (raw merchant `accepts[0]`, wall-clock now in epoch seconds, envelope `validAfter`/`validBefore`/skew computed inside the local-verify block), plus a `SCRIPTS_PROBE_SKIP_NORMALIZE` env flag (default off) that bypasses `normalizeForSDK` and feeds raw `accepts[0]` straight into `createPaymentHeader`. No signing or wallet code changed. tsc clean (only the 4 known carry-forward errors).

**Run A (skipNormalize=false, default behavior):**
- SDK path completed dry-run cleanly.
- `local-verify recovered=0x547C... expected=0x547C... match=true` — crypto correct.
- `envelope clock: validAfter=1777991569 validBefore=1777992469 now=1777992169 skew=-600s` — `validAfter` is 600s in the past, well inside the 300s-ahead `validBefore`. Solidly in the valid window.

**Run B (skipNormalize=true — Infopunks's "pass accepts[0] straight in" hypothesis):**
- `[probe] FAIL sign data:... Unsupported network`. The SDK's `createPaymentHeader` threw synchronously before reaching any signing path because `eip155:8453` is not in `x402@1.2.0`'s `SupportedEVMNetworks` enum.
- This conclusively shows `normalizeForSDK` is NOT a phantom fix. It's required by our pinned SDK version.

**Conclusively ruled out (do NOT re-explore in future sessions without new info):**
- Crypto correctness (every run, `recovered == authorization.from`).
- Clock skew as the rejection cause (negative skew, both bounds within window).
- "Phantom normalization" hypothesis (raw `accepts[0]` does not pass through `x402@1.2.0`).
- Wrapper version v1 vs v2 (yesterday's diagnostics; both rejected with the same opaque message).
- Network spelling `base` vs `eip155:8453` (yesterday's diagnostics; both rejected).
- Header name `X-PAYMENT` vs `x402-payment` (server sends both; both rejected).

**Raw `accepts[0]` confirmed (now in the Infopunks DM body):**
```
{
  scheme: "exact",
  network: "eip155:8453",          // CAIP form
  chain: "Base",
  amount: "10000",                 // not maxAmountRequired
  resource: { url, routeTemplate, inputSchema, outputSchema, extensions.bazaar.{info,schema}, ... },  // nested object, not string
  description: "...",
  mimeType: "application/json",
  payTo: "0xe4E8908308a86aB43E5dEb6C0fd0F006786104c3",
  asset: "0x833589fCD6eDb6E08f4c7c32D4f71b54bdA02913",  // lowercase 'c' in 7c32
  extra: { name: "USD Coin", version: "2" },
  maxTimeoutSeconds: 300
}
```

**What this proves about Infopunks's claim "we pass `accepts[0]` straight to `createPaymentHeader`":** for that and "do not rewrite network from base ↔ eip155:8453" to be simultaneously true, they must be on a different SDK package or version than we are. Either `x402@>1.2.0` (newer enum), `@coinbase/x402` (deliberately avoided here for size), or an internal fork. Their abbreviated example doesn't reveal the pin.

**What's still open:** the actual CDP facilitator rejection reason. Empirical eliminations leave: an SDK-hidden field-shape gate, or a facilitator-side policy gate (key registration, attestation, etc.). Without partner-side logs we cannot narrow further.

**DM sent to @InfopunksHQ 2026-05-05:** raw `accepts[0]` body, our SDK pin (`x402@1.2.0`), Run B failure mode (`Unsupported network`), local-verify match=true proof, clock-skew -600s result, probe wallet `0x547C2c615b227800D56b5ed24021C2CbCa0a3057`, ~13 settle attempts to date with no on-chain nonce consumption. Asked: which package + version they use for `createPaymentHeader`, and whether their facilitator-side error logging is live yet.

**Carry-forward to next session if Infopunks responds with...:**
- "we use `x402@1.X` newer than ours" → bump pin in `package.json`, retry `SCRIPTS_PROBE_SKIP_NORMALIZE=true` against the same merchant.
- "we use `@coinbase/x402`" → SDK swap; same architecture (client-side build, server forwards). ~30min plus retest.
- A specific rejection reason (field shape, attestation, etc.) → patch in `scripts/paid-probe.ts` (likely `normalizeForSDK`), retry `DRY_RUN=false` with single provider.
- Nothing yet → proceed with reweighted sprint (P4-skill → P4-wellknown → P4-llmstxt) per `phase4-kickoff.md` § "State as of 2026-05-06". P4-1b stays paused on Infopunks's response time, not ours.

**Wallet still has 30 USDC on Base.** No funds moved at any point. Still safe to retry on demand.

**Diagnostic-patch file integrity check:** `paid-probe.ts` is 785 lines after the patch (was 761; +24 matches expectation). Edits verified via Read (Windows mount). Bash sandbox view truncated at line 375 — same `file-tools-vs-bash` mismatch from the 2026-05-06 lesson; do not use bash `wc -l`/`tsc` to verify file integrity, use Read or run `tsc --noEmit` from PowerShell.

---

## 2026-05-05 — Discovery sprint shipped (P4-skill + P4-llmstxt + P4-wellknown)

**What landed:** the three Tier-1 discovery surfaces from `phase4-kickoff.md` § "Agent discovery", co-shipped while waiting on Infopunks's reply to the SDK-version question.

**Files written / refreshed:**

- `skill.md` (new, repo root) — agent skill file in the agentic.market/skill.md format. Frontmatter on first two lines (`name: trustbench-policy-router`, `description: …`), closing `---`, then markdown body. Augment-only positioning per the locked decision: the skill defers to `agentic.market/skill.md` for wallet setup (Coinbase Agentic Wallet) and only documents what TrustBench layers on top (idempotency, hard spend caps, signed receipts, queryable audit, non-custodial routing). Two-path structure (CLI / MCP) mirrored from Coinbase's skill. MCP-host section is honest about the lack of a native TrustBench MCP server today; falls back to "use the host's HTTP-fetch tool" and flags a native MCP as a Phase 4 follow-up. Em-dash policy: this is public outreach copy, so no em-dashes anywhere — used commas, parens, periods, colons. API access path is "DM @TrustBench on X" (Phase 4 is invite-only).

- `llms.txt` (refreshed in place) — already existed but referenced "Phase 3 in build" and a "public route not yet mounted" status. Targeted edits updated: the blurb (Phase 3 closed), the "Authenticated routing" header (Phase 3 live; Phase 4 invite-only), the audit-endpoint status block, the API-access path (DM @TrustBench), the pricing block (Phase 4 invite-only). New "## Agent-discovery surfaces (Phase 4)" section added between public-key URL and the authenticated-routing section, listing /skill.md, /.well-known/trustbench.json, and /llms.txt itself.

- `.well-known/trustbench.json` (new, repo root) — machine-readable manifest. Full surface map (publicEndpoints, authenticatedEndpoints), capabilities + networks + settlement assets, signing scheme (Ed25519, JCS, public-key URL, fallback algorithm, verifier scripts), custody claim ("non-custodial: never holds funds, never signs payments, never broadcasts transactions"), pricing model (flat-per-tx + verification bond, Phase 4 invite-only), policy primitives (idempotency / spend caps / signed receipts / queryable audit), discovery references (Agentic Market, x402.org, CDP), phases (3 closed 2026-05-04, 4 in progress, 5 planned), contact (X handle + GitHub repo).

- `src/index.ts` — added two imports (`readFileSync` from `node:fs`, `path` from `node:path`), one helper (`loadStatic`) that reads from `process.cwd()` at boot, three module-level constants (`SKILL_MD_BODY`, `LLMS_TXT_BODY`, `WELL_KNOWN_TRUSTBENCH_JSON_BODY`), and three Hono routes (`/skill.md`, `/llms.txt`, `/.well-known/trustbench.json`) with appropriate Content-Type headers and `Cache-Control: public, max-age=3600`. Each route returns 503 if the file failed to load at boot, but the boot itself does NOT crash on missing static — partial deploys still serve the rest of the API.

- `README.md` — endpoint list updated to mention `/skill.md`, `/llms.txt`, and `/.well-known/trustbench.json` honestly. The previous README claimed `/llms.txt` existed but no Hono route actually served it; now it does.

**Why this set of three together:** the kickoff doc's Tier-1 discovery surfaces are co-shipped because each one is independently small and they reinforce each other. Skill.md drives traffic to a developer-facing page; llms.txt drives LLM-grounded research; the well-known manifest is what crawlers and structured agent integrations look for. Each links to the other two, so an agent landing on any of them finds the full surface map.

**File-tools-vs-bash truncation hit again** during this work: `wc -l` from bash on `paid-probe.ts` and `lessons.md` showed truncated line counts. Verification was done exclusively via Read against the Windows mount. Pattern is now well-understood: the bash sandbox occasionally serves a partial copy of files that have been recently edited via the file tools. Adding to the file-tools-vs-bash lesson permanently in `feedback_chat_markdown_render_fake_bugs.md` is overkill (different root cause) but worth a separate lesson note: trust the Read tool, not bash `wc` / `tsc` / `grep`, for verifying recent edits.

**Verification (deferred to Windows-side, since bash isn't trustworthy on edited files):**
- `npm run typecheck` from PowerShell. Should still show only the 4 known carry-forward errors (3 in `node_modules/@supabase/realtime-js`, 1 in `src/server.ts` stale stub). The new code only uses standard-library imports (`node:fs`, `node:path`) and existing Hono APIs; no new type surfaces.
- `npm run dev` then `curl http://localhost:3000/skill.md` (expect text/markdown, content of skill.md), `curl http://localhost:3000/llms.txt` (expect text/plain), `curl http://localhost:3000/.well-known/trustbench.json` (expect application/json).
- Visual sanity check on the served skill.md from a copy/paste perspective: would an agent builder paste this into Claude Code and get a useful capability? The frontmatter description is dense with trigger words (spend cap, idempotency, double-charge, audit, signed receipt, non-custodial, etc.) so discovery should work.

**Failure modes** (per high-risk-surface discipline, even though these aren't high-risk surfaces):
- Static-asset load fails at boot → 503 on those three routes; the rest of the API still works. Recovery: redeploy with the missing file. No security implications.
- File-tools-vs-bash truncation → Read tool verifies on-disk integrity authoritatively; if the user runs `tsc` on Windows and it reports new errors, suspect truncation and re-Read.
- Outdated copy in skill.md / llms.txt → cache-control is 1 hour, so iterative copy edits ship within an hour of the next deploy. Non-critical.

**Carry-forward to next session:**
- If Infopunks responds with their SDK pin (the open question from the 2026-05-05 P4-1b diagnostic), pivot back to P4-1b: bump the `x402` package or swap to `@coinbase/x402`, retry the live attempt, ship the first paid receipt, DM Infopunks back with the receipt URL for amplification.
- If Infopunks's response delays further, the next items in the kickoff sprint are P4-1 (full ecosystem refresh against `x402.org/ecosystem`), P4-1c (taxonomy alignment to 5-cat), P4-1d (switch crawler source to Agentic Market), then P4-bazaar.
- The skill.md description's trigger word list can be tuned over time based on which agent skills actually load it — track which builders cite which trigger words in any feedback they share.

---

## 2026-05-05 — Registry refresh sprint (P4-1 + P4-1c + P4-1d + P4-verify-tier)

**Context:** Infopunks DM still in flight. Next items in the reweighted sprint per `phase4-kickoff.md` were P4-1 (ecosystem refresh), P4-1c (taxonomy 5-cat), P4-1d (Agentic Market crawler), P4-verify-tier (integrationType metadata). All four bundle into one coherent registry-touching change. P4-bazaar is out of "while waiting" scope (~1.5–2 weeks, requires server-side x402 wire layer).

**Pre-flight reality check on Agentic Market schema** (before coding): probed `https://api.agentic.market/v1/services` once. Findings vs the kickoff doc:
- Pagination is real: `total: 653`, `limit: 50`, `offset: 0`. Crawler must page through ~13 pages.
- Categories observed in the wild are 10, not 5: Search / Inference / Data / Media / Infra (the canonical 5) plus Travel / Social / Storage / Other / Trading. The kickoff doc's "5-cat alignment" is correct for the routable subset, but the crawler needs to handle the long tail.
- `integrationType` values are `"1P"` and `"3P"` (third-party / proxied), not `"1P"` and `"proxied"` as the kickoff doc claimed.
- Networks are mixed: `"Base"`, `"Polygon"`, `"Solana"`, `"eip155:8453"`. Both friendly names and CAIP form coexist on different services. Phase 4 only routes Base, so the crawler normalizes and filters.
- Pricing scheme is `"exact"` or `"upto"` with min/max amount fields. We store everything; the prober gracefully fails on `"upto"` (no flat amount).
- Service rows can have multiple endpoints with different prices. Crawler emits one provider row per (service, endpoint) pair.

**Files changed:**

- `src/provider-selection.ts` — `Capability` type expanded to `'search' | 'inference' | 'data' | 'media' | 'infra'`. Added `ROUTABLE_CAPABILITIES` exported `ReadonlySet` for runtime validation.
- `src/route-handlers.ts` — imports `ROUTABLE_CAPABILITIES`, validator uses it instead of hard-coded array, error message updated to mention all 5 capabilities.
- `src/index.ts` — mcp/tools enums updated for `media`/`infra` (both rankings + route_quote tool descriptors).
- `src/crawler.ts` — wholesale rewrite:
  - Replaced CDP discovery API call with paginated `api.agentic.market/v1/services` (limit=50, polite 100ms delay between pages).
  - Retired the obsolete hard-coded fallback list of ~20 AI-API roots. They were mostly NOT actually-x402 endpoints and were actively misleading rankings (HEAD-probe treats 401 as alive, so OpenAI/Anthropic/Perplexity roots scored highly without ever emitting a real 402).
  - Network filter: store rows that advertise at least one Base-compatible network (`base` or `eip155:8453`). Polygon/Solana skipped until cross-chain support.
  - One row per (service, endpoint) pair. Capability column is `service.category.toLowerCase()` (so `search`/`inference`/`data`/`media`/`infra`/`travel`/`social`/etc. all flow through). Routable filter happens at `/route` via `ROUTABLE_CAPABILITIES`, not at crawl time.
  - `metadata.integration_type` records Coinbase's curatorial signal ("1P" or "3P").
  - `metadata.am_service_id`, `am_provider`, `am_category`, `networks`, `method`, `pricing` recorded for traceability.
  - `seedKnownX402Endpoints()` for the 3 Infopunks endpoints preserved verbatim. Runs LAST so its rows win on URL conflict (preserving `x402_probe_method` + `x402_probe_body` + `x402_verified` metadata).
- `src/scorer.ts` — `getRankings` now projects `integration_type` alongside `x402_verified` (defensive coercion: only `"1P"` or `"3P"` qualifies; everything else maps to `null`). Cache key bumped to `rankings:v3:` so v2-cached rows don't leak missing-field shapes to clients. Signed scorecard payload (`signScorecard`) is unchanged — `integration_type` is intentionally NOT in the signed bytes, so all existing scorecard signatures stay valid.
- `skill.md`, `llms.txt`, `.well-known/trustbench.json` — capability lists updated to mention all 5.

**Two-bit verification stack (per P4-verify-tier):**
- `x402_verified === true` — empirical: TrustBench probed the endpoint and confirmed it emits a valid x402 challenge body. Set today only by `seedKnownX402Endpoints()` (Infopunks).
- `integration_type === '1P'` — curatorial: Coinbase Agentic Market certified the service as a first-party native x402 integration.
- `integration_type === '3P'` — curatorial: Coinbase certified it as a proxied integration (paywall middleware in front).
- `null` on either field means "no signal" — neither verified nor curated.

These signals are independent and additive. A row that's both `x402_verified=true` AND `integration_type='1P'` has the strongest trust profile. Rankings expose both; clients can filter or sort however they want. The router's `selectProvider` already prefers `x402_verified=true` first; adding `integration_type='1P'` as a secondary preference is a Phase 4 follow-up if rankings show stale-but-1P providers wrongly outranking fresh-but-unverified ones.

**No DB migration required.** `schema.sql` line 14 is `capability text not null` with no CHECK constraint. New capability values just work. Existing rows stay valid. The validator-side enum is the only gate.

**Failure-mode analysis (per high-risk-surface discipline, even though crawler isn't a high-risk surface):**
- Agentic Market unreachable → seed-only crawl. Registry doesn't go fully empty. Logged as a warning. Recovers automatically on next nightly run.
- Agentic Market schema drift → `as { services: AmService[]; total: number; ... }` cast may produce undefined fields, which are guarded with `||` defaults throughout. Worst case: a row gets stored with sparse metadata; the next crawl re-upserts with whatever's current.
- Capability validation in `/route` is a hard gate: a request for `capability=travel` returns 400 `capability_invalid`. Even if the crawler stores Travel rows, they don't leak into routing.
- Cache-key bump (`v2` → `v3`): old `rankings:v2:*` keys age out within 5 minutes. No client-side breakage; they'd just see a cache miss + fresh row with new fields.
- Scorecard signature scope is unchanged: `integration_type` is NOT in the canonical signed payload, so all existing receipts and scorecards verify identically.
- Network filter (Base only) means Solana-native services from Agentic Market are silently dropped. Acceptable for Phase 4. Phase 5 (multi-chain settlement) revisits.

**Verification (deferred to Windows-side):**
- `npm run typecheck` — should still show only the 4 known carry-forward errors. New code is fully typed; the AmService / AmEndpoint shapes are explicit. ROUTABLE_CAPABILITIES export is a `ReadonlySet<Capability>`.
- `npm run crawl` — fetches Agentic Market, paginates ~13 pages (~650 services), should produce on the order of 100–200 routable rows after the Base-only filter and per-service endpoint expansion. Then runs the seed (3 Infopunks rows) last.
- `npm run pipeline` — the prober (HEAD requests) runs against whatever's in the providers table, so it will start probing Agentic Market endpoints automatically. Latency / success rates will populate the scorecards for the new rows.
- `curl http://localhost:3000/rankings?capability=media` — should return rows once the crawl populates Media-category services.
- `curl http://localhost:3000/.well-known/trustbench.json` — capabilities array should now have 5 entries.

**Carry-forward to next session:**
- After the next `npm run crawl` + `npm run pipeline` run, sanity-check the registry: `select capability, count(*) from providers group by capability;` from Supabase. Expect a long-tail distribution with Search/Inference/Data/Media/Infra well-populated, and the non-routable categories (Travel/Social/Storage/Trading/Other) stored but dormant.
- Investigate whether the prober's HEAD probe needs adjustment for the new Agentic Market endpoint types. Some may be POST-only and require the same `metadata.x402_probe_method` + `x402_probe_body` pattern as the Infopunks seed.
- If Infopunks responds with their SDK pin, pivot back to P4-1b. The registry refresh is independent and stays valuable regardless.
- P4-bazaar (listing TrustBench's services on Agentic Market) is the next big sprint piece, but requires server-side x402 wire layer (~2 days of work) and is out of "while waiting" scope.

---

## 2026-05-06 — P4-1b unblock landed (Infopunks reply + v2 SDK swap)

**Trigger:** Infopunks replied 2026-05-06 confirming the diagnosis from yesterday's DM. Verbatim direction:
> "are you pinned to legacy x402@1.2.0? The cognition layer is emitting v2-style CAIP-2 network IDs like eip155:8453. Official Coinbase/x402 docs now say v2 uses CAIP-2 network identifiers such as eip155:8453 for Base, while legacy v1 used strings like base / base-sepolia. The migration docs also list the old monolithic x402 package as legacy and recommend current packages like @x402/core, @x402/fetch, @x402/evm, etc."

**Pre-flight package validation:**
- `npm view @x402/core @x402/evm @x402/fetch` confirmed all three exist at version 2.11.0. `@x402/evm` requires `viem ^2.39.3` (we were on 2.21.0, needed bump).
- Pulled the tarballs to /tmp and inspected `dist/cjs/**/*.d.ts` to map the API surface before changing package.json. Findings:
  - `@x402/core/types` exports `Network = `${string}:${string}`` (accepts CAIP form natively), `PaymentRequirements` (matches the merchant's raw accepts[0] shape with `scheme`, `network: Network`, `asset`, `amount`, `payTo`, `extra`, etc.), `PaymentPayload`, `PaymentRequired`, `PaymentPayloadResult`.
  - `@x402/core/http` exports `encodePaymentSignatureHeader(payload: PaymentPayload): string` (the v2 equivalent of `createPaymentHeader`).
  - `@x402/evm` exports `ExactEvmScheme(signer: ClientEvmSigner)` with `.createPaymentPayload(x402Version, paymentRequirements, context?)` returning `Pick<PaymentPayload, 'x402Version' | 'payload'> & {extensions?}`.
  - `ClientEvmSigner` is structural: just `{address: \`0x${string}\`, signTypedData(...): Promise<\`0x${string}\`>}`. A viem `LocalAccount` from `privateKeyToAccount` duck-types as a `ClientEvmSigner` directly.
- The high-level `wrapFetchWithPayment` from `@x402/fetch` is for the auto-pay-on-402 pattern (agent makes a request, gets a 402, SDK auto-retries with payment). We don't need it because TrustBench's `/route` quote is a separate step that has already extracted the requirements; we just need the lower-level "build the X-PAYMENT header from a known PaymentRequirements" path.

**Files changed:**

- `package.json` — dependencies: `x402: ^1.2.0` removed, `@x402/core: ^2.11.0` and `@x402/evm: ^2.11.0` added. devDependencies: `viem: ^2.21.0` → `^2.39.3` (peer requirement of @x402/evm). `@x402/fetch` not added — the lower-level @x402/core/http + @x402/evm path is sufficient.

- `scripts/paid-probe.ts` — v2 SDK swap. Imports replaced with `ExactEvmScheme` from `@x402/evm`, `encodePaymentSignatureHeader` from `@x402/core/http`, `PaymentPayload` and `PaymentRequirements` types from `@x402/core/types`. The v2 path now reads:
    ```ts
    const evmScheme = new ExactEvmScheme(account as any);
    const paymentRequirements = q.payment_requirements_v2 as unknown as PaymentRequirements;
    const result = await evmScheme.createPaymentPayload(2, paymentRequirements);
    const fullPayload: PaymentPayload = {...result, accepted: paymentRequirements};
    const xPayment = encodePaymentSignatureHeader(fullPayload);
    settlePayload = {x_payment: xPayment};
    ```
  Removed: `CAIP_TO_SDK_NETWORK`, `SDK_TO_CAIP_NETWORK`, `patchEnvelopeForCoinbaseV2()`, `normalizeForSDK()`, `SCRIPTS_PROBE_SKIP_NORMALIZE` env flag, `SCRIPTS_PROBE_APPLY_V2_PATCH` env flag. The v2 SDK accepts the merchant's raw `accepts[0]` shape directly (CAIP network names, `amount` instead of `maxAmountRequired`, `resource` as a nested object) per Infopunks's directive. Translation layer is moot.

  Kept verbatim: legacy `signEip3009` → `signature` path for mock-provider B-series compat. Mock-provider returns the v0.x flat shape with no `payment_requirements_v2`, so paid-probe falls through to the legacy path automatically. B1-B4 smoke tests stay green.

  Also kept: local-verify gate (recovers signer via viem to confirm crypto is sound before sending), validAfter/validBefore/skew clock log, raw `accepts[0]` log.

  Server side `src/route-handlers.ts` settleHandler is unchanged. It already accepts both `{route_id, signature}` (legacy) and `{route_id, x_payment}` (SDK pre-built); the `x_payment` field is forwarded as the `X-PAYMENT` header to the merchant verbatim.

- `project_p4_1b_state_2026_05_06.md` (memory) — frontmatter retitled "v2 SDK swap landed, awaiting user-side npm install + live retry". State summary updated. Operational runbook refreshed with the npm install + dry-run + live retry sequence.

- `MEMORY.md` — pointer updated.

**Why we kept the dual-path (v2 SDK for real merchants, legacy `signEip3009` for mock):**

The mock-provider in `scripts/mock-provider.ts` returns a v0.x flat 402 challenge that doesn't include `accepts[0]`. TrustBench's `route-handlers.probeFor402Challenge` reads the v0.x top-level fields and produces a `PaymentRequired` with no `payment_requirements_v2`. paid-probe then falls into the legacy branch which uses `signEip3009` (hand-rolled viem typed-data sign) to produce a 65-byte signature. Server's settleHandler reconstructs the X-PAYMENT envelope from that signature. This is all unchanged. The B-series (B1-B4) idempotency and replay smoke tests run through this path and are unaffected by the v2 SDK swap.

If we ever migrate the mock to emit v2 shape, we can remove the legacy path. Not urgent.

**Failure-mode analysis (per high-risk-surface rule):**

- If `ExactEvmScheme.createPaymentPayload` rejects the raw `accepts[0]` for any reason (zod schema mismatch, missing field, etc.), it throws synchronously. The catch in the main loop logs `[probe] FAIL sign` and no money moves. Same safety profile as before.
- If the SDK signs but with a wrong wallet or wrong typed-data domain, the local-verify gate (`recoverTypedDataAddress`) catches it: `recovered != authorization.from` would log mismatch. We send anyway (the gate is diagnostic, not blocking) but the facilitator would reject and no money moves.
- If the SDK signs correctly and the facilitator accepts, the merchant returns 200 with `tx_hash`, and we get a receipt. First paid receipt against a real x402 provider.
- If the SDK signs correctly but the facilitator rejects, Infopunks said they'd add facilitator-side logging in time for our retry — so the rejection now produces a real cause. We act on it.
- The `account as any` cast on `ExactEvmScheme(account as any)` is purely a type accommodation: viem's `LocalAccount.signTypedData` has a more strictly-typed generic signature than the SDK's `Record<string, unknown>` shape, but the runtime call is interchangeable. No runtime risk.
- The `q.payment_requirements_v2 as unknown as PaymentRequirements` cast is also a type accommodation: the server returns `Record<string, unknown>` for the raw envelope, the SDK expects the named type, but the SDK's zod-validation runs at runtime regardless of TS types. If the merchant emits a malformed shape, the SDK rejects synchronously.

**Smoke-test plan (deferred to user-side; bash sandbox can't reach Windows mount reliably):**

```powershell
cd C:\Users\Lithv\Documents\Claude\Projects\TrustBench
npm install                                    # pulls new deps, removes x402
npm run typecheck                              # only 4 carry-forward errors expected
npm run mock-provider &                        # background, in another shell
$env:SCRIPTS_PROBE_API_KEY = ...               # same env block as before
$env:SCRIPTS_PROBE_DRY_RUN = 'true'
npm run paid-probe                             # dry mock-provider; legacy path
# Should log: [probe] DRY ... path=legacy (mock has no payment_requirements_v2)

# Then point at Infopunks via Railway (or local against Infopunks):
$env:TRUSTBENCH_BASE_URL = 'http://localhost:3000'  # or production URL
$env:SCRIPTS_PROBE_CAPABILITIES = 'data'
npm run paid-probe                              # dry-run; v2 path
# Should log:
#   [probe] DEBUG raw merchant accepts[0]: {...}
#   [probe] DEBUG v2 envelope built (x402Version=2, payloadKeys=signature,authorization)
#   [probe] DEBUG envelope clock: ... skew=...s
#   [probe] DEBUG local-verify recovered=0x547C... expected=0x547C... match=true
#   [probe] DRY ... path=sdk

$env:SCRIPTS_PROBE_DRY_RUN = 'false'
npm run paid-probe                              # LIVE retry against Infopunks
# Expected:
#   [probe] OK data:...  receipt=rcpt_...  ###ms
# OR (if facilitator still rejects but with fresh logging on Infopunks's side):
#   [probe] FAIL settle ... status=502 ... <specific cause>
```

If live succeeds: that's the first paid receipt against a real x402 provider. DM @InfopunksHQ with `https://trustbench.io/receipts/<id>` and the verifier instructions; they committed to amplifying ("first external evidence trail through the cognition layer").

**Resource-URL scheme bug Infopunks flagged separately:**

In our raw `accepts[0]` packet, Infopunks noticed `resource.url` was emitted as `infopunks-cognition-layer-x402.onrender.com/v1/simulate-narrative` (host-only, no scheme) instead of fully-qualified HTTPS. They're patching cognition to make resource URLs always fully-qualified for Bazaar / validators / external SDKs. (Note: the Cowork chat-markdown auto-linkifier rendered both versions identically in the chat paste, but the bug is real on their side. Not a TrustBench-side issue.) Once they patch, the next probe should pull the corrected envelope and the client side automatically uses it.

**Carry-forward to next session:**
- If user runs the dry-run + live attempt and gets a clean receipt → DM @InfopunksHQ with the receipt URL, mark P4-1b shipped, switch to P4-2 (public receipt explorer) per the original Phase 4 plan.
- If live still rejects → wait for Infopunks's facilitator-side logging to give us a real cause, then patch in `paid-probe.ts` (likely a small shape adjustment).
- If npm install fails (peer-dep conflict, etc.) → report the error; the SDK swap is the right direction even if there's a transient package-resolution issue.

---

## 2026-05-06 — P4-1b SHIPPED (full session retrospective)

**Ship state:**
- Public Railway-issued receipt: `rcpt_01KQY7C44GAPSXZPFQYRZ1D10C` at `https://trustbench-production.up.railway.app/receipts/rcpt_01KQY7C44GAPSXZPFQYRZ1D10C`.
- On-chain: tx `0x3e6d6078c092f6a1f7be95bbb387b9dbfdc3d9471f21bad7859514fab1997a41` settled at Base block 45633871, payer `0x547C2c615b227800D56b5ed24021C2CbCa0a3057` → payee `0xe4E8908308a86aB43E5dEb6C0fd0F006786104c3`, 0.01 USDC.
- Verifier output: `✅ SIGNATURE VALID — receipt is authentic.` + `✅ ON-CHAIN VERIFIED — the receipt matches the actual transaction.` No overrides needed; default `verify-receipt.js` against the Railway URL works out of the box.
- Local-issued precursor receipt (before BASE_URL flip): `rcpt_01KQY629W1HWJW19E87ECR4ZTR`, tx `0x706d3f16df8490785855cabb1ff9b9ba5673e2d154a9e253d5b3210b9541bb6e` block 45633185. Has `public_key_url: "https://trustbench.io/.well-known/trustbench-pubkey"` (DNS not wired); verifies with `--pubkey-url` override pointing at Railway. Stays valid as historical artifact.
- Orphan tx (no receipt): `0xe77c9af41042253c1c2851ec34036a764f0425155c43fc1fbb592bd02e5934b2`, ~0.01 USDC. Issued during diagnostics: the 6,444-byte X-PAYMENT envelope reached Render's header-size limit (431) on the first hop, but the on-chain settlement still landed via the CDP facilitator's async path. We can backfill a receipt for this tx via a one-shot script later if symmetry matters; for now it stays as proof that the architecture works even when the audit trail breaks.

**Five-fix retrospective (in order discovered + landed):**

1. **Legacy `x402@1.2.0` package was the wrong SDK.** Targets x402 v1, throws `Unsupported network` on CAIP-form `eip155:8453`. Replaced with the modular v2 packages (`@x402/core` + `@x402/evm` at 2.11.0). 440 transitive packages dropped, 2 added. `viem` bumped from `^2.21.0` to `^2.39.3` to match @x402/evm peer dep.
2. **Normalization layer was solving a phantom problem.** `normalizeForSDK` (CAIP→base, amount→maxAmountRequired, object→string resource) existed because v1 zod rejected the merchant's raw shape. v2 SDK accepts the raw `accepts[0]` directly. Removed the entire normalization helper plus `patchEnvelopeForCoinbaseV2` and the two env-flag toggles.
3. **Slim `accepted` before encoding.** Infopunks's `accepts[0]` includes ~5.9 KB of OpenAPI input/output schemas embedded in `resource`. Spreading the raw value into `PaymentPayload.accepted` produces a ~6.4 KB X-PAYMENT envelope that Render rejects with HTTP 431 *before the facilitator sees the request*. Fix: build `accepted` with only the 7 spec PaymentRequirements fields plus a string-form `resource.url`. Envelope drops to ~1 KB raw (~1.4 KB base64). 8x reduction.
4. **Async-settlement merchants don't emit `X-PAYMENT-RESPONSE`.** Coinbase CDP-mediated providers (Infopunks specifically) verify the X-PAYMENT with the facilitator, return 200 with their domain response synchronously, and let the actual `transferWithAuthorization` settle on-chain a few seconds later. The tx_hash is never in the merchant's HTTP response. Fix: in `settleHandler`, when `parseTxHashFromResponse` returns null, fall back to a Base RPC `getLogs` query for `AuthorizationUsed(authorizer, nonce)` keyed off the EIP-3009 nonce we already have in the X-PAYMENT envelope. 4 retries at 1.5s intervals covers the typical async-settle window. Architecturally cleaner than trusting merchant claims because the chain is the source of truth.
5. **Railway was on pre-Phase-3 code.** `git status` revealed every Phase 3 source file, every Phase 4 doc, every script and design sketch was untracked. The "stale Phase 3 code on Railway" memory entry from earlier was understated; Railway was actually on whatever was in git before Phase 3 started. One ~13K-insertion commit landed all of Phase 3 + Phase 4 publishable work. After Railway redeployed, the receipt that local-server had issued was already publicly fetchable because Railway and local share the same Supabase project.

**Engineering decisions worth keeping:**

- **Trust the chain, not the merchant.** The chain-lookup fallback isn't a workaround for Infopunks; it's the architecturally correct settlement-observation pattern for non-custodial routing. A merchant claiming a tx happened that didn't would just produce no log match → null → 502, no receipt. If we ever ship our own merchant-side x402 layer (P4-bazaar), it should still emit `X-PAYMENT-RESPONSE` for the fast path, but consumers should treat it as advisory and chain-verify when audit matters.
- **Detached signature on receipts is load-bearing.** The same Ed25519 receipt verifies under any TrustBench instance because `public_key_url` isn't part of the signed bytes. Saved us from having to re-sign existing receipts when the BASE_URL env flip changed embedded URLs. Also makes future infrastructure migrations (custom domain, multi-region) painless.
- **Slim envelope is more than a Render workaround.** Even merchants without 431 limits would prefer ~1 KB envelopes over ~6 KB ones. The slim is now baseline.

**Operational notes worth keeping:**

- **Stale `.git/index.lock` is most often VSCode's source-control panel.** Close VSCode (or SourceTree, GitHub Desktop) before any committing-via-CLI work. `Remove-Item .git\index.lock` is the recovery; safe as long as no other git process is actually running (`Get-Process git -ErrorAction SilentlyContinue` to confirm empty).
- **PowerShell + multi-line `git commit -m "..."` doesn't always close cleanly.** Use `Out-File commit-msg.txt -Encoding utf8` + `git commit -F commit-msg.txt` for any commit with linebreaks, code blocks, or special chars. Removes the heredoc-quoting fragility.
- **PowerShell treats `<` as a redirect operator.** Don't paste shell commands with `<placeholder>` literals — substitute first or wrap in single quotes.

**Carry-forward state:**

- Wallet `0x547C2c615b227800D56b5ed24021C2CbCa0a3057` at ~29.97 USDC (started 30.00, three on-chain settles at 0.01 each).
- Railway `BASE_URL` env now `https://trustbench-production.up.railway.app`. trustbench.io DNS still not wired; future polish item. Once DNS lands, can flip BASE_URL back to canonical brand URL and old receipts (the local-issued one) become verifiable without override too.
- Diagnostic logs in `settleHandler` (response headers + body dump) should be removed before any public traffic — they're useful for partner-debug rounds but bloat prod logs. Tracked as a small Phase 4 polish.
- Two registry-quality follow-ups still parked: stripping template URLs (`{task-id}`, `{chainNetwork}`) from the crawler output, and pruning rows that didn't show up in the latest Agentic Market crawl.

**Next sprint item per `phase4-kickoff.md`:** P4-7 — Strict reservation-based spend caps. Two-signal validation (Infopunks + CLU_AGENT) bumped this up from the deferred bottom. Design sketch already in `phase4-spend-caps-reservation.md`. Estimated ~1 day of focused work; smoke plan C1-C4 is the load-bearing test.

---

## 2026-05-06 — CLU_AGENT external signal → P4-7 priority bump

**Trigger:** CLU_AGENT (automated by @Logik185) replied to the 2026-05-05 X post about /route + spend caps + Ed25519 receipts. Captured in `phase4-clu-agent-handoff.md`. The substantive line:

> "Idempotency keys + server-side caps are the floor. We found Ed25519 receipts alone don't catch sybil double-spend on the relay layer — need per-agent spend bucket + per-call timeout reversion. L402 primitives work, but the audit tail is where most teams slip."

**Signal extraction:** "per-call timeout reversion" is an external naming of the gap CLAUDE.md already flags as a Phase 3 limit — "Spend caps are approximately enforced under concurrency. The check reads the rolling-window total at quote time; under N concurrent in-flight quotes for the same agent, total spend can overshoot by up to `(N − 1) × max_price`." This is **P4-7 — Strict reservation-based spend caps** in the kickoff doc.

**Two-signal validation:** the framing now has independent corroboration from two external sources:
1. Infopunks's Phase 2 conversations + 2026-05-04 cognition launch where they framed receipts/audit-trail as "the audit tail is where teams slip" (which is what their cognition-layer framing also reflects).
2. CLU_AGENT's 2026-05-06 X reply naming "per-call timeout reversion" as a gap.

**The strawman in the reply** ("Ed25519 receipts alone don't catch sybil double-spend") doesn't land — we have idempotency and caps too, not just receipts. Don't take that part literally. The reservation/release implication stands separately and is the load-bearing point.

**Priority bump landed in `phase4-kickoff.md`:**

Old sprint order (item 8+): `P4-1b unblock → P4-2 → P4-6 → original order`.

New sprint order from item 8 onward:
1. P4-1b unblock (in flight 2026-05-06).
2. **P4-7 — strict reservation-based spend caps** (bumped from the deferred bottom).
3. P4-bazaar (server-side x402 wire layer + service listings; ~1.5–2 weeks).
4. P4-2 — public receipt explorer.
5. P4-6 — formal Infopunks integration.
6. Original order: P4-3 (Solana) → P4-4 (npm package) → P4-5 (receipt-spec docs) → P4-8 → P4-9 → P4-10 → P4-11.

**Why P4-7 is also the easiest of the deferred items, technically:** the existing `requireWithinSpendCap` middleware in `src/spend-caps.ts` reads the rolling-window total at quote time and rejects if `total + max_price > cap`. The reservation pattern adds two changes: (a) at quote issuance, atomically debit a `pending_spend_atomic` counter on the agent row; (b) at settle (or quote expiry), credit it back. The hard cap then becomes `total_spent + total_pending + max_price > cap`. ~1 day of focused work, server-side only, smoke-testable with a quick concurrency harness. The two external signals just confirm the priority; they aren't load-bearing for the implementation.

**Optional X reply (em-dash-free per outreach memory, draft):**

> You're naming the reservation/release gap on the quote→settle window. Today's caps are server-side hard caps per-agent + per-call, approximate under concurrency. Strict reservation lands as P4-7. Idempotency for replay, receipts for audit, reservation as the third leg.

Unsent at session close. Send if it feels right; the prioritization implication stands either way.

**@Logik185 (the human operator):** worth adding to Grok-side X research for partnership/reach context. The automated reply is technically substantive, suggests the operator has thought about agent-payment infra seriously. Not on the urgent path.

**Carry-forward to next session:**
- After P4-1b ships (live receipt), P4-7 is the next sprint piece. Read `src/spend-caps.ts` first; the change is small but the failure mode (over-reservation, deadlock, or under-release on partial settle) needs careful handling.
- Update receipt schema / `receipt-spec-v1.md` is NOT required for P4-7 — reservation state is an internal `agents.pending_spend_atomic` counter, not a receipt field. No external compatibility break.
- The handoff doc `phase4-clu-agent-handoff.md` can stay at root as a historical anchor; the actionable bits are now in this lessons entry + the kickoff sprint table + the new memory entry.
