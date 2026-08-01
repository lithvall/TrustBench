/*
 * src/log-redact.ts — query-string redaction for HTTP request logs.
 *
 * WHY THIS EXISTS
 * ---------------
 * Hono's `logger()` middleware builds each log line from
 * `url.slice(url.indexOf('/', 8))`, which includes the FULL query string.
 * MCP gateway clients (Smithery-style) reach the hosted server as:
 *
 *     POST /mcp?config=<base64>&api_key=<uuid>&profile=<username>
 *
 * so third-party credentials and usernames were written verbatim into the
 * Railway log stream on both the `<--` and `-->` lines. Railway logs sampled
 * 2026-07-25 -> 2026-08-01 contained 703 such lines carrying 7 distinct
 * third-party API keys.
 *
 * Those keys are not ours and we never read them — they belong to the
 * gateway's users and merely transit in the URL. Logging them contradicts two
 * standing public commitments:
 *
 *   - /privacy, "What we do not collect": "No wallet private keys or secrets"
 *   - Anthropic Connectors Directory submission (anthropic-connector-submission.md):
 *     "No credentials ... are ever sent to TrustBench servers"
 *
 * This module redacts every query-string value that is not on a short
 * allowlist, applied at log-print time.
 *
 * FAILURE MODE — if this is wrong, what breaks and how would we notice?
 * --------------------------------------------------------------------
 * Only log readability. Request handling never executes this code: Hono calls
 * the print function with an already-formatted string and ignores the return
 * value, so a bug here cannot change a response body, a status code, an
 * x402 payment path, or a receipt. The realistic failure is OVER-redaction
 * (a param we wanted to read shows as <redacted>), which is the safe
 * direction — the allowlist is closed, so any newly-added query param is
 * redacted by default until deliberately listed here.
 *
 * Verified by scripts/log-redact-smoke.ts against real captured log lines.
 */

/**
 * Query params whose values are safe to log verbatim.
 *
 * Closed allowlist — anything not named here is redacted. Derived from the
 * only two params the application actually reads:
 *     grep -rhoE "req\.query\(['\"][a-zA-Z_]+['\"]\)" src/
 *     -> 7x format, 2x capability
 *
 * Adding a param here is a deliberate act: only do it for values that can
 * never carry a credential, a username, or anything user-identifying.
 */
const SAFE_QUERY_PARAMS = new Set(['format', 'capability']);

/** Placeholder written in place of a redacted value. */
const REDACTED = '<redacted>';

/**
 * Redact non-allowlisted query-string values inside a formatted log line.
 *
 * Operates on the whole line rather than a parsed URL because Hono hands the
 * print function a finished string, e.g.:
 *
 *   "<-- POST /mcp?api_key=abc&profile=jo"
 *   "--> POST /mcp?api_key=abc&profile=jo \x1b[32m200\x1b[0m 1ms"
 *
 * The value pattern stops at whitespace, so the trailing status code, ANSI
 * colour codes, and elapsed time on the `-->` line are always preserved.
 * Param NAMES are kept so logs still show the shape of an incoming request.
 */
export function redactQueryValues(line: string): string {
  return line.replace(
    /([?&])([^=&\s]+)=([^&\s]*)/g,
    (_match: string, separator: string, key: string, value: string) =>
      SAFE_QUERY_PARAMS.has(key.toLowerCase())
        ? `${separator}${key}=${value}`
        : `${separator}${key}=${REDACTED}`,
  );
}

/**
 * Drop-in print function for Hono's `logger()`.
 *
 * Hono's PrintFunc is `(str: string, ...rest: string[]) => void` and defaults
 * to `console.log`. This wraps that default with redaction and changes
 * nothing else about log formatting or destination.
 */
export function redactedLogPrint(message: string, ...rest: string[]): void {
  console.log(redactQueryValues(message), ...rest);
}
