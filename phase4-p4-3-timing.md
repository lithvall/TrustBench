# Phase 4 P4-3 (Solana) — timing decision

**Date:** 2026-05-06
**Driver:** Solana Foundation + Google Cloud announced Pay.sh on 2026-05-05. x402-on-Solana just became the second center of gravity for the protocol.
**Question:** Do we accelerate P4-3 (Solana settlement) given the news, and if so, how?

## Current state of Solana-awareness in the codebase

What is already Solana-aware:

- `src/crawler.ts` step 2 — Heurist Mesh crawler stores ~150 Solana x402 endpoints (`mesh.heurist.xyz/x402/solana/agents`). They land in the `providers` table tagged `network: solana`.
- `src/crawler.ts` `NORMALIZE_NETWORK` map — knows `solana`, `polygon`, `eip155:8453` → `base`.
- `src/scorer.ts` `getRankings()` — explicitly filters Solana rows out of `/rankings` and `/route` (lines 124-134), so they live in the DB but never reach an agent today.
- Memory entry `project_heurist_crawler_2026_05_06.md` documents this as "P4-3 transition is one-line filter removal — pre-built registry, no re-crawl needed."

What is hard-coded Base:

- `src/route-handlers.ts:101-105` — `PHASE_3_CHAIN = 'base'`, `PHASE_3_NETWORK_X402 = 'base'`, `PHASE_3_USDC_ADDRESS = 0x833589fCD6...` (Base-USDC), `PHASE_3_DECIMALS = 6`.
- `src/route-handlers.ts:298` — `validateChallenge` rejects anything that is not `'base'` or `'eip155:8453'`. A Solana challenge would 400 here.
- `src/route-handlers.ts:1121` — quote envelope hard-codes `network: 'eip155:8453'` and the Base USDC asset address.
- `src/receipt-generator.ts` (and the on-chain verifier in `scripts/verify-receipt.js`) — uses viem against Base RPC. The `block_number` field in the receipt schema is an EVM-block-numbered integer.
- The paid-probe wallet is a Base EOA, not a Solana keypair.

What is genuinely missing for end-to-end Solana routing:

1. A Solana wallet for the paid-probe (separate from the Base EOA).
2. A Solana settlement signer in `paid-probe.ts` (the current path goes through `@x402/evm`).
3. Solana branch of `validateChallenge` and `quoteHandler` (different `network` value, different USDC mint, different challenge field shape — Solana x402 challenges advertise a SPL-token mint, not an EVM asset address).
4. Either MPP (Pay.sh's other supported protocol) or x402-on-Solana support; ideally both, since the Pay.sh ecosystem ships with both.
5. Receipt schema generalization: `block_number` becomes either nullable or supplemented by `slot` for Solana; on-chain verifier needs a Solana RPC branch using a Solana SDK (e.g. `@solana/web3.js`).
6. `/.well-known/trustbench.json` advertises which networks each capability is routable on.

That is real work — order-of-2 weeks in solo-founder pace, on top of the $30 wallet rebalance and Solana-USDC funding.

## Three options

### Option A — Display-only (1-2 days)

Drop the Solana filter in `scorer.ts`, add a `network` column to `/rankings` (already in metadata, just surface it), and let agents see the Heurist Solana inventory. Keep `/route` Base-only, with an explicit error code if an agent requests routing on a Solana provider.

**Pros**
- One day of work. Pre-built registry — no re-crawl.
- Honest with agents: they see the inventory, they know it's not routable through us.
- Marketing surface: TrustBench becomes the only public registry covering both Base and Solana x402 endpoints from one query, the same week Pay.sh launches.

**Cons**
- Doesn't earn routing revenue on Solana.
- Adds a rough edge: agents that don't read the network field will hit a 400 at quote time.

### Option B — Display + read-only route (2-3 days)

Option A plus: `/route` returns Solana provider info when no Base alternative exists, but flagged `routable: false` and pointing the agent at Pay.sh / Heurist directly for self-settlement.

**Pros**
- Adds a clean concession: TrustBench openly says "this provider is in our registry but not routable through us yet." Honesty is on-brand.
- Encourages agents to integrate against TrustBench's read API for discovery, with the routing as an upgrade later.

**Cons**
- Adds a new response shape that has to be carried forward.
- Confusing if an agent already integrated and now has to handle the new flag.

### Option C — Full Solana routing (~2-3 weeks)

Option B plus: real Solana settlement path. Solana wallet for paid-probe, MPP and/or Solana-x402 wire layer, receipt schema generalization, on-chain verifier branch, the entire spend-cap + idempotency stack stays unchanged because those are network-agnostic.

**Pros**
- Real cross-network routing. The differentiation phrase "x402 across networks, with policy + audit on top" becomes literally true.
- Pay.sh-onboarded providers can route through TrustBench and pick up the policy + audit layer Pay.sh doesn't ship.

**Cons**
- ~2-3 weeks of focused work, before P4-1b has earned even one outside-Infopunks paid receipt.
- High-risk surface (payment construction + signing on a new chain) — has to be paired with the same discipline used on the Base side.
- We do not yet have evidence anyone is asking for it. Pay.sh is one day old.

## Recommendation

**Ship Option A within 48 hours. Defer Option C until the third paid-route partner (after Infopunks) lands or until a Pay.sh-side conversation creates concrete demand.**

Reasoning:

1. Option A is a free win that gets TrustBench on-the-record as cross-network the same week Pay.sh launches. The cost is one day. The marketing leverage is "TrustBench: the only registry that already covers both Base and Solana x402, the day Pay.sh launched."

2. Option C is real engineering against unproven demand. P4-1b earned its first paid receipt today (2026-05-06). Spending two-to-three weeks chasing a one-day-old Solana announcement when we have not yet paid-routed against more than one Base merchant inverts the order. Earn the second and third Base paid-route partner first; let the demand for Solana arrive as a reply DM, not a forecast.

3. The `pay-skills` GitHub catalog only has 9 providers committed today (vs the article's "50+"). The real catalog will arrive over weeks. Build the Solana side once that catalog has substance — by then we will know which 4-5 Solana providers actually matter, and Option C scope shrinks accordingly.

4. There is one strong cross-channel reason to do Option A this week: the public framing reframe (Move 3 in this batch) wants to claim "x402 across networks." That claim is honest if `/rankings` actually surfaces both networks, and dishonest if it surfaces only Base. Option A makes the public copy true.

## Concrete Option A scope (what to ship)

| File | Change |
|---|---|
| `src/scorer.ts` | Remove the Solana network filter (lines 124-134). Bump cache key `rankings:v4` → `rankings:v5`. Add `network` to the projected row shape. |
| `src/rankings-html.ts` | Add a network badge per row (Base / Solana) and a sidebar filter pill `(All networks / Base / Solana)`. JSON output stays byte-identical aside from the new `network` field. |
| `src/route-handlers.ts` | When a Solana provider is selected by capability resolution, return `503 network_not_routable` with `{network, routable_networks: ['base']}` instead of `503 no_provider_for_capability`. Document the new error in `skill.md` and `llms.txt`. |
| `src/index.ts` (or wherever `.well-known/trustbench.json` is served) | Surface `networks_routable: ['base']` and `networks_registered: ['base','solana']` so agents can plan against the gap. |
| `phase4-p4-3a-smoke.md` | Smoke runbook: probe a Solana row appears on `/rankings?capability=search&network=solana`; quote against it returns `503 network_not_routable`; existing Base-only callers see no behavior change. |

Defer to Option C: the actual Solana settlement path, MPP support, the Solana paid-probe wallet, the on-chain verifier Solana branch.

## Decision points (need your call)

1. **Confirm Option A is the move, not C.** I am leaning A; this doc is the case for A. If you want C now, the trigger should be a concrete partner ask, not the news cycle.
2. **Naming for the new error code.** I propose `network_not_routable` with HTTP 503 (consistent with `no_provider_for_capability`). Alternatives: 422, 412, 501. 503 keeps clients' "retry-after" semantics correct since we may add Solana routing later.
3. **MPP versus x402-on-Solana.** When we eventually do Option C, do we ship MPP first (Pay.sh ships it, broader Solana ecosystem coverage) or x402-on-Solana first (closer to our existing wire shape)? This is a Phase 5 question and need not be answered today, but worth flagging.
4. **Pay-skills crawler timing.** The `pay-skills` GitHub repo will be the canonical Solana catalog. I suggest scheduling the pay-skills crawler for the Option C sprint, not Option A — at Option A scope we already have ~150 Solana endpoints from Heurist mesh, more than enough inventory.
