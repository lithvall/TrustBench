# TrustBench — Lessons Learned

A living log of patterns, surprises, and corrections worth remembering across sessions. Every entry is something that, if forgotten, would be re-learned the hard way.

---

## 2026-05-20 — In Railway log scans, account for own-traffic before claiming a behavioral pattern

While scanning a 15-minute Railway log shortly after the `/openapi.json` ship, I flagged two near-simultaneous `GET /rankings?capability=search` + `GET /rankings?capability=inference` requests at 08:20:30 as evidence of a "new agent-class visitor doing parameterized capability discovery." The framing was confident: "no contact-scraper would do that, and no monitoring probe does that either. This is a class of visitor that's *using* the registry, not just liveness-checking it. Worth watching whether it returns."

Johan immediately corrected: it was probably him, working on the paid-probe code in a parallel chat window. The two parallel `?capability=` calls are exactly the shape of paid-probe iteration — fetching the current registry split by capability bucket so the prober can pick a provider per category. Once that traffic is accounted for, the 15-min window has zero confirmed novel external behavior — just the existing CarbonMonitor / MAKO Pulse / contact-scraper triad plus the post-deploy openapi.json warm-up.

The mistake wasn't in noticing the pattern — two parallel parameterized calls *are* unusual against the baseline. The mistake was in jumping to "external sophisticated agent" without considering that the most common source of unusual traffic on a solo-founder service during active dev hours is *the founder themselves*. Solo-founder shape means the dogfooding signal-to-noise ratio is permanently high; treating own-traffic as a free baseline is wrong for the same reason a one-person retail shop can't ignore that they themselves trigger the door bell.

**Three patterns worth banking:**

1. **Before claiming any behavioral signal from a Railway log, ask whether the time window overlaps with active dev work in another window.** Especially for traffic shapes that look like "considered exploration" — parameterized queries, content-negotiated requests, multi-step flows. These shapes are also what dogfooding looks like. If the window overlaps with active dev work, the burden of proof is reversed: assume own-traffic unless something rules it out (a different IP / UA / referer in a paywallgate-probe enriched line, e.g.).

2. **The cheapest way to disambiguate is a single-line acknowledgement when surfacing the claim.** "Two parallel `/rankings?capability=` calls at 08:20:30 — was this you in another window, or external?" cost the same as "this is a class of visitor that's using the registry," and the corrected version protects against the calibration mistake. Default to that phrasing for any traffic shape that *could plausibly* be Johan working in parallel.

3. **Solo-founder traffic baseline is structurally different from team-developed-service traffic baseline.** A team service has so many cross-cutting probes (CI, dashboards, alerts, on-call dogfooding, customer-success) that one developer's debugging gets lost in noise. TrustBench's traffic is dominated by 4-5 named crawlers + Johan's testing + Strata's reference agent. The "noise floor" is low enough that own-traffic shows up as legible signal, and it's specifically the kind of legible signal that looks like sophisticated external discovery. Bake this into log-scan defaults: when something looks like "an agent thinking carefully," check if Johan was thinking carefully nearby first.

**Meta-lesson.** The Grok daily-scan workflow already has three classes of drift documented (`feedback_grok_scan_url_handle_drift`, `feedback_grok_scan_draft_quote_back`, `feedback_grok_scan_check_parent`). Now there's an analogue for Railway log scans: the source isn't a third-party tool's hallucination, it's me reading the logs without filtering Johan's concurrent traffic. Same class of mistake (confident misattribution), different surface. The fix is the same shape too: ask before claiming.

---

## 2026-05-19 — On an X reply with two URLs in the body, the second URL wins the card preview; refer to other domains by referent if you want the first URL's card

Posted the v7 bundle-touch reply to nick.base.eth ("the bundles are live, feel free to test!"). First draft ended with: *"Curious about agentic.market's bundle submission process. DM open."* — `agentic.market` became an auto-linked second URL in the body. The first URL was `trustbench.io/bundles/receipt-backed-agent-to-agent-procurement`. X's card-preview crawler picked `agentic.market` for the card image (it has a well-established OG card; trustbench.io/bundles/... was brand-new). The compose-box preview rendered with the agentic.market chart instead of the TrustBench branding we'd just shipped HTML rendering for.

Fix that worked: replace the second-domain phrase with a referent. *"Curious about your bundle submission process. DM open."* — Nick runs agentic.market, so "your" reads contextually as the same question without auto-linking a second domain. Single trustbench.io URL in the body, X has no other option, card preview renders from trustbench.io's OG metadata.

**Three patterns worth banking:**

1. **X's card preview picks the second URL when a tweet body has two URLs, not the first.** The selection is biased toward better OG metadata too, but in practice the recency-of-mention dominates. When you want a SPECIFIC URL's card, ensure that URL is the only auto-linked URL in the body. Refer to other domains by their operator/owner referent ("your," "the platform," "their," "Coinbase's") to prevent auto-link.

2. **Card preview empty in X's compose box doesn't mean broken metadata.** X is slow to crawl fresh URLs. The compose-time preview is best-effort and often empty on URLs that don't already have a card cached. The card usually appears within minutes of posting once X's crawler catches up. Don't troubleshoot the metadata based on compose-box state alone; verify via direct `curl.exe -H "Accept: text/html" <url>` checks on the OG/twitter meta tags + the og:image asset itself.

3. **For partner-touch tweets that route to a specific URL, audit the body for auto-link surface area before sending.** Domains, @handles, email-like strings, and #hashtags all become clickable links and can affect card selection or pull attention away from the load-bearing URL. The bundle-touch reply needed the trustbench.io URL to be the card and the only link; one minute spent rephrasing the agentic.market reference saved the on-brand card preview.

**Meta-lesson.** The empty compose-box preview was a false alarm — both the OG image (`/og/home.png`) and the meta tags (og:title, og:description, og:image, twitter:*) returned correctly when curl-tested. The card eventually rendered post-publish. The lesson isn't "X's card preview is broken"; it's "X's card preview is unreliable in compose, AND chooses the wrong URL when two URLs are in body — both fixable, both worth knowing in advance." Generalizes to any future X outreach involving multiple domains: refer-by-referent for non-target domains.

---

## 2026-05-18 — When another Claude instance and I disagree on a load-bearing architectural claim, verify against the source-of-truth design doc BEFORE counter-claiming, not after

A dispatch session updated `SIGNAL-2026-05-17-agenticmarket-bundles.md` with the architectural finding that bundles are LLM prompts not HTTP runtimes, then drew a strategic conclusion: "/route is not bundle-step shaped because a bundle step calling `/route` would require two x402 flows plus a second HTTP call to the actual provider." Dispatch's verdict was that the clean bundle-integration story is the v0.2.0 `/verify` endpoint, not `/route`, and elevated `/verify`'s priority based on this read.

Johan surfaced dispatch's update to me. I pushed back on the "/route requires two x402 flows + second HTTP call" claim, characterizing it as a misread of the v0.1.0 paywall design. My counter-claim was that `/route` is one HTTP call from the agent's perspective with multi-payment envelope handling wallet-internal. I told Johan that "before letting dispatch's update freeze in the signal file, verify the /route paywall shape against `phase4-paywall-design.md`."

When Johan greenlit the verification and I actually read `phase4-paywall-design.md` Q3 (lines 92-114), dispatch's read was correct and mine was wrong. The doc is unambiguous: the agent makes two x402 payments per `/route` call — one to TrustBench's revenue wallet for the routing fee, then a second separate POST to the provider URL for the actual capability work. The wire diagram explicitly shows the agent making a `POST <provider-url>` after receiving the routing decision from `TrustBench`. Two x402 flows, two HTTP transactions, by design for non-custodial reasons (Coinbase's facilitator does not currently support a single x402 transaction with two `payTo` recipients, verified during P4-1b debugging).

The pattern isn't that I was wrong — anyone can be wrong about architecture. The pattern is **when** the verification happened. I counter-claimed first, then recommended verification. The correct sequence was: see dispatch make a load-bearing technical claim, read the source-of-truth doc, then either ratify or counter-claim. By inverting the sequence, I produced confident-sounding analysis that Johan was poised to act on (push back on dispatch's signal-file edit, reverse the strategic pivot) — and the analysis was wrong. The cost of reading `phase4-paywall-design.md` first was 60 seconds; the cost of being wrong with confidence was a near-miss on locking incorrect content into a shared strategic artifact.

**Three patterns worth banking:**

1. **When an outside Claude instance and I disagree on a load-bearing technical claim, verification against the canonical doc comes BEFORE the counter-claim, not as an addendum.** Cross-agent disagreement is the highest-stakes case for verification — both sides have plausible-sounding analyses, neither side has automatic ground truth, and the resolution is going to propagate into a shared artifact (signal file, decisions log, strategic doc). The cost of reading the source doc is trivial; the cost of confident wrong counter-claim is amplified by the fact that the user is now navigating between two confident sources. The user shouldn't be the one running ground-truth checks on the disagreement — that's Claude's job for any claim Claude is making.

2. **Memory is not source-of-truth, especially for architectural details that aren't anchored by recent code work.** I had `/route`'s payment shape in memory as "one HTTP call, multi-payment envelope handled wallet-internal." That was wrong — it was probably a half-remembered version of what we *wanted* the shape to be before P4-1b found that the Coinbase facilitator doesn't support multi-payTo splits. Memory of architectural decisions drifts toward the cleaner / more-elegant version of what got built. For any load-bearing claim about wire shape, signing scope, payment construction, idempotency semantics, or settlement flow — the canonical design doc is authoritative; memory is a hint. Read `phase4-paywall-design.md`, `phase3-x402-construction.md`, `phase3-spend-caps.md`, `phase3-idempotency-design.md`, `receipt-spec-v1.md`, or `phase4-v2-header-migration-handoff.md` before counter-claiming on any topic those docs cover.

3. **Cross-agent disagreement is a fingerprint for "stakes are unusually high here, slow down."** Two Claude instances looking at the same project will usually converge on the same analysis. When they diverge on a load-bearing claim, that's a signal: either one side's read is wrong, or there's an ambiguity in the source material that needs reconciling. Treat the divergence itself as a flag to verify before going further. In this case, my divergence from dispatch should have been my prompt to check the doc immediately, not to push back and recommend the user verify.

**Meta-lesson.** The 2026-05-15 "vivid claim about external state without external verification" entry generalizes to this case with one twist: in cross-agent disagreements, *each* side's claim is the external state the other side hasn't verified. The discipline is symmetric — neither side gets to skip the verification step just because the analysis felt sound. The downstream risk is also amplified: when one Claude is wrong and the user has access to both, the wrong claim gets the user's mid-conversation attention without the protection of a "let me think about it" pause. Verifying first removes that vulnerability. Per the high-risk-surface workflow in `CLAUDE.md`: "Read the canonical design doc *before* coding (e.g. `phase3-x402-construction.md`, `phase3-spend-caps.md`, `phase3-idempotency-design.md`, `receipt-spec-v1.md`). Cite it in the plan." This applies symmetrically to *analyzing* high-risk surfaces, not just coding them. Cross-agent disagreement is exactly the high-risk-surface case where the doc-first discipline matters most.

---

## 2026-05-15 — When a code change introduces a discriminator, smoke tests need *negative* cases too, not just positive

Shipping `@trustbench/verify-receipt` v0.1.2 after Strata's DM flagged that the CLI prints `❌ SIGNATURE INVALID — receipt has been tampered with` when the pubkey URL is unreachable. The fix: add `verificationStatus: 'valid' | 'invalid' | 'unavailable'` on `VerifyResult`, branch the CLI headline on it, add exit code 5 for unavailable. The discriminator's load-bearing security property is that *only* `fetch_failed:*` / `pubkey_fetch_*` errors classify as `unavailable` — a tampered receipt must classify as `invalid`, because CI policies that retry-forever on `unavailable` but alert-on-tamper for `invalid` would otherwise let an attacker mask a forgery as a connectivity hiccup.

I wrote a smoke test (`npm/verify-receipt/smoke-unavailable.js`) with 4 cases:

1. Receipt URL unreachable → expect `unavailable`. (positive — "must be A")
2. Public key URL unreachable → expect `unavailable`. (positive)
3. Programmatic object input with malformed shape → expect `invalid`. (negative — "must NOT be A")
4. Unsupported signature algorithm → expect `invalid`. (negative)

Johan ran the smoke from PowerShell. Cases 1, 2, 4 passed. **Case 3 failed**: `verificationStatus === unavailable -> unavailable`. A malformed object input (`{ receipt: {...} }` with no `signature`) was being classified as `unavailable` instead of `invalid`. Root cause: `loadEnvelope` threw `"object input is not a receipt envelope"` for malformed objects, and the catch handler in `verifyReceipt` unconditionally mapped *every* thrown error to `fetch_failed:` + `unavailable`. The fix was small: move object-input shape handling inline in `verifyReceipt` so only the string-input fetch path flows through the unavailable-classifying catch.

The point isn't the bug. The point is that **the positive cases (1, 2) alone would have shipped this bug to npm**. Anyone passing a bogus URL got the right classification. The wrong classification only surfaced for programmatic callers passing pre-fetched envelopes — which is exactly the call shape an attacker would use to submit a forgery and trigger CI's retry-forever instead of its tamper-alert. Without Case 3 in the smoke, v0.1.2 ships with the security property broken in the one call shape that matters most.

**Three patterns:**

1. **For any change that introduces a discriminator — status field, error classification, exit code branching, route-selection, allow/deny gate — write smoke tests for both directions.** Positive tests pin "this input must classify as A." Negative tests pin "this input that *looks like A in some ways* must classify as B." A buggy discriminator that defaults to A passes 100% of positive tests trivially. The negative tests are where the actual classification logic gets exercised.

2. **The cheap heuristic for "is there a negative case I'm missing?"** Pair every positive test by writing the inverse claim and seeing if it produces a distinct test case. For Case 1 ("receipt URL unreachable must be `unavailable`"), the inverse is "what input could *appear* unreachable but should be classified differently?" Answer: a programmatic input that throws an error from `loadEnvelope` for a non-fetch reason. That's Case 3, and it's the case that actually surfaced the bug. The pairing is a 30-second mental exercise per positive test.

3. **For security-relevant discriminators specifically, name the attacker shape in the test comment.** Case 3's docstring says: *"A receipt with no signature object MUST classify as 'invalid', NOT 'unavailable'. If we got this wrong, an attacker could submit malformed receipts and have them pass as connectivity issues in CI policy."* That comment is what gets read when the test fails. It tells the reader why the test exists, which prevents a future maintainer from "fixing" the test by relaxing the assertion. Without the attacker-shape framing, Case 3 reads like a pedantic edge case worth deleting.

**Meta-lesson.** The v0.1.2 change was correctly identified as medium-risk (not high-risk) because the Ed25519 + JCS logic stayed byte-identical. The high-risk-surface checklist's "failure mode if this is wrong" item was applied to the classification layer — I wrote *"only `fetch_failed:*` / `pubkey_fetch_*` error prefixes can map to 'unavailable'"* in the index.js comment. The discipline was present in the design. What was missing was the discipline at the test level: writing the contract as a positive-only assertion produces a test that doesn't actually check the contract. Pairing the positive with the negative is what makes the test exercise the same property the design comment claims.

Concretely for future TrustBench work: whenever a change adds a new field that takes one of N discrete values, the smoke test should include at least one input that would exercise *each* value — including the values that should *not* fire under normal circumstances. The N=2 case (boolean) is the most common; this lesson is even more load-bearing there because boolean defaults are silent.

---

## 2026-05-15 — Quantitative external claims (reach, audience, distribution) need a 15-second check before any strategic recommendation rests on them

Generalizes today's npm-view-discipline lesson to a wider class. In one strategic conversation about TrustBench's Mindshare outreach options, I made two over-claims that both shaped a recommendation, both turned out wrong, and both were correctable in under 60 seconds of external verification:

1. **"Strata is well-respected in MCP space."** Sounded plausible from inside our partnership relationship (responsive DMs, sharp technical positioning, shipped PR-24 within hours). External reality: @stratamcp has 18 X followers, account joined April 2026 (~one month old), the major TrustBench-integration tweet got 23 views in its first 10 hours, the founder is a data-science undergrad solo-building with Claude Code. Strata is a verified-but-very-small early-stage solo project, not a broad-MCP-recognition voice. Click the X profile → see follower count → claim falsified in 5 seconds.

2. **"Publish a long-form story on TrustBench's own surfaces."** Same shape of error, one layer up. Recommended this as the path because the partnership-anchor model was weakened by Strata's reach calibration. Skipped the equivalent calibration on TrustBench's own distribution. Actual numbers per the founder: @TrustBench has 5 X followers, the GitHub repo has 0 stars, site traffic is "probably low." Publishing into a 5-follower audience doesn't solve the distribution problem; it reproduces the same calibration error one identity over.

Both claims sounded vivid in isolation. Both were the load-bearing premise of a strategic recommendation. Neither survived a click-the-X-profile-and-see-the-number check. The repetition of the same failure mode in one conversation, in two different shapes, suggests the underlying discipline isn't "check npm packages" or "check follower counts" specifically — it's a broader pattern:

**Banked discipline:** Any strategic recommendation that depends on a quantitative external claim — reach, audience size, adoption, follower count, downloads, GitHub stars, site traffic, mentions, citations — must have the underlying number verified before the recommendation is given. The verification cost is one click, one query, one `npm view`, one profile visit. The cost of skipping it is a strategic recommendation built on fiction that then drives multiple downstream decisions.

**Concrete check-pattern to apply automatically:**

1. "Project X is well-respected in space Y" → check X's follower count, mention frequency, citation count in Y. If you can't name a number, you can't make the claim.
2. "Publish on X's own surfaces" / "leverage X's audience" → check X's distribution baseline (followers, traffic, stars). If the baseline is small relative to the bet, the recommendation needs to factor that in or change.
3. "Y is a major / minor player in space Z" → check Y's measurable signal in Z (downloads, market share, mentions). Adjectival quantifiers need numbers.
4. "Wait for Y's moment to amplify" → check Y's baseline reach. If Y's distribution is similar to or smaller than X's, "amplification" is not a meaningful mechanism.
5. "Build mindshare via channel A" → check A's reach relative to A's competitor channels for X's specific audience.

**Why this matters more than the discrete bug it produced:** the failure mode silently compounds. A recommendation built on fiction looks structurally identical to one built on verified facts. The user has no way to flag "I think you didn't check that" unless the claim is suspiciously specific or the recommendation has visible bad consequences. The same pattern that produced today's npm-package-unpublished false positive in the MCP Connectors critic-pass produced these two reach over-claims in a strategic conversation — vivid specificity functioning as a substitute for verification.

**Meta-meta-lesson.** All three of today's lessons.md entries (discriminator + negative tests, npm-view discipline, this one) share the same root: vivid claim about external state without external verification. Three instances in one day of the same failure mode strongly suggests the discipline needs to run automatically on every recommendation that names an external resource or quantitative external state, not be invoked specifically when a claim "feels" uncertain. The cost is a few seconds per claim; the cost of skipping is recommendations that systematically embed unchecked assumptions and silently calibrate downstream work to those assumptions.

---

## 2026-05-15 — Wire-format schema evolution: parsers calibrated to v1 silently mis-read v2 even when each individual field looks plausible

Strata's PR-24 (https://github.com/PThrower/Strata/pull/24) shipped four scoring bugs in their `/x402/verify` today, surfaced by the uncurated TrustBench reference receipt pointing at CoinMarketCap. Three were arithmetic / type-conversion fixes (an `unverified_domain` flag filtered from the visible `actionable_flags` array but still counted in the underlying score arithmetic; `maxAmountRequired` read as USD when x402 sends it in atomic units of the asset's decimals; a missed `clean_flags` bonus). The fourth was the load-bearing one and the most general: their verifier parsed the merchant's x402 `PaymentRequirements` only against the v1 shape (`maxAmountRequired` field name, asset as a plain string). When CMC flipped to x402 v2 (`accepts[]` array, asset as a contract address, field name `amount` not `maxAmountRequired`), the atomic-units fix from Bug 2 would have been functionally inert against CMC because the rest of the parse never matched the v2 shape. Their live-probe sanity check caught the gap pre-push — CC paused rather than ship a fix that wouldn't fire.

The pattern is not Strata-specific. It's a general failure mode of any system that parses a wire format whose schema evolves: parsing logic calibrated to version N can silently mis-read version N+1 even when each individual field still contains *a* plausible value. A USD reader pointed at an atomic-units field returns a number — it returns the wrong one. The downstream code consuming that number has no way to detect the misclassification without comparing against ground truth (the on-chain settlement, the merchant's documented price, a partner with the v2 spec in hand). Unit tests against fixture data pass; production-traffic against v2 endpoints silently produces wrong answers.

**This is directly relevant to TrustBench's Phase 5 work** — every Phase 5 deliverable is a schema evolution. p402 / Canton settlement adds a new `receipt.settlement.chain` value and probably new sibling fields; additional `trust_signals[]` sources widen the annotation shape; AP2 Mandate Constraint extensions (per the 2026-05-07 v0.2 verdict) layer new optional envelope structure. Verifiers running today against `rcpt_` / `rrcpt_` envelopes will hit envelope variants they weren't built for. Three patterns worth banking now while the lesson is fresh:

1. **For any wire-format extension, ship the parser with a "well-formed but unknown" branch that fails loud, not an "extract what looks right" branch that silently degrades.** Strata's verifier didn't know it was reading v2 shape because v1's field names happened to *not exist* in v2 — the parser fell through silently to defaults. The fix is explicit-version-gating: if the envelope advertises `x402Version=2` (or has v2-shape fields like `accepts[]`), refuse to parse it with v1 logic. Surface "unsupported envelope version" loudly. A verifier returning *the wrong score* with no error is strictly worse than one returning "I cannot verify this envelope."

2. **For any partner-facing parser (our verifier, downstream consumer verifiers, partner integrations that read our envelopes), include a real-traffic probe in the pre-publish smoke against a known-evolving production endpoint.** Strata caught their fourth bug because the live-probe smoke against CMC returned a value that didn't match the projection — "expect low-50s, risk_level=low" after the three other fixes, got 10/critical, prompting the pause. Unit tests against fixture data would have shipped the bug. The cost of a $0.005 live-traffic smoke is trivial relative to the cost of a partner-facing verifier that silently misclassifies for weeks. `scripts/paywall-smoke.ts` against the prod paywall already plays this role for TrustBench's wire-touching changes; extend the pattern when adding new envelope variants.

3. **When *we* roll an envelope schema change, give downstream verifiers a deprecation runway, not a flip.** The `@trustbench/verify-receipt` package today probes for `receipt.settlement` OR `receipt.paid` in `verifyOnChain` (the dual-probe shape introduced for the `rcpt_` / `rrcpt_` split). That is exactly the right pattern. When Phase 5 adds Canton settlement (or any new envelope variant), the verifier should add the new branch *and keep the existing branches working* through at least one release cycle. Downstream consumers running v0.1.x against a new envelope shape should get a clear "this envelope uses a settlement variant your verifier doesn't recognize; upgrade to vX.Y" message, not a false negative on `verifyOnChain` and not a SIGNATURE-INVALID-by-accident on a JCS-canonicalization that didn't account for new fields. The v0.1.2 `VERIFICATION UNAVAILABLE` discriminator landed today gives us a third terminal state that fits this case naturally — a future v0.2.0 could classify "envelope-version-unsupported" as `unavailable` with a clear diagnostic, not `invalid`.

**Meta-lesson.** Strata's "live-probe sanity check caught the gap before push" is process discipline that doesn't show up in any artifact — it shows up in the *absence* of bugs later. The discipline is: validator-green is necessary but never sufficient for any wire-touching change; only real traffic against a known-evolving endpoint exercises the schema-evolution surface honestly. This is the same lesson `listing-blocker-audit-2026-05-13.md` § 7 banks for Stone 0 (CDP extensions-echo): validator-green checks said "valid:true," six prior settles happened, indexing stayed at zero. Live traffic against the real indexer was what surfaced the gap. Wire shape is wire shape; schema evolution is schema evolution; "the parser says it's fine" is not the same as "the system says it's fine."

---

## 2026-05-15 — `npm view` before asserting a package is broken/unpublished (Critic-pass false positive)

Running a follow-up Critic pass on the MCP Connectors Directory submission, I asserted as the load-bearing rejection reason #1: "the canonical install command in your own docs returns 404 — `@trustbench/mcp` is not published." The reasoning chain was: I globbed for `packages/mcp/**/package.json`, got no hits, concluded the package was not published. Wrote a confident critic-pass output naming this as the highest-severity finding.

When Johan greenlit the work and I went to verify before editing, `npm view @trustbench/mcp` returned `@trustbench/mcp@1.0.4 | MIT | deps: none | versions: 5`. Five published versions going back to 2026-05-14, latest from yesterday. The repo path was `npm/mcp/`, not `packages/mcp/` — I globbed the wrong location. The decision Johan had already approved (option: "Publish @trustbench/mcp") was based on a false premise; the actual work needed was a republish (v1.1.0) after schema changes, not a first publish.

**The discipline that would have caught it:** the critic-pass template (`prompts/critic.md`) is explicit that the value of the exercise is the rejection reasons, not the verdict. I produced a rejection reason that was vivid and felt incisive ("a reviewer following your own published instructions cannot install your own server") without doing the 15-second check that would have falsified it. CLAUDE.md's anti-hallucination section is also explicit: *"Always read the current file with the read_file tool before proposing any edit or claiming knowledge of its contents... Never assume a file, function, env var, or behavior exists. Verify with tools or commands."* I treated the critic pass as an exception because the output was "analysis," not code. It was not an exception.

**Three patterns worth banking:**

1. **For any critic-pass rejection reason that names an external resource (npm package, URL, on-chain artifact, partner endpoint), run the verification command for that resource before writing the reason down.** `npm view <pkg>`, `curl -I <url>`, `cast tx <hash>`. The cost is one bash call per claim; the cost of skipping it is a Critic pass whose load-bearing finding is fiction. The Critic pass on the paywall (`prompts/critic.md` § Example) names "Router402 ships single-payment-per-call" — that's a hypothetical and labeled as such. The MCP critic pass named "your npm install is broken" without the labeling — same uncalibrated confidence as a verified fact.

2. **Glob with both name conventions for things that have community-default locations.** `packages/` is one npm-monorepo convention; `npm/` is another (used in this repo); `dist/` and `bin/` are also possible. Asserting "no package exists" because one path is empty is the same failure mode as asserting "no API exists" because `/api/v1/foo` 404s without checking `/v1/foo`. Either run the canonical query (`npm view`, `nx show projects`, `lerna ls`) or glob for the union of conventions before drawing the absence conclusion.

3. **When the user has just confirmed a multi-question decision rooted in a load-bearing assumption, surface the verification result *before* doing the work that the decision authorized.** Johan picked "Publish @trustbench/mcp" because the question framed the package as broken. The correct flow on receiving "yes, proceed": run the precondition check first, and if the assumption is wrong, surface "the premise of question 1 was wrong; here's what's actually true; do you want to revise the decision?" before any disk writes. I almost executed an unnecessary fresh-publish flow because the decision had already been "made."

**Meta-lesson.** A Critic pass that produces specific-sounding wrong findings is worse than a vague pass that produces specific-sounding right ones. The specificity gives the wrong findings teeth they don't deserve. Per `prompts/critic.md` § Anti-rubber-stamp discipline: "If the Critic verdict is acceptable or endorsed for three high-risk diffs in a row, stop and ask: am I rubber-stamping?" The inverse failure mode also exists: if the Critic verdict is `weak-reject` or `strong-reject` and the rejection reasons sound vivid and confident — pause and ask whether each rejection reason has been verified externally, or whether one or more is operating on an unchecked assumption.

---

## 2026-05-13 — When a deliverable's README documents a verification command, round-trip that exact command end-to-end before declaring the deliverable ready

Shipping the §10 Strata reference-agent script: I wrote `examples/strata-integration/reference-agent.ts` + README, ran `tsc --noEmit`, did the 7-point high-risk-surface self-review, and called it done. The README's verification command was `npx @trustbench/verify-receipt <receipt_id> --check-chain`. I did not actually run that command end-to-end against a Phase 4 paywall receipt before declaring ready. When Johan ran it against the first live `rrcpt_…` receipt the script produced, the npm package threw `unrecognized input: rrcpt_…` — two structural gaps surfaced that I'd missed:

1. **Regex gap:** both the workspace `scripts/verify-receipt.js` and the published `@trustbench/verify-receipt@0.1.0` had `/^rcpt_[0-9A-HJKMNP-TV-Z]{26}$/` for receipt-id validation. The Phase 4 paywall path emits `rrcpt_` prefixed IDs (paywall-handler.ts:1030, shipped 2026-05-11 — after v0.1.0 went out on 2026-05-08). The verifier didn't know about the new prefix.

2. **Envelope-shape gap:** the chain-check code read `envelope.receipt.settlement`. The Phase 4 paywall envelope emits `envelope.receipt.paid` — different field name on a different envelope `kind`. So even when I worked around the regex by passing a fetched JSON file, the chain check failed with "receipt has no settlement block."

Three days of work — the reference agent + adapter + README — could have shipped with a broken verifier path baked into the README's load-bearing one-liner. Johan caught it on the first live run, but the failure mode was "the deliverable's documented verification command fails for the receipts the deliverable produces." That's the worst kind of integration miss: the artifact and the verifier disagree.

**The fix path was small** (two one-liner patches in `npm/verify-receipt/index.js`, mirror in `scripts/verify-receipt.js`, version bump to 0.1.1, npm publish). What's worth banking is **how the gap was avoided next time**.

**Three patterns:**

1. **For any deliverable whose README documents a verification, monitoring, or smoke command — run that exact command end-to-end against a real artifact before declaring ready.** Not the workspace-local equivalent, not the unit test, not the type-check. The literal command a reader of the README will copy-paste. The cost is one extra invocation; the cost of skipping it is a deliverable whose top documented use is broken.

2. **When envelope shapes diverge across phases, the verifier's field-name assumptions become latent bugs that only surface against the new shape.** Phase 3 receipts use `receipt.settlement`; Phase 4 paywall routing receipts use `receipt.paid`. Both are legitimate. A verifier hard-coded to one shape works fine until the other shape ships, at which point it fails opaquely ("receipt has no settlement block" — technically true, but the more useful message would have been "receipt.paid found but verifier was built for receipt.settlement"). When introducing a new envelope shape, audit every consumer of the old shape's field names and add a dual-probe (`a || b`) or branch on `kind` discriminator. The high-risk-surface self-review's "no duplication" item is the trigger; I missed it because I treated the two envelope kinds as one mental model.

3. **Published npm packages can lag the source they were published from.** `@trustbench/verify-receipt@0.1.0` was published 2026-05-08, before paywall v0.1.0 shipped on 2026-05-11. The npm registry is a frozen artifact; the source moves. When introducing a feature that consumers (Strata, Show HN readers) will exercise via a published package, audit the published version's behavior against the new feature, not the in-repo source. Treat the published version as the contract; treat the in-repo source as the proposal.

**Meta-lesson.** The 7-point high-risk-surface checklist had a "fact-check" item that should have caught this. I treated "fact-check" as "spot-check the field names and capabilities I'm using in the new code." The right interpretation is broader: "fact-check that every command and claim the deliverable makes is exercisable end-to-end *as written*, not paraphrased." Updating the mental model: fact-check is a round-trip discipline, not a code-review pass.

---

## 2026-05-13 — Verify middleware chain reachability before cross-handler state-passing (Change 2 pre-work finding)

Change 1 (2026-05-13 commit `1e8c21c`) parsed `X-Trust-Signals` inside `withIdempotency` middleware and stashed the result on the Hono context via `c.set('trust_signals' as never, ...)`. The Change 2 handoff (`phase4-change2-handoff.md` §1, §3 step 3e) inherited that design and instructed the implementer to read the stashed value with `c.get('trust_signals')` inside the receipt-builder. Pre-work reading of `src/index.ts` route registration revealed the assumption was false: middleware chain on POST `/route` is `paywallGate → requireAgent → withIdempotency → requireWithinSpendCap → quoteHandler`. `paywallGate` branches on `X-PAYMENT` presence and on Branch 2 (X-PAYMENT present) calls `handlePaidRoute()` and does NOT call `next()`. The Strata reference flow (`strata-integration-sketch-SEND.md` §10.2) uses Branch 2. So `withIdempotency` never runs on the paywall path, and the Change 1 stash was dead code for the actual use case. Implementing Change 2 as written would have compiled green, shipped, and silently done nothing for Strata.

The Critic pass (`phase4-change2-critic-pass.md`) caught this as Rejection Reason 1 and Johan's scope decision (Option A: parse directly in `handlePaidRoute`) closed it.

**Three patterns worth banking:**

1. **When one change writes to a Hono context and a later change reads from it, validate that both code paths actually execute in the same middleware chain.** The right artifact to check is the `app.post(...)` registration line — it lists the entire chain in order. If a branch in any middleware short-circuits (returns without `next()`), every downstream middleware in the chain is bypassed for that branch. The cheapest verifier: grep for the route registration, list the middleware names, then read each middleware looking for early returns that don't call `next()`. This isn't optional for cross-handler state-passing — it's load-bearing.

2. **The `c.set/c.get` indirection pattern is a smell when producer and consumer aren't on the same chain.** When they aren't, the right answers are (a) parse twice if the helper is pure and cheap (matches Change 2's solution — `parseTrustSignals` is a pure helper with no I/O), or (b) side-channel storage (DB, Redis) with a TTL contract. The `as never` cast on the Variables map hides the type-system signal that would otherwise catch the mismatch. Treat any third use of the `as never` Variables pattern in the codebase as the trigger for the Variables-interface refactor (already structural debt at 2x).

3. **Critic-pass output IS the scope-decision moment for high-risk surfaces.** The temptation when picking up a handoff is to trust its scope description and start coding. The CLAUDE.md Critic-pass discipline (`prompts/critic.md`) is what catches the cases where the handoff's assumptions don't hold against the current code. The four hours of pre-work + Critic-pass writing before any Edit-tool call saved a ~6-hour rework cycle plus a deceptive green-tests-but-broken-behavior failure mode. For high-risk diffs, the right order is always: read → Critic pass → scope decision with the user → code. Skipping the Critic pass on the grounds that "the handoff covers it" defeats the discipline.

**Meta-lesson.** Handoffs from prior sessions are point-in-time observations of the codebase, same as memory entries. The codebase moves between sessions (Phase 4 paywall-handler.ts landed 2026-05-11, post-Change-1-design). A handoff written against an older code state can have assumptions silently break. Treat handoffs the same way as memories: verify the load-bearing claims against current code before acting on them.

---

## 2026-05-13 — X replies sent via Grok scan flow are invisible to the engagement-state record unless captured manually

During today's daily X scan triage, Grok flagged @0xAggelos as an A-tier reply target. The recall pass against memory + project files said "compose framing locked, Reddit reply sent 2026-05-08, no X reply logged" — and on that basis I drafted a generic compose pitch. Johan then surfaced screenshots showing TrustBench had in fact already sent **two X replies** on 2026-05-08 (one to @QBTLabs's "practical stack" post, one to @0xAggelos's audit-trail follow-up), neither of which had earned a like, reply, or RT. The recommendation to send a third compose-pitch reply on the same theme was wrong-shape; the right call was to skip and wait for him to engage publicly with anyone on the thread.

**Why the gap existed.** Replies posted via the Grok scan flow → user-side X send don't round-trip back through Claude. They land in @TrustBench's reply timeline on X but nowhere in the project files, memory, or chat history. The competitive-landscape entry, the project memory, and the lessons.md kicked-back-draft note all fell silent on whether the rewritten draft actually shipped. Six days later, the engagement-state record was wrong by omission — and the wrong recommendation rode on it.

**Three carry-forward changes:**

1. **After approving a Grok scan reply, log it the same day** to the relevant `competitive-landscape.md` entry (or create a `## X engagement state` line if none exists) with: target handle, source post date, our reply text in full, view/like/reply/RT counts at time of send. Two-minute write, prevents this exact failure mode.
2. **Daily scan recall pass should explicitly check the "have we replied recently?" question** before drafting, not just the "do we recognize them?" question. Recall pattern: grep memory + competitive-landscape for the X handle AND for the source-post-author handle (they may differ — quote-tweeters, retweeters, replies-to-replies). If either matches a reply in the last 14 days, re-evaluate before drafting another.
3. **Periodic sweep of @TrustBench's replies tab into the daily scan briefing** — once a week, paste the reply timeline into Claude and reconcile against project files. Catches replies that escaped same-day capture. Cheaper than a Twitter API integration and matches the solo-founder calibration (no paid services without explicit approval).

**Meta-lesson.** "I don't have a record of it" ≠ "it didn't happen." When a recommendation depends on the absence of prior outreach, ask the user to spot-check their actual sent record before drafting. The cost of asking is low; the cost of a tone-deaf third-reply-in-a-week to a peer with zero engagement is reputational.

---

## 2026-05-13 — TanStack/Mini-Shai-Hulud worm: lockfile-as-evidence beats signature-based defense

On 2026-05-12 a supply-chain worm hit the TanStack npm release pipeline. 84 malicious versions across 42 packages, all in the router/start/eslint/adapter family, published 2026-05-11 19:20-19:26 UTC. The attacker chained three known vulnerability classes (pull_request_target Pwn Request → GitHub Actions cache poisoning → OIDC token extraction from runner memory) to publish credential-stealing malware *under the legitimate TanStack CI identity*. SLSA provenance attested as authentic — because the CI really did build and publish the tarballs. Maintainer 2FA was on — irrelevant, because no npm token was ever stolen. Tracking issue [TanStack/router#7383](https://github.com/TanStack/router/issues/7383); advisory [GHSA-g7cv-rxg3-hmpx](https://github.com/TanStack/router/security/advisories/GHSA-g7cv-rxg3-hmpx).

TrustBench's exposure was nil: `@tanstack/query-core@5.100.9` and `@tanstack/react-query@5.100.9` are in the `@tanstack/query*` family, which the official postmortem explicitly named as confirmed clean. The router/start family compromise didn't touch query/table/form/virtual/store. Both packages also lacked any `postinstall`/`preinstall`/`prepare` lifecycle hooks AND lacked the IoC fingerprint (`optionalDependencies` entry pointing to `github:tanstack/router#79ac49ee...`). Belt and suspenders.

**Five lessons that survive the incident:**

1. **Lockfile + node_modules mtime predating an attack window is forensic evidence.** The first thing checked was *when* the `@tanstack` dirs were written: `5/11/2026 12:54 PM` local time. That timestamp is data, not just metadata — it bounded the exposure window before any IoC list was public. When a supply-chain incident is breaking, the lockfile + node_modules mtime is the cheapest piece of evidence available; preserve it before doing anything destructive. Do NOT run a fresh `npm install` to "refresh" during an active incident — that destroys the pre-compromise resolution evidence.

2. **SLSA provenance and 2FA are not load-bearing against CI-pipeline hijack.** Both worked exactly as designed and neither caught this. Defending against future variants of this class requires either (a) pinning to versions published before the breach window, or (b) provenance-source-verification — does the tarball actually come from the workflow step that's *expected* to publish it, or from some other step in the same workflow that minted an OIDC token via `id-token: write`? Signature-of-build alone is necessary-but-insufficient. The TanStack postmortem flagged this as the highest-leverage hardening change for them.

3. **IoC fingerprint to watch for in future worms of this class.** An unfamiliar `optionalDependencies` entry pointing to a `github:<org>/<repo>#<sha>` ref in any npm package manifest, where the referenced ref is an orphan commit hosted in the fork network. The Mini-Shai-Hulud payload specifically used `optionalDependencies` because npm silently swallows the failure when the optional dep's `prepare` script exits non-zero — leaving no `node_modules` trace after install. Cheapest detector: `grep -B1 -A3 optionalDependencies node_modules/*/package.json` (or PowerShell `Select-String optionalDependencies node_modules\*\package.json`). Look for `github:` refs to repos with orphan commits.

4. **Cross-session memory freeze worked.** Setting a hard `npm install` freeze in `feedback_*.md` + project state in `project_*.md` + a tight one-line index entry in `MEMORY.md` kept the rule load-bearing across what would have been multiple Cowork sessions yesterday. Scope it to the *specific incident* so it's auditable and liftable, not a generic "be careful with npm" pseudo-rule that drifts into noise. Naming convention that worked: `feedback_npm_install_freeze_tanstack_worm_2026_05_12.md` — domain + action + specific incident + date. Future incident-specific freezes should follow the same shape.

5. **Try a manual lookup before falling back to the watcher cron.** A daily scheduled task pulling GitHub Advisories + WebSearch for the IoC list was the right shape for "wait for external clarity" — but in this case the GHSA was already published 2026-05-11 21:30 UTC by the maintainer team, ~30 hours before the watcher's first scheduled run. Default action when a freeze is set: try a same-day manual `WebSearch` + advisory fetch before scheduling the cron. The watcher is for when the IoC list genuinely isn't out yet, not for when checking takes ten seconds.

The two freeze memory files (`feedback_npm_install_freeze_tanstack_worm_2026_05_12.md`, `project_tanstack_5_100_9_install_state_2026_05_12.md`) are tombstoned 2026-05-13. The `tanstack-worm-ioc-watch` scheduled task is disabled.

---

## 2026-05-12 (Day 6 follow-up) — Validator-green ≠ indexer-required: routeTemplate is the canonical example

Yesterday's lesson ("validator tools are ground truth") got us to 11/11 green at `agentic.market/validate` via FIX-PAYMENT-REQUIRED-HEADER. CDP discovery still 404'd at T+18h with no further movement. Direct read of `node_modules/@x402/extensions/dist/cjs/index-Bw-mGWh6.d.ts` revealed the gap: `routeTemplate?: string` declared as a sibling of `info` + `schema` on `BodyDiscoveryExtension` (line 124), with a documented `isValidRouteTemplate(value)` facilitator-side validation function at line 413+. Optional in the wire-spec type, required for cataloging.

**Why the validator missed it:** the agentic.market validator checks wire-spec conformance, where `routeTemplate?: string` is optional and passes silently when omitted. The indexer separately requires `routeTemplate` to be present + structurally valid before cataloging. The two checks are independent — validator says "your response is a valid x402 v2 PaymentRequired envelope" (true), indexer says "I can't add this to my catalog without a key" (also true).

**Why we didn't emit it:** Express `paymentMiddleware` from `@x402/extensions/bazaar` injects `routeTemplate` automatically from its route-pattern key (e.g. `"GET /weather/:city"` → `"/weather/:city"`). We hand-rolled `paywall-handler.ts` instead of using the official middleware. Our `bazaar-extension.ts` calls `declareDiscoveryExtension(config)` which returns `{ bazaar: { info, schema } }` — no routeTemplate, because that's the middleware's job, not the helper's. The official `bazaar.mdx` example confirms: the routeTemplate appears in the 402 output but is never passed into `declareDiscoveryExtension` directly — the middleware derives it from the route-pattern key.

**Lesson:** when a vendor SDK offers BOTH a middleware (`paymentMiddleware`) AND helper functions (`declareDiscoveryExtension`), the middleware does field auto-injection that the helpers don't. If you hand-roll the middleware, replicate the middleware's injection logic — don't just call the helpers and assume the output is complete. The middleware source is the source of truth; the helpers-only view is incomplete.

**How to apply going forward:**
- For any SDK integration where you handle the middleware layer yourself, read the official middleware source to enumerate every field it injects.
- Don't trust validator-green as sufficient. Validators check wire-spec optionality; indexers/catalogers have additional requirements that don't surface in validator output.
- When debugging "validator says OK but indexer/integration still doesn't work," look at fields declared `?` in the spec type — those are the most common indexer-required-but-validator-optional cases.

Fix shipped 2026-05-12 in commit 9d5c3b5 (`bazaar-extension.ts buildDeclaration` now takes a routeTemplate parameter and injects at the bazaar wrapper level). Validates within 48h via the indexing-watch cron; if CDP still 404 at T+48h, the hypothesis is disproven and we look elsewhere.

---

## 2026-05-12 (Phase 4 Path P) — Validator tools are ground truth; reverse-engineering from observed shapes is third-best diagnosis

The biggest meta-lesson of the day. Spent ~3 hours of session time burning through three sequential hypotheses for why CDP Bazaar wasn't indexing TrustBench's `/route`:

1. **Hypothesis 1: missing `resource.url` on 402 body.** Shipped FIX-RESOURCE. Validator later showed: correct fix, but not the load-bearing one.
2. **Hypothesis 2: missing `resource` on PaymentPayload (X-PAYMENT envelope).** Shipped PaymentPayload-resource update. Validator later showed: also correct + spec-compliant, but not the load-bearing one either.
3. **Hypothesis 3: validator pointed at the actual gap.** `PAYMENT-REQUIRED` response header missing per x402 v2 spec. ONE explicit failed check in the diagnostic checklist, with named field, expected vs actual value, explicit fix instruction. Shipped FIX-PAYMENT-REQUIRED-HEADER. Validator went from "1 check failed" to "Implementation Looks Correct" in one round.

**Why the first two hypotheses ate session time:** I was reverse-engineering from observed indexed-entry shapes (`extensions.bazaar`, `resource.url`, etc.) instead of running our endpoint through the vendor's own diagnostic tool. The validator existed at `agentic.market/validate` the whole time. Johan surfaced it after seeing a Twitter exchange (Nick Prince → Younanix → Infopunks) where Younanix used the same validator to debug their own endpoint.

**Lesson:** when a vendor feature isn't working as expected (CDP Bazaar indexing in this case), search Twitter / Reddit / vendor docs for "validator" / "diagnostic" / "checker" tools from the same vendor BEFORE attempting to reverse-engineer the requirements from observed catalog shapes. The validator tells you exactly what's wrong in seconds. Reverse-engineering is what you do when no diagnostic tool exists, not the default approach.

**How to apply going forward:** for any future Foundation-track or partner-track integration where indexing/discovery is gated on a multi-field wire-shape compliance:
- Search the vendor's homepage navigation for "Seller Tools," "Validator," "Diagnostics," "Checker."
- Search the vendor's GitHub for `validate-endpoint`, `diagnose`, `compliance-check`.
- Search Twitter for `<vendor-handle> validator` OR `<vendor-handle> diagnostic`.
- Check the vendor's footer/docs links for "for sellers" / "for integrators" / "developer tools" pages.
- All of this BEFORE the first hypothesis-driven code change.

The cost asymmetry is significant: each wrong hypothesis today cost a $0.005 settle + 30-60 min wait for indexing decision. Five minutes of vendor-tool search would have caught the right gap on attempt 1.

---

## 2026-05-12 (Phase 4 Path P) — x402 v2 spec has different HTTP header names than v1; PAYMENT-REQUIRED on response is required for catalog scanning

The x402 protocol has TWO header conventions:

- **v1 (legacy):** `X-PAYMENT` (inbound payment payload), `X-PAYMENT-RESPONSE` (outbound settle response)
- **v2 (current spec):** `PAYMENT-SIGNATURE` (inbound), `PAYMENT-REQUIRED` (outbound 402), `PAYMENT-RESPONSE` (outbound settle)

We were emitting nothing on the response (PaymentRequired in body only) AND reading v1 `X-PAYMENT` on the request. The inbound v1 name works fine — CDP's facilitator accepts both for payment verification, and existing real-world agent SDKs send `X-PAYMENT`. The outbound response v1 path (no header at all, just body) does NOT work for Bazaar catalog scanning. Bazaar reads `PAYMENT-REQUIRED` from the response headers, parses it as base64-encoded JSON, and uses that as the canonical PaymentRequired record to index. Without the header, the route is processed for payment but never catalogued.

**Lesson:** when integrating with a v2-spec-aware indexer or facilitator, the response-side header names are load-bearing for indexing. Request-side names have looser tolerance (the facilitator handles both for backward compat). Default to emitting the v2 names on responses while accepting both v1 and v2 names on requests.

**How to apply:** the SDK helper is `encodePaymentRequiredHeader(paymentRequired)` exported from `@x402/core/http`. Implementation is `safeBase64Encode(JSON.stringify(paymentRequired))` — bit-for-bit what CDP scans for, because they ship the same package. Don't roll your own encoder; use the SDK function.

Companion full v2 migration to `PAYMENT-SIGNATURE` on inbound is deferred — non-blocking for indexing, high-risk multi-layer change (server + smoke + real agent SDKs). Take it on as a focused fresh session when the time is right.

---

## 2026-05-12 (Phase 4 Path P) — Postgres JSONB doesn't preserve key order on roundtrip; if you need byte-identical replay, canonicalize at emit

Spent meaningful time on the FIX-S3 bug. `paid_requests.response_body` is `jsonb` (per `phase4-schema-paid-requests.sql:74`). When `persistPaidRequest` writes a JS object via the Supabase JS client, Postgres parses it into JSONB's internal binary form. On read, Postgres re-emits in JSONB's internal key order — NOT the source insertion order. So the receipt sub-object the idempotency replay returned had keys like `{call, issued_at, issuer, kind, paid, receipt_id, routing, version}` while the original S2 emit had source-order keys `{kind, version, receipt_id, issued_at, issuer, paid, routing, call}`. Naive `JSON.stringify(body.receipt) === JSON.stringify(prior.cachedBody.receipt)` fails. The Ed25519 signature was unaffected (JCS-aware verifiers canonicalize before verifying), but the v0.1.1 design had explicitly promised byte-identical replay and the smoke harness checked exactly that.

**The fix:** round-trip the response through `JSON.parse(jcsCanonicalize(...))` before emit. V8's `JSON.parse` returns an object with keys in source order; `jcsCanonicalize` produces lex-sorted JSON; the result is a JS object with lex-sorted keys at every level. Both S2 emit and S3 replay use this, so the receipt sub-object is byte-identical on both. Implemented as `canonicalKeyOrder<T>(obj: T): T` in `paywall-handler.ts:292-332` and applied at the two emission points.

**Lesson:** any storage path that involves JSONB → JS object roundtrip cannot promise byte-identical content unless the emit path explicitly canonicalizes. Don't trust the JSONB column to preserve order even if "all my keys are strings and the values are simple." If you're emitting a hash-or-signed payload AND the receiver does naive byte-equality, canonicalize at emit. If you're emitting where receivers JCS-verify (like all third-party tooling we ship), the bug is silent because JCS handles it.

**Why this was latent until 2026-05-12:** at v0.1.1 ship time, S2 503'd (suspended Infopunks endpoint). S3 depends on S2 success. The first time S2 actually succeeded against a real conformant provider (CMC on Base, after we promoted it to `x402_verified=true`) was 2026-05-12 — and that's when S3 ran for the first time end-to-end and exposed the bug.

**How to apply:** when next adding storage roundtrip of any signed/replayed payload, treat JSONB as "preserves values, NOT key order" and design accordingly. If schema migration is too disruptive, the application-level canonicalize-at-emit pattern from FIX-S3 is the lighter path.

---

## 2026-05-12 (Phase 4 Path P) — High-risk-surface discipline successfully gated three revenue-bearing ships in one session

Three high-risk-surface changes shipped to prod in one session (paywall response shape change, idempotency replay byte-shape change, registry-state mutation) without breakage. The discipline that gated them — per CLAUDE.md "Response Structure for Any Non-Trivial Task":

1. **Read canonical design doc before coding** — `phase4-bazaar-handoff-2026-05-11.md` for FIX-RESOURCE/P1, `phase3-idempotency-design.md` for FIX-S3.
2. **Failure-mode paragraph in code comments** — every diff included a paragraph describing what breaks if the change is wrong + how we'd notice (Railway logs, smoke regression, on-chain mismatch). See `paywall-handler.ts:789-816` (P1), `:360-395` (FIX-RESOURCE), `:292-332` (FIX-S3).
3. **Critic pass in chat before code** — three rejection reasons + counter-thesis + hidden assumption + kill criterion + verdict. Done for FIX-RESOURCE in chat; the kill criterion ("if /route is still not indexed 30min after this fix + fresh smoke, abandon URL-binding hypothesis") fired exactly at T+30 and we pivoted correctly.
4. **tsc --noEmit + full smoke S1-S4 before next ship** — caught nothing today, but the discipline meant we could keep moving fast with confidence.
5. **Decision Journal entries with 90-day check_back** — three entries logged in `decisions.md` with assumption + leading indicator + check_back_date. If FIX-RESOURCE turns out to be wrong, we'll know to look back at this entry.

**Why this is worth a lesson:** the velocity today (three settles, two fixes, no breakage) was sustained because each ship was small, well-bounded, and reversible. Cutting any one of the discipline steps would have either (a) shipped a broken change, or (b) slowed down the next ship by uncertainty about the previous one. The pattern compounds — Ship 3 (FIX-S3) was easier than Ship 1 (FIX-RESOURCE) because we knew the smoke harness + Railway-deploy + on-chain-balance loop was solid.

**How to apply:** when a session has multiple high-risk-surface changes lined up, don't skip the structure even if "the next one is small." The structure is what lets the small ones stay small.

---

## 2026-05-12 (Phase 4 Path P) — Don't trust "facilitator config" docs without reading the package's TypeScript types

The handoff doc and earlier `decisions.md` 2026-05-11 dynamic-routes incident already had a lesson on this. Today reinforced it: spent meaningful time on the URL-binding hypothesis (adding `resource` to 402 body) before realizing the package types reveal `resource` is on BOTH `PaymentPayload` AND `PaymentRequired` (and crucially NOT on `PaymentRequirements`, which is the individual entry in `accepts[]`). The relevant signature is `extractDiscoveryInfo(paymentPayload, paymentRequirements)` — the function the facilitator calls to derive the URL it's cataloging.

Adding `resource` to the 402 body was probably necessary but not sufficient. The hypothesis we should have tested first: `resource` also needs to be in `trustbenchRequirements` (the requirements passed to settle) AND in the X-PAYMENT PaymentPayload (the payload the agent signs over).

**Lesson:** when a hypothesis says "field X is missing for indexing to work," before shipping the fix, grep the package's `.d.ts` for every place X appears. If X is on multiple type definitions, ALL of them probably need the field for the indexer to extract it correctly.

**How to apply:** for the next session's PaymentPayload-resource hypothesis test, read `@x402/core/dist/cjs/mechanisms-*.d.ts` first, find every `resource` reference, document where the field needs to land, and only THEN write the diff. This will save another $0.005 settle round-trip cycle.

---

## 2026-05-11 (OG cards) — Web `BodyInit` wants `Uint8Array<ArrayBuffer>`, not `Uint8Array<ArrayBufferLike>`, and the conversion isn't free

When adding the `/og/:name` route to serve PNG cards from `public/og/`, I tripped over the same TypeScript narrowing error three times in a row before landing the right fix. The chain:

1. Loaded the PNG via `readFileSync(path)` → got `Buffer<ArrayBufferLike>`. Passed to `c.body(body)`. tsc: *"Argument of type 'Buffer<ArrayBufferLike>' is not assignable to parameter of type 'null'."* Hono's `c.body()` overloads fell through to the `T extends null` last overload because Buffer didn't match any earlier one.
2. Switched to `new Response(body, ...)` to bypass Hono's overloads. tsc: *"Buffer<ArrayBufferLike> is not assignable to BodyInit … missing properties from URLSearchParams: size, append, delete, get."* Same family — the DOM's `BodyInit` union accepts only `Uint8Array<ArrayBuffer>`, and Node's Buffer is parameterized on `ArrayBufferLike` (which includes `SharedArrayBuffer`, which `BodyInit` rejects).
3. Changed the loader to `return new Uint8Array(buf)`. Still failing — `new Uint8Array(source)` *inherits* the `ArrayBufferLike` parameterization from the source. Type was `Uint8Array<ArrayBufferLike>`, not `Uint8Array<ArrayBuffer>`.
4. **What finally worked:** allocate by length, then `set()`. `new Uint8Array(buf.byteLength)` returns `Uint8Array<ArrayBuffer>` because the constructor signature for the numeric overload is hard-typed that way. `.set(buf)` copies the bytes in without re-parameterizing.

```ts
function loadStaticBinary(relPath: string): Uint8Array<ArrayBuffer> | null {
  const buf = readFileSync(path.resolve(process.cwd(), relPath));
  const u8 = new Uint8Array(buf.byteLength);
  u8.set(buf);
  return u8;
}
```

**Lesson:** when serving Node-side binary blobs through a Web `Response` (Hono v4, Fetch API, anything that uses `BodyInit`), the correct path is allocate-fresh + `.set()`, with the function and Record types explicitly declared as `Uint8Array<ArrayBuffer>`. The intuitive `new Uint8Array(buf)` doesn't work because it inherits the source's `ArrayBufferLike` parameterization.

**How to apply going forward:** any new route that returns binary content (image, audio, PDF, font, etc.) should use the loader pattern above. Don't try to fight the Hono overloads with casts — `new Response(body, init)` is cleaner and bypasses them entirely.

**Why this is worth a lesson and not just a code comment:** the error message points at the wrong thing ("missing properties from URLSearchParams" is misleading — it's not the URLSearchParams overload that's failing, it's the `Uint8Array<ArrayBuffer>` overload that's silently dropping out of the union because the input is `ArrayBufferLike`-parameterized). Future-Claude will see that error message, search "BodyInit URLSearchParams", and get bad advice. The actual diagnosis is "your Uint8Array is parameterized on `ArrayBufferLike`, not `ArrayBuffer`."

---

## 2026-05-11 (OG cards) — X caches link-preview cards per URL for ~7 days; delete-and-repost reuses the cache

After shipping the new `summary_large_image` cards with per-page `og:image` meta tags, the live HTML was correct (`curl.exe -s https://trustbench.io/methodology | Select-String og:image` showed all 8 expected tags including `summary_large_image` and the right PNG URL), the PNG itself returned `200 OK image/png` from Cloudflare, but a freshly-posted tweet of `https://trustbench.io/methodology` STILL rendered the old small grey-icon card.

Why: X has a per-URL card cache that survives delete-and-repost. Tweeting the same URL again — even after deleting the old tweet — pulls the previously-rendered card from X's cache rather than re-fetching the meta tags. The cache is roughly 7 days but in practice can be sticky longer.

**The workaround that works:** add a harmless query string the route ignores. `https://trustbench.io/methodology?v=1` renders an identical page (Hono ignores unknown query params) but X treats it as a new URL and fetches fresh. The new card rendered immediately when we tried this.

**The workaround that doesn't exist anymore:** X's old Card Validator at `cards.x.com/validator` used to expose a "Preview card" button that force-refreshed the URL's cache. X retired that tool in 2023. There is no manual re-fetch button on X today.

**Lesson:** whenever you change site-wide social-card meta tags AND want previously-shared URLs to render the new card on X, you cannot just redeploy and re-share. You must either (a) post the URL with a fresh query string, or (b) wait roughly a week for X's cache to age out. For high-value posts that were shared with old/empty cards, query-string busting is the only path.

**How to apply going forward:**
- For the autonomous X cron (`scripts/post-to-x.js`), URLs vary across the rotation (`/rankings`, `/methodology`, `/pricing`, `/receipts/...`), so most days are first-touches for X and render the new card fine on first post. No action needed.
- For one-off manual posts of URLs X has likely cached previously (the obvious ones: `https://trustbench.io`, `/methodology`, `/rankings`), append `?v=N` until the new card sticks. Increment N if you want to bust again.
- If we ever want to globally invalidate ALL cached cards on X (e.g. after a brand refresh), the only path is renaming the og:image filenames (e.g. `home-v2.png`) and updating site-chrome.ts. The new tweet still needs a fresh URL though — query-string busting is still needed for previously-shared canonical URLs.

**Why this is worth a lesson:** "delete and re-post" is the obvious first instinct after fixing card meta tags. It doesn't work. Future-Claude (or future-Johan) will hit this exact failure mode the next time site-wide cards change, and the path forward is non-obvious without the cache-cause diagnosis.

---

## 2026-05-11 (end of day) — "Throwaway spike route" doesn't work when the paywall is route-coupled

The original Bazaar listing runbook (`phase4-bazaar-extension-runbook.md` § 2) called for a 30-min pre-commit spike against a throwaway route (`/test/bazaar-spike`) to validate the extension wiring before touching production `/route`. The pattern is sound in principle — test the schema with a tiny example before exposing the full route's schema surface.

It didn't work. `paywallGate` (in `src/paywall-handler.ts`) validates `/route`-specific body fields (the `capability` enum, `max_price`, `payer_address`) BEFORE doing any payment processing. The spike route's `{ message: string }` body fails validation with HTTP 400 (`capability_invalid`), so no settle happens, no CDP cataloging happens, the spike validates nothing.

We only discovered this at end-of-day after the package was installed, the wire-up was written, the 402 wire shape was validated via direct curl, and the smoke harness was run for the first time. The 402 envelope was correct; the request just couldn't proceed past `paywallGate`.

**The architectural finding:** `paywallGate` is misnamed. It's not a generic paywall middleware; it's the body-validation + provider-selection + verify-settle + receipt-build logic for `/route` specifically, mounted as middleware. A real paywall middleware should only do verify+settle and pass the result to the next handler.

**Lesson:** before designing a throwaway-spike pattern around a middleware, verify the middleware is generic. Read the middleware's source end-to-end and look for route-coupled assumptions:
- Does it validate request body fields? (Should be the route handler's job.)
- Does it select downstream services? (Should be the route handler's job.)
- Does it build the response shape? (Should be the route handler's job.)
- Does it return its own 200, or call next()? (Generic middlewares call next() with state in context.)

If any of those are yes, the middleware is route-coupled. A spike against a different route through the same middleware won't actually work without a refactor.

**Pattern to apply going forward:** treat naming as a hypothesis. `paywallGate` SOUNDED generic, but the only way to verify was reading the implementation. Whenever planning to reuse a middleware on a new route, do a 5-min source skim FIRST. The cost of skipping that skim was a wasted spike + a session that didn't reach end-to-end validation. The principled refactor (Phase R-A in `phase4-bazaar-handoff-2026-05-11.md`) is the right fix but it's 4-6 hours of careful surgery on revenue-bearing code — much more expensive than the 5-min skim that would have caught the coupling at design time.

**Pre-existing context this didn't surface:** `phase4-paywall-design.md` § Q-something probably described paywallGate's responsibilities clearly. I designed the spike route without re-reading that doc, on the implicit assumption that "paywall" = generic payment middleware. The lesson is a generalization of: when a doc names what a thing does, re-read the doc before assuming the name maps to the same concept in your head.

---

## 2026-05-11 — WebSearch result snippets can fabricate API surfaces; verify against canonical docs before locking decisions

During the Phase 4 listing research, I dispatched two parallel research agents to investigate the Bazaar extension API and the agentic.market submission flow. Both returned high-confidence findings. One asserted a "dynamic-routes pattern" existed for Bazaar at `github.com/x402-foundation/x402/blob/main/docs/extensions/bazaar.mdx`, and that `declareDiscoveryExtension` took an `info: { name, description, category, ... }` block.

I locked a Decision Journal entry in `decisions.md` 2026-05-11 around the dynamic-routes pattern: "Option A locked: annotate `/route` with the dynamic-routes pattern, rather than a trial route alongside." Drafted a runbook with the `info` block, the `dynamic: true` flag, and a fallback plan in case the dynamic-routes pattern failed to render in Bazaar's UI.

Three hours later, when the user opened the wire-up session, I fetched the canonical CDP Bazaar doc (`https://docs.cdp.coinbase.com/x402/bazaar`). It revealed:
- **No dynamic-routes pattern documented anywhere.** The original WebSearch snippet had conflated runtime pricing (a Bazaar-unrelated x402 feature) with discovery dynamics.
- **No `info` block in `declareDiscoveryExtension`.** The real API takes only `input`, `inputSchema`, `output: { example, schema }`, and `bodyType: "json"` for POST endpoints.
- **Description text comes from the route's separate `description` field**, not from inside the discovery extension call.

I had to grade the Decision Journal entry as `disproven` and re-do significant runbook drafting before the user could start implementation. Total wasted-ish time: maybe 90 minutes across the research and the docs that referenced the wrong shape.

**Lesson:** WebSearch result snippets are summarized by an LLM. The LLM can hallucinate plausible-sounding API details that don't exist in the actual source. Multi-agent research feels rigorous (parallel queries, structured outputs, confidence ratings) but DOES NOT actually verify the underlying claims against canonical sources unless each agent fetches the source itself.

**Pattern to apply going forward:** for any decision that locks an API surface, a wire-shape, or an integration assumption, the canonical source (official vendor docs, official source repo) MUST be fetched and read before the decision goes into `decisions.md`. WebSearch snippets are useful for orientation ("what topics exist, where to look") but NOT for locking API contracts. The verification gate is: "have I read the actual API doc, or am I reading a summary of a summary?"

**Specific anti-pattern to watch:** when a research agent returns "high confidence" on an API surface plus a URL, treat that as a citation to be verified, not a finding to lock. The agent's confidence rating reflects how coherent its synthesis was, not whether the underlying claims survive direct fetch.

**Why this lesson is easy to forget:** research-agent outputs LOOK like primary research. They cite URLs, structure findings into tables, give confidence ratings. The cognitive frame is "the agent did the verification for me." It didn't. It synthesized snippets it could not directly fetch.

---

## 2026-05-11 — When competitor framing shifts, sweep all public-copy surfaces in the same session

During the listing-research session (post-paywall-launch), `competitive-landscape.md` was updated to reclassify Infopunks (pivoted to Pay.sh radar — competition-adjacent on Solana, not pure complement) and explicitly noted: *"The differentiation work (signed receipts, on-chain evidence) needs to be sharp in public copy BEFORE P4-3 ships — not retrofitted at the moment of collision."*

I read the update, sharpened `phase4-submission-packet.md` + the runbook's `info.description` reference, and almost stopped there. A follow-up grep surfaced two more public surfaces still using the old "routing and policy layer" framing: `.well-known/trustbench.json`'s top-level `description` and `skill.md`'s h1 + opening paragraph. Both are catalog-crawler-readable. Without the follow-up sweep, the Bazaar listing card would have presented sharpened framing while the agentic.market crawler's parallel fetch of `.well-known/trustbench.json` would have shown the weaker "policy layer" framing — inconsistent discovery surface.

**Lesson:** when a strategic doc updates competitor framing or positioning, the same-session sweep MUST include every public-copy surface — not just the immediate artifact in flight. The discoverable surface area is bigger than it looks because catalog crawlers, LLM agents, and humans all scrape different surfaces in parallel. One sharpened doc + several un-sharpened siblings = mixed discovery surface = adversaries (or just confused crawlers) can cherry-pick whichever framing weakens our positioning.

**Pattern to apply going forward:** after any edit to `competitive-landscape.md`, `partnership-day-record-*.md`, or any other strategic-positioning doc, immediately grep for the OLD framing phrases across all of: `.well-known/`, `skill.md`, `llms.txt`, `README.md`, `src/landing-html.ts`, `src/methodology-html.ts`, `src/pricing-html.ts`, `src/rankings-html.ts`, `scripts/post-to-x.js`. Sweep before declaring the strategy-update done. Then update memory to capture the new positioning phrases so future-Claude doesn't drift back.

**Specific phrases to watch (this iteration):** the moat is **"signed receipts + on-chain evidence + fail-safe paywall"**, framed as **"evidence rather than opinion"**. The phrase to be suspicious of is **"policy layer"** — kept as an SEO trigger in skill.md's frontmatter description but never the primary positioning anymore.

**Why this lesson is easy to forget:** sharpening one artifact feels like completing the strategic update. The dopamine hit happens at the first edit. The remaining sweep work is unglamorous and easy to defer to "next session" — which means the inconsistency leaks into the public discovery surface for days or weeks.

---

## 2026-05-11 — Paywall's refusal-to-charge under provider failure is the validation, not the bug

During the v0.1.0 prod paywall smoke (Step 7 of the night's push-through), S2 returned 503 `provider_payment_requirements_unavailable` instead of the expected 200 + signed routing receipt. First instinct was "the smoke failed." After curl-ing the selected provider directly, the real cause was: `infopunks-cognition-layer-x402.onrender.com` had been **suspended-by-user** on Render sometime between P4-1b (2026-05-06) and now. The Render routing header `x-render-routing: suspend-by-user` confirmed it was deliberate, not a cold-start.

The paywall middleware did exactly what it should have:
1. Selected the top-ranked `data` provider from the registry
2. Live-probed it to extract the merchant's `accepts[0]`
3. Probe returned 503 from the provider's host
4. Refused to charge the agent → returned 503 to the caller before any facilitator settle call
5. Agent's wallet nonce unburned, no money moved on-chain

This is the strongest possible non-custodial-property test we could have run — proving the paywall **fails safe** when the upstream provider is non-conformant or unreachable. The "successful happy path" (paid call returns a signed receipt) wasn't validated tonight, but the "successful failure path" (agent isn't charged for unfulfilled work) was.

**Lesson:** when a paywall smoke fails, distinguish between *paywall correctness bugs* (would charge incorrectly, would skip security checks, would leak data) versus *registry-conformance failures* (paywall correctly refused). The former blocks launch; the latter is a registry-curation follow-up. The 503 we got was the latter — paid_requests row never written, on-chain transfer never submitted. Treat it as a positive signal about the middleware, not a failure of the launch.

**Carry-forward implications:**
- The error message in `paywall-handler.ts` was misleading ("has no pay_to address recorded"). Fixed in the same session to surface "did not return a parseable x402 challenge to the live probe; agent wallet is unaffected" plus the actual provider URL and probable cause list. Future operators can diagnose faster.
- v0.2.0 registry-curation needs to treat HEAD-probe liveness as a *necessary-not-sufficient* signal for x402-conformance. Add a periodic full-request POST probe that actually validates the merchant returns a parseable v2 `accepts[0]`. Score down providers that fail this check.
- The smoke script's hardcoded capability choice (`data`) needs to be configurable via env var or CLI arg so the next provider-conformance test can target a known-working endpoint without code edits.

---

## 2026-05-11 — Foundation facilitator at x402.org is testnet-only; Base mainnet paywall needs CDP creds

While running the § 1.3 settle-test pre-flight, the public Foundation facilitator at `https://x402.org/facilitator` returned:

```
unexpected_error: No facilitator registered for scheme: exact and network: eip155:8453
```

That's the Critic-pass hidden assumption firing on day 0. The kill criterion I wrote was "If the public Foundation facilitator returns 5xx or rate-limits more than 5% of paywall calls in the first 4 weeks → switch to Coinbase CDP." It fired immediately, not in 4 weeks.

**Root cause:** the SDK README example (`new HTTPFacilitatorClient({ url: 'https://x402.org/facilitator' })`) was illustrative, not a Base-mainnet-capable production endpoint. Per CDP docs "Facilitator URLs" table, x402.org is testnet-only (Base Sepolia + Solana Devnet). Production Base mainnet requires Coinbase CDP at `api.cdp.coinbase.com/platform/v2/x402`, which needs JWT auth via CDP API key.

**Fix:** `npm install @coinbase/x402` and import its pre-built `facilitator` config:

```typescript
import { facilitator as cdpFacilitatorConfig } from '@coinbase/x402';
const client = new HTTPFacilitatorClient(cdpFacilitatorConfig);
```

The `@coinbase/x402` package reads `CDP_API_KEY_ID` + `CDP_API_KEY_SECRET` from env, signs an Ed25519 JWT per request (2-min expiry, regenerated automatically), and routes calls to the CDP facilitator. Both `src/paywall-handler.ts` and `scripts/facilitator-settle-test.ts` now branch on the presence of CDP env vars: CDP path when set, Foundation fallback when unset (with a loud `console.warn` documenting that the fallback is testnet-only).

**Lesson:** **don't assume a URL works just because it's in an SDK README example.** When the SDK quickstart shows a URL, hit its `/supported` endpoint to confirm which `(scheme, network)` tuples it actually handles before building production architecture around it. The Critic-pass kill criterion is what saved us here — the discipline of writing "what would kill this" up front meant the day-0 failure mapped to a documented recovery path instead of a surprise.

**Carry-forward implications:**
- The Critic pass works. Three rejection reasons + a load-bearing assumption + a kill criterion was the right shape — not vague pessimism. Run it on every high-risk-surface diff going forward.
- CDP creds are a non-negotiable for v0.1.0 paywall. The runbook (Step 2) and `.env.example` now reflect that.
- Future hidden assumptions: anywhere an SDK README example URL has substituted for "production-grade endpoint," verify with the `/supported` endpoint before relying on it.

---

## 2026-05-11 — Critic pass caught a "stale DB column" bug in the paywall handler

While writing the v0.1.0 paywall handler (`src/paywall-handler.ts`), I drafted `buildProviderPaymentRequirements` to look up `providers.pay_to` from the database. The Critic pass surfaced the bug before I shipped: `providers.pay_to` is `null` for the dominant Agentic Market crawler path (`crawler.ts:152`) because Agentic Market does not expose payTo on its catalog. The existing Bearer `/route` flow learns pay_to via a LIVE 402 probe at request time (`route-handlers.ts probeFor402Challenge`). My paywall handler would have 503'd for the vast majority of providers in production.

**Fix:** Exported `probeFor402Challenge` + `loadProbeConfig` from `route-handlers.ts` and reused them in the paywall handler instead of querying the DB. The paywall now does the same live-probe-then-extract-accepts[0] flow the Bearer chain has done since Phase 3.

**Lesson:** **before reading a DB column, check whether the production-shape data is actually there.** "There's a column, therefore data" is wrong for nullable columns whose primary writer doesn't populate them. The crawler.ts comment at line 152 (`// Agentic Market does not expose payTo on the catalog row; we learn it via the live 402 probe`) was the load-bearing piece of context I missed on first draft. The Critic discipline forced re-reading the crawler to verify rejection reason #2 was real, which is exactly the kind of "trust but verify" sweep the prompt is designed to provoke.

**Carry-forward implications:**
- Any future paywall feature (`/score-provider`, `/verify`, `/audit-replay`) that needs provider-side data should default to live-probing, not DB lookup, until/unless we add a "is this column reliably populated" annotation to the schema.
- The Critic prompt at `prompts/critic.md` worked exactly as designed — it surfaced a specific, named, verifiable bug that nearly shipped. Keep running it on every high-risk-surface diff; do not be tempted to skip "because the code looks fine."

Critic verdict (initial): weak-reject. Acceptable to ship behind `TRUSTBENCH_PAYWALL_ENABLED=false`, NOT acceptable to flip the flag until two v0.1.1 follow-ups land: (a) per-paying-wallet rate limit to substitute for the spend caps the X-PAYMENT branch bypasses, (b) `replay: true` field inside the cached receipt body so signed receipts copied out of logs can be distinguished from fresh ones.

**Both gates closed same session (2026-05-11).** Rate limit shipped as `countRecentPaidRequests` + 429 branch in `handlePaidRoute` step 4b (default 60/hour, env-tunable `TRUSTBENCH_PAYWALL_HOURLY_LIMIT`). Replay marker shipped as `replayed_at` field added OUTSIDE the signed bytes at the idempotency-cache return site. Smoke S3 updated to validate both. Verdict upgraded to **acceptable**. Hidden assumption + kill criterion remain in force.

Critic log lines:
- `2026-05-11: Critic pass on paywall v0.1.0 — verdict weak-reject — hidden assumption: x402.org/facilitator stable + within free-tier for v0.1.0 volume.`
- `2026-05-11: v0.1.1 follow-ups landed same session (rate limit + replayed_at marker); verdict upgraded to acceptable.`

---

## 2026-05-11 — Silent Supabase write failures (prober probes table empty for weeks)

Surfaced while preparing the Paddock 7-night rollup CSV. Local query showed `probes` total = 0 despite GitHub Actions nightly pipeline runs being green for the last 5 nights (May 7-11, 9-14 minutes each, all probing 1000 endpoints to completion). Same Supabase project as prod (`lmblvvbegscwqzzsldmg.supabase.co`), service_role key correct (scorecards upserts landing fine, 1280 rows, fresh `last_updated`).

**Root cause:** `interface ProbeSample` included a `capability` field that doesn't exist in the `probes` table schema. Supabase rejected every insert with "column 'capability' does not exist" — but `await supabase.from('probes').insert(results)` discarded its return value, so the error never surfaced. CI saw no exception → green run. Probes table accumulated zero rows since this version of the prober shipped.

**Why scorecards survived:** the scorecards table *does* have a `capability` column, and the upsert object's shape matches it. Same key, same project, different table — the schema-shape was the only difference. So the bug was probes-specific even though both writes used the same client.

**Fix:**
1. Removed `capability` from `ProbeSample` (it was never read downstream anyway — capability is read off the provider row at scoring time).
2. Added `const { error } = await ...insert(...); if (error) throw error;` on both the probes insert and the scorecards upsert. Better to fail loud than silently accumulate zero data.
3. Annotated the `ProbeSample` interface with a "MUST match table columns" comment so future drift gets caught at code review.

**Lesson:** **never discard Supabase client return values on writes.** RLS denials, schema mismatches, and constraint violations are all returned via the `error` field — they do not throw. A silent green run does not mean data landed. Audit every `.insert()`, `.upsert()`, `.update()`, `.delete()` call in the codebase the moment you add a new write site. Same pattern as the high-risk-surface self-review checklist: "what's the worst this could do if I got the wire shape wrong, and what would the failure mode look like?" Here the failure mode was invisible until a partner-facing deliverable (7-night CSV for Paddock) made it impossible to ignore.

**Carry-forward implications:**
- The probes table will start populating tomorrow at 03:00 UTC after the fix deploys. The 7-night rollup CSV for Paddock can only carry today's-run data until 7 nightly runs accumulate (next true 7-night view: 2026-05-18 onward).
- `/analytics` historical trend visualizations (if any) were also blank; check whether they rendered correctly with empty data or just hid the chart.
- Audit the rest of the codebase for the same swallowed-error pattern. The receipt-emission path is already error-checked (per Phase 3 closeout), but worth a sweep through paid-probe.ts, route-handlers.ts, crawler.ts, and the spend-cap reservation code.

---

## 2026-05-06 — Defensive URL-path filter for Solana (P4-1d-heurist follow-up)

Smoke against the Heurist crawler surfaced 92 mistagged rows: Agentic Market lists some `mesh.heurist.xyz/x402/solana/agents/*` URLs as Base (`metadata.networks=['base']`), but they're actually Solana endpoints. Trusting upstream metadata alone left them in /rankings as Base, where routing to them would 502 at quote time.

**Fix:** `scorer.ts` filter now also drops rows whose URL contains `/x402/solana/`. The path segment is unambiguous (it's part of Heurist's URL design, only appears on actually-Solana endpoints) and overrides any upstream metadata. Cache key bumped v3 → v4 so the filter takes effect immediately rather than waiting on Redis TTL expiry.

**Lesson learned:** when a registry source delivers metadata that contradicts the URL itself, **trust the URL when it carries unambiguous evidence**. The `/x402/solana/` path is structurally guaranteed by Heurist; the `networks` array is just a label that can drift. This is the same pattern as "trust the chain, not the merchant" from P4-1b — multiple signals in agreement is stronger than any single signal alone.

**Carry-forward:** if a future crawler source delivers Heurist or any Solana-only catalog with mistagged metadata, the URL-path check catches it. If a non-Heurist provider somehow uses `/x402/solana/` in a Base-network URL, the filter would over-block — accepted trade-off (no such case observed; defensive narrow check).

**Smoke after fix (post-cache-bump):**
- search: 11, inference: 140, data: 532, media: 266, infra: 46 routable Base endpoints (~995 total)
- Plus 52 Solana endpoints stored but filtered until P4-3
- 0 Solana leaks on every capability via the precise `/x402/solana/agents` URL check

`src/server.ts` got deleted in the same commit (it was a stale carry-forward stub causing one of the four pre-existing tsc errors). Now down to 3 carry-forward errors.

---

## 2026-05-06 — Heurist Solana mesh crawler implemented (registry coverage, P4-3 prep)

Same-day pickup. Per re-ranked agenda (`project_zauth_and_post_p4_7_agenda.md`), Heurist Mesh as 4th crawler source after Agentic Market + verified seed (Paddock import is still pending). Adds ~150 Solana x402 endpoints to the registry as pre-work for P4-3 (Solana settlement) — store now, expose when settlement ships.

**What shipped:**
- `src/crawler.ts` — new `crawlHeurist()` function that fetches `https://mesh.heurist.xyz/x402/solana/agents` and stores one row per (agent, tool) pair. Capability mapping helper `inferCapabilityForHeuristTool()` classifies via agent + tool keywords (video → media, twitter/news/search → search, ask/research/health → inference, default data). USD prices converted to USDC atomic units for `metadata.price_atomic_observed`. Wired into `crawlBazaar()` between Agentic Market and verified seed.
- `src/scorer.ts` — Solana network filter in `getRankings()` projection. `filteredProviders = providers.filter(p => !p.metadata.network || p.metadata.network === 'base')`. Drops Solana entries from /rankings AND from /route (via `selectProvider` calling `getRankings`). Legacy rows without explicit `network` metadata are treated as Base — backward-compat with everything Agentic Market and verified seed have inserted.
- `phase4-heurist-crawler-smoke.md` — E1-E7 smoke runbook covering crawler success, DB row population, /rankings filtering, /route filtering, P4-3 simulation by temporarily removing the filter, capability mapping spot-checks, USD → atomic conversion sanity.

**Engineering decisions worth keeping:**
- **Filter at projection time, not at insert time.** Heurist rows live in the DB; one filter line in `scorer.ts` hides them. When P4-3 ships Solana settlement, removing that filter exposes ~150 endpoints instantly with no re-crawl, no data migration. The pre-built registry is itself a partnership / Mindshare-outreach signal ("we have N Solana endpoints indexed; routing comes with P4-3").
- **Per-tool capability classification, not per-agent.** A single Heurist agent can have tools across multiple capabilities (e.g. TokenResolverAgent has both search-style lookup tools and data-style profile tools). Classifying per-tool keeps each row's `capability` accurate. Heuristic falls back to `data` for the bulk — correct for Heurist's analytics-heavy catalog.
- **Network treated case-insensitively, default 'solana'.** Heurist always emits `"network": "solana"` today; lowercase normalization + default-to-solana is defensive against future shape changes.
- **Pricing stored even though Solana settlement not live.** Heurist quotes USD ($0.001-$0.25); convert to USDC atomic (6 decimals) for consistency with Base entries. Rough approximation — Solana actual settlement uses SPL-USDC and the conversion may differ slightly. Stored as observed signal; live 402 probe at quote time will be authoritative when P4-3 ships.

**Carry-forward state:**
- `npm run crawl` will now populate ~150 Heurist endpoints alongside Agentic Market + seed. Nightly cron (`.github/workflows/nightly-pipeline.yml`) picks it up automatically.
- The Solana filter in scorer.ts is a one-line remove when P4-3 lands — search for "P4-1d-heurist" comment.
- Net impact on `/rankings` and `/route` is **zero** — Heurist rows are filtered out. Prod registry inventory just grew by ~150 rows quietly.
- The `/rankings` page doesn't surface "network" today, so even if Solana filtering were removed, there'd be no visible network distinction. Future polish: add a network badge to the rankings table when P4-3 ships.

**Next sprint piece per re-ranked agenda:** Bankless Mindshare outreach (after Infopunks amplifies), DNS + BASE_URL flip (ops, ~30 min), Paddock DM (comms, draft ready).

---

## 2026-05-06 — `/rankings` Tailwind polish implemented (P4-2 second delivery)

Same-day pickup after receipt HTML rendering. Per the Zauth-complementarity strategic read, structural parity with their UI without competing on data breadth — TrustBench has the registry it has; making it look credible compounds every share, every link unfurl, every partner inspection.

**What shipped:**
- `src/rankings-html.ts` (new, ~330 lines incl. inline CSS + ~30 lines of vanilla JS for filter/search). Renders capability tabs (5-cat: search/inference/data/media/infra), filter pills (All / Verified x402 / Coinbase 1P / Coinbase 3P), search input, sortable table with score color-coding and verified badges, mobile-responsive layout.
- `src/index.ts` — `/rankings` handler now does Accept-header content negotiation. JSON contract unchanged. Cache-Control set to 300s (rankings change once per nightly probe pass; aligns with Redis TTL in scorer.ts).
- `phase4-rankings-html-smoke.md` (new) — R1-R8 smoke runbook covering JSON regression, HTML render, capability tabs, filter pill toggles, search, format overrides, empty state, and dependent-route regression (`/analytics`, `/route` legacy GET, `/rankings/paid`).

**Engineering decisions worth keeping:**
- **`preferHtml()` is shared between `/rankings` and `/receipts/:id` via function-declaration hoisting.** Defined once at file scope in `src/index.ts` (right above /receipts/:id), used from both routes. No helpers module yet — extract only when a third route adopts the pattern.
- **Server-side capability tabs, client-side filter pills.** Tabs are real `<a>` links that re-fetch with `?capability=X` — bookmarkable, shareable per capability. Filter pills are client-side JS toggles that hide rows in-page — no round-trip on filter changes. Right boundary: tab semantics imply server-state; pill semantics are pure client-side UI.
- **Filter row visibility via `style.display`, not CSS classes.** Each row has independent visibility from the active pill AND the search box. Combining via classes gets fiddly when both filters are simultaneously active. Direct style is cleanest for the compose case.
- **Static sort, no click-to-sort.** Default sort is score-desc (matches JSON order); click-to-sort would add JS complexity for low marginal value at current data volume. Easy to add later if real users ask.
- **Mobile-responsive table via CSS-only re-layout.** Below 720px, the table renders as stacked cards with `:before` pseudo-elements showing field labels. No JS, no separate mobile component.

**Carry-forward state:**
- `/rankings?capability=search` (and the four sibling capabilities) now serve a polished HTML page when opened in a browser. Same URL serves JSON to programmatic clients via Accept header.
- The two HTML pages now live in prod: `/receipts/:id` and `/rankings`. Both share visual aesthetic with `/methodology`. Eventually worth extracting a shared style fragment / template; not yet justified.
- Next sprint piece per re-ranked agenda: Heurist Solana mesh crawler addition (~½ day). Then Mindshare outreach after Infopunks amplifies.

---

## 2026-05-06 — Receipt HTML rendering implemented (P4-2 first delivery)

Same-day pickup after P4-7 shipped. Per the parallel-convo re-rank ("rcpt_01KQY7C44GAPSXZPFQYRZ1D10C is already public; making it credible compounds every share"), receipt HTML rendering was the next sprint piece.

**What shipped:**
- `src/receipt-html.ts` (new, ~280 lines) — in-process Ed25519 signature verify (mirrors `scripts/verify-receipt.js verifyEnvelope` but uses `getPublicKeyPem()` directly, no HTTP round-trip), in-process on-chain verify (mirrors `verify-receipt.js verifyOnChain` against Base RPC), per-receipt-id verification cache (immutable receipts → cache forever), full HTML renderer with dark theme matching `/methodology`.
- `src/index.ts` — `/receipts/:id` handler now does content negotiation. `Accept: text/html` (+ `?format=html`) → polished HTML. `Accept: application/json` (default) → unchanged JSON. JSON contract is byte-identical for every existing programmatic client.
- `phase4-receipt-html-smoke.md` (new) — H1-H6 smoke runbook covering JSON regression, HTML render, query-param overrides, on-chain badge, tampered-receipt red badge, pre-closeout-#3 backward compat.

**Engineering decisions worth keeping:**
- **Use the in-memory public key, not HTTP self-fetch.** `getPublicKeyPem()` returns the PEM in-process. Fetching `signature.public_key_url` from our own server is a self-loop with DNS dependency for no benefit. The third-party verifier in `verify-receipt.js` round-trips because it doesn't trust us; we do.
- **Cache verification results by receipt_id forever.** Receipts are immutable per `receipt-generator.ts` (signed at issue time, never re-signed). Once verified valid, the verdict can't change. Process-lifetime in-memory `Map` is sufficient; restart re-verifies on demand. ~5ms subsequent renders vs ~200-500ms first render with chain RPC.
- **Strict content negotiation.** HTML only when `Accept` lists `text/html` AND does NOT list `application/json`. `*/*` and absent Accept default to JSON. Preserves every existing programmatic client byte-for-byte. `?format=html` and `?format=json` are unambiguous escape hatches.
- **Three-state badges (green/red/amber).** Green = verified. Red = active mismatch (tampered or chain-mismatch). Amber = unavailable/transient (HMAC fallback mode, RPC unreachable). Page renders even when chain RPC is down — soft failure.
- **Defensive HTML escape on every dynamic field.** `capability` and `idempotency_key` come from agent input. Static labels and addresses don't strictly need it but the helper is cheap.

**Operational notes worth keeping:**
- **Cache invalidation requires server restart.** The tamper-test smoke (H5) needs a dev-server restart between tamper and reload, otherwise the previous green verdict is still cached. This is correct behavior — production receipts are immutable, no invalidation needed in normal operation.
- **File-tools-vs-bash gotcha bit again.** Running `npx tsc --noEmit` from the bash sandbox returned "Unterminated template literal" at line 470 of `src/index.ts`. The bash mount was on a stale 09:20 version (truncated mid-file); the Windows-side file is complete. Verification must use PowerShell `npm run typecheck`. Lesson re-confirmed: **do not trust bash-side tsc for verification on freshly-edited files**.
- **OG/Twitter card tags included.** Receipt page emits `<meta property="og:type">`, `og:title`, `og:description`, `twitter:card` — so when the URL is shared in a social platform that does unfurling, the card carries TrustBench branding + a factual one-liner ("$0.01 USDC settlement for search routed by TrustBench. Signature verified. On-chain confirmed."). Distribution-positive.

**Carry-forward state:**
- The receipt URL `https://trustbench-production.up.railway.app/receipts/rcpt_01KQY7C44GAPSXZPFQYRZ1D10C` will render the polished HTML page once this code deploys. Same URL, same id; existing `verify-receipt.js` script unaffected.
- Next sprint piece per re-ranked agenda: `/rankings` Tailwind-style polish with content negotiation (P4-2's sister piece). Same single-file Hono pattern; structural alignment with Zauth.inc's UI without competing on data breadth.
- Then: Heurist Solana mesh crawler addition + Mindshare outreach.

---

## 2026-05-06 — P4-7 reservation caps SHIPPED IN PROD (smoke green, flag flipped)

**Update later same day:** smoke C1-C4 + B1 + B4 ran live against the dev server + mock provider, all green. Highlights:

- **C1 PASS** — pending debited to 10000 (max_price), not 1000 (merchant quote). Conservative pre-check rule preserved.
- **C2 PASS** — pending → 0 at settle, `pending_released_at` marker set, receipt records actual settled amount (1000), not reservation amount.
- **C3 PASS (load-bearing)** — 3 concurrent quotes against `2 × max_price` cap → exactly 2 succeed + 1 `rolling_cap_exceeded`. **Phase 3 race is closed.**
- **C4 PASS** — manual sweep call released 1 expired quote, decremented pending. Plus the autonomous in-process sweep timer caught a separately-expired quote during B4 setup at the 60s tick boundary — bonus real-data validation that the timer runs as designed.
- **B1 PASS** — replay returned same `route_id` with `x-idempotent-replay: true` header AND pending stayed at 10000 (no double-debit). The idempotency layer correctly skips the spend-cap middleware on replay, which is the load-bearing reservation/idempotency contract.
- **B4 PASS** — expired-quote settle returned 410 `route_id_expired`.
- **Boot-time bonus**: when the dev server first started with the flag on, the sweep released 36 stale quotes from prior runs. Smoke pass on real-shaped data without hand-priming.

**Railway flag flip:** `SPEND_CAP_RESERVATION_ENABLED=true` added to Railway Variables (was missing — Railway only auto-imports env vars at first repo connect, not on later `.env.example` additions; no commit needed for env vars). Boot log confirmed:
```
2026-05-06T10:03:49Z  [pending-sweep] starting (interval=60000ms)
```
P4-7 is the active code path in production from this moment. Documented Phase 3 race is closed in prod.

**External signal in same log window:** several HEAD requests on `/receipts/rcpt_01KQY7C44GAPSXZPFQYRZ1D10C` at ~10:05. Possible Infopunks amplification, possible crawler, possible link-checker. Worth checking partner channels before launching receipt-HTML-rendering — if amplification is live, the polished render compounds every share.

**Next sprint per re-ranked agenda (Zauth intel + parallel-convo follow-ups):** Receipt HTML rendering with content negotiation on `/receipts/:id` — `Accept: text/html` returns polished HTML, `Accept: application/json` unchanged. Same single-file Hono + inline CSS pattern as `/methodology`. Highest-leverage post-P4-7 polish item per the strategic re-rank.

---

## 2026-05-06 — P4-7 reservation caps landed (code-only; smoke deferred to next live session)

**What shipped:** strict reservation-based spend caps (P4-7). Atomic `claim_spend_reservation` RPC at quote time, `release_spend_reservation` at settle, `sweep_expired_reservations` on a 60s in-process timer, `refund_pending_reservation` for compensating refunds when quoteHandler aborts after pending was debited, `reconcile_pending_spend` for daily ground-truth recompute. Behind `SPEND_CAP_RESERVATION_ENABLED` env flag for canary.

**Two-signal validation that bumped this from deferred-bottom (recap):** Infopunks's "audit tail is where teams slip" framing + CLU_AGENT's "per-call timeout reversion" reply on 2026-05-06.

**Files touched:**
- `phase4-schema-spend-cap-reservation.sql` (new, standalone migration for Supabase SQL editor)
- `phase3-schema.sql` (+migration block + 5 functions appended; cumulative source of truth)
- `src/spend-caps.ts` (rolling-cap branch now calls `claim_spend_reservation` RPC; legacy JS check kept as fallback when flag is off OR when RPC errors)
- `src/route-handlers.ts` (refund helper + 6 error-path refund calls in quoteHandler; release call in settleHandler before merchant fetch; diagnostic-log cleanup from P4-1b debug session bundled in same diff)
- `src/pending-sweep.ts` (new, 60s self-rescheduling timer; no-op when flag is off)
- `src/index.ts` (mounts `startPendingSweep()` after server boot)
- `.env.example` (`SPEND_CAP_RESERVATION_ENABLED=false` default)
- `phase4-smoke-c1-c4.md` (new, runbook in phase3-closeout.md A1-A5/B1-B4 format)
- `scripts/smoke-c3-concurrency.ts` (new, dedicated harness for the load-bearing concurrency case; `npm run smoke:c3`)
- `package.json` (smoke:c3 script)

**Engineering decisions worth keeping:**

- **Type mismatch is intentional.** Cap columns (`spend_cap_*_atomic`) are TEXT — read once into JS BigInt, never SQL-arithmetic'd. `pending_spend_atomic` is NUMERIC(78, 0) because the reservation logic NEEDS atomic SQL-side arithmetic in the conditional UPDATE WHERE clause. Future-me: do not "normalize" by changing one or the other.
- **The conditional UPDATE is the load-bearing piece.** Postgres serializes UPDATEs on the same row, so two concurrent quotes at the cap edge can't both pass — the first commit raises pending, the second's WHERE evaluates against the new pending and rejects. C3 smoke is the test that proves this.
- **Refund-on-abort vs reconciliation-only.** Picked refund-on-abort in quoteHandler (compensating UPDATE on every error path that runs after the middleware debit). Daily reconciliation is the backstop, not the primary path. Reasoning: leak window goes from ≤24h to near-zero in the common case; the 6 inline `refund_pending_reservation` calls are cheap and explicit.
- **Release before merchant fetch, not after.** Trade-off: pending under-counts spend during the merchant-call window (cap briefly over-allocated). Accepted because the alternative — slow merchants holding reservation budget across 30s timeouts — is worse for tight caps. Documented in `phase4-spend-caps-reservation.md` § Failure-mode analysis and in the failure-mode comment at the top of `src/spend-caps.ts`.
- **RPC-error fallback to JS check.** When `claim_spend_reservation` errors (function not deployed, DB unreachable, etc.), spend-caps.ts logs loud and falls through to the legacy JS check rather than 503'ing every quote. Soft-failure beats hard-failure for the canary deploy.
- **Sweep is in-process, not a separate cron.** Solo-founder lens: zero new infrastructure, no extra workers. Self-rescheduling setTimeout (not setInterval) so a slow sweep doesn't overlap itself. If Railway restarts, the next boot picks up on the same 60s cadence.
- **No new spend_log table, no new receipt fields.** The receipts table stays the source of truth for settled spend. `pending_spend_atomic` is internal bookkeeping. `receipt-spec-v1.md` does not change → existing scorecard / receipt signatures stay valid forever. This was the most important constraint to honor.

**Operational notes worth keeping:**

- **Smoke deferred to next live session.** This session implemented + tsc-verified the code; live C1-C4 against running dev server + mock provider was not run because the smoke environment isn't booted in the implementation session. Runbook is in `phase4-smoke-c1-c4.md`. C3 (concurrency) is the load-bearing test — green = race fixed, red = WHERE clause too loose. Run before flipping `SPEND_CAP_RESERVATION_ENABLED=true` in Railway prod.
- **Apply order:** schema first (Supabase SQL editor: paste `phase4-schema-spend-cap-reservation.sql`), then deploy code, then flip the env flag. Reverse order = old code calling new functions = log noise but not a breach (RPC fallback to JS check). Forward order = clean canary.
- **`tsc --noEmit` carry-forward errors persist.** 3 `@supabase/realtime-js` → `@supabase/phoenix` errors and the stub `src/server.ts` default-import error from earlier sessions. P4-7 added zero new typecheck errors.

**Carry-forward state:**

- All P4-7 code lives behind `SPEND_CAP_RESERVATION_ENABLED=false` by default, so a deploy without the flag is a strict no-op. Flip from Railway dashboard once schema is applied + smoke runs green.
- Daily `reconcile_pending_spend()` cron not yet wired — currently a manual call. P4-7-cron is a small follow-up after the canary stabilizes.
- The diagnostic logs in `settleHandler` (X-PAYMENT envelope dump, response headers/body dump, 402 rejection body) from the P4-1b debug session were removed in the same commit. The lighter `[settle] →` and `[settle] ← status=` lines stayed.

**Next sprint:** trustbench.io DNS CNAME + flip BASE_URL back to canonical (independent deploy, ≤30 min); then refine + send the Paddock DM (now unblocked — Reddit thread context loaded, matrix-axes captured); then P4-7 daily-cron wiring (small) before P4-2 receipt explorer.

---

## 2026-05-04 — Phase 3 closed

**What shipped (verified end-to-end against the local mock x402 provider):**

- Authenticated `POST /route` (quote) with API-key auth (argon2id), idempotency keys, hard spend caps
- `POST /route/settle` (settle) with Ed25519-signed receipt issuance
- `GET /receipts/:id` public, immutable audit endpoint
- Reference verifier (`scripts/verify-receipt.js`) with `--pubkey-url` and `--check-chain` overrides
- `block_number` plumbed through schema → receipt envelope → DB column
- `scripts/paid-probe.ts` for budgeted internal probing ($20/mo cap), wired to GitHub Actions cron every 4 hours
- README rewritten with Phase 3 framing, verifier docs, failure semantics, and explicit Phase 3 limits

**What's measured:**

| Test | Result |
|---|---|
| A1 fresh quote → 200 + EIP-3009 challenge | ✅ |
| A2 settle → Ed25519-signed receipt persisted | ✅ |
| A3 audit → byte-identical envelope, 24h-immutable cache | ✅ |
| A4 verify → SIGNATURE VALID via standalone verifier | ✅ |
| A5 tamper → SIGNATURE INVALID on a single-byte change | ✅ |
| B1 quote replay → cached 200, no merchant hit | ✅ |
| B2 body mismatch → 409 `idempotency_key_reused_with_different_body` | ✅ |
| B3 settle replay → cached receipt, no double-charge to merchant | ✅ |
| B4 quote expiry → 410 `route_id_expired` (server-side, no merchant hit) | ✅ |

The smoke test exercised every piece of the wire shape including idempotency state machine, signature scope, JCS canonicalization, JSONB key-order normalization at the audit endpoint, and the Ed25519 signing path under real env config.

**What's deliberately deferred to Phase 4:**

- Refresh registry against `x402.org/ecosystem` — current inventory is CDP-discovery output, not actually-conforming x402 endpoints (P4-1).
- Public receipt explorer (`/explorer`) — counters Sentinel framing (P4-2).
- Solana support — Phase 3 is Base-only; Solana volume is meaningful (P4-3).
- `@trustbench/verify-receipt` npm package (P4-4).
- Receipt-spec public docs site (P4-5).
- Formal Infopunks integration (P4-6).
- Strict reservation-based spend caps — Phase 3 is approximately enforced under concurrency, bounded by `(parallelism − 1) × max_price` (P4-7).
- Multi-merchant fan-out — Phase 3 is single-merchant per `/route` call (P4-8).
- Policy firewall subscription product (P4-9).
- Refundable provider verification bond (P4-10).
- Receipt accounting CSV export (P4-11).

**Carry-forward action items from the smoke test:**

- Quote validity is 5 minutes — fine for sub-second agent flows, tight for manual testing. Worth a note in API docs but no immediate action.
- `src/server.ts` is a stale stub importing `./index.js` as default; `tsc --noEmit` flags it. Live entry is `src/index.ts` direct via `tsx watch`. Either delete or align.
- Three pre-existing `tsc` errors in `node_modules/@supabase/realtime-js` reference missing types from `@supabase/phoenix`. Likely fixed by a `@supabase/supabase-js` minor bump.
- Local Redis fallback noise (`⚠️ Redis connection lost`) on the dev box is just local network reachability; Railway-side Redis works fine. Worth checking only if production starts seeing the same.

**Process notes worth keeping:**

- **Chat markdown auto-linkification fakes content bugs.** Bare hostnames (`trustbench.io`) and `@host:port` patterns get rendered by the chat client as `[trustbench.io](http://trustbench.io)` and `[user@host](mailto:user@host)` *even inside code blocks*. This makes terminal pastes look like the source value contains markdown when it doesn't. During Phase 3 closeout this caused a wrong-direction diagnosis — chased a `TRUSTBENCH_ISSUER_HOST` env-var fix that wasn't needed (the var was unset, defaulting to the clean string in `receipt-generator.ts:39`; signature verified the canonical bytes were clean too). Rule going forward: when a value looks markdown-mangled in chat output, run a non-chat-mediated check (open the file in a local editor, run `grep` on the value, etc.) before declaring it a real bug.
- Anchor multi-step shell commands on shell variables (`$BASE`, `$RECEIPT_ID`) rather than literal hostnames — the shell never sees chat's auto-linkification then.
- `c.json` on a JSONB-loaded receipt returns the same canonical bytes (modulo key-order) as the in-memory envelope. The signature reconstructed at verify time is identical because JCS sorts keys. Confirmed empirically in B3.
- The Phase 3 closeout doc's B3 spec assumes the original quote is still valid (5-min window). Manual testing easily slips past that and lands you in B4 territory by accident — sequence A1' + A2' + B3' back-to-back, not paced.

---

---

## 2026-05-04 — Workflow rule changed; Phase 4 P4-1a code unblocked

**Rule change.** Grok no longer touches code; Claude implements directly. New CLAUDE.md and phase4-kickoff.md reflect this. `feedback_grok_design_docs_drift.md` recast as a Claude self-review checklist for high-risk surfaces (signing, payment construction, idempotency, spend caps, receipt emission). Round-trip review was insurance against subtle wire-shape mistakes at the cost of an async cycle per diff. The new rule keeps the careful reading and drops the cycle.

**P4-1a + settle-handler POST extension shipped (route-handlers.ts + crawler.ts):**

- `crawler.ts seedKnownX402Endpoints()` — three Infopunks endpoints seeded with `metadata.x402_probe_method = 'POST'` and minimum-viable probe bodies (`{artifact: 'trustbench-probe'}`, `{input: 'trustbench-probe', output_type: 'briefing'}`, `{narrative: 'trustbench-probe'}`). Capability `data`. Verified live against the OpenAPI schema at `/openapi.json`. Render cold-start is real (~13s) — warm `/health` first.
- `route-handlers.ts X402ProbeConfig` + `loadProbeConfig()` — reads metadata from the providers table, returns null for legacy GET-only providers (preserves Phase 3 default).
- `probeFor402Challenge` extended with optional config; reads top-level x402 fields then falls back to `accepts[0]` for v2-flavored providers (Infopunks via Coinbase CDP facilitator). Accepts `payTo`/`recipient`, `amount`/`amount_atomic`/`maxAmountRequired`, `asset`/`asset_address` spelling variants.
- `settleHandler` extended to mirror probe-config behavior: POST + `Content-Type: application/json` + body when configured; default GET preserved.

**Design choice — paid call body for POST-only providers:** the settle path currently reuses `metadata.x402_probe_body` (same body that elicited the 402 challenge) as the paid request body. This is correct for `paid-probe.ts` (which is testing wire compliance, not response usefulness). Real agents calling `/route` will eventually need a `payload` field passed through `/route` + `/route/settle` so they can request the actual coherence-score / extract-signal / simulate-narrative result they want. Documented as Phase 4 follow-up in task #7 description.

**Wire shape facts — locked from `scripts/mock-provider.ts` empirical reference (smoke tests A1–B4 passed against this format):**

X-PAYMENT (request, base64-JSON):
```
{
  authorization: { from, to, value, validAfter, validBefore, nonce },  // EIP-3009; values stringified
  signature: 0x + 130 hex
}
```

X-PAYMENT-RESPONSE (response, base64-JSON, lowercase header lookup):
```
{
  tx_hash | transaction_hash: 0x + 64 hex,
  block_number | settled_at_block | settled_at_block_number | blockNumber: number | string-of-digits | absent
}
```

`parseTxHashFromResponse` accepts both spellings on each field and coerces block numbers to `number | null`. Returning `null` for missing/malformed → caller emits 502 `provider_settlement_missing`. No receipt written when settlement reference is unrecoverable. Safe failure mode.

**Failure-mode analysis (per new high-risk-surface rule):**

- `buildXPaymentHeader`: if a field is missing or wrong-cased, the provider's signature recovery fails the EIP-712 struct hash → returns 402 → settle returns 502 `provider_signature_rejected`. **No money moves.** Safe.
- `parseTxHashFromResponse`: missing tx_hash → null → 502, no receipt. Wrong block_number type → still issue receipt (block is optional per receipt-spec-v1.md), verifier's `--check-chain` flags discrepancies on audit. Safe.
- Settle POST extension: settles against POST-only endpoints will work for paid-probe; real agents who want a useful response will get the seed probe body's response (a coherence score over the string `"trustbench-probe"`), not their intended query. Documented limitation. Phase 4 fix: optional `payload` field on `/route` + `/route/settle`.

**Workspace integrity gotcha (third occurrence this session):** Cowork's file tools (`Read`/`Write`/`Edit`) and the bash sandbox can show different states of the same file. `package.json`, `src/crawler.ts`, and `src/route-handlers.ts` all arrived this session truncated mid-token in the bash view while the Read tool showed complete content. Verify after every Edit on a sensitive file: `wc -l` + `tail -3` + brace-balance grep + tsc. Don't trust file-tools success messages alone. Truncation pattern: file ends mid-token at the exact byte position tsc reports as the parse error. When this happens, append the missing tail via `cat >> file <<EOF` from bash directly.

**Confirmed end-to-end before declaring done:**

- `tsc --noEmit` returns only the 4 carry-forward errors (3 in `node_modules/@supabase/realtime-js`, 1 in `src/server.ts` stale stub) — nothing new.
- Brace/paren balance: { 174 / } 174 ; ( 292 / ) 292.
- All four x402 wire helpers defined exactly once: `probeFor402Challenge`, `loadProbeConfig`, `buildXPaymentHeader`, `parseTxHashFromResponse`.
- Crawler seed + Infopunks 3-row metadata + capability `data` all on disk.

**Carry-forward to next session:**

- User runs `npm run crawl && npm run pipeline` to insert + score the Infopunks rows. Then check `/rankings?capability=data` — Infopunks should appear with non-null score.
- P4-1b operational runbook: probe agent SQL, fresh EOA, $30 USDC funding, GitHub Secrets, dry-run, single-provider live run. User-side ops; Claude provides the runbook.
- First clean paid-probe receipt → reply to InfopunksHQ with receipt_id + verifier link + their-framing copy ("first external evidence trail through the cognition layer"). They committed to amplifying.

---

## 2026-05-04 — End-of-day session close (P4-1b in flight)

**What landed today:**

- ✅ Workflow rule rewritten — Grok no longer touches code, Claude implements directly. CLAUDE.md + phase4-kickoff.md + memory entries updated. New high-risk-surface discipline rules in `lessons.md` and § 6/§ 7 of `grok-x-research-briefing.md`.
- ✅ Phase 4 P4-1a code shipped on disk + tsc clean: `crawler.ts seedKnownX402Endpoints()` (3 Infopunks endpoints with capability=`data` + POST probe metadata), `route-handlers.ts` X402ProbeConfig + loadProbeConfig + extended probeFor402Challenge (POST-mode + accepts[0] + field-name dialect tolerance + signing-time field synthesis) + extended settleHandler (POST method/body when configured).
- ✅ All four x402 wire helpers present and intact in `route-handlers.ts`: probeFor402Challenge, loadProbeConfig, buildXPaymentHeader, parseTxHashFromResponse.
- ✅ `paid-probe.ts` rankings parser fix (`/rankings` returns `{success, data, source}` envelope, not a top-level array — script now tolerates both shapes).
- ✅ `phase4-p4-1b-runbook.md` written — 10-step user-side ops runbook.
- ✅ `grok-x-research-briefing.md` written + iterated based on first daily run feedback (4 new anti-patterns + failure-modes-by-tier rubric added).
- ✅ Reddit reply to Paddock (public + DM) drafted and posted; partnership angle confirmed; one-week sample exchange agreed; co-branded monthly comparison post locked as the first deliverable.
- ✅ Daily Grok scan output reviewed — 5 A-tier X replies posted with corrected-for-280 versions.
- ✅ Probe agent provisioned (`probe@trustbench.io`, agent_id `eeac8c00-...`, key prefix `tb_live_FM8C`); spend caps configured ($0.05 per-call, $0.70/day rolling, $20/mo monthly via script-side soft check).
- ✅ Probe wallet generated locally via Node one-liner; address `0x547C2c615b227800D56b5ed24021C2CbCa0a3057`; private key stored only in password manager.
- ✅ Probe wallet funded with 30 USDC on Base (native USDC contract `0x8335...02913`).
- ✅ All five GitHub Secrets set + local PowerShell `$env:` block prepped.
- ✅ Railway deploy confirmed Ed25519-signing-keys are configured: `/.well-known/trustbench-pubkey` returns 200 + 113-byte PEM-encoded Ed25519 public key.

**Open blocker — picks up tomorrow at this exact spot:**

`probeFor402Challenge` returns null silently against Infopunks's `/v1/simulate-narrative` even though direct curl confirms the endpoint returns 402. Synthesis logic on disk is correct (verified via `grep`). Likely candidate paths to investigate:

- Render TLS cold-start eating the first connect handshake silently before AbortSignal.timeout fires.
- Some post-synthesis required-fields check failing on a field we haven't traced yet.
- Possibly a bash-vs-Windows file-watcher gap meaning tsx-watch loaded a stale version of the function (even after Ctrl+C / npm run dev) — the temp `console.log` PowerShell-edit was started but never executed (PS continuation prompt left dangling at `>>`).

**Tomorrow's first 30 minutes (concrete steps):**

1. In w2 (or fresh PS tab), re-set `$env:` block:
   ```powershell
   $env:SCRIPTS_PROBE_API_KEY    = '<from password manager>'
   $env:SCRIPTS_PROBE_WALLET_PK  = '<from password manager>'
   $env:TRUSTBENCH_BASE_URL      = 'http://localhost:3000'   # local for diagnostics first
   $env:SCRIPTS_PROBE_DRY_RUN    = 'true'
   $env:SCRIPTS_PROBE_MAX_PROVIDERS = '1'
   $env:SCRIPTS_PROBE_CAPABILITIES  = 'data'
   $env:SUPABASE_URL             = '<from .env>'
   $env:SUPABASE_SECRET_KEY      = '<from .env>'
   ```
2. Verify the temp console.log line did or did NOT land in `src/route-handlers.ts`:
   ```powershell
   grep -n 'method=' src/route-handlers.ts
   ```
   If absent, re-apply Claude's PowerShell-edit (closes the `>>` continuation properly with a final blank line).
3. Restart dev server in w1: `Ctrl+C` then `npm run dev`. Watch for the `🚀 TrustBench server running on http://localhost:3000` line.
4. In w2, redo the diagnostic curl against `http://localhost:3000/route`. Look at w1 for the new `[probe] ... method=... status=... hasBody=...` log line.
5. Diagnose based on what status comes back:
   - `status=402` → response IS 402, parsing is failing somewhere. Add a `console.log` of the parsed `ch` object to see which field is null after synthesis.
   - `status=404` → wrong path or cold-start. Warm `/health` first.
   - `status=400` → schema validation failed. Probe body shape mismatches OpenAPI.
   - `status=500/503` → Render-side issue. Retry after warm-up.
   - No log line at all → tsx-watch still hasn't reloaded; the temp edit isn't on disk. Fall back to a manual edit via VSCode/notepad to force the Windows file-watcher.

**Strategic note (locked 2026-05-04):**

Phase 3's x402 client was written for v0.x semantics. Infopunks (and most real v2 endpoints) emit different wire shapes — POST-only, `accepts[0]` nesting, missing signing-time fields, scheme=`exact` instead of `eip3009`, possibly different X-PAYMENT envelope shape. **Patch piecemeal for P4-1b** to ship the InfopunksHQ amplification on schedule. **Sweep wholesale via `@coinbase/x402` SDK as P4-1d after first receipt lands** — see `project_phase4_v2_wire_compat_approach.md` in memory for the locked decision + remaining patch list.

**Patches still expected after the probe-null is unblocked:**

- `validateChallenge` accepting `scheme === 'exact'` alongside `'eip3009'`.
- `buildXPaymentHeader` emitting v2 envelope (`{x402Version, scheme, network, payload: {signature, authorization}}`) — likely needed for Infopunks's facilitator to accept the X-PAYMENT signature.
- `parseTxHashFromResponse` may need v2 dialect updates.
- Add `console.warn` to `probeFor402Challenge`'s silent-null paths so future debug doesn't have to instrument from scratch.

**Once probe-null + above are fixed:**

- Local dry-run produces clean `[probe] DRY ... amount=10000`.
- Local non-dry single-provider run produces a `rcpt_…` ID.
- `npm run verify-receipt -- <id> --check-chain` returns SIGNATURE VALID.
- Deploy local code to Railway (commit + push if auto-deploy enabled).
- Repeat dry-run + single-provider run against Railway prod for the actual amplification receipt.
- DM @InfopunksHQ with receipt URL + verifier instructions + amplification copy.

**Carry-forward operational items:**

- Railway env vars are configured for Ed25519 signing; local `.env` is NOT — that's why local-pipeline scorecards have `signature: null`. Cleanup task: copy `TRUSTBENCH_SIGNING_PRIVATE_KEY` + `TRUSTBENCH_SIGNING_PUBLIC_KEY` from Railway into local `.env`. Not blocking P4-1b.
- Three files (`package.json`, `src/crawler.ts`, `src/route-handlers.ts`) hit Cowork file-tools-vs-disk truncation today. When file tools report success, verify on-disk via bash `wc -l` + `tail -3` before assuming the edit landed. Especially for sensitive code on the high-risk surfaces.
- Dev server in w1 may need a hard restart (Ctrl+C, `npm run dev`) when source files are edited via bash heredoc — Windows tsx-watch may not pick up changes that don't flow through Windows's filesystem watcher. PowerShell-side edits trigger the watcher reliably.

---

## 2026-05-05 — Pre-debug intel pass (Paddock + x402SKILL + Nick Prince + Reddit)

**Four threads processed before resuming P4-1b debug:**

1. **Paddock partnership progress (Reddit DM).** Reasonable-Degree101 confirmed: full URL primary key (matching ours, not domain), approved fifth bucket (paid + not in either registry = dark-matter providers), provided CSV export at `breakthecubicle.com/api/paddock/export/bazaar` (1200 rows, 9 cols, primary key `endpoint_url`). Sketched our 7-night rollup columns; SQL query against scorecards + providers tables produces it directly. Tracking as task #13.

2. **`x402SKILL.md` review.** Coinbase publishes `agentic.market/skill.md` as primary x402 onboarding (paste into Claude/Codex/Cursor → agent gains capability). New for TrustBench: skill.md as distribution channel (P4-skill), 5-cat taxonomy alignment (P4-1c), `api.agentic.market/v1/services` as crawler source (P4-1d), `integrationType: "1P"`/`proxied` attestation (P4-verify-tier). All four documented in `phase4-kickoff.md` § "Phase 4 follow-ups added 2026-05-05". Memory entry at `project_skill_md_distribution.md`.

3. **Nick Prince's Agentic.market week 2 announcement.** Confirmed three Coinbase ships: skill.md onboarding, verified badges (1P/proxied), seller endpoint validator. Burak's question to Nick about subjective-output paid agent work is Phase 5 territory for TrustBench (receipts + dispute layer). Captured in `phase5-design-seeds.md` at project root.

4. **Current-Tip2688's Reddit comment on idempotency-after-restart.** TrustBench solves persistent-key-in-same-transaction by design (Supabase `idempotency_keys` table + slot-claim before handler + `_settle:<route_id>` namespacing). State-schema-migration is a different concern we sidestep via stateless middleware design. Reddit reply drafted, tracking as task #14.

**Key cross-window-close moves made:**

- Updated `phase4-kickoff.md` with four new P4 follow-ups + verification tier framing.
- Created `phase5-design-seeds.md` at project root for accumulated Phase 5 design notes.
- Memory entries: `project_skill_md_distribution.md` + `project_phase5_design_seeds.md`. MEMORY.md index updated.
- This file appended.

**Strategic note that survives the chat-window close:** Coinbase is competing on **agent skill files** as the prompt-context-slot distribution surface, not developer SDKs. TrustBench should publish its own skill file as P4-skill — first-mover open in our routing/policy lane (G402, X-Router, Router402, AgentGatePay all lack skill files as of 2026-05-05).

---

## 2026-05-05 — End-of-session: P4-1b hand-roll exhausted, SDK pivot locked

**State at close:** 8 v0.x→v2 wire-compat patches landed against Coinbase CDP facilitator's `/verify`, still rejected with `provider_signature_rejected`. No money moved on any settle attempt — facilitator rejects pre-submit, so nonce never consumed, on-chain unaffected.

**Patches that landed (good progress, just not enough):**
1. POST-mode probing (`metadata.x402_probe_method` + body) — works
2. accepts[0] envelope shape parsing — works
3. Field-name dialect tolerance (payTo/recipient, asset/asset_address, maxAmountRequired/amount) — works
4. Synthesis of nonce/validAfter/validBefore when merchant doesn't pre-allocate — works
5. Scheme normalization "exact" → "eip3009" internally — works
6. Network "eip155:8453" instead of "base" in envelope — works
7. validAfter = epoch-now-600 instead of 0 (matches Coinbase reference SDK convention) — works
8. EIP-55 address normalization (canonical via getAddress in script signing; lowercase in envelope) — neither variant fixed it
9. value/validAfter/validBefore as strings instead of BigInt (matches Coinbase reference) — didn't fix it

**What we still don't know:** the exact divergence between our hand-rolled X-PAYMENT envelope and what Coinbase's `client.verifyTypedData()` expects. Without access to their `/verify` endpoint to iterate cheaply, every guess from log analysis is a coin-flip.

**Strategic pivot (locked 2026-05-05):** abandon the hand-roll path. Use `@coinbase/x402` SDK directly. Their `createPaymentHeader(client, x402Version, paymentRequirements)` returns the encoded base64 X-PAYMENT string — drop-in replacement for our `signEip3009` + `buildXPaymentHeader` combo. SDK is provably correct (Infopunks integration uses it; every working v2 endpoint uses it).

**Tomorrow's first 30 minutes (concrete):**

1. `npm install @coinbase/x402` (or whatever the canonical package is — verify via `npm search @coinbase/x402` or by reading `x402SKILL.md` for the package name).
2. In `scripts/paid-probe.ts`: replace `signEip3009(account, q.payment_required)` with `createPaymentHeader(account, 1, paymentRequirements)`. The SDK returns the full encoded X-PAYMENT string already; drop the `buildXPaymentHeader` step entirely.
3. In `src/route-handlers.ts` settleHandler: instead of building X-PAYMENT server-side, just receive the X-PAYMENT-already-encoded string from the agent's `/route/settle` request body and forward it. This shifts envelope construction to client side (where SDK lives).
4. **OR** alternative: keep server-side construction, but use `@coinbase/x402` SDK helpers there too. Slightly more work but maintains the same /route/settle interface.
5. Test against Infopunks. Should land first paid receipt within minutes once SDK is wired.

**Carry-forward state:**

- All 9 patches above are still on disk; they're correct for v2 ecosystem broadly even if Coinbase facilitator wants something subtly different. Don't revert them — they unblock other v2 providers (Nansen, Bloomberg, etc.) when those are added.
- Probe wallet `0x547C2c615b227800D56b5ed24021C2CbCa0a3057` still has 30 USDC on Base. No funds moved.
- Probe agent `probe@trustbench.io` provisioned in Supabase with caps locked.
- Local TrustBench dev server boots cleanly; quote round-trip works end-to-end against real Infopunks endpoints (we just can't settle).
- Railway deployment is still on stale Phase 3 code (no `/route` endpoint exposed yet) — needs deploy after SDK pivot lands.
- @InfopunksHQ DM acknowledging v0 mainnet still pending send (task #16) — could send now with current honest status, or wait for first receipt.

**Process lessons from today:**

1. **Chat-markdown auto-linkification injects bugs, not just fakes them.** When `Date.now` was rendered as `[Date.now](http://Date.now)` in chat and copy-pasted into PowerShell, it landed in the source file as broken syntax. Inverse of the existing chat-markdown lessons.md entry. Workaround: use idioms without `.<word>(` patterns (e.g. `+new Date / 1000 | 0` instead of `Math.floor(Date.now() / 1000)`).
2. **Cowork file-tools-vs-bash truncation hit ~6 times today on `route-handlers.ts`.** Pattern: Edit reports success, Windows view has full file, bash view is truncated mid-token, next bash append duplicates content. Reliable workaround: Apply edits via PowerShell `-replace` directly on the Windows side. Bash should ONLY be used for read-only operations on this file going forward.
3. **`tsc --noEmit` lies about file integrity when truncation is happening.** It reports the bash-side truncated view as "clean" while the Windows-side actual file may have orphan duplicate content. Always cross-check `(Get-Content file).Count` from PowerShell after any edit cycle.
4. **Hand-rolling x402 v2 from spec is a tar pit.** Patches keep accumulating, each fix unblocks the next divergence. The SDK exists for a reason; use it.

---

## 2026-05-06 — SDK pivot landed (P4-1b first-30-min plan executed)

**What landed (source-side, Windows-authoritative):**

- Added `"x402": "^1.2.0"` to `package.json` dependencies. Confirmed via `npm view`: latest is 1.2.0, exports `createPaymentHeader(client: Signer, x402Version: number, paymentRequirements: PaymentRequirements): Promise<string>`. Picked plain `x402` over `@coinbase/x402` because the latter pulls `@coinbase/cdp-sdk` (~30MB transitive) and we don't need the facilitator-client surface — only the X-PAYMENT envelope construction.
- Added `PaymentRequirementsV2` type + refactored `probeFor402Challenge` to return `{challenge, raw_accepts}` (was `X402Challenge | null`). The raw v2 accepts[0] envelope passes through untouched.
- Quote response now includes `payment_requirements_v2` field — the merchant's raw accepts[0] when present, null when only flat v0.x shape was emitted (mock-provider).
- `/route/settle` accepts EITHER `signature` (legacy v0.x EIP-712 sig — Phase 3 mock-provider compat) OR `x_payment` (SDK-built base64 envelope — real v2 providers). Mutually exclusive; either-but-not-both. Server forwards `x_payment` verbatim, no shape inspection.
- `paid-probe.ts` branches on `payment_requirements_v2`: present → `createPaymentHeader(account, 1, q.payment_requirements_v2)` → POST `{route_id, x_payment}`. Absent → fall back to existing `signEip3009` + `signature` path. The legacy path stays usable for the local mock smoke.

**Architectural cleanup:** the SDK pivot also fixes the non-custodial story by accident. Previously the server's `buildXPaymentHeader` reconstructed the full envelope from a client-supplied raw EIP-712 signature, meaning the server saw and assembled the typed-data wrapper. Under the new path, the client builds the entire X-PAYMENT envelope using its own wallet via the SDK, and TrustBench only forwards the opaque base64 string. The server now provably never sees the EIP-712 typed data nor the wrapped signature beyond pass-through.

**Verification gate (deferred to user-side):**

- Bash-mount truncation hit again on both `route-handlers.ts` AND `paid-probe.ts` this session — same pattern as the 2026-05-05 entry. Bash sandbox view ends mid-token while Read-tool view from the Windows mount shows complete files. `tsc --noEmit` from bash falsely reports `'}' expected` at the truncation byte; Windows-side `tsc --noEmit` should be clean. Confirm on Windows after pulling.
- `npm install` from bash also fails silently here (timeout under sandbox limits). Source-side change in `package.json` is correct; user runs `npm install` from PowerShell.

**User-side runbook (next ~10 minutes):**

```powershell
cd C:\Users\Lithv\Documents\Claude\Projects\TrustBench
npm install                          # pulls x402@^1.2.0 + transitive
npm run typecheck                    # confirm tsc --noEmit clean

# Set env block (same as yesterday):
$env:SCRIPTS_PROBE_API_KEY    = '<password manager>'
$env:SCRIPTS_PROBE_WALLET_PK  = '<password manager>'
$env:TRUSTBENCH_BASE_URL      = 'http://localhost:3000'
$env:SCRIPTS_PROBE_DRY_RUN    = 'true'
$env:SCRIPTS_PROBE_MAX_PROVIDERS = '1'
$env:SCRIPTS_PROBE_CAPABILITIES  = 'data'
$env:SUPABASE_URL             = '<from .env>'
$env:SUPABASE_SECRET_KEY      = '<from .env>'

# Restart dev server in w1, then in w2:
npm run paid-probe                   # dry-run; expect [probe] DRY ... path=sdk
$env:SCRIPTS_PROBE_DRY_RUN = 'false'
npm run paid-probe                   # expect [probe] OK ... receipt=rcpt_...
```

If dry-run prints `path=legacy` instead of `path=sdk`, the merchant's 402 didn't expose `accepts[0]` — check `[probe]` log for the actual probe response. Most likely cause: probe body shape mismatch with merchant's OpenAPI schema (Render cold-start eats the first request, second hit returns 402 properly).

**What survives if SDK envelope still gets rejected (unlikely but planned for):** all 9 hand-roll patches from 2026-05-05 stay on disk in `route-handlers.ts`. The legacy path (`signature` field on /route/settle → buildXPaymentHeader) is fully intact and tested against mock-provider in B-series smokes. So we can fall back per-merchant by just stripping `payment_requirements_v2` from the quote response for that provider.

**Carry-forward to next session:**

- First successful paid receipt → DM @InfopunksHQ with receipt URL + verifier instructions + amplification copy ("first external evidence trail through the cognition layer"). They committed to amplifying; this is the trigger.
- Receipt-spec public docs (P4-5) and `@trustbench/verify-receipt` npm package (P4-4) become higher-priority once amplification lands and external verifiers start showing up.
- The SDK pivot makes the wholesale v2 sweep (P4-1d in `phase4-kickoff.md`) effectively done for the agent-side. Any future v2 provider added to the registry just works — no per-provider envelope debugging needed.

---

## 2026-05-06 — SDK pivot blocked at Coinbase CDP facilitator (below-the-floor wall)

**State at session close:** SDK pivot is on disk, type-check clean, end-to-end plumbing works (probe → quote → SDK envelope build → settle forward → 402 from merchant). Local signature verification confirms `recovered signer == authorization.from`. Multiple wrapper-shape variants tried; all rejected with the same opaque "x402 facilitator verify failed" message. **No money has moved on any settle attempt** (facilitator rejects pre-submit; nonces never consumed on-chain).

**What was confirmed cryptographically correct (today's diagnostics):**

- The `x402` SDK signs with the canonical EIP-712 domain: `{name: "USD Coin", version: "2", chainId: 8453, verifyingContract: 0x833...02913}` from `extra` + `network` + `asset` in the merchant's accepts[0]. Inspected the SDK source directly — `signAuthorization()` does `account.signTypedData(...)` with the right TransferWithAuthorization type definition.
- Added `recoverTypedDataAddress()` gate in `paid-probe.ts` after each SDK call. It runs viem's signature recovery using the same EIP-712 domain + types + message + signature the SDK emitted. Result: `match=true` every run. The SDK is provably signing the correct typed data with the correct wallet.
- This means: the rejection is NOT in the EIP-712 layer. The signature is genuine; the recovered signer matches the claimed `from`; the inner authorization is well-formed.

**What was tried (wrapper-shape sweep):**

| Variant | x402Version | network | Outcome |
|---|---|---|---|
| Pure SDK output (default) | 1 | "base" | 402, facilitator verify failed |
| Post-hoc patched (CDP v2) | 2 | "eip155:8453" | 402, facilitator verify failed |

Plus all 9 hand-roll patches yesterday (POST-mode, accepts[0] parsing, field-name dialect, signing-time field synthesis, scheme normalization, eip155:8453 in envelope, validAfter=now-600, EIP-55 case, value/validAfter/validBefore as strings) — all failed against the same Coinbase CDP facilitator with the same opaque message.

**Conclusion (locked):** the rejection is at a layer the public x402 spec doesn't document. Possibilities we've ruled out vs. left open:

- ~~Wrong EIP-712 domain~~ — confirmed correct via local signature recovery.
- ~~Wrong wrapper version / wrong network spelling~~ — both v1 and v2 variants tested.
- ~~Header name mismatch~~ — server now sends both `X-PAYMENT` AND `x402-payment`.
- **Open**: Coinbase CDP facilitator may require additional out-of-band metadata (CDP API authentication, attestation token, proof of facilitator-pre-registration, etc.) that the public x402 spec doesn't surface. We can't tell from the merchant's generic 402 reflection.
- **Open**: there may be a JCS-canonicalization or specific JSON-key-ordering requirement at the wrapper level we haven't replicated.
- **Open**: Infopunks's middleware may be intercepting and rejecting before forwarding to the facilitator (less likely given the rejection body explicitly cites `facilitator_url`).

Without facilitator-side logs (CDP dashboard) or merchant-side logs (Infopunks server), every additional patch from our end is a coin flip. **This is below the floor of what we can debug in isolation.**

**What's on disk and ready to ship:**

- `scripts/paid-probe.ts` — SDK pivot complete: `createPaymentHeader` builds X-PAYMENT, `recoverTypedDataAddress` self-verifies before sending, `normalizeForSDK` translates merchant dialect (CAIP→SDK network, `amount`→`maxAmountRequired`, object→string `resource`), `patchEnvelopeForCoinbaseV2` available behind `SCRIPTS_PROBE_APPLY_V2_PATCH=true` for future debugging, default emits pure-SDK envelope (most-compatible with the x402 ecosystem).
- `src/route-handlers.ts` — `/route/settle` accepts both `signature` (legacy v0.x for mock-provider compat) and `x_payment` (SDK pre-built); settle forwards both `X-PAYMENT` and `x402-payment` headers; quote returns `payment_requirements_v2` to clients.
- All 9 hand-roll patches still on disk for when a future provider needs the v0.x→v2 dialect handling without an SDK.

**Next-session decision points (do not rebuild from scratch):**

1. **Send the Infopunks DM.** Concise, honest: "Local signature verification proves our envelope is cryptographically correct, but the Coinbase CDP facilitator rejects with generic 'verify failed.' Could you pull the actual rejection reason from your CDP dashboard or facilitator logs?" Offer to share the envelope hex for them to reproduce. They committed to amplifying — they have an interest in unblocking this.
2. **Stand up another v2 provider (non-Coinbase facilitator) as a positive control.** If our envelope works against a different facilitator, it conclusively shows the issue is Coinbase CDP-specific and we can move to other revenue paths while waiting on Infopunks.
3. **Reframe the amplification trigger** — the partnership story doesn't require a paid receipt to be useful. We can DM Infopunks now with: "We integrated against your endpoints, our router successfully proxies through to /v1/simulate-narrative, our quote envelope decodes correctly, the only blocker is facilitator-side rejection we can't diagnose. Here's our route-id, here's our envelope hex, can you help debug?" That's a partnership-grade message; the receipt would be cleaner but isn't required for the relationship.

**Carry-forward state:**

- Probe wallet `0x547C2c615b227800D56b5ed24021C2CbCa0a3057` still has 30 USDC on Base. No funds moved.
- Probe agent provisioned with caps locked.
- TrustBench dev server boots cleanly; quote round-trip fully working against Infopunks.
- Railway deployment still on stale Phase 3 code — may want to deploy SDK pivot regardless to derisk Railway-vs-local config drift before Infopunks responds.
- @InfopunksHQ DM is the highest-leverage next move (task #9 in this session).

---

## 2026-05-05 — P4-1b diagnostic narrowing (Infopunks reply + Run A/B)

**What landed (source-side, Windows-authoritative):** diagnostic patch in `scripts/paid-probe.ts`. Three new log lines (raw merchant `accepts[0]`, wall-clock now in epoch seconds, envelope `validAfter`/`validBefore`/skew computed inside the local-verify block), plus a `SCRIPTS_PROBE_SKIP_NORMALIZE` env flag (default off) that bypasses `normalizeForSDK` and feeds raw `accepts[0]` straight into `createPaymentHeader`. No signing or wallet code changed. tsc clean (only the 4 known carry-forward errors).

**Run A (skipNormalize=false, default behavior):**
- SDK path completed dry-run cleanly.
- `local-verify recovered=0x547C... expected=0x547C... match=true` — crypto correct.
- `envelope clock: validAfter=1777991569 validBefore=1777992469 now=1777992169 skew=-600s` — `validAfter` is 600s in the past, well inside the 300s-ahead `validBefore`. Solidly in the valid window.

**Run B (skipNormalize=true — Infopunks's "pass accepts[0] straight in" hypothesis):**
- `[probe] FAIL sign data:... Unsupported network`. The SDK's `createPaymentHeader` threw synchronously before reaching any signing path because `eip155:8453` is not in `x402@1.2.0`'s `SupportedEVMNetworks` enum.
- This conclusively shows `normalizeForSDK` is NOT a phantom fix. It's required by our pinned SDK version.

**Conclusively ruled out (do NOT re-explore in future sessions without new info):**
- Crypto correctness (every run, `recovered == authorization.from`).
- Clock skew as the rejection cause (negative skew, both bounds within window).
- "Phantom normalization" hypothesis (raw `accepts[0]` does not pass through `x402@1.2.0`).
- Wrapper version v1 vs v2 (yesterday's diagnostics; both rejected with the same opaque message).
- Network spelling `base` vs `eip155:8453` (yesterday's diagnostics; both rejected).
- Header name `X-PAYMENT` vs `x402-payment` (server sends both; both rejected).

**Raw `accepts[0]` confirmed (now in the Infopunks DM body):**
```
{
  scheme: "exact",
  network: "eip155:8453",          // CAIP form
  chain: "Base",
  amount: "10000",                 // not maxAmountRequired
  resource: { url, routeTemplate, inputSchema, outputSchema, extensions.bazaar.{info,schema}, ... },  // nested object, not string
  description: "...",
  mimeType: "application/json",
  payTo: "0xe4E8908308a86aB43E5dEb6C0fd0F006786104c3",
  asset: "0x833589fCD6eDb6E08f4c7c32D4f71b54bdA02913",  // lowercase 'c' in 7c32
  extra: { name: "USD Coin", version: "2" },
  maxTimeoutSeconds: 300
}
```

**What this proves about Infopunks's claim "we pass `accepts[0]` straight to `createPaymentHeader`":** for that and "do not rewrite network from base ↔ eip155:8453" to be simultaneously true, they must be on a different SDK package or version than we are. Either `x402@>1.2.0` (newer enum), `@coinbase/x402` (deliberately avoided here for size), or an internal fork. Their abbreviated example doesn't reveal the pin.

**What's still open:** the actual CDP facilitator rejection reason. Empirical eliminations leave: an SDK-hidden field-shape gate, or a facilitator-side policy gate (key registration, attestation, etc.). Without partner-side logs we cannot narrow further.

**DM sent to @InfopunksHQ 2026-05-05:** raw `accepts[0]` body, our SDK pin (`x402@1.2.0`), Run B failure mode (`Unsupported network`), local-verify match=true proof, clock-skew -600s result, probe wallet `0x547C2c615b227800D56b5ed24021C2CbCa0a3057`, ~13 settle attempts to date with no on-chain nonce consumption. Asked: which package + version they use for `createPaymentHeader`, and whether their facilitator-side error logging is live yet.

**Carry-forward to next session if Infopunks responds with...:**
- "we use `x402@1.X` newer than ours" → bump pin in `package.json`, retry `SCRIPTS_PROBE_SKIP_NORMALIZE=true` against the same merchant.
- "we use `@coinbase/x402`" → SDK swap; same architecture (client-side build, server forwards). ~30min plus retest.
- A specific rejection reason (field shape, attestation, etc.) → patch in `scripts/paid-probe.ts` (likely `normalizeForSDK`), retry `DRY_RUN=false` with single provider.
- Nothing yet → proceed with reweighted sprint (P4-skill → P4-wellknown → P4-llmstxt) per `phase4-kickoff.md` § "State as of 2026-05-06". P4-1b stays paused on Infopunks's response time, not ours.

**Wallet still has 30 USDC on Base.** No funds moved at any point. Still safe to retry on demand.

**Diagnostic-patch file integrity check:** `paid-probe.ts` is 785 lines after the patch (was 761; +24 matches expectation). Edits verified via Read (Windows mount). Bash sandbox view truncated at line 375 — same `file-tools-vs-bash` mismatch from the 2026-05-06 lesson; do not use bash `wc -l`/`tsc` to verify file integrity, use Read or run `tsc --noEmit` from PowerShell.

---

## 2026-05-05 — Discovery sprint shipped (P4-skill + P4-llmstxt + P4-wellknown)

**What landed:** the three Tier-1 discovery surfaces from `phase4-kickoff.md` § "Agent discovery", co-shipped while waiting on Infopunks's reply to the SDK-version question.

**Files written / refreshed:**

- `skill.md` (new, repo root) — agent skill file in the agentic.market/skill.md format. Frontmatter on first two lines (`name: trustbench-policy-router`, `description: …`), closing `---`, then markdown body. Augment-only positioning per the locked decision: the skill defers to `agentic.market/skill.md` for wallet setup (Coinbase Agentic Wallet) and only documents what TrustBench layers on top (idempotency, hard spend caps, signed receipts, queryable audit, non-custodial routing). Two-path structure (CLI / MCP) mirrored from Coinbase's skill. MCP-host section is honest about the lack of a native TrustBench MCP server today; falls back to "use the host's HTTP-fetch tool" and flags a native MCP as a Phase 4 follow-up. Em-dash policy: this is public outreach copy, so no em-dashes anywhere — used commas, parens, periods, colons. API access path is "DM @TrustBench on X" (Phase 4 is invite-only).

- `llms.txt` (refreshed in place) — already existed but referenced "Phase 3 in build" and a "public route not yet mounted" status. Targeted edits updated: the blurb (Phase 3 closed), the "Authenticated routing" header (Phase 3 live; Phase 4 invite-only), the audit-endpoint status block, the API-access path (DM @TrustBench), the pricing block (Phase 4 invite-only). New "## Agent-discovery surfaces (Phase 4)" section added between public-key URL and the authenticated-routing section, listing /skill.md, /.well-known/trustbench.json, and /llms.txt itself.

- `.well-known/trustbench.json` (new, repo root) — machine-readable manifest. Full surface map (publicEndpoints, authenticatedEndpoints), capabilities + networks + settlement assets, signing scheme (Ed25519, JCS, public-key URL, fallback algorithm, verifier scripts), custody claim ("non-custodial: never holds funds, never signs payments, never broadcasts transactions"), pricing model (flat-per-tx + verification bond, Phase 4 invite-only), policy primitives (idempotency / spend caps / signed receipts / queryable audit), discovery references (Agentic Market, x402.org, CDP), phases (3 closed 2026-05-04, 4 in progress, 5 planned), contact (X handle + GitHub repo).

- `src/index.ts` — added two imports (`readFileSync` from `node:fs`, `path` from `node:path`), one helper (`loadStatic`) that reads from `process.cwd()` at boot, three module-level constants (`SKILL_MD_BODY`, `LLMS_TXT_BODY`, `WELL_KNOWN_TRUSTBENCH_JSON_BODY`), and three Hono routes (`/skill.md`, `/llms.txt`, `/.well-known/trustbench.json`) with appropriate Content-Type headers and `Cache-Control: public, max-age=3600`. Each route returns 503 if the file failed to load at boot, but the boot itself does NOT crash on missing static — partial deploys still serve the rest of the API.

- `README.md` — endpoint list updated to mention `/skill.md`, `/llms.txt`, and `/.well-known/trustbench.json` honestly. The previous README claimed `/llms.txt` existed but no Hono route actually served it; now it does.

**Why this set of three together:** the kickoff doc's Tier-1 discovery surfaces are co-shipped because each one is independently small and they reinforce each other. Skill.md drives traffic to a developer-facing page; llms.txt drives LLM-grounded research; the well-known manifest is what crawlers and structured agent integrations look for. Each links to the other two, so an agent landing on any of them finds the full surface map.

**File-tools-vs-bash truncation hit again** during this work: `wc -l` from bash on `paid-probe.ts` and `lessons.md` showed truncated line counts. Verification was done exclusively via Read against the Windows mount. Pattern is now well-understood: the bash sandbox occasionally serves a partial copy of files that have been recently edited via the file tools. Adding to the file-tools-vs-bash lesson permanently in `feedback_chat_markdown_render_fake_bugs.md` is overkill (different root cause) but worth a separate lesson note: trust the Read tool, not bash `wc` / `tsc` / `grep`, for verifying recent edits.

**Verification (deferred to Windows-side, since bash isn't trustworthy on edited files):**
- `npm run typecheck` from PowerShell. Should still show only the 4 known carry-forward errors (3 in `node_modules/@supabase/realtime-js`, 1 in `src/server.ts` stale stub). The new code only uses standard-library imports (`node:fs`, `node:path`) and existing Hono APIs; no new type surfaces.
- `npm run dev` then `curl http://localhost:3000/skill.md` (expect text/markdown, content of skill.md), `curl http://localhost:3000/llms.txt` (expect text/plain), `curl http://localhost:3000/.well-known/trustbench.json` (expect application/json).
- Visual sanity check on the served skill.md from a copy/paste perspective: would an agent builder paste this into Claude Code and get a useful capability? The frontmatter description is dense with trigger words (spend cap, idempotency, double-charge, audit, signed receipt, non-custodial, etc.) so discovery should work.

**Failure modes** (per high-risk-surface discipline, even though these aren't high-risk surfaces):
- Static-asset load fails at boot → 503 on those three routes; the rest of the API still works. Recovery: redeploy with the missing file. No security implications.
- File-tools-vs-bash truncation → Read tool verifies on-disk integrity authoritatively; if the user runs `tsc` on Windows and it reports new errors, suspect truncation and re-Read.
- Outdated copy in skill.md / llms.txt → cache-control is 1 hour, so iterative copy edits ship within an hour of the next deploy. Non-critical.

**Carry-forward to next session:**
- If Infopunks responds with their SDK pin (the open question from the 2026-05-05 P4-1b diagnostic), pivot back to P4-1b: bump the `x402` package or swap to `@coinbase/x402`, retry the live attempt, ship the first paid receipt, DM Infopunks back with the receipt URL for amplification.
- If Infopunks's response delays further, the next items in the kickoff sprint are P4-1 (full ecosystem refresh against `x402.org/ecosystem`), P4-1c (taxonomy alignment to 5-cat), P4-1d (switch crawler source to Agentic Market), then P4-bazaar.
- The skill.md description's trigger word list can be tuned over time based on which agent skills actually load it — track which builders cite which trigger words in any feedback they share.

---

## 2026-05-05 — Registry refresh sprint (P4-1 + P4-1c + P4-1d + P4-verify-tier)

**Context:** Infopunks DM still in flight. Next items in the reweighted sprint per `phase4-kickoff.md` were P4-1 (ecosystem refresh), P4-1c (taxonomy 5-cat), P4-1d (Agentic Market crawler), P4-verify-tier (integrationType metadata). All four bundle into one coherent registry-touching change. P4-bazaar is out of "while waiting" scope (~1.5–2 weeks, requires server-side x402 wire layer).

**Pre-flight reality check on Agentic Market schema** (before coding): probed `https://api.agentic.market/v1/services` once. Findings vs the kickoff doc:
- Pagination is real: `total: 653`, `limit: 50`, `offset: 0`. Crawler must page through ~13 pages.
- Categories observed in the wild are 10, not 5: Search / Inference / Data / Media / Infra (the canonical 5) plus Travel / Social / Storage / Other / Trading. The kickoff doc's "5-cat alignment" is correct for the routable subset, but the crawler needs to handle the long tail.
- `integrationType` values are `"1P"` and `"3P"` (third-party / proxied), not `"1P"` and `"proxied"` as the kickoff doc claimed.
- Networks are mixed: `"Base"`, `"Polygon"`, `"Solana"`, `"eip155:8453"`. Both friendly names and CAIP form coexist on different services. Phase 4 only routes Base, so the crawler normalizes and filters.
- Pricing scheme is `"exact"` or `"upto"` with min/max amount fields. We store everything; the prober gracefully fails on `"upto"` (no flat amount).
- Service rows can have multiple endpoints with different prices. Crawler emits one provider row per (service, endpoint) pair.

**Files changed:**

- `src/provider-selection.ts` — `Capability` type expanded to `'search' | 'inference' | 'data' | 'media' | 'infra'`. Added `ROUTABLE_CAPABILITIES` exported `ReadonlySet` for runtime validation.
- `src/route-handlers.ts` — imports `ROUTABLE_CAPABILITIES`, validator uses it instead of hard-coded array, error message updated to mention all 5 capabilities.
- `src/index.ts` — mcp/tools enums updated for `media`/`infra` (both rankings + route_quote tool descriptors).
- `src/crawler.ts` — wholesale rewrite:
  - Replaced CDP discovery API call with paginated `api.agentic.market/v1/services` (limit=50, polite 100ms delay between pages).
  - Retired the obsolete hard-coded fallback list of ~20 AI-API roots. They were mostly NOT actually-x402 endpoints and were actively misleading rankings (HEAD-probe treats 401 as alive, so OpenAI/Anthropic/Perplexity roots scored highly without ever emitting a real 402).
  - Network filter: store rows that advertise at least one Base-compatible network (`base` or `eip155:8453`). Polygon/Solana skipped until cross-chain support.
  - One row per (service, endpoint) pair. Capability column is `service.category.toLowerCase()` (so `search`/`inference`/`data`/`media`/`infra`/`travel`/`social`/etc. all flow through). Routable filter happens at `/route` via `ROUTABLE_CAPABILITIES`, not at crawl time.
  - `metadata.integration_type` records Coinbase's curatorial signal ("1P" or "3P").
  - `metadata.am_service_id`, `am_provider`, `am_category`, `networks`, `method`, `pricing` recorded for traceability.
  - `seedKnownX402Endpoints()` for the 3 Infopunks endpoints preserved verbatim. Runs LAST so its rows win on URL conflict (preserving `x402_probe_method` + `x402_probe_body` + `x402_verified` metadata).
- `src/scorer.ts` — `getRankings` now projects `integration_type` alongside `x402_verified` (defensive coercion: only `"1P"` or `"3P"` qualifies; everything else maps to `null`). Cache key bumped to `rankings:v3:` so v2-cached rows don't leak missing-field shapes to clients. Signed scorecard payload (`signScorecard`) is unchanged — `integration_type` is intentionally NOT in the signed bytes, so all existing scorecard signatures stay valid.
- `skill.md`, `llms.txt`, `.well-known/trustbench.json` — capability lists updated to mention all 5.

**Two-bit verification stack (per P4-verify-tier):**
- `x402_verified === true` — empirical: TrustBench probed the endpoint and confirmed it emits a valid x402 challenge body. Set today only by `seedKnownX402Endpoints()` (Infopunks).
- `integration_type === '1P'` — curatorial: Coinbase Agentic Market certified the service as a first-party native x402 integration.
- `integration_type === '3P'` — curatorial: Coinbase certified it as a proxied integration (paywall middleware in front).
- `null` on either field means "no signal" — neither verified nor curated.

These signals are independent and additive. A row that's both `x402_verified=true` AND `integration_type='1P'` has the strongest trust profile. Rankings expose both; clients can filter or sort however they want. The router's `selectProvider` already prefers `x402_verified=true` first; adding `integration_type='1P'` as a secondary preference is a Phase 4 follow-up if rankings show stale-but-1P providers wrongly outranking fresh-but-unverified ones.

**No DB migration required.** `schema.sql` line 14 is `capability text not null` with no CHECK constraint. New capability values just work. Existing rows stay valid. The validator-side enum is the only gate.

**Failure-mode analysis (per high-risk-surface discipline, even though crawler isn't a high-risk surface):**
- Agentic Market unreachable → seed-only crawl. Registry doesn't go fully empty. Logged as a warning. Recovers automatically on next nightly run.
- Agentic Market schema drift → `as { services: AmService[]; total: number; ... }` cast may produce undefined fields, which are guarded with `||` defaults throughout. Worst case: a row gets stored with sparse metadata; the next crawl re-upserts with whatever's current.
- Capability validation in `/route` is a hard gate: a request for `capability=travel` returns 400 `capability_invalid`. Even if the crawler stores Travel rows, they don't leak into routing.
- Cache-key bump (`v2` → `v3`): old `rankings:v2:*` keys age out within 5 minutes. No client-side breakage; they'd just see a cache miss + fresh row with new fields.
- Scorecard signature scope is unchanged: `integration_type` is NOT in the canonical signed payload, so all existing receipts and scorecards verify identically.
- Network filter (Base only) means Solana-native services from Agentic Market are silently dropped. Acceptable for Phase 4. Phase 5 (multi-chain settlement) revisits.

**Verification (deferred to Windows-side):**
- `npm run typecheck` — should still show only the 4 known carry-forward errors. New code is fully typed; the AmService / AmEndpoint shapes are explicit. ROUTABLE_CAPABILITIES export is a `ReadonlySet<Capability>`.
- `npm run crawl` — fetches Agentic Market, paginates ~13 pages (~650 services), should produce on the order of 100–200 routable rows after the Base-only filter and per-service endpoint expansion. Then runs the seed (3 Infopunks rows) last.
- `npm run pipeline` — the prober (HEAD requests) runs against whatever's in the providers table, so it will start probing Agentic Market endpoints automatically. Latency / success rates will populate the scorecards for the new rows.
- `curl http://localhost:3000/rankings?capability=media` — should return rows once the crawl populates Media-category services.
- `curl http://localhost:3000/.well-known/trustbench.json` — capabilities array should now have 5 entries.

**Carry-forward to next session:**
- After the next `npm run crawl` + `npm run pipeline` run, sanity-check the registry: `select capability, count(*) from providers group by capability;` from Supabase. Expect a long-tail distribution with Search/Inference/Data/Media/Infra well-populated, and the non-routable categories (Travel/Social/Storage/Trading/Other) stored but dormant.
- Investigate whether the prober's HEAD probe needs adjustment for the new Agentic Market endpoint types. Some may be POST-only and require the same `metadata.x402_probe_method` + `x402_probe_body` pattern as the Infopunks seed.
- If Infopunks responds with their SDK pin, pivot back to P4-1b. The registry refresh is independent and stays valuable regardless.
- P4-bazaar (listing TrustBench's services on Agentic Market) is the next big sprint piece, but requires server-side x402 wire layer (~2 days of work) and is out of "while waiting" scope.

---

## 2026-05-06 — P4-1b unblock landed (Infopunks reply + v2 SDK swap)

**Trigger:** Infopunks replied 2026-05-06 confirming the diagnosis from yesterday's DM. Verbatim direction:
> "are you pinned to legacy x402@1.2.0? The cognition layer is emitting v2-style CAIP-2 network IDs like eip155:8453. Official Coinbase/x402 docs now say v2 uses CAIP-2 network identifiers such as eip155:8453 for Base, while legacy v1 used strings like base / base-sepolia. The migration docs also list the old monolithic x402 package as legacy and recommend current packages like @x402/core, @x402/fetch, @x402/evm, etc."

**Pre-flight package validation:**
- `npm view @x402/core @x402/evm @x402/fetch` confirmed all three exist at version 2.11.0. `@x402/evm` requires `viem ^2.39.3` (we were on 2.21.0, needed bump).
- Pulled the tarballs to /tmp and inspected `dist/cjs/**/*.d.ts` to map the API surface before changing package.json. Findings:
  - `@x402/core/types` exports `Network = `${string}:${string}`` (accepts CAIP form natively), `PaymentRequirements` (matches the merchant's raw accepts[0] shape with `scheme`, `network: Network`, `asset`, `amount`, `payTo`, `extra`, etc.), `PaymentPayload`, `PaymentRequired`, `PaymentPayloadResult`.
  - `@x402/core/http` exports `encodePaymentSignatureHeader(payload: PaymentPayload): string` (the v2 equivalent of `createPaymentHeader`).
  - `@x402/evm` exports `ExactEvmScheme(signer: ClientEvmSigner)` with `.createPaymentPayload(x402Version, paymentRequirements, context?)` returning `Pick<PaymentPayload, 'x402Version' | 'payload'> & {extensions?}`.
  - `ClientEvmSigner` is structural: just `{address: \`0x${string}\`, signTypedData(...): Promise<\`0x${string}\`>}`. A viem `LocalAccount` from `privateKeyToAccount` duck-types as a `ClientEvmSigner` directly.
- The high-level `wrapFetchWithPayment` from `@x402/fetch` is for the auto-pay-on-402 pattern (agent makes a request, gets a 402, SDK auto-retries with payment). We don't need it because TrustBench's `/route` quote is a separate step that has already extracted the requirements; we just need the lower-level "build the X-PAYMENT header from a known PaymentRequirements" path.

**Files changed:**

- `package.json` — dependencies: `x402: ^1.2.0` removed, `@x402/core: ^2.11.0` and `@x402/evm: ^2.11.0` added. devDependencies: `viem: ^2.21.0` → `^2.39.3` (peer requirement of @x402/evm). `@x402/fetch` not added — the lower-level @x402/core/http + @x402/evm path is sufficient.

- `scripts/paid-probe.ts` — v2 SDK swap. Imports replaced with `ExactEvmScheme` from `@x402/evm`, `encodePaymentSignatureHeader` from `@x402/core/http`, `PaymentPayload` and `PaymentRequirements` types from `@x402/core/types`. The v2 path now reads:
    ```ts
    const evmScheme = new ExactEvmScheme(account as any);
    const paymentRequirements = q.payment_requirements_v2 as unknown as PaymentRequirements;
    const result = await evmScheme.createPaymentPayload(2, paymentRequirements);
    const fullPayload: PaymentPayload = {...result, accepted: paymentRequirements};
    const xPayment = encodePaymentSignatureHeader(fullPayload);
    settlePayload = {x_payment: xPayment};
    ```
  Removed: `CAIP_TO_SDK_NETWORK`, `SDK_TO_CAIP_NETWORK`, `patchEnvelopeForCoinbaseV2()`, `normalizeForSDK()`, `SCRIPTS_PROBE_SKIP_NORMALIZE` env flag, `SCRIPTS_PROBE_APPLY_V2_PATCH` env flag. The v2 SDK accepts the merchant's raw `accepts[0]` shape directly (CAIP network names, `amount` instead of `maxAmountRequired`, `resource` as a nested object) per Infopunks's directive. Translation layer is moot.

  Kept verbatim: legacy `signEip3009` → `signature` path for mock-provider B-series compat. Mock-provider returns the v0.x flat shape with no `payment_requirements_v2`, so paid-probe falls through to the legacy path automatically. B1-B4 smoke tests stay green.

  Also kept: local-verify gate (recovers signer via viem to confirm crypto is sound before sending), validAfter/validBefore/skew clock log, raw `accepts[0]` log.

  Server side `src/route-handlers.ts` settleHandler is unchanged. It already accepts both `{route_id, signature}` (legacy) and `{route_id, x_payment}` (SDK pre-built); the `x_payment` field is forwarded as the `X-PAYMENT` header to the merchant verbatim.

- `project_p4_1b_state_2026_05_06.md` (memory) — frontmatter retitled "v2 SDK swap landed, awaiting user-side npm install + live retry". State summary updated. Operational runbook refreshed with the npm install + dry-run + live retry sequence.

- `MEMORY.md` — pointer updated.

**Why we kept the dual-path (v2 SDK for real merchants, legacy `signEip3009` for mock):**

The mock-provider in `scripts/mock-provider.ts` returns a v0.x flat 402 challenge that doesn't include `accepts[0]`. TrustBench's `route-handlers.probeFor402Challenge` reads the v0.x top-level fields and produces a `PaymentRequired` with no `payment_requirements_v2`. paid-probe then falls into the legacy branch which uses `signEip3009` (hand-rolled viem typed-data sign) to produce a 65-byte signature. Server's settleHandler reconstructs the X-PAYMENT envelope from that signature. This is all unchanged. The B-series (B1-B4) idempotency and replay smoke tests run through this path and are unaffected by the v2 SDK swap.

If we ever migrate the mock to emit v2 shape, we can remove the legacy path. Not urgent.

**Failure-mode analysis (per high-risk-surface rule):**

- If `ExactEvmScheme.createPaymentPayload` rejects the raw `accepts[0]` for any reason (zod schema mismatch, missing field, etc.), it throws synchronously. The catch in the main loop logs `[probe] FAIL sign` and no money moves. Same safety profile as before.
- If the SDK signs but with a wrong wallet or wrong typed-data domain, the local-verify gate (`recoverTypedDataAddress`) catches it: `recovered != authorization.from` would log mismatch. We send anyway (the gate is diagnostic, not blocking) but the facilitator would reject and no money moves.
- If the SDK signs correctly and the facilitator accepts, the merchant returns 200 with `tx_hash`, and we get a receipt. First paid receipt against a real x402 provider.
- If the SDK signs correctly but the facilitator rejects, Infopunks said they'd add facilitator-side logging in time for our retry — so the rejection now produces a real cause. We act on it.
- The `account as any` cast on `ExactEvmScheme(account as any)` is purely a type accommodation: viem's `LocalAccount.signTypedData` has a more strictly-typed generic signature than the SDK's `Record<string, unknown>` shape, but the runtime call is interchangeable. No runtime risk.
- The `q.payment_requirements_v2 as unknown as PaymentRequirements` cast is also a type accommodation: the server returns `Record<string, unknown>` for the raw envelope, the SDK expects the named type, but the SDK's zod-validation runs at runtime regardless of TS types. If the merchant emits a malformed shape, the SDK rejects synchronously.

**Smoke-test plan (deferred to user-side; bash sandbox can't reach Windows mount reliably):**

```powershell
cd C:\Users\Lithv\Documents\Claude\Projects\TrustBench
npm install                                    # pulls new deps, removes x402
npm run typecheck                              # only 4 carry-forward errors expected
npm run mock-provider &                        # background, in another shell
$env:SCRIPTS_PROBE_API_KEY = ...               # same env block as before
$env:SCRIPTS_PROBE_DRY_RUN = 'true'
npm run paid-probe                             # dry mock-provider; legacy path
# Should log: [probe] DRY ... path=legacy (mock has no payment_requirements_v2)

# Then point at Infopunks via Railway (or local against Infopunks):
$env:TRUSTBENCH_BASE_URL = 'http://localhost:3000'  # or production URL
$env:SCRIPTS_PROBE_CAPABILITIES = 'data'
npm run paid-probe                              # dry-run; v2 path
# Should log:
#   [probe] DEBUG raw merchant accepts[0]: {...}
#   [probe] DEBUG v2 envelope built (x402Version=2, payloadKeys=signature,authorization)
#   [probe] DEBUG envelope clock: ... skew=...s
#   [probe] DEBUG local-verify recovered=0x547C... expected=0x547C... match=true
#   [probe] DRY ... path=sdk

$env:SCRIPTS_PROBE_DRY_RUN = 'false'
npm run paid-probe                              # LIVE retry against Infopunks
# Expected:
#   [probe] OK data:...  receipt=rcpt_...  ###ms
# OR (if facilitator still rejects but with fresh logging on Infopunks's side):
#   [probe] FAIL settle ... status=502 ... <specific cause>
```

If live succeeds: that's the first paid receipt against a real x402 provider. DM @InfopunksHQ with `https://trustbench.io/receipts/<id>` and the verifier instructions; they committed to amplifying ("first external evidence trail through the cognition layer").

**Resource-URL scheme bug Infopunks flagged separately:**

In our raw `accepts[0]` packet, Infopunks noticed `resource.url` was emitted as `infopunks-cognition-layer-x402.onrender.com/v1/simulate-narrative` (host-only, no scheme) instead of fully-qualified HTTPS. They're patching cognition to make resource URLs always fully-qualified for Bazaar / validators / external SDKs. (Note: the Cowork chat-markdown auto-linkifier rendered both versions identically in the chat paste, but the bug is real on their side. Not a TrustBench-side issue.) Once they patch, the next probe should pull the corrected envelope and the client side automatically uses it.

**Carry-forward to next session:**
- If user runs the dry-run + live attempt and gets a clean receipt → DM @InfopunksHQ with the receipt URL, mark P4-1b shipped, switch to P4-2 (public receipt explorer) per the original Phase 4 plan.
- If live still rejects → wait for Infopunks's facilitator-side logging to give us a real cause, then patch in `paid-probe.ts` (likely a small shape adjustment).
- If npm install fails (peer-dep conflict, etc.) → report the error; the SDK swap is the right direction even if there's a transient package-resolution issue.

---

## 2026-05-06 — P4-1b SHIPPED (full session retrospective)

**Ship state:**
- Public Railway-issued receipt: `rcpt_01KQY7C44GAPSXZPFQYRZ1D10C` at `https://trustbench-production.up.railway.app/receipts/rcpt_01KQY7C44GAPSXZPFQYRZ1D10C`.
- On-chain: tx `0x3e6d6078c092f6a1f7be95bbb387b9dbfdc3d9471f21bad7859514fab1997a41` settled at Base block 45633871, payer `0x547C2c615b227800D56b5ed24021C2CbCa0a3057` → payee `0xe4E8908308a86aB43E5dEb6C0fd0F006786104c3`, 0.01 USDC.
- Verifier output: `✅ SIGNATURE VALID — receipt is authentic.` + `✅ ON-CHAIN VERIFIED — the receipt matches the actual transaction.` No overrides needed; default `verify-receipt.js` against the Railway URL works out of the box.
- Local-issued precursor receipt (before BASE_URL flip): `rcpt_01KQY629W1HWJW19E87ECR4ZTR`, tx `0x706d3f16df8490785855cabb1ff9b9ba5673e2d154a9e253d5b3210b9541bb6e` block 45633185. Has `public_key_url: "https://trustbench.io/.well-known/trustbench-pubkey"` (DNS not wired); verifies with `--pubkey-url` override pointing at Railway. Stays valid as historical artifact.
- Orphan tx (no receipt): `0xe77c9af41042253c1c2851ec34036a764f0425155c43fc1fbb592bd02e5934b2`, ~0.01 USDC. Issued during diagnostics: the 6,444-byte X-PAYMENT envelope reached Render's header-size limit (431) on the first hop, but the on-chain settlement still landed via the CDP facilitator's async path. We can backfill a receipt for this tx via a one-shot script later if symmetry matters; for now it stays as proof that the architecture works even when the audit trail breaks.

**Five-fix retrospective (in order discovered + landed):**

1. **Legacy `x402@1.2.0` package was the wrong SDK.** Targets x402 v1, throws `Unsupported network` on CAIP-form `eip155:8453`. Replaced with the modular v2 packages (`@x402/core` + `@x402/evm` at 2.11.0). 440 transitive packages dropped, 2 added. `viem` bumped from `^2.21.0` to `^2.39.3` to match @x402/evm peer dep.
2. **Normalization layer was solving a phantom problem.** `normalizeForSDK` (CAIP→base, amount→maxAmountRequired, object→string resource) existed because v1 zod rejected the merchant's raw shape. v2 SDK accepts the raw `accepts[0]` directly. Removed the entire normalization helper plus `patchEnvelopeForCoinbaseV2` and the two env-flag toggles.
3. **Slim `accepted` before encoding.** Infopunks's `accepts[0]` includes ~5.9 KB of OpenAPI input/output schemas embedded in `resource`. Spreading the raw value into `PaymentPayload.accepted` produces a ~6.4 KB X-PAYMENT envelope that Render rejects with HTTP 431 *before the facilitator sees the request*. Fix: build `accepted` with only the 7 spec PaymentRequirements fields plus a string-form `resource.url`. Envelope drops to ~1 KB raw (~1.4 KB base64). 8x reduction.
4. **Async-settlement merchants don't emit `X-PAYMENT-RESPONSE`.** Coinbase CDP-mediated providers (Infopunks specifically) verify the X-PAYMENT with the facilitator, return 200 with their domain response synchronously, and let the actual `transferWithAuthorization` settle on-chain a few seconds later. The tx_hash is never in the merchant's HTTP response. Fix: in `settleHandler`, when `parseTxHashFromResponse` returns null, fall back to a Base RPC `getLogs` query for `AuthorizationUsed(authorizer, nonce)` keyed off the EIP-3009 nonce we already have in the X-PAYMENT envelope. 4 retries at 1.5s intervals covers the typical async-settle window. Architecturally cleaner than trusting merchant claims because the chain is the source of truth.
5. **Railway was on pre-Phase-3 code.** `git status` revealed every Phase 3 source file, every Phase 4 doc, every script and design sketch was untracked. The "stale Phase 3 code on Railway" memory entry from earlier was understated; Railway was actually on whatever was in git before Phase 3 started. One ~13K-insertion commit landed all of Phase 3 + Phase 4 publishable work. After Railway redeployed, the receipt that local-server had issued was already publicly fetchable because Railway and local share the same Supabase project.

**Engineering decisions worth keeping:**

- **Trust the chain, not the merchant.** The chain-lookup fallback isn't a workaround for Infopunks; it's the architecturally correct settlement-observation pattern for non-custodial routing. A merchant claiming a tx happened that didn't would just produce no log match → null → 502, no receipt. If we ever ship our own merchant-side x402 layer (P4-bazaar), it should still emit `X-PAYMENT-RESPONSE` for the fast path, but consumers should treat it as advisory and chain-verify when audit matters.
- **Detached signature on receipts is load-bearing.** The same Ed25519 receipt verifies under any TrustBench instance because `public_key_url` isn't part of the signed bytes. Saved us from having to re-sign existing receipts when the BASE_URL env flip changed embedded URLs. Also makes future infrastructure migrations (custom domain, multi-region) painless.
- **Slim envelope is more than a Render workaround.** Even merchants without 431 limits would prefer ~1 KB envelopes over ~6 KB ones. The slim is now baseline.

**Operational notes worth keeping:**

- **Stale `.git/index.lock` is most often VSCode's source-control panel.** Close VSCode (or SourceTree, GitHub Desktop) before any committing-via-CLI work. `Remove-Item .git\index.lock` is the recovery; safe as long as no other git process is actually running (`Get-Process git -ErrorAction SilentlyContinue` to confirm empty).
- **PowerShell + multi-line `git commit -m "..."` doesn't always close cleanly.** Use `Out-File commit-msg.txt -Encoding utf8` + `git commit -F commit-msg.txt` for any commit with linebreaks, code blocks, or special chars. Removes the heredoc-quoting fragility.
- **PowerShell treats `<` as a redirect operator.** Don't paste shell commands with `<placeholder>` literals — substitute first or wrap in single quotes.

**Carry-forward state:**

- Wallet `0x547C2c615b227800D56b5ed24021C2CbCa0a3057` at ~29.97 USDC (started 30.00, three on-chain settles at 0.01 each).
- Railway `BASE_URL` env now `https://trustbench-production.up.railway.app`. trustbench.io DNS still not wired; future polish item. Once DNS lands, can flip BASE_URL back to canonical brand URL and old receipts (the local-issued one) become verifiable without override too.
- Diagnostic logs in `settleHandler` (response headers + body dump) should be removed before any public traffic — they're useful for partner-debug rounds but bloat prod logs. Tracked as a small Phase 4 polish.
- Two registry-quality follow-ups still parked: stripping template URLs (`{task-id}`, `{chainNetwork}`) from the crawler output, and pruning rows that didn't show up in the latest Agentic Market crawl.

**Next sprint item per `phase4-kickoff.md`:** P4-7 — Strict reservation-based spend caps. Two-signal validation (Infopunks + CLU_AGENT) bumped this up from the deferred bottom. Design sketch already in `phase4-spend-caps-reservation.md`. Estimated ~1 day of focused work; smoke plan C1-C4 is the load-bearing test.

---

## 2026-05-06 — CLU_AGENT external signal → P4-7 priority bump

**Trigger:** CLU_AGENT (automated by @Logik185) replied to the 2026-05-05 X post about /route + spend caps + Ed25519 receipts. Captured in `phase4-clu-agent-handoff.md`. The substantive line:

> "Idempotency keys + server-side caps are the floor. We found Ed25519 receipts alone don't catch sybil double-spend on the relay layer — need per-agent spend bucket + per-call timeout reversion. L402 primitives work, but the audit tail is where most teams slip."

**Signal extraction:** "per-call timeout reversion" is an external naming of the gap CLAUDE.md already flags as a Phase 3 limit — "Spend caps are approximately enforced under concurrency. The check reads the rolling-window total at quote time; under N concurrent in-flight quotes for the same agent, total spend can overshoot by up to `(N − 1) × max_price`." This is **P4-7 — Strict reservation-based spend caps** in the kickoff doc.

**Two-signal validation:** the framing now has independent corroboration from two external sources:
1. Infopunks's Phase 2 conversations + 2026-05-04 cognition launch where they framed receipts/audit-trail as "the audit tail is where teams slip" (which is what their cognition-layer framing also reflects).
2. CLU_AGENT's 2026-05-06 X reply naming "per-call timeout reversion" as a gap.

**The strawman in the reply** ("Ed25519 receipts alone don't catch sybil double-spend") doesn't land — we have idempotency and caps too, not just receipts. Don't take that part literally. The reservation/release implication stands separately and is the load-bearing point.

**Priority bump landed in `phase4-kickoff.md`:**

Old sprint order (item 8+): `P4-1b unblock → P4-2 → P4-6 → original order`.

New sprint order from item 8 onward:
1. P4-1b unblock (in flight 2026-05-06).
2. **P4-7 — strict reservation-based spend caps** (bumped from the deferred bottom).
3. P4-bazaar (server-side x402 wire layer + service listings; ~1.5–2 weeks).
4. P4-2 — public receipt explorer.
5. P4-6 — formal Infopunks integration.
6. Original order: P4-3 (Solana) → P4-4 (npm package) → P4-5 (receipt-spec docs) → P4-8 → P4-9 → P4-10 → P4-11.

**Why P4-7 is also the easiest of the deferred items, technically:** the existing `requireWithinSpendCap` middleware in `src/spend-caps.ts` reads the rolling-window total at quote time and rejects if `total + max_price > cap`. The reservation pattern adds two changes: (a) at quote issuance, atomically debit a `pending_spend_atomic` counter on the agent row; (b) at settle (or quote expiry), credit it back. The hard cap then becomes `total_spent + total_pending + max_price > cap`. ~1 day of focused work, server-side only, smoke-testable with a quick concurrency harness. The two external signals just confirm the priority; they aren't load-bearing for the implementation.

**Optional X reply (em-dash-free per outreach memory, draft):**

> You're naming the reservation/release gap on the quote→settle window. Today's caps are server-side hard caps per-agent + per-call, approximate under concurrency. Strict reservation lands as P4-7. Idempotency for replay, receipts for audit, reservation as the third leg.

Unsent at session close. Send if it feels right; the prioritization implication stands either way.

**@Logik185 (the human operator):** worth adding to Grok-side X research for partnership/reach context. The automated reply is technically substantive, suggests the operator has thought about agent-payment infra seriously. Not on the urgent path.

**Carry-forward to next session:**
- After P4-1b ships (live receipt), P4-7 is the next sprint piece. Read `src/spend-caps.ts` first; the change is small but the failure mode (over-reservation, deadlock, or under-release on partial settle) needs careful handling.
- Update receipt schema / `receipt-spec-v1.md` is NOT required for P4-7 — reservation state is an internal `agents.pending_spend_atomic` counter, not a receipt field. No external compatibility break.
- The handoff doc `phase4-clu-agent-handoff.md` can stay at root as a historical anchor; the actionable bits are now in this lessons entry + the kickoff sprint table + the new memory entry.

---

## 2026-05-06 (afternoon) — Pay.sh response sprint + Edit-tool truncation re-bit

**What shipped (4 moves in one batch, Pay.sh response):**
1. `pay-sh-provider-triage.md` — categorization of all article-named providers vs Agentic Market vs pay-skills GitHub (9 committed providers vs the article's "50+" headline).
2. `phase4-p4-3-timing.md` — three-option decision doc (display-only vs display+route-flag vs full Solana settlement); recommendation is Option A within 48h, Option C deferred until 3rd paid partner.
3. Public copy reframe: `src/landing-html.ts` (hero h1 + description + Registry card), `README.md`, `llms.txt`, `skill.md`. Single theme: "cross-network registry, Base routing today, Solana next, protocol-agnostic over time across x402, p402, MPP."
4. `pay-sh-amplification-draft.md` — three X-post drafts for Grok hand-off (drafts 1-2 safe today, draft 3 holds until Option A ships).

`tsc --noEmit` clean after the run. `MEMORY.md` updated with `project_pay_sh_launch_2026_05_06.md`.

**Edit-tool truncation re-bit me on three files in a row.**

The Edit tool's success message is *not* a guarantee that the on-disk file reflects the cached view. After editing `src/landing-html.ts`, `skill.md`, `README.md`, and `llms.txt` via Edit, all four were silently truncated on disk (mid-line, no newline). The harness Read tool happily showed the "expected" content for each, but bash via `wc -l` and `tail -c` revealed the actual on-disk byte count was much shorter. `tsc --noEmit` caught `landing-html.ts` (broke a template literal). The other three were content-only files so tsc didn't catch them — only `tail` did.

**Symptom signature:**
- File ends mid-line with no trailing newline.
- `tail -c 1 file | xxd -p` is the cheapest detector — final byte should be `0a` for files we wrote with proper line endings, anything else is suspicious.
- `wc -l` returns fewer lines than `Read` shows.
- The Read tool returns the harness's cached view, NOT the actual file. Editing then re-Reading proves nothing.

**Mandatory new step after any Edit + before declaring "done":**

```sh
# Cheap on-disk integrity check — run after any Edit-tool batch
for f in <list of files just edited>; do
  LASTBYTE=$(tail -c 1 "$f" | xxd -p)
  LINES=$(wc -l < "$f")
  echo "$f: $LINES lines, last byte hex=$LASTBYTE"
done
```

If `LASTBYTE != 0a` for a markdown / TS / config file, the file is truncated. Fix with either `cat >> file << 'EOF' ... EOF` (append the missing tail using the Read-cached canonical content) or re-Write the full file via the Write tool.

**The deeper rule (now repeated several times in this lessons file):** the harness Read tool and bash see different states. **Bash is the source of truth for what is actually on disk.** Never declare a file "saved" without a bash-side verification.

This is at least the third occurrence of this pattern (chat-markdown linkifies, Read-vs-bash truncation, now Edit-vs-bash truncation). Build the verification into the workflow next time:

> After any non-trivial Edit batch, run a one-liner that prints `wc -l` + `tail -c 1 | xxd -p` for every edited file, and only then call `tsc --noEmit` and declare done.
existing `requireWithinSpendCap` middleware in `src/spend-caps.ts` reads the rolling-window total at quote time and rejects if `total + max_price > cap`. The reservation pattern adds two changes: (a) at quote issuance, atomically debit a `pending_spend_atomic` counter on the agent row; (b) at settle (or quote expiry), credit it back. The hard cap then becomes `total_spent + total_pending + max_price > cap`. ~1 day of focused work, server-side only, smoke-testable with a quick concurrency harness. The two external signals just confirm the priority; they aren't load-bearing for the implementation.

**Optional X reply (em-dash-free per outreach memory, draft):**

> You're naming the reservation/release gap on the quote→settle window. Today's caps are server-side hard caps per-agent + per-call, approximate under concurrency. Strict reservation lands as P4-7. Idempotency for replay, receipts for audit, reservation as the third leg.

Unsent at session close. Send if it feels right; the prioritization implication stands either way.

**@Logik185 (the human operator):** worth adding to Grok-side X research for partnership/reach context. The automated reply is technically substantive, suggests the operator has thought about agent-payment infra seriously. Not on the urgent path.

**Carry-forward to next session:**
- After P4-1b ships (live receipt), P4-7 is the next sprint piece. Read `src/spend-caps.ts` first; the change is small but the failure mode (over-reservation, deadlock, or under-release on partial settle) needs careful handling.
- Update receipt schema / `receipt-spec-v1.md` is NOT required for P4-7 — reservation state is an internal `agents.pending_spend_atomic` counter, not a receipt field. No external compatibility break.
- The handoff doc `phase4-clu-agent-handoff.md` can stay at root as a historical anchor; the actionable bits are now in this lessons entry + the kickoff sprint table + the new memory entry.

---

## 2026-05-06 (afternoon) — Pay.sh response sprint + Edit-tool truncation re-bit

**What shipped (4 moves in one batch, Pay.sh response):**
1. `pay-sh-provider-triage.md` — categorization of all article-named providers vs Agentic Market vs pay-skills GitHub (9 committed providers vs the article's "50+" headline).
2. `phase4-p4-3-timing.md` — three-option decision doc (display-only vs display+route-flag vs full Solana settlement); recommendation is Option A within 48h, Option C deferred until 3rd paid partner.
3. Public copy reframe: `src/landing-html.ts` (hero h1 + description + Registry card), `README.md`, `llms.txt`, `skill.md`. Single theme: "cross-network registry, Base routing today, Solana next, protocol-agnostic over time across x402, p402, MPP."
4. `pay-sh-amplification-draft.md` — three X-post drafts for Grok hand-off (drafts 1-2 safe today, draft 3 holds until Option A ships).

`tsc --noEmit` clean after the run. `MEMORY.md` updated with `project_pay_sh_launch_2026_05_06.md`.

**Edit-tool truncation re-bit me on FOUR files in this session.**

The Edit tool's success message is *not* a guarantee that the on-disk file reflects the cached view. After editing `src/landing-html.ts`, `skill.md`, `README.md`, `llms.txt`, AND `lessons.md` via Edit, all five were silently truncated on disk (mid-line, no newline) while the harness Read tool happily showed the "expected" content. `tsc --noEmit` caught `landing-html.ts` (broke a template literal). The other four were content-only files so tsc didn't catch them — only `wc -l` + `tail -c 1 | xxd -p` did.

**Symptom signature:**
- File ends mid-line with no trailing newline.
- `tail -c 1 file | xxd -p` is the cheapest detector — final byte should be `0a` for files we wrote with proper line endings, anything else is suspicious.
- `wc -l` returns fewer lines than `Read` shows.
- The Read tool returns the harness's cached view, NOT the actual file. Editing then re-Reading proves nothing.

**For lessons.md specifically (extra-painful failure mode):**
The harness reported the Edit succeeded, but on-disk inspection showed the file was already truncated AND the new content never reached disk. The Edit tool wrote into the cache layer but the cache→disk flush is unreliable for files that were already in a corrupt state. Recovery: bash `cat >> file << EOF` is durable; the harness Edit on a pre-truncated file is not.

**Mandatory new step after any Edit + before declaring "done":**

```sh
# Cheap on-disk integrity check — run after any Edit-tool batch
for f in <list of files just edited>; do
  LASTBYTE=$(tail -c 1 "$f" | xxd -p)
  LINES=$(wc -l < "$f")
  echo "$f: $LINES lines, last byte hex=$LASTBYTE"
done
```

If `LASTBYTE != 0a` for a markdown / TS / config file, the file is truncated. Recovery options, in order of reliability:
1. `cat >> file << 'EOF' <missing-tail-from-Read-cached-view> EOF` — bash append, durable.
2. `Write` the entire file fresh from cached content — works if you have the full content.
3. Re-Edit — DOES NOT WORK if the file is already truncated. Don't try.

**The deeper rule (now repeated multiple times in this lessons file):** the harness Read tool and bash see different states. **Bash is the source of truth for what is actually on disk.** Never declare a file "saved" without a bash-side verification.

This is now at least the third major occurrence of this pattern (chat-markdown linkifies, Read-vs-bash truncation, Edit-vs-bash truncation with the additional Edit-doesn't-flush-to-corrupt-files variant). Build the verification into the workflow next time:

> After any non-trivial Edit batch, run a one-liner that prints `wc -l` + `tail -c 1 | xxd -p` for every edited file. If anything is truncated, fix with bash `cat >>` (NOT another Edit). Only then call `tsc --noEmit` and declare done.



---

## 2026-05-08 — Windows mount drift on Linux-side `tsc` (false-positive verification failures)

After editing `src/methodology-html.ts` to update the Phase 4 roadmap rows, Linux-side `npx tsc --noEmit` reported `error TS1002: Unterminated string literal` at line 159 col 69. The Read-tool view of line 159 showed the line intact: `const statusLabel = status === 'done' ? 'DONE' : status === 'current' ? 'CURRENT' : 'FUTURE';` — perfectly valid TypeScript.

`sed -n '155,165p' | cat -A` from bash confirmed the issue: line 159 truncated mid-string at column ~69 (`'curre` cut off). The actual file on the Windows side was fine; the Linux mount view was stale / partially-flushed. PowerShell-side `npx tsc --noEmit` ran clean with no errors and PowerShell `git diff HEAD` showed the expected three-file changeset with no string-literal corruption.

**Lesson learned:** When `tsc` from the Linux mount fails with errors that don't match the Read-tool view of the file, and the syntax error is at a column that's "almost-but-not-quite end-of-line," it's almost certainly a mount drift artifact, not a real bug. Verify from PowerShell before treating as a real failure.

This is consistent with the pattern recorded in `feedback_windows_mount_truncation` memory and the multiple prior occurrences in this lessons file. The cross-platform write semantics under the Cowork mount setup don't always propagate atomically — bash sees a transitional state.

**Carry-forward verification protocol (when an edit batch finishes and Linux-side `tsc` fails):**

1. Read the failing line via the Read tool — does the visible content match the error?
2. If the Read view is correct, run PowerShell-side: `cd <repo>; npx tsc --noEmit; git diff HEAD -- <files>`
3. If PowerShell agrees the file is correct, commit and push. The Linux mount will catch up.
4. Only treat the Linux error as real if PowerShell-side reproduces it.

The previous lessons-file entries about this pattern recommended `cat >> file << 'EOF'` as the recovery for actual truncation. That recovery is still valid for the truncation case. The new finding here is specifically about *false-positive `tsc` errors* — when no content is actually missing, just transitional. Skip the cat-recovery for this case; just verify on Windows and proceed.

---

## 2026-05-08 — Stale `.git/index.lock` after interrupted Linux-side git operation

When verifying methodology-html.ts edits on the Linux side (during the PowerShell-vs-Linux mount-drift investigation), I attempted `cd <repo> && git stash; npx tsc --noEmit; git stash pop` to test the file against HEAD without my edits. The `git stash` failed with `unable to unlink '...index.lock': Operation not permitted`. The error was the Cowork sandbox's lack of unlink permission on the mounted `.git/` directory.

The lock file remained after this failure. PowerShell-side `git add` and `git commit` then both failed with `fatal: Unable to create '...git/index.lock': File exists.` — the lock was stuck.

Fix from PowerShell: `Remove-Item .git\index.lock` (works because PowerShell has unlink permission Windows-side; the Linux sandbox didn't). After deletion, `git add → git commit → git push` succeeded normally.

**Lesson learned:** The Cowork Linux sandbox lacks unlink permission on certain `.git/` directory entries that Windows owns. Any git command that needs to create/remove a lock (stash, commit, rebase mid-flight, etc.) can fail mid-operation and strand state.

**Carry-forward — operational rules:**

1. **Never run `git stash`, `git rebase`, or `git commit --amend` from the Linux sandbox.** Use the Bash tool for read-only git operations (status, diff, log, show) but not for any operation that takes the index lock. Run write-path git commands from PowerShell.
2. **Read-only git is fine on the Linux side:** `git diff HEAD`, `git status`, `git log`, `git show`. These don't take the index lock.
3. **If a stale lock is suspected** (operations failing with `index.lock: File exists`), run `Remove-Item .git\index.lock` from PowerShell. It's a one-line fix.
4. **Recovery is robust:** the lock file isn't holding any data, just a flag. Deleting it doesn't lose work.

---

## 2026-05-08 — Grok anchor-rule slippage on partnership-shaped X drafts

Grok's daily X scan returned 5 A-tier reply drafts. Three of the five (drafts 2, 3, 5) opened with phrases that quoted 5+ words verbatim from the source tweet:

- Draft 2 (@0xAggelos): *"audit trail is one of the parts people underestimate"* — 9 words, near-verbatim from his post (*"audit trail is one of the parts I think people underestimate"*).
- Draft 3 (@Kaelai_): *"sending side with budget controls, compliance, audit trails is enterprise grade"* — 11 words, near-verbatim.
- Draft 5 (@PharosInsights): *"can this agent prove it was allowed to act"* — 9 words, exactly verbatim from his post.

The briefing rule is unambiguous (`grok-x-research-briefing.md` § 6 rule 1 + § 7 antipattern): anchor on a 2–4 word phrase, write your own sentence around it. Verbatim openers read as paste-jobs and burn characters. The rule was correctly stated; Grok's drafting discipline slipped.

**Compounding issue in draft 3:** the same draft also said *"endpoints are x402-paywalled, small per-call fees, no subs"* — present tense overclaim, since the x402-paywalled API isn't live yet (it's the Phase 4b in-flight item). Briefing § 6 rule 10 requires re-checking the live-vs-soon split before drafting tense-honest claims.

**Lesson learned:** A workflow rule named in the spec doesn't enforce itself. Grok needs an explicit pre-draft check step:

1. Identify the 2–4 word anchor phrase from the source tweet.
2. Count words. If anchor > 4 words, rewrite shorter.
3. Write the reply with the anchor *embedded*, not as opening clause.
4. Re-check § 1 of briefing for live-vs-soon. Anything claimed as live must actually be live.

**Carry-forward:** when reviewing Grok's daily output, count words in the anchor phrase before approving. If 5+ words from the source post appear contiguously in the draft, send it back for rewrite. This was already in the briefing as anti-pattern but wasn't being enforced at review time. Enforce it now.

---

## 2026-05-08 — Verify-before-positioning (the AgentLog → reliability pivot pattern, generalized)

Three verification sprints in the 72-hour window (AgentLog wedge, reliability pivot, Strata) followed the same pattern: a strategy concept doc was drafted with a confident claim about lane availability (*"There are no direct competitors currently"* / *"No dominant independent reliability layer exists"*), then a 60–90-minute verification sprint disproved the claim each time. AgentLog had 9 verified competitors. Reliability pivot had 9. Strata research surfaced 3 different "Strata"s (one of which is YC X25 and unrelated to the partner who DM'd us).

The pattern: in the AI infrastructure space in 2026, every plausible-sounding wedge has 5–20 funded teams shipping in parallel. Surface-level desk research underestimates competitive density 3–5x. The only reliable way to know is a focused web-search verification sprint.

**Lesson learned:** When a strategy concept makes a *"the lane is open"* claim, treat it as a hypothesis, not a fact. Run the verification sprint *before* writing the concept doc, not after. The research takes ~1 hour; writing a concept doc against an unverified claim wastes a day.

The discipline applies symmetrically: a *"the lane is closed"* claim also needs verification. The reliability-pivot concept doc was eventually rejected because verification surfaced PaySentry, PEAC, x402station, etc. — but the concept doc's *original* claim that the lane was open was the unverified part. Both directions of claim deserve the same skepticism.

**Carry-forward — pre-strategy verification protocol:**

1. **Before drafting any concept doc that asserts lane availability**, do a 30-minute web-search sweep using at least three search angles (the obvious one, an adjacent-product angle, a recent-launches angle). Target finding 10 candidate competitors.
2. **For each candidate, fetch the landing page** (or at minimum a credible third-party description). Verify the product is live, its scope, its pricing if public.
3. **Document findings in a verification report** (`<concept>-verification-YYYY-MM-DD.md`) with a table format and explicit threat ratings.
4. **Only after verification, draft the concept doc.** The concept doc cites the verification as ground truth and stays calibrated to actual lane density.

This is the pattern used successfully on 2026-05-07 to kill AgentLog cleanly (no engineering investment) and to reroute the reliability-pivot direction. Bake it into the workflow.

---

## 2026-05-10 — Critic pass workflow rule + founder-shape calibration added to CLAUDE.md

**What changed.** Added two workflow rules to CLAUDE.md as the lightweight first-pass version of two patterns surfaced during the ProjectAutonomous strategic-read exercise:

1. **Critic pass on high-risk diffs** (`CLAUDE.md` § "Critic pass on high-risk diffs (added 2026-05-10)" + new `prompts/critic.md` file). Before shipping any high-risk-surface change (signing, payment construction, idempotency, spend caps, receipts, public framing), run an adversarial review producing 3 specific rejection reasons + counter-thesis + named wedge competitor + hidden assumption + kill criterion + verdict. Strong-reject verdicts pause the change and require Johan approval.

2. **Founder-shape calibration block** (`CLAUDE.md` § "Founder-shape calibration (added 2026-05-10)"). Explicit capital position, energy budget this quarter, skills building/avoiding, what bores me, risk tolerance. Applied during Critic passes and idea-scoping to filter wrong-shape suggestions before they consume solo-founder weeks.

**Why now.** ProjectAutonomous Slice 2 (buildroom contract chain) will eventually ship a structured Critic agent with schema-backed receipts. That's a weekend of work. The lightweight CLAUDE.md version derisks the structured build: if the Critic pass surfaces real failure modes over the next 2-3 high-risk diffs, the structured version is validated. If it produces only vague pessimism or rubber-stamp verdicts, the prompt needs sharpening before committing infrastructure.

**Carry-forward signals to watch.**
- After 3 Critic passes on real high-risk diffs: are the rejection reasons sharp enough to catch something self-review missed? If yes, structured Critic agent build is validated. If no, the prompt needs sharpening.

---

## 2026-05-13 — Validator-green vs indexer-required is a three-stage protocol (Stone 0)

**What we learned.** For x402 + CDP Bazaar indexing, the protocol has three correctness stages and the seller diagnostic only covers the first two:

1. **402 emission correctness** — what the server returns. `agentic.market/validate` checks this. Validator-green means stage 1 is correct.
2. **Settlement correctness** — what the facilitator accepts. Confirmed on-chain by a successful settle. Our six settles 2026-05-12 → 2026-05-13 09:19 UTC were all stage-2 correct.
3. **Discovery-metadata propagation correctness** — what the facilitator's `extractDiscoveryInfo(paymentPayload, paymentRequirements)` sees during settle. **Reads exclusively from `paymentPayload.extensions[BAZAAR.key]` per `node_modules/@x402/extensions/dist/cjs/bazaar/index.js:607-670`.** The 402 body's outer `extensions` field is invisible to this function. Stage 3 requires the agent's X-PAYMENT envelope to **echo** `extensions` from the 402.

Reference x402 clients (`@coinbase/x402-axios`, the Express paymentMiddleware) auto-propagate. Hand-rolled wallets don't. Our smoke wallet was hand-rolled, so we passed stages 1 + 2 cleanly for six settles and failed stage 3 invisibly. Indexing only fired after the one-line fix: pass the captured 402.extensions through into the signed PaymentPayload.

**Why it took so long.** Stage 3 has no error message. The facilitator silently `console.warn`s on its own side when `extractDiscoveryInfo` returns null; we never see it. The seller diagnostic does not exercise stage 3 because it doesn't simulate a real round-trip. The catalog endpoint returns the same 404 whether the route was never declared, was rejected, or was simply never settled-with-extensions — the failure shapes are indistinguishable from the outside.

**How to detect this class of bug going forward.** Before burning settles on any future bazaar-extension change:

1. Run `scripts/validate-bazaar-extension.cjs` — zero-cost, runs `validateDiscoveryExtension` against the live 402's bazaar block. Eliminates Stone 4 cleanly.
2. Manually base64-decode the X-PAYMENT envelope our smoke wallet sends and verify `payload.extensions.bazaar` is present. Mirror what a reference client would do.
3. Read the actual shipped `@x402/extensions` SDK source (`node_modules/@x402/extensions/dist/cjs/bazaar/index.js`) for the indexer's extraction function, not the docs. Vendor docs lagged the package shape twice on this project already (the fake `info: { name, description, category }` block + the fake `dynamic-routes pattern`, both WebSearch-snippet hallucinations resolved 2026-05-11).

**Carry-forward for partner integrations.** Any future partner who rolls their own x402 client (rather than using a reference Coinbase client) needs the same echo, or their settles won't trigger their own Bazaar indexing. Surface this in skill.md / partner-integration docs whenever we ship one.

---

## 2026-05-13 — External-LLM audit handoff when stuck on a hard problem

**What we learned.** When a debugging path has run out of obvious next moves (validator green, smoke 4/4, real settles succeeding, indexing still 0 after six attempts), the highest-leverage move is:

1. **Write a self-contained .md audit document** that captures the goal, the canonical mechanism, every fix attempted, every hypothesis ruled in/out, all observable state via live probes, and verbatim code excerpts of the suspect surfaces.
2. **Hand it to multiple external LLM reviewers** (we used Grok and ChatGPT) for independent verification.
3. **The audit-writing process itself surfaces new insight.** On 2026-05-13 the load-bearing finding (Stone 0 — `extractDiscoveryInfo` reads from `paymentPayload.extensions`, not the 402 body) was surfaced *while writing* the audit's § 9 "stones we may not have turned," because writing the audit forced a direct read of `node_modules/@x402/extensions/dist/cjs/bazaar/index.js`. The structured "list everything you've ruled in/out" exercise pushes you to look at sources you'd otherwise trust by reputation.
4. **Independent reviewers add value beyond confirmation.** Both Grok and ChatGPT converged on Stone 0 as the load-bearing answer (Grok: "the only high-confidence unturned stone"; ChatGPT: "~70%"). ChatGPT *also* added Stone 17 — "facilitator strips unknown fields before indexing" — as the kill-criterion fallback if Stone 0 didn't pan out. That hypothesis wouldn't have been in the audit otherwise; it sharpened the kill criterion and would have been the next move had Stone 0 failed.

**The four properties that made this work, in order of importance.**

1. **Self-contained audit.** External LLMs have no prior context. Every piece needed to dispute one cell must be in the document: file paths, line numbers, verbatim SDK source excerpts, live curl outputs, ruled-in vs ruled-out hypothesis tables, explicit failure-mode taxonomies. Make it possible to challenge one cell at a time. If the audit is too short or hand-wavy, the reviewer reverts to generic pessimism.
2. **Direct read of canonical sources during the write.** Writing forces re-reading. Re-reading at the level of code (not docs or summaries) is where new findings surface. Vendor docs may lag the shipped package.
3. **Two independent reviewers minimum.** Convergence raises confidence; divergence adds new hypotheses. ChatGPT's Stone 17 wouldn't have come from Grok alone.
4. **Pre-flight before the test.** Independent reviewers may rank candidate stones. Before burning $0.005 to test the top-ranked one, run any zero-cost elimination steps for the other top contenders (we ran `validateDiscoveryExtension` against the live declaration before patching the smoke wallet — eliminated Stone 4 cleanly and saved a wrong-attribution scenario where Stone 0 fix would have failed and we'd have wasted the settle on a confounded test).

**When to reach for this pattern.** Multi-hour debugging sessions where the obvious next moves are exhausted, where every visible signal (validator, smoke, settle) is green but the actual outcome (indexing, observable state) doesn't move. Pattern recognition: more than 3 hypothesis-test cycles without progress, prior debugging touched the protocol surface multiple times, vendor docs and self-review both say "should work."

**Carry-forward.** This is now a persistent memory entry (`feedback_external_llm_audit_when_stuck.md`) so it survives across sessions. When future Claude sessions hit a similar wall — exhausted hypothesis space, validator-green but outcome stuck — reach for the audit-handoff pattern early rather than after another round of cycle attempts.

**Time accounting on this instance.** Audit document was ~700 lines of dense prose with verbatim source excerpts. Took ~45 minutes to write. Hand-off to two reviewers took ~5 minutes each. Total round-trip from "stuck" to "indexed" was ~3 hours. The previous debugging had burned ~24 hours of session time across two days and $0.030 in test settles. The audit pattern paid for itself ~8x even discounting the calibration value.ons specific (cite exact assumptions, real wedge competitors) or vague? If vague, sharpen the prompt before Slice 2 builds the schema-backed version.
- If 3 consecutive Critic verdicts are `acceptable` / `endorsed`, run an alternative-model cross-check (Opus vs. Sonnet) to detect rubber-stamping.
- Append a one-line entry to `lessons.md` after each Critic pass: `2026-MM-DD: Critic pass on {feature} — verdict {V} — hidden assumption: {one line}.`

**What to revisit in 30 days.** Whether the Critic pass is producing real critique or has drifted toward agreement. The full ProjectAutonomous Slice 2 plan in `ProjectAutonomous/02-slice-2-buildroom.md` describes the structured version; revisit it once 5+ Critic passes have run and a calibrated read of value-vs-cost is possible.

**Related files.**
- `prompts/critic.md` — the prompt itself, with verdict definitions, anti-patterns, anti-rubber-stamp discipline, and a worked example.
- `CLAUDE.md` § "Critic pass on high-risk diffs" — workflow integration.
- `CLAUDE.md` § "Founder-shape calibration" — applied during Critic passes.
- `ProjectAutonomous/02-slice-2-buildroom.md` — the structured Slice 2 buildroom design that the lightweight Critic pass derisks.

---

## 2026-05-10 — Project doc sweep: Phased plan rewrite + deprecated/superseded headers

**What changed.** Materially stale docs were either rewritten in place, header-marked SUPERSEDED, or renamed with a `_deprecated_2026-05-10.md` suffix:

1. **`CLAUDE.md` Phased plan section** — rewrote to reflect reality (Phases 0-3 DONE with dates, Phase 4 reframed around component-in-stack + paywalled API monetization + active listing sprint with target 2026-05-22, Phase 5 with AP2-compatibility addendum). The original framing predated the 2026-05-07 partnership-day reframe and was misleading future sessions.

2. **`TrustBench-strategy.md`** — added a STATUS: SUPERSEDED-IN-PART header at the top. Parts 1-2 (the scoring fix diagnosis) remain authoritative; the strategic-direction sections were superseded by `partnership-day-record-2026-05-07.md`. Did not rename — too many cross-references would break.

3. **Renamed `_deprecated_2026-05-10.md` (concept killed or workflow ended):**
   - `agentlog-CLAUDE-draft.md`, `agentlog-concept-2026-05-07.md`, `agentlog-concept-2026-05-07_CHATGPT_INPUT.md`, `agentlog-concept-2026-05-07_GROK_INPUT.md` (AgentLog concept killed 2026-05-07)
   - `phase3-grok-batch.md` (Phase 3 closed + Grok no longer touches code)
   - `stitch-redesign-prompt.md` (site redesign shipped 2026-05-07)

4. **SUPERSEDED header added (no rename — content has historical value or methodology reference value):**
   - `phase6-beyond-strategy.md`, `phase6-reassessment-2026-05-07.md` + 2 input files (superseded by partnership-day-record)
   - `trustbench-reliability-pivot-verification-2026-05-07.md` (pivot rerouted)
   - `agentlog-competitor-verification-2026-05-07.md` (concept killed, but the methodology pattern is now standard workflow — kept under original name as a methodology reference)
   - `# Phase 2 — Builder Conversations.md`, `# Competition Analysis — Recent Rev.md` (Phase 2 era snapshots cited by name in CLAUDE.md as evidence)

5. **Left untouched (already current or already self-marked historical):**
   - `phase3-handoff.md` (already self-marked HISTORICAL inline)
   - `phase3-x402-construction-grok-rejected-2026-05-01.md` (already self-named with rejection date)
   - `README.md` (verified current — has cross-network framing, Phase 3+4 dates, paywall in-flight)
   - `llms.txt` (verified current — explicit cross-network coverage + Phase 4 in-flight callout)
   - `skill.md` (current canonical agent-discovery surface)
   - All `phase4-*.md` docs (active sprint references)
   - All `partnership-day-*` and `phase5-*` docs (current canonical)

**Why this matters.** Solo founders accumulate doc debt fast. A new session reading the OLD CLAUDE.md Phased plan would have orientated to the *Phase 2 era* strategic frame — completely wrong for the current Phase 4 listing sprint. The reframe doc was canonical (CLAUDE.md correctly pointed to `partnership-day-record-2026-05-07.md` as priority read at the top), but the deeper Phased plan section silently contradicted it. Sweeps like this should run after every meaningful strategic pivot.

**Carry-forward — sweep cadence.** Run a sweep like this at the close of each phase. Triggers:
- Any file whose status header says "this week" or "in flight" but is more than 30 days old.
- Any file whose recommendations contradict the current canonical direction doc.
- Any file referring to a concept (project, pivot, framework) that has been killed or superseded.

For each candidate, three options: rewrite-in-place / rename `_deprecated_YYYY-MM-DD.md` with WHY header / add SUPERSEDED header keeping name. Choose rename only when the file has no live cross-references and no methodology-reference value. Choose SUPERSEDED-header when the analysis or methodology remains useful even though the conclusion is stale.

**Verification done.** `tsc --noEmit` passed clean (no code regressions — only docs touched). All renamed files spot-checked via Read tool to confirm headers landed (Linux mount byte counts initially looked stale but Read tool against Windows path showed correct content).

---

## 2026-05-11 — Decision Journal pattern + HTML output rule + QUEUE/GENERATED folders

**What changed.** Two source articles were added to `ProjectAutonomous/` (`ClaudeHTML.md` by Thariq Shihipar and `VaultIntoBusinessSystem.md`). Three high-leverage patterns from those articles were folded into the slice plans and one was scaffolded into TrustBench immediately:

**ProjectAutonomous Slice 1 (`01-slice-1-jarvis-brain.md`):**
1. **`QUEUE/` and `GENERATED/` folders** added to the vault structure (pattern from VaultIntoBusinessSystem). `QUEUE/` is the task-drop folder — drop a file describing what you need, automation picks it up, processes async, output lands in `GENERATED/`, queue file archived. `GENERATED/` is strict no-manual-edit territory. Separates "things to do" / "in progress" / "ready to consume" cleanly.
2. **Decision Journal pattern** added (pattern from VaultIntoBusinessSystem). Daily-note `DECISION:` lines captured to `decision-journal/entries/` with assumption + leading_indicator + check_back_date (90 days out). Callback prompt walks entries daily and surfaces ones with check-back date ≤ today.
3. **HTML output rule** for human-read briefings (pattern from ClaudeHTML). Friday Intelligence Briefing, Weekly Self-Mgmt, Monthly Synthesis all render as standalone HTML in `GENERATED/briefings/` with inline CSS and optional SVG. Markdown mirrors retained for grep/search. AGENTS.md, prompt files, JSON schemas, receipts stay text — they're parsed by prompts, not read by humans.
4. **Current Weekly Focus** section added to AGENTS.md template — updated every Monday by the Sunday Self-Mgmt brief's recommendation; weights every Claude decision toward this week's actual priorities.
5. **Daily-note convention keywords** added: `DECISION:`, `SHIPPED:`, `SIGNAL:`, `PARTNERSHIP-REPLY:`, `KILL:` — lightweight protocol for routing daily-note content to workflows.

**ProjectAutonomous Slice 3 (`03-slice-3-sector-scanner.md`):**
- Weekly sector heatmap output upgraded from markdown table to HTML+SVG. Radial chart visualization (size = volume, color = heat, distance = novelty) renders "which sectors are hot, accelerating, and novel" at-a-glance — markdown table version retained as mirror for Friday-brief synthesizer consumption.

**TrustBench-now (applied immediately, not deferred to Slice 1):**
- `decisions.md` upgraded to new Decision Journal format from 2026-05-11 onward (legacy entries NOT retrofitted — they remain frozen context). New entries include `assumption`, `leading_indicator`, `check_back_date`, `status` fields beneath the legacy one-liner.
- `CLAUDE.md` § "Decision Journal capture + callback" workflow rule added alongside the Critic-pass clause. Non-negotiable for non-trivial decisions.
- `prompts/decision-journal.md` created with both modes (capture + callback), anti-patterns, worked example using the paywall v0.1.0 dual-payment decision.
- Manual weekly callback workflow until Slice 1 of ProjectAutonomous lands (Monday review scan).

**Why this matters.** Pattern from VaultIntoBusinessSystem that I almost missed when first writing Slice 1: the QUEUE → process → GENERATED separation is the cleanest async-task pattern for vault-based workflows. Without it, "things to do" mixes with "in progress" mixes with "ready to consume," and the agent has to disambiguate every time. With it, the agent just walks each folder for its specific job.

The Decision Journal pattern is the bigger win. Without it, the legacy `decisions.md` captures *what* and *why* but never grades whether the *why* was actually the driver of the outcome. Solo founders make many decisions per quarter; the ones that compound are the ones whose assumption-class failures get caught and named in `lessons.md`. The Decision Journal forces that loop.

HTML output is the smallest of the three changes but the most visible — Friday briefings rendered as HTML+SVG are 10x more likely to be read carefully than markdown ones (per Thariq's observation, which I've verified holds in TrustBench's `/receipts/:id` and `/rankings` content-negotiated rendering).

**Carry-forward — pattern to watch.** When the next promising-looking productivity source article appears, run this same audit: which patterns are new vs. already-present-in-the-plan? Which violate constraints (Claude-first, solo-founder maintainability, no custodial)? Which provide compounding value (eval loops, calibration, real-conversation bridges)? Which add only short-term comfort? Fold high-compounding-value, constraint-respecting patterns in. Skip the rest, even when they sound clever.

**Verification done.** `tsc --noEmit` passed clean. Slice 1 now has 16 Decision Journal references, 11 QUEUE/GENERATED references, 9 HTML/SVG references. Slice 3 has 5 HTML/SVG references. `decisions.md` new format introduced. `prompts/decision-journal.md` created at 8.5KB. CLAUDE.md workflow rule added at line 112.

**Related files.**
- `prompts/decision-journal.md` — capture + callback prompts.
- `CLAUDE.md` § "Decision Journal capture + callback" — workflow integration.
- `decisions.md` § Format — new richer entry format.
- `ProjectAutonomous/01-slice-1-jarvis-brain.md` — full Decision Journal automation when Slice 1 ships.
- `ProjectAutonomous/03-slice-3-sector-scanner.md` — HTML+SVG heatmap.
- `ProjectAutonomous/ClaudeHTML.md` and `ProjectAutonomous/VaultIntoBusinessSystem.md` — source articles for the patterns.

---

## 2026-05-11 — JarvisBrain Slice 1 scaffolded

**What landed.** Complete file scaffolding for JarvisBrain Slice 1 at `C:\Users\Lithv\Documents\Claude\Projects\JarvisBrain\` (sibling to TrustBench). 45 files total:

- `README.md` + `SETUP-NEXT.md` (top-level orientation + activation steps)
- `AGENTS.md` (the constitution — founder-shape calibrated, Current Weekly Focus, Decision Journal convention, HTML output rule, privacy allowlist)
- 13 prompt files in `ops/prompts/` (daily-ingest, daily-evolution, competitor-monitor, industry-aggregator, customer-intel, horizon-scanner, friday-briefing [HTML], weekly-self-management [HTML], monthly-synthesis [HTML], red-team, conversations-needed, memory-staleness, decision-journal)
- `ops/templates/briefing-template.html` (reusable HTML chrome with inline CSS for callout/warning/eval-prompt patterns)
- `ops/budget.md`, `ops/degraded-mode.md`, `ops/lessons.md`, `ops/scheduled-tasks/README.md` (operational infrastructure)
- 12 folder README files explaining purpose + boundaries (inbox, notes, ideas, projects, market-intelligence, briefings, QUEUE, GENERATED, decision-journal, conversations-needed, private, ops)
- `ideas/2026-thesis.md` (the calibration anchor — current operating thesis with leading indicators that can be graded)
- Market-intelligence placeholders: industry-watch, customer-signals, horizon-scan, kill-log (with cross-project seeds from TrustBench)
- 3 competitor placeholders: infopunks, strata, spendgate (with current partnership posture + what-to-watch)
- `contradictions.md`, `briefings/eval-stamps.md`, `decision-journal/callback-queue.md` (empty with format docs)
- `smoke-runbook.md` (14-item end-to-end verification checklist)

**Why this matters for TrustBench specifically.** The JarvisBrain Slice 1 work doesn't ship anything in TrustBench, but it tests three patterns that TrustBench will eventually benefit from:

1. **Decision Journal pattern is now running in TWO places** (TrustBench `decisions.md` lightweight + JarvisBrain full automation when activated). The lightweight version is the experiment that derisks the full automation. If 90-day callbacks on real TrustBench decisions produce useful disproven entries by 2026-08-11, the pattern is validated.

2. **HTML briefing rendering pattern is documented in production-ready form** in `ops/templates/briefing-template.html`. When TrustBench eventually wants to render `/analytics` or partnership-facing reports more richly, the template is reusable.

3. **AGENTS.md as a constitution pattern** (founder-shape calibration, Current Weekly Focus, daily-note convention keywords, privacy allowlist) is now demonstrated in a complete form. TrustBench's CLAUDE.md is partially this pattern but less formal; if JarvisBrain's AGENTS.md proves higher-leverage in practice, the structure can be backported to CLAUDE.md.

**Carry-forward — what to watch.** The single biggest unknown: whether the eval-stamp loop survives my discipline. If I don't stamp briefs in the first 2 weeks of operation, the brain goes blind and the whole calibration story collapses. Sunday Self-Mgmt's explicit "0 stamps this week" flag is the canary; honor it.

The second biggest unknown: whether HTML briefings actually get read more carefully than markdown. ClaudeHTML.md claims yes (per Thariq's observation). In TrustBench, content-negotiated `/receipts/:id` and `/rankings` show the pattern works for verification surfaces. JarvisBrain's Friday brief HTML is the first test of the pattern for *strategic* surfaces. If the eval-stamps from the first 4 weeks show no improvement in "useful" rate vs. the markdown baseline (which doesn't exist — I haven't run a markdown version), then we can't conclude. But if "surfaced-something-i-missed" appears at least once per 4 weeks, the format earned its 2-4x token cost.

**Setup state.** Scaffolding complete from this TrustBench Cowork session. Activation requires:
- New Cowork project pointed at `C:\Users\Lithv\Documents\Claude\Projects\JarvisBrain`
- Tier 1 scheduled tasks created (4 tasks: daily-ingest, daily-evolution, friday-briefing, weekly-self-mgmt)
- First Friday brief by 2026-05-15, eval-stamped, then Tier 2-4 added if Tier 1 produces signal

Setup playbook at `JarvisBrain/SETUP-NEXT.md`. Estimated setup time: ~3-4 hours active + 2 weeks observation.

**Related files (in TrustBench).**
- `ProjectAutonomous/01-slice-1-jarvis-brain.md` — authoritative design
- `ProjectAutonomous/ROADMAP.md` — Reassess Gate 1 conditions before Slice 2
- `ProjectAutonomous/04-portable-from-trustbench.md` — what to fork pattern
- `prompts/decision-journal.md` — TrustBench-side decision journal prompt
- `prompts/critic.md` — TrustBench-side Critic prompt (mirrored at JarvisBrain `ops/prompts/red-team.md`)
- `CLAUDE.md` § "Decision Journal" + § "Critic pass" + § "Founder-shape calibration" — workflow rules that informed JarvisBrain's AGENTS.md

---

## 2026-05-14 — Silent default caps: Supabase 1000-row LIMIT and Cloudflare 4xx caching both bit on the same deliverable

Two production gotchas surfaced during the Paddock nightly-rollup-export shipping work today, both with the same shape: a sensible-looking default that silently truncates or poisons data without any error to flag the gap. Worth banking both together because the *meta-pattern* (silent defaults that need explicit opt-out) is what you want to remember next time.

**Gotcha 1: Supabase / PostgREST defaults `.select()` to 1000 rows.** The export script's three queries (`providers`, `scorecards`, `probes`) were all written as `await supabase.from('X').select('cols').returns<T[]>()` with no `.range()` or `.limit()`. PostgREST silently caps responses at 1000 rows by default. The first nightly export shipped with `1001 lines per file` and zero error indication. The probes table genuinely had 10,791 rows in the 7-day window; we were aggregating 9% of the data. The CSV looked complete (header + data rows, no parse errors, no JSON shape mismatch) but every probe column was Swiss-cheese populated because most providers' probes fell outside the truncated 1000-row probe window.

  - **Fix shipped (commit 72ddf5c):** a small `fetchAllPaged<T>` helper that loops `.range(from, from + 999)` until a page returns fewer than 1000 rows, bounded by `MAX_PAGES = 100` as a defensive ceiling. Defensive ceiling matters — if a future table grows past 100k rows, we want to throw loudly rather than loop silently.
  - **Pagination stability (commit 009befe):** added `.order('url')` / `.order('provider_id')` / `.order('timestamp')` to the three queries. Without explicit ordering, PostgREST adjacent `.range()` calls can return overlapping rows at page boundaries — observed as 8 duplicate URLs in a 49,668-row CSV (0.016% drift). Tiny, but the right discipline.
  - **Generalizable rule:** any Supabase `.select()` in this codebase that might exceed 1000 rows needs `.range()` pagination plus `.order()` for stability. Audit at-large risk: `src/prober.ts`, `src/scorer.ts`, anywhere reading `probes` or `providers`. None should silently break, but worth a grep next time the rankings cache or a scorecard query feels "missing rows."

**Gotcha 2: Cloudflare caches 4xx responses on the zone by default; transient 404 poisons the URL for the cache TTL.** Earlier in the same deliverable shipping window, `https://trustbench.io/exports/rollup-latest.csv` was requested before the file existed — Cloudflare cached the 404 with `Cache-Control: max-age=14400` (4 hours, set by a zone-level override). Once the file landed on disk and Railway deployed, the URL still returned the cached 404 because Cloudflare wasn't asking the origin. Required a manual Custom Purge to recover. If the cache-poisoning window had happened before Paddock's first poll, his cron would have ingested a 404 instead of the deliverable.

  - **Fix shipped (commit after 009befe):** added `c.header('Cache-Control', 'no-store')` to both 404 branches of `/exports/:filename` in `src/index.ts` (the filename-regex-fail branch and the `readFileSync`-throws branch). Forces Cloudflare to not cache transient misses. Belt-and-suspenders against the same trap.
  - **Still unresolved:** Cloudflare's zone-level rule is overriding the origin's `Cache-Control: public, max-age=300` to `max-age=14400` on `/exports/*` responses (visible in every 200 response header). That's a separate Cloudflare Page Rule or zone setting that needs investigation. Not blocking — Paddock's daily polling cadence works with 4-hour TTL because the workflow runs nightly. But anyone wanting near-real-time updates on `/exports/*` would hit a 4-hour staleness ceiling.
  - **Recovery pattern when the trap fires:** Custom Purge via Cloudflare dashboard (Caching → Configuration → Purge Cache → Custom Purge → URL → paste the exact URL → Purge). For testing whether the origin is healthy independent of cache, append a cache-busting query string (`?cachebust=N`) — Cloudflare caches per-URL including query string, so a unique query bypasses any cached response.

**Meta-lesson.** Both gotchas share a fingerprint: a default that's reasonable for the *typical* case (small tables, well-formed URLs) becomes silent corruption for the *atypical* case (large tables, transient 404s). The honest-measurement rule in CLAUDE.md catches misrepresentation in public copy, but it doesn't catch silent data truncation upstream of the public copy. Add to the high-risk-surface checklist for any deliverable that ships data to a partner: **trace the data path end-to-end and ask "what's the default behavior of every component when N grows past expected?"** Specifically for this codebase: Supabase queries → pagination check, Cloudflare-cached endpoints → 4xx Cache-Control check, response-size assumptions → check Content-Length under realistic load.

**Related (mentioned in CLAUDE.md memory entries 2026-05-14):**
- decisions.md 2026-05-14 entry on the probed-only filter shape (the upstream architectural decision that came out of these two gotchas)
- `project_agentic_market_crawler_quality_2026_05_14.md` memory — the related but separate finding that the agentic_market crawler over-enumerates per-resource URLs (33K rows from one domain). Different gotcha, same investigation thread.


## 2026-05-19 — Railway log scan during inbound-traffic readiness pass; CORRECTED interpretation after UA attribution

**What happened — first pass.** During the Day-1 inbound-traffic operational readiness pass, a small slice of Railway HTTP logs (~1 hour, ~60 requests) revealed several patterns I initially read as positive external-interest signal. Then Johan uploaded the structured deploy log JSON which contains the `[paywallgate-probe]` instrumentation lines on `/route` hits with user-agent and IP attribution. That changed the interpretation materially.

**What the UA attribution actually shows (corrected).** Of 10 /route hits in the observable hour:
- **9 from `mako-pulse-prober/0.1`** at IPv6 `2600:8800:6087:d300:548d:7b14:b7d1:522b`, polling at regular ~5-7 minute intervals.
- **1 from `x402station/0.1 (+https://x402station.io) uptime-probe`** at a different IPv6.

MAKO Pulse (per STANCE.md severity 4 as of 2026-05-19, direct 1:1 competitor on signed-receipt scoring + routing+receipt composition) is actively monitoring /route at ~7-minute cadence. The agent-card.json 404 burst (33 paths in 3 seconds at 14:50:28-31) falls *between* MAKO's /route polls and is almost certainly the same source doing competitor reconnaissance. The two `GET /bundles/receipt-backed-agent-to-agent-procurement 200` fetches also fall between MAKO's /route polls — almost certainly MAKO checking what TrustBench shipped today, not interested-adopter behavior.

**The bias that produced the wrong-shaped first interpretation.** I claimed Bundle v7 was firing as a leading indicator ~5 days early. That was confirmation bias: the strategy expects external interest to materialize, so the first external traffic I saw got read as that. The honest interpretation, once UA attribution landed, is that the bundle fetches are competitor recon. Strategically: Bundle v7 propagation is NOT yet validated by this observation. The artifact-anchor model is unchanged from this morning's status.

**The round-3 Claude reviewer's "correlated noise on shared priors" warning made concrete.** Three rounds of AI cross-check produced a v2.1 audit that explicitly flagged: "two LLM reviewers with overlapping training data agreeing is not independent confirmation; it's correlated noise on shared priors." This lessons.md entry is what that warning looks like in practice — I read positive signal into traffic that wasn't there, no human reviewer caught it, and the correction required actually inspecting the source data (the UA attribution in the deploy log) instead of inferring from the abstract log pattern. **Generalizable rule:** before banking any "leading indicator firing" claim from log scans, attribute by UA + IP + timing-cluster to specific sources. If a competitor is the dominant source, the signal is competitive-watch intel, not adoption signal.

**What's still valid after correction.**
- **Discovery-surface gap is real.** MAKO Pulse using A2A / agent-card.json / OpenRPC / DID / AI-plugin paths during recon IS evidence those paths are part of standard agent-discovery tooling. Any non-competitor crawler integrating x402 discovery would likely use the same set. The fix (ship `/.well-known/agent-card.json` + related conventions) remains valid Pillar 2 work; the urgency framing shifts from "respond to real adopter friction" to "don't be misclassified by discovery-tooling that scans for canonical paths." Same fix; lower urgency. Still banked for week of 2026-06-02 post-Strata.
- **/.well-known/x402 404** worth a quick web-search to verify if it's an emerging x402 convention. Same priority as before.
- **Zero settled /route calls** is now fully expected — MAKO and x402station are uptime-probing, not buying. The kill-criterion clock (paying external agent by 2026-06-27) hasn't moved.
- **Ed25519 signing perf is healthy** — separately validated by `scripts/sign-latency-check.ts` run from PowerShell (p50 25µs, p99 39µs on normal payload; p99 66µs on 7.6KB worst-case payload).

**New competitive-watch observation worth banking.** MAKO Pulse polling /route every ~7 minutes from a stable IPv6 is ongoing competitor monitoring of TrustBench's paywall behavior. Volume is trivial (~10/hour, sub-second responses, negligible infrastructure cost), so no rate-limiting needed. But it confirms what STANCE.md already reflects: MAKO is a direct competitor actively watching TrustBench's surface. If MAKO ships a paywall-bypass or starts probing /receipts/:id at high rates, that's a meaningful escalation worth its own decisions.md entry. Today's pattern is steady-state recon.

**Generalizable lesson — Railway log scans are cheap operational intel, AND UA attribution is required before strategic interpretation.** A 2-minute scan of HTTP request patterns surfaces useful operational signals (5xx spikes, unexpected 404s, traffic shape). But strategic claims about adoption signal require UA + IP attribution; without it, you cannot distinguish competitor recon from adopter interest. Future operational readiness passes should include UA-attribution from the deploy-log JSON (not just the Railway dashboard's terse HTTP log view) before any "leading indicator firing" claim is banked.

**Backlog for week of 2026-06-02 (post-Strata maintenance window) — unchanged from first-pass entry:**
- Ship `/.well-known/agent-card.json` (minimal A2A-shape file or redirect to trustbench.json).
- Investigate /.well-known/x402 — emerging convention or noise?
- Add `/robots.txt` (one-line file; currently 404).
- Add `/openapi.json` (could be auto-generated from Hono routes; defer if Hono doesn't have a clean plugin).
- Consider `/.well-known/agent.json` + variants as cheap aliases pointing at the canonical trustbench.json.

Cross-references: STANCE.md (MAKO Pulse severity 4 / @ChrisDMacro), `project_mako_pulse_competitor_2026_05_15.md` memory, audit v2.1 § 4.2 Strata maintenance contract, audit v2.1 § 6 leading indicators, audit v2.1 § 10 correlated-AI-cross-check risk note, drafts/inbound-traffic-readiness-runbook.md.


## 2026-05-19 — X reply cap rules apply to cold outreach, not hot-thread engagement

**What happened.** AxiomBot (verified, automated by @0xAxiom in a thread also containing @bankrbot) replied to TrustBench's first-touch reply with vocab adoption ("receipt-as-durable-artifact is the right frame") plus a direct technical question ("what's the client's verification surface when they dispute a receipt? that's the real trust audit"). Reply budget for the day was already 2/2 used (CLU_AGENT close-and-lock + AxiomBot first-touch). I recommended holding the responsive reply until tomorrow morning Sweden time (~18h delay) to respect the cap-per-day rule from `feedback_x_reply_pattern.md`. Johan corrected: cold-outreach max-2-per-day rule shouldn't apply the same way to answering a hot thread.

**The error.** Conflating two different reply categories under a single numerical cap:
- *Cold outreach* (proactive first-touch reply to an account TrustBench hasn't engaged with) is what the cap was originally written for. Cap protects against the bot/spam perception of fishing through unrelated accounts' posts.
- *Hot-thread engagement* (responding to an account that engaged with TrustBench's content, asked a direct technical question, or is mid-conversation) is conversation, not outreach. The engagement is mutual by definition; the bot/spam-perception risk that the cap protects against doesn't apply.

Applying the cold-outreach cap to a hot-thread response means engaged builders get worse treatment than strangers: stranger gets a same-day reply, engaged builder gets their direct question deferred 18h on cap-discipline grounds. Wrong incentive.

**Why I missed it.** The cap was written when daily-scan cold outreach was the dominant reply pattern, and the memory was internalized as a flat numerical rule. As partner threads have multiplied (CLU_AGENT, Strata, AxiomBot, etc.), the hot-thread category became real but I kept applying the cold-outreach framing. Classic over-generalization of a rule beyond its original scope.

**Pattern to catch.** When recommending "hold this reply for tomorrow because of the cap," ask: is the *only* reason for the delay the numerical cap, AND is the thread live (engaged account, direct question, or active back-and-forth)? If yes to both, the cap is being misapplied and the right move is send now with conversational discipline (don't pile replies, leave room for others, default to one substantive reply per back-and-forth cycle).

**Where this lands in the rules.** `feedback_x_reply_pattern.md` updated 2026-05-19 with explicit cold-outreach-vs-hot-thread distinction in the pacing section, including the 48h "thread cools" boundary for reverting to cold-outreach status. The cap stays at 2/day for cold outreach, max 1 cold reply per person per day. Hot-thread responses are uncapped numerically but disciplined by conversation-shape (don't run threads into the ground, default to one reply per back-and-forth beat).

**Broader pattern.** Numerical caps that work for one category (cold outreach) frequently get over-applied to adjacent categories (hot threads, partner DMs, scheduled comms) because the discipline-feel of the rule is appealing even when the underlying risk-model doesn't fit. Check the rule against the actual failure mode it was protecting against before invoking it on a new category.

## 2026-05-19 — agentic.market catalog entries aren't ground truth for x402 conformance

**What happened.** An authenticated client at `135.232.224.115` was tight-looping on POST /route for `capability=data` starting ~2026-05-19 18:24 UTC, getting 502s on every call. Diagnosis pulled two distinct catalog-quality bugs that both reduced to the same root cause: the agentic.market crawler trusts agentic.market's catalog as authoritative for "this URL emits an x402 challenge," but agentic.market is just a catalog — it doesn't validate the underlying endpoint actually returns 402.

Two specific entries had landed in the `providers` table from `crawler.ts:crawlAgenticMarket()`:

- `https://api.brave.com/search` — Brave's regular search API expecting a Bearer token. Returns **200 OK** to anonymous GET probes. The probe layer at `route-handlers.ts:944-945` requires `resp.status === 402` and returns null otherwise, which `validateChallenge` translates to `provider_unavailable`. Never had a chance to route.
- `https://x402.browserbase.com/browser/session/:id/extend` — a URL template with `:id` as a placeholder. The probe sends the URL verbatim, the merchant treats `:id` as a malformed session ID and returns 404, same `status !== 402 → provider_unavailable` chain.

Both were the **only two providers** in the capability=data routing pool (other than three Infopunks endpoints whose host returns 503 since the Pay.sh pivot on 2026-05-11). Every paying capability=data call was guaranteed to 502 regardless of which top-2 selection picked.

**Why the failure didn't catch itself earlier.** The crawler runs hourly and the providers table is upsert-only — once a bad URL lands, it stays until something deletes it. The prober (`prober.ts`) does HEAD-based liveness, not x402-conformance checks; an endpoint that returns 200 to HEAD reads as "alive" for scorecard purposes. The route-handlers.probeFor402Challenge step IS the conformance check, but it's a per-request runtime probe, not a registry-validation step — by the time it fires, a paying client is already in flight, and the only signal we get is a 502 in the response. No alarm on registry quality.

**Fixes shipped 2026-05-19:**

1. Stop-the-bleed: direct DB DELETE of the two URLs from `providers` and `scorecards` via Supabase SQL.
2. Prevent-recurrence: URL hygiene filter in `crawler.ts` (commit `894321d`). Two constants — `URL_TEMPLATE_PATTERN = /\/:[a-z_]+(?:\/|$)/i` and `URL_DENYLIST = new Set(['https://api.brave.com/search'])` — applied inside the agentic.market for-loop. URL templates with un-substituted `:placeholder` segments and exact-match known-bad endpoints are skipped with a `console.warn` log before the upsert.

**Why static filter not live-probe validation.** Live-probing every agentic.market catalog entry on every crawl would add ~600 outbound HTTP calls per run and slow the pipeline meaningfully. Deferred to Path B if the catalog-quality issue recurs with new failure shapes the static filter doesn't catch.

**Pattern to catch.** Whenever a new external catalog or registry source is added to the crawler (CDP merchant-discovery, Heurist Mesh, agentic.market, any future Pay.sh/PEAC integration), assume the catalog's claim of "this URL is x402" is *not* validated until TrustBench proves it. Either:

- Live-probe at crawl time (slow but bulletproof).
- Static URL-shape filter as a guard (fast but only catches known patterns).
- Filter at routing time so bad entries fail with a correct error code rather than a misleading 502 (the existing probe layer already does this for the *runtime* call, but not for the *registry quality* signal).

The cheapest middle path is the static filter shipped here plus a periodic audit script that lists URL-template-shaped entries in the providers table and alarms if the count rises. Not built today; flagged as a future ergonomics improvement if catalog-quality issues recur.

**Related memory:** `project_agentic_market_crawler_quality_2026_05_14.md` — earlier finding that agentic.market crawler over-enumerates per-resource URLs (33K rows from one domain). Different gotcha, same upstream-trust-issue pattern. Bank both together: agentic.market is a discovery catalog, not a validation surface.

**Broader pattern.** Any external catalog or registry that drives routing decisions needs an explicit validation step on TrustBench's side. The cost of trusting the upstream is paid in 502s by paying clients — the worst possible error for a routing layer to surface. Always add the validation step before relying on the catalog for routing, even if it slows the crawl.

## 2026-05-19 — Internal probes can fail 100% for 8 days while CI shows green; require explicit failure-mode signals

**What happened.** Diagnosis of an unrelated 502 in production logs (Brave + Browserbase URL hygiene issue, separate `lessons.md` entry) surfaced that the `paid-probe` GitHub Actions workflow had been generating 100% errored rows in `idempotency_keys` since at least 2026-05-12. Query results: 24 errored rows per day from 2026-05-13 through 2026-05-17 (matching the cron cadence of 6 runs/day × 4 attempts per run), 20 on 2026-05-18, 12 partway through 2026-05-19. Every single row had `response_status_code=502` and `status='errored'`. Zero successful probes for 8 days.

The probe was designed for exactly this purpose: hit production `/route` end-to-end every 4 hours, with real auth and real x402 payload construction, to catch production-routing breakage that the prober's HEAD-based liveness check wouldn't see. It instead became the breakage — silently — for over a week.

**Why it wasn't caught.**

1. The GitHub Actions workflow exits 0 (process-success) regardless of whether the route attempts inside the workflow succeeded. The CI badge stays green even when every individual `/route` POST in the run returns 502. Runs appear "successful" from a process standpoint while being 100% failed functionally.

2. Errored idempotency_keys rows accumulate silently in Postgres. No alert wires to email / Slack / X / dashboard. The data is there but no one reads it unless they go looking for something else.

3. The prober's HEAD-based liveness check (which IS visible in `/rankings`) continued to show all providers as "alive" because HEAD returning 200/401/404 still counts as alive. The paid-probe was the only end-to-end check; its failure was the only thing that would have surfaced the routing-pool collapse, and it failed silently.

4. The capability=data lane was the most obviously broken (zero working providers since Brave + Browserbase entries got crawled in from agentic.market without x402 validation, and Infopunks went down on 2026-05-11). Whether the probe was attempting only data per run or rotating through search+inference+data and failing on the first attempt, the row count of exactly 24/day matching 6 cron × 4 providers points at single-capability-per-run behavior — a separate finding that may indicate a script-side bug worth understanding.

**Root cause framing.** Two layers, both load-bearing:

- *Tactical:* the registry was full of unvalidated catalog entries from agentic.market that fail the probe's `status === 402` check. Fixed via DELETE + crawler URL hygiene filter (separate `lessons.md` entry, 2026-05-19, commit `894321d`).
- *Meta:* the canary for that tactical failure was itself broken in a way that made it invisible. The probe's exit code is a process-success signal, not a functional-success signal. Internal monitoring without explicit functional-failure exit codes is observational decoration, not actual alerting.

**Fixes shipped 2026-05-19:**

1. Paused the workflow schedule (`paid-probe.yml` schedule block commented out, `workflow_dispatch` retained for manual debugging). Stops 4 more errored rows per cron run from accumulating while debugging happens.
2. Banked re-enable conditions in the workflow file comment: paid-probe.ts needs warn-vs-error distinction; root cause of 2026-05-11→2026-05-12 regression identified; capability=data has at least one verified provider (or `data` removed from rotation); a successful manual run with response_status_code=200 on at least one attempt.

**Fixes deferred to next session:**

- Read `scripts/paid-probe.ts` end-to-end to understand the capability rotation logic. The "24 rows/day = 6 cron × 4 providers" math implies one capability per run, not three; the workflow env says three. Reconcile.
- Update `paid-probe.ts` to differentiate registry-empty (warn, exit 0) from all-attempts-failed (error, exit non-zero) and re-enable workflow schedule once both fixes are in place.
- Audit other monitoring code paths in the codebase for the same silent-failure pattern. Specifically check `prober.ts` (does it exit non-zero on full failure?), `scripts/nightly-rollup-export.ts`, `scripts/post-to-x.js`, and any other automation that produces signal without exit-code semantics for functional failure.

**Pattern to catch.** Whenever building or auditing internal monitoring / probes / canaries:

- Process-success (exit 0) is NOT the same as functional-success (probe achieved its goal). They diverge silently.
- Any monitor that produces observable data (logs, DB rows, metrics) but doesn't gate that data on a functional-success exit-code is decoration, not alerting.
- "We have a probe for that" is only true if the probe surfaces *itself* failing. Otherwise the probe is just generating noise for a future engineer to discover during unrelated debugging.
- Rule of thumb: every probe should have an explicit assertion at the end ("at least one X succeeded, otherwise exit non-zero") and that assertion should be on functional outcomes, not process completion.

**Broader connection.** Same pattern shape as the `feedback_grok_scan_check_parent.md` lesson (Grok scan produces output that looks valid but doesn't validate the underlying premise — TrustBench-side has to verify before acting). Both are "looks-green-but-isn't-actually-green" failure modes that only get caught when something downstream forces verification.

**Detection cost paid this time:** 8 days of silent failures, ~192 errored rows in idempotency_keys, ~$0 in actual on-chain spend (every probe failed at /route quote phase, never reached /route/settle), but real cost in losing the production-routing canary for over a week. If something genuinely broke in routing during that window, we wouldn't have known.

**Follow-up audit completed 2026-05-20.** Per the "audit other monitoring code paths" deferred item above, the three monitors named in this entry plus `paid-probe.ts` itself were checked end-to-end for the silent-failure-with-green-CI pattern:

- **`scripts/paid-probe.ts` + `.github/workflows/paid-probe.yml`** — fixed prior session. Exit-code semantics block at end of `main()` (lines ~792-828) differentiates dry-run / partial-success / all-failed / registry-empty into WARN-exit-0 vs OK-exit-0 vs ERROR-exit-1. Round-robin slot allocation in `pickProvidersToProbe` (lines ~443-499) closes the related "all slots biased to one capability" silent-coverage-gap subtype.

- **`src/prober.ts`** (nightly liveness probe, `.github/workflows/nightly-pipeline.yml`) — HAD the silent-failure pattern. Top-level promise rejection was `runFullProbeAndScore().catch(console.error)`, which logged thrown errors to stderr but exited 0 by default. The 2026-05-11 fix that added `throw probeInsertError` / `throw scorecardUpsertError` (file header line 32) was load-bearing only if the top-level handler also surfaced as a non-zero exit; it did not. Could have hidden a probes-insert RLS denial, scorecards schema mismatch, or any thrown error inside the pipeline — the nightly-pipeline workflow would have stayed green while the table stayed empty. Fixed 2026-05-20: catch now logs + `process.exit(1)`. A probe run where every endpoint returns `success: false` still exits 0 (observational data, not script failure), which is the right semantics — the script's job is to measure honestly, not to fail when the underlying registry is unhealthy. Failure mode if wrong: transient Supabase blip causes a red workflow that would have self-recovered next night. Accepted trade-off.

- **`scripts/export-7-night.ts`** (Paddock partner CSV, `.github/workflows/nightly-rollup-export.yml`) — main().catch already exited 1 cleanly on infra errors (line 333), but a silent-failure variant existed: if `providers.length > 0` AND `written === 0` (every provider skipped for lack of 7-day probe data, e.g. probes pipeline regressed upstream), the script would exit 0 with a header-only CSV. The workflow's commit-and-push step would then overwrite `exports/rollup-latest.csv` with the empty file, push to main, Railway redeploys, and Paddock's 00:05 UTC poll fetches a CSV with 12-column header and zero data rows. The workflow's "last successful rollup stays in place" failure-mode comment was only true if THIS script failed loud. Fixed 2026-05-20: explicit throw when `providers.length > 0 && written === 0`. Empty registry (`providers.length === 0`) is treated as observational and exits 0 with a warn log so brand-new-DB or schema-migration-in-flight states don't trigger false-positive reds.

- **`scripts/post-to-x.js`** (daily X post, `.github/workflows/post-to-x.yml`, currently disabled in GitHub Actions UI per Phase 4 rotation review) — already clean. `validateEnv` throws on missing creds (exit 1), length-check throws on >280 chars (exit 1), tweet failures caught and `process.exitCode = 1`. Fall-throughs (pulse → methodology, build → methodology) are deliberate graceful-degradation paths logged as warnings, explicitly designed to "never silently skip a day." Functional success = "a tweet got posted today" and exit code reflects that. No change needed.

**Pattern consolidation.** Across all four monitors the silent-failure shape consistently took the same form: top-level `Promise.catch(console.error)` or equivalent, where the catch arm logs but doesn't propagate exit. The fix template that `paid-probe.ts` established and the other two now match is:

1. Define functional-success explicitly ("at least one X happened" or "no thrown errors").
2. Differentiate observational outcomes (zero data because the world is empty) from operational failures (zero data because something we run broke).
3. Reserve `process.exit(1)` for the operational-failure class only — false-positive reds on transient infra are acceptable; silent-green on broken monitoring is not.
4. Comment the failure mode in-line so the next operator can judge whether a red is real.

This pattern should be applied to any future monitor / probe / canary added to the codebase. The check is mechanical and fast (read the top-level promise handler, check whether `process.exit` is reachable on the failure path).

**Diagnosis pass 2026-05-20 (during the audit's workflow_dispatch re-enable test).** The audit fixes worked on the first real test, and surfaced a deeper finding the audit had not seen. Running paid-probe with `dry_run=true` returned `[probe] DONE dry  ok=0  fail=4  targets=4` — exit 0 per the dry-run-never-errors rule, but with 4/4 targets failing at `/route` quote with `provider_unavailable / probe returned no challenge`. The new exit-code semantics were doing exactly the job they were designed for: surfacing honestly that something is wrong without producing a misleading red on a dry run. The substantive finding behind the failures:

- `/rankings?capability=search` returned 25 rows: 21 Solana (filtered out by `selectProvider`'s network=base gate per P4-3 deferral), 4 Base, **zero `x402_verified=true`**. The 4 Base candidates are agentic.market catalog entries the HEAD-prober scores 97 (URL answers HEAD pings) but that return non-402 to `/route`'s runtime conformance probe.
- `/rankings?capability=inference` returned 164 rows: 161 Base, **zero `x402_verified=true`**. Top picks are `api.openai.com`, `api.together.xyz`, `blockrun.ai/*` — well-known LLM endpoints that don't natively speak x402. 146 of the 161 are marked `integration_type: 1P` (Coinbase first-party catalog assertion), which proves 1P tagging is not sufficient signal for routing — `x402_verified` is the only honest live-conformance signal.
- `/rankings?capability=data` was already accepted as empty in the morning's `decisions.md` 2026-05-20 entry.

**Meta-pattern (worth keeping).** The morning's seed cleanup correctly removed a dead row (Infopunks's cognition layer, which had been re-seeded into the `capability=data` lane for 8 days as 502s). What nobody noticed at the time: that single dead row was **the entire `x402_verified=true` pool across all three routable capabilities**. Search and inference had never had their own verified entries; the old paid-probe shape (single capability per run, slot-biased toward whichever capability iterated first with enough score-≥40 candidates) had been quietly settling against Infopunks/data for months and the search/inference lanes had been silently empty the whole time. The cleanup was correct; the silent-canary-anchor was the artifact of the cleanup that the morning's filter didn't have visibility to see.

**Generalization.** When cleaning up a known-dead provider or removing a stale seed, also check whether that row was load-bearing for any downstream cross-capability invariant (here: "the registry has at least one verified provider somewhere"). The check is: before commenting out a seed body, run `SELECT capability, COUNT(*) FILTER (WHERE x402_verified) FROM providers GROUP BY capability` (or the registry-state equivalent) and confirm the post-removal state still satisfies whatever the consumer relies on. The paid-probe consumer relied on "≥1 verified provider in the active rotation"; that invariant was implicit, not encoded anywhere, and broke silently when the explicit data-lane cleanup landed.

**Decision linked.** Today's second `decisions.md` 2026-05-20 entry (extending accept-the-gap to all three routable capabilities, paid-probe stays paused until ≥1 verified Base provider lands organically) commits to Path B from this diagnosis. The cron restore unblock is gated on the 2026-07-01 leading indicator in that entry, not on any TrustBench-side fix — the canary correctly says the ecosystem is the thing that needs to fill.

**Diagnosis pass 2 (same day, ~30 min after writing the entry above).** Johan pushed back: "why is re-enable paid-probe all the way in July? why not now?" The push was right; the entry was wrong. Wrote a one-off `scripts/probe-x402-conformance.ts` that walks `/rankings` for `network=base&score>=40`, sends an anonymous GET (POST fallback on 405), and analyses 402 responses for x402 v2 shape. Ran against the 165 Base candidates in search + inference. Result: **120 of 165 (73%) returned real x402 challenges. 46 are x402 v2 on Base (BlockRun.AI cohort), 74 are x402 v1 on Base (Questflow + Browserbase).** Non-conformant 45 broke down as: 31 × 404, 5 × 401-auth, 2 × non-x402-402, 2 × 500, plus small counts of other statuses.

**What was wrong in the previous block + entry.** The "ecosystem is empty in Base+search/inference" framing was the wrong frame. The actual state was "we crawled in plenty of conformant providers and never live-tested any of them to flip `x402_verified=true`." The 6-week leading-indicator anchor was a thing the ecosystem needed to do; the actual thing TrustBench needed to do was a one-shot diagnostic + 5 mark-verify calls (~15 min total). The morning's accept-the-gap decision correctly applied to NEW *seeding* (don't INSERT hardcoded rows requiring per-session reverification) but I conflated that with *mark-verify of existing crawler-found rows*, which is a different operation entirely:

- **Seed** = INSERT new row. Requires per-session live re-verification when the merchant changes. Ongoing maintenance burden. Correctly disabled.
- **Mark-verify** = UPDATE existing row's flag after a one-shot live test. One-time operation. Different cost shape.

Conflating the two produced an entry whose leading-indicator depended on the wrong action. Cost: ~15 min of writing the wrong decision entry, ~10 min of writing the correction.

**Side-finding: v1 vs v2 split in the live ecosystem.** 74 of 120 conformant Base endpoints (62%) are x402 v1. Our paid-probe uses the v2-only `@x402/core` + `@x402/evm` v2.11.0 SDK and would reject v1 challenges with `provider_invalid_challenge`. So the actionable mark-verify subset today is 46 (BlockRun.AI v2 only). The v1 cohort is a separate Pillar 2 routing-breadth question: do we add v1 SDK support to `selectProvider` to unlock ~74 additional routable inventory items? Banked as a Phase 5 design seed, not actioned today.

**Meta-lesson — test cheap, then write the decision.** When a decision-journal entry rests on an empirical assumption ("the ecosystem is empty for this capability"), falsifying-or-validating the assumption costs much less than the 90-day callback says it does. Specifically: the cost of writing `probe-x402-conformance.ts` and running it once was ~25 min including the response-write. The cost of NOT writing it and committing to a 6-week leading-indicator wait would have been 6 weeks of having no paid-probe canary plus the operational distraction of "are we maintaining wait-stance or doing something." A 10:1 ratio between "test before deciding" and "decide then wait" is hard to lose on, and the impulse to write the decision before running the test is the calibration mistake to watch for. **Rule of thumb:** before writing a decision-journal entry that anchors on an external-world assumption, ask "is there a one-shot test that would validate or falsify this in under an hour?" If yes, run the test before writing the entry. If the test was too expensive to run, document that explicitly in the entry as the reason for going to callback rather than diagnosis.

**Generalizable beyond this incident.** The same shape will recur whenever an assumption sounds like "the world has property X" and that property is testable by an HTTP request, a DB query, or a one-shot script. Examples it would also catch: "no agent will pay for routing on a flat-per-tx model" (testable by pricing-survey outreach, faster than a 90-day pricing experiment); "no partner needs receipt-format Y" (testable by asking one named partner, faster than guessing); "the X integration takes Z weeks" (testable by spending 30 min trying it). The discipline is asymmetric: cheap to run the test, expensive to skip it.

**Filter-question Q6 ("less-effort path?") would have caught this.** The morning's filter check on the decisions entry didn't ask Q6 because the entry felt like maintenance, not new feature work, and Q6 is mostly applied to feature decisions. But Q6 generalizes to ANY entry that commits to a multi-week wait: "is there a faster path to the same outcome?" — and the answer here was a 30-min diagnostic. Adding to the filter discipline: Q6 applies to time-commitment decisions, not just feature-commitment decisions.

**Decision linked (corrected).** The corrected stance is `decisions.md` 2026-05-20 entry 3 (mark-verify 5 BlockRun.AI v2 endpoints, expect canary green this session). Entry 2 is marked `superseded-same-day-by-2026-05-20-entry-3` with a correction appendix explaining the conflation. The audit trail is preserved (wrong reasoning + correction both visible) rather than retroactively rewritten, since calibration learning compounds when failures are visible, not hidden.

**Diagnosis pass 3 (same day, evening, ~15min after the 5 mark-verifies landed).** The 5 mark-verifies + `workflow_dispatch dry_run=false` ran. All 4 probe attempts failed with `provider_unavailable / probe returned no challenge`. Total real-money spend: $0 (every failure happened at /route quote phase, never reached /route/settle). The exit-code semantics on `paid-probe.ts` worked correctly — exit 1, workflow turned red, the failure was visible. The 5 mark-verifies were reverted via `mark-verified.ts <url> inference unset`.

**Root cause.** BlockRun.AI's 402 challenges are *decorative x402* — they contain a `paymentInfo` shorthand block (`{network: "base", asset: "USDC", x402Version: 2}`) but **no `accepts: [...]` array and no `payTo` recipient address.** Without `payTo`, EIP-3009's `transferWithAuthorization` literally has no "to" field. The challenge is not constructible by any canonical x402 client, regardless of SDK version. BlockRun.AI's 402 is advertising-shaped, not protocol-shaped.

**The conformance-script bug.** My pass-2 `probe-x402-conformance.ts` accepted `paymentInfo` shorthand as "canonical x402 v2 on Base" because the data inside (network=base, asset=USDC, x402Version=2) *looked* like x402 v2 metadata. The script tested a proxy property ("response has x402-flavored metadata") instead of the load-bearing property ("response contains the protocol fields needed for actual payment"). The irreducible test for payable is `accepts: [{payTo: <valid EVM address>, ...}]`. Anything weaker is decoration. The script was retroactively tightened in this session to require `accepts[] && payTo`; re-ran the strict version against all 165 candidates.

**Strict-probe class breakdown** (canonical x402 = has `accepts: [{payTo: ...}]`):
- **0 canonical x402 v2 on Base** — no mark-verify candidates exist in current /rankings inventory
- **73 canonical x402 v1 on Base** — Questflow (×72) + Browserbase (×1). Real, payable challenges with 73 distinct payTo addresses (so it's not one operator under many paths — Questflow is a multi-tenant agent-hosting platform where each agent has its own payout wallet). All on x402 v1, which our v2-only `@x402/core` + `@x402/evm` 2.11.0 SDK cannot pay.
- **49 decorative-x402** — uniformly BlockRun.AI. Single operator's house style.
- **43 non-x402** — 404 (31), 401-auth (5), 500 (2), 402-but-not-x402 (2), 200/422/400 mix (3). Genuine catalog noise.

**Three structural Pillar 2 findings worth banking** (these did not exist in the codebase before today's strict probing):

1. **Coinbase Bazaar 1P listing is NOT proof of x402 conformance.** 146 of 161 Base inference rows in /rankings carry `integration_type: "1P"`. The BlockRun.AI subset (49 of those 146) emit decorative x402. Any future routing/discovery logic that treats Bazaar 1P as a routability signal will silently route to unpayable endpoints. The honest signal remains `x402_verified=true` set only after a successful real settle.

2. **The active reachable Base x402 ecosystem is dominated by one v1 operator we can't pay.** Questflow (73 endpoints, 73 distinct payTo addresses, x402 v1 canonical) is the structural majority of real Base x402 inventory in our registry. Our v2-only SDK locks us out. Two paths forward: (a) wait for v2 adoption / new merchants, (b) add v1 SDK support to /route's selectProvider + paid-probe.ts. Option (b) is Phase 5 design seed: multi-day work, touches signing surface (high-risk per CLAUDE.md), needs Critic-pass + new spec doc. Not a today fix.

3. **Decorative-vs-canonical x402 is a registry-quality bifurcation no current ranking signal captures.** Score 97 + HEAD-alive + 1P-tagged endpoints can still be decorative. Fix path: extend the prober to test challenge canonicality (parse the 402 body, check for `accepts[]` with `payTo`), surface as a new ranking signal — call it `canonical_x402_verified` — distinct from the live-settle-confirmed `x402_verified` bit. This is also Phase 5 design seed; banked here so the morning's accept-the-gap entry doesn't become a permanent wait without a path forward.

**Meta-meta-lesson — strict-shape checks before mark-verify.** Diagnosis pass 2 wrote `decisions.md` entry 3 based on a script that tested a proxy property. The script said 46 BlockRun.AI endpoints were conformant; the strict-shape test (one tightening pass later) said 0. The production cost of the proxy-vs-load-bearing-property gap: 5 DB writes (mark-verifies) + a real-money workflow run ($0 spend but ~5 min of operator attention) + 5 DB reverts + a second decision entry + this lessons block. Cost of catching it earlier: ~10 min of reading the x402 v2 spec carefully enough to know `accepts[].payTo` is the irreducible payable-challenge marker. **Rule of thumb:** when an empirical check gates a production mutation (DB write, code change, money), the check needs to test the *actually load-bearing* property, not a proxy. Specifically: before flipping a `*_verified` flag in any registry, run the script that would actually call the merchant end-to-end — at minimum to the point of constructing the request — not just a status-and-shape sniff.

**Calibration shape across three diagnosis passes.** Pass 1 (morning): "ecosystem is empty in Base+search/inference" — directional claim, untested. Pass 2 (afternoon): "ecosystem has 120 conformant candidates" — bugged script. Pass 3 (evening): "ecosystem has 0 canonical v2 Base, 73 canonical v1 Base, 49 decorative" — strict probe, honest finding. The morning's stance (accept the gap, wait for ecosystem) was directionally correct. Three iterations to arrive at the right answer. Each pass cost ~25-45 min. Total cost of the wrong-then-right cycle: ~2 hours of session time + the visible audit trail in `decisions.md` and `lessons.md` that future-me will read to avoid replaying this loop.

**Generalization beyond this incident.** The same shape will recur whenever a TrustBench decision rests on "the world has property X" and X has both a quick-and-easy proxy test and a slower-but-load-bearing real test. Examples it predicts: "agentic.market catalog entries speak x402" (proxy: 1P listing exists; real: returns canonical 402). "Partner endpoint integrates with our routing" (proxy: they say they support x402; real: a paid call lands and returns expected output). "Receipt verifier package is installable downstream" (proxy: npm publish succeeds; real: fresh-tempdir `npm install + verify-receipt` cycle works). For each pair, the discipline is: when the decision involves writing the result somewhere durable (DB, code, public post), the slow test goes first; when the decision is exploratory (just learning the shape), the proxy is enough. The rule isn't "always do the slow test" — it's "do the slow test before the durable write."

**Decision linked (re-corrected).** The truly-corrected stance is `decisions.md` 2026-05-20 entry 4 (restore Path B with sharper framing — no canonical v2 Base merchants exist; ~73 v1 candidates exist but require Phase 5 SDK work; paid-probe stays paused). Entry 2's status flipped back to `open` since its directional stance turned out correct. Entry 3 is now marked `superseded-same-day-by-2026-05-20-entry-4` with the BlockRun.AI-decorative-x402 correction appendix. The full three-pass audit trail is preserved (the wrong-script disprove, the BlockRun.AI mark-verify, the strict-probe revert) because the calibration learning is in the iteration shape, not just the final answer.

---

## 2026-08-01 — A kill criterion drifted 5 weeks because it lived outside the tracked file

**What happened.** The Phase 4 kill criterion ("no paying external agent within 6 weeks of listing, ~2026-06-27 → reassess pricing and discovery") passed its date on 2026-06-27 and was never graded. It surfaced on 2026-08-01 only by accident, while reading Railway logs for an unrelated reason — an endpoint-health check during the Anthropic Connectors Directory escalated review. Five weeks of silent drift on the single most consequential gate in the phase, and it was found by luck rather than by process.

**Why it drifted — a tracking-surface mismatch, not negligence.** The criterion was written in prose in `CLAUDE.md`'s Mission Map. The Monday-review callback workflow scans `decisions.md` for entries with `status: open` AND `check_back_date ≤ today`. A dated commitment living in a different file, in prose, with no `check_back_date` field, is structurally invisible to that scan. Worth noting: **every other callback in the system fired correctly** — the 2026-08-09 and 2026-08-13 entries are sitting open and on schedule. The mechanism works. This criterion was simply never enrolled in it.

**Structural fix (do this, don't just remember it).** Any kill criterion, gate, deadline, or dated commitment written ANYWHERE other than `decisions.md` — CLAUDE.md, a phase doc, a handoff file, a design spec — must get a stub entry in `decisions.md` at the moment it is written, whose only job is to be visible to the callback scan. Three lines is enough: the commitment, the `check_back_date`, `status: open`. The prose version can stay where it is and be the readable one; the stub is the tracked one. Prose commitments outside `decisions.md` are not tracked and will drift.

**The assumption-class failure underneath — and it is the second instance.** The criterion's implicit model was "listing on discovery surfaces → paying agents." What the logs actually show is that those are two independent variables: 689 requests from 6 recurring third-party MCP clients (discovery working) alongside 0 payment attempts across 419 `/route` hits (conversion zero). Listing presence was a **proxy**; paid calls are the **load-bearing property**. That is the same shape as the 2026-05-20 meta-lesson above ("when an empirical check gates a production mutation, test the actually load-bearing property, not a proxy") — this time applied to a strategic gate rather than a script. Generalized: *presence on a distribution surface is never evidence of conversion through it; only a completed transaction is.* Distribution counts (directories listed, catalogs indexed, stars, followers) are proxies and should never be the metric a kill criterion is written against.

**A second-order trap this exposes.** Because discovery and conversion are independent, a criterion that bundles them ("reassess pricing AND discovery") can fire while pointing at the wrong remedy. Here, the mandated response was to reassess pricing — but the logs contain no price signal at all: every 402 went to a crawler, so nobody ever declined on price. Acting on the criterion as literally written would have meant repricing against zero data points. **When a kill criterion fires, re-derive which variable actually moved before executing its prescribed remedy.** A fired criterion licenses investigation, not automatic execution of whatever fix was imagined months earlier.

**Accountability-loop flag.** Per CLAUDE.md, "the same issue appears in `lessons.md` more than twice without a structural fix" is a flag condition. Proxy-vs-load-bearing is now at instance two (2026-05-20, 2026-08-01). A third instance should trigger a structural change to how gates are written — not another lesson entry.

---

## 2026-08-02 — Instance three. Structural change, as promised.

Instance three arrived the next day, in `SIGNAL-2026-05-14-xrpl-agent-commerce-launch.md`. Its re-engagement trigger read *"Review in 30 days or when t54 announces second live service."* Every premise in that signal was correct — t54 and Virtuals were real, Ripple-backed, and genuinely shipping. The conclusion was wrong anyway, because the trigger was denominated in **announcements** rather than **settled value**. Fifteen weeks later the ecosystem had produced ~1.7M transactions worth $10–15k total and ~$280 in network fees, while the signal's chosen instrument — *"BlockRunAI transaction volume is the leading demand indicator"* — was the right instrument, never read.

Three instances, one shape: **the easy proxy was measured, the load-bearing property was not.** Script proxy vs real property (2026-05-20). Listing presence vs conversion (2026-08-01). Announcement velocity vs settled value (2026-08-02).

### The structural change (this is the deliverable, not the observation)

**Rule: every SIGNAL, WATCH, gate, or kill criterion must state its trigger in load-bearing units. Proxy-denominated triggers are not permitted.**

| Not permitted (proxy) | Required instead (load-bearing) |
|---|---|
| "when X announces …" | "when settled value exceeds $N" |
| "when the service count reaches N" | "when a named counterparty asks in writing" |
| "when we're listed in N directories" | "when one external party pays" |
| "when request volume hits N" | "when N requests carry a payment header" |
| "in 30 days" with no metric | a date **plus** a numeric threshold |

Two supporting requirements, both of which this pass exercised:

1. **Name the anti-triggers explicitly.** The XRPL entry lists "another Ripple or Mastercard press release" and "the counter crossing 5M" as *explicitly not triggers*. Without that, a proxy event re-opens the question by default and the discipline leaks back in through the side door.
2. **Enrol it in `decisions.md`** per the 2026-08-01 fix, so the callback scan can actually see it. A load-bearing trigger written only in a SIGNAL file is still invisible.

### Why this is the right fix rather than "try harder"

The failure is not carelessness — each of the three was written by someone paying attention. It recurs because proxy metrics are *cheap to observe and emotionally satisfying*, while load-bearing metrics are usually zero and saying so is unpleasant. A rule that forbids the cheap denominator removes the choice at authoring time, which is the only point where it is cheap to remove.

**Falsifier for this fix:** if a fourth instance occurs *despite* a trigger written in load-bearing units, the diagnosis was wrong and the problem is elsewhere — probably in how often the callbacks are actually run, not how they are written.

## 2026-08-14 — Local `git log` is a proxy for repo state; `origin/main` is the load-bearing property (proxy-vs-load-bearing, instance THREE)

**What happened.** While verifying an inbound provider email, I checked `exports/` and reported to Johan that the nightly rollup export had been **dead for 13 days** — that the last commit was `e3aa69d` (2026-08-01), that `nightly-rollup-export.yml` had stopped committing, and that **Paddock had therefore been polling 2026-08-01 data for two weeks**. I recommended he check the Actions tab. All of it was wrong. Johan pasted a screenshot of the Actions page showing Nightly Rollup Export green every single night, including that morning at 02:44. A `git fetch` then showed 13 unbroken `chore(exports): nightly rollup` commits sitting on `origin/main`. The local clone was simply behind. The pipeline had never missed a night and the partner feed was never stale.

**Why the check was structurally wrong.** The rollup workflow commits from GitHub Actions directly to `origin/main`. Those commits reach the local clone only when someone pulls. So for *any* bot-committed artifact, local `git log` measures "when did this workstation last sync," not "when did the job last run." I read a workstation-sync timestamp and reported it as a production-pipeline health verdict. The two are unrelated variables that happened to look identical in the output format I was reading.

**This is the third instance of proxy-vs-load-bearing** (2026-05-20 script gate, 2026-08-01 kill criterion, 2026-08-14 here). Per the accountability-loop flag written at the bottom of the 2026-08-01 entry, instance three is supposed to trigger a structural change rather than another lesson entry. So, concretely, and not as a resolution to remember:

**Structural rule — name the observer before trusting the observation.** Before asserting anything about the health, freshness, or liveness of a system, state which vantage point the evidence comes from and whether that vantage can actually see the thing being claimed. Local working copy cannot see remote-committed state. A green CI run cannot see whether the job's *output* was correct (the 2026-05-19 "probes 100% failing while CI shows green" entry is the same shape from the opposite direction). A cached CDN response cannot see origin health. Where the vantage cannot see the claim, either change vantage or downgrade the claim to "I can't determine this from here." For git specifically: **any claim about whether a scheduled job ran requires `git fetch` first, or better, the job's own run history — never bare local `git log`.**

**What made the error expensive rather than cheap.** It was not the wrong conclusion by itself, it was that the conclusion was *actionable and alarming*: a partner-facing data feed silently stale for two weeks. That framing would have sent Johan into a debugging session on a system with nothing wrong with it, and it was delivered with specifics (commit hash, day count, partner impact) that made it sound thoroughly verified. **Confidence should scale with vantage quality, not with how many specifics the output happens to contain.** A precise number read from the wrong instrument is still the wrong number, and the precision actively disguises that.

**Second finding from the same session, worth its own line.** The fix for the pay-to-list copy initially placed the explanatory rationale in an **HTML comment inside `renderFooter()`'s template literal**. That function's output ships on every page, so the internal note — including a reference to `STANCE.md out_of_scope` and a discussion of unimplemented monetization — was being published into the public page source of the entire site, while the Anthropic Connectors Directory review is pending. Caught only because the post-edit smoke test grepped the *rendered* HTML rather than the source file. **Rationale for a copy change belongs in code comments, never in markup comments inside a rendered template.** The general form: when editing a template, the thing to grep afterwards is the output, not the input.

---

## 2026-08-14 — Partnership indicators that assume the counterparty still exists (first callback-grading pass; 2 disproven, 1 validated)

**Context.** First actual callback-grading pass since the Decision Journal was introduced on 2026-05-11 — no entry in `decisions.md` had ever carried a grade before today. Three Strata-linked entries came due and were graded against hard evidence that Strata is dormant (no repo push since 2026-05-09, npm frozen at 0.1.2 since 2026-05-03, one founder-tier sale in 99 days, co-launch never happened).

**Disproven 1.** *Decision 2026-05-12 (lock Strata v1 tier shape) was disproven because* the tiers were accepted and then never exercised: the 90-day indicator required at least one real compliance-export bundle by 2026-08-10 and zero exist, because zero transactions occurred. *Pattern to watch for:* **guardrail indicators with a ceiling but no floor.** The 30-day half read "score-provider call rate stays under 10k/day sustained" and fired green on *zero traffic* — a dead system satisfies a ceiling perfectly, which is the exact inverse of the health the indicator was written to detect. *Next time, before committing this kind of decision:* write usage guardrails as a band, not a cap — "between 100 and 10k/day" — so silence is distinguishable from success.

**Disproven 2.** *Decision 2026-05-15 (ship the uncurated re-issued reference receipt) was disproven because* its own "no public reference exists at all" branch obtained: ninety days passed with no tweet, post, Show HN comment, or partner commit citing the four-bug-surfaced pattern, since there was no Show HN and functionally no counterparty. *Pattern to watch for:* **co-marketing indicators that silently depend on the counterparty continuing to exist.** The entry modeled the failure as an editorial choice ("both sides quietly preferred a curated story") and never considered partner abandonment as a branch. *Next time, before committing this kind of decision:* make counterparty liveness an explicit precondition of any indicator whose firing requires partner action, so the grade can separate "they declined" from "they vanished."

**The important distinction this pass forced.** A disproven indicator is not the same as a refuted thesis. The uncurated-composition idea was never tested — nobody declined to cite it, nobody saw it. Grading it "disproven" is correct for the *indicator* and would be badly wrong as a conclusion about the *idea*. When grading, say which one broke. Otherwise a callback loop that exists to sharpen calibration will quietly retire good ideas on the strength of a dead counterparty.

**The validated one is the most instructive.** Decision 2026-05-13 (§10 spec to Strata) graded **validated**: it asked for any reply by 2026-05-20 and Strata replied 2026-05-15 with real substance — four self-reported scoring bugs and "§10 closed from our side." A clean fire. And it was worth almost nothing, because their last commit anywhere was 2026-05-09, *six days before the reply that validated the entry*. A 7-day responsiveness window is fully compatible with abandonment on day 8. Engagement and durability turned out to be independent variables, and the indicator only measured the first. **Pair every fast responsiveness signal with a slow durability signal before treating engagement as traction.**

**The cheap check nobody ran.** All of this was observable at commitment time for roughly one API call. When Strata first DM'd on 2026-05-07, their repos were **four days old** (created 2026-05-03). A counterparty-durability glance — how long has this existed, what is the commit cadence, is anyone else using it — costs one request against a public API and would have priced the partnership correctly from the start: promising, unproven, worth a cheap reciprocal integration and not worth anchoring a phase milestone or a Show HN co-launch to. Nothing about the integration work was wasted; the receipt envelope and reference agent are reusable. What was misallocated was *milestone dependency*: the 2026-08-01 kill-criterion grading named post-Strata-launch traffic as the path to a first paying agent, so a dormant counterparty took the conversion test down with it. **Add to the pre-commitment checklist for any partnership that a milestone will depend on: check the counterparty's repo age, commit cadence, and release history before the milestone is written, not after it fails.**

---
