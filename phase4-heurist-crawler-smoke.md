# Phase 4 — Heurist Solana mesh crawler smoke

**Pairs with:** `phase4-rankings-html-smoke.md` and `phase4-receipt-html-smoke.md`. Same dev-server + Supabase environment.

**Tests:** Heurist crawler runs successfully, ~150 Solana endpoints land in `providers` table, are filtered out of `/rankings` and `/route`, and surface only when the network filter is removed (P4-3 transition simulation).

## Pre-flight

```powershell
npm run typecheck
```

Expected: only the pre-existing carry-forward errors. No new errors from `src/crawler.ts` or `src/scorer.ts`.

## E1 — Crawler runs against live Heurist API

```powershell
npm run crawl
```

**Pass criteria** (log lines, in order):
- `[crawler] Starting x402 provider crawl (Phase 4: Agentic Market + Heurist Mesh)...`
- `[crawler] Agentic Market done: N provider rows inserted/updated from M services`
- `[crawler] Heurist Mesh: 27 agents, processing tools...`  *(count may vary slightly if Heurist adds/removes)*
- `[crawler] Heurist Mesh done: ~150 provider rows stored (network=solana; filtered from /rankings + /route until P4-3 settlement ships)`
- `[crawler] Crawl complete. Agentic Market: N rows (base); Heurist Mesh: ~150 rows (solana, filtered from rankings); verified seed: 3 (Infopunks).`

If Heurist returned 0, inspect with:
```powershell
curl.exe -s -i https://mesh.heurist.xyz/x402/solana/agents | Select-Object -First 5
```
Expected: HTTP 200 + JSON body with `count` and `agents[]`.

## E2 — Heurist rows landed in the DB

In Supabase SQL editor:
```sql
-- Heurist rows by capability.
select capability, count(*)
  from providers
 where metadata->>'source' = 'heurist_solana_mesh'
 group by capability
 order by count(*) desc;
-- Expected: data ~majority, smaller counts for search/inference/media.

-- Sanity-check a row.
select url, name, capability, metadata
  from providers
 where metadata->>'source' = 'heurist_solana_mesh'
 limit 3;
-- Expected: full Heurist URLs (mesh.heurist.xyz/x402/solana/agents/.../...),
-- agent + tool names, metadata.network='solana', metadata.heurist_agent_id,
-- metadata.heurist_tool_name, metadata.price_usd_observed,
-- metadata.price_atomic_observed, metadata.source='heurist_solana_mesh'.

-- Total Heurist row count.
select count(*) from providers where metadata->>'source' = 'heurist_solana_mesh';
-- Expected: ~150 (varies with what Heurist exposes on the day).
```

## E3 — `/rankings` does NOT show Heurist rows

The Solana filter in `scorer.ts getRankings()` should drop them from every capability tab.

```powershell
$BASE = "http://localhost:3000"

# Each capability — Heurist rows should NOT appear.
foreach ($cap in 'search','inference','data','media','infra') {
  $resp = curl.exe -s "$BASE/rankings?capability=$cap" | ConvertFrom-Json
  $heuristCount = ($resp.data | Where-Object { $_.provider_id -like '*mesh.heurist.xyz*' } | Measure-Object).Count
  "$cap : $($resp.data.Count) rows total, $heuristCount Heurist rows leaking"
}
```

**Pass:** every capability shows `0 Heurist rows leaking`. The total row counts should match what they were before the crawl (Agentic Market + verified seed only).

Visual confirmation:
```powershell
Start-Process "$BASE/rankings?capability=data"
# Expected: data tab shows the Base/Infopunks/etc. providers.
# No mesh.heurist.xyz URLs visible. Counts on filter pills don't include Heurist.
```

## E4 — `/route` does NOT pick Heurist rows

The same filter feeds `selectProvider()` via `getRankings()`. A Solana endpoint scoring high should not be selected as primary or secondary.

```powershell
$KEY  = "tb_test_<your-saved-key>"
$IDEM = "smoke-heurist-" + [guid]::NewGuid().ToString("N")
'{"capability":"data","max_price":"50000","payer_address":"0x0000000000000000000000000000000000000001"}' `
  | Set-Content -NoNewline -Path body-h.json

curl.exe -X POST "$BASE/route" `
  -H "Authorization: Bearer $KEY" `
  -H "Content-Type: application/json" `
  -H "Idempotency-Key: $IDEM" `
  --data-binary "@body-h.json" -i
```

**Pass:** 200 OK with a `route_id` and `payment_required` block. The provider chosen should be a Base provider (Infopunks, Quicknode, etc.), NOT a `mesh.heurist.xyz` URL. Confirm by inspecting the response body or:

```sql
select route_id, provider_id, provider_url
  from quotes
 where idempotency_key = '<paste $IDEM value>';
-- provider_id should NOT contain 'mesh.heurist.xyz'.
```

If Heurist leaks here, the filter in `scorer.ts` isn't working — check `metadata->>'network'` matches the JS-side check.

## E5 — Removing the filter exposes Heurist (P4-3 simulation)

Sanity-check that the rows are correctly placed for the eventual P4-3 transition. **Do NOT commit this change** — it's a temporary verification.

In `src/scorer.ts`, comment out the filter:
```ts
// const filteredProviders = (providers || []).filter(p => { ... });
const filteredProviders = (providers || []);
```

Bust the Redis rankings cache (or wait 5 min for TTL):
```powershell
# Quick way: restart dev server (which clears the in-memory side; Redis cache will TTL out within 5 min anyway).
# Or call directly via Redis if available.
```

Open `/rankings?capability=data` — Heurist URLs should now appear. Counts should jump dramatically.

**Then revert the change** before committing. This is a manual verification only.

## E6 — Capability mapping spot-check

A few Heurist agents map to specific lanes; spot-check the inference is reasonable:

```sql
-- Video gen → media
select capability, name from providers
 where metadata->>'heurist_agent_id' = 'WanVideoGenAgent'
 limit 3;
-- Expected: capability='media' for video tools.

-- Search/twitter agents → search
select capability, name from providers
 where metadata->>'heurist_agent_id' in ('ExaSearchDigestAgent', 'TwitterIntelligenceAgent', 'FirecrawlSearchDigestAgent')
 limit 5;
-- Expected: capability='search' for all.

-- Ask/research/health → inference
select capability, name from providers
 where metadata->>'heurist_agent_id' in ('AskHeuristAgent', 'CaesarResearchAgent', 'SallyHealthAgent')
 limit 5;
-- Expected: capability='inference' for all.

-- Default (data) — bulk of agents
select capability, count(*) from providers
 where metadata->>'source' = 'heurist_solana_mesh'
 group by capability;
-- Expected: 'data' count is the majority; 'media' has Wan video tools;
-- 'search' has the social/web ones; 'inference' has ~3 agents' tools.
```

## E7 — Pricing conversion sanity

Heurist quotes USD; we store as USDC atomic units (6 decimals) in `metadata.price_atomic_observed`. Spot-check:

```sql
select metadata->>'price_usd_observed' as usd, metadata->>'price_atomic_observed' as atomic
  from providers
 where metadata->>'source' = 'heurist_solana_mesh'
 order by (metadata->>'price_atomic_observed')::numeric asc
 limit 5;
-- Expected: '0.001' → '1000', '0.002' → '2000', '0.003' → '3000', etc.
-- Largest values should be Wan video tools at '0.15' → '150000', '0.25' → '250000'.
```

## Production after deploy

After `git push` and Railway redeploy:

```powershell
# Verify no Heurist URLs in prod /rankings.
$prod = "https://trustbench-production.up.railway.app"
foreach ($cap in 'search','inference','data','media','infra') {
  $resp = curl.exe -s "$prod/rankings?capability=$cap" | ConvertFrom-Json
  $heurist = ($resp.data | Where-Object { $_.provider_id -like '*mesh.heurist.xyz*' } | Measure-Object).Count
  "$cap : $heurist Heurist rows leaking (expected 0)"
}
```

The next nightly cron (`.github/workflows/nightly-pipeline.yml`) will run the crawler against the live deploy and populate prod's `providers` table with the Heurist rows. Until that fires, prod's DB has no Heurist data — only after the first nightly run will the registry-coverage value appear.

To populate prod immediately without waiting for cron:
```powershell
# From local, point env at prod Supabase + run crawler.
# (Assumes SUPABASE_URL + SUPABASE_SECRET_KEY in .env are pointed at prod
# Supabase, which they should be since local + prod share the project.)
npm run crawl
```

Then re-run E2 + E3 against prod URL.
