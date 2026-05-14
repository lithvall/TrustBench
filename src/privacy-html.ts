// src/privacy-html.ts — Privacy Policy page for trustbench.io/privacy.
// Required for the Anthropic Connectors Directory submission (Privacy Policy field)
// and general transparency with users of the MCP server and public API.
import { siteHead, renderNav, renderFooter } from './site-chrome.js';

export function renderPrivacyHtml(): string {
  const title = 'Privacy Policy — TrustBench';
  const description =
    'TrustBench privacy policy. The TrustBench API and MCP server collect no ' +
    'personal data, store no session information, and transmit no user data to ' +
    'third parties.';
  const lastUpdated = '2026-05-14';

  // Build without template literals to avoid any transpiler surprises.
  const head = siteHead(title, description, 'methodology');
  const nav  = renderNav('methodology');
  const foot = renderFooter();

  return `<!DOCTYPE html>
<html lang="en">
<head>
${head}
</head>
<body class="bg-bg text-ink">
${nav}
<main class="max-w-7xl mx-auto px-6 py-12">
  <div class="max-w-[720px]">
    <div class="label-caps text-faint mb-2">Legal</div>
    <h1 class="text-4xl font-semibold tracking-tight text-ink mb-4">Privacy Policy</h1>
    <p class="text-sm text-faint mb-10">Last updated: ${lastUpdated}</p>
    <div class="space-y-10 text-base leading-relaxed text-muted">

      <section>
        <h2 class="text-xl font-semibold text-ink mb-3 pb-2 border-b-2 border-brand">Summary</h2>
        <p>
          TrustBench (<a href="https://trustbench.io" class="text-brand hover:underline">trustbench.io</a>)
          is a public registry and audit layer for x402 agent payments.
          <strong class="text-ink">We collect no personal data, store no session information, and
          transmit nothing about you or your agents to third parties.</strong>
        </p>
      </section>

      <section>
        <h2 class="text-xl font-semibold text-ink mb-3 pb-2 border-b-2 border-brand">What TrustBench does</h2>
        <ul class="list-disc pl-6 space-y-1">
          <li>A public registry of x402-style API endpoints with nightly liveness telemetry</li>
          <li>A non-custodial routing layer for x402 agent payments</li>
          <li>A signed-receipt audit trail for payment events</li>
          <li>A hosted MCP server at <code class="bg-surface px-1 rounded text-sm font-mono">https://trustbench.io/mcp</code> exposing three read-only tools</li>
        </ul>
      </section>

      <section>
        <h2 class="text-xl font-semibold text-ink mb-3 pb-2 border-b-2 border-brand">Data we collect</h2>
        <h3 class="font-semibold text-ink mt-5 mb-2">Public API and MCP server</h3>
        <p class="mb-3">Standard web server access logs (IP, timestamp, path, HTTP method,
        response code) may be retained up to 30 days for operational monitoring.
        We do not link these logs to any user identity.</p>
        <p>Receipt IDs queried via MCP tools are public identifiers with no personal information.</p>
        <h3 class="font-semibold text-ink mt-5 mb-2">Routing (POST /route)</h3>
        <p>Receipts record: capability requested, provider routed to, on-chain transaction
        reference, and timestamp. No wallet private keys, conversation content, or PII.</p>
        <h3 class="font-semibold text-ink mt-5 mb-2">What we do not collect</h3>
        <ul class="list-disc pl-6 space-y-1">
          <li>No names, email addresses, or account identifiers</li>
          <li>No agent conversation content</li>
          <li>No wallet private keys or secrets</li>
          <li>No cookies or browser fingerprinting</li>
          <li>No analytics SDKs (no Google Analytics, Mixpanel, etc.)</li>
        </ul>
      </section>

      <section>
        <h2 class="text-xl font-semibold text-ink mb-3 pb-2 border-b-2 border-brand">Third-party services</h2>
        <ul class="list-disc pl-6 space-y-2">
          <li><strong class="text-ink">Railway</strong> — application hosting.
            <a href="https://railway.app/legal/privacy" class="text-brand hover:underline text-sm ml-1">Privacy policy</a></li>
          <li><strong class="text-ink">Supabase</strong> — database (Postgres).
            <a href="https://supabase.com/privacy" class="text-brand hover:underline text-sm ml-1">Privacy policy</a></li>
          <li><strong class="text-ink">Upstash</strong> — Redis cache.
            <a href="https://upstash.com/trust/privacy.pdf" class="text-brand hover:underline text-sm ml-1">Privacy policy</a></li>
          <li><strong class="text-ink">Cloudflare</strong> — DNS and TLS.
            <a href="https://www.cloudflare.com/privacypolicy/" class="text-brand hover:underline text-sm ml-1">Privacy policy</a></li>
        </ul>
      </section>

      <section>
        <h2 class="text-xl font-semibold text-ink mb-3 pb-2 border-b-2 border-brand">Data retention</h2>
        <ul class="list-disc pl-6 space-y-1">
          <li>Access logs: up to 30 days, then deleted</li>
          <li>Signed receipts: permanently retained (public audit trail by design)</li>
          <li>Provider registry data: updated nightly, historical probes retained indefinitely</li>
        </ul>
      </section>

      <section>
        <h2 class="text-xl font-semibold text-ink mb-3 pb-2 border-b-2 border-brand">Security</h2>
        <p>All data in transit is encrypted via HTTPS/TLS. Receipts are signed with Ed25519
        and verifiable against the public key at
        <a href="https://trustbench.io/.well-known/trustbench-pubkey"
           class="text-brand hover:underline font-mono text-sm">/.well-known/trustbench-pubkey</a>.
        TrustBench is non-custodial — we never hold agent funds or private keys.</p>
      </section>

      <section>
        <h2 class="text-xl font-semibold text-ink mb-3 pb-2 border-b-2 border-brand">Contact</h2>
        <p>Questions? Open an issue at
        <a href="https://github.com/lithvall/TrustBench/issues" class="text-brand hover:underline">github.com/lithvall/TrustBench/issues</a>
        or email <a href="mailto:lithvall88@gmail.com" class="text-brand hover:underline">lithvall88@gmail.com</a>.</p>
      </section>

      <section>
        <h2 class="text-xl font-semibold text-ink mb-3 pb-2 border-b-2 border-brand">Changes</h2>
        <p>If this policy changes materially, the "Last updated" date at the top will be updated.</p>
      </section>

    </div>
  </div>
</main>
${foot}
</body>
</html>`;
}
