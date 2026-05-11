# Phase 4 v0.1.0 paywall launch — X post drafts

**When to ship:** Day 4 of the sprint (per `phase4-1.3-preflight-runbook.md` Step 5f), AFTER:
- `TRUSTBENCH_PAYWALL_ENABLED=true` flipped in Railway prod
- `npm run smoke:paywall` against `TRUSTBENCH_BASE_URL=https://trustbench.io` returned ALL CHECKS PASSED
- 30 min of post-flip log watch with no `[paywall]` red flags

**Tone:** build-in-public, honest, concrete artifact link, no em-dashes, no calls-to-action that propose meetings (per `feedback_no_calls_in_outreach.md`).

---

## Option D — non-custodial-property lead, ~277 chars (RECOMMENDED 2026-05-11)

Added 2026-05-11 after v0.1.0 launch night surfaced the strongest possible test of the paywall's non-custodial property: it correctly refused to charge an agent when the selected upstream provider was unreachable. That's the win to lead with.

```
TrustBench paywall is live on /route.

Tonight a smoke selected a provider whose dyno was suspended-by-user. The paywall caught it, refused to charge the agent's wallet, returned 503. Non-custodial fail-safe behavior validated end-to-end.

https://trustbench.io/pricing
```

277 chars. Why this lead is strongest:

- Concrete event ("tonight a smoke selected a provider whose dyno was suspended") = real, not promotional
- Non-custodial property = the architectural moat
- Validated end-to-end = the actual launch milestone
- Closes with the public artifact link, not a CTA

If anyone asks about the architecture flow, follow up with (273 chars):

```
Flow: agent gets 402, signs $0.005 EIP-3009 to our revenue wallet, x402 facilitator settles on Base via Coinbase CDP, we return an Ed25519-signed routing receipt. If the upstream provider can't be reached, the agent's payment never moves. Non-custodial throughout.
```

If anyone asks "why didn't the agent get charged when the provider was down?" follow up with (270 chars):

```
The paywall live-probes the selected provider before settling. If the probe fails (suspended, timeout, non-conformant 402), we 503 before calling the facilitator. Agent's nonce is unused on-chain. No money moves. They retry once the registry has a conformant provider.
```

If anyone asks about the broader registry-conformance gap, follow up with (267 chars):

```
v0.1.0 paywall is provably-safe but doesn't yet guarantee a successful round-trip for every capability. The registry has providers whose HEAD-probe liveness doesn't match their POST-probe conformance. v0.2.0 work: live-probe-verified-x402 as a curatorial signal alongside HEAD-liveness.
```

---

## Option A — milestone-style, ~270 chars

```
Phase 4 paywall is live.

POST /route returns 402. Agent signs $0.005 in USDC, x402 facilitator
settles on Base, we return an Ed25519-signed routing receipt.

Non-custodial end-to-end. Two payments per call (TrustBench fee +
provider fee).

Full tier table: https://trustbench.io/pricing
```

Char count check: 280-cap, this hits ~275.

---

## Option B — receipt-flex, ~265 chars

```
First paid call through the live TrustBench paywall:
https://trustbench.io/receipts/<rrcpt_FROM_PROD_SMOKE>

Agent paid $0.005 in USDC on Base. x402 facilitator submitted. We
returned an Ed25519-signed routing receipt. Verifiable by anyone
with the public key.

/pricing for the full tier table.
```

Use this if the prod smoke produces a clean first receipt that's worth pointing at as a concrete proof.

Char count: ~270 once the receipt id substitutes in.

---

## Option C — honest-scope, ~275 chars

```
Paywall v0.1.0 is live on /route.

What it does: 402 -> sign -> settle -> signed routing receipt.

What it doesn't do yet: free tier on read endpoints, /verify, /score-provider,
/audit-replay, /compliance-export. All designed, none shipped.

https://trustbench.io/pricing
```

Use this if you want to lead with scope discipline. Strongest fit if a partner (Strata, Infopunks, Aggelos) has been asking about specific v0.2+ endpoints — sets expectations cleanly.

---

## Notes on which option to pick

- **Option A** is the default unless one of the others fits the moment better. Clean, complete, drops the link.
- **Option B** is the strongest if you have a clean prod receipt URL by post time. Lead with the artifact, not the announcement.
- **Option C** is for honest-scope-first framing if you want to anticipate "what about X?" reactions. Lowers the surprise risk if v0.2.0 takes longer than partners expect.

All three avoid em-dashes, avoid "happy to chat" / "DM me" closers, lead with a concrete verifiable artifact.

---

## Follow-up thread (optional, replies under the launch post)

If anyone asks about the architecture, paste this as a reply (~270 chars):

```
Two-payment shape: agent pays TrustBench fee at /route (we get an
Ed25519-signed routing decision back), then pays the provider directly
in a second x402 tx. Non-custodial throughout.

Critic-pass header in src/paywall-handler.ts has the failure-mode
analysis.

https://github.com/lithvall/TrustBench
```

If anyone asks about pricing rationale, paste this (~280):

```
Anchors not contracts. $0.005 was set against Strata's
pricing-pushback feedback during the design pass; reviewable per
partner volume.

Existing partner agreements override the table for that partner;
reach out before integration.

Full disclaimer on /pricing.
```

---

## After posting

1. Pin the launch post to the TrustBench X profile for ~1 week.
2. Append a fresh `BUILD_IN_PUBLIC` entry to `scripts/post-to-x.js` with the live-paywall variant (uncomment the commented block; remove the design-shipped variant).
3. Add a `decisions.md` entry: `2026-05-MM: Paywall v0.1.0 flipped live in prod. First paid /route call: <rrcpt_...>.`
4. Update `MEMORY.md` pointer for the next session to reflect "paywall live in prod" instead of "paywall code committed, flag off."
