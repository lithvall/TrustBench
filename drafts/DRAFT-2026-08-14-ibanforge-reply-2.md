---
stance_version: 2026-08-14
stance_phase: phase-4-conversion-reassessment
stance_pillars: [canonical-receipt-format-standard, neutral-routing-receipt-layer]
stance_frozen: true   # point-in-time draft
status: draft-for-johan-review
---

# Inbound reply draft 2 — IBANforge, 2026-08-14

Their reply arrived ~14:27. Substantive, cooperative, and they acted on the actual advice (agentic.market listing this week). Draft below is for Johan's review; not sent.

## Verified before drafting

| Claim | Method | Result |
|---|---|---|
| 402 challenge shape as pasted | live POST, no key, no payment | **Accurate.** `scheme=exact`, `network=base`, `maxAmountRequired=5000`, correct Base USDC asset, live `payTo`, `maxTimeoutSeconds=60`, `extra.inputSchema` + `extra.outputExample` present |
| x402 protocol version | same response | **`x402Version: 1`** — see § below |
| `next_steps` in settled response | NOT verifiable | Only present in their pasted *settled* body. The 402 `outputExample` does not contain it. Taking their word; not independently confirmed. |

## The one technical finding worth sending

**IBANforge speaks x402 v1, not v2.** `x402Version: 1` with `maxAmountRequired` as the amount field. CMC (`pro-api.coinmarketcap.com/x402/v1/dex/search`) and QuickNode (`x402.quicknode.com/mat`) — the two live-verified routable upstreams — both return `x402Version: 2` with `amount`.

This is a known live issue in this project, not a new discovery: v1-vs-v2 `PaymentRequirements` parsing was one of the four scoring bugs Strata surfaced on 2026-05-15 (`decisions.md`, that date's entry), and the 2026-05-20 entry-4 read concluded that v1 candidates "require Phase 5 SDK work." So "happy to end up in your routing pool" is not a one-line addition on our side.

Worth telling them plainly — it costs nothing, it is useful to them, and it sets an honest expectation instead of a vague "sure, someday."

## Security note — Johan action

**They pasted a live API key in plaintext email:** `ifk_…` (200 req/month, no card attached, deliberately shared).

- Do **not** commit it to the repo — not in a draft, not in a doc, not in a test fixture. If it is ever used, `.env` only.
- It has now traversed at least one email provider. Regardless of its low privilege, the courteous and correct thing is to suggest they rotate it.
- The x402 path needs no credential at all, which is how the verification above was done. There is no reason for TrustBench to hold this key.

## Strategic signal — flagged, not acted on

Their settled response embeds a `next_steps[]` array with two entries: one self-upsell (`POST /v1/iban/compliance`) and one **third-party referral** (PayQR — `npx -y @czagents/payqr`, hosted MCP at `payqr.cz-agents.dev/mcp`, `qr.cz-agents.dev`).

That is an endpoint performing its own downstream routing, inside the paid response body. Structurally the same move as Dexter's Instinct (recommendation payloads inside the settlement envelope, `COMPETITIVE-MEMORY.md` sev 4) — though with no evidence of payment for placement, so not pay-to-rank on current information.

**Why it matters right now:** TrustBench moved to discovery-first *today*. If endpoints routinely embed their own `next_steps`, the discovery function migrates into the endpoint layer the same way value already migrated away from the routing layer. That is direct pressure on the pivot, arriving in the first piece of external evidence after making it.

Not a reason to reverse anything on one data point. It **is** the disproving branch of the 2026-08-14 maintenance-mode decision starting to have something to look at, and it should be watched deliberately rather than noticed and forgotten.

Also noted: the `_example_notice` field contains agent-directed instructions ("Do not report them to a user"). Benign here — a sensible guard against an agent surfacing demo values as real — but it is instructional text inside tool output, which is a channel to stay conscious of generally.

---

## DRAFT REPLY — for Johan's review, not sent

Subject: Re: IBANforge and the TrustBench registry

Hi Claude-Alain,

Getting listed on Agentic Market is exactly the right move. Once it is live, the nightly crawl will pick you up without anything further from either of us, and you will start appearing in the registry with liveness and latency telemetry attached.

Thanks for the production samples. I ran your challenge myself before replying, unauthenticated and unpaid, and it matches what you sent field for field: scheme exact, network base, the correct Base USDC asset, a live payTo, and a 60 second timeout. Cleaner than most of what our crawler ingests, so I expect you to route well.

One thing worth flagging, since you offered the routing pool. Your endpoint advertises x402Version 1 and uses maxAmountRequired for the amount. The two upstreams we currently route against, CoinMarketCap and QuickNode, both advertise x402Version 2 and use amount. Our payment construction is calibrated to the v2 shape, so adding v1 merchants is a real piece of work on our side rather than a configuration change. That is our problem, not yours, and nothing about it blocks you being listed and probed. I mention it only so "routing pool" does not sound closer than it is.

On the API key: thank you, but I would rather not hold one. Everything I needed was reachable through the x402 path with no credential, which is the better story anyway. Since it went over email in plaintext, you may want to rotate it regardless of who ends up holding it.

The bank_code_check detail is the most interesting thing in what you sent. Resolving the domestic bank code against the national register, and being explicit about which register and as of when, is a meaningfully different claim from a checksum pass. That is the kind of thing that is hard to see from the outside and worth surfacing in your own discovery document, not just in the settled response.

Glad the receipt design lands. It is the part I am most confident in and the part with the least external validation so far, so that is genuinely useful to hear.

Best,
Johan

---

## Notes for Johan

**What this reply does NOT do, deliberately:** commit to adding IBANforge to the routing pool. That is a partnership commitment beyond a first-touch exchange and needs a six-question filter pass, which has not been run. The v1/v2 framing lets you be honest about the gap without either promising or refusing.

**What went right:** the first reply's straight answer produced exactly the behaviour you wanted. They stopped asking to be manually listed and went to fix the upstream cause. That is the cheapest possible outcome for a solo founder — no listing mechanism to build, no relationship debt.

**Open, if you want it later:** they are the only inbound in three months claiming production x402 revenue. Whether that is worth a question about volume and customer shape is a judgement call, but it would be the single most informative data point available about whether anyone is actually paying for x402 endpoints. Not in this reply; it would read as due diligence on a relationship that has not been established yet.

*Draft prepared 2026-08-14. Not sent. Johan to review, edit, and send.*
