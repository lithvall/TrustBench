---
stance_version: 2026-08-14
stance_phase: phase-4-conversion-reassessment
stance_pillars: [canonical-receipt-format-standard, neutral-routing-receipt-layer]
stance_frozen: true   # SENT 2026-08-14; now a record of what went out, not a live draft
status: sent
sent_date: 2026-08-14
---

> **SENT 2026-08-14.** Johan sent the reply below to Claude-Alain Martin
> (claude-alain@ibanforge.com). This file is now a record of what went out, not
> a draft. Awaiting reply. If IBANforge responds, the next decision — anything
> beyond answering follow-up questions — is a partnership commitment beyond a
> first-touch reply and needs a six-question filter pass before acting.

# Inbound Reply Draft — IBANforge (Claude-Alain Martin), 2026-08-14

Received 2026-08-13 21:10. Sender asks three things: (1) how the registry handles
endpoints like theirs, (2) whether IBANforge is already indexed, (3) whether there
is a manual listing/verification step.

## Verified before drafting

| Claim | Method | Result |
|---|---|---|
| IBANforge indexed in TrustBench? | grep `exports/rollup-latest.csv` (full 7-night registry rollup) | **No.** Zero matches. |
| IBANforge in agentic.market catalog? | `GET api.agentic.market/v1/services?limit=500` — 2201 services | **No.** Zero matches. |
| Is IBANforge real / x402-native? | `GET api.ibanforge.com/.well-known/x402` | **Yes.** Well-formed. |
| Is TrustBench telemetry live right now? | `GET trustbench.io/metrics/registry-summary` | **Yes.** 1545 endpoints, median 154ms, generated 2026-08-14T09:03:42Z. |
| Is there a manual listing path in code? | grep `src/` for bond/listing logic | **No.** Copy-only; see Flag 2. |

**Root cause of non-indexing:** `src/crawler.ts` has exactly two live discovery
sources — `api.agentic.market/v1/services` (Base) and `mesh.heurist.xyz` (Solana,
stored but filtered from rankings until P4-3). The verified-seed path is disabled
since 2026-05-20. IBANforge is not in the agentic.market catalog, therefore the
crawler has no way to see it. Not an exclusion, a discovery gap.

**Their x402 surface is clean.** `/.well-known/x402` declares network `base`,
`chain_id eip155:8453`, correct Base USDC contract (`0x8335...2913`), a live
`pay_to` (`0xD13bD0A4120BA301125290e5cc0c7EFD4CB40a55`), the Coinbase CDP
facilitator, and per-endpoint `accepts[]` blocks with `scheme: exact`,
`maxAmountRequired`, `payTo`, `asset`, and `extra.name/version`. That is the shape
`/route` handles without special-casing. Worth noting given how many catalog rows
fail the `status===402` probe check.

---

## DRAFT REPLY — for Johan's review, not sent

Subject: Re: IBANforge and the TrustBench registry

Hi Claude-Alain,

Thanks for reaching out, and for asking the question directly enough that I can give
you a straight answer.

Short version: IBANforge is not currently indexed, and the reason is a discovery
gap on our side rather than anything about your endpoints.

Here is how the registry actually works. TrustBench does not maintain a
hand-curated provider list. The crawler reads from two upstream sources on a
nightly run: Coinbase's Agentic Market catalog (api.agentic.market/v1/services)
for Base-settled endpoints, and the Heurist Mesh feed for Solana. I checked the
Agentic Market catalog before writing this. It currently returns 2201 services and
IBANforge is not among them, which is why you have never appeared in our registry.
There is nothing blocking you and no decision was made about you.

So the fast path is: get listed in the Agentic Market catalog, and our next nightly
crawl picks you up automatically. No fee, no application to us, no manual approval
step. I want to be clear that there is currently no manual listing mechanism on the
TrustBench side at all, so pointing you upstream is not me deflecting, it is
genuinely the only route in today.

On what being indexed would actually get you, I would rather undersell this than
have you discover it later. Our nightly telemetry is a liveness check, not a
benchmark. We send HEAD requests from a single host, three samples per endpoint,
and we treat 401/402/403/404/405/429 as "alive" because an endpoint that challenges
us is an endpoint that is up. That produces a useful signal about whether a provider
is actually reachable night over night, and it produces a latency distribution. It
does not measure response quality, correctness, or whether your data is any good.
Anyone who tells you their x402 registry measures more than that from an unpaid
probe is overstating it.

One thing worth saying: I pulled your /.well-known/x402 while checking the above,
and it is one of the cleaner ones I have seen. Correct Base USDC asset, live pay_to,
CDP facilitator, and per-endpoint accepts blocks with the full scheme/network/
maxAmountRequired/payTo shape. A meaningful share of catalog entries we crawl fail a
basic 402 challenge probe, so this stood out.

That matters for the other half of what we do. Beyond the registry, TrustBench runs
a non-custodial router: an agent authorizes a payment, we construct the x402
transaction, the agent signs it with its own key, we route to a provider, and we
emit an Ed25519-signed receipt with the call metadata and the on-chain settlement
reference. We never hold funds. Endpoints shaped like yours are the ones that route
cleanly through that path.

I would take you up on the sample request/response offer. Not required for indexing,
since that is upstream, but useful for me to sanity-check that your endpoints behave
the way your discovery document advertises before you show up in anyone's routing
pool.

Best,
Johan

---

## Notes for Johan

**Why this is worth your attention beyond a routine listing question.**
`receiptsLast30Days` is currently **0** and the Phase 4 kill criterion was graded as
fired on 2026-08-01. This inbound is a production x402 provider that says it is
already being paid by customers, arriving unprompted, offering integration help for
free. Given the kill criterion, an inbound with real transaction volume behind it is
a different class of signal than a builder asking to be listed.

**No conflict of interest.** `endpoint-portfolio-research-2026-05-14.md` marked
IBAN/SWIFT/routing validation an explicit **NO-GO** for TrustBench to build. So
listing them is purely additive. Same doc flagged IBAN and OFAC/sanctions screening
as registry coverage gaps. IBANforge's own discovery doc claims both. It fills two
gaps you already identified and deliberately chose not to fill yourself.

**Held back from the reply on purpose.** They are a plausible Option A candidate
(partner adopts TrustBench-format signed receipts on their output) — well-formed
x402, compliance-adjacent buyers who have an actual reason to want a verifiable
audit artifact. I did not raise it. That is a Pillar 1 partnership commitment beyond
a first-touch reply and needs a six-question filter pass first. Flagging it as worth
a filter pass, not proposing it.

**Framing guard.** IBANforge is a compliance-data vendor. Keep TrustBench's own
vocabulary as registry / telemetry / routing / signed receipt. Do not let their
category pull our public copy toward "compliance layer" — that is the Example 5
failure in the filter and it closes off neutral-standard adoption.

---

## Two operational flags, unrelated to the email but found while verifying

**Flag 1 — RETRACTED. The export pipeline is healthy.**
An earlier version of this note claimed the nightly rollup export had been dead for
13 days. That was wrong. It was read off the *local* git log without fetching origin;
the local clone was simply 13 commits behind. `git fetch` shows an unbroken run of
`chore(exports): nightly rollup` commits from 2026-08-02 through 2026-08-14, and the
Actions history is green every night. The live
`trustbench.io/exports/rollup-latest.csv` is fresh (6477 rows, probe data through
2026-08-13T05:48Z). Paddock's feed was never stale.

**Flag 1b — real, smaller: the export runs ~40 minutes after Paddock polls.**
The workflow is scheduled `55 23 * * *` (23:55 UTC) specifically to land ~10 minutes
before Paddock's 00:05 UTC poll. GitHub's scheduled-cron queue is delaying it: the
last four runs started 00:43–00:45 UTC (02:43–02:45 GMT+2), consistently. So the new
CSV lands ~40 minutes *after* Paddock has already polled, and he reads the previous
day's file every day. Combined with the prober finishing ~05:48 UTC, Paddock's data
is roughly 44 hours behind the newest probes rather than the intended ~18.
Not corruption (the `last_probed_at` column makes it visible), but the designed
safety margin is inverted. Fix is a cron move to ~20:00 UTC, which absorbs the delay
and captures the same morning's probe run.

**Flag 2 — the site advertises a listing path that does not exist.**
`src/landing-html.ts:85` and `:122` and `src/site-chrome.ts:183` all say "pay-to-list
with refundable bond, never pay-to-rank." There is no implemented listing or bond
mechanism anywhere in `src/`; `provider-selection.ts:9` confirms selection is purely
measurement-based and bond logic is out of scope. A provider read that copy and
emailed to ask what the manual step was. That is the copy generating the exact
friction it describes. Either build a minimal listing intake or soften the copy to
describe how listing actually happens today.

**Flag 3 — STANCE.md is 85 days stale.** Dated 2026-05-21, `drift_hard_days: 30`.
That is a hard fail by the project's own discipline, and the `phase` field is
probably wrong now that the kill criterion has fired. I stamped this draft with the
stale version rather than inventing a current one. Recommend a stance refresh before
any decision that leans on phase or pillar status.

---

*Draft prepared 2026-08-14. Not sent. Johan to review, edit, and send.*
