---
purpose: Recover from X's auto em-dash conversion of CLI flags in the 2026-05-25 10:43 AM correction DM
target: send to Strata within the next ~15 min before they start drafting HN body
context: Original correction DM rendered "--yes", "--package", "--check-chain" as "—yes", "—package", "—check-chain" (X autocorrect on consecutive hyphens). Memory `feedback_x_dm_auto_em_dash_on_cli_flags` documents the pattern; second occurrence after 2026-05-13.
---

## Step 1: create gist

Open https://gist.github.com (logged in as lithvall), new gist. Filename: `verify-trustbench-receipt.sh`. Description: `TrustBench v0.1.2 verifier — working npx invocations`. Paste this as the body, click "Create public gist":

```bash
#!/usr/bin/env bash
# TrustBench @trustbench/verify-receipt v0.1.2 — working invocations.
# All flag prefixes are double-hyphen (--), NOT em-dash (—).
# (X / Twitter DMs auto-convert -- to em-dash; the lines below are the canonical form.)

# Signature only — no peer deps, runs anywhere with node >=18:
npx --yes --package=@trustbench/verify-receipt@0.1.2 trustbench-verify-receipt rrcpt_01KRN8HYPPRD1MS9JE7045S77Q

# Signature + on-chain — requires viem (one-time install in the working directory):
npm install viem
npx --yes --package=@trustbench/verify-receipt@0.1.2 trustbench-verify-receipt rrcpt_01KRN8HYPPRD1MS9JE7045S77Q --check-chain

# Same shape for the pre-PR-24 baseline receipt:
npx --yes --package=@trustbench/verify-receipt@0.1.2 trustbench-verify-receipt rcpt_01KQY7C44GAPSXZPFQYRZ1D10C --check-chain

# Expected output, both receipts:
#   ✅ SIGNATURE VALID — receipt is authentic.
#   ✅ ON-CHAIN VERIFIED — signed amounts and addresses match Base USDC transferWithAuthorization calldata.
```

Copy the resulting gist URL (something like `https://gist.github.com/lithvall/<hash>`) for step 2.

## Step 2: follow-up DM to Strata

Paste this into the same DM thread, fill in `<GIST_URL>`:

> One follow-up: X auto-converts `--` to em-dash in DMs, so the flag prefixes in my last message render as `—yes`, `—package`, `—check-chain` on your side. Those won't work pasted into a shell.
>
> Canonical command as a gist, no mangling:
> <GIST_URL>
>
> Same content, code block so the dashes survive. If you embed the command in the HN body, use the gist URL or copy from there, not from the DM above.

That's the whole message. Tight, no over-apology, names the X mechanism so it doesn't read as "I made a typo."

## Step 3 (optional): mention in the HN comment

If they post Tuesday, the Version A / Version B HN supportive comments in `drafts/hn-show-supportive-comment.md` both embed the working command in markdown code blocks (HN does render fenced code, so the dashes will survive there). No extra change needed for HN.

## Why this happened

X DMs run an autocorrect pass that replaces consecutive hyphens with em-dashes. The mitigation in memory `feedback_x_dm_auto_em_dash_on_cli_flags` was "eyeball preview before sending" — that didn't catch it this time because the DM was drafted in a markdown file with backticks, the backticks read fine in preview (they're plain characters), and the raw `--` between them got converted on send.

The structural fix is what `drafts/MEMORY-UPGRADE-x-dm-cli-gist.md` proposes: never put `--flag` syntax in an X DM at all. Always link to a gist. The cost is 2 extra minutes per CLI-containing DM; the benefit is this class of bug stops happening.
