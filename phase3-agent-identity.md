# Phase 3 — Agent Identity Decision

**Status:** Decision recorded. Implementation deferred until Phase 3 DB schema lands.
**Decision date:** 2026-04-30

## The question

How does TrustBench identify the calling agent for the purposes of:

1. **Spend caps** — "per-agent rolling cap of $X over Y minutes" needs something to key on.
2. **Receipt attribution** — `receipt.call.agent_id` must be stable across calls.
3. **Future billing** — flat per-tx fees aggregate per-agent.

This is the missing primitive in Phase 3. Without it, the four validated primitives (idempotency, hard caps, signed receipts, queryable audit) have nothing to attach to.

## Options considered

### A. API keys (TrustBench-issued)
Builder requests an API key, receives `tb_live_xxxxx`, includes it in `Authorization: Bearer tb_live_xxxxx`. Hash stored server-side (argon2id or bcrypt). Standard pattern; every developer knows it.

**Pros:** Ships in a day. Rotation, revocation, scoping all work with familiar patterns. Fits Hono middleware cleanly. No client-side wallet integration needed for auth.
**Cons:** TrustBench is the source of truth for identity. Centralized.

### B. Wallet-signature auth (web3-native)
Agent signs a server-issued challenge with their wallet's private key. No API key issuance ceremony.

**Pros:** Decentralized — TrustBench doesn't issue identity. Wallet address is the natural identity for an x402 agent.
**Cons:** Per-request signature challenge adds latency (challenge round-trip + ECDSA verify). Many production agents use service-account-style wallets that are awkward for per-request signing. Client integration cost is real — every consumer needs a signer wired into their HTTP layer. **1–2 weeks of build time, where Phase 3 has 2–3 weeks total.**

### C. Hybrid — API key for auth, wallet address for attribution (CHOSEN)
API key authenticates the request to TrustBench. The wallet address comes in *for free* via the x402 payment authorization (the payer signs the on-chain tx with that wallet, and we already capture `payer_address` in `receipt.settlement`). Both pieces of information end up on the receipt; the API key tells us "which agent is this billing/spend-cap context," and the wallet address is the on-chain proof of who paid.

**Pros:** All of A's pros. The wallet attribution we'd lose with pure API keys comes back through the natural shape of x402. Client integration is one header.
**Cons:** Same as A — TrustBench issues the API keys. Mitigated by future evolution path below.

## Decision: Option C

**Header convention:** `Authorization: Bearer tb_live_<32-char-base32>` for production, `tb_test_<...>` for sandbox.

**Why this beats wallet-sig in our context:**

- Phase 2 builders (4 conversations) surfaced idempotency, spend caps, signed receipts, and queryable audit as the unprompted pain points. **None mentioned auth model.** Optimizing for an unfelt pain costs us 1–2 weeks of Phase 3 budget.
- The wallet identity that wallet-sig would give us is already in the receipt via `payer_address` from the x402 flow — we don't lose attribution by skipping wallet-sig auth.
- Solo-founder lens: argon2id + a 4-line middleware vs. signature challenge service + replay protection + clock skew handling. The first ships this week; the second is a separate sub-project.

## Implementation notes (for the schema + middleware build)

**Storage.**

- Table: `api_keys` (one agent → many keys, for graceful rotation).
- Columns: `id` (uuid), `agent_id` (uuid, FK → `agents.id`), `key_prefix` (first 8 chars of the key, plaintext, indexed — used for fast lookup), `key_hash` (argon2id of the full key), `created_at`, `last_used_at`, `revoked_at` (nullable).
- Lookup path: parse the `Bearer` token, split out the first 8 chars as `key_prefix`, query by prefix (indexed), argon2id-verify the candidates against the full token.
- **Never store plaintext.** Show the full key once at creation, then only the prefix.

**Hashing choice.** argon2id over bcrypt — modern, memory-hard, default in `@node-rs/argon2`. `time_cost = 3, memory_cost = 64MB, parallelism = 1` is the standard parameter set; tune down if Railway cold starts are slow.

**Key format.** `tb_live_` (8) + base32-Crockford(20 random bytes) (32) = 40 chars total. Crockford avoids visually-confusing characters (`0`/`O`, `1`/`I`/`l`).

**Sandbox vs production.** `tb_live_` and `tb_test_` prefixes route to different routing pools. Sandbox is free and uses dummy providers; production uses real x402 providers and bills the flat per-tx fee.

**Rotation.** Builder can have ≥2 active keys; revoke old once new is verified working. `revoked_at IS NOT NULL` keys are rejected at the middleware layer.

**Rate limiting.** Per-key, separate from spend caps. A reasonable starting point: 60 req/min per key, configurable via `agents.rate_limit_per_min`.

## Future evolution (not Phase 3)

If a builder asks for keyless auth, we add a parallel `Authorization: WalletSig <signature>` path that proves control of a wallet at request time, then maps to `agent_id` via a `wallet_addresses` table. API-key clients are unaffected. We don't ship this until at least one builder has asked for it — Phase 2 didn't surface the demand.

## Out of scope

- ERC-8004 / DID-based identity. Interesting long-term, not a Phase 3 unblock.
- OAuth / OIDC. Wrong shape for agent-to-server auth.
- mTLS. Over-engineered for a solo-founder MVP.
