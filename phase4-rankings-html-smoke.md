# Phase 4 — `/rankings` HTML rendering smoke

**Pairs with:** `phase4-receipt-html-smoke.md`. Same content-negotiation pattern, different module.

## Pre-flight

```powershell
npm run typecheck
```

Expected: only the pre-existing carry-forward errors. No new errors from `src/rankings-html.ts` or the modified `/rankings` handler.

Local dev server should already be running.

## R1 — JSON path unchanged (regression — load-bearing)

The existing `/rankings` JSON contract feeds GitHub Actions cron jobs, the MCP tools manifest, the public dashboard at `/analytics`, and any external integration. If this breaks, those break too.

```powershell
$BASE = "http://localhost:3000"

# Default — no Accept header set explicitly. Should return JSON.
$json1 = curl.exe -s "$BASE/rankings?capability=search"

# Explicit JSON Accept.
$json2 = curl.exe -s -H "Accept: application/json" "$BASE/rankings?capability=search"

# ?format=json query override.
$json3 = curl.exe -s "$BASE/rankings?capability=search&format=json"

# All three should be byte-identical.
$json1 -eq $json2
$json2 -eq $json3
```

**Pass:** all three are identical and start with `{"success":true,"data":[`.

Spot-check the shape matches the pre-change response (top of the array):
```powershell
($json1 | ConvertFrom-Json).data[0]
# Should have: provider_id, capability, name, score, latency_p50, latency_p95,
# uptime_7d, last_updated, x402_verified, integration_type
```

## R2 — HTML path renders polished page

```powershell
Start-Process "$BASE/rankings?capability=search"
```

**Pass criteria** (visual inspection):

- Page title `Search rankings · TrustBench`.
- Heading `Search rankings` in green.
- Subtitle: "N search providers on TrustBench, ranked by liveness telemetry. M x402-verified."
- **Capability tab strip:** `Search · Inference · Data · Media · Infra`. Active tab (Search) is green-bordered.
- **Filter pills:** `All (N)` `✅ Verified (x402) (M)` `🪪 Coinbase 1P (X)` `🔗 Coinbase 3P (Y)` plus a search input.
- Table columns: `# · Provider · Score · p50 ms · p95 ms · Uptime 7d · Verified · Updated`.
- Score color-coded: ≥85 green, 65-84 amber, <65 muted.
- Verified column shows `✅ x402` badge for live-probe-confirmed providers, `1P`/`3P` badge for Coinbase-attested.
- `Updated` column shows relative time (`5m ago`, `2h ago`, `May 6, 2026` for older).
- Footer links: Methodology, Public key, Health, GitHub.

Quick checks:
```powershell
# HTML response shape
$html = curl.exe -s -H "Accept: text/html" "$BASE/rankings?capability=search"
$html.Substring(0, 100)
# Expected: <!DOCTYPE html>...

# Cache-Control set to short window (rankings change ~daily on probe pass).
curl.exe -s -I -H "Accept: text/html" "$BASE/rankings?capability=search" | Select-String "Cache-Control"
# Expected: cache-control: public, max-age=300
```

## R3 — Capability tabs work as server-side links

Click each tab in the browser. URL changes to `?capability=inference`, `?capability=data`, `?capability=media`, `?capability=infra`. Active tab moves with the click. Each capability shows its own provider count and verified count.

```powershell
# Confirm each tab serves correctly.
curl.exe -s -H "Accept: text/html" "$BASE/rankings?capability=inference" | Select-String "<h1>"
curl.exe -s -H "Accept: text/html" "$BASE/rankings?capability=data" | Select-String "<h1>"
curl.exe -s -H "Accept: text/html" "$BASE/rankings?capability=media" | Select-String "<h1>"
curl.exe -s -H "Accept: text/html" "$BASE/rankings?capability=infra" | Select-String "<h1>"
# Each: <h1>{Capability} rankings</h1>
```

## R4 — Filter pills toggle row visibility

In the browser:
1. Click `✅ Verified (x402)` pill — only rows with the green ✅ x402 badge stay visible. Counter at bottom updates: "X of N providers shown".
2. Click `🪪 Coinbase 1P` — only rows with `1P` badge.
3. Click `🔗 Coinbase 3P` — only rows with `3P` badge.
4. Click `All` — all rows return.

The pill that was last clicked is highlighted green. Only one filter pill is active at a time.

## R5 — Search input filters the table

In the browser:
1. Type a substring of any provider name or URL in the search box.
2. Table filters in real-time to matching rows.
3. The visible counter at bottom updates.
4. Clear the search → all rows return.

Search and filter pills compose: setting the verified pill AND a search term shows only verified rows whose name/URL matches the search.

## R6 — `?format=` overrides

```powershell
# ?format=html forces HTML even with no Accept.
curl.exe -s "$BASE/rankings?capability=search&format=html" | Select-Object -First 1
# Expected: <!DOCTYPE html>

# ?format=json forces JSON even with Accept: text/html.
curl.exe -s -H "Accept: text/html" "$BASE/rankings?capability=search&format=json" | Select-Object -First 1
# Expected: {"success":true,"data":[...
```

## R7 — Empty capability handles gracefully

If a capability has no registered providers:
```powershell
Start-Process "$BASE/rankings?capability=media"
```

If `media` returns an empty list, page should show: `No providers registered for media yet.` with links to Methodology and JSON view. No table rendered, no JS errors.

## R8 — Existing dependents still work

These all consume `/rankings` JSON:

```powershell
# /analytics dashboard reads /rankings internally for top-3 lists.
Start-Process "$BASE/analytics"
# Expected: dashboard renders with current top providers.

# /route public GET (legacy) reads /rankings.
curl.exe -s "$BASE/route?capability=search"
# Expected: { success: true, recommended_provider: ..., ... }

# /rankings/paid (signed scorecards).
curl.exe -s "$BASE/rankings/paid?capability=search" | Select-Object -First 1
# Expected: { success: true, data: [...], source: 'TrustBench', paid: true }
```

## Production smoke after deploy

```powershell
$PROD = "https://trustbench-production.up.railway.app"

# JSON regression
curl.exe -s "$PROD/rankings?capability=search" | ConvertFrom-Json | Select-Object -ExpandProperty success
# Expected: True

# HTML render
Start-Process "$PROD/rankings?capability=search"
# Expected: polished page with capability tabs and filter pills.
```

Once both pass against prod, the rankings URL is shareable on socials / DMs / partner channels with confidence the page looks credible.
