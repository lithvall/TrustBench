---
purpose: Audit + post-launch v0.1.3 publish plan for @trustbench/verify-receipt
discovered: 2026-05-25 pre-Strata-HN sweep
status: documented, not yet executed — waiting on post-launch window
prereq: npm login from PowerShell (sole publish token `trustbench-publish-automation` revoked 2026-05-19)
---

## Findings

### Issue 1: bin lookup mismatch

The published package's only bin is `trustbench-verify-receipt`. But two natural invocation forms both fail:

- `npx @trustbench/verify-receipt@0.1.2 ...` → `sh: verify-receipt: not found` (npx looks for a bin matching the package suffix, finds nothing)
- `npx trustbench-verify-receipt ...` → `404 Not Found - 'trustbench-verify-receipt' is not in this registry` (no unscoped package by that name)

The only working form is the verbose `npx --yes --package=@trustbench/verify-receipt@0.1.2 trustbench-verify-receipt ...`.

Validated 2026-05-25 against rrcpt_01KRN8HYPPRD1MS9JE7045S77Q from a fresh tempdir.

### Issue 2: --check-chain requires viem peer dep

`--check-chain` throws `verifyOnChain requires the 'viem' peer dependency. Install with: npm install viem` on every fresh-tempdir invocation. The README documents this in the install block but most copy-paste users won't read it before running.

### Issue 3: README's CLI usage shows broken commands

`npm/verify-receipt/README.md` lines 56-66 show `npx trustbench-verify-receipt <id>` as the canonical form. That command 404s (same root cause as Issue 1). Local README has the bug; published README inherited it through v0.1.0, v0.1.1, v0.1.2.

## Fix plan for v0.1.3 (post-Strata-launch)

### Changes

1. **Add bin alias** in `package.json`:
   ```json
   "bin": {
     "verify-receipt": "cli.js",
     "trustbench-verify-receipt": "cli.js"
   }
   ```
   This makes `npx @trustbench/verify-receipt@0.1.3 ...` find the `verify-receipt` bin automatically.

2. **Move viem from optional peer to a bundled-but-lazy dependency**, OR add a clear early-exit message that tells the user the exact install command. Bundling viem adds ~600KB to install size; the lazy-prompt approach keeps the install slim. Recommend lazy-prompt with friendlier wording:
   ```
   To use --check-chain, install viem in this directory:
     npm install viem
   Then re-run the command.
   ```
   (current wording is technically correct but reads as a stack-trace, not a UX message).

3. **Fix README CLI section** to show the working command forms:
   ```bash
   # Signature only (no deps)
   npx @trustbench/verify-receipt rrcpt_01KRN8HYPPRD1MS9JE7045S77Q
   
   # Signature + on-chain (requires viem)
   npm install viem
   npx @trustbench/verify-receipt rrcpt_01KRN8HYPPRD1MS9JE7045S77Q --check-chain
   ```

4. **Add a smoke test to the publish flow** that runs `npx --yes --package=@trustbench/verify-receipt@LATEST verify-receipt <known-receipt-id>` from a fresh tempdir before tagging. Catches this whole class of bug.

### Non-changes (deliberately preserved)

- Don't change the JCS canonicalization. Don't change the Ed25519 verification path. Don't change envelope shape detection (rcpt_/rrcpt_ branching). All signature math stays byte-identical so v0.1.2-issued receipts continue to verify under v0.1.3.
- Don't deprecate v0.1.2 on npm. Per the Strata maintenance contract (memory `project_strata_partnership_public_2026_05_15`), v0.1.2 stays installable through and past the launch. v0.1.3 is additive.

### Steps to ship

1. Johan: `npm login` from PowerShell (sole publish token revoked 2026-05-19 per memory `project_npm_publish_token_expired_2026_05_19`).
2. Apply the three changes above to `npm/verify-receipt/`.
3. Bump version to 0.1.3 in `npm/verify-receipt/package.json`.
4. `npm pack` from `npm/verify-receipt/` to inspect tarball locally.
5. From a fresh `/tmp/verifytest` directory: install the local tarball, run the README commands verbatim, confirm output matches expected.
6. `npm publish --access public` from `npm/verify-receipt/`.
7. Verify from a fresh tempdir: `npx --yes @trustbench/verify-receipt@0.1.3 rrcpt_01KRN8HYPPRD1MS9JE7045S77Q --check-chain`.
8. Update memory `project_npm_publish_token_expired_2026_05_19` with the new token's date + scope.

### Smoke test before tagging (the lesson)

Add to the publish runbook: after every `npm publish`, run from a FRESH tempdir (not the repo, not anywhere with node_modules):

```bash
mkdir /tmp/verify-smoke && cd /tmp/verify-smoke
npm init -y
timeout 60 npx --yes @trustbench/verify-receipt@LATEST rrcpt_01KRN8HYPPRD1MS9JE7045S77Q
timeout 60 npx --yes @trustbench/verify-receipt@LATEST rrcpt_01KRN8HYPPRD1MS9JE7045S77Q --check-chain
```

Both should return exit code 0 with "SIGNATURE VALID" output. If either fails, the publish has a bug — yank it before anyone runs it. This is the smoke test that would have caught the v0.1.0 → v0.1.2 bin issue if it had existed at the time.

### Why not ship 0.1.3 before HN

Conservative read: any republish during launch week introduces fresh risk. The DM correction (`drafts/strata-correction-dm-2026-05-25.md`) gives Strata the working command; the npm package being slightly clunky is a known, contained issue. Ship 0.1.3 within a week of launch closing, when an issue can be diagnosed without the launch as the noise floor.

If Johan disagrees and wants 0.1.3 before HN: ~1 hour of work after `npm login`. Doable Monday or Tuesday morning. Just say the word.
