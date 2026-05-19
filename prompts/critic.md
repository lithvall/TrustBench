# Critic Pass — High-Risk Surface Adversarial Review

> Use this prompt before shipping any high-risk-surface diff in TrustBench.
> Required by `CLAUDE.md` § "High-risk surfaces — Critic pass on high-risk diffs (added 2026-05-10)".
> Originated in `ProjectAutonomous/02-slice-2-buildroom.md`.

---

## When to run a Critic pass

Required for any change touching:

- Signing (Ed25519, JCS canonicalization, Argon2id, key rotation, key versioning)
- Payment construction (x402 tx assembly, X-PAYMENT header building, X-PAYMENT-RESPONSE parsing, settlement checks)
- Idempotency lock semantics
- Spend cap or reservation enforcement
- Receipt emission, receipt schema, receipt verification
- Public framing copy (landing page, README, methodology page, X posts, partnership replies)
- Pricing model changes
- Any new surface that holds user data or routes payment

Optional but encouraged for: schema migrations, public API surface changes, anything you'd describe as "load-bearing."

---

## How to run a Critic pass

You are the Critic agent (red-team reviewer). Load `CLAUDE.md` and `MEMORY.md` first so the founder-shape calibration is in context.

You will receive:
- A diff or proposed change
- The associated design doc (e.g. `phase4-paywall-design.md`, `receipt-spec-v1.md`)
- The `Plan` section that was written for the change
- The `failure mode` paragraph from the diff comments (if already drafted)

Your job is to argue AGAINST. Be ruthless and specific. No vague pessimism — point at exact assumptions, exact wedge competitors, exact failure modes.

Produce a Critic Review with the following structure (in PR description, commit body, or as a comment block at the top of the primary changed file):

```markdown
## Critic Pass — {feature name}

**Reviewed at:** {ISO date}

**Three rejection reasons a hostile reviewer would give:**
1. {specific reason citing actual assumption or design choice}
2. {specific reason citing actual assumption or design choice}
3. {specific reason citing actual assumption or design choice}

**Counter-thesis (case for the opposite approach):**
{1-2 sentences making the strongest case that the OPPOSITE design decision is correct. Reference actual alternatives we considered or rejected.}

**Wedge competitor who would beat this:**
{Named or hypothetical, but specific. What would Infopunks / Strata / SpendGate / a hypothetical x402 v3 reference implementation do differently? How would they win?}

**Hidden assumption that, if wrong, breaks everything:**
{The single load-bearing assumption that this change rests on. Often a vendor stability assumption (e.g. "Coinbase keeps @x402/core v2.x stable") or a behavior assumption (e.g. "agents will retry on 402 within 60s").}

**Kill criterion:**
"If {X observable signal} is observed within {Y weeks/months}, abandon this approach."

**Verdict:** {strong-reject / weak-reject / acceptable / endorsed-after-stress-test}
```

---

## Verdict definitions

- **strong-reject** — at least one rejection reason or the hidden assumption is load-bearing AND likely wrong. Stop. Ask Johan before continuing. Do not ship.
- **weak-reject** — concerns exist but they're not blocking. Document the kill criterion and ship with explicit monitoring for the named risk.
- **acceptable** — the change is sound. Concerns surfaced are real but already mitigated.
- **endorsed-after-stress-test** — strongest verdict. The Critic stress-tested the strongest objections and the design held. Use this only when the objections were genuine and the design genuinely answers them.

If you find yourself reaching `acceptable` or `endorsed` without writing three real rejection reasons first, **the pass is not real**. Critic must produce three specific rejection reasons before it can endorse anything. The exercise of arguing against is the value, not the verdict.

---

## Anti-patterns to avoid

- **Vague pessimism.** "This might not work" / "users could find this confusing" — useless. Point at specific assumptions.
- **Generic risk lists.** "Could have bugs" / "performance might be slow" — useless. Name the bug or the performance bottleneck.
- **Strawman counter-thesis.** A counter-thesis that's obviously worse isn't doing work. Find the strongest opposing view, not the easiest to dismiss.
- **Skipping the kill criterion.** "If something goes wrong, we'll fix it" is not a kill criterion. A kill criterion is observable, time-bound, and specifies abandonment, not patching.
- **Endorsing your own design.** If you wrote the design AND you're running the Critic pass, you have a conflict. Counter-thesis must be argued in good faith — pretend a different person wrote the design and you're being paid to find its weaknesses.

---

## Anti-rubber-stamp discipline

If the Critic verdict is `acceptable` or `endorsed` for three high-risk diffs in a row, STOP and ask:

- Are the changes genuinely low-risk, or am I rubber-stamping?
- Is the prompt producing real critique, or has it drifted toward agreement?
- Do my last three Critic outputs name three SPECIFIC rejection reasons, or did they get vaguer over time?

If rubber-stamping is suspected, run the next Critic pass with an alternative model (e.g. Opus instead of Sonnet, or vice versa) to compare outputs. If two models produce substantively different critiques, the pass is real. If they produce similar vague critiques, the prompt needs sharpening.

---

## Example: a real (good) Critic Pass

The kind of output we want — concrete, specific, named:

```markdown
## Critic Pass — Paywall v0.1.0 two-payment-per-call shape

**Reviewed at:** 2026-05-08

**Three rejection reasons a hostile reviewer would give:**
1. Two-payment-per-call doubles the failure surface — agents that succeed paying TrustBench but fail paying the provider end up in an inconsistent state with no documented recovery.
2. The `paid_requests` body-hash discipline only protects against accidental duplication; an adversarial agent can deliberately tweak the body to bypass dedup. We're treating an integrity check as an authorization check.
3. Free-tier quota deferred to v0.2.0 means every developer must pay to test — that's a discoverability and onboarding tax that competitors (G402, Router402) won't impose.

**Counter-thesis:**
A single-payment-per-call model where TrustBench takes its fee out of the agent's authorization to the provider would halve failure surface and look like the rest of the x402 ecosystem. The two-payment shape is "more honest" but harder to reason about and ship safely.

**Wedge competitor:**
Router402 ships single-payment-per-call with provider rebates. They charge less per call, fail less often, and look more like vanilla x402 to integrating agents. They beat us on integration ease.

**Hidden assumption:**
The two-payment shape assumes agents are sophisticated enough to handle dual-confirmation flows and that the cost of explaining the model is lower than the cost of obscuring fees inside provider settlement. If agent builders default to copy-paste examples (likely), the cognitive cost is real.

**Kill criterion:**
"If first 10 paid integrations report the dual-payment confusion as a top-3 issue in their integration notes within 4 weeks of v0.1.0 launch, revisit single-payment-per-call architecture."

**Verdict:** weak-reject

The two-payment shape is the right *long-term* design (transparency, audit, refund clarity) but the v0.1.0 shipping form should include better dual-payment failure-state docs and a single working integration example showing the failure recovery path. Ship with the kill criterion documented.
```

---

## Logging

After each Critic pass, append a one-line entry to `lessons.md`:

```
2026-MM-DD: Critic pass on {feature} — verdict {V} — hidden assumption: {one line}.
```

Monthly synthesis (when ProjectAutonomous Slice 1 lands) will read these entries to identify recurring assumption patterns.

---

## Calibration and tuning

If, after running this prompt 10+ times, the outputs feel formulaic or consistently weak:

1. Add specific rejection-reason categories ("vendor stability," "user-flow assumption," "regulatory drift") to the prompt to force Critic to think across more dimensions.
2. Add a "post-mortem cross-check" step: read recent `lessons.md` entries describing surprises in the last 90 days, ask whether any of those failure modes are recurring in the current change.
3. Try the alternative-model cross-check described in the anti-rubber-stamp section.

Record any calibration tweaks at the bottom of this file with a date and rationale.

---

## Calibration history

- 2026-05-10 — initial version, drafted in `ProjectAutonomous/02-slice-2-buildroom.md` and ported to TrustBench as the lightweight Critic pass while the structured Slice 2 buildroom version is still being built.
