/**
 * src/mcp-tools.ts — Shared MCP tool definitions and internal handlers.
 *
 * Single source of truth for:
 *   - TOOLS array (names, descriptions, inputSchema, annotations)
 *   - Handler functions using direct internal imports (no HTTP loopback)
 *
 * Used by:
 *   - src/mcp-http.ts  (hosted Streamable HTTP endpoint at POST /mcp)
 *
 * NOT used by src/mcp-server.ts (the stdio subprocess) for handler logic —
 * that server calls the external trustbench.io API via fetch() because it
 * runs in its own process with no access to the Hono app's Supabase client.
 * It DOES import TOOLS from here so tool schemas stay single-sourced.
 *
 * Failure mode for each handler: returns a plain-text error string rather
 * than throwing — the MCP spec wraps tool output in a content array and
 * expects the agent to see descriptive errors, not 500 responses.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getRankings } from './scorer.js';
import { getOrComputeVerifyResults } from './receipt-html.js';
import { getOrComputeRoutingVerifyResults } from './routing-receipt-html.js';
import type { SignedReceipt } from './receipt-generator.js';
import type { SignedRoutingEnvelope } from './routing-receipt-html.js';

// ---------------------------------------------------------------------------
// Receipt ID validation — shared with index.ts
// rcpt_  = Phase 3 settlement receipts (receipts table)
// rrcpt_ = Phase 4 paywall routing receipts (paid_requests.response_body)
// ---------------------------------------------------------------------------
export const RECEIPT_ID_RE = /^r?rcpt_[0-9A-HJKMNP-TV-Z]{26}$/;

// ---------------------------------------------------------------------------
// Tool definitions (MCP inputSchema = JSON Schema draft-07)
// Annotations are required by the Anthropic Connectors Directory (missing
// annotations cause ~30% of submission rejections).
// ---------------------------------------------------------------------------
export const TOOLS = [
  {
    name: 'get_rankings',
    description:
      'Get TrustBench liveness rankings for x402 providers by capability. ' +
      'Returns a scored list of providers with latency and success-rate telemetry. ' +
      'Methodology note: scores are derived from HEAD-probe liveness checks (3 samples ' +
      'from one host), not a rigorous benchmark. See trustbench.io/methodology.',
    inputSchema: {
      type: 'object',
      properties: {
        capability: {
          type: 'string',
          enum: ['search', 'inference', 'data', 'media', 'infra'],
          description: 'The provider capability to query rankings for.',
        },
      },
      required: ['capability'],
    },
    // readOnlyHint=true  — only reads registry data, never writes or transacts
    // destructiveHint=false — no side effects, safe to retry freely
    // openWorldHint=true — results come from live trustbench.io telemetry
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    },
  },
  {
    name: 'get_receipt',
    description:
      'Fetch a TrustBench routing receipt by ID. Receipts are immutable, ' +
      'Ed25519-signed records of a routing or payment event. Use to verify ' +
      'what was paid, to whom, for what capability, and what the on-chain ' +
      'settlement reference is. IDs start with rcpt_ (Phase 3) or rrcpt_ (Phase 4).',
    inputSchema: {
      type: 'object',
      properties: {
        receipt_id: {
          type: 'string',
          description: 'The receipt ID, e.g. rcpt_01KQY7C44GAPSXZPFQYRZ1D10C or rrcpt_…',
        },
      },
      required: ['receipt_id'],
    },
    // readOnlyHint=true — immutable receipt fetch, no writes or payments
    // idempotentHint=true — same receipt ID always returns the same signed envelope
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  {
    name: 'verify_receipt',
    description:
      'Verify the Ed25519 signature on a TrustBench receipt. Fetches the receipt ' +
      'from the TrustBench database and confirms the signature is valid against the ' +
      'published public key at trustbench.io/.well-known/trustbench-pubkey. Returns ' +
      'signature_valid status and, where present, on_chain_verified status. ' +
      'For full offline verification, use the @trustbench/verify-receipt npm package.',
    inputSchema: {
      type: 'object',
      properties: {
        receipt_id: {
          type: 'string',
          description: 'The receipt ID to verify.',
        },
      },
      required: ['receipt_id'],
    },
    // readOnlyHint=true — verification only, never initiates payments or writes
    // idempotentHint=true — verifying the same receipt ID is always safe to repeat
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
];

// ---------------------------------------------------------------------------
// Internal handler: get_rankings
//
// Calls getRankings() directly — uses the existing Redis cache (5min TTL)
// so repeated calls are ~1ms. No HTTP loopback needed.
//
// Failure mode: if getRankings throws (Redis/Supabase down), returns a
// descriptive error string so the agent sees "Error: ..." not a 500.
// ---------------------------------------------------------------------------
export async function handleGetRankingsInternal(
  args: Record<string, unknown>,
): Promise<string> {
  const capability = args['capability'] as string;
  if (!capability) return 'Error: capability is required.';
  if (!['search', 'inference', 'data', 'media', 'infra'].includes(capability)) {
    return `Error: capability must be one of: search, inference, data, media, infra`;
  }

  try {
    const rows = await getRankings(capability);
    return JSON.stringify(rows ?? [], null, 2);
  } catch (err) {
    return `Error fetching rankings: ${err instanceof Error ? err.message : String(err)}`;
  }
}

// ---------------------------------------------------------------------------
// Internal handler: get_receipt
//
// Queries Supabase directly using the passed-in client — same logic as
// GET /receipts/:id in index.ts, without the HTML rendering branch.
//
// Both receipt families are handled:
//   rcpt_  → receipts.receipt_json
//   rrcpt_ → paid_requests.response_body (jsonb filter on receipt_id)
//
// Failure mode: returns error string; never throws.
// ---------------------------------------------------------------------------
export async function handleGetReceiptInternal(
  args: Record<string, unknown>,
  supabase: SupabaseClient,
): Promise<string> {
  const id = args['receipt_id'] as string;
  if (!id) return 'Error: receipt_id is required.';
  if (!RECEIPT_ID_RE.test(id)) return 'Error: invalid receipt_id format.';

  try {
    if (id.startsWith('rrcpt_')) {
      const { data, error } = await supabase
        .from('paid_requests')
        .select('response_body')
        .filter('response_body->receipt->>receipt_id', 'eq', id)
        .maybeSingle<{ response_body: Record<string, unknown> }>();

      if (error) return `Error: receipt lookup failed (${error.message})`;
      if (!data?.response_body) return `No receipt found for ID: ${id}`;

      const { receipt, signature } = data.response_body as { receipt?: unknown; signature?: unknown };
      if (!receipt || !signature) return `Error: receipt envelope malformed for ${id}`;
      return JSON.stringify({ receipt, signature }, null, 2);
    }

    // Phase 3 rcpt_
    const { data, error } = await supabase
      .from('receipts')
      .select('receipt_json')
      .eq('id', id)
      .maybeSingle<{ receipt_json: unknown }>();

    if (error) return `Error: receipt lookup failed (${error.message})`;
    if (!data?.receipt_json) return `No receipt found for ID: ${id}`;
    return JSON.stringify(data.receipt_json, null, 2);
  } catch (err) {
    return `Error: ${err instanceof Error ? err.message : String(err)}`;
  }
}

// ---------------------------------------------------------------------------
// Internal handler: verify_receipt
//
// Fetches the receipt envelope (same as handleGetReceiptInternal), then runs
// the in-process Ed25519 + on-chain verification functions already used by
// the HTML receipt renderer. Returns a concise JSON summary.
//
// Reuses the verify result cache in receipt-html.ts / routing-receipt-html.ts
// (keyed on receipt_id, persisted in-process), so the first verify pays the
// chain RPC cost (~200–500ms); subsequent calls are <5ms.
//
// Failure mode: returns error string; never throws.
// ---------------------------------------------------------------------------
export async function handleVerifyReceiptInternal(
  args: Record<string, unknown>,
  supabase: SupabaseClient,
): Promise<string> {
  const id = args['receipt_id'] as string;
  if (!id) return 'Error: receipt_id is required.';
  if (!RECEIPT_ID_RE.test(id)) return 'Error: invalid receipt_id format.';

  try {
    if (id.startsWith('rrcpt_')) {
      const { data, error } = await supabase
        .from('paid_requests')
        .select('response_body')
        .filter('response_body->receipt->>receipt_id', 'eq', id)
        .maybeSingle<{ response_body: Record<string, unknown> }>();

      if (error || !data?.response_body) return `No receipt found for ID: ${id}`;
      const { receipt, signature } = data.response_body as { receipt?: unknown; signature?: unknown };
      if (!receipt || !signature) return `Error: receipt envelope malformed for ${id}`;

      const envelope = { receipt, signature } as unknown as SignedRoutingEnvelope;
      const verify = await getOrComputeRoutingVerifyResults(envelope);

      return JSON.stringify({
        receipt_id: id,
        signature_valid: verify.sig.kind === 'valid',
        on_chain_verified: verify.chain.kind === 'verified',
        signature_alg: 'ed25519',
        verify_url: `https://trustbench.io/receipts/${id}`,
        pubkey_url: 'https://trustbench.io/.well-known/trustbench-pubkey',
        note: `For full offline Ed25519 verification: npx @trustbench/verify-receipt ${id}`,
      }, null, 2);
    }

    // Phase 3 rcpt_
    const { data, error } = await supabase
      .from('receipts')
      .select('receipt_json')
      .eq('id', id)
      .maybeSingle<{ receipt_json: unknown }>();

    if (error || !data?.receipt_json) return `No receipt found for ID: ${id}`;

    const envelope = data.receipt_json as SignedReceipt;
    const verify = await getOrComputeVerifyResults(envelope);

    return JSON.stringify({
      receipt_id: id,
      signature_valid: verify.sig.kind === 'valid',
      on_chain_verified: verify.chain.kind === 'verified',
      signature_alg: 'ed25519',
      verify_url: `https://trustbench.io/receipts/${id}`,
      pubkey_url: 'https://trustbench.io/.well-known/trustbench-pubkey',
      note: `For full offline Ed25519 verification: npx @trustbench/verify-receipt ${id}`,
    }, null, 2);
  } catch (err) {
    return `Error: ${err instanceof Error ? err.message : String(err)}`;
  }
}
