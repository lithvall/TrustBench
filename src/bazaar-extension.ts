// src/bazaar-extension.ts — Phase 4 Bazaar discovery extension (v2)
//
// REWRITE 2026-05-11 after reading the actual package types
// (node_modules/@x402/extensions/dist/cjs/index-Bw-mGWh6.d.ts):
//
//   - `bazaarResourceServerExtension` is a ResourceServerExtension descriptor
//     OBJECT ({ key: 'bazaar', enrichDeclaration }), NOT a middleware.
//   - `declareDiscoveryExtension(config)` returns `Record<string, DiscoveryExtension>`
//     (specifically `{ bazaar: { info, schema } }`).
//   - `enrichDeclaration(inner, transportContext)` takes the INNER value
//     ({ info, schema }), not the wrapper. It auto-injects `method` into
//     info.input.method and into the schema's required list.
//   - Per CDP docs § Extension architecture, the wire shape on the 402 response
//     is `extensions.bazaar = { info, schema }` at the top of the response body.
//
// Integration approach:
//   1. Build the route declarations at module init.
//   2. Manually inject `method: 'POST'` into info.input.method AND into the
//      schema.properties.input.{properties.method, required[]}. This replicates
//      what enrichDeclaration would do, but does not depend on constructing a
//      transportContext that passes the package's internal isHTTPRequestContext
//      check (which we haven't verified the shape of).
//   3. Export the enriched declarations as plain constants.
//   4. paywall-handler.ts reads them from the Hono context and embeds in the
//      402 response body.
//
// LOAD-SAFE: dynamic import with graceful no-op fallback. If the package isn't
// installed or named exports don't match the new types contract, the helpers
// below return null and the 402 response is unchanged from Phase 3+4 behavior.

let declareDiscoveryExtensionImpl: ((config: unknown) => Record<string, unknown>) | null = null;

try {
  const mod: any = await import('@x402/extensions/bazaar');
  declareDiscoveryExtensionImpl =
    typeof mod.declareDiscoveryExtension === 'function' ? mod.declareDiscoveryExtension : null;

  if (!declareDiscoveryExtensionImpl) {
    console.warn(
      '[bazaar-extension] @x402/extensions/bazaar loaded but declareDiscoveryExtension export missing. ' +
        'Bazaar wiring will be a no-op. Check the package version against CDP docs at ' +
        'https://docs.cdp.coinbase.com/x402/bazaar.',
    );
  }
} catch (err: any) {
  console.warn(
    `[bazaar-extension] @x402/extensions/bazaar not available: ${err?.message ?? err}. ` +
      'Bazaar wiring will be a no-op until installed (npm install @x402/extensions).',
  );
}

// ---------------------------------------------------------------------------
// Manual method-injection helper (replicates enrichDeclaration for POST).
// ---------------------------------------------------------------------------
//
// Given `{ info, schema }` for a POST endpoint, returns the same shape with:
//   - info.input.method = 'POST'
//   - schema.properties.input.properties.method = { type: 'string', enum: ['POST'] }
//   - schema.properties.input.required includes 'method'
//
// Mirrors the published enrichDeclaration source we inspected directly. Pure
// data transformation — no dependency on the package's transport-context types.

function enrichForPost(inner: any): any {
  if (!inner || typeof inner !== 'object') return inner;
  if (inner.info?.input?.type === 'mcp') return inner; // MCP path is untouched

  const existingInputProps = inner.schema?.properties?.input?.properties || {};
  const existingRequired: string[] = inner.schema?.properties?.input?.required || [];
  const hasMethod = existingRequired.includes('method');

  return {
    ...inner,
    info: {
      ...(inner.info || {}),
      input: {
        ...(inner.info?.input || {}),
        method: 'POST',
      },
    },
    schema: {
      ...(inner.schema || {}),
      properties: {
        ...(inner.schema?.properties || {}),
        input: {
          ...(inner.schema?.properties?.input || {}),
          properties: {
            ...existingInputProps,
            method: { type: 'string', enum: ['POST'] },
          },
          required: hasMethod ? existingRequired : [...existingRequired, 'method'],
        },
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Build the route declarations once at module init.
// ---------------------------------------------------------------------------
//
// Output of declareDiscoveryExtension is `{ bazaar: { info, schema } }`.
// We unwrap → enrich for POST → re-wrap.

function buildDeclaration(config: unknown): { bazaar: any } | null {
  if (!declareDiscoveryExtensionImpl) return null;
  try {
    const decl = declareDiscoveryExtensionImpl(config);
    if (!decl || typeof decl !== 'object' || !('bazaar' in decl)) {
      console.warn('[bazaar-extension] declareDiscoveryExtension returned unexpected shape; skipping.');
      return null;
    }
    const inner = (decl as any).bazaar;
    const enriched = enrichForPost(inner);
    return { bazaar: enriched };
  } catch (err: any) {
    console.warn(
      `[bazaar-extension] declareDiscoveryExtension threw at init: ${err?.message ?? err}. Skipping.`,
    );
    return null;
  }
}

// ---------------------------------------------------------------------------
// Production /route declaration
// ---------------------------------------------------------------------------
//
// Schemas derived from src/route-handlers.ts request body + response shape.
// Description text per phase4-submission-packet.md § "Three-sentence
// description" (locked 2026-05-11 for the Infopunks Radar competitive
// reclassification).

const ROUTE_CONFIG = {
  input: {
    capability: 'data',
    max_price: '10000',
    payer_address: '0x0000000000000000000000000000000000000000',
  },
  inputSchema: {
    type: 'object',
    properties: {
      capability: {
        type: 'string',
        enum: ['search', 'inference', 'data', 'media', 'infra'],
      },
      max_price: { type: 'string', pattern: '^[0-9]+$' },
      payer_address: { type: 'string', pattern: '^0x[0-9a-fA-F]{40}$' },
    },
    required: ['capability', 'max_price', 'payer_address'],
  },
  output: {
    example: {
      route_id: 'qt_01ABCDEFGHIJKLMNOPQRSTUVWXYZ',
      payment_required: {
        scheme: 'exact',
        network: 'eip155:8453',
        asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
        amount: '5000',
        payTo: '0x0000000000000000000000000000000000000000',
        validAfter: 1715472000,
        validBefore: 1715472300,
        nonce: '0x0000000000000000000000000000000000000000000000000000000000000000',
      },
      expires_at: '2026-05-12T00:05:00Z',
      receipt_signature_alg: 'ed25519',
    },
    schema: {
      type: 'object',
      properties: {
        route_id: { type: 'string' },
        payment_required: { type: 'object' },
        expires_at: { type: 'string' },
        receipt_signature_alg: { type: 'string' },
      },
      required: ['route_id', 'payment_required', 'expires_at'],
    },
  },
  bodyType: 'json' as const,
};

// ---------------------------------------------------------------------------
// Spike /test/bazaar-spike declaration (throwaway)
// ---------------------------------------------------------------------------

const SPIKE_CONFIG = {
  input: { message: 'hello bazaar' },
  inputSchema: {
    type: 'object',
    properties: { message: { type: 'string', maxLength: 1000 } },
    required: ['message'],
  },
  output: {
    example: { echo: 'hello bazaar' },
    schema: {
      type: 'object',
      properties: { echo: { type: 'string' } },
      required: ['echo'],
    },
  },
  bodyType: 'json' as const,
};

// ---------------------------------------------------------------------------
// Exported declarations (the value that goes into 402.body.extensions)
// ---------------------------------------------------------------------------

export const routeBazaarExtension: { bazaar: any } | null = buildDeclaration(ROUTE_CONFIG);
export const spikeBazaarExtension: { bazaar: any } | null = buildDeclaration(SPIKE_CONFIG);

// Env-flag getters — centralized for one consistent surface.
export function isBazaarExtensionEnabled(): boolean {
  return process.env.TRUSTBENCH_BAZAAR_EXTENSION_ENABLED === 'true';
}

export function isBazaarSpikeEnabled(): boolean {
  return process.env.TRUSTBENCH_BAZAAR_SPIKE_ENABLED === 'true';
}

// Spike handler — fixed-shape echo. Only invoked when paywall is disabled
// (otherwise paywallGate handles the request inline). For the spike test
// with paywall ON, this handler is unreachable (paywall returns 200 first).
import type { MiddlewareHandler } from 'hono';
export const spikeHandler: MiddlewareHandler = async (c) => {
  let body: any = {};
  try {
    body = await c.req.json();
  } catch {
    body = {};
  }
  const message = typeof body?.message === 'string' ? body.message : '';
  return c.json({ echo: message });
};

console.log(
  `[bazaar-extension] init: declareDiscoveryExtension=${declareDiscoveryExtensionImpl ? 'loaded' : 'missing'}, ` +
    `routeDecl=${routeBazaarExtension ? 'built' : 'null'}, ` +
    `spikeDecl=${spikeBazaarExtension ? 'built' : 'null'}, ` +
    `extensionEnabled=${isBazaarExtensionEnabled()}, spikeEnabled=${isBazaarSpikeEnabled()}`,
);
