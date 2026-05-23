# Post-Show-HN Announcement Plan

**Gate:** Do NOT execute until Strata Show HN has landed (week of 2026-05-26, Tue/Wed PT morning).
**Watch signal:** 2026-05-22 EOD for Strata's prep signal per maintenance contract.

## Timing

Post **the day after** Strata's Show HN goes live (likely Wed or Thu 2026-05-27/28 PT).
Reason: amplify the Show HN rather than compete with it. Let Strata's post get its own attention window first, then ride the signal.

## Tweet 1: /verify announcement (standalone value prop)

Draft (~240 chars):

```
POST /verify — verify that any x402 payment settled on-chain. Ed25519 signature check + Base chain RPC confirmation, no trust required. Free, no auth.

Works with any receipt from any x402 provider.

trustbench.io/verify
```

## Tweet 2: Strata substrate callout (reply to Tweet 1)

Draft (~240 chars):

```
Live in production with @stratamcp — their reference agent calls TrustBench /route, we score the provider with Strata's pre-call trust signal, then sign the receipt embedding that score.

Receipt rrcpt_01KRN8HYPPRD1MS9JE7045S77Q verifies both sides.
```

## Tweet 3: Bundle placement (reply to Tweet 2)

Draft (~240 chars):

```
New bundle: "verified x402 payment" — agent pays any x402 provider, then calls /verify to confirm settlement. Copy the prompt from:

trustbench.io/bundles/verified-x402-payment
```

## Other distribution (same day or day after)

- Update README Bazaar/agentic.market listing link to mention /verify
- If agentic.market supports bundle submission, submit the verified-x402-payment bundle
- Reply to any active x402-related X threads mentioning the verify endpoint (max 2 per day per X-reply-pattern rules)

## What NOT to do

- Don't post before Show HN lands
- Don't mention the Show HN itself in TrustBench's tweets (let Strata own that narrative)
- Don't overclaim: /verify is a verification endpoint, not a "compliance layer" or "trust oracle"
- Follow all existing outreach rules: no em-dashes, no calls, async-only, ~250 char limit, no moat-telegraphing to solo-velocity competitors
