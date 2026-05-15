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
      'from one host), not a rigorous benchmark. See trustbench.io/methodology. ' +
      'Output: returns a JSON array. Each object has name (string, provider name), ' +
      'score (number 0-100, composite liveness score), latency_p50 (number, ms), ' +
      'success_rate (number 0.0-1.0, last 7 days), endpoint (string, URL), ' +
      'capabilities (array of strings).',
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
    // title — human-readable display name (required by Anthropic Software Directory Policy §5.E)
    annotations: {
      title: 'Get Provider Rankings',
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
      'settlement reference is. IDs start with rcpt_ (Phase 3) or rrcpt_ (Phase 4). ' +
      'Output: returns the signed receipt envelope as JSON. Phase 3 (rcpt_) returns ' +
      'a SignedReceipt with receipt (call metadata + settlement ref) and signature ' +
      '(Ed25519 over JCS-canonicalized receipt body). Phase 4 (rrcpt_) returns ' +
      '{receipt, signature} where receipt.paid contains routing details and signature ' +
      'covers the canonical envelope. To verify an envelope offline use ' +
      'the verify_receipt tool with the returned JSON, or @trustbench/verify-receipt npm.',
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
    // title — human-readable display name (required by Anthropic Software Directory Policy §5.E)
    annotations: {
      title: 'Fetch Payment Receipt',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  {
    name: 'verify_receipt',
    description:
      'Verify the Ed25519 signature on a TrustBench receipt. Two modes: ' +
      '(1) Lookup mode — pass receipt_id and the server fetches the receipt from ' +
      'trustbench.io and re-runs verification (handy when you only have an ID). ' +
      '(2) Offline mode — pass receipt_json (the full {receipt, signature} envelope ' +
      'an agent received from a third party) and the server verifies the Ed25519 ' +
      'signature against the published public key at trustbench.io/.well-known/' +
      'trustbench-pubkey without trusting the database. Exactly one of receipt_id ' +
      'or receipt_json must be provided. ' +
      'Output: returns JSON with receipt_id, signature_valid (boolean), ' +
      'on_chain_verified (boolean, where present), signature_alg ("ed25519"), ' +
      'verify_url, pubkey_url. For non-server-mediated verification with no ' +
      'network round-trip, use the @trustbench/verify-receipt npm package.',
    inputSchema: {
      type: 'object',
      properties: {
        receipt_id: {
          type: 'string',
          description: 'Lookup mode: the receipt ID to fetch and verify. Mutually exclusive with receipt_json.',
        },
        receipt_json: {
          type: 'object',
          description:
            'Offline mode: a full signed-receipt envelope {receipt, signature} (or a Phase 3 SignedReceipt). ' +
            'Verified against the published Ed25519 public key without database lookup. ' +
            'Mutually exclusive with receipt_id.',
        },
      },
      // JSON Schema oneOf — exactly one of the two inputs must be present.
      oneOf: [
        { required: ['receipt_id'] },
        { required: ['receipt_json'] },
      ],
    },
    // readOnlyHint=true — verification only, never initiates payments or writes
    // idempotentHint=true — verifying the same receipt is always safe to repeat
    // title — human-readable display name (required by Anthropic Software Directory Policy §5.E)
    annotations: {
      title: 'Verify Receipt Signature',
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
// Internal handler: verify_receipt — supports two modes (added 2026-05-15
// in response to MCP Connectors Directory critic-pass finding that the
// lookup-only mode was structurally weaker than the description claimed).
//
// Mode 1 — Lookup (args.receipt_id):
//   Fetches the receipt envelope (same as handleGetReceiptInternal), then
//   runs the in-process Ed25519 + on-chain verification functions already
//   used by the HTML receipt renderer. Returns a concise JSON summary.
//   Reuses the verify result cache in receipt-html.ts / routing-receipt-html.ts.
//
// Mode 2 — Offline (args.receipt_json):
//   Skips the database. Verifies the supplied envelope directly against the
//   published Ed25519 public key. The third-party-verifier path: an agent
//   received a receipt JSON externally and wants to confirm the signature
//   without trusting that the receipt ID exists in our database. Mirrors
//   what @trustbench/verify-receipt npm does.
//
// Exactly one of receipt_id or receipt_json must be provided. The JSON Schema
// oneOf in TOOLS expresses this; we re-check at runtime since MCP hosts vary
// in how strictly they enforce input schemas.
//
// Failure mode: if the chain RPC fails, signature_valid is still meaningful;
// on_chain_verified falls back to false. If the envelope is malformed,
// signature_valid is false (not "unknown") so an LLM consumer reads the
// boolean as the negative answer it actually is. Errors return a plain
// string, never throw.
// ---------------------------------------------------------------------------
export async function handleVerifyReceiptInternal(
  args: Record<string, unknown>,
  supabase: SupabaseClient,
): Promise<string> {
  const id = args['receipt_id'] as string | undefined;
  const json = args['receipt_json'] as Record<string, unknown> | undefined;

  // Exactly one of the two inputs is required.
  if (!id && !json) return 'Error: provide either receipt_id (lookup mode) or receipt_json (offline mode).';
  if (id && json) return 'Error: receipt_id and receipt_json are mutually exclusive — pass exactly one.';

  try {
    // -------------------------------------------------------------------
    // Mode 2 — Offline: verify a JSON envelope directly.
    // -------------------------------------------------------------------
    if (json) {
      // Detect envelope shape: rrcpt_ (Phase 4 routing) vs rcpt_ (Phase 3 settlement).
      // Phase 4: { receipt: {receipt_id, paid, ...}, signature }
      // Phase 3: { receipt_id, ..., signature } (or { receipt, signature } shaped same way)
      // The dual-probe pattern in @trustbench/verify-receipt (memory: envelope_shapes_dual_probe).
      const envReceipt = (json as { receipt?: unknown }).receipt;
      const envSig = (json as { signature?: unknown }).signature;
      const inferredId =
        (envReceipt && typeof envReceipt === 'object' && (envReceipt as { receipt_id?: string }).receipt_id) ||
        (json as { receipt_id?: string }).receipt_id ||
        'unknown';

      if (!envSig) return 'Error: receipt_json missing signature field.';

      // Phase 4 routing envelope (rrcpt_) has receipt.paid; Phase 3 doesn't.
      const looksRouting =
        envReceipt &&
        typeof envReceipt === 'object' &&
        'paid' in (envReceipt as Record<string, unknown>);

      if (looksRouting) {
        const envelope = json as unknown as SignedRoutingEnvelope;
        const verify = await getOrComputeRoutingVerifyResults(envelope);
        return JSON.stringify({
          receipt_id: inferredId,
          mode: 'offline',
          signature_valid: verify.sig.kind === 'valid',
          on_chain_verified: verify.chain.kind === 'verified',
          signature_alg: 'ed25519',
          pubkey_url: 'https://trustbench.io/.well-known/trustbench-pubkey',
          note: 'Verified against the supplied envelope without database lookup. For zero-network verification use @trustbench/verify-receipt npm.',
        }, null, 2);
      }

      // Phase 3 settlement envelope (rcpt_).
      const envelope = json as unknown as SignedReceipt;
      const verify = await getOrComputeVerifyResults(envelope);
      return JSON.stringify({
        receipt_id: inferredId,
        mode: 'offline',
        signature_valid: verify.sig.kind === 'valid',
        on_chain_verified: verify.chain.kind === 'verified',
        signature_alg: 'ed25519',
        pubkey_url: 'https://trustbench.io/.well-known/trustbench-pubkey',
        note: 'Verified against the supplied envelope without database lookup. For zero-network verification use @trustbench/verify-receipt npm.',
      }, null, 2);
    }

    // -------------------------------------------------------------------
    // Mode 1 — Lookup: fetch then verify by ID.
    // -------------------------------------------------------------------
    if (!RECEIPT_ID_RE.test(id!)) return 'Error: invalid receipt_id format.';

    if (id!.startsWith('rrcpt_')) {
      const { data, error } = await supabase
        .from('paid_requests')
        .select('response_body')
        .filter('response_body->receipt->>receipt_id', 'eq', id!)
        .maybeSingle<{ response_body: Record<string, unknown> }>();

      if (error || !data?.response_body) return `No receipt found for ID: ${id}`;
      const { receipt, signature } = data.response_body as { receipt?: unknown; signature?: unknown };
      if (!receipt || !signature) return `Error: receipt envelope malformed for ${id}`;

      const envelope = { receipt, signature } as unknown as SignedRoutingEnvelope;
      const verify = await getOrComputeRoutingVerifyResults(envelope);

      return JSON.stringify({
        receipt_id: id,
        mode: 'lookup',
        signature_valid: verify.sig.kind === 'valid',
        on_chain_verified: verify.chain.kind === 'verified',
        signature_alg: 'ed25519',
        verify_url: `https://trustbench.io/receipts/${id}`,
        pubkey_url: 'https://trustbench.io/.well-known/trustbench-pubkey',
        note: `For zero-network offline verification: npx @trustbench/verify-receipt ${id}`,
      }, null, 2);
    }

    // Phase 3 rcpt_
    const { data, error } = await supabase
      .from('receipts')
      .select('receipt_json')
      .eq('id', id!)
      .maybeSingle<{ receipt_json: unknown }>();

    if (error || !data?.receipt_json) return `No receipt found for ID: ${id}`;

    const envelope = data.receipt_json as SignedReceipt;
    const verify = await getOrComputeVerifyResults(envelope);

    return JSON.stringify({
      receipt_id: id,
      mode: 'lookup',
      signature_valid: verify.sig.kind === 'valid',
      on_chain_verified: verify.chain.kind === 'verified',
      signature_alg: 'ed25519',
      verify_url: `https://trustbench.io/receipts/${id}`,
      pubkey_url: 'https://trustbench.io/.well-known/trustbench-pubkey',
      note: `For zero-network offline verification: npx @trustbench/verify-receipt ${id}`,
    }, null, 2);
  } catch (err) {
    return `Error: ${err instanceof Error ? err.message : String(err)}`;
  }
}
