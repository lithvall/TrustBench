// src/bazaar-extension.ts — Phase 4 Bazaar discovery extension wire-up.
//
// PURPOSE
// -------
// Declare Bazaar discovery metadata on `POST /route` so the Coinbase CDP
// facilitator indexes TrustBench into agentic.market / Bazaar after the
// first successful CDP-mediated settle. Per CDP docs at
// https://docs.cdp.coinbase.com/x402/bazaar:
//
//   1. Wrap the route with `bazaarResourceServerExtension({ facilitator })`.
//   2. Attach `declareDiscoveryExtension({ input, inputSchema, output, bodyType })`
//      to declare the route's call shape.
//   3. CDP indexes after the first settle (NOT verify) completes successfully.
//   4. EXTENSION-RESPONSES header on settle response signals
//      `processing` (good, indexing async) or `rejected` (metadata failed
//      strict JSON Schema validation, fix and retry).
//   5. Catalog cache delay is ~10 min (documented).
//
// LOAD-SAFE DESIGN
// ----------------
// The `@x402/extensions/bazaar` package is referenced by CDP docs but not yet
// verified by us to exist on npm at that exact name. To ship safely even if
// the package isn't installed or the named exports don't exist, this module
// uses dynamic import with a graceful-no-op fallback. If the import fails,
// the route handler chain falls through normally and `POST /route` keeps
// working as a Phase 3+4 paywalled router; only the Bazaar indexing is
// skipped. No code throws at boot.
//
// FAILURE MODES
// -------------
// A. Package not installed → console.warn at boot, no-op middlewares,
//    `POST /route` still works, Bazaar listing won't happen.
// B. Named exports don't match (API drift) → same as A.
// C. Schema validation fails on the actual settle (EXTENSION-RESPONSES:
//    rejected) → route handler still runs and serves traffic correctly;
//    Bazaar indexing is skipped. Operator inspects the rejection reason in
//    Railway logs and iterates the schema in this file.
// D. CDP facilitator returns unexpected EXTENSION-RESPONSES values → log
//    and continue. Listing degradation, not a paywall regression.
//
// ENV FLAGS
// ---------
// `TRUSTBENCH_BAZAAR_EXTENSION_ENABLED=true` — turns on the production
//    extension on `POST /route`. Default false. Flip after spike validation.
// `TRUSTBENCH_BAZAAR_SPIKE_ENABLED=true` — exposes the throwaway spike route
//    at `POST /test/bazaar-spike` for the 30-min pre-commit spike per
//    runbook § 2. Default false. Disable after spike passes.

import type { MiddlewareHandler } from 'hono';
import { facilitator as cdpFacilitatorConfig } from '@coinbase/x402';

// ---------------------------------------------------------------------------
// Dynamic import shim. The named exports from `@x402/extensions/bazaar` are
// loaded once at module init. If the package or named exports are missing,
// the helpers below return identity (no-op) middlewares so the route chain
// is untouched.
// ---------------------------------------------------------------------------

type BazaarServerExtension = (config: { facilitator: unknown }) => MiddlewareHandler;
type DiscoveryExtension = (config: unknown) => MiddlewareHandler;

let bazaarResourceServerExtensionImpl: BazaarServerExtension | null = null;
let declareDiscoveryExtensionImpl: DiscoveryExtension | null = null;

try {
  // Top-level await is OK because package.json sets "type": "module".
  // If `@x402/extensions/bazaar` isn't installed, this throws and we fall
  // into the catch.
  const mod: any = await import('@x402/extensions/bazaar');
  bazaarResourceServerExtensionImpl =
    typeof mod.bazaarResourceServerExtension === 'function'
      ? mod.bazaarResourceServerExtension
      : null;
  declareDiscoveryExtensionImpl =
    typeof mod.declareDiscoveryExtension === 'function'
      ? mod.declareDiscoveryExtension
      : null;

  if (!bazaarResourceServerExtensionImpl || !declareDiscoveryExtensionImpl) {
    console.warn(
      '[bazaar-extension] @x402/extensions/bazaar loaded but named exports ' +
        `mismatch: bazaarResourceServerExtension=${!!bazaarResourceServerExtensionImpl}, ` +
        `declareDiscoveryExtension=${!!declareDiscoveryExtensionImpl}. ` +
        'Bazaar wiring will be a no-op. Check the package version against CDP docs at ' +
        'https://docs.cdp.coinbase.com/x402/bazaar.',
    );
  }
} catch (err: any) {
  console.warn(
    `[bazaar-extension] @x402/extensions/bazaar not available: ${err?.message ?? err}. ` +
      'Bazaar wiring will be a no-op until installed. To install: ' +
      '`npm install @x402/extensions` (verify with `npm view @x402/extensions` first ' +
      'because we have not directly verified this package exists at this exact name).',
  );
}

// No-op middleware used when the real extension isn't available.
const noopMiddleware: MiddlewareHandler = async (_c, next) => {
  await next();
};

// ---------------------------------------------------------------------------
// Production /route extension declaration.
// ---------------------------------------------------------------------------
//
// Schemas derived from src/route-handlers.ts (the canonical request +
// response shape). Description text is the locked positioning copy from
// phase4-submission-packet.md (sharpened 2026-05-11 for the Infopunks Radar
// competitive reclassification).
//
// CRITICAL: per CDP docs, the example `input` value MUST validate against
// `inputSchema` or the extension is `rejected` at settle time.

const ROUTE_INPUT_EXAMPLE = {
  capability: 'data',
  max_price: '10000',
  payer_address: '0x0000000000000000000000000000000000000000',
};

const ROUTE_INPUT_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  required: ['capability', 'max_price', 'payer_address'],
  additionalProperties: false,
  properties: {
    capability: {
      type: 'string',
      enum: ['search', 'inference', 'data', 'media', 'infra'],
      description:
        'Which agentic.market capability bucket to route against. Mirrors the Coinbase Agentic Market 5-category taxonomy.',
    },
    max_price: {
      type: 'string',
      pattern: '^[0-9]+$',
      description:
        'Maximum the agent is willing to pay for this call, in atomic USDC (6 decimals). 10000 = $0.01.',
    },
    payer_address: {
      type: 'string',
      pattern: '^0x[0-9a-fA-F]{40}$',
      description:
        'EVM address of the agent wallet that will sign the EIP-3009 transferWithAuthorization for the merchant payment.',
    },
  },
} as const;

const ROUTE_OUTPUT_EXAMPLE = {
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
};

const ROUTE_OUTPUT_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  required: ['route_id', 'payment_required', 'expires_at'],
  properties: {
    route_id: {
      type: 'string',
      pattern: '^qt_[A-Z0-9]{26}$',
      description:
        'Opaque ULID-keyed quote handle. Pass back to POST /route/settle when retrying with the signed X-PAYMENT envelope.',
    },
    payment_required: {
      type: 'object',
      description:
        'x402 payment requirements for the upstream merchant the router selected. Sign with the agent wallet and submit via POST /route/settle.',
      required: ['scheme', 'network', 'asset', 'amount', 'payTo', 'validAfter', 'validBefore', 'nonce'],
      properties: {
        scheme: { type: 'string', const: 'exact' },
        network: { type: 'string' },
        asset: { type: 'string', pattern: '^0x[0-9a-fA-F]{40}$' },
        amount: { type: 'string', pattern: '^[0-9]+$' },
        payTo: { type: 'string', pattern: '^0x[0-9a-fA-F]{40}$' },
        validAfter: { type: 'integer' },
        validBefore: { type: 'integer' },
        nonce: { type: 'string' },
      },
    },
    expires_at: {
      type: 'string',
      format: 'date-time',
      description: 'ISO 8601 timestamp after which the quote is no longer valid. Re-quote if expired.',
    },
    receipt_signature_alg: {
      type: 'string',
      const: 'ed25519',
      description:
        'Signing algorithm of the routing receipt returned by POST /route/settle. Verify against /.well-known/trustbench-pubkey.',
    },
  },
} as const;

const ROUTE_EXTENSION_CONFIG = {
  input: ROUTE_INPUT_EXAMPLE,
  inputSchema: ROUTE_INPUT_SCHEMA,
  output: {
    example: ROUTE_OUTPUT_EXAMPLE,
    schema: ROUTE_OUTPUT_SCHEMA,
  },
  bodyType: 'json' as const,
};

// ---------------------------------------------------------------------------
// Spike route extension declaration (throwaway, for § 2 pre-commit spike).
// ---------------------------------------------------------------------------
//
// Minimal fixed-shape endpoint used purely to validate that the Bazaar
// extension wiring + JSON Schema strict validation works end-to-end. Delete
// after a successful EXTENSION-RESPONSES: processing return on a real CDP
// settle against this route.

const SPIKE_INPUT_EXAMPLE = { message: 'hello bazaar' };
const SPIKE_INPUT_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  required: ['message'],
  additionalProperties: false,
  properties: {
    message: { type: 'string', maxLength: 1000 },
  },
} as const;
const SPIKE_OUTPUT_EXAMPLE = { echo: 'hello bazaar' };
const SPIKE_OUTPUT_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  required: ['echo'],
  properties: {
    echo: { type: 'string' },
  },
} as const;
const SPIKE_EXTENSION_CONFIG = {
  input: SPIKE_INPUT_EXAMPLE,
  inputSchema: SPIKE_INPUT_SCHEMA,
  output: {
    example: SPIKE_OUTPUT_EXAMPLE,
    schema: SPIKE_OUTPUT_SCHEMA,
  },
  bodyType: 'json' as const,
};

// ---------------------------------------------------------------------------
// Exported wire-up helpers
// ---------------------------------------------------------------------------
//
// These return two-middleware arrays compatible with Hono's `app.post(path,
// ...middlewares)` spreading. If the Bazaar package isn't available, both
// elements are no-op middlewares — the route chain is untouched.

function buildBazaarServerMiddleware(): MiddlewareHandler {
  if (!bazaarResourceServerExtensionImpl) return noopMiddleware;
  try {
    return bazaarResourceServerExtensionImpl({ facilitator: cdpFacilitatorConfig });
  } catch (err: any) {
    console.warn(
      `[bazaar-extension] bazaarResourceServerExtension() threw at init: ${err?.message ?? err}. Falling back to no-op.`,
    );
    return noopMiddleware;
  }
}

function buildDiscoveryExtensionMiddleware(config: unknown): MiddlewareHandler {
  if (!declareDiscoveryExtensionImpl) return noopMiddleware;
  try {
    return declareDiscoveryExtensionImpl(config);
  } catch (err: any) {
    console.warn(
      `[bazaar-extension] declareDiscoveryExtension() threw at init: ${err?.message ?? err}. Falling back to no-op.`,
    );
    return noopMiddleware;
  }
}

// Production extension middlewares for `POST /route`. Exported individually
// (not as an array) so they can be passed as named arguments to Hono's
// `app.post(path, ...handlers)` — Hono's variadic overload trips when the
// middlewares come from an array spread, picking the path-less overload
// and reporting the path string as if it should be a handler.
export const routeBazaarServerMw: MiddlewareHandler = buildBazaarServerMiddleware();
export const routeBazaarDiscoveryMw: MiddlewareHandler = buildDiscoveryExtensionMiddleware(
  ROUTE_EXTENSION_CONFIG,
);

// Spike extension middlewares for `POST /test/bazaar-spike`. Same pattern as
// the production middlewares above.
export const spikeBazaarServerMw: MiddlewareHandler = buildBazaarServerMiddleware();
export const spikeBazaarDiscoveryMw: MiddlewareHandler = buildDiscoveryExtensionMiddleware(
  SPIKE_EXTENSION_CONFIG,
);

// Env-flag getters. Centralized here so the wire-up in src/index.ts reads
// them through one consistent surface.
export function isBazaarExtensionEnabled(): boolean {
  return process.env.TRUSTBENCH_BAZAAR_EXTENSION_ENABLED === 'true';
}

export function isBazaarSpikeEnabled(): boolean {
  return process.env.TRUSTBENCH_BAZAAR_SPIKE_ENABLED === 'true';
}

// Spike handler — fixed-shape echo endpoint. Returns the message field back
// to the caller wrapped in `{ echo: ... }`. Stub for the pre-commit spike.
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

// Boot-time visibility log so ops can see at a glance whether the wiring
// is live or no-op.
console.log(
  `[bazaar-extension] init: package=${bazaarResourceServerExtensionImpl ? 'loaded' : 'missing'}, ` +
    `extensionEnabled=${isBazaarExtensionEnabled()}, spikeEnabled=${isBazaarSpikeEnabled()}`,
);
