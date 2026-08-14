---
purpose: Follow-up DM to Strata correcting the verify-receipt command from the 2026-05-19 09:43 message
target: send before Strata starts drafting their Show HN body so the verify command in their post is correct
author: drafted 2026-05-25 by Claude, pending Johan review
context: pre-launch sweep found the DM-as-written form returns "verify-receipt: not found" and --check-chain throws on missing viem peer dep
tone: async, no fuss, no over-apology, no em-dashes, no call request (per outreach rules)
---

## DM — send via the same channel as the May 18-19 exchange

Quick correction on the verify-receipt command from Monday's DM. Two rough edges in v0.1.2 that I want you to have before drafting the HN body:

1. The bin's published as `trustbench-verify-receipt`, not `verify-receipt`. The working invocation is:

`npx --yes --package=@trustbench/verify-receipt@0.1.2 trustbench-verify-receipt rrcpt_01KRN8HYPPRD1MS9JE7045S77Q --check-chain`

2. `--check-chain` requires viem as a peer dep. Without viem it throws on the chain step (signature still verifies). Either `npm install viem` first, or drop the flag for offline signature-only verification.

Both fixed in v0.1.3 post-HN (bin alias + viem bundled). Wanted to flag before commenters hit it Tuesday.

The receipt pair anchor still holds:
- `rcpt_01KQY7C44GAPSXZPFQYRZ1D10C` (pre-PR-24 baseline)
- `rrcpt_01KRN8HYPPRD1MS9JE7045S77Q` (post-PR-24 with trust_signals)

Both Ed25519-signed under the same key. Verifier output is byte-identical either side of the patch boundary, just the score field flips 10 → 65.

---

## Notes for Johan

- ~700 chars, sits comfortably in DM.
- I did NOT include the offline (no-viem) command form because Strata's anchor is specifically "verify both signature AND on-chain," and showing two commands risks splitting the workflow. If you'd rather give them both, here's the no-viem form:
  `npx --yes --package=@trustbench/verify-receipt@0.1.2 trustbench-verify-receipt rrcpt_01KRN8HYPPRD1MS9JE7045S77Q`
- If Strata pushes back ("can you fix it before Tuesday?"), the answer is yes — needs your `npm login` from PowerShell first (token revoked 2026-05-19), then I can ship 0.1.3 in under an hour. But the conservative play is the wording fix today + the package fix post-launch.
- One alternative phrasing: drop the "two rough edges" framing and just say "small command correction." Less self-critical, slightly less honest. Your call.
