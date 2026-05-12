// src/explorer-html.ts — Phase 4 receipt explorer (P4-2).
//
// Public read-only list of recent TrustBench receipts. Companion to the
// per-id lookup at /receipts/:id. Lists BOTH:
//   - rcpt_ Phase 3 settlement receipts (from `receipts` table, public-read RLS)
//   - rrcpt_ Phase 4 paywall routing receipts (from `paid_requests`, service-
//     role-only RLS, surfaced here as the curated public read promised in
//     phase4-schema-paid-requests.sql § Deviation 2)
//
// Wire-safety vs the active Bazaar indexing watch (2026-05-12):
//   - This module only reads. It does NOT touch /route, paywallGate, the
//     settle path, the receipt emission, or the boot-time bazaar declaration.
//   - The /explorer route is GET-only on a distinct path; Hono's exact-match
//     path matcher rules out shadowing. POST /route's 402 emission stays
//     byte-identical pre/post this deploy.
//   - Adding /explorer is purely additive: a new module + a single
//     `app.get('/explorer', ...)` mount in src/index.ts.
//
// Privacy posture:
//   - rcpt_ receipts are already public-read by id (phase3-schema.sql).
//   - rrcpt_ receipts are fetchable at /receipts/:id when you know the id.
//   - Receipt content (payer/payee/amount/tx_hash) is on-chain via the
//     settlement tx hash anyway. The explorer surfaces *which* receipt ids
//     exist but does not reveal anything not already public.
//   - paid_requests RLS stays service-role-only; the explorer queries
//     through the server-side service-role client, the same pattern
//     /receipts/:id rrcpt_ branch already uses.
//
// Performance & caching:
//   - 5-minute Redis cache on the merged result. Receipts are append-only;
//     5-min freshness is plenty for a public-facing explorer.
//   - SELECTs use ORDER BY issued_at/created_at DESC + LIMIT 50 on each
//     table, merged client-side. At current production volume (<100 total
//     receipts) this is trivial; even at 10k receipts it stays well under
//     50ms server-side.
//
// JSON contract via content negotiation (Accept: application/json or
// ?format=json) — same pattern as /rankings and /receipts/:id.

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { Redis } from 'ioredis';
import { siteHead, renderNav, renderFooter, escapeHtml } from './site-chrome.js';

// ---------------------------------------------------------------------------
// Module-local clients. Boot-lazy: created at first import; if env vars are
// missing the constructors will throw on first query, which lets boot stay
// quiet for deployments that don't immediately need explorer (e.g., the
// nightly pipeline workflow). Mirrors the pattern in scorer.ts / idempotency.ts.
// ---------------------------------------------------------------------------

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const redis = new Redis(process.env.UPSTASH_REDIS_URL!, {
  maxRetriesPerRequest: null,
  retryStrategy: (times) => Math.min(times * 50, 2000),
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

// Normalized explorer row. Union of the projected fields available from
// Phase 3 receipts (receipts table columns) and Phase 4 routing receipts
// (extracted from paid_requests.response_body.receipt).
export type ExplorerRow = {
  receipt_id: string;            // rcpt_<26-char ULID> or rrcpt_<26-char ULID>
  type: 'rcpt' | 'rrcpt';        // protocol generation badge
  issued_at: string;             // ISO timestamp
  capability: string | null;     // 'search' | 'inference' | 'data' | 'media' | 'infra'
  amount_atomic: string;         // string for precision
  currency: string;              // typically 'USDC'
  decimals: number;              // typically 6
  payee_address: string | null;  // settlement counterparty
  tx_hash: string | null;        // on-chain settlement tx
  chain: string;                 // 'base' for v0.1.0
  signature_alg: string | null;  // 'ed25519' (v1+) or 'hmac-sha256' (legacy fallback)
};

// ---------------------------------------------------------------------------
// Query: pull recent receipts from both tables, merge, sort, slice.
//
// Caching: 5-min Redis. Cache key is just 'explorer:v1:N' where N is the
// requested limit. New receipts arrive at most a few times per day during
// active sprint; 5-min staleness is acceptable for the public surface.
//
// Failure modes:
//   - One query throws → return whatever the other returned. Loud-log the
//     failure; do not 503 the whole page just because one table is sad.
//   - Both throw → return empty array. Page renders the empty state.
//   - Redis unavailable → fall through to live DB on every request. Slow
//     but correct.
// ---------------------------------------------------------------------------

export async function getRecentReceipts(limit = 50): Promise<ExplorerRow[]> {
  const cacheKey = `explorer:v1:${limit}`;

  // Try Redis first; tolerate cache miss/failure.
  try {
    const cached = await redis.get(cacheKey);
    if (cached) return JSON.parse(cached) as ExplorerRow[];
  } catch (err: any) {
    console.warn(`[explorer] redis read failed (continuing to DB): ${err?.message ?? err}`);
  }

  // Phase 3 receipts. Direct projection from columns.
  let rcptRows: ExplorerRow[] = [];
  try {
    const { data, error } = await supabase
      .from('receipts')
      .select(
        'id, capability, amount_atomic, currency, decimals, payee_address, tx_hash, chain, signature_alg, issued_at',
      )
      .order('issued_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.warn(`[explorer] receipts query error: ${error.message}`);
    } else if (data) {
      rcptRows = data.map((r: any) => ({
        receipt_id: r.id,
        type: 'rcpt' as const,
        issued_at: r.issued_at,
        capability: r.capability ?? null,
        amount_atomic: r.amount_atomic ?? '0',
        currency: r.currency ?? 'USDC',
        decimals: typeof r.decimals === 'number' ? r.decimals : 6,
        payee_address: r.payee_address ?? null,
        tx_hash: r.tx_hash ?? null,
        chain: r.chain ?? 'base',
        signature_alg: r.signature_alg ?? null,
      }));
    }
  } catch (err: any) {
    console.warn(`[explorer] receipts query threw: ${err?.message ?? err}`);
  }

  // Phase 4 paywall routing receipts. Extract from response_body JSONB.
  // Shape ref: SignedRoutingResponse in src/paywall-handler.ts:952-959.
  let rrcptRows: ExplorerRow[] = [];
  try {
    const { data, error } = await supabase
      .from('paid_requests')
      .select('response_body, created_at')
      .not('response_body', 'is', null)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.warn(`[explorer] paid_requests query error: ${error.message}`);
    } else if (data) {
      rrcptRows = data
        .filter((p: any) => p?.response_body?.receipt?.receipt_id)
        .map((p: any) => {
          const rec = p.response_body.receipt;
          const sig = p.response_body.signature;
          const paid = rec.paid || {};
          const routing = rec.routing || {};
          return {
            receipt_id: String(rec.receipt_id),
            type: 'rrcpt' as const,
            issued_at: rec.issued_at || p.created_at,
            capability: routing.capability ?? null,
            amount_atomic: paid.amount_atomic ?? '0',
            currency: paid.currency ?? 'USDC',
            decimals: typeof paid.decimals === 'number' ? paid.decimals : 6,
            payee_address: paid.payee_address ?? null,
            tx_hash: paid.tx_hash ?? null,
            chain: paid.chain ?? 'base',
            signature_alg: sig?.alg ?? null,
          };
        });
    }
  } catch (err: any) {
    console.warn(`[explorer] paid_requests query threw: ${err?.message ?? err}`);
  }

  // Merge, sort desc by issued_at (ISO timestamps sort correctly as strings),
  // slice to limit. Stable-ish ordering: when timestamps tie (unlikely but
  // possible for two receipts in the same millisecond), fall back to id.
  const merged = [...rcptRows, ...rrcptRows].sort((a, b) => {
    if (a.issued_at === b.issued_at) return a.receipt_id.localeCompare(b.receipt_id);
    return b.issued_at.localeCompare(a.issued_at);
  });
  const sliced = merged.slice(0, limit);

  // Write-through cache; tolerate failure.
  try {
    await redis.set(cacheKey, JSON.stringify(sliced), 'EX', 300);
  } catch (err: any) {
    console.warn(`[explorer] redis write failed (response still served): ${err?.message ?? err}`);
  }

  return sliced;
}

// ---------------------------------------------------------------------------
// Render: HTML page mirroring the rankings/methodology/receipt look-and-feel.
// Shared site-chrome (head/nav/footer); table styled with Tailwind utility
// classes from the chrome's CDN-loaded config.
// ---------------------------------------------------------------------------

export function renderExplorerHtml(rows: ExplorerRow[]): string {
  const total = rows.length;
  const ed25519Count = rows.filter((r) => r.signature_alg === 'ed25519').length;
  const rrcptCount = rows.filter((r) => r.type === 'rrcpt').length;
  const rcptCount = rows.filter((r) => r.type === 'rcpt').length;

  // Latest issued (rows are already sorted desc; rows[0] is newest).
  const latest = rows.length > 0 ? formatRelativeTime(rows[0].issued_at) : '—';

  const title = 'Receipts · TrustBench';
  const desc = `Public list of ${total} signed TrustBench receipt${total === 1 ? '' : 's'}. Each is verifiable end-to-end (Ed25519 signature + on-chain settlement anchor) via the per-id detail page or the @trustbench/verify-receipt npm package.`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
${siteHead(title, desc, 'receipt')}
</head>
<body class="bg-bg text-ink">
${renderNav('home')}

<main class="max-w-6xl mx-auto px-6 py-10">
  <!-- Breadcrumb -->
  <nav class="text-xs text-faint mb-3" aria-label="Breadcrumb">
    <a href="/" class="hover:text-primary">Home</a> ·
    <span class="text-ink">Receipts</span>
  </nav>

  <!-- Hero -->
  <h1 class="text-3xl md:text-4xl font-semibold tracking-tight mb-2">Receipts</h1>
  <p class="text-muted leading-relaxed max-w-3xl">
    Every TrustBench routing call produces a signed receipt with an on-chain settlement anchor.
    The receipts below are publicly verifiable: open any detail page for the Ed25519 signature check,
    or run <span class="mono bg-mono px-1.5 py-0.5 rounded text-sm">npx @trustbench/verify-receipt &lt;id&gt;</span>
    against your own infrastructure.
  </p>

  <!-- Stat strip -->
  <section class="grid grid-cols-2 md:grid-cols-4 gap-4 my-8" aria-label="Receipt summary">
    ${renderStat('Total receipts', String(total))}
    ${renderStat('Ed25519-signed', `${ed25519Count} / ${total}`)}
    ${renderStat('Phase 3 / 4 split', `${rcptCount} / ${rrcptCount}`)}
    ${renderStat('Latest issued', latest)}
  </section>

  <!-- Table or empty state -->
  ${total === 0 ? renderEmptyState() : renderReceiptTable(rows)}

  <!-- Footnote -->
  <p class="text-xs text-faint mt-8 leading-relaxed max-w-3xl">
    <span class="label-caps text-faint">Note</span> ·
    Receipts are append-only. List is cached for 5 minutes — new receipts may take that long to appear.
    Phase 3 receipts (<span class="mono">rcpt_</span>) come from the Bearer-authenticated quote/settle flow;
    Phase 4 receipts (<span class="mono">rrcpt_</span>) come from the x402-paywalled <span class="mono">/route</span> path.
    Both verify the same way.
  </p>
</main>

${renderFooter()}

</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderStat(label: string, value: string): string {
  return `<div class="bg-surface border border-border rounded p-4">
    <div class="label-caps text-faint mb-1">${escapeHtml(label)}</div>
    <div class="text-2xl font-semibold tracking-tight text-ink">${escapeHtml(value)}</div>
  </div>`;
}

function renderEmptyState(): string {
  return `<section class="bg-surface border border-border rounded p-8 text-center">
    <p class="text-muted">No receipts on this deployment yet.</p>
    <p class="text-xs text-faint mt-2">Receipts appear here after the first successful settle on <a href="/route" class="text-primary hover:underline">/route</a>.</p>
  </section>`;
}

function renderReceiptTable(rows: ExplorerRow[]): string {
  return `<section class="bg-surface border border-border rounded overflow-x-auto">
    <table class="w-full text-sm">
      <thead class="bg-mono">
        <tr class="text-left text-muted label-caps">
          <th class="px-4 py-3">Receipt ID</th>
          <th class="px-4 py-3">Type</th>
          <th class="px-4 py-3">Issued</th>
          <th class="px-4 py-3">Capability</th>
          <th class="px-4 py-3">Amount</th>
          <th class="px-4 py-3">Payee</th>
          <th class="px-4 py-3">Sig</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(renderReceiptRow).join('')}
      </tbody>
    </table>
  </section>`;
}

function renderReceiptRow(r: ExplorerRow): string {
  const typeBadge = r.type === 'rcpt'
    ? '<span class="inline-block px-2 py-0.5 rounded bg-mono text-muted text-[10px] font-semibold uppercase tracking-wide" title="Phase 3 settlement receipt — Bearer-authenticated quote/settle flow">P3</span>'
    : '<span class="inline-block px-2 py-0.5 rounded bg-soft-green text-primary-dark text-[10px] font-semibold uppercase tracking-wide" title="Phase 4 routing receipt — x402-paywalled /route">P4</span>';

  const sigBadge = r.signature_alg === 'ed25519'
    ? '<span class="inline-block px-2 py-0.5 rounded bg-soft-green text-primary-dark text-[10px] font-semibold uppercase tracking-wide" title="Ed25519 signature — publicly verifiable">Ed25519</span>'
    : r.signature_alg === 'hmac-sha256'
      ? '<span class="inline-block px-2 py-0.5 rounded bg-amber-soft text-amber-ink text-[10px] font-semibold uppercase tracking-wide" title="HMAC fallback — internal integrity only, not publicly verifiable">HMAC</span>'
      : '<span class="inline-block px-2 py-0.5 rounded bg-mono text-faint text-[10px] font-semibold uppercase tracking-wide" title="Signature algorithm not recorded on this row">?</span>';

  const capabilityCell = r.capability
    ? `<span class="text-ink">${escapeHtml(r.capability)}</span>`
    : '<span class="text-faint">—</span>';

  const payeeCell = r.payee_address
    ? `<span class="mono text-xs text-muted" title="${escapeHtml(r.payee_address)}">${escapeHtml(shortAddress(r.payee_address))}</span>`
    : '<span class="text-faint">—</span>';

  return `<tr class="border-t border-border hover:bg-mono">
    <td class="px-4 py-3"><a href="/receipts/${escapeHtml(r.receipt_id)}" class="mono text-xs text-primary hover:underline">${escapeHtml(r.receipt_id)}</a></td>
    <td class="px-4 py-3">${typeBadge}</td>
    <td class="px-4 py-3 text-muted text-xs">${escapeHtml(formatRelativeTime(r.issued_at))}</td>
    <td class="px-4 py-3">${capabilityCell}</td>
    <td class="px-4 py-3 mono text-xs text-ink">${escapeHtml(formatUsdc(r.amount_atomic, r.decimals))} ${escapeHtml(r.currency)}</td>
    <td class="px-4 py-3">${payeeCell}</td>
    <td class="px-4 py-3">${sigBadge}</td>
  </tr>`;
}

// Format atomic USDC (string) to human-readable decimal. Uses BigInt for
// precision: amount_atomic can be larger than Number.MAX_SAFE_INTEGER in
// principle (USDC is 6 decimals so 9e15 = $9B fits in Number, but BigInt is
// the safe contract per the receipt schema's string-typed amount_atomic).
function formatUsdc(atomic: string, decimals: number): string {
  try {
    const bi = BigInt(atomic);
    const divisor = 10n ** BigInt(decimals);
    const whole = bi / divisor;
    const frac = bi % divisor;
    // Pad fractional to `decimals` digits, then trim trailing zeros for
    // readability ("$0.025000" → "$0.025"). Keep at least one digit after
    // the decimal point for clarity.
    const fracStr = frac.toString().padStart(decimals, '0').replace(/0+$/, '') || '0';
    return `$${whole.toString()}.${fracStr}`;
  } catch {
    return `$${atomic}`;
  }
}

// Truncate Ethereum address for table cell. Full address available on hover
// via the title attribute set by the caller.
function shortAddress(addr: string): string {
  if (addr.length <= 10) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

// Relative time formatter ("5m ago", "2h ago", "3d ago"). Used in the table
// "Issued" column. Same approach as rankings-html.ts's formatter; copied
// locally to keep modules independent.
function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;
  const diffSec = Math.floor((Date.now() - then) / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86400)}d ago`;
}
