# Reply to Strata — 2026-05-12 (FINAL, both decisions locked)

Decisions locked by Johan 2026-05-12:
1. Reciprocal score-provider → full reciprocal, scoped to score-provider only. Volume-check + adjust later via existing §6 re-quote clause.
2. compliance-export Show HN → $1.00, calibrates against first real bundles.

Paste-ready below the line.

---

All four land. The URL ending was schema illustration in the sample annotation, not a live call. Real tests will use fully-qualified URLs.

On payment_endpoint nesting: yes, if your /x402/verify response gets a revision with that shape, the receipt annotation block mirrors it. Same field names across both sides means a Strata-aware verifier reads the field identically regardless of whether the source is your live response or our signed receipt.

Reading "ready for step 1 of §8" as the §8 sequence unblocked from your side. Steps 1 (schema) and 2 (annotation field names) are functionally locked in the §3 update. Moving to step 3, tiers.

Concrete shape on the two items raised earlier:

1. Reciprocal score-provider: full reciprocal, scoped to score-provider only. Free between TrustBench and Strata, list price ($0.005) for everyone else. Other tiers (receipts $0.0005, verify $0.002, audit-replay $0.01, compliance-export $1.00) stay at list. The existing §6 re-quote clause covers volume drift: if score-provider traffic gets noisy or the data-exchange balance shifts, we revisit.

2. compliance-export: $1.00 per export as a starting Show HN number. Calibrates against the first one or two real bundle requests once we have a cost-of-service signal. Moves up or down accordingly.

The rest of the §6 starting points stay live unless you push back.

If those land, I'll fold a v1 pricing section into the integration sketch and we move to step 4 (reference integration). About a week on our side from when tiers lock.

— Johan
