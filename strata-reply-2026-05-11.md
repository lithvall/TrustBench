# Reply to Strata — 2026-05-11

Drafted in response to Strata's 4-point correction on the `/x402/verify` schema and §3 annotation shape. No em-dashes (outreach), async-only close.

Paste-ready below the line.

---

Got it, thanks for the corrections, all four land cleanly.

Folding them in:

1. Kind renamed to "x402_trust" in the receipt annotation. "trusted" becomes the primary boolean field; "security_score" is supporting detail at the native 0 to 100 scale (no rescaling on my side, keeping it in Strata's canonical form means a Strata-aware verifier reads it the same way you publish it).

2. Dropping score_id. Reference will be (canonical URL + captured_at), where captured_at mirrors your last_checked_at. That fits the 24h cache model cleanly and avoids inventing an ID surface you don't actually expose.

3. On flags: I'll filter "unverified_domain" out of the receipt's flag array at emission time until WHOIS lands, so we don't bake a v1-stub signal into an immutable artifact. The full live flag list is still reachable via the ref URL for anyone who wants the live Strata view. One small question: would you prefer I name the field "actionable_flags" (explicit filtering) rather than "flags"? When WHOIS lands and the filter becomes irrelevant, "actionable_flags" still reads correctly; "flags" would need a versioning note. Happy either way, just want to pick the shape that ages best on your side.

4. Confirmed on plain JSON over HTTPS with no artifact-level signing, the TrustBench receipt's Ed25519 signature wraps the trust_signals array, so any downstream verifier checking the receipt is also checking that TrustBench observed this Strata response at captured_at. If and when you add artifact signing, the entry can grow a nested verifying_signature field without breaking existing verifiers.

On §6, locking atomic-unit USDC and the data-exchange offset on score-provider into the next revision.

Sample annotation shape against your example response:

```json
{
  "source": "strata.usestrata.dev",
  "kind": "x402_trust",
  "trusted": false,
  "security_score": 45,
  "risk_level": "medium",
  "payment_endpoint": {
    "amount_usd": 2.50,
    "currency": "USDC",
    "network": "base"
  },
  "actionable_flags": ["drain_risk"],
  "captured_at": "2026-05-10T14:23:41.000Z",
  "ref": "https://usestrata.dev/api/v1/x402/verify?url=pay.example.com/api/payment"
}
```

If that shape reads right, I'll fold it into the integration sketch and we can move to §8 step 3 (tiers). If you'd push back on any field name, send the correction and I'll re-cut before anything ships.

— Johan
