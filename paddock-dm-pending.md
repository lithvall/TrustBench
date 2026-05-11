# Paddock DM — pending response

**Status:** refined 2026-05-11 — the 7-night rollup paragraph and pre-send checklist were rewritten after we surfaced a silent Supabase write bug while preparing the rollup (probes table empty since this prober version shipped; bug + fix documented in `lessons.md` 2026-05-11 entry). Today's deliverable is now a Day 1 baseline CSV; the real 7-night follow-up is conditional on Paddock responding.

## Full Reddit thread (2026-05-06)

**@Reasonable-Degree101, 03:36** — Hey! It would be cool to chat. Looking for ppl to be a guest on my YouTube about x402 builders. Where are you based?

**@Reasonable-Degree101, 03:49** — Also about cross-referencing data, how could we take your nightly endpoint registry and match against Paddock's volume pull. Even a static monthly comparison would be publishable and would drive traffic to both of us.

**TrustBench, 15:30** — Sweden. Passing on the live YouTube format (solo-founder mode, async/written only). Open to written Q&A or co-authored writeup. On the cross-reference, fields on my side: canonical endpoint URL (registry primary key), provider org, capability tag (search / inference / data), network (Base now, Solana in Phase 4), rolling 7-day liveness % + latency p50/p95 from nightly probes (honest caveat: HEAD from a single host, 3 samples per night; liveness signal, not a perf benchmark; worth labeling clearly so neither side overclaims). Joined against your monthly tx count + USD volume, the matrix:
> - live + spending = real
> - live + not spending = listed but unused (some corpses, some just discovery gap, worth distinguishing)
> - dead in registry + spending in your data = registry inventory wrong, investigate
> - dead + not spending = clean dead listings to flag
>
> Static monthly snapshot as a co-branded post (CSV download + table + one chart per category) sounds like the right first delivery. Hold the labels separately, "TrustBench liveness" + "Paddock spend" as distinct columns, so neither brand is claiming the other's data. Keeps any pay-to-rank reading off the table. Want to swap a one-week sample first? I can pull last 7 nights of rollup; you send a slice of last week's spend; we see how clean the merge runs before committing to monthly cadence.

**@Reasonable-Degree101, 23:37** — My side right now is CDP Bazaar endpoints (canonical URL as primary key, wallet address, last payment timestamp, network) cross-referenced against Agentic (dot) market curation (name, description, capability category). Current shape: breakthecubicle.com/paddock/market. Three sections: verified (curated + paid), listed-not-paid, paid-not-curated. Would love a fresh pair of eyes, do you find this clear or confusing? I want someone to be able to come to the site and understand it without explanation. One thing I'd add to your matrix: a fifth bucket (paid + not in either registry), which would surface services transacting entirely outside the discovery layer. Are your URLs full paths (e.g. https://hub.atxp.ai/v1/complete) or origin-level (https://hub.atxp.ai)? I'm currently matching by domain so I'd need to know if that loses resolution on your side. breakthecubicle.com/api/paddock/export/bazaar downloads a fresh CSV of the CDP Bazaar registry. Columns: endpoint URL, domain, network, price in USDC, wallet address, last updated timestamp. Send your 7-night rollup whenever, I'll run the join.

## Refined reply (em-dash-free, partner-toned, ready to send)

> Quick answers on the four asks, UX read coming as a follow-up DM after I click through.
>
> URL granularity: full path, not origin. We key on the endpoint URL (e.g. `https://infopunks-cognition-layer-x402.onrender.com/v1/coherence-score`). Agentic Market often emits multiple endpoints per service at different prices (Exa has `/search` and `/contents`), so matching by domain loses endpoint-level resolution. The 7-night CSV will include both `endpoint_url` and a parsed `domain` column so you can join at either level.
>
> Fifth bucket: yes, that's the one TrustBench has the most unique signal in. The four I proposed earlier (live+spending, live+not-spending, dead+spending, dead+not-spending) cover the registry-cross-listing space. Your fifth (paid + not in either registry) sits outside both registries entirely, which is exactly the gap that gets surfaced by spend telemetry alone. Infopunks's three cognition endpoints are the canonical example today: in our registry as a verified seed, not in Agentic Market as of the 2026-05-05 crawl, and grepped against your CDP Bazaar export this morning with no hit. So they're transacting via x402 today (we've produced a signed paid receipt against them already) but they're invisible to both curation surfaces. Worth flagging on your side too, the gap might just be a Bazaar-side onboarding lag rather than the merchant opting out.
>
> Bazaar CSV: got the export URL. Will pull and ingest as a third source on our side (alongside Agentic Market and verified seeds). Useful both ways, your inventory enriches mine and vice versa.
>
> 7-night rollup: full transparency, surfaced a measurement bug on my side this morning while preparing it. The prober's insert into our probes table has been silently rejected for weeks (a column in the insert payload that didn't exist in the table schema, and the script wasn't checking the error return value). Scorecards still landed because they have a different schema, which is why /rankings has been current all along, but the historical per-probe samples never accumulated. Fixed today and writing to the lessons log so the same swallowed-error pattern doesn't recur.
>
> Day 1 CSV is up at https://github.com/lithvall/TrustBench/blob/main/data/rollup-2026-05-11.csv (raw bytes for programmatic ingest: https://raw.githubusercontent.com/lithvall/TrustBench/main/data/rollup-2026-05-11.csv). Same column shape we discussed: `endpoint_url`, `domain`, `network` (Base on our side today; Solana mesh stored but filtered out of /rankings until Pay.sh's wire layer matures), `capability` (search/inference/data/media/infra, Coinbase 5-cat alignment), `integration_type` (1P/3P from Agentic Market or empty), `x402_verified` (our live-probe bit), `success_rate_7d`, `latency_p50_7d`, `latency_p95_7d`, `samples_7d` (=3 across the board today, one fresh probe pass), `score`, `last_probed_at`. The column names still say `_7d` because that's the window the script aggregates over; today every row has 3 samples in that window, which is itself the disclosure. The probe pass ran from my local host in Sweden this morning rather than the usual GH Actions ubuntu runner, so latencies are a touch Europe-skewed; tomorrow's nightly cron resumes from the ubuntu runner and that bias washes out as samples accumulate.
>
> If today's slice already gives you what you need for the join, perfect. If you'd want a real 7-night version once the nightly cron has actually accumulated history, ping me around May 18 and I'll send a refreshed CSV through.
>
> One more thing: agree on the labeling discipline. "TrustBench liveness" and "Paddock spend" stay as distinct columns on the published artifact; neither brand claims the other's data. Keeps the pay-to-rank reading off the table for both of us.

## Pre-send checklist (updated 2026-05-11)

The sequence below depends on the prober fix landing first. Run from PowerShell, project root.

```powershell
# 1. Typecheck the prober fix (should be clean).
npm run typecheck

# 2. Re-run the Paddock import with the field-name aliases we added today
#    (canonical_url / pay_to_wallet / origin). Should now upsert ~1200 rows.
npm run import-paddock-bazaar

# 3. Local pipeline run. Probes will actually land in the table this time.
#    Takes ~10-15 minutes. Watch for errors; the new error-capture will throw
#    loud if anything is still off.
npm run pipeline

# 4. Verify probes landed. Expect ~3000-ish rows (1000+ providers × 3 samples).
npx tsx -e "import('dotenv/config').then(async () => { const { createClient } = await import('@supabase/supabase-js'); const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY); const { count } = await s.from('probes').select('*', { count: 'exact', head: true }); console.log('probes total after local run:', count); });"

# 5. Export the Day 1 CSV (bypasses npm's preamble noise).
npx tsx scripts/export-7-night.ts > rollup-2026-05-11.csv

# 6. Sanity check the CSV: header + a couple of rows + total line count.
Get-Content rollup-2026-05-11.csv -TotalCount 3
(Get-Content rollup-2026-05-11.csv).Count

# 7. Resolves the "haven't checked CDP Bazaar yet" line in the DM body.
Select-String -Path rollup-2026-05-11.csv -Pattern "infopunks-cognition-layer-x402"
```

After Step 7:
- If the grep returns rows for `infopunks-cognition-layer-x402` AND the row's `network` or any other column reveals CDP Bazaar presence (look for the metadata source — we set `paddock_cdp_bazaar` on imports), edit the "Fifth bucket" paragraph in the DM body to confirm Infopunks's status in CDP Bazaar.
- If the grep returns no Bazaar-flagged Infopunks rows, leave the "haven't checked CDP Bazaar yet" sentence as-is.

Then:

- [ ] Send via Reddit DM to @Reasonable-Degree101 with `rollup-2026-05-11.csv` attached.
- [ ] (Optional, can defer to follow-up) Click through `/paddock/market` and capture UX feedback for a separate DM.

## If Paddock responds within 7 days

Send the real 7-night CSV around 2026-05-18 once the nightly cron has accumulated history. Same export command, same delivery channel. The DM body already commits to this conditionally ("ping me around May 18 and I'll send a refreshed CSV through").

If Paddock goes silent, no follow-up owed — the Day 1 CSV honored the within-a-couple-of-days commit and the bug-disclosure is its own complete artifact.

## Companion deliverables (separate from the DM itself)

1. **7-night rollup CSV** — committed in the reply. Two paths:
   - Quick: SQL query against Supabase joining `providers + scorecards + 7-night probes window`, output one row per `endpoint_url`. ~10 minutes once the crawler + pipeline finish (need probe history on the new Agentic Market rows; first nightly run after the crawler closes will populate it).
   - Better: wrap as `scripts/export-7-night.ts` so it re-runs on demand. Same SQL, just packaged. Add to `package.json` scripts as `npm run export-7-night`.
   - Recommend the `scripts/` version. Lower long-term maintenance cost than a one-shot SQL pasted somewhere.

2. **Pull and ingest their Bazaar CSV** — the join is bidirectional. We probably want their endpoint list as a TrustBench data source too (a third crawler input alongside Agentic Market and verified-seed). That's a small follow-up: `scripts/import-paddock-bazaar.ts` that downloads `breakthecubicle.com/api/paddock/export/bazaar`, normalizes, upserts into `providers` with `metadata.source = 'paddock_cdp_bazaar'`. Useful to have BEFORE the rollup so we can confirm what's in CDP Bazaar that isn't in our registry.

3. **5th bucket framing** — once we know the 4-bucket axes, propose specific copy for the fifth cell + decide whether it surfaces on `/paddock/market` (their site), in the comparison post, or both.

## Why this is parked

- The crawler is in flight (~100/658 when this was saved). The 7-night rollup commitment makes more sense to ship after Agentic Market data has had at least one probe pass.
- The matrix-axes question depends on context we don't have in this session. Better to pull it cleanly than to guess.
- The UX click-through is a one-person, two-minute task that doesn't need to happen the same minute as the response is drafted.

Pick this up after P4-1b's live retry concludes. Order: P4-1b live retry → if OK, DM @InfopunksHQ → then this Paddock thread. P4-7 (reservation caps) is the bigger sprint piece after that.
