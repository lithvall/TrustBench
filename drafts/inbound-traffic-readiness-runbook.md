---
title: Inbound-traffic operational readiness runbook (Day-1 artifact)
created: 2026-05-19
purpose: Confirm TrustBench production surfaces can handle Strata Show HN traffic surge cleanly
companion_doc: audit-and-path-forward-2026-05-19.md (v2.1) § 5 Day-1 item 4
estimated_time: 30-45 minutes
prerequisites: Railway dashboard access, Supabase dashboard access, ability to run `npx tsx` from PowerShell
---

# Inbound-traffic operational readiness runbook

## Why this exists

If Strata's Show HN (week of 2026-05-26 Tue/Wed PT) hits the validation threshold (≥75 upvotes + ≥10 substantive comments within 48h), TrustBench's `/route`, `/receipts/:id`, `/explorer`, and `/.well-known/trustbench-pubkey` will see real traffic. Currently:

- No APM installed (no Sentry / Datadog / OpenTelemetry / Logflare).
- Hono `logger()` middleware is on, so request logs flow to Railway logs.
- No global `app.onError()` handler — unhandled errors return Hono default 500 with no structured logging.
- Rate-limiting exists in `paywall-handler.ts` (429), `spend-caps.ts`, `prober.ts`.
- Ed25519 signing via Node's native `crypto.sign()` — sub-millisecond, but no current observability.

The pass confirms three things are observable enough to recover from cleanly during the launch window, not that observability is comprehensive. Comprehensive observability is a post-Strata project.

---

## § 1 — Ed25519 signing latency baseline (codebase-side, 5 minutes)

Run from PowerShell on the Windows host:

```powershell
cd C:\Users\Lithv\Documents\Claude\Projects\TrustBench
npx tsx scripts/sign-latency-check.ts
```

**Expected output:** p50 / p95 / p99 / max latency in microseconds, plus throughput in signs/sec. Healthy threshold is p99 < 2ms. On modern hardware, Ed25519 signing is typically 50-200µs; throughput should be 5,000-20,000 signs/sec.

**Why this is enough.** At 5,000 signs/sec, signing supports ~300,000 req/min. Show HN-scale traffic is single-digit req/sec realistic ceiling; signing won't be a bottleneck. The benchmark establishes the baseline so if you observe slow responses during the launch and want to rule signing in or out, re-run it then.

**Optional heavier check** (10x sample size + large payload):

```powershell
npx tsx scripts/sign-latency-check.ts --samples 50000 --payload large
```

**If the script exits with code 1** (p99 above 2ms): something is unusual about the host or key — investigate before depending on it under load.

---

## § 2 — Railway dashboard alerting setup (15-20 minutes, requires Railway login)

Railway has built-in observability and alerting. Goal: get notified by email or webhook if 5xx errors spike or the service goes down during the launch window.

### 2.1 Confirm Railway is collecting logs

1. Open Railway dashboard → TrustBench project → the production service.
2. Click "Observability" or "Logs" tab.
3. Confirm recent HTTP request logs are visible (Hono `logger()` middleware emits them — should see lines like `GET /health 200 12ms`).
4. If logs are not flowing, this needs to be diagnosed BEFORE the launch — don't proceed to launch with no log visibility.

### 2.2 Set up alerting (if Railway plan supports it)

Railway's free / Hobby plans may not include native alerting. Check current plan:

1. Railway dashboard → Project Settings → Plan tier.
2. If on Hobby/Free: native alerting is limited. Workaround = the daily X scan + manual check at known times. NOT ideal but acceptable for solo-founder scale.
3. If on Pro or above: navigate to Observability → Alerts → New Alert. Configure:
   - **Alert 1:** Service unhealthy / restart loop (Railway native — usually pre-configured).
   - **Alert 2:** HTTP 5xx rate > 5% over 5min (filter logs by status code).
   - **Alert 3:** No logs received for 5min (heartbeat indicator).
   - Notification channel: email to `lithvall88@gmail.com` or webhook to a Discord/Slack you check.

### 2.3 Fallback if native alerting isn't available

If Railway plan doesn't support alerts, the minimum-viable signal is:

- **Bookmark the Railway logs page** so you can check it in one click during the launch window.
- **During the launch window (Tue/Wed week of 5/26):** check logs every 2-3 hours during waking hours.
- **Set a phone reminder** for the morning of 5/26 to confirm `https://trustbench.io/health` returns 200 before Strata's post goes live.

### 2.4 Confirm restart policy is sane

Already configured per `railway.json`:
```json
"restartPolicy": "ON_FAILURE",
"restartPolicyMaxRetries": 10
```

This means Railway will auto-restart the service up to 10 times on failure. If the service is crash-looping faster than 10x in a short window, it stops and stays down — you'd need to manually restart from the dashboard. For Show HN traffic this is unlikely but worth knowing.

---

## § 3 — Supabase quota dashboard bookmark + interpretation (5-10 minutes)

### 3.1 Bookmark the usage page

1. Open Supabase dashboard → TrustBench project.
2. Navigate to Project Settings → Usage (or "Reports" → "Database Usage" depending on dashboard version).
3. Bookmark this URL in your browser as "TrustBench Supabase Usage" — should be one-click reachable.

### 3.2 Identify which quotas matter for Show HN traffic

| Quota | What spikes it | Show HN risk |
|---|---|---|
| Database queries / API requests | Every `/rankings`, `/route`, `/receipts/:id` hit reads from Supabase | High — most-likely first wall |
| Database egress (data transferred out) | Large `/explorer` JSON responses, full-receipt fetches | Medium — limited by content size |
| Storage | Receipts table grows on every paid call | Low — slow growth |
| Auth requests | Not used by TrustBench public endpoints | Negligible |
| Realtime connections | Not used | Negligible |
| Edge function invocations | Not used | Negligible |

The dashboard shows current month's usage vs plan limit for each. The free tier on Supabase is generous; check what tier you're on and what the limit is.

### 3.3 If you're on the Supabase free tier

Free tier limits (as of 2026 — verify in dashboard):
- 500 MB database storage
- ~50K MAU (monthly active users) on auth (not relevant)
- 5 GB egress / month
- Unlimited API requests (no hard cap)

For Show HN-scale traffic, the bottleneck won't be Supabase — it's more likely to be Railway-side rate limits or accidental client-side hot-loops. But:

- **Bookmark the upgrade path.** If quotas approach limits, you can upgrade to Pro ($25/mo) in one click — that's within the $50/mo infrastructure cap.

### 3.4 Pre-launch sanity query

Run from Supabase SQL editor before the launch window opens:

```sql
SELECT
  (SELECT COUNT(*) FROM providers) AS providers,
  (SELECT COUNT(*) FROM probes WHERE timestamp > NOW() - INTERVAL '7 days') AS probes_last_7d,
  (SELECT COUNT(*) FROM scorecards) AS scorecards,
  (SELECT COUNT(*) FROM paid_requests) AS paid_requests_total,
  (SELECT COUNT(*) FROM paid_requests WHERE created_at > NOW() - INTERVAL '24 hours') AS paid_requests_last_24h,
  (SELECT COUNT(*) FROM receipts) AS receipts_total;
```

Save the snapshot. If during the launch you see paid_requests_last_24h jump from baseline to dozens, that's your "Show HN drove real traffic" indicator.

---

## § 4 — Deferred-improvement notes (NOT for now, post-Strata window)

These are the operational gaps the scan surfaced but they should NOT ship during the Strata pre-launch maintenance window (now through ~2026-05-29). Note them and revisit after Show HN.

### 4.1 Global `app.onError()` handler

Currently `src/index.ts` has no `app.onError()`. Unhandled errors fall through to Hono default 500 response with no structured log entry. A minimal handler that logs the error with request context before returning 500 would be 10 lines of code. It does NOT change the receipt format, signing, or paywall response shape — but it IS wire-touching and the maintenance contract is binding.

Defer to week of 2026-06-02 (post-Strata-launch).

### 4.2 Replace console.* with structured logging

14 files in `src/` use unstructured `console.log` / `console.warn` / `console.error`. A library like `pino` (low overhead, JSON output, free) would make logs queryable. Estimated 2-3 hours of focused refactor.

Defer to post-launch.

### 4.3 Sentry or equivalent APM

Sentry has a generous free tier (5K events/month) and would catch unhandled exceptions with stack traces. Free for solo founder. Setup is 30 minutes (add `@sentry/node`, wrap Hono in init).

Defer until either (a) post-launch operational pass, or (b) a real incident motivates it.

---

## § 5 — Pre-launch checklist (the morning of 2026-05-26)

Run through this checklist ~6 hours before Strata's Show HN goes live (Tuesday morning PT).

- [ ] `curl https://trustbench.io/health` returns 200
- [ ] `curl https://trustbench.io/.well-known/trustbench-pubkey` returns the Ed25519 key
- [ ] `curl https://trustbench.io/receipts/rrcpt_01KRN8HYPPRD1MS9JE7045S77Q` returns the Strata reference receipt with `signature_alg: ed25519`
- [ ] `curl https://trustbench.io/explorer` returns HTML (or JSON if Accept: application/json)
- [ ] `curl -X POST https://trustbench.io/route -H "Content-Type: application/json" -d '{"capability":"search"}'` returns a 402 (paywall) or routing decision (depending on whether you have a valid X-PAYMENT header — 402 is the expected un-authenticated response)
- [ ] `npx tsx scripts/sign-latency-check.ts` confirms healthy signing latency
- [ ] Railway logs are visible in the dashboard
- [ ] Supabase usage dashboard is bookmarked and current usage is well under quota
- [ ] No active deploys or in-flight commits (working tree clean)
- [ ] Phone has charge + Railway dashboard URL is accessible from phone (mobile fallback)

If any item fails: investigate and fix BEFORE the launch window. The Strata maintenance contract is binding — no breaking changes — but pre-launch confirmation of existing surfaces is operational hygiene, not maintenance violation.

---

## § 6 — During the launch window (Tuesday + Wednesday, 5/26-5/27)

- Check Railway logs every 2-3 hours during waking hours.
- If a 5xx spike: investigate immediately, roll back the last commit if it correlates, do NOT debug-forward during their pre-launch period.
- Watch for the X-thread Strata announces with — they'll likely tag `@TrustBench` or mention the receipt artifact pair (`rrcpt_01KRN8HYPPRD1MS9JE7045S77Q` + the 2026-05-13 prior).
- Reactive amplification ready: any technically-substantive reply on the HN thread or X-thread is worth engaging (substantive = ≥2 sentences, not "+1").
- Bundle v7 propagation watch: monitor for any external mention of `trustbench.io/bundles/receipt-backed-agent-to-agent-procurement`.

The 75-upvote + 10-substantive-comment threshold is the validation signal — if hit by 48h post-launch, accelerate Option A outreach to be sent within 5 days.

---

## § 7 — Post-launch debrief (within 7 days)

After the launch window closes (~end of week 2026-05-29 to 2026-06-01):

- Run the Supabase pre-launch sanity query again and capture the diff.
- Note any 5xx events or operational surprises in `lessons.md`.
- Append to `decisions.md` if the launch outcome materially shifts strategic direction.
- Decide on § 4.1 / § 4.2 / § 4.3 deferred improvements as week-2-of-June work.

---

## Cross-references

- audit-and-path-forward-2026-05-19.md (v2.1) § 5 Day-1 item 4 (this artifact's origin)
- roadmap-2026-05-19.md § 3.1 (Day-1 production state)
- drafts/dexter-counter-position.md (parallel contingency artifact for the same launch window)
- scripts/sign-latency-check.ts (the codebase-side benchmark this runbook calls)
- railway.json (current Railway deployment config)
- src/scorer.ts:217 (current Ed25519 signing call site)
- lessons.md `feedback_windows_mount_truncation` (why all PowerShell, never Linux mount, for git operations)
