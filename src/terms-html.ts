// src/terms-html.ts — Terms of Service page for trustbench.io/terms.
// Required for the Anthropic Software Directory submission checklist.
// Minimal terms appropriate for a public, unauthenticated, read-only API
// with no user accounts, no billing, and no custodial function.
import { siteHead, renderNav, renderFooter } from './site-chrome.js';

export function renderTermsHtml(): string {
  const title = 'Terms of Service — TrustBench';
  const description =
    'TrustBench terms of service. TrustBench is a public, read-only registry ' +
    'and audit layer for x402 agent payments. No accounts or billing required ' +
    'to use the public API or MCP server.';
  const lastUpdated = '2026-05-14';

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
    <h1 class="text-4xl font-semibold tracking-tight text-ink mb-4">Terms of Service</h1>
    <p class="text-sm text-faint mb-10">Last updated: ${lastUpdated}</p>
    <div class="space-y-10 text-base leading-relaxed text-muted">

      <section>
        <h2 class="text-xl font-semibold text-ink mb-3 pb-2 border-b-2 border-brand">1. Service description</h2>
        <p>
          TrustBench (<a href="https://trustbench.io" class="text-brand hover:underline">trustbench.io</a>)
          is a public registry and audit layer for x402 agent payments operated by Johan Lithvall.
          It provides a read-only MCP server, a ranked registry of x402 API endpoints with
          liveness telemetry, and a queryable audit trail of signed payment receipts.
        </p>
      </section>

      <section>
        <h2 class="text-xl font-semibold text-ink mb-3 pb-2 border-b-2 border-brand">2. Acceptance</h2>
        <p>
          By accessing or using the TrustBench API, MCP server, or website, you agree to these
          Terms. If you do not agree, do not use the service.
        </p>
      </section>

      <section>
        <h2 class="text-xl font-semibold text-ink mb-3 pb-2 border-b-2 border-brand">3. Permitted use</h2>
        <p class="mb-3">
          The public API and MCP server are provided for legitimate, non-abusive use. You may
          use TrustBench to:
        </p>
        <ul class="list-disc pl-6 space-y-1 mb-3">
          <li>Query provider rankings and liveness data for informational purposes</li>
          <li>Fetch and verify signed payment receipts</li>
          <li>Integrate the read-only MCP tools into agents and applications</li>
        </ul>
        <p>
          You may not use TrustBench to scrape, flood, or abuse the API in ways that impair
          service for others. Automated clients should respect reasonable rate limits. Probing
          that materially degrades service quality is prohibited.
        </p>
      </section>

      <section>
        <h2 class="text-xl font-semibold text-ink mb-3 pb-2 border-b-2 border-brand">4. No custodial function</h2>
        <p>
          TrustBench is <strong class="text-ink">non-custodial</strong>. We do not hold, transfer,
          or control any funds, cryptocurrency, or financial assets on behalf of any user or agent.
          The routing API (<code class="bg-surface px-1 rounded text-sm font-mono">/route</code>)
          facilitates agent-signed x402 transactions but never takes custody of funds. Use of
          any financial features is entirely at your own discretion and risk.
        </p>
      </section>

      <section>
        <h2 class="text-xl font-semibold text-ink mb-3 pb-2 border-b-2 border-brand">5. Accuracy of data</h2>
        <p>
          Provider rankings are derived from automated HEAD-probe liveness checks (3 samples
          from a single host). They are <strong class="text-ink">not</strong> a rigorous benchmark.
          See <a href="https://trustbench.io/methodology" class="text-brand hover:underline">trustbench.io/methodology</a>
          for a full description of the measurement methodology and its limitations.
          TrustBench makes no warranty as to the accuracy, completeness, or fitness for purpose
          of any data provided.
        </p>
      </section>

      <section>
        <h2 class="text-xl font-semibold text-ink mb-3 pb-2 border-b-2 border-brand">6. Disclaimer of warranties</h2>
        <p>
          The service is provided "as is" and "as available" without warranty of any kind, express
          or implied, including but not limited to warranties of merchantability, fitness for a
          particular purpose, or non-infringement. TrustBench does not guarantee uptime,
          data accuracy, or continuity of service.
        </p>
      </section>

      <section>
        <h2 class="text-xl font-semibold text-ink mb-3 pb-2 border-b-2 border-brand">7. Limitation of liability</h2>
        <p>
          To the maximum extent permitted by applicable law, TrustBench and its operator shall
          not be liable for any indirect, incidental, special, consequential, or punitive damages
          arising from your use of the service, including but not limited to losses from reliance
          on provider rankings or routing decisions.
        </p>
      </section>

      <section>
        <h2 class="text-xl font-semibold text-ink mb-3 pb-2 border-b-2 border-brand">8. Intellectual property</h2>
        <p>
          The TrustBench source code is published under the MIT license at
          <a href="https://github.com/lithvall/TrustBench" class="text-brand hover:underline">github.com/lithvall/TrustBench</a>.
          Provider registry data and signed receipts are provided for public informational use.
        </p>
      </section>

      <section>
        <h2 class="text-xl font-semibold text-ink mb-3 pb-2 border-b-2 border-brand">9. Governing law</h2>
        <p>
          These Terms are governed by the laws of Sweden. Any disputes shall be resolved
          in Swedish courts.
        </p>
      </section>

      <section>
        <h2 class="text-xl font-semibold text-ink mb-3 pb-2 border-b-2 border-brand">10. Changes</h2>
        <p>
          If these Terms change materially, the "Last updated" date at the top will be updated.
          Continued use of the service after a change constitutes acceptance of the new Terms.
        </p>
      </section>

      <section>
        <h2 class="text-xl font-semibold text-ink mb-3 pb-2 border-b-2 border-brand">11. Contact</h2>
        <p>Questions? Open an issue at
        <a href="https://github.com/lithvall/TrustBench/issues" class="text-brand hover:underline">github.com/lithvall/TrustBench/issues</a>
        or email <a href="mailto:lithvall88@gmail.com" class="text-brand hover:underline">lithvall88@gmail.com</a>.</p>
      </section>

    </div>
  </div>
</main>
${foot}
</body>
</html>`;
}
