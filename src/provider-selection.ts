// src/provider-selection.ts — Phase 3 provider selection.
//
// Full design + locked decisions: phase3-provider-selection.md.
//
// Contract: given a capability, return the top-2 providers ranked by score
// with deterministic tiebreaks. Caller probes primary; on failure, falls
// back to secondary.
//
// Phase 3 selection is purely measurement-based — pay-to-list / bond logic
// is out of scope. Routing decisions never consider commercial signal.

import { getRankings } from './scorer.js';

// Routable capabilities. Phase 4 P4-1c expansion 2026-05-05: aligned with
// Coinbase Agentic Market's 5-category taxonomy (Search / Inference / Data /
// Media / Infra). Categories beyond these are still STORED on the providers
// row when crawled (see crawler.ts), but are not picked by /route until they
// graduate into this union — keeps the routing surface explicit and the
// validator-side error message meaningful.
export type Capability = 'search' | 'inference' | 'data' | 'media' | 'infra';
export const ROUTABLE_CAPABILITIES: ReadonlySet<Capability> =
  new Set(['search', 'inference', 'data', 'media', 'infra'] as const);
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

// Constants from phase3-provider-selection.md § "Locked decisions":
const SCORE_FLOOR = 40;                              // matches prober.ts lower clamp
const FRESHNESS_FLOOR_MS = 48 * 60 * 60 * 1000;      // 48h covers one missed nightly run
const ALTERNATIVES_CAP = 5;                          // receipt audit field cap

// Minimal shape — getRankings returns a denormalized row mixing provider +
// scorecard fields. x402_verified is the providers.metadata.x402_verified
// bit, projected by getRankings (added 2026-05-05). It's the highest-priority
// sort key in selectProvider — we prefer providers we've live-confirmed
// emit a v2 x402 challenge body over higher-scoring unverified ones.
type RankingRow = {
  provider_id: string;
  score: number;
  latency_p50: number | null;
  last_updated: string;
  x402_verified?: boolean;
  // Phase 4b (2026-05-08): network field added by scorer.ts. Used to
  // exclude non-Base providers from routing until P4-3 (Solana settlement)
  // ships. Optional in the type because legacy cached entries (v4 cache
  // keys) may not have it; defensive default in the filter handles that.
  network?: 'base' | 'solana';
};

/**
 * Pick the top-2 providers for a capability. Reuses the Redis-cached
 * rankings from scorer.ts; selection is pure CPU on top of the cached list.
 *
 * @param capability  Lowercase, validated by the caller.
 * @param _agent_mode Reserved for Phase 4 routing-pool isolation; unused.
 */
export async function selectProvider(
  capability: Capability,
  _agent_mode: AgentMode = 'live'
): Promise<SelectProviderResult> {
  const rankings = (await getRankings(capability)) as RankingRow[] | null;

  if (!rankings || rankings.length === 0) {
    return { ok: false, reason: 'no_provider_for_capability' };
  }

  const now = Date.now();
  const candidates = rankings
    .filter((r) => {
      // Phase 4b (2026-05-08): Solana visibility unblock moved this filter
      // here from scorer.ts. /rankings now shows all networks for public
      // transparency; /route stays Base-only until P4-3 (Solana settlement)
      // ships. Defense in depth: route-handlers.ts validateChallenge will
      // also reject non-Base challenges with 502 if anything sneaks through.
      // Default to Base when the network field is missing (legacy cached
      // entries from v4 cache keys, before this field existed). Bumping
      // the cache key to v5 in scorer.ts forces refresh on first call.
      if (r.network && r.network !== 'base') return false;
      if (r.score < SCORE_FLOOR) return false;
      const updatedMs = new Date(r.last_updated).getTime();
      if (Number.isNaN(updatedMs)) return false;
      if (now - updatedMs > FRESHNESS_FLOOR_MS) return false;
      return true;
    })
    // Sort priority (added 2026-05-05):
    //   1. x402_verified=true comes first — we've live-confirmed these
    //      providers emit a valid v2 x402 challenge body. Score is a
    //      liveness signal (HEAD-probe success); x402_verified is the
    //      conformance signal. In a payment-routing context, conformance
    //      matters more than HEAD latency. An unverified provider with
    //      score=97 might just be a non-x402 API root that returns 200/401
    //      to a HEAD probe — we'd burn a probe attempt against it for nothing.
    //   2. Within each verification class, higher score wins.
    //   3. Latency_p50 ASC tiebreaks score ties.
    //   4. provider_id ASC stabilizes the rest.
    //
    // Failure mode: if a verified provider is wrongly flagged (metadata says
    // x402_verified=true but the endpoint isn't actually x402), it'll be
    // tried first, fail with provider_invalid_challenge or provider_unavailable,
    // and the caller falls back to the secondary. Worst case: 1 wasted probe.
    .sort((a, b) => {
      const aV = a.x402_verified === true;
      const bV = b.x402_verified === true;
      if (aV !== bV) return aV ? -1 : 1;
      if (b.score !== a.score) return b.score - a.score;
      const aLat = a.latency_p50 ?? Number.POSITIVE_INFINITY;
      const bLat = b.latency_p50 ?? Number.POSITIVE_INFINITY;
      if (aLat !== bLat) return aLat - bLat;
      return a.provider_id.localeCompare(b.provider_id);
    });

  if (candidates.length === 0) {
    // Distinguish "no rows for capability at all" from "rows existed but
    // all failed score/freshness floors" — the second is recoverable
    // (waiting for the next probe run) and worth its own error code.
    return { ok: false, reason: 'all_below_floor' };
  }

  const top = candidates.slice(0, 2);

  // The url-as-key denormalization in the current schema means provider_id
  // IS the URL. If that ever changes, this is the line to update.
  return {
    ok: true,
    primary: {
      provider_id: top[0].provider_id,
      provider_url: top[0].provider_id,
      score: top[0].score,
    },
    secondary: top[1]
      ? {
          provider_id: top[1].provider_id,
          provider_url: top[1].provider_id,
          score: top[1].score,
        }
      : null,
    alternatives_considered: Math.min(candidates.length, ALTERNATIVES_CAP),
    selection_reason: top.length > 1 ? 'top_score' : 'sole_provider',
  };
}
