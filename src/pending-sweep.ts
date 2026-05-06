// src/pending-sweep.ts — P4-7 expired-reservation sweep timer.
//
// Full design + lifecycle: phase4-spend-caps-reservation.md § "At quote expiry".
//
// Runs every 60 seconds in-process. Calls the Postgres function
// sweep_expired_reservations() which finds quotes whose validity window
// elapsed without a settle (`pending_released_at IS NULL AND valid_until <
// now()`), marks them released, and decrements the corresponding agents'
// pending_spend_atomic counters.
//
// Idempotent — re-running on the same row is a no-op because the WHERE
// filters on pending_released_at IS NULL.
//
// Failure modes:
//   - Function not deployed → RPC returns error → log loud, retry next
//     tick. Pending stays elevated for affected agents until the daily
//     reconciliation cron runs.
//   - DB unreachable mid-sweep → same as above; transient.
//   - Sweep takes longer than the interval → we don't fire two concurrent
//     sweeps. The current tick awaits before scheduling the next; setInterval
//     would overlap, but we use a self-rescheduling setTimeout pattern.
//
// Solo-founder lens: zero new infrastructure. setTimeout in-process, no
// extra workers, no cron container. If Railway restarts the process, the
// next boot picks up the sweep on the same 60s cadence. Quotes that
// expired during the restart window get caught by the next tick.

import { createClient } from '@supabase/supabase-js';

const SWEEP_INTERVAL_MS = 60_000; // 60 seconds — matches design doc

// Same Supabase client convention as the rest of the codebase. Service
// role bypasses RLS so the function can touch agents + quotes freely.
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

let started = false;

/**
 * Start the in-process sweep timer. Call once at boot from src/index.ts.
 * Safe to call multiple times — re-entry is a no-op.
 *
 * Returns a stop function for tests that want to halt the sweep cleanly.
 * Production code should not stop it; the sweep runs for the lifetime of
 * the server process.
 */
export function startPendingSweep(): () => void {
  if (started) {
    console.warn('[pending-sweep] startPendingSweep called twice; ignoring second call');
    return () => {};
  }
  if (process.env.SPEND_CAP_RESERVATION_ENABLED !== 'true') {
    // Reservation pattern is disabled. Don't run the sweep at all — there
    // are no debits to release and the Postgres function may not even be
    // deployed yet (canary path). Loud log so it's clear from the boot logs.
    console.log('[pending-sweep] SPEND_CAP_RESERVATION_ENABLED!=true; sweep timer NOT started');
    return () => {};
  }

  started = true;
  let stopped = false;
  let timer: NodeJS.Timeout | null = null;

  const tick = async () => {
    if (stopped) return;
    try {
      const { data, error } = await supabase.rpc('sweep_expired_reservations');
      if (error) {
        console.error('[pending-sweep] RPC failed:', error.message);
      } else if (typeof data === 'number' && data > 0) {
        console.log(`[pending-sweep] released ${data} expired quote(s)`);
      }
      // data === 0 is the common case; don't spam the log.
    } catch (err: any) {
      console.error('[pending-sweep] unexpected exception:', err?.message ?? err);
    } finally {
      if (!stopped) {
        // Self-reschedule pattern: the next tick fires `interval` after the
        // PREVIOUS tick finished, so a slow sweep doesn't overlap itself.
        // Using setTimeout (not setInterval) gives this guarantee.
        timer = setTimeout(tick, SWEEP_INTERVAL_MS);
      }
    }
  };

  // First tick fires immediately (at boot) so we don't sit through a full
  // 60s window before catching any quotes that expired during a restart.
  // Subsequent ticks are scheduled by tick() itself.
  console.log(`[pending-sweep] starting (interval=${SWEEP_INTERVAL_MS}ms)`);
  tick();

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    started = false;
    console.log('[pending-sweep] stopped');
  };
}
