# Phase 3 — Provider Selection

**Status:** Design draft. Implementation pending (Claude scaffolds, Grok wires, Claude reviews).
**Decision date:** 2026-05-01

## Why this exists

Step 6 (`phase3-x402-construction.md`) calls `selectProvider(capability)` and assumes it returns a primary + secondary fallback. This memo defines that function's contract. It is deliberately the smallest of the four Phase 3 design memos because we already have a Reputation Layer running (`scorecards` table + nightly probe/score pipeline) and provider selection is mostly *querying* that data, not computing new state.

The single most important property: **routing decisions are measurement-based, never pay-to-rank.** The pricing model (flat-per-tx fee + future refundable verification bond) means a provider can pay to *list*, but score determines *who gets the call*. Phase 2 builders explicitly rejected percentage spreads and pay-to-rank schemes. The selection function is the place where that promise is enforced.

## Inputs and outputs

```ts
type SelectProviderInput = {
  capability: string;          // 'search' | 'inference' | 'data' (lowercased)
  agent_mode: 'live' | 'test'; // from auth context; gates routing pool
};

type ProviderPick = {
  provider_id: string;         // matches scorecards.provider_id (url as key)
  provider_url: string;        // probe / settle URL
  score: number;               // score at decision time
};

type SelectProviderOutput =
  | { ok: true; primary: ProviderPick; secondary: ProviderPick | null;
      alternatives_considered: number; selection_reason: string }
  | { ok: false; reason: 'no_provider_for_capability' | 'all_below_floor' };
```

Caller responsibility (the `quoteHandler` from `phase3-x402-construction.md`):

- If `ok: false`, return 503 with the `reason` as the `error` code.
- If `ok: true`, probe `primary.provider_url` first. On 402 challenge mismatch / network error / timeout, fall back to `secondary`. On secondary failure, return 502 `provider_unavailable`.

## Data source

**Read from `scorecards`, not `providers`.** Scorecards are the post-probe, post-score view; the providers table is the registry surface. We always rank by score, so the scorecards table is authoritative for ordering.

The relevant columns (from the existing `schema.sql`):

| Column | Used for |
|---|---|
| `provider_id` (PK, url-as-key) | identity + URL |
| `capability` | filter |
| `score` (40–98) | ranking |
| `latency_p50` | tiebreak |
| `last_updated` | freshness floor |

Index `idx_scorecards_capability_score (capability, score desc)` already exists — selection is a single index scan with no extra schema work.

We do NOT join to `providers` for selection. The provider URL IS the `provider_id` in scorecards (deliberate denormalization in the existing schema). One query, one round-trip.

## Selection algorithm

```
SELECT provider_id, score, latency_p50, last_updated
FROM scorecards
WHERE capability = $1
  AND score >= 40                           -- score floor (the lower clamp from prober.ts)
  AND last_updated > now() - interval '48 hours'   -- freshness floor
ORDER BY score DESC, latency_p50 ASC NULLS LAST, provider_id ASC
LIMIT 5;
```

Decision rules in order:

1. **Capability filter.** Only consider scorecards whose `capability` exactly matches the requested capability. No fuzzy matching, no synonyms.
2. **Score floor (40).** The prober clamps scores to [40, 98]; rows below 40 imply something pathological happened (data corruption, manual override). Skip them.
3. **Freshness floor (48 hours).** A scorecard older than 48h is stale — the nightly pipeline runs every 24h, so 48h means at least one missed run. Don't route to a provider we haven't measured recently.
4. **Sort: `score DESC, latency_p50 ASC NULLS LAST, provider_id ASC`.** Tiebreaks are deterministic so two concurrent calls with the same inputs always pick the same provider (idempotent routing decisions).
5. **`LIMIT 5`.** We only need top-2, but pulling 5 lets us count `alternatives_considered` accurately and gives a small buffer for the in-process fallback if both primary and secondary fail probing on subsequent requests (Phase 4 can use it; Phase 3 doesn't).
6. **Pick `primary = rows[0]`, `secondary = rows[1]` (or null).**
7. If `rows.length === 0`, return `{ ok: false, reason: 'no_provider_for_capability' }`.

Output `selection_reason` is a stable string describing why this provider won. Phase 3 values:

- `'top_score'` — normal case, primary has the highest score.
- `'sole_provider'` — only one row passed the filters; `secondary === null`.
- (Phase 4 may add `'fallback_after_primary_failure'`, `'paid_bond_priority'`, etc. — out of scope here.)

`alternatives_considered` = `min(rows.length, 5)` — purely informational, recorded on the receipt for audit.

## Anti-flapping

A persistent worry with score-driven routing: two providers with scores 87.0 and 86.9 will hand off requests every time the prober runs and the order flips. From the agent's perspective, that's noise.

**Phase 3 anti-flap policy: none.** The deterministic tiebreak (`score DESC, latency_p50 ASC, provider_id ASC`) ensures a single ordering per probe run; no stickiness across runs.

This is intentional. Score is computed from a 3-sample probe per provider per night — not enough signal to justify hysteresis. If 87.0 vs 86.9 is genuinely meaningless, the right fix is to widen the score buckets (e.g., quantize to multiples of 5), not to add stickiness. Quantization is a Phase 4 calibration concern.

If a Phase 4 builder reports flap-induced caching invalidation, two simple options become available without redesign: (a) round score to nearest 5 in the ORDER BY, (b) add a "preferred provider" hint that the agent can pass in the `/route` body.

## Caching

We already have a Redis cache for `/rankings` (`src/scorer.ts` uses `getRankings(capability)` which caches in Redis). The same cache is fine for `/route`'s selection — provider rankings only change after the nightly probe pipeline runs.

**Reuse `getRankings(capability)` directly.** It returns scorecards already ordered, already filtered, already cached. The selection function is roughly:

```ts
const rankings = await getRankings(capability);   // Redis-cached, falls through to PG
const filtered = rankings.filter(r => r.score >= 40 && isFresh(r.last_updated));
return {
  primary: filtered[0], secondary: filtered[1] ?? null,
  alternatives_considered: Math.min(filtered.length, 5),
  selection_reason: filtered.length > 1 ? 'top_score' : 'sole_provider',
};
```

Two implications:

1. The score floor (40) and freshness floor are applied client-side because the existing `getRankings` doesn't enforce them. This is acceptable — the cached list is short (≤20 providers per capability today), filtering in JS is microseconds.
2. The cache TTL is whatever `scorer.ts` sets today; we don't tighten it for `/route`. Nightly probe rotation is the authoritative invalidation event.

## Provider failure handling

Phase 3 provider failures are handled in two layers:

1. **Selection time** — only filters out scorecards that are dead by metadata (stale `last_updated`, score below floor). It does NOT live-probe at selection time; selection is fast and cache-friendly.
2. **Probe time** (in `quoteHandler`, after selection) — if `primary.provider_url` doesn't return a valid x402 challenge, the handler retries with `secondary.provider_url`. If secondary also fails, return 502. The `phase3-x402-construction.md` memo names this flow.

**Anti-pattern explicitly avoided:** Phase 3 does NOT mutate `scorecards.score` based on `/route`-time failures. The probe pipeline is the only writer to scorecards. Reactive score adjustments based on agent traffic invite gaming and create a feedback loop that's hard to reason about. If a provider is genuinely broken, the next nightly probe will catch it; until then, fallback handles the immediate request.

Phase 4 may add a separate "live signal" table that records `/route`-time outcomes for downstream calibration of the next probe run, without touching the canonical score.

## Pay-to-list and bond logic

**Out of scope for Phase 3.** Selection considers no commercial signal. `provider.metadata` may carry future fields (`bond_amount`, `bond_expires_at`, `featured_until`) but the selection function ignores them.

The Phase 4 plan in CLAUDE.md is: refundable provider verification bond gates *listing*, not ranking. Even after Phase 4 ships, the selection function will still return providers in score order; bonds will only affect whether a provider is in the candidate pool at all.

## Test scenarios

For Grok (or whoever implements `selectProvider`) to write unit tests against:

1. **Happy path — top score wins.** Three scorecards for `search`: scores 90, 85, 80. → primary score 90, secondary score 85, `alternatives_considered=3`, `selection_reason='top_score'`.
2. **Tiebreak by latency.** Two scorecards both score 85, latencies 100ms and 200ms. → primary is the one with 100ms latency, secondary the other.
3. **Tiebreak by provider_id.** Two scorecards, same score, same latency, IDs `a.com` and `b.com`. → primary `a.com` (lex order), secondary `b.com`. Two concurrent calls return identical picks.
4. **No providers.** Empty result for capability. → `{ ok: false, reason: 'no_provider_for_capability' }`.
5. **All below score floor.** All 4 candidates have score 39. → `{ ok: false, reason: 'all_below_floor' }`.
6. **All stale.** All candidates have `last_updated` >48h. → `{ ok: false, reason: 'no_provider_for_capability' }` (treat stale as absent — the agent's perspective is identical: nothing routable).
7. **Sole provider.** Exactly one row passes filters. → primary populated, secondary null, `selection_reason='sole_provider'`.
8. **Score floor exact match.** Score = 40 → included; score = 39 → excluded.
9. **Freshness floor exact match.** `last_updated = now() - interval '47:59:00'` → included; `now() - interval '48:00:01'` → excluded.
10. **Capability case sensitivity.** `selectProvider('Search')` vs `'search'` — convention is lowercase; non-lowercase input is the caller's bug. Handler normalizes input to lowercase before calling the selector. Test the contract: selector receives already-normalized capability.

## Locked decisions

1. **Data source: `scorecards` table only.** No JOIN to `providers`. The url-as-key denormalization is sufficient.
2. **Score floor: 40.** Aligns with the prober's lower clamp; rows below are anomalies.
3. **Freshness floor: 48 hours.** Covers one missed probe run with margin. Tighter (24h exact) is brittle when probes occasionally miss; looser (96h) lets dead providers stay routable too long.
4. **Top-2 with deterministic tiebreaks** (`score DESC, latency_p50 ASC NULLS LAST, provider_id ASC`). No anti-flap stickiness in Phase 3.
5. **Reuse `getRankings(capability)` from `scorer.ts`.** No new cache layer, no new SQL. Filters applied client-side.
6. **Selection is read-only.** No score mutations, no flag-on-failure writes.
7. **No commercial signals.** Pay-to-list and bond logic do not influence Phase 3 ranking.
8. **Agent-mode gating: deferred.** Phase 3 routes both `live` and `test` mode requests against the same scorecard pool. A separate "test pool" with dummy providers is a Phase 4 add (or sooner if real test traffic surfaces a need to isolate). The `agent_mode` field is in the input signature for forward-compatibility but is not used in Phase 3 logic.
9. **`alternatives_considered` capped at 5** for the receipt's audit field. Smaller numbers leak less about our pool size while still answering "did you consider others"; 5 is enough to be informative without being a routing surface.

## Out of scope (Phase 4+)

- Anti-flap hysteresis or score quantization.
- Per-provider exclusion lists (agent-supplied or admin-maintained).
- Geographic affinity (route to provider closest to agent / payer).
- Live-signal table for `/route`-time outcomes feeding the score model.
- Pay-to-list / bond gating of the candidate pool.
- Multi-region / multi-host probe sources changing the "score" semantics.
- Provider categories beyond the current three (`search`, `inference`, `data`).
- Capability + sub-capability routing (e.g., `search:academic` vs `search:general`).
- Merkle commitment to the alternatives list (per the InfopunksHQ receipt-spec memory note about `alternatives_considered` opacity).

## Files this spec touches

| Path | Change |
|---|---|
| `src/provider-selection.ts` | New. `selectProvider(capability, agent_mode)` per the pseudocode. ~50 lines. |
| `src/scorer.ts` | Unchanged. Selection reuses `getRankings()` as-is. |
| `src/route-handlers.ts` | Calls `selectProvider` from `quoteHandler` (per `phase3-x402-construction.md`). |
| `phase3-handoff.md` | Mark step 7 done. |

No schema changes. The existing `idx_scorecards_capability_score` index covers the read path.

## Pseudocode

```typescript
import { getRankings } from './scorer.js';
import type { Scorecard } from './types.js';

export type Capability = 'search' | 'inference' | 'data';
export type AgentMode = 'live' | 'test';

export type ProviderPick = {
  provider_id: string;
  provider_url: string;   // == provider_id in the current schema (url-as-key)
  score: number;
};

export type SelectProviderResult =
  | {
      ok: true;
      primary: ProviderPick;
      secondary: ProviderPick | null;
      alternatives_considered: number;
      selection_reason: 'top_score' | 'sole_provider';
    }
  | { ok: false; reason: 'no_provider_for_capability' | 'all_below_floor' };

const SCORE_FLOOR = 40;
const FRESHNESS_FLOOR_MS = 48 * 60 * 60 * 1000;
const ALTERNATIVES_CAP = 5;

export async function selectProvider(
  capability: Capability,
  // agent_mode reserved for Phase 4 routing-pool isolation; unused in Phase 3.
  _agent_mode: AgentMode = 'live'
): Promise<SelectProviderResult> {
  // getRankings is Redis-cached, ordered by score DESC.
  const rankings = await getRankings(capability);

  if (!rankings || rankings.length === 0) {
    return { ok: false, reason: 'no_provider_for_capability' };
  }

  const now = Date.now();
  const candidates = rankings
    .filter((r: Scorecard) => {
      if (r.score < SCORE_FLOOR) return false;
      const updatedMs = new Date(r.last_updated).getTime();
      if (now - updatedMs > FRESHNESS_FLOOR_MS) return false;
      return true;
    })
    // Deterministic tiebreak — getRankings already sorts by score DESC, but
    // we re-stabilize here in case the cached list lost a tiebreak rule
    // somewhere upstream. Cheap and self-documenting.
    .sort((a: Scorecard, b: Scorecard) => {
      if (b.score !== a.score) return b.score - a.score;
      const aLat = a.latency_p50 ?? Number.POSITIVE_INFINITY;
      const bLat = b.latency_p50 ?? Number.POSITIVE_INFINITY;
      if (aLat !== bLat) return aLat - bLat;
      return a.provider_id.localeCompare(b.provider_id);
    });

  if (candidates.length === 0) {
    // Distinguish "no rows for capability at all" from "rows existed but all
    // failed score/freshness floors" — the second case is recoverable
    // (waiting for the next probe run) and worth its own error code.
    return { ok: false, reason: 'all_below_floor' };
  }

  const top = candidates.slice(0, 2);
  return {
    ok: true,
    primary: { provider_id: top[0].provider_id, provider_url: top[0].provider_id, score: top[0].score },
    secondary: top[1]
      ? { provider_id: top[1].provider_id, provider_url: top[1].provider_id, score: top[1].score }
      : null,
    alternatives_considered: Math.min(candidates.length, ALTERNATIVES_CAP),
    selection_reason: top.length > 1 ? 'top_score' : 'sole_provider',
  };
}
```
