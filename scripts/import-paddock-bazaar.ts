// scripts/import-paddock-bazaar.ts
// =============================================================================
// Pulls Paddock's CDP Bazaar export CSV and upserts as a third crawler source.
// =============================================================================
//
// Source: https://breakthecubicle.com/api/paddock/export/bazaar
// Columns (per Paddock 2026-05-06 DM): endpoint URL, domain, network,
// price in USDC, wallet address, last updated timestamp.
//
// Why pull this in:
//
//   - Today's `src/crawler.ts` has two sources: Agentic Market (curated)
//     and the verified seed (manually probed). Neither shows the CDP Bazaar
//     directly. Paddock has already done the CDP Bazaar normalization and
//     exposes it as a clean CSV. Adding it as a third source widens our
//     visibility on what's actually been *paid* through Bazaar (vs. just
//     curated by Agentic Market).
//
//   - The "fifth bucket" (paid-but-not-in-either-curated-registry) becomes
//     queryable once we have all three sources side by side. Our prober's
//     liveness signal layered on top gives us "paid + not in registry +
//     reachable today" — a unique angle for the partnership.
//
// Behavior on URL collision (same provider already in registry from
// Agentic Market or verified seed):
//
//   - Existing capability, name, description preserved (Paddock CSV doesn't
//     ship category, so we'd be overwriting good data with 'other').
//   - Existing metadata is merged with Paddock fields; we DON'T overwrite
//     `source` if it's already set to a higher-trust value (verified_seed,
//     agentic_market). Set `source` to 'paddock_cdp_bazaar' only when the
//     row is net-new or was previously seeded by Paddock alone.
//   - `pay_to` is filled from the Paddock wallet address only when the row
//     doesn't already have one (we trust the merchant's 402 challenge over
//     a third-party CSV claim about pay-to addresses).
//
// Network filter: Phase 4 routes Base only; rows on Polygon/Solana are
// stored with `metadata.paddock_network` recorded but skipped from the
// providers row insert (would just clutter the table without being routable).
//
// No new env vars. Reuses SUPABASE_URL + SUPABASE_SECRET_KEY.
//
// Failure mode: if the export URL is unreachable or returns non-CSV, log
// the error and exit non-zero. No partial writes (we batch inserts per row,
// but each row's commit is independent).
// =============================================================================

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const PADDOCK_EXPORT_URL = 'https://breakthecubicle.com/api/paddock/export/bazaar';

// Network normalization (matches src/crawler.ts).
const NORMALIZE_NETWORK: Record<string, string> = {
  base: 'base',
  'eip155:8453': 'base',
  polygon: 'polygon',
  'eip155:137': 'polygon',
  solana: 'solana',
};
const ROUTABLE_NETWORKS = new Set(['base']);

type CsvRow = Record<string, string>;

// Minimal CSV parser. Handles quoted fields with comma + double-quote escape.
// Doesn't handle embedded newlines inside quoted fields. Paddock's export
// columns (URL, domain, network, USDC price, wallet hex, ISO timestamp) are
// all single-line strings, so this is safe for their schema. If they ever
// add a free-form description, swap to a real CSV lib (e.g. papaparse).
function parseCsv(text: string): CsvRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length === 0) return [];
  const headers = splitCsvLine(lines[0]).map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'));
  const rows: CsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]);
    const row: CsvRow = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = cells[j] ?? '';
    }
    rows.push(row);
  }
  return rows;
}

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i += 1;
        continue;
      }
      if (c === '"') {
        inQuotes = false;
        continue;
      }
      cur += c;
    } else {
      if (c === '"') {
        inQuotes = true;
        continue;
      }
      if (c === ',') {
        cells.push(cur);
        cur = '';
        continue;
      }
      cur += c;
    }
  }
  cells.push(cur);
  return cells;
}

// Field-name tolerance: Paddock might emit headers as `endpoint_url`,
// `endpoint url`, or `endpointUrl`. parseCsv normalizes to lowercased
// underscore form, so this just picks the first present.
function pick(row: CsvRow, ...keys: string[]): string {
  for (const k of keys) {
    const v = row[k];
    if (typeof v === 'string' && v.length > 0) return v;
  }
  return '';
}

async function main() {
  console.log(`[paddock] Fetching ${PADDOCK_EXPORT_URL}...`);
  let res: Response;
  try {
    res = await fetch(PADDOCK_EXPORT_URL, { headers: { Accept: 'text/csv' } });
  } catch (e: any) {
    console.error(`[paddock] fetch failed: ${e.message}`);
    process.exit(1);
  }
  if (!res.ok) {
    console.error(`[paddock] HTTP ${res.status} ${res.statusText}`);
    process.exit(1);
  }
  const text = await res.text();
  console.log(`[paddock] Received ${text.length} bytes`);

  const rows = parseCsv(text);
  console.log(`[paddock] Parsed ${rows.length} rows`);

  if (rows.length > 0) {
    const observed = Object.keys(rows[0]);
    console.log(`[paddock] Observed columns: ${observed.join(', ')}`);
  }

  // Bulk-fetch existing providers we might collide with so we can MERGE
  // (preserve capability/name/description and union metadata) rather than
  // overwrite. One round-trip is cheaper than N reads at row time.
  const candidateUrls = rows
    .map((r) => pick(r, 'endpoint_url', 'url'))
    .filter((u) => u.length > 0);
  const { data: existing, error: exErr } = await supabase
    .from('providers')
    .select('url, capability, name, description, pay_to, metadata')
    .in('url', candidateUrls);
  if (exErr) {
    console.error(`[paddock] failed to read existing providers: ${exErr.message}`);
    process.exit(1);
  }
  const existingByUrl = new Map<string, any>((existing ?? []).map((e: any) => [e.url, e]));

  let upserted = 0;
  let skippedNonRoutable = 0;
  let skippedInvalid = 0;
  let mergedCount = 0;

  for (const row of rows) {
    const url = pick(row, 'endpoint_url', 'url');
    if (!url) {
      skippedInvalid += 1;
      continue;
    }

    const domain = pick(row, 'domain');
    const networkRaw = pick(row, 'network');
    const priceUsdc = pick(row, 'price_usdc', 'price', 'price_in_usdc');
    const wallet = pick(row, 'wallet_address', 'wallet', 'pay_to');
    const lastUpdatedRaw = pick(row, 'last_updated', 'last_payment_timestamp', 'updated_at');

    const networkKey = networkRaw.toLowerCase().trim();
    const network = NORMALIZE_NETWORK[networkKey] ?? networkKey;
    if (!ROUTABLE_NETWORKS.has(network)) {
      skippedNonRoutable += 1;
      continue;
    }

    const merged = existingByUrl.get(url);
    if (merged) mergedCount += 1;

    const existingMeta =
      merged?.metadata && typeof merged.metadata === 'object' && !Array.isArray(merged.metadata)
        ? (merged.metadata as Record<string, unknown>)
        : {};
    const existingSource = typeof existingMeta.source === 'string' ? existingMeta.source : null;

    // Only set source = 'paddock_cdp_bazaar' if the row is net-new or was
    // previously seeded by Paddock alone. Don't overwrite a higher-trust
    // source like 'verified_seed' or 'agentic_market'.
    const newSource =
      !existingSource || existingSource === 'paddock_cdp_bazaar' ? 'paddock_cdp_bazaar' : existingSource;

    const newMetadata: Record<string, unknown> = {
      ...existingMeta,
      // Paddock-specific fields recorded side-by-side with whatever's already there:
      paddock_domain: domain || null,
      paddock_network: networkRaw || null,
      paddock_price_usdc: priceUsdc || null,
      paddock_wallet: wallet || null,
      paddock_last_updated: lastUpdatedRaw || null,
      source: newSource,
    };
    // Networks union: existing list ∪ {paddock-emitted normalized network}.
    const existingNetworks = Array.isArray(existingMeta.networks) ? (existingMeta.networks as string[]) : [];
    const unionedNetworks = Array.from(new Set([...existingNetworks, network]));
    newMetadata.networks = unionedNetworks;

    const upsertRow = {
      url,
      // Preserve canonical capability if already set; never let Paddock's
      // missing-category data overwrite an Agentic Market 5-cat tag.
      capability: merged?.capability ?? 'other',
      name: merged?.name ?? domain ?? url,
      description: merged?.description ?? '',
      // Trust merchant-emitted pay_to (set elsewhere) over Paddock's claim.
      // Only fill from Paddock if we have nothing.
      pay_to: merged?.pay_to ?? (wallet || null),
      metadata: newMetadata,
      last_crawled_at: new Date().toISOString(),
    };

    const { error } = await supabase.from('providers').upsert(upsertRow, { onConflict: 'url' });
    if (error) {
      console.warn(`[paddock] upsert failed for ${url}: ${error.message}`);
      skippedInvalid += 1;
      continue;
    }
    upserted += 1;
  }

  console.log(
    `[paddock] Done. Upserted: ${upserted}; merged with existing: ${mergedCount}; ` +
      `skipped non-routable network: ${skippedNonRoutable}; skipped invalid: ${skippedInvalid}.`,
  );
}

main().catch((err) => {
  console.error('[paddock] failed:', err?.message || err);
  process.exit(1);
});
