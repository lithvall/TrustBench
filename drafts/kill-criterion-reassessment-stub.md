---
title: Kill-criterion reassessment stub (DRAFT — extend, do not originate)
created: 2026-05-19
extend_by: 2026-06-06 (start), 2026-06-22 (complete-by), 2026-06-27 (decision)
status: stub
companion_doc: audit-and-path-forward-2026-05-19.md (v2) § 4.4 + § 6
---

# Kill-criterion reassessment — stub scaffold

## Purpose

Decision document for what happens if the Phase 4 kill criterion fires on 2026-06-27 (no paying external agent within 6 weeks of the agentic.market / CDP Bazaar listing on 2026-05-13). This file is a stub. Future-Johan extends it with real data closer to the decision date — does not originate the reassessment from scratch under deadline pressure.

## How to use this file

- **Now (2026-05-19):** review the stub structure; confirm the option list still captures realistic paths.
- **~2026-06-06:** start extending § 1, § 2, § 3, § 4 with real numbers as the data lands.
- **~2026-06-22:** write § 7 (recommendation).
- **2026-06-27 OR when early-trigger fires:** finalize § 8 (decision + decisions.md entry).

If kill-criterion conditions LOOSEN before 2026-06-27 (first paying external agent + ≥2 leading indicators fired), close this file with `status: not-needed-revisit-in-90-days` and move on. The stub itself stays as a callable pattern for future kill-criterion windows.

---

## § 1 — State of the kill criterion (extend with real data)

**Definition.** "Paying external agent" = external wallet (non-TrustBench, non-Strata-test, non-self-test) that settled at least one paid /route call in the observable window.

- Paying external agents count: __
- First-paying-agent date: __
- Recurring vs one-off split: __
- Volume distribution by wallet (top 5): __

**Source queries (PowerShell, when extending):**

```powershell
# paid_requests in last 30 days, grouped by payer (excluding self-test wallets)
# Use Supabase SQL editor or psql
SELECT payer_address, COUNT(*) as calls, SUM(amount) as total_paid_usdc
FROM paid_requests
WHERE created_at > NOW() - INTERVAL '30 days'
  AND payer_address NOT IN (<self-test-wallet-list>)
GROUP BY payer_address
ORDER BY calls DESC
LIMIT 20;
```

---

## § 2 — Leading-indicator state (extend with real data)

Per v2 audit § 6 multi-signal list:

- Verifier npm downloads from non-founder IPs (last 30d): __ (source: npm download stats by org / Bunny CDN logs if applicable)
- /receipts/:id deep-links from external domains (last 30d): __ (source: Cloudflare access logs, Referer header where present)
- Schema mentions in third-party docs / READMEs / blogs (search "trustbench_receipts" / "trustbench-format" / "rrcpt_"): __
- Inbound "can we emit this format" questions (DMs / GitHub issues / email): __
- Route-to-settle conversion rate (% of /route quotes that completed settle): __
- agentic.market listing `lastUpdated` shift from independent (non-TrustBench-smoke) wallet: yes / no
- Total leading-indicator score: __ / 6

**Threshold interpretations:**
- 0/6 firing = silent ecosystem; revenue mechanism unlikely to be the blocker
- 1-2/6 firing = inspection-but-no-integration; integration friction is likely the blocker
- 3+/6 firing = real interest; integration mechanism / pricing / discovery may be the blocker

---

## § 3 — Partnership pipeline state (extend with real data)

| Partner | Outreach sent | Reply | Stage | Notes |
|---|---|---|---|---|
| Strata | n/a (public 2026-05-15) | n/a | shipped + co-launch | __ |
| Sophymarine (OpenRegistry) | __ | __ | __ | __ |
| httpay.xyz (Alfred Zhang) | __ | __ | __ | __ |
| Heurist Mesh | __ | __ | __ | __ |
| AnChain.AI (secondary) | __ | __ | __ | __ |
| PEAC Protocol (longer-horizon) | __ | __ | __ | __ |
| Inbounds (uninitiated by us) | n/a | __ | __ | __ |

**Substantive-reply definition:** any reply that names a specific integration question, asks about pricing tiers, requests the spec, OR engages on architecture. "Interesting, get back to you" with no specifics = soft signal, not substantive.

---

## § 4 — Revenue snapshot (extend with real data)

- MRR since 2026-05-11 paywall go-live: $ __
- Total /route paid settles: __ (TrustBench fee revenue $ __)
- Total /receipts/:id reads in last 30d: __ (Cloudflare cache-hit vs origin: __ / __)
- Total verify-receipt npm downloads in last 30d: __

**Pricing model under stress test:**
- Current /route fee: $0.005/call. Validated against rejection of %-spread (Phase 2 2026-04-30) and pay-to-rank (out_of_scope per stance).
- Anchor comparison: x402route $0.001/call (5x cheaper, plain JSON, no signed receipts, no on-chain anchor, no audit URL).
- Per partnership-day-record-2026-05-07 volume model: 200 calls/day = ~$30 MRR; 2,000 calls/day = ~$300 MRR; 20,000 calls/day = ~$3K MRR.

---

## § 5 — Decision options (each elaborated with cost / signal / 90-day kill)

### Option K1 — Lower paywall pricing

Drop /route from $0.005 to $0.002 or $0.001 to reduce friction.

- Cost: revenue per call cut by 60-80%. Existing partner expectations (Strata $0.005 list-but-reciprocal-free per 2026-05-12 tier lock) need careful handling.
- Signal: does paid-call volume grow >5x within 30 days of price cut? (i.e., does revenue stay flat-to-up?)
- 90-day kill: if volume doesn't compensate, K1 doesn't work; escalate to K3 or K5.

### Option K2 — Add a free tier

First N calls/day free per agent wallet (N=10? 50? 100?), paid only above quota.

- Cost: infrastructure-burn ceiling at N × max_users × marginal_cost_per_call. With $50/mo cap, can sustain low free-tier indefinitely.
- Signal: does adoption climb? Specifically: does the count of *unique external paying wallets* grow even if total revenue stays flat?
- 90-day kill: if unique-wallet count stays under 5, free-tier didn't lower the friction wall.

### Option K3 — Pivot to /verify primary

Position TrustBench primarily as verification layer not routing layer (per `SIGNAL-2026-05-17-agenticmarket-bundles.md` § Open Strategic Question). /verify is single-call shape, $0.002, lower friction for bundle integration.

- Cost: design + ship /verify v0.2.0 (~1-2 weeks if scope stays narrow per `phase4-paywall-design.md` line 52; ~4-6 weeks if scope expands to bundle-attestation for non-TrustBench-format receipts).
- Signal: does the bundle-integration story land? Does any bundle author commit to including /verify as a last-step attestation?
- 90-day kill: if no bundle adoption in 90 days post-ship, K3 didn't work; escalate to K4 or K5.

### Option K4 — Open-source pivot

Open-source verifier (already npm-published as @trustbench/verify-receipt), open-source the spec (already in receipt-spec-v1.md), open-source any middleware Option B work. Drop the paywall entirely. Position as standards-track project funded via partnership service contracts and/or grant applications.

- Cost: forgo direct paywall revenue. Maintenance burden continues. Reputation upside (standards-track positioning).
- Signal: does open-sourcing generate ≥3 external contributors / forks / mention as canonical receipt envelope?
- 90-day kill: if open-source pivot generates zero ecosystem signal in 90 days, K4 didn't change the trajectory; escalate to K5.

### Option K5 — Wind down active development

Keep production surfaces live (paywall, /route, /receipts/:id, verifier npm). Stop active development. Transition to portfolio piece + agent-payments expertise asset for the next FT role.

- Cost: forgo all upside; preserve solo-founder energy for whatever comes next.
- Signal: not applicable (this is the not-actively-running option).
- Honest framing: if the previous 4 options have been tried and failed, K5 is the rational close. Artifacts retain value (verifier npm, receipt spec, Strata reference) regardless of revenue.

---

## § 6 — Decision criteria

- **If partnership pipeline has ≥1 substantive reply (per § 3):** lean K1 or K2. Revenue mechanism is the issue; the receipt envelope + routing shape is validated.
- **If pipeline silent but leading indicators ≥3/6 firing (per § 2):** lean K3. People are looking at receipts but not paying; integration shape is likely the blocker.
- **If pipeline silent and leading indicators ≤1/6 firing:** lean K4 or K5. The ecosystem isn't picking up the receipt envelope as positioned; standards-track open-source OR clean wind-down is more honest than continued paywall optimization.
- **Strata partnership state is load-bearing across all options.** If Strata Show HN succeeded and the partnership is generating regular paying traffic, that alone may push K-option re-thresholds. If Strata stalled, the kill criterion is more binding.

**Constraint reminders (do NOT change as part of K-decision):**
- Non-custodial. Out-of-scope per stance.
- No %-spread routing. Rejected Phase 2.
- No pay-to-rank. Stance differentiator vs Dexter Instinct.
- No "benchmark / oracle / authority" framing.

---

## § 7 — Recommendation (extend at decision time)

To be written ~2026-06-22 from the data in § 1-§ 4.

Template:

> Recommend Option K_ for the following reasons:
> 1. [primary reason rooted in § 1-4 data]
> 2. [secondary reason]
> 3. [risk-factor not addressed by K_]
> Tradeoff acknowledged: [specific tradeoff].
> Kill criterion for K_ option itself: [90-day check].

---

## § 8 — Decision (extend at decision time)

To be written 2026-06-27 OR when early-trigger fires.

Template (decisions.md format per CLAUDE.md § Decision Journal):

```
2026-06-XX: <decision in one sentence>. Reason: <one paragraph>.
  - assumption: <load-bearing one-sentence assumption>
  - leading_indicator: <observable 90-day signal>
  - check_back_date: 2026-09-XX
  - status: open
```

---

## Cross-references

- Audit v2 § 4.4 (kill-criterion timing revision)
- Audit v2 § 6 (multi-signal kill triggers)
- Roadmap § 4.3 (revenue expectations mid-horizon)
- Roadmap § 4.4 ("good" at end of week 5)
- Roadmap § 6 (decision checkpoints)
- partnership-day-record-2026-05-07 § 4 (pricing structure starting points)
- strategic-pillars-and-options-2026-05-14 § Option B (open-source pivot path)
- decisions.md 2026-05-13 entry (Stone 0 indexing validation, 2026-08-11 callback may inform § 2)
