# Pay.sh provider triage

**Date:** 2026-05-06
**Trigger:** Solana Foundation + Google Cloud announced Pay.sh on 2026-05-05.
**Sources:**
- Article: https://solana.com/news/solana-foundation-launches-pay-sh-in-collaboration-with-google-cloud
- Pay.sh CLI / facilitator: https://github.com/solana-foundation/pay
- Pay.sh open catalog ("pay-skills"): https://github.com/solana-foundation/pay-skills
- Underlying article protocol: x402 + MPP, settled in stablecoins on Solana

## What Pay.sh actually is (terminology check)

It is a **gateway / API proxy** built on Google Cloud, with an open-source CLI (`pay`) that wraps `curl`, `claude`, `codex`, etc. and handles 402 challenges using a local wallet (Touch ID / Windows Hello / GNOME Keyring / 1Password). Settlement is on Solana, in stablecoins. Protocols supported: **x402 and MPP**. The CLI also ships with an MCP server so chat-app agents can use it.

Importantly: Pay.sh is **not a router**. It is a facilitator + a CLI + a debugger. It picks one path (the gateway proxy + the local wallet) and walks the agent through it. It does not cross-shop providers, enforce per-call spend caps server-side, or emit signed receipts. That is the same layer-distinction we already have versus Coinbase Agentic Wallet — Pay.sh sits next to Agentic Wallet (Solana side) the way Agentic Wallet sits on Base.

## Pay.sh launch list (article copy)

| Category in article | Names cited |
|---|---|
| Official Google Cloud APIs | Gemini, BigQuery, BigTable, Cloud Run, Vertex AI (Model Garden), "and more" |
| eCommerce | Rye, BigCommerce, Purch, "and more" |
| Data & intelligence | Exa, Dune Analytics, Nansen, ATXP, "and more" |
| Communications | AgentMail, StablePhone, StableEmail, "and more" |
| Solana Infrastructure | Helius, Alchemy, Quicknode, Allium, The Graph |
| Article-named launch-partner facilitators | PayAI, Crossmint, Merit Systems, Corbits, Moonpay, Sponge Wallet, ATXP, Tektonic Company |

## What is actually in the pay-skills GitHub repo today (2026-05-06)

The "50+ Community APIs" headline is forward-looking. The committed `providers/` directory has nine entries:

```
providers/
  agentmail
  crushrewards
  dtelecom
  merit-systems
  paysponge
  purch
  quicknode
  socialintel
  solana-foundation
```

`crushrewards` and `dtelecom` and `socialintel` were not mentioned in the article copy — they are real listings the article didn't enumerate. Conversely, most of the eCommerce / Solana-Infra / Comms names from the article (Rye, BigCommerce, Helius, Alchemy, The Graph, Allium, Stable*, Dune, Nansen, etc.) are **not yet in the catalog** as of this snapshot. Treat the article list as marketing intent, the GitHub repo as ground truth.

## Cross-reference vs TrustBench's current registry

TrustBench's registry today is **Agentic Market** (api.agentic.market/v1/services, paginated, ~650 services across 13 pages, Base only filtered into rankings) plus the verified Infopunks seed plus the Heurist Solana mesh (stored, filtered out of /rankings until P4-3).

The article-named providers fall into four buckets:

### A — Already in TrustBench via Agentic Market (no action)

These are already crawled and live in `/rankings` for Base. Pay.sh just listed the same name on the Solana side.

| Provider | In Agentic Market | Networks (AM) | Tier (AM) |
|---|---|---|---|
| Exa | yes | Base | 1P |
| Alchemy | yes | Base + Solana | 1P |
| The Graph | yes | Base | 1P |
| Allium | yes | Base | 1P |
| Nansen | yes | Base + Solana | 1P |
| QuickNode | yes | Base + Solana + Polygon | 1P |
| AgentMail | yes | Base | 1P |
| StableEmail | yes | Base + Solana | 3P |
| Google Gemini | yes | Base + Solana | 3P |
| Sponge | yes (as "Sponge") | Base | — |

**Action:** none. These already show up on `/rankings` (Base) once the nightly crawl hits, and will show up on Solana the moment we drop the network filter in `scorer.ts` (P4-3). The "Sponge Wallet" launch partner in the article is the same entity as Agentic Market's "Sponge" Infra service — same domain (paysponge in the GitHub repo).

### B — Article-named, not in Agentic Market today, in pay-skills GitHub

These are providers Pay.sh listed where the canonical record will live in `pay-skills/providers/<name>/`. Adding them to TrustBench means crawling the pay-skills repo as a 4th source (analogous to Agentic Market for Base, Heurist for Solana, seed for verified).

| Provider | In pay-skills | Article category |
|---|---|---|
| Merit Systems | yes (`providers/merit-systems`) | facilitator launch partner |
| Purch | yes (`providers/purch`) | eCommerce |
| Sponge / Paysponge | yes (`providers/paysponge`) | facilitator launch partner |

Plus three the article didn't name but the catalog has: `crushrewards`, `dtelecom`, `socialintel`.

**Action:** worth a thin pay-skills crawler when we cross the Solana settlement bar (P4-3). Until then, listing them as "Solana-side" rows that route to Solana is dishonest UX. Defer.

### C — Article-named, not in either catalog yet

Names the article cited but don't have a record in either Agentic Market or pay-skills GitHub:

- Helius (Solana Infra)
- Rye (eCommerce)
- BigCommerce (eCommerce)
- Dune Analytics (Data)
- ATXP (mentioned twice — facilitator AND data)
- StablePhone (Communications)
- BigQuery / BigTable / Cloud Run / Vertex AI / Vertex (Model Garden) (Google Cloud APIs)
- PayAI / Crossmint / Corbits / Moonpay / Tektonic Company (facilitator launch partners)

**Action:** wait. The article promises pull requests will land them in pay-skills over time. Crawling pay-skills daily catches them automatically once they appear. No need to hand-add.

### D — Facilitators, not endpoints

The launch-partner list (PayAI, Crossmint, Merit Systems, Corbits, MoonPay, Sponge Wallet, ATXP, Tektonic Company) is mostly **facilitator-layer** — the same role Coinbase plays for x402-on-Base. They are not endpoints to add to `/rankings`; they are entities to consider for partnership cross-references.

**Action:**
- If TrustBench's `/.well-known/trustbench.json` or `llms.txt` lists "facilitators we route through," eventually it should list more than just the Coinbase x402 facilitator. But that's only after the cross-network router actually routes through any of these.
- One name in this list is worth direct outreach: **ATXP**. They are listed under both "Data & intelligence" and as a launch-partner facilitator, suggesting an Infopunks-shaped role (intelligence layer that also operates a payments path). Worth a note in OUTREACH.md alongside Infopunks for the post-P4-1b amplification cycle.

## Strategic implications for TrustBench

1. **The 50+ figure inflates Pay.sh's day-one inventory.** Real catalog is 9 providers, of which 4 (agentmail, quicknode, paysponge, purch) overlap names already in our Agentic Market crawl. Don't react to the 50+ headline — react to the trend line, which is "the pay-skills repo is going to grow over the next quarter."

2. **Agentic Market and pay-skills will diverge.** They are governed by different orgs, with different acceptance criteria, on different networks. TrustBench's "registry of registries" position becomes more, not less, valuable as that divergence happens — we are the one place an agent can query that covers both.

3. **The new must-have crawl source is pay-skills (GitHub).** When we ship P4-3 (Solana settlement), we should also ship a 4th crawler source that reads `github.com/solana-foundation/pay-skills/providers/*` similar to how the Heurist crawler reads the Solana mesh. The format is per-provider markdown / metadata files (per CONTRIBUTING.md), not a single API call — so it's a static repo crawl. Estimated 1 day on top of P4-3.

4. **"Cross-network routing" is now a real differentiator phrase.** Pay.sh = Solana-only. Agentic Wallet path = Base-mostly. TrustBench = both, with the policy + audit layer on top. Phrase to use in copy: **"x402 across networks, with a non-custodial policy and audit layer on top."**

5. **The MPP protocol just became table stakes.** Pay.sh ships with x402 AND MPP support. TrustBench is x402-only. MPP support is not Phase 4 work, but it should appear on the Phase 5 roadmap explicitly: "p402, MPP, AP2 — protocol-agnostic over time."

## Concrete crawler / registry follow-ups (sequenced after P4-3)

| ID | Action | Effort | Sequence |
|---|---|---|---|
| P4-3a | Drop Solana network filter in `src/scorer.ts` (Heurist mesh rows surface on /rankings) | 1 hr | after P4-3 settlement land |
| P4-3b | Add `pay-skills` GitHub repo as 4th crawler source (`crawler.ts` step 4) | 1 day | with or after P4-3a |
| P4-3c | Update `/.well-known/trustbench.json` to advertise both Base + Solana networks | 30 min | with P4-3a |
| P4-3d | Bump cache key from `rankings:v4` → `rankings:v5` (network expansion = breaking shape) | 1 line | with P4-3a |

These four should ship together — they are the consumer-facing complement of the cross-network settlement work.

## Outreach add (post-P4-1b amplification)

When the Infopunks amplification lands and we reach for the next cohort:

- **ATXP** — appears twice in Pay.sh's article (Data & intelligence + facilitator launch-partner). Likely shape: intelligence-layer-that-also-operates-payments, similar to Infopunks. Worth a "complement, not competitor" outreach DM.
- **Solana Foundation Pay.sh team** — partnership-grade DM after we ship the pay-skills crawler. The framing: TrustBench gives Pay.sh-onboarded providers a cross-network registry presence and a policy/audit layer on top of the local-wallet flow. We don't compete with the gateway; we sit above it.
