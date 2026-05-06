// src/spend-caps.ts — Phase 3 spend-cap enforcement middleware.
//
// Full design + locked decisions: phase3-spend-caps.md.
// Phase 4 P4-7 reservation pattern: phase4-spend-caps-reservation.md.
//
// Position in the chain:
//   app.post('/route', requireAgent, withIdempotency, requireWithinSpendCap, handler)
//                                    ^^^^^^^^^^^^^^^                ^^^^^^^^^^^^^^^^^
//                                    claim slot first, so retries  this middleware
//                                    of completed/rejected calls   guards every call
//                                    replay through idempotency    that didn't replay
//                                    without re-evaluating caps
//
// Three layers of cap, all conservative; ALL must pass:
//   1. max_price (per-request, agent-supplied)
//   2. agents.spend_cap_per_call_atomic   (per-agent ceiling per call)
//   3. agents.spend_cap_rolling_atomic    (per-agent rolling window)
//
// Source of truth for "what has the agent spent" is the receipts table —
// no spend_log. Aggregation is done in JS (BigInt) over receipts in the
// rolling window; ok at Phase 4 traffic levels, switch to a Postgres RPC
// later if any agent's per-window receipt count exceeds ~1k.
//
// Atomic-unit strings everywhere; never floats. USDC has 6 decimals so
// "1000000" = $1.00. Strings on the wire and in Postgres, BigInt in math.
//
// ============================================================================
// P4-7 reservation pattern (high-risk surface — failure-mode paragraph)
// ============================================================================
// Behind SPEND_CAP_RESERVATION_ENABLED env flag. When 'true', the rolling-cap
// section calls the claim_spend_reservation Postgres function to atomically
// (a) check `spent + pending + requested <= cap` and (b) debit the agent's
// pending_spend_atomic counter — both inside a single conditional UPDATE.
// Concurrent /route quotes serialize on the agents row, so two quotes at the
// cap edge can't both pass. This closes the documented Phase 3 race where
// `(parallelism − 1) × max_price` could overshoot the cap.
//
// Failure modes:
//   (a) Function not deployed or RPC errors → fall through to legacy JS-side
//       check, log-loud. Today's behavior preserved.
//   (b) Conditional UPDATE WHERE clause too loose → cap breached under
//       concurrency. Detectable via observed receipts. C3 smoke test catches
//       this directly (3 concurrent quotes against 2x cap → exactly 2 succeed).
//   (c) Agent's pending debited but the quote insert in handler fails →
//       compensating refund issued by quoteHandler; if THAT fails (e.g. crash
//       between debit and compensate), pending leaks until daily reconciliation
//       cron picks it up (worst case ≤24h). Cap is over-allocated, never
//       breached.
//   (d) Settle credit-back fires before merchant call returns → for the
//       merchant-call window, pending under-counts actual spend. Same window
//       the user already accepts under non-custodial semantics. Bounded by
//       merchant response time; documented in design doc § Failure-mode
//       analysis.

import { createMiddleware } from 'hono/factory';
import { createClient } from '@supabase/supabase-js';
import type { AgentContext } from './auth.js';

// Same env-var convention as src/auth.ts and src/scorer.ts.
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

// Phase 3 is USDC-only. Multi-currency lands in Phase 4 once we know whether
// the provider's payment currency varies per route.
const PHASE_3_CURRENCY = 'USDC';

// Default Retry-After (seconds) when we can't compute a precise hint
// (e.g. rolling cap exceeded but no in-window receipts somehow).
const DEFAULT_RETRY_AFTER_SECONDS = 60;

// P4-7 reservation pattern feature flag. When 'true', the rolling-cap section
// uses the claim_spend_reservation Postgres function for atomic cap-check +
// pending debit. When unset/false, falls through to the legacy JS-side check
// (preserves Phase 3 behavior for canary). Read once per request because env
// reads are cheap and lets ops flip the flag without restart on Railway's
// hot-reload deploys.
function reservationEnabled(): boolean {
  return process.env.SPEND_CAP_RESERVATION_ENABLED === 'true';
}

// Receipts table projection for the rolling-window query. Index
// idx_receipts_agent_issued (agent_id, issued_at desc) covers this scan.
type ReceiptWindowRow = {
  total_paid_atomic: string;
  issued_at: string;
};

export const requireWithinSpendCap = createMiddleware<AgentContext>(async (c, next) => {
  const agentId = c.get('agent_id');
  const caps = c.get('agent_caps');

  // Defense in depth: if auth middleware didn't run, fail loud rather than
  // silently letting the request through with no cap enforcement.
  if (!agentId || !caps) {
    return c.json({ error: 'internal_error', detail: 'agent_id or agent_caps missing — middleware ordering bug' }, 500);
  }

  // ---- Parse + validate the body's max_price -----------------------------
  // c.req.json() is cached by Hono — the idempotency middleware already
  // parsed the body for hashing, so this is an in-memory read.
  const body = await c.req.json().catch(() => ({} as Record<string, unknown>));
  const rawMaxPrice = (body as { max_price?: unknown }).max_price;

  if (typeof rawMaxPrice !== 'string' || rawMaxPrice.length === 0) {
    return c.json(
      {
        error: 'max_price_required',
        detail: 'max_price (atomic-unit integer string) is required on POST /route',
      },
      400
    );
  }

  // /^\d+$/ rejects negatives, decimals, scientific notation, leading +.
  // Atomic-unit values are always non-negative integers expressed as digits.
  if (!/^\d+$/.test(rawMaxPrice)) {
    return c.json(
      {
        error: 'max_price_invalid',
        detail: 'max_price must be a non-negative integer atomic-unit string (e.g. "10000" for $0.01 USDC)',
        received: rawMaxPrice,
      },
      400
    );
  }

  let maxPrice: bigint;
  try {
    maxPrice = BigInt(rawMaxPrice);
  } catch {
    return c.json(
      { error: 'max_price_invalid', detail: 'max_price could not be parsed as BigInt', received: rawMaxPrice },
      400
    );
  }
  if (maxPrice <= 0n) {
    return c.json(
      { error: 'max_price_invalid', detail: 'max_price must be > 0', received: rawMaxPrice },
      400
    );
  }

  // ---- Currency guard ----------------------------------------------------
  // Phase 3 only supports USDC. The cap currency is per-agent; if the agent
  // somehow has a non-USDC cap configured, reject loudly rather than silently
  // routing across a currency boundary we haven't designed for.
  if (caps.currency !== PHASE_3_CURRENCY) {
    return c.json(
      {
        error: 'currency_mismatch',
        detail: `Phase 3 supports only ${PHASE_3_CURRENCY}; agent cap is denominated in ${caps.currency}`,
        agent_cap_currency: caps.currency,
        call_currency: PHASE_3_CURRENCY,
      },
      400
    );
  }

  // ---- Per-call cap ------------------------------------------------------
  // Conservative: we compare agent-supplied max_price (worst case) against
  // the per-call cap. If the provider quote is lower, we still won't breach.
  if (caps.per_call_atomic !== null) {
    const perCallCap = BigInt(caps.per_call_atomic);
    if (maxPrice > perCallCap) {
      return c.json(
        {
          error: 'per_call_cap_exceeded',
          detail: 'requested max_price exceeds the agent per-call spend cap',
          cap_atomic: perCallCap.toString(),
          requested_atomic: maxPrice.toString(),
          currency: caps.currency,
        },
        400
      );
    }
  }

  // ---- Rolling cap -------------------------------------------------------
  // Sum total_paid_atomic across receipts issued in the last N minutes.
  // Conservative: we add max_price (not actual settled) before comparing,
  // so agents may be rejected slightly earlier than strictly necessary, but
  // the cap is never breached on a single-request basis.
  //
  // P4-7 reservation pattern (when SPEND_CAP_RESERVATION_ENABLED='true'):
  // the JS-side `if (spent + maxPrice > cap)` check below is replaced by a
  // single conditional UPDATE on agents that atomically (a) verifies
  // `spent + pending + maxPrice <= cap` and (b) debits pending_spend_atomic.
  // Concurrent quotes serialize on the agents row → cap honored to the byte
  // even under high parallelism. The corresponding credit-back lives in
  // settleHandler (phase4-spend-caps-reservation.md § "At settle"). When the
  // flag is unset/false we fall through to the legacy JS-side path, which is
  // approximately enforced under concurrency (the documented Phase 3 race).
  if (caps.rolling_atomic !== null) {
    const rollingCap = BigInt(caps.rolling_atomic);
    const windowMinutes = caps.rolling_window_minutes;
    const windowStartIso = new Date(Date.now() - windowMinutes * 60_000).toISOString();

    // Read receipts in window. Needed for spent_recent (both paths) AND for
    // the Retry-After hint (rejection branch). Same query both paths.
    const { data: rows, error: queryErr } = await supabase
      .from('receipts')
      .select('total_paid_atomic, issued_at')
      .eq('agent_id', agentId)
      .gte('issued_at', windowStartIso)
      .returns<ReceiptWindowRow[]>();

    if (queryErr) {
      console.error('[spend-caps] rolling-spend lookup failed:', queryErr.message);
      return c.json({ error: 'spend_cap_unavailable' }, 503);
    }

    const inWindow = rows ?? [];
    const spent = inWindow.reduce(
      (sum, r) => sum + BigInt(r.total_paid_atomic),
      0n
    );

    let capBreached = false;

    if (reservationEnabled()) {
      // P4-7 path: atomic cap-check + pending debit via Postgres function.
      // Returns the new pending_spend_atomic on success, NULL when the WHERE
      // clause rejected the UPDATE (cap would be breached).
      //
      // numeric() in Postgres accepts string-of-digits — passing maxPrice.toString()
      // / spent.toString() / caps.rolling_atomic preserves arbitrary precision
      // through the wire (PostgREST coerces param types based on the function
      // signature). Same precision contract as the rest of the codebase.
      const { data: rpcResult, error: rpcErr } = await supabase.rpc(
        'claim_spend_reservation',
        {
          p_agent_id: agentId,
          p_max_price: maxPrice.toString(),
          p_rolling_cap: caps.rolling_atomic,    // string of digits, NUMERIC on the function side
          p_spent_recent: spent.toString(),
        }
      );

      if (rpcErr) {
        // Function-deploy failures, RPC layer errors, or DB unreachable.
        // Loud log + fall through to legacy JS check. We prefer "approximate
        // enforcement" (today's behavior) over "everyone gets 503" when the
        // reservation infra is misbehaving.
        console.error(
          '[spend-caps] claim_spend_reservation RPC failed; falling back to JS check:',
          rpcErr.message
        );
        capBreached = spent + maxPrice > rollingCap;
      } else {
        // rpcResult is the new pending value, or null when WHERE rejected.
        capBreached = rpcResult === null;
        if (!capBreached) {
          // Stash the route_id-bound debit amount for downstream — the
          // handler doesn't need to know about pending, but the failure-mode
          // doc says "if quote insert fails, refund pending" so the handler
          // needs the amount to compensate. max_price_atomic is already on
          // the context; no extra carry needed.
          // (Compensation logic lives in quoteHandler; see phase4-spend-caps-
          // reservation.md § "Decision 2".)
        }
      }
    } else {
      // Legacy Phase 3 path (approximate enforcement under concurrency).
      capBreached = spent + maxPrice > rollingCap;
    }

    if (capBreached) {
      // Retry-After hint: time until the OLDEST in-window receipt rolls out.
      // Best-effort — the agent might still need to wait longer if multiple
      // receipts must roll out before there's room for max_price. The exact
      // calculation is a Phase 4 nicety; this gets the agent to a sensible
      // back-off without overcomplicating the middleware.
      let retryAfterSec = DEFAULT_RETRY_AFTER_SECONDS;
      if (inWindow.length > 0) {
        const oldestIso = inWindow.reduce(
          (acc, r) => (r.issued_at < acc ? r.issued_at : acc),
          inWindow[0].issued_at
        );
        const oldestRollOutMs = new Date(oldestIso).getTime() + windowMinutes * 60_000;
        retryAfterSec = Math.max(1, Math.ceil((oldestRollOutMs - Date.now()) / 1000));
      }

      return c.json(
        {
          error: 'rolling_cap_exceeded',
          detail: 'agent rolling spend cap would be exceeded by this call',
          cap_atomic: rollingCap.toString(),
          spent_atomic: spent.toString(),
          requested_atomic: maxPrice.toString(),
          window_minutes: windowMinutes,
          currency: caps.currency,
        },
        429,
        { 'Retry-After': String(retryAfterSec) }
      );
    }
  }

  // ---- Stash for the handler ---------------------------------------------
  // The /route handler will use max_price_atomic for x402 challenge
  // construction. Stash here so the handler doesn't re-parse and re-validate.
  c.set('max_price_atomic', maxPrice.toString());

  await next();
});
