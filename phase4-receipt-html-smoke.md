# Phase 4 — Receipt HTML rendering smoke

**Pairs with:** `phase4-smoke-c1-c4.md` (P4-7 reservation caps).
**Tests:** content-negotiation on `GET /receipts/:id`, server-side signature verification, on-chain verification, tampered-receipt red badge.

## Pre-flight

Verify Windows-side typecheck (the bash sandbox view of `src/index.ts` is unreliable per the file-tools-vs-bash lesson; PowerShell is the canonical environment):

```powershell
npm run typecheck
```

Expected: only the pre-existing carry-forward errors (`@supabase/realtime-js` → `@supabase/phoenix` x3 and `src/server.ts` default-import x1). Zero new errors from `src/receipt-html.ts` or `src/index.ts`.

Local dev server should already be running with `SPEND_CAP_RESERVATION_ENABLED=true`. No additional env needed for HTML rendering — public Ed25519 key is read in-process via `getPublicKeyPem()`.

## H1 — JSON path unchanged (regression)

Programmatic clients must keep working byte-identically. This is the load-bearing backward-compat test.

```powershell
$BASE     = "http://localhost:3000"
$RECEIPT  = "rcpt_01KQYAV30T7WVCY1BJWCVP7MGW"   # Or any other receipt id you have

# Default Accept: */* on curl — should return JSON.
$json1 = curl.exe -s "$BASE/receipts/$RECEIPT"

# Explicit JSON Accept — should return JSON.
$json2 = curl.exe -s -H "Accept: application/json" "$BASE/receipts/$RECEIPT"

# ?format=json query override — should return JSON.
$json3 = curl.exe -s "$BASE/receipts/$($RECEIPT)?format=json"

# All three should be byte-identical.
$json1 -eq $json2
$json2 -eq $json3
```

**Pass:** all three are identical and start with `{"receipt":{"version":"1.0.0",...`. Run the existing reference verifier as a final check that the JSON payload is unchanged:

```powershell
npm run verify-receipt -- $RECEIPT $BASE
```

**Pass:** `✅ SIGNATURE VALID — receipt is authentic.`

If the verifier fails after the change, the JSON path was inadvertently broken. Roll back before continuing.

## H2 — HTML path renders polished page

```powershell
# Open in browser:
Start-Process "$BASE/receipts/$RECEIPT"

# Or fetch the HTML to inspect:
curl.exe -s -H "Accept: text/html" "$BASE/receipts/$RECEIPT" > receipt.html
notepad.exe receipt.html
```

**Pass criteria** (visual inspection):

- `<!DOCTYPE html>` at top, `<html lang="en">`, page title `Receipt rcpt_... · TrustBench`.
- Big `✅ Verified receipt` headline bar.
- Two badges below: `✅ Signature valid` and `✅ On-chain verified`.
- Settlement table with: tx_hash + Basescan link, block number, payer, payee, amount in human-readable USDC, settled_at timestamp.
- Routing table with: capability, provider, score, alternatives, selection_reason, latency.
- Pricing table with: provider price, TrustBench fee (currently 0), total paid.
- "Verify yourself" section with two `<pre>` blocks containing the verifier commands.
- Footer with links to `/methodology`, `/.well-known/trustbench-pubkey`, `?format=json`, GitHub reference verifier.

**Quick smoke commands:**

```powershell
# Confirm HTML response shape
$html = curl.exe -s -H "Accept: text/html" "$BASE/receipts/$RECEIPT"
$html.Substring(0, 100)
# Expected: <!DOCTYPE html>...

# Confirm Cache-Control set
curl.exe -s -I -H "Accept: text/html" "$BASE/receipts/$RECEIPT" | Select-String "Cache-Control"
# Expected: cache-control: public, max-age=86400, immutable

# Confirm content-type
curl.exe -s -I -H "Accept: text/html" "$BASE/receipts/$RECEIPT" | Select-String "Content-Type"
# Expected: content-type: text/html; charset=UTF-8 (or similar)
```

## H3 — `?format=html` query override

`?format=html` should force HTML even with no Accept header or `Accept: */*`:

```powershell
curl.exe -s "$BASE/receipts/$($RECEIPT)?format=html" | Select-Object -First 1
# Expected: <!DOCTYPE html>
```

`?format=json` should force JSON even with `Accept: text/html`:

```powershell
curl.exe -s -H "Accept: text/html" "$BASE/receipts/$($RECEIPT)?format=json" | Select-Object -First 1
# Expected: {"receipt":{"version":"1.0.0",...
```

## H4 — On-chain badge for the public Phase 4 receipt

The receipt issued during P4-1b ship (`rcpt_01KQY7C44GAPSXZPFQYRZ1D10C`) has a real on-chain settlement. Open it in a browser:

```powershell
Start-Process "$BASE/receipts/rcpt_01KQY7C44GAPSXZPFQYRZ1D10C"
```

**Pass:** `✅ On-chain verified` badge in green. Block number 45633871 displayed. Basescan link points at `https://basescan.org/tx/0x3e6d6078c092f6a1f7be95bbb387b9dbfdc3d9471f21bad7859514fab1997a41`.

If the badge is amber (`⏳ On-chain check unavailable`), the BASE_RPC_URL is unreachable — check network or fall back to public Base RPC. The page still renders; the chain check is a soft check.

## H5 — Tampered receipt → red badge

Demonstrates the audit story working end-to-end. Pick any receipt, edit one field in the DB, reload, see red.

```sql
-- Snapshot the original first.
select id, receipt_json
  from receipts
 where id = 'rcpt_01KQYAV30T7WVCY1BJWCVP7MGW';

-- Tamper: change the amount field. ANY change to the receipt JSON breaks the
-- signature, since the signature is over canonical JCS bytes of the entire
-- receipt object.
update receipts
   set receipt_json = jsonb_set(
     receipt_json,
     '{receipt,settlement,amount_atomic}',
     '"99999999"'::jsonb
   )
 where id = 'rcpt_01KQYAV30T7WVCY1BJWCVP7MGW';
```

**Pass:**
1. Reload the receipt URL in browser (or curl with `Accept: text/html`).
2. **The cached verify result must be busted first** — restart the dev server (`Ctrl+C` and `npm run dev` again), since the in-memory cache holds the previous green verdict for this receipt id.
3. Page now shows `❌ Receipt verification failed` headline + `❌ Signature invalid` badge with reason "signature does not match canonical receipt bytes".
4. Optionally also `❌ On-chain mismatch` if the tampered amount no longer matches the on-chain transferWithAuthorization value.

**Restore:**
```sql
-- Replace the tampered amount_atomic with whatever the snapshot showed.
update receipts
   set receipt_json = jsonb_set(
     receipt_json,
     '{receipt,settlement,amount_atomic}',
     '"<original-value>"'::jsonb
   )
 where id = 'rcpt_01KQYAV30T7WVCY1BJWCVP7MGW';
```

Restart dev server again to bust the (now red) cached verdict.

**Important note about the cache:** The in-memory verification cache keyed on `receipt_id` is correct because receipts are immutable in normal operation. The tamper test only "works" if you restart the server between the tamper and the reload. In production we want this — once we've verified a receipt is valid, we don't want to re-RPC for every browser refresh.

## H6 — Old receipt (without block_number) renders gracefully

If you have any pre-closeout-#3 receipts (issued before 2026-05-04), open one. The on-chain badge should still be green (the chain check skips the block-match assertion when block_number is absent), and the settlement table should not show a "Block" row.

## Production smoke after deploy

```powershell
# Same battery against Railway:
$PROD = "https://trustbench-production.up.railway.app"

# JSON path unchanged
npm run verify-receipt -- rcpt_01KQY7C44GAPSXZPFQYRZ1D10C $PROD
# Expected: ✅ SIGNATURE VALID

# HTML render
Start-Process "$PROD/receipts/rcpt_01KQY7C44GAPSXZPFQYRZ1D10C"
# Expected: ✅ Verified receipt headline + both green badges
```

Once both pass against prod, the receipt URL is shareable on socials / DMs / partner channels with confidence that anyone clicking it sees a credible artifact rather than raw JSON.
