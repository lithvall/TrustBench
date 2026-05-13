# Critic-pass: Phase 4 Change 1 — X-Trust-Signals header parsing on /route

**Subject:** Diff to `src/idempotency.ts` (added header parse + conditional hash inclusion) + new `src/trust-signals.ts` (pure parse helper) + `scripts/trust-signals-smoke.ts` + `scripts/trust-signals-hash-identity-smoke.ts`. Date: 2026-05-13.

**Why this gets a Critic pass:** the diff touches the request-hash construction inside `withIdempotency`, which is the load-bearing primitive for /route's idempotent-replay contract per `phase3-idempotency-design.md`. Any silent regression here produces double-charges or stuck-409s on production agent traffic. CLAUDE.md Anti-Hallucination + High-risk-surface rules both apply.

---

## Three rejection reasons a hostile reviewer would give

**R1. "You're hashing the parsed JSON object, not the raw header bytes the client sent. A client whose base64url encoding produces different bytes than yours on the same logical payload — e.g. lowercase-vs-uppercase Authorization-style edge cases, future-Strata using padded base64 — gets 409 on a replay even when the semantic content matches."** The current implementation calls `parseTrustSignals(headerValue)`, gets a JS object back, and includes that *object* in the hash via `jcsCanonicalize`. JCS sorts keys deterministically, so semantically-identical parsed objects always hash identically. That's a feature against subtle JSON formatting drift, but it diverges from how the existing body-hash is built: the body uses `c.req.text()` raw text, then `JSON.parse` for the JCS input. Both paths hash the parsed object, so they're consistent — but if a future client tweaks Strata's JSON whitespace or key order in their pre-encode step, the body-hash check would catch it on replay (because the JCS would normalize) while the trust-signals hash would also normalize. Symmetric, so this rejection actually doesn't land. Acknowledged but rebutted.

**R2. "The 4 KB cap is on the encoded header bytes, but Strata's locked § 3 shape decoded is ~400 bytes. A future Strata schema bump that adds even a modestly-large field (a signed payload, a multi-vendor verifier chain, anything embedded) hits the cap silently, and the agent gets a 400 with `reason=oversized` that an automated client can't recover from. The cap should be on decoded bytes, not encoded — or the cap should be 16 KB to match real-world header limits, not the conservative 4 KB."** Real concern. Cloudflare's per-header limit is 16 KB on Enterprise tier, 8 KB on Pro, and our `trustbench.io` Cloudflare config doesn't pin which tier. The 4 KB choice was conservative-by-default. Mitigation options: (a) raise to 8 KB to match the worst-case Cloudflare tier, (b) document the 4 KB cap as part of the Strata integration spec so they design around it, (c) make the cap an env-var so we can raise it without code change if needed.

**R3. "The Hono Variables-map cast `c.set('trust_signals' as never, ...)` matches the existing `bazaarExtension` pattern, but `as never` is a code smell that turns into a maintenance hazard the next time someone tries to introduce a project-wide Variables interface. You're propagating a known-bad pattern instead of fixing it."** Fair. The right fix is a project-wide `Variables` interface in a shared types file, then strongly-typed `c.set/c.get` on every key. But that's a separate refactor that touches every middleware in the codebase; doing it inside Change 1 inflates the diff scope. Document the choice in the file comment so the next person reading it sees the pattern is deliberate, not accidental.

---

## Strongest counter-thesis

**Don't gate Change 1 behind an env flag at all.** The whole point of the flag is to avoid breaking in-flight replays at deploy time, but the byte-identity smoke proves the flag-off and flag-on-with-no-header paths produce the exact same hash bytes as the pre-Change-1 baseline. So deploying Change 1 with the flag immediately ON is safe — there's no replay to break because nobody is sending the header yet, so the conditional spread keeps the hash baseline-stable. The flag adds complexity (an extra branch, an extra env var to document, an extra failure mode if someone forgets to set it) for protection we don't actually need.

This counter-thesis has real force. The byte-identity smoke makes the flag redundant for the deploy-safety case. The flag is still useful for one thing: rejecting malformed headers from clients that send them prematurely. With the flag on, a hostile client sending `X-Trust-Signals: garbage` gets a 400 even before Strata's integration ships. That surfaces "your client is doing something wrong" early instead of having the field silently ignored.

But that's not enough to justify the flag — silent ignore-until-the-field-becomes-active is the standard HTTP header pattern (think `X-Forwarded-For`, `Sec-CH-UA`, etc.). Clients SHOULD tolerate unknown headers being ignored.

**Stronger version of the counter-thesis: drop the flag, accept silent-ignore-until-Strata-arrives.** Simpler diff, fewer config knobs, same safety profile.

Verdict on this counter-thesis: I'll resist it because the flag also gives operational reversibility. If Change 2 lands with a bug and the trust_signals field starts corrupting receipts, flipping the flag off restores the no-trust-signals behavior immediately without a code revert. That operational property is worth the small extra complexity.

---

## Named wedge competitor

x402route.vercel.app (per `decisions.md` 2026-05-12) ships routing at $0.001/call with no trust-layer semantics. If they wanted to support Strata's pattern, they'd accept a similar header but skip the JCS canonicalization + cryptographic-binding semantics. Their version: 5 lines of code (`const signals = JSON.parse(atob(req.headers['x-trust-signals'] ?? '{}'))`), no validation, no hash inclusion, no Ed25519 coverage. Their reference integration ships in a day. Their differentiation from ours: none.

Ours is heavier because the trust_signals payload becomes part of the cryptographically-signed receipt envelope via the JCS-canonical bytes. That's the trust-layer moat from the Strata sketch § 10.6 — and it's exactly what makes the integration valuable to Strata's downstream audit consumers. The Critic concern: are we sure the cryptographic binding is what Strata's customers actually want, vs. just the pre-call score being available somewhere? If Strata's customers don't audit-trail downstream, the binding is over-engineering.

Mitigation: Strata's 2026-05-12 reply explicitly confirmed the Ed25519-wraps-annotation pattern ("Downstream verifiers get cryptographic proof that TrustBench observed that specific Strata response at captured_at, which is stronger than a reference URL alone"). The binding is partner-endorsed, not speculative.

---

## Hidden assumption that, if wrong, breaks the whole thesis

**That the X-Trust-Signals header is the right wire shape, vs. an embedded field in the request body.**

Putting trust_signals in a header means:
- It's separate from the body, so HTTP intermediaries can read it
- It's outside the body-hash, so the body-hash logic stays unchanged
- It maps to header-conventions for sidechannel metadata
- 4-16 KB size cap depending on infra tier

Putting trust_signals in the body means:
- It's covered by the existing body-hash (no extra hash logic needed)
- It's symmetric with the existing schema validation in the body
- It survives all CDN / proxy header-stripping (some CDNs strip non-standard `X-*` headers)
- No size cap beyond the body size limit (usually MB)

The sketch § 10 specifies the header path. If Strata's reference-agent implementation surfaces a reason to switch (e.g. Cloudflare strips `X-Trust-Signals` on their MCP gateway egress), Change 1 has to be re-implemented as a body field. That's ~3 hours of rework. Mitigation: explicitly test the header survives the trustbench.io Cloudflare proxy when Change 1 ships — one curl against the deployed /route confirms the header reaches the origin server.

---

## Kill criterion: if X is observed in Y weeks, abandon

**If a real agent attempts the integration and discovers that `X-Trust-Signals` is being stripped by Cloudflare or any intermediate proxy** before reaching the origin server, switch to a body-field implementation within 1 week. Cost: ~3 hours of rework (parsing logic moves from header to body field, hash inputs stay structurally the same, smoke regression).

**If Strata's reference-agent implementation surfaces a wire-shape requirement we didn't anticipate** — e.g., they want the signals signed by Strata before being passed, or they want the captured_at validated against a clock-skew tolerance we didn't bake in — fix forward with the appropriate validation logic, don't revert. Cost: hours, not days.

**If the hash byte-identity assumption breaks in production** — i.e., a deployed version of Change 1 starts 409ing replays of pre-Change-1 traffic — roll back immediately by setting `TRUSTBENCH_TRUST_SIGNALS_ENABLED=false` and reverting the diff. The flag gives a 30-second-revert path before any code change is needed.

---

## Verdict

**Acceptable.** The three rejection reasons are either rebutted (R1 — both paths hash the parsed object symmetrically), accepted-and-mitigated (R2 — document the 4 KB cap to Strata, make it env-overridable in a follow-up), or accepted-as-known-issue (R3 — `as never` smell, document the choice, defer the Variables-interface refactor). The counter-thesis (drop the flag) has merit but the flag's operational-reversibility value justifies it.

Three concrete pre-merge actions:

1. **Pin the 4 KB cap as `TRUSTBENCH_TRUST_SIGNALS_MAX_BYTES` env override** with default 4096. Five lines of code in `src/trust-signals.ts`. Defends against R2 without raising the default cap prematurely.

2. **Document the `as never` choice in the file header comment of `idempotency.ts`** so the next reader sees it's deliberate, not accidental. One-paragraph addition.

3. **Add a Cloudflare-passthrough check to the deploy verification:** one curl against the deployed `/route` with `X-Trust-Signals: <test value>` confirming the header survives the proxy. If it doesn't, the body-field rewrite is the next step and the flag stays off in production until that's resolved.

After those three: ship Change 1 to a branch, run `tsc --noEmit` (already done — clean), run the two smoke scripts on Windows (Linux strip-types workaround already validated 25/25 + 7/7 PASS), and merge when the deploy verification passes.

Change 1 then sits dormant in production behind the flag until Change 2 (receipt-generator field + per-call signature coverage) lands. Both must be live before flipping `TRUSTBENCH_TRUST_SIGNALS_ENABLED=true`.

---

## Note for the lessons.md callback later

Two patterns from this Critic pass worth banking:

1. **Hash byte-identity smoke as a deploy-safety property test.** The byte-identity check I wrote (cases A=B=C, D distinct) is the kind of test that should run on any future change to request-hash construction. Generic shape: "for the deploy-relevant subset of input states, the output bytes match the pre-change baseline." Patternable to other revenue-bearing surfaces (settlement-hash construction, receipt-envelope canonicalization, x402 challenge canonicalization).

2. **The `as never` Hono Variables pattern is a structural debt the codebase has accepted twice now (bazaarExtension + trust_signals).** Next time it shows up, that's the trigger to do the proper Variables-interface refactor instead of accepting the pattern a third time. Document this in `lessons.md` once Change 1 ships.
