# trustbench.io DNS + BASE_URL flip — runbook

**Status:** ✅ completed 2026-05-06. Domain registered at Cloudflare (proxy ON via Railway↔Cloudflare integration), `TRUSTBENCH_BASE_URL` flipped, both milestone receipts verify clean against `https://trustbench.io` with no `--pubkey-url` override. Railway hostname (`trustbench-production.up.railway.app`) kept alive permanently for backward compat with receipts that embed it. See memory `project_dns_flip_2026_05_06.md` for the full record. Tier 3 URL sweep (`OUTREACH.md`, phase docs, this runbook's self-references, `lessons.md`, `scripts/post-to-x.js`) intentionally deferred. Original runbook below preserved as historical record.

## Why

Right now `BASE_URL` is `https://trustbench-production.up.railway.app` because trustbench.io DNS isn't wired. Two consequences:

1. New receipts embed the Railway hostname in `signature.public_key_url` (e.g. `https://trustbench-production.up.railway.app/.well-known/trustbench-pubkey`). Verification works, but the URL is off-brand.
2. The **local-issued precursor receipt** `rcpt_01KQY629W1HWJW19E87ECR4ZTR` was issued before the flip and embeds `https://trustbench.io/.well-known/trustbench-pubkey`. It only verifies with `--pubkey-url <Railway URL>` override. Wiring the canonical DNS lets that receipt verify cleanly without any override.

Detached signatures over canonical bytes mean `public_key_url` isn't part of what's signed — already-issued receipts stay cryptographically valid; only the discovery URL needs to resolve.

## Steps

### 1. Wire DNS

In whichever provider hosts `trustbench.io` (Namecheap / Cloudflare / etc.):

- Add a `CNAME` record for `trustbench.io` (apex) → `<your-railway-app>.up.railway.app`. If the provider doesn't allow CNAME at apex, use ALIAS / ANAME, or set the apex `A` record to Railway's published IP per their custom-domain docs.
- Add a `CNAME` record for `www.trustbench.io` → `<your-railway-app>.up.railway.app` (optional but standard).

Wait for propagation (typically <15 minutes; check with `nslookup trustbench.io 1.1.1.1` from a fresh terminal).

### 2. Add the custom domain in Railway

Project → Settings → Networking → Custom Domains → Add `trustbench.io` (and `www.trustbench.io` if added). Railway auto-provisions an SSL cert via Let's Encrypt; takes ~1-2 minutes.

Verify HTTPS resolves: `curl.exe -i https://trustbench.io/health` should return `{"status":"ok","project":"TrustBench"}`.

### 3. Flip the env vars

In Railway → Project → Variables, change:

| Variable | From | To |
| --- | --- | --- |
| `TRUSTBENCH_BASE_URL` | `https://trustbench-production.up.railway.app` | `https://trustbench.io` |
| `TRUSTBENCH_ISSUER_HOST` | (default `trustbench.io` already, no change needed unless overridden) | `trustbench.io` |

Railway will redeploy automatically on env-var change. Wait ~30s.

### 4. Verify old + new receipts

Old (local-issued precursor):
```powershell
npm run verify-receipt -- rcpt_01KQY629W1HWJW19E87ECR4ZTR https://trustbench.io
```
**Pass:** `✅ SIGNATURE VALID` without any `--pubkey-url` override.

New (Railway-issued):
```powershell
npm run verify-receipt -- rcpt_01KQY7C44GAPSXZPFQYRZ1D10C https://trustbench.io
```
**Pass:** same (already verifying clean against the Railway URL; canonical URL just adds a brand-correct path).

### 5. Update referenced URLs (low-priority)

- `README.md` — any hard-coded `trustbench-production.up.railway.app` references. Grep before editing.
- `skill.md` / `llms.txt` / `.well-known/trustbench.json` — ditto.
- `scripts/post-to-x.js` — if the daily X post embeds the Railway URL.

These don't have to ship the same hour as the DNS flip; bundle into the next routine commit touching public copy.

## Rollback

If anything breaks:
1. Flip `TRUSTBENCH_BASE_URL` back to `https://trustbench-production.up.railway.app` in Railway.
2. Receipts issued during the broken window stay verifiable via the Railway URL (detached signature property).
3. Diagnose DNS / cert separately; keep traffic on the Railway hostname meanwhile.

The DNS flip is reversible because the Railway hostname stays alive throughout — adding a custom domain doesn't deprecate the Railway URL.
