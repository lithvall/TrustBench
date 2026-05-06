# Phase 3 — Build Handoff

> **⚠️ HISTORICAL — superseded by `phase3-closeout.md` as of 2026-05-03.**
>
> This doc was written when Phase 3 was just starting. Phase 3 is now substantially complete: all design memos shipped, all `src/` implementation done and type-checking clean, idempotency + spend-cap test scenarios validated, Ed25519 keypair deployed, mock provider written, quote path smoke-tested green. Read `phase3-closeout.md` first for current state and remaining tasks. This doc remains as historical reference for the original build plan.

**This was the entry-point document for any new session picking up Phase 3 implementation.** Read CLAUDE.md (auto-loaded) for project-wide working agreement, then `phase3-closeout.md` for current state.

**Snapshot date:** 2026-04-30

---

## Where we are

**Phase 0 (reframe), Phase 1 (foundation), Phase 2 (validate) — all complete.**
Phase 2 validation hit on 2026-04-30 with three real builder conversations + a written expression of interest from @InfopunksHQ. Findings reshaped pricing (flat-per-tx, not 1–3% spread) and feature priorities (idempotency + hard spend caps + signed receipts + queryable audit lead Phase 3, not Phase 4).

**Phase 3 — design half done, build not yet started.**

Designed and locked:
- Agent identity model — `phase3-agent-identity.md`
- DB schema additions — `phase3-schema.sql`
- Idempotency middleware — `phase3-idempotency-design.md`
- Receipt wire format (draft, sent for InfopunksHQ feedback but solid enough to build against) — `receipt-spec-v1.md`

Designed but pending:
- Hard spend caps policy engine
- x402 transaction construction + non-custodial sign flow
- Provider selection + fallback rules
- Ed25519 receipt generator (canonicalization + signing)
- `/route` handler shape that ties everything together
- `/receipts/:id` endpoint shape

Code: not yet written for any Phase 3 piece.

---

## Resolved decisions (locked)

These are settled for Phase 3. Re-opening any of them mid-build wastes Phase 3 budget; revisit in Phase 4 if real traffic justifies.

1. **Auth model:** API keys, hashed with argon2id, format `tb_live_<32-char-base32-Crockford>` / `tb_test_<...>`. Wallet address is captured separately from the x402 payment authorization for receipt attribution. Wallet-sig auth is *not* in Phase 3. (See `phase3-agent-identity.md`.)
2. **Spend caps source-of-truth:** the `receipts` table itself, queried with the `(agent_id, issued_at desc)` index. No separate `spend_log` table. Trade-off: under high concurrency, caps are *approximately* enforced — multiple parallel calls may all pass the pre-flight check before any writes a receipt. Acceptable for Phase 3.
3. **Idempotency abandonment threshold:** 60s, global default, not per-agent.
4. **Concurrent-retry policy:** `409 Conflict` + `Retry-After: 5`. Wait-and-return is Phase 4.
5. **Idempotency `response_body` storage:** JSONB (queryable, debug-friendly).
6. **Body canonicalization for idempotency hash:** same JCS implementation as the receipt generator. One source of truth.
7. **Receipt id format:** `rcpt_<26-char ULID>` as the text PK and the `/receipts/:id` path component. Breaks the existing uuid-PK convention; isolated to one table.
8. **Receipts RLS:** public read by id (the ULID is unguessable enough to act as the audit token). All other Phase 3 tables are service-role only.
9. **Pricing model:** flat per-tx fee (e.g. $0.001–$0.01 per routed call). Not a percentage spread. Phase 2 validated this directly.

---

## Design docs (read in this order)

Each doc makes one decision the next builds on:

1. `receipt-spec-v1.md` — wire format for signed receipts. Draft for @InfopunksHQ; build against current shape.
2. `phase3-agent-identity.md` — auth model decision and rationale.
3. `phase3-schema.sql` — four new tables (`agents`, `api_keys`, `idempotency_keys`, `receipts`) + RLS + indexes.
4. `phase3-idempotency-design.md` — middleware semantics, race-condition analysis, full pseudocode, test scenarios.

Strategic context (don't re-derive — read these):
- `CLAUDE.md` — working agreement. Auto-loaded.
- `TrustBench-strategy.md` — source of truth for direction. Includes the 2026-04-30 validation update.
- `# Phase 2 — Builder Conversations.md` — verbatim quotes that justify the four primitives.
- `# Competition Analysis — Recent Rev.md` — competitive map (Infopunks complementary, SpendGate proxy, AgentlyHQ framework).

---

## Build order

Numbered priority. Dependency arrows in parentheses.

1. **Apply `phase3-schema.sql` against Supabase.** Mechanical. No code.
2. **API key auth middleware** (`src/auth.ts`). Depends on (1). argon2id verify; attach `agent_id` to context. *Grok-implements with Claude review.*
3. **Idempotency middleware** (`src/idempotency.ts`). Depends on (1, 2). Implementation maps directly to pseudocode in `phase3-idempotency-design.md`. *Grok-implements with Claude review.*
4. **Test suite for (2) and (3).** Ten test scenarios for idempotency are listed at the bottom of `phase3-idempotency-design.md`. *Grok-implements; Claude verifies coverage.*
5. **`phase3-spend-caps.md` design memo.** *Claude-designs.* (NOT YET WRITTEN.)
6. **`phase3-x402-construction.md` design memo.** *Claude-designs.* Highest technical risk in Phase 3; non-custodial signing flow + on-chain settlement check. (NOT YET WRITTEN.)
7. **`phase3-provider-selection.md` design memo.** *Claude-designs.* Capability filter + max_price filter + score-based pick + fallback. (NOT YET WRITTEN.)
8. **`phase3-receipt-generator.md` design memo.** *Claude-designs.* JCS canonicalization + Ed25519 signing + persist receipt + emit `X-Receipt-Id` header. (NOT YET WRITTEN.)
9. **`/receipts/:id` GET endpoint.** Depends on (1, 8). Pure CRUD. *Grok-implements.*
10. **`/route` POST handler.** Depends on (1–8). Wires auth → idempotency → spend cap check → provider selection → x402 construction → agent-sign → upstream call → receipt emit → response. *Claude scaffolds, Grok fills mechanical bits, Claude reviews.*
11. **Real paid probing.** *Claude-designs scope + budget cap; Grok implements as a script.*
12. **`scripts/verify-receipt.js`.** *Claude-implements* (cryptographic correctness must mirror the generator exactly).
13. **README + methodology page updates.** *Grok drafts; Claude reviews.*
14. **MCP tool description for `/route`.** *Grok writes; Claude reviews.*
15. **`.env.example` additions.** Mechanical. *Grok.*

**Phase A (no more design needed):** steps 1–4. Can start coding immediately.
**Phase B (needs steps 5–8 designed first):** steps 9–15.

---

## First coding task for a fresh session

The smallest shippable unit is **steps 1–2** (apply schema + ship API key middleware). This is roughly half a day of work, fully unblocks step 3, and is fully testable in isolation.

Concrete sub-tasks:

1. Apply `phase3-schema.sql` in the Supabase SQL editor. Verify all four tables appear, RLS policies are active.
2. Add new dependencies to `package.json`: `@node-rs/argon2` (or `argon2`), `ulid`. Run `npm install`.
3. Add a script `npm run create-agent` (in `scripts/create-agent.ts`) that takes an email + display_name and inserts into `agents`, generates an API key (`tb_live_<32-char-base32-Crockford>`), inserts the prefix+hash into `api_keys`, and prints the full key once to stdout. This is the only place the plaintext key exists.
4. Implement `src/auth.ts`:
   - Hono middleware that reads `Authorization: Bearer <token>`.
   - Splits out the first 12 chars as `key_prefix`; queries `api_keys` for active rows with that prefix.
   - argon2id-verifies the token against each candidate's `key_hash`. (In practice prefix collisions are rare; usually one candidate.)
   - On match: attach `agent_id`, `mode`, and `agent_metadata` to the Hono context; update `last_used_at`.
   - On no match: return `401 Unauthorized`.
   - Reject revoked keys (`revoked_at IS NOT NULL`).
5. Wire the middleware into `src/index.ts` for `/route` (stub the handler — return a 501 for now).
6. Write tests:
   - Valid live key → 200 / 501 (depending on stub).
   - Valid test key → as above.
   - Missing header → 401.
   - Wrong scheme (`Bearer wrong-format`) → 401.
   - Revoked key → 401.
   - Updates `last_used_at` on success.

After this lands, the next session does step 3 (idempotency middleware), which can be implemented straight from the pseudocode.

PowerShell bootstrap (Windows host):

```powershell
# from the project root
npm install
# then paste phase3-schema.sql contents into Supabase SQL editor and execute
npm run dev
```

---

## Workflow rule (non-negotiable)

**Claude designs the spec; Grok implements; Claude reviews the diff.**

The boundary: anything where a bug enables double-charge, custody, signature forgery, or wrong-router-decision-under-load → Claude. Anything where a bug means an extra render or a typo in a string → Grok.

Round-trip every diff that touches:
- Signing (Ed25519, argon2id, JCS canonicalization)
- Payment construction (x402 tx assembly, settlement checks)
- Idempotency lock semantics
- Spend cap enforcement
- Receipt emission

Round-trip is optional for:
- Hono route boilerplate
- Migration SQL once schema is locked
- Test code (scenarios specified by Claude)
- Docs and README copy
- `.env.example` additions

---

## If @InfopunksHQ replies

The receipt spec was sent as a draft. Possible feedback shapes and how to handle each:

- **Adds a settlement field** (block number, gas, confirmation count). Add column to `receipts` table; bump receipt schema to `1.1.0`; pass through the wire. Low effort.
- **Wants `alternatives_considered` as a list, not a count.** Push back politely — that's our routing surface and we don't enumerate. Offer an opaque commitment (e.g. Merkle root of the alternative IDs) if they need cryptographic auditability.
- **Wants raw payload preservation.** Add an optional `payload_blob_url` field. Implementation: store payloads in Supabase Storage with an unguessable URL; bump receipt schema.
- **Wants `audit_path` (relative) alongside `audit_url`.** Trivial schema bump.
- **Wants different `agent_id` semantics** (e.g. agent-supplied DID alongside ours). Add an optional second field; don't replace ours.
- **No reply within ~7 days.** Lock the spec at v1.0.0 as drafted. Iterate later if a real consumer asks.

---

## Out of scope reminders (from CLAUDE.md)

Don't touch without explicit approval:
- `.env` files or secrets
- Railway dashboard settings
- On-chain anchoring or EIP-712 typed-data signing (Ed25519 is enough for Phase 3)
- Heavy frontend work
- Anything that makes TrustBench custodial

---

## Files this handoff references

| Path | Purpose |
|---|---|
| `CLAUDE.md` | Working agreement (auto-loaded). |
| `TrustBench-strategy.md` | Strategic source of truth. |
| `receipt-spec-v1.md` | Receipt wire format draft. |
| `phase3-agent-identity.md` | Auth model decision. |
| `phase3-schema.sql` | DB additions. |
| `phase3-idempotency-design.md` | Middleware spec + pseudocode. |
| `phase3-handoff.md` | This document. |
| `# Phase 2 — Builder Conversations.md` | Validation source. |
| `# Competition Analysis — Recent Rev.md` | Competitive map. |
