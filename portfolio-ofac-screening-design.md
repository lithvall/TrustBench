# Portfolio Endpoint #1 — OFAC / sanctions name screening design pass

**Status:** Design-before-code. First in the audit-grade x402 endpoint portfolio (see `endpoint-portfolio-research-2026-05-14.md`). Top-priority "GO" candidate based on free public data + load-bearing signed-receipt + explicit ecosystem demand.

**Created:** 2026-05-14.

**Architectural rule:** this is a **separate small project in its own repo**, riding on TrustBench's published receipt infrastructure (Ed25519 keypair + `@trustbench/verify-receipt` envelope conventions + on-chain settlement pattern) as external dependencies. Do not bleed scope into the TrustBench codebase. The two products reinforce each other; they do not merge.

**Working name:** `sanctionscreen` (placeholder; rename before public listing).

**Why this exists:** the boring-portfolio research surfaced sanctions name screening as the highest-conviction first build — free OFAC/EU/UK/AU/CA list data, RapidFuzz library, weekend build, and a signed-receipt-with-on-chain-anchor that earns its keep for any compliance, audit, or AML-context agent workflow. The receipt is the moat; Pylon and agentsvc.io do not ship one. This doc resolves the architectural and framing questions before any code lands.

---

## 1. Overview & non-goals

### What this is

A small x402-paywalled HTTP service that takes a name (and optional metadata: DOB/YOB, address, country) and returns:

- The list of fuzzy matches across publicly published government sanctions lists (OFAC SDN, OFAC Consolidated Non-SDN, EU Consolidated Financial Sanctions, UK OFSI Consolidated List, AU DFAT Consolidated List, CA SEMA Consolidated List).
- Per-match: similarity score, matched fields, the verbatim list entry, the list source, and the list version consulted.
- An Ed25519-signed receipt that any third party can verify, anchored on-chain via the x402 settlement transaction.

The use case: an agent calling on behalf of a transacting user or principal (e.g. an onboarding agent, a payments agent, a procurement agent) wants a verifiable record that it screened the counterparty against public sanctions lists at time T. The signed receipt is the durable artifact that survives the agent shutting down or the company changing CRM.

### What this is NOT

- **NOT a compliance determination.** This service returns matches against public lists. It does not tell the customer whether to do business with the person. Determining whether a match constitutes a sanctioned-entity hit, evaluating false positives, and making the go/no-go decision are the customer's responsibility under whatever AML/CTF regime applies to them.
- **NOT PEP screening.** Politically-exposed-person datasets are commercial (Refinitiv, Dow Jones, ComplyAdvantage) and proprietary. PEP is out of scope and will stay out of scope.
- **NOT KYB (know-your-business).** Beneficial-owner discovery, corporate structure verification, and entity registry cross-referencing are explicit non-goals. Those drag in compliance certification liability the solo-founder operator is allergic to.
- **NOT wallet-address sanctions screening.** Coinbase's facilitator KYT already addresses on-chain address screening at the payment layer. This service screens *names*, not wallets.
- **NOT adverse-media screening.** Out of scope.
- **NOT CSV-in / CSV-out bulk uploads.** Batch endpoint accepts JSON arrays (max 100); file uploads are deferred or never.
- **NOT a monitoring service.** No "alert me if X gets added to a list later" path in v0.1.0. Potential v0.2.0 surface; explicit non-goal for v0.1.0.

### Honest framing rule (anchored on CLAUDE.md)

Site copy, README, marketing language, and any public artifact say:

> "Public-list lookup with citation and timestamp. Not a compliance determination. The customer makes the determination."

The words **"sanctions compliance,"** **"AML check,"** **"KYC,"** and **"compliance certification"** do NOT appear in marketing copy. The service returns verbatim list data + similarity score + list version + signed receipt. That is the entire claim.

---

## 2. Data sources & refresh cadence

All sources are public and free. Each is ingested by a nightly fetch + normalize job. Refresh runs at 02:00 UTC (offset one hour ahead of TrustBench's 03:00 UTC pipeline so we don't compete for outbound bandwidth on the same Railway instance, in case they end up co-hosted).

| Source | URL | Format | Stated cadence | Realistic cadence |
|---|---|---|---|---|
| OFAC SDN | https://www.treasury.gov/ofac/downloads/sdn.xml | XML | "3-4×/week, no fixed schedule" (OFAC FAQ 20) | Re-fetched nightly; change detected via SHA256 of body |
| OFAC Consolidated Non-SDN | https://www.treasury.gov/ofac/downloads/consolidated/consolidated.xml | XML | Same as SDN | Nightly |
| EU Consolidated Financial Sanctions | https://webgate.ec.europa.eu/fsd/fsf/public/files/xmlFullSanctionsList_1_1/content?token=dG9rZW4tMjAxNw | XML (token-gated public URL) | Daily | Nightly |
| UK OFSI Consolidated List | https://ofsistorage.blob.core.windows.net/publishlive/ConList.xml | XML | Daily | Nightly |
| AU DFAT Consolidated List | https://www.dfat.gov.au/sites/default/files/regulation8_consolidated.xlsx | XLSX | Weekly | Nightly (cheap to re-fetch) |
| CA SEMA Consolidated List | https://www.international.gc.ca/world-monde/assets/office_docs/international_relations-relations_internationales/sanctions/sema-lmes.xlsx | XLSX | Variable, multiple lists | Nightly |

### Per-source normalization

Each source has a dedicated `src/ingest/<source>.ts` adapter that:

1. Fetches the canonical URL with a 60s timeout.
2. SHA256-hashes the response body. If hash matches the last successful ingest, log `unchanged` and skip the rest.
3. Parses to a per-source intermediate representation (preserving source-specific fields verbatim).
4. Normalizes to the common `SanctionsEntity` shape (see §3).
5. Upserts to `sanctions_entities` keyed on `(source, entity_id_in_source)`.
6. Records the ingest run in `sanctions_list_versions` with: source, version string (per source: OFAC publishes `PublshInformation/Publish_Date`, EU has a versioning header, UK has a list-modified date, AU/CA are date-stamped), fetched_at, sha256, row_count, status.
7. On failure: log + emit a structured alert (Discord webhook); the previous successful version remains the served version.

### Adapter notes

- **OFAC SDN/Consolidated** use a stable XML schema documented at https://ofac.treasury.gov/system/files/126/dat_spec.txt. Use `fast-xml-parser` (already in TrustBench dependency tree). Preserve `<sdnEntry>/<remarks>` verbatim — auditors care about wording.
- **EU consolidated** XML schema is documented at https://webgate.ec.europa.eu/europeaid/online-services/index.cfm?ADSSChck=1. Token in the URL is public (it's the static "token-2017" path).
- **UK OFSI** XML schema is documented at https://www.gov.uk/government/publications/financial-sanctions-consolidated-list-targets. Note: the UK list distinguishes between "designated by UK" and "designated by UN/EU and applied by UK" — preserve the designation source per row.
- **AU DFAT XLSX** has multi-sheet layout (Persons / Entities) — read both sheets, union the rows.
- **CA SEMA** publishes per-country XLSX files. Ingest only the consolidated multi-country file (a separate per-country expansion is deferred).

### Failure mode for refresh

If any source has not produced a fresh version in **> 7 days** (relative to its stated cadence), the `/screen/lists` endpoint returns the source's last_refreshed timestamp with a `stale: true` flag and `stale_reason: "no upstream change for 7d"`. The `/screen/name` and `/screen/batch` endpoints continue to serve, but include `list_stale_flags` in the response naming any stale sources. The customer can decide whether to accept the stale-source result.

If a source is **unreachable** for > 24h (we've tried > 4 times and failed), `/screen/lists` reports `degraded: true` for that source and the screening endpoints add `degraded_sources` to the response. Screening continues against the last cached version of that source's data.

---

## 3. Data model

Postgres / Supabase. Two tables; modest indexes.

```sql
-- The normalized entity rows ingested from each list source.
create table sanctions_entities (
  -- Composite identity. (source, entity_id_in_source) is the upsert key.
  source text not null,                          -- 'ofac_sdn', 'ofac_consolidated', 'eu', 'uk_ofsi', 'au_dfat', 'ca_sema'
  entity_id_in_source text not null,             -- the list-issued identifier (OFAC: <uid>, EU: <logicalId>, UK: <GroupID>, ...)
  list_version text not null,                    -- the version string this entity belongs to (matches sanctions_list_versions.version)

  -- Common normalized fields.
  entity_type text not null,                     -- 'individual' | 'entity' | 'vessel' | 'aircraft'
  canonical_name text not null,
  aliases jsonb not null default '[]'::jsonb,    -- ["Aka 1", "Aka 2", ...] preserving source-listed AKAs
  dob_yob jsonb not null default '[]'::jsonb,    -- [{type:'dob', value:'1965-03-14'}, {type:'yob', value:1965}, ...]
  addresses jsonb not null default '[]'::jsonb,  -- [{country, city, line1, line2, region, postal_code}, ...]
  nationalities jsonb not null default '[]'::jsonb,
  programs jsonb not null default '[]'::jsonb,   -- ['SDN-IRAN', 'SDGT', 'CYBER2', ...] verbatim from source
  remarks text,                                  -- source-published narrative
  raw jsonb not null,                            -- the verbatim per-source record, preserved for citation

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  primary key (source, entity_id_in_source)
);

-- Indexes for fuzzy-match lookup.
-- pg_trgm GIN index on canonical_name powers RapidFuzz pre-filter.
create extension if not exists pg_trgm;
create index sanctions_entities_canonical_name_trgm
  on sanctions_entities using gin (canonical_name gin_trgm_ops);

-- Alias-array index for token-level lookup.
create index sanctions_entities_aliases_gin
  on sanctions_entities using gin (aliases jsonb_path_ops);

-- Refresh-version tracking.
create table sanctions_list_versions (
  source text not null,
  version text not null,
  fetched_at timestamptz not null,
  upstream_sha256 text not null,
  row_count integer not null,
  status text not null,                          -- 'success' | 'failed' | 'unchanged'
  failure_reason text,
  primary key (source, version)
);

create index sanctions_list_versions_source_fetched
  on sanctions_list_versions (source, fetched_at desc);
```

**Why no per-source tables:** every source's row maps cleanly onto the common shape after normalization. A single table keeps the fuzzy-match query simple (one index, one scan). The `raw` JSONB column preserves any source-specific fields the normalizer dropped, available for verbatim citation in the response.

**Why JSONB for arrays:** `aliases`, `addresses`, `programs` are unbounded per row, and they're queried by GIN index, not by relational join. JSONB stores them inline with the row; a separate `aliases` table would require a join on every match.

**Estimated row count:** OFAC SDN ~12K entries, OFAC Consolidated ~5K, EU ~3K, UK ~3K, AU ~2K, CA ~1.5K. Total ~25-30K rows steady-state. Comfortably within Supabase free-tier limits.

---

## 4. Endpoint surface

Same conventions as TrustBench's `/route` paywall: `Idempotency-Key` header (16-128 chars, 24h replay window), JCS-canonicalized body hashing, Ed25519-signed envelope on paid responses. x402 payment to a dedicated revenue wallet for this service (separate from TrustBench's revenue wallet to keep accounting clean).

### `POST /screen/name`

Single-name screening. $0.005 per call.

**Request:**

```typescript
type ScreenNameRequest = {
  name: string;                       // required, max 256 chars
  dob?: string;                       // optional ISO 8601 date (YYYY-MM-DD)
  yob?: number;                       // optional year of birth (1900-current-year)
  country?: string;                   // optional ISO 3166-1 alpha-2 country hint
  address?: string;                   // optional free-form address line
  threshold?: number;                 // optional 70-95, default 85
  lists?: string[];                   // optional subset of source identifiers; default = all
};
```

**Response (200):**

```typescript
type ScreenNameResponse = {
  screened_at: string;                // ISO 8601 UTC
  request_hash: string;               // sha256 of JCS-canonical request body
  threshold_used: number;             // the effective threshold
  lists_consulted: Array<{
    source: string;
    version: string;
    fetched_at: string;
  }>;
  matches: Array<{
    source: string;
    entity_id_in_source: string;
    canonical_name: string;
    similarity: number;               // 0-100
    matched_fields: string[];         // ['canonical_name'] | ['canonical_name', 'alias'] | ...
    entity_type: string;
    aliases: string[];
    dob_yob: Array<{ type: string; value: string | number }>;
    addresses: Array<Record<string, string>>;
    nationalities: string[];
    programs: string[];
    remarks: string | null;
    raw: Record<string, unknown>;     // verbatim source row
  }>;
  list_stale_flags: string[];         // source ids that are stale (>7d no change vs cadence)
  degraded_sources: string[];         // source ids unreachable in last 24h
  receipt_id: string;                 // sscrn_01...
  receipt_url: string;                // absolute URL to /receipts/:id
};
```

**Error envelope (shared shape, see §8):**

```typescript
type ErrorResponse = {
  error: string;                      // stable code
  detail: string;                     // human-readable
  [key: string]: unknown;             // extra fields per error code
};
```

**Idempotency:** required `Idempotency-Key` header (16-128 chars). Same `(payer_wallet, key)` + same body hash → cached response (no second on-chain charge — see §4.5 below). Different body → 409 Conflict.

**Auth:** x402-paid only. No API keys. Single payment to the service's revenue wallet per call, at the per-call price.

**Caching:** `Cache-Control: no-store` on every paid response. The receipt at `/receipts/:id` is the cacheable artifact.

### `POST /screen/batch`

Bulk screening. $0.003 per name. Min 10, max 100 names per call.

**Request:**

```typescript
type ScreenBatchRequest = {
  names: Array<{
    name: string;
    dob?: string;
    yob?: number;
    country?: string;
    address?: string;
    client_ref?: string;              // optional opaque tag the customer attaches to each row
  }>;
  threshold?: number;                 // applied to every row; default 85
  lists?: string[];
};
```

**Response (200):**

```typescript
type ScreenBatchResponse = {
  screened_at: string;
  request_hash: string;
  threshold_used: number;
  lists_consulted: ScreenNameResponse['lists_consulted'];
  results: Array<{
    client_ref: string | null;        // echo of input client_ref or null
    name: string;                     // echo of input name
    matches: ScreenNameResponse['matches'];
  }>;
  list_stale_flags: string[];
  degraded_sources: string[];
  receipt_id: string;
  receipt_url: string;
};
```

**Pricing:** `names.length * $0.003`, all-in. One x402 payment, one receipt.

**Idempotency / auth / caching:** same as `/screen/name`.

### `GET /screen/lists`

Free. Returns the current list versions and last-refreshed timestamps. Crawlable by anyone.

**Response:**

```typescript
type ScreenListsResponse = {
  sources: Array<{
    source: string;                   // 'ofac_sdn', 'eu', ...
    list_version: string;
    fetched_at: string;
    row_count: number;
    upstream_cadence: string;         // 'daily', 'weekly', 'variable 3-4x/week'
    status: 'fresh' | 'stale' | 'degraded' | 'failed';
    last_change_at: string | null;    // last time the version string actually changed
  }>;
  generated_at: string;
};
```

**Caching:** `Cache-Control: public, max-age=300` (5-minute browser cache). Reflects ingest cadence.

### `GET /receipts/:id`

Free. Public. Immutable. `Cache-Control: public, max-age=86400, immutable`. Same content-negotiation pattern as TrustBench `/receipts/:id`: HTML for browsers (Accept: text/html), byte-identical JSON for verifiers (Accept: application/json or default).

The returned receipt object is the same signed envelope the originating `/screen/name` or `/screen/batch` call emitted. A third-party verifier downloads the public key from `/.well-known/sanctionscreen-pubkey` and validates the signature using `@trustbench/verify-receipt` semantics (we may publish a thin `@sanctionscreen/verify-receipt` wrapper or simply document the conventions if the envelopes are wire-compatible — see §6).

---

## 5. Fuzzy matching semantics

### Library

**RapidFuzz** (Python `rapidfuzz` or TypeScript port `fuzzball`). For TypeScript ecosystem alignment with TrustBench's Hono+tsx stack, use **`fuzzball`** as the primary matcher (well-maintained TS port). Fall back to RapidFuzz via a separate Python microservice only if performance becomes a bottleneck (don't pre-optimize).

### Scoring

A composite score per candidate row:

- `token_set_ratio(query_name, candidate_name)` — order-independent, handles title/word reordering. Weight 0.5.
- `partial_ratio(query_name, candidate_name)` — substring match, handles common prefixes/suffixes. Weight 0.3.
- `levenshtein_ratio(query_name, candidate_name)` — character-level edit distance. Weight 0.2.

Final similarity = weighted sum, scaled 0-100.

### Threshold

Default: **85**. Configurable per request via `threshold` field, clamped to **[70, 95]**. Out-of-range → 400 with `threshold_out_of_range`.

A threshold below 70 generates so many false positives the receipt becomes worthless. A threshold above 95 makes false negatives prohibitive (transliteration variance alone defeats 95+ matching on non-Latin names). 85 is the documented industry default for first-pass screening.

### Pre-filter

To avoid scanning all ~30K rows per query, the matcher first runs a **trigram pre-filter** using the `pg_trgm` GIN index:

```sql
select source, entity_id_in_source, canonical_name, aliases, dob_yob, addresses, programs, remarks, raw
from sanctions_entities
where canonical_name % $1               -- trigram similarity > pg_trgm.similarity_threshold (default 0.3)
   or aliases @> jsonb_build_array($1)::jsonb
limit 500;
```

The candidate set is bounded to 500; in practice trigram similarity at the default 0.3 floor returns 10-100 rows for most queries. RapidFuzz then runs precision scoring on this candidate set.

### Alias expansion

For each candidate row, the matcher scores the query against:

1. `canonical_name`
2. Every entry in `aliases[]`
3. Concatenations of first/last name pairs if the source structured them separately (recorded in `raw`)

The highest score across these comparisons is the row's similarity. The `matched_fields` array in the response names which field(s) drove the match.

### DOB / YOB tie-breaking

If the request supplied `dob` or `yob` and the candidate row has any DOB/YOB:

- DOB exact match: boost score by +5 (capped at 100).
- YOB ± 1 year: boost by +3.
- DOB or YOB mismatch by > 2 years: penalize by -10.

Penalty does not drop the row below the threshold unless the original score was within 10 of threshold. Tie-breaking is not exclusion — auditors want to see partial-info matches too.

### Address as supporting signal

Address matching is computed but not weighted into the primary score. If both query and candidate have country fields and they match, `matched_fields` includes `address.country`. If both have full addresses and trigram similarity > 0.5, `matched_fields` includes `address.line`. The customer makes the determination — we surface the signal, we don't conflate it with name similarity.

---

## 6. Receipt shape

Reuse the TrustBench Ed25519-signed envelope conventions verbatim (RFC 8785 JCS over the `receipt` object, detached signature in `signature`, public key at a well-known URL).

### Prefix

**`sscrn_`** for receipt IDs. Distinguishes from TrustBench's `rcpt_` (Phase 3 settlement receipts) and `rrcpt_` (Phase 4 routing receipts). Three-character semantic prefix; ULID body.

**Justification for new prefix:** the receipt envelope's `kind` field will be `sanctions_screening.v1`, and consumers who use receipt-prefix routing in their verifier should be able to distinguish at a glance. Sharing a prefix with TrustBench would imply same-issuer guarantees the separate-project architecture explicitly avoids. The `sscrn_` prefix announces "this is a different issuer; verify against `/.well-known/sanctionscreen-pubkey`, not TrustBench's pubkey."

### Envelope

```json
{
  "receipt": {
    "version": "1.0.0",
    "kind": "sanctions_screening.v1",
    "receipt_id": "sscrn_01JABCDE...",
    "issued_at": "2026-05-15T08:14:22.118Z",
    "issuer": "sanctionscreen.io",
    "request": {
      "endpoint": "/screen/name",
      "request_hash": "sha256:8f4c2a3d...",
      "idempotency_key": "01HVZ...client-supplied",
      "threshold_used": 85,
      "lists_consulted": [
        { "source": "ofac_sdn", "version": "20260514-001", "fetched_at": "2026-05-15T02:01:14Z" },
        { "source": "eu", "version": "2026-05-13", "fetched_at": "2026-05-15T02:01:48Z" }
      ]
    },
    "matches": [
      {
        "source": "ofac_sdn",
        "entity_id_in_source": "12345",
        "canonical_name": "John Q. Sanctioned",
        "similarity": 91,
        "matched_fields": ["canonical_name"],
        "raw_excerpt_sha256": "sha256:1d9b7e4f..."
      }
    ],
    "match_count": 1,
    "settlement": {
      "chain": "base",
      "tx_hash": "0x9e3f2c7a...",
      "block_number": 45633871,
      "payer_address": "0xAgEnT...",
      "payee_address": "0xRevenueWallet...",
      "amount_atomic": "5000",
      "currency": "USDC",
      "decimals": 6,
      "settled_at": "2026-05-15T08:14:21.842Z"
    },
    "audit": {
      "audit_url": "https://sanctionscreen.io/receipts/sscrn_01JABCDE..."
    }
  },
  "signature": {
    "alg": "ed25519",
    "public_key_url": "https://sanctionscreen.io/.well-known/sanctionscreen-pubkey",
    "key_id": "sanctionscreen-2026-05",
    "value": "base64url:..."
  }
}
```

### What's in the signed receipt and why

- **`request.request_hash`** — sha256 of the JCS-canonical request body. A holder can re-hash their own copy of the request and confirm the receipt refers to their call.
- **`request.threshold_used`** — the effective threshold, signed. Prevents post-hoc dispute about "I would have wanted threshold X."
- **`request.lists_consulted`** — every source the screening evaluated against, with version string + fetch timestamp. This is the citation. An auditor in year 3 can re-fetch the historical version of OFAC's SDN at the listed timestamp and reproduce the matcher result.
- **`matches[]`** — full match list, included verbatim in the signed payload. Each match's `raw_excerpt_sha256` is a hash of the raw source row in `sanctions_entities.raw` at the time of screening, so even if our DB row mutates the receipt is durably tied to the data we actually saw.
- **`match_count`** — convenience field, included for cheap visual checks but redundant with `matches.length`.
- **`settlement.*`** — on-chain anchor. The tx_hash + chain + block_number gives any third party a free way to verify "this screening was paid for at block N." Same shape as TrustBench's settlement block.
- **`audit.audit_url`** — public verifiable URL for the same envelope.

### What's deliberately NOT in the signed receipt

- The original input name (PII). The customer can verify their input via `request_hash` matching.
- DOB / YOB / address / country from the input (PII). Same.
- The raw bytes of the verbatim source rows (only their hashes). The `raw` field in the API response is for the customer's audit log; the receipt anchors via hash to keep envelopes small and PII-free where possible.

### Signing path

Same as TrustBench:

1. Compute `receipt` object as JSON.
2. Canonicalize per RFC 8785.
3. Sign canonical bytes with Ed25519 private key.
4. Detached signature in `signature.value`, base64url-encoded.
5. Publish public key at `https://sanctionscreen.io/.well-known/sanctionscreen-pubkey` in the same single-line base64 format TrustBench uses.

A `@trustbench/verify-receipt`-style wrapper can validate this envelope with one change — the dual-probe needs to accept `receipt.matches` / `receipt.settlement` shape as the third envelope variant. Consider publishing `@sanctionscreen/verify-receipt` as a thin wrapper that calls into `@trustbench/verify-receipt` with a custom envelope adapter; OR simply document that `@trustbench/verify-receipt` v0.2.x adds a `--issuer sanctionscreen.io` flag that swaps the pubkey URL. Decision deferred to first integration partner conversation.

---

## 7. Pricing & business model

Flat per-call USDC settlement on Base. Per CLAUDE.md rules: never percentage-spread, never complexity-tied pricing.

| Surface | Price (USDC) | Notes |
|---|---|---|
| `/screen/name` | $0.005 | Single-name screening |
| `/screen/batch` | $0.003 × names.length | Min 10, max 100. One x402 payment, one receipt. |
| `/screen/lists` | Free | Public crawlable metadata |
| `/receipts/:id` | Free | Public verifiable artifact |

**No subscription.** Per partnership-day record, subscriptions are off the table.

**No free tier in v0.1.0.** Every screening is paid. Public metadata (`/screen/lists`) is free as a discovery surface. The free tier question revisits after first 30 days of paid traffic — if free-tier sampling unlocks more integrations, add it; if not, don't.

**No volume tier breakpoints in v0.1.0.** Negotiate partner-volume free credits ad hoc if a partner produces meaningful flow. Same posture as the TrustBench paywall.

---

## 8. Error envelope & failure modes

Shared error shape:

```typescript
type ErrorResponse = {
  error: string;             // stable code consumers can switch on
  detail: string;            // human-readable
  [extra: string]: unknown;  // per-error structured fields
};
```

| Failure | Status | `error` code | Notes |
|---|---|---|---|
| Body invalid JSON | 400 | `body_invalid` | |
| `name` missing or > 256 chars | 400 | `name_invalid` | |
| `threshold` out of [70, 95] | 400 | `threshold_out_of_range` | Includes `received` field |
| `lists[]` contains unknown source ids | 400 | `unknown_list_source` | Includes valid source list in `valid_sources` |
| Batch < 10 or > 100 names | 413 | `batch_size_invalid` | (413 because batch size is a payload-shape constraint) |
| Idempotency-Key missing or out of range | 400 | `idempotency_key_invalid` | Same shape as TrustBench |
| Idempotency conflict (key reused, body mismatch) | 409 | `idempotency_conflict` | Same shape as TrustBench |
| x402 payment missing/invalid | 402 | x402-standard | Standard x402 challenge response |
| All sources unreachable, no cached data | 503 | `service_unavailable` | Should never fire in steady state |
| Some sources unreachable, served degraded | 200 | (n/a — included in response body) | `degraded_sources` field populated |
| Database/internal error | 500 | `internal_error` | Logged + Discord-webhook alerted |

### Degraded-mode semantics

If a subset of sources is unreachable but cached data exists, screening proceeds against the cached data and the response carries `degraded_sources: [...]`. The receipt's `lists_consulted` lists each source with its actual `fetched_at` (which may be stale). The customer can decide whether the screening is sufficient for their use case based on which sources degraded.

If ALL sources are unreachable AND no cached data exists for any (cold-start scenario, which shouldn't happen post-launch), return 503 with `service_unavailable`. The x402 payment is NOT consumed in this case — refuse the challenge upfront.

---

## 9. Build sequence (weekend-by-weekend)

### Weekend 1 — minimum viable shippable

- Repo scaffolded: Hono + tsx + Supabase + Drizzle (or raw `pg`).
- `sanctions_entities` + `sanctions_list_versions` migrations applied.
- OFAC SDN ingest adapter only.
- `POST /screen/name` with RapidFuzz-equivalent (`fuzzball`) matching against OFAC SDN only.
- `GET /screen/lists` returns OFAC SDN row.
- Ed25519 keypair generated; well-known endpoint live.
- Receipt envelope signing live; `GET /receipts/:id` returns JSON.
- x402 paywall middleware wired (mirror of TrustBench's paywall pattern).
- Smoke test: agent → 402 → sign → retry → success → verify response signature → fetch receipt → verify signature.

**Validation gate (post-Weekend 1):** before building Weekend 2, send a 1-line message to Strata, CLU_AGENT, or a current Bazaar-indexed partner asking: "would a signed sanctions-screening endpoint at $0.005/call with on-chain anchor be useful to your audit / risk story?" If yes within a week, continue. If silence, defer Weekend 2+ and reinvest the time.

### Weekend 2 — list breadth + batch

- EU consolidated + UK OFSI ingest adapters.
- `POST /screen/batch` endpoint (10-100 names).
- Updated `/screen/lists` showing three sources.
- Idempotency layer using shared TrustBench-style pattern (Postgres + optional Redis for hot-cache; Redis can be skipped in v0.1.0 if traffic is low).
- HTML receipt view at `/receipts/:id` (content-negotiated).

### Weekend 3 — final two sources + listings

- AU DFAT + CA SEMA ingest adapters.
- `/.well-known/sanctionscreen.json` + `skill.md` + `llms.txt`.
- agentic.market listing submitted (mirror TrustBench's listing pattern — echo `402.extensions` in PaymentPayload).
- Coinbase Bazaar listing via CDP merchant-discovery (same path).
- Public landing page with honest framing (HTML, plain Tailwind; no React).

### Weekend 4+ (optional, demand-gated)

- Stale-list alerting via Discord webhook.
- Public verification badge image generator (`/badge/:receipt_id.svg`).
- Bulk file upload (CSV-in) — only if a paying partner explicitly asks.
- Monitoring / change-alerts ("notify me if X gets sanctioned later") — only if demand is real; this is the v0.2.0 watch surface.

---

## 10. Operational concerns

### Infra cost estimate

- **Railway:** $5/mo for the Hono service.
- **Supabase:** free tier sufficient at ~30K rows + low query volume.
- **Upstash Redis (optional):** free tier or $0 (skip in v0.1.0).
- **Domain:** $12/yr (one-time).
- **x402 revenue wallet gas:** facilitator covers, attributed to per-call price.

**Total marginal cost: ~$5/mo** on top of TrustBench's existing footprint. No new infrastructure category.

### Probing & monitoring shape

Same nightly pattern as TrustBench:

- GitHub Action at 02:00 UTC: run all six ingest adapters in sequence. Log per-source outcome to `sanctions_list_versions`.
- GitHub Action at 02:30 UTC: smoke test — submit a synthetic screening request via x402, verify response signature, verify receipt fetchable.
- Discord webhook fires on: any ingest adapter failure, any smoke-test failure, any source going stale > 7d, any source going degraded > 24h.

### List-stale alerting

If `sanctions_list_versions` shows no `success` row for a given source in **N days** where:

- N = 2 for daily-cadence sources (EU, UK, AU as XLSX update path).
- N = 7 for variable-cadence sources (OFAC SDN, OFAC Consolidated, CA SEMA).

→ Discord alert fires. The source is flagged stale in `/screen/lists` and in subsequent screening responses.

### Failure-mode paragraph (per CLAUDE.md high-risk-surface rule)

**"If the threshold drift / false-positive rate gets bad, what breaks, and how would we notice?"**

The single biggest risk to this service is silently shifting the matcher's threshold or weights and producing different results for the same input over time without anyone noticing. The receipt anchors the threshold used per call, so per-receipt verification still works — but the *aggregate behavior* drifting (e.g. a fuzzball version bump changes token-set-ratio scoring under the hood, false positives explode 3x) would erode trust without breaking any individual receipt.

How we'd notice:

- A **regression suite of 50 known-input → known-match-set pairs** runs nightly. If the match set for any pair changes, the smoke test fails and Discord alerts. Known inputs include: 5 obvious-match OFAC SDN entries, 5 obvious-non-match common-name controls (e.g. "John Smith"), 5 transliteration-edge-case entries (e.g. Cyrillic/Arabic names with multiple Romanization conventions), 5 EU/UK overlap entries, and 30 historical false-positive-prone names sampled from real traffic once it exists.
- The `threshold_used` field in the receipt + the `fuzzball` version pinned in `package.json` give us a forensic trail: if a real customer reports a regression, we can recompute the historical match at the historical threshold against the historical list version and either confirm or debunk.
- Pin `fuzzball` (or the chosen matcher library) at an exact patch version. Upgrades go through the regression suite, never auto-merged.

The receipt is the moat AND the safety net: even if our matcher drifts, the per-call receipt records what we actually did, and customers can hold us to it.

---

## 11. Honest framing rules (carry over from CLAUDE.md)

These rules are non-negotiable and apply to site copy, README, marketing, social posts, and partner conversations:

- **"Public-list lookup with citation."** Not "compliance determination," not "AML check," not "KYC service."
- **The customer makes the determination.** We surface matches with similarity scores and verbatim source data; they decide whether a match constitutes a hit and what action to take.
- **List version + entity_id + raw match always included.** Every response and every receipt name the exact list version consulted and the verbatim row matched. No black-box scoring.
- **No words "sanctions compliance," "AML check," "KYC," or "compliance certification"** in any public copy. These trigger regulatory expectations the service does not (and will not) meet.
- **Methodology page lives at `/methodology`** explaining: which lists are ingested, the refresh cadence, the matcher library + threshold defaults, the meaning of similarity scores, what we do NOT do (PEP / wallet / adverse media / KYB).
- **"Best-effort under stated methodology"** is the warranty. Public-list data + open-source matcher + signed receipt anchored on-chain. That's the entire contract.

---

## 12. What this does NOT include (explicit non-goals, restated for emphasis)

- **PEP (politically exposed persons) screening.** Commercial datasets only; out of scope permanently.
- **Wallet-address sanctions screening.** Coinbase facilitator KYT covers this at the payment layer; we screen names, not addresses.
- **Full adverse-media screening.** Out of scope.
- **Bulk CSV-in / CSV-out file uploads.** Batch JSON (10-100 names) only in v0.1.0; CSV deferred or never.
- **Long-term monitoring / change alerts.** No "alert me if X gets added later" in v0.1.0. Potential v0.2.0 surface if demand emerges.
- **Compliance certification.** We do not certify outputs as AML-compliant or sufficient under any specific regulatory regime. We provide raw match data with verifiable provenance; customers operate the determination layer.
- **Beneficial-ownership discovery / KYB.** Out of scope; drags in entity-registry maintenance + GDPR + certification liability.
- **Per-jurisdiction matching tuning.** One global matcher with one configurable threshold. Tuning per-jurisdiction is out of scope until demand justifies it.

---

## 13. Open questions deferred to first integration partner

These take a position in this doc but are revisitable when a partner explicitly pushes back:

1. **Is $0.005 / $0.003-bulk the right price?** Aligned with TrustBench's tiered anchoring; revisit after 30 days of paid traffic.
2. **Should the receipt envelope embed the verbatim source rows or only hashes?** Hashes by default keep envelopes lean; switch to embedded only if a customer's compliance review demands inline citation in the signed payload.
3. **Should `@trustbench/verify-receipt` be extended with a `--issuer` flag, or should this service publish a separate verifier package?** Defer to integration-partner preference.
4. **Should there be a `--explain` mode that returns per-row matcher score breakdowns?** Defer; auditors may want it, but adding it changes the response shape.
5. **Domain.** `sanctionscreen.io`, `sanctionsanchor.io`, `screen402.com`, or other? Defer until pre-launch. Avoid "screen" + "compliance" / "AML" / "KYC" composites for the framing reason above.

---

## 14. References

- `endpoint-portfolio-research-2026-05-14.md` — research brief that prioritized this candidate as GO #1.
- `CLAUDE.md` — honest-framing, non-custodial, solo-founder, founder-shape calibration rules carried verbatim.
- `phase4-paywall-design.md` — the architectural template this doc mirrors; paywall middleware, x402-server pattern, Ed25519 envelope conventions.
- `phase3-idempotency-design.md` — idempotency middleware pattern reused.
- `phase3-spend-caps.md` — atomic-units BigInt math + currency discipline reused.
- `receipt-spec-v1.md` — Ed25519 + JCS receipt envelope; the new `sanctions_screening.v1` envelope is wire-compatible with one variant addition (`receipt.matches` / `receipt.request` block).
- OFAC SDN file formats: https://ofac.treasury.gov/faqs/topic/1641
- OFAC SDN data spec: https://ofac.treasury.gov/system/files/126/dat_spec.txt
- EU consolidated financial sanctions: https://data.europa.eu/data/datasets/consolidated-list-of-persons-groups-and-entities-subject-to-eu-financial-sanctions
- UK OFSI consolidated list: https://www.gov.uk/government/publications/financial-sanctions-consolidated-list-targets
- RapidFuzz: https://github.com/rapidfuzz/RapidFuzz
- fuzzball (TS port): https://github.com/nol13/fuzzball.js
- Petter Strale demand signal: https://dev.to/petter-strale/your-x402-agent-just-paid-a-sanctioned-wallet-now-what-4d03

---

## 15. What's next after this design pass is approved

1. Register a separate GitHub repo (`sanctionscreen` or final-named).
2. Provision a fresh Ed25519 keypair (do NOT reuse TrustBench's). Publish public key at `/.well-known/sanctionscreen-pubkey`.
3. Provision a dedicated revenue wallet on Base for this service. Test with a $0.005 self-payment before flipping live.
4. Weekend 1 build (OFAC SDN only + single-name endpoint + receipt envelope).
5. Validation gate: send one partner DM. If yes within a week, Weekend 2. If silence, hold.
6. Weekend 2 + 3 build sequence.
7. Listing sprint (agentic.market + Bazaar + awesome-x402 PR).
8. Instrument 30 days of paid traffic, then revisit pricing, free-tier, and v0.2.0 monitoring surface.
9. Apply the 90-day kill criterion from the portfolio research brief: if fewer than 50 paid calls from non-self-test wallets at 90d, pause the portfolio play.
