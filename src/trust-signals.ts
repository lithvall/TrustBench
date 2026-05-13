// src/trust-signals.ts — Phase 4 SKU pivot Change 1 helper (added 2026-05-13)
//
// Parses + validates the `X-Trust-Signals` request header per the Strata
// integration sketch § 10.4 + § 10.4.5 contracts. Pure helper, no side
// effects, no I/O — callers handle storage / hash-inclusion / error response
// shape.
//
// Implementing against spec doc: `strata-integration-sketch-SEND.md` § 3
// (locked annotation shape, 2026-05-11) + § 10.4 (Change 1) + § 10.4.5
// (idempotency + signature contracts pinned 2026-05-13).
//
// Locked § 3 trust_signals entry shape:
//   {
//     source: "strata.usestrata.dev",
//     kind: "x402_trust",
//     trusted: false,
//     security_score: 45,
//     risk_level: "medium",
//     payment_endpoint: { amount_usd, currency, network },
//     actionable_flags: ["drain_risk"],
//     captured_at: "2026-05-10T14:23:41.000Z",
//     ref: "https://usestrata.dev/api/v1/x402/verify?url=..."
//   }
//
// Required fields per the lock: source, kind, captured_at, ref. Other fields
// are PRESENT in Strata's response today but the locked shape allows partial
// payloads (different Strata response shapes per query, future schema
// iterations). We require the 4-field core; pass everything else through
// verbatim into the receipt envelope so a Strata-aware verifier reads the
// same bytes Strata sent.
//
// Failure mode if this is wrong:
//   - Required-field set too strict → real Strata responses get 400'd, agent
//     can't pay through TrustBench with their signals. Mitigation: keep the
//     required set minimal (4 fields), surface the missing-field name in the
//     400 detail so it's debuggable.
//   - Required-field set too loose → an attacker's hand-crafted JSON gets
//     embedded in a TrustBench-signed receipt. Mitigation: signature only
//     attests "TrustBench received these bytes," not "these bytes are
//     truthful." A Strata-aware downstream verifier knows to re-fetch
//     Strata's data via the `ref` URL to confirm the score is real.
//
// Size cap: 4 KB matches the typical HTTP header ceiling many CDNs apply to
// single header values without buffering tricks. Strata's locked response
// shape is ~400 bytes typical; 4 KB gives 10x headroom for future field
// additions without re-litigating the cap.

// Size cap defaults to 4 KB. Overridable via env so we can raise the ceiling
// without a code deploy if Strata or a future SKU consumer surfaces a
// payload that grows past 4 KB (added 2026-05-13 per Critic-pass R2).
// Default chosen conservatively against Cloudflare Pro tier's 8 KB header
// limit; raise to 8192 once we've measured real-world payload sizes from
// a paying integration. Hard cap stays under 16 KB (Enterprise tier) to
// avoid surprise.
const DEFAULT_MAX_HEADER_BYTES = 4096;
const HARD_CEILING_BYTES = 16384;

function readMaxBytes(): number {
  const raw = process.env.TRUSTBENCH_TRUST_SIGNALS_MAX_BYTES;
  if (!raw) return DEFAULT_MAX_HEADER_BYTES;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_MAX_HEADER_BYTES;
  if (n > HARD_CEILING_BYTES) {
    // Reject misconfigured env that would let arbitrary-size headers through.
    // Fail closed: log a warning, return the default.
    console.warn(
      `[trust-signals] TRUSTBENCH_TRUST_SIGNALS_MAX_BYTES=${n} exceeds hard ceiling ${HARD_CEILING_BYTES}; using default ${DEFAULT_MAX_HEADER_BYTES}`,
    );
    return DEFAULT_MAX_HEADER_BYTES;
  }
  return n;
}

// Read once at module-load. The env var is operator-set; flipping it at
// runtime requires a process restart, which is the same model as every
// other env-derived constant in this codebase.
const MAX_HEADER_BYTES = readMaxBytes();
const REQUIRED_FIELDS = ['source', 'kind', 'captured_at', 'ref'] as const;

// TrustSignal is the parsed shape we accept. The required fields are typed
// strictly; the optional fields per the locked § 3 shape are typed loosely as
// `unknown` because the helper is a passthrough — it doesn't interpret
// `security_score` or `risk_level`, just attests that TrustBench observed
// those bytes at parse time. The receipt-generator (Change 2) will surface
// them in the final receipt envelope verbatim.
export type TrustSignal = {
  source: string;
  kind: string;
  captured_at: string;
  ref: string;
  // Optional fields per locked § 3 shape — passed through verbatim.
  trusted?: unknown;
  security_score?: unknown;
  risk_level?: unknown;
  payment_endpoint?: unknown;
  actionable_flags?: unknown;
  // Future Strata schema additions land here without code change.
  [k: string]: unknown;
};

// Discriminated parse result. Callers use the `ok` tag to choose between
// happy-path embedding and 400-error response shape.
export type TrustSignalsParseResult =
  | { ok: true; value: TrustSignal }
  | { ok: false; reason: 'absent' }
  | { ok: false; reason: 'oversized'; detail: string }
  | { ok: false; reason: 'malformed'; detail: string }
  | { ok: false; reason: 'missing_fields'; detail: string };

/**
 * Parses the X-Trust-Signals header value. Returns a discriminated result so
 * the caller can decide between 400-on-malformed (when the header is present
 * but broken) and unchanged-behavior (when the header is absent entirely).
 *
 * Wire shape: base64url-encoded UTF-8 JSON object. Single trust_signals
 * entry, not an array — the receipt's trust_signals array holds N entries
 * but the request header carries one (one Strata call per agent /route call).
 *
 * @param headerValue raw header string, or undefined when the header is absent
 */
export function parseTrustSignals(
  headerValue: string | undefined,
): TrustSignalsParseResult {
  // Absent vs. present is a deliberate discriminator — callers want to
  // distinguish "no signals provided" (continue as legacy /route call) from
  // "signals provided but broken" (400 to surface client bug).
  if (!headerValue || headerValue.length === 0) {
    return { ok: false, reason: 'absent' };
  }

  // Size cap is on the encoded header value, not the decoded JSON. That's
  // intentional — base64url-decoded payload is ~75% of encoded length, so a
  // 4 KB header cap maps to ~3 KB of JSON, which is well above the locked
  // § 3 shape's footprint.
  if (headerValue.length > MAX_HEADER_BYTES) {
    return {
      ok: false,
      reason: 'oversized',
      detail: `X-Trust-Signals header value is ${headerValue.length} bytes; max ${MAX_HEADER_BYTES}`,
    };
  }

  // base64url decode. Node's Buffer.from accepts 'base64url' since v16; if
  // the encoding is wrong, Buffer.from returns a buffer that may decode to
  // garbage rather than throwing, so we follow up with JSON.parse and treat
  // a parse failure as the discriminator for either bad base64 or bad JSON.
  let decoded: string;
  try {
    decoded = Buffer.from(headerValue, 'base64url').toString('utf-8');
  } catch (e: any) {
    return {
      ok: false,
      reason: 'malformed',
      detail: `base64url decode failed: ${e?.message ?? String(e)}`,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(decoded);
  } catch (e: any) {
    return {
      ok: false,
      reason: 'malformed',
      detail: `JSON parse failed: ${e?.message ?? String(e)}`,
    };
  }

  // Reject array, null, primitives. The header carries ONE trust_signals
  // entry (the receipt's array wraps N entries, but the wire-side header is
  // singular per Strata call).
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {
      ok: false,
      reason: 'malformed',
      detail: 'X-Trust-Signals must decode to a JSON object (not array, null, or primitive)',
    };
  }

  // Validate required fields per the locked § 3 shape.
  const obj = parsed as Record<string, unknown>;
  for (const field of REQUIRED_FIELDS) {
    const v = obj[field];
    if (typeof v !== 'string' || v.length === 0) {
      return {
        ok: false,
        reason: 'missing_fields',
        detail: `required field "${field}" missing or not a non-empty string`,
      };
    }
  }

  // Accept everything else verbatim. The receipt-generator (Change 2) will
  // JCS-canonicalize this object inside the signed receipt body so the
  // signature covers exactly these bytes.
  return { ok: true, value: obj as TrustSignal };
}

// Exported constant for tests and external consumers (e.g. paywall-handler
// in the SKU pivot's future endpoint paths).
export { MAX_HEADER_BYTES, REQUIRED_FIELDS };
