# Grok — Weekly GitHub Research Briefing

**Audience:** Grok, with full GitHub read access (public repos via the GitHub API or web).  
**Cadence:** Run once per week, ideally Monday morning (covers the prior week's issue/PR activity).  
**Owner:** Johan (the user; founder of TrustBench).  
**This file is the spec.** Companion to `grok-x-research-briefing.md` — the GitHub scan covers a different, lower-volume but higher-signal surface where builder pain is documented in writing rather than tweeted in passing.

**Read first:** `grok-x-research-briefing.md` § 1 (what TrustBench is), § 2 (banned framing), § 3 (current state). All TrustBench framing rules from the X briefing apply here verbatim. Do not duplicate them; reference and obey them.

---

## 1. Why GitHub matters as a separate surface

The X scan finds builders posting in real time. The GitHub scan finds builders who hit a wall and wrote about it formally — which is a stronger commitment signal. A GitHub issue is read by every future builder who hits the same problem; a TrustBench-shaped reply on a relevant issue compounds for weeks or months, where an X reply lives for a day.

GitHub also surfaces:
- **Maintainer intent.** A "good first issue" or "help wanted" label tells you what the protocol owners themselves think is missing.
- **Concrete code references.** Issues frequently link to specific files, line numbers, or test failures that map directly to TrustBench's surface.
- **Long-form reply opportunity.** No 280-char limit. Replies can include code snippets, receipt URLs, and verifier examples.
- **Cross-pollination.** A reply on a `coinbase/x402` issue is visible to every other contributor scanning that thread.

The cost: GitHub is slower-moving than X, and replies that don't add value get ignored or downvoted, where on X they just disappear into the timeline. Triage discipline matters more.

---

## 2. Target repos (scan weekly, ranked by signal density)

**Tier 1 — must scan every Monday:**

| Repo | Why scan | What to look for |
|---|---|---|
| `x402-foundation/x402` (canonical, post-transfer from `coinbase/x402`) | Standards-track work; every extension proposal lands here | Extension proposals (specs/extensions/), open issues on idempotency / receipts / settlement, "discussion" tab |
| `coinbase/x402` (development fork) | Coinbase-side iteration; some issues still land here before promotion | Same as above, plus issues tagged with the `x402-extensions` label |
| `google-agentic-commerce/a2a-x402` | AP2 + x402 composition spec; defines mandate-bound receipts | Issues on signing patterns, receipt envelope, payload nesting |
| `mkmkkkkk/paysentry` | Open-source competitor in the reliability lane; their open issues are the unmet pain in our exact lane | Issues tagged `enhancement`, retry/refund/idempotency requests |
| `peacprotocol/peac` | Open-source signed-receipts protocol; the closest envelope analog to our Ed25519+JCS receipts | Cross-protocol questions, signature scheme requests |
| `Merit-Systems/awesome-x402` | Curated registry of x402 projects | Open PRs adding new entries, any "missing project" discussion |

**Tier 2 — scan biweekly (every other Monday):**

| Repo | Why scan |
|---|---|
| `QBT-Labs/x402` | Aggelos Kappos's buyer-side signer/policy lib; we read this on 2026-05-08, watch for routing logic landing |
| `ministryofinfopunks/infopunks-trust-layer-agentic.market` | Infopunks's trust layer; partnership repo |
| `valeo-cash/v402` | Valeo's Solana payment protocol; cross-protocol awareness |
| Strata's MCP repo (when found — currently usestrata.dev points at a hosted product, public repo TBD) | Pre-call scoring partner |

**Tier 3 — scan monthly or on signal:**

| Repo | Why scan |
|---|---|
| `modelcontextprotocol/sdk` | MCP spec evolution; agent payments increasingly land in MCP-shaped flows |
| `ap2-protocol/ap2` (FIDO Alliance fork; verify exact org name on read) | AP2 mandate framework; cross-protocol receipt composition |
| `OpenZeppelin/defender` | If they expand the Stellar x402 facilitator to Base, that's a watch-trigger |

If any Tier 1 repo has been quiet for 3+ weeks, drop it to Tier 2 and elevate something else.

---

## 3. What to look for (issue patterns that map to TrustBench)

**A-tier — direct compose fit:**
- Issues mentioning **idempotency** on x402/MCP retry paths
- Issues mentioning **signed receipts**, **audit trails**, **proof-of-payment**, or **replayable verification**
- Issues mentioning **spend caps**, **per-agent limits**, **per-call hold**, or **reservation patterns**
- Issues mentioning **multi-provider routing**, **provider failover**, or **cross-merchant selection**
- Issues mentioning **non-custodial** payment patterns where the agent owns the key
- Extension proposals that touch any of the above

**B-tier — adjacent, may compose:**
- Issues mentioning **dispute resolution** or **refund mechanisms** (we don't ship dispute resolution; off-chain credit ledger is in design but not built — be careful with overclaim)
- Issues mentioning **identity / attestation** (ERC-8004 etc.) where a receipt could carry the attestation forward
- Issues mentioning **post-quantum signatures** (we use Ed25519, not PQ — different stack)
- Issues mentioning **rollback** semantics (reservation hold-then-release is partial coverage; not full rollback)

**C-tier — skip:**
- Generic "agent payments are hard" issues without concrete builder pain
- Issues about specific chain integrations TrustBench doesn't support yet (Solana settlement is preview-only, Cardano not at all)
- Maintainer-internal issues (refactors, CI, release process)

---

## 4. Triage rules (which issues to draft a reply on)

Apply the same triage mindset as the X scan but with these GitHub-specific adjustments:

- **Skip if the issue is closed.** Closed issues aren't read by maintainers anymore. Open or recently-reopened only.
- **Skip if a maintainer has already answered with a definitive direction.** Don't pile on. Reply only adds value when the question is open.
- **Skip if the OP hasn't replied to clarifying questions in 30+ days.** They've moved on; the reply lands in dead air.
- **Pacing:** max 2 replies per Monday across all repos. GitHub replies are higher-leverage than X but lower-frequency; don't dilute by spamming.
- **Pacing:** max 1 reply per repo per week. A second reply in the same repo within 7 days reads as bot.
- **Skip if the reply would require overclaim.** Same rule as the X pattern (`feedback_x_reply_pattern.md`). If TrustBench's honest scope doesn't cover the OP's actual ask, skip.

---

## 5. Reply pattern (GitHub-specific)

Use the same five-element pattern from `feedback_x_reply_pattern.md`, with these adjustments for GitHub's longer-form context:

1. **Opener — short framing, don't quote the issue back.** One sentence. Same rule as X.
2. **Body — feature list with code references where helpful.** GitHub allows code blocks. If the reply benefits from a 5-10 line snippet showing how TrustBench handles the OP's case, include it. Link to specific files in the TrustBench repo (e.g., `src/route-handlers.ts:120` for the idempotency-key handler) so a curious reader can verify.
3. **Honest concession — voluntarily name what TrustBench doesn't ship.** Same rule as X. On GitHub, this lands extra well because the OP can see you're not pitching, you're contributing context.
4. **Async closer — link, don't pitch.** Acceptable closers: a link to the relevant TrustBench docs page, a link to the npm verifier, a link to the receipt-spec doc, or just "Thought it might be useful context for the issue. Happy to compare notes if a closer integration is interesting." Never propose a call (per `feedback_no_calls_in_outreach.md`).
5. **Style + length — write like a contributor, not a vendor.** Lowercase optional. No marketing varnish. No "TrustBench is a leading..." preamble. Direct technical engagement only. 200-500 words is the sweet spot; longer if a code snippet justifies it.

**Critical:** if the issue is on a Foundation-track repo (`x402-foundation/x402`), the bar for replying is higher because it's read by every Foundation member. Reply only when there's a concrete, testable claim TrustBench can contribute. Don't reply just to surface TrustBench's existence.

---

## 6. Output format expected from each Monday scan

For each Monday scan, return a structured brief in this shape:

```
WEEKLY GITHUB SCAN — YYYY-MM-DD

A-TIER (good fits, drafts ready):
1. [repo/name#issue-number] — [issue title]
   Pain or partnership signal: [one-line summary]
   OP: [github handle]
   Status: [open / commented-by-maintainer / awaiting-OP]
   Last activity: [date]
   Compose hook: [how /route or receipts maps]
   Draft (200-500 words):
     [full draft following the reply pattern above]

B-TIER (adjacent, would need editing):
   ...

C-TIER (noted for awareness, skip):
   ...

TIER 1 COVERAGE LOG (added 2026-05-10 for calibration):
Required when A-TIER and B-TIER are both empty. List every open issue or PR
seen in Tier 1 repos during the scan window, with one-line filter reason if
the item didn't make A/B tier. Format:
- repo/name#N — "[issue title]" — filter reason: [no compose hook / OP-stale
  / closed by maintainer / spec-process-internal / etc.]

The point is to expose the noise floor. If a "quiet week" is genuinely zero
issues filed in Tier 1 repos, say so explicitly ("scanned X repos, 0 open
issues in window"). If it's "issues were filed but none mapped to TrustBench
primitives," list them so Johan can sanity-check the keyword filter.

When A-TIER or B-TIER has at least one item, this section can be omitted —
the named items already prove the scan ran.

PARTNERSHIPS WORTH WATCHING (people / projects to track):
- [github handle / project] — [why interesting, no reply needed]

NEW EXTENSION PROPOSALS (Foundation-track, read for awareness):
- [repo/spec-path] — [one-line summary, implications for TrustBench]

NOTES:
- [aggregate observations about the week's signal: themes, repo activity, any watch-canaries firing]
```

This mirrors the X scan output format so Johan triages both with the same mental model.

---

## 7. Anti-patterns (don't do these)

- **Don't reply on Foundation-track repos to surface TrustBench's existence.** Reply only when contributing technical content. Self-promotion on standards repos burns trust fast.
- **Don't reply with a long pitch when a 3-sentence answer would do.** GitHub readers have less patience than X readers; signal-to-noise is unforgiving.
- **Don't compose-pitch on every issue.** Most issues are not partnership-shaped. If the OP is asking a narrow technical question, answer the question; save the compose pitch for issues that explicitly invite cross-protocol composition.
- **Don't reply on TrustBench-side competitor repos (PaySentry, PEAC, Probe, etc.) with TrustBench framing.** That's poaching their issue tracker. Silent monitoring only. If a real complementary fit appears, escalate to Johan for a direct outreach decision rather than commenting in their repo.
- **Don't suggest a call.** Same rule as X. GitHub comments are async by definition; live formats undermine the medium.
- **Don't draft a reply with em-dashes.** Same rule as X.

---

## 8. Watch canaries (drop everything and surface to Johan if any of these fire)

- **Bazaar / agentic.market integration spec proposal lands on `x402-foundation/x402`.** Direct intersection with the listing plan in `phase4-listing-plan.md`.
- **A `routing-receipt` extension proposal lands on `x402-foundation/x402` or `google-agentic-commerce/a2a-x402`.** Direct intersection with TrustBench's core artifact.
- **PaySentry, PEAC, or xpay open an issue requesting routing or cross-provider features they don't currently have.** Watch-trigger because the lane could re-open if they don't ship it.
- **Any Foundation-track issue specifically tagging "routing" as out of scope or as a future extension target.** Tells us where the standards work is heading and whether TrustBench's lane is on the standards path.

---

## 9. Cross-references

- `grok-x-research-briefing.md` — daily X scan, shared TrustBench framing (read first).
- `feedback_x_reply_pattern.md` (memory) — reply template applies here too.
- `feedback_no_calls_in_outreach.md` (memory) — no call/meeting offers, ever.
- `feedback_no_em_dashes_outreach.md` (memory) — em-dash sweep on every draft.
- `competitive-landscape.md` — partnership-readiness context for any partner repo we scan.
- `phase4-listing-plan.md` — direct dependency on agentic.market + Bazaar listings; flag any Bazaar-related issues immediately.
