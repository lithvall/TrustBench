// src/bundle-html.ts — HTML rendering for bundle artifacts (Phase 4, 2026-05-19).
//
// Bundles live as markdown files under bundles/*.md and are served at
// /bundles/<slug>[.md]. The .md-suffixed URL always returns raw markdown.
// The bare URL content-negotiates via preferHtml(): browsers get this HTML
// rendering, agents (curl, fetch with Accept: */*, etc.) get raw markdown.
//
// Why a renderer at all: the markdown body is the source of truth (agents
// need it verbatim for copy-paste into LLM runtimes), but plain text in a
// browser is a bad first impression for the partner-touch use case. HTML
// rendering wraps the body in site chrome so a browser visitor sees a
// polished page with consistent branding and easy navigation back to the
// rest of the site.
//
// Markdown -> HTML conversion via `marked` (lightweight, single dependency,
// MIT-licensed, GFM-compatible — handles the failure-taxonomy table). The
// rendered HTML is wrapped in our own scoped styling (no @tailwindcss/
// typography needed) so it matches the rest of the public site without
// pulling in another dependency.
//
// Failure mode: if marked throws on malformed markdown, the handler in
// index.ts falls back to returning the raw markdown body. The handler also
// returns 503 if the bundle file is missing at boot.

import { marked } from 'marked';
import { siteHead, renderNav, renderFooter } from './site-chrome.js';

// Configure marked once at module load.
//   - gfm: true enables GitHub-Flavored Markdown (required for the failure-
//     taxonomy table; standard markdown does not have tables).
//   - breaks: false keeps standard markdown line-break semantics. Bundle
//     markdown was written assuming standard rules; flipping this would
//     break paragraph formatting in subtle ways.
marked.setOptions({
  gfm: true,
  breaks: false,
});

// Render a bundle markdown body to a complete HTML document with TrustBench
// site chrome. `title` and `description` populate <title>, meta description,
// and OG/Twitter card metadata.
//
// Returns a complete HTML string ready for c.html(). Caller is responsible
// for setting Cache-Control.
export function renderBundleHtml(
  markdownBody: string,
  title: string,
  description: string,
): string {
  // marked.parse with async:false returns string synchronously. Type-assert
  // since the declared return is `string | Promise<string>` to cover the
  // case where async extensions are loaded (we don't load any here).
  // String() would render "[object Promise]" if a Promise leaked through,
  // so an explicit cast is the safer pattern.
  const htmlBody = marked.parse(markdownBody, { async: false }) as string;

  return `<!DOCTYPE html>
<html lang="en">
<head>
${siteHead(title, description, 'home')}
<style>
  /* Bundle-body styling — narrow column, generous spacing, scoped to
     .bundle-body to avoid clashing with the rest of the site. Matches the
     methodology page's visual language: brand-green h2 underline, JetBrains
     Mono code, soft-gray inline code background, dark-ink pre blocks with
     brand-green left border. */
  .bundle-body { font-size: 16px; line-height: 1.65; color: #0F1A14; }
  .bundle-body h1 { font-size: 32px; font-weight: 600; margin: 0 0 16px; letter-spacing: -0.01em; }
  .bundle-body h2 { font-size: 22px; font-weight: 600; margin: 32px 0 14px; padding-bottom: 8px; border-bottom: 2px solid #1F7A3A; display: inline-block; }
  .bundle-body h3 { font-size: 18px; font-weight: 600; margin: 24px 0 10px; }
  .bundle-body p { margin: 12px 0; }
  .bundle-body strong { font-weight: 600; }
  .bundle-body code { font-family: 'JetBrains Mono', ui-monospace, monospace; font-size: 14px; background: #F4F6F4; padding: 2px 6px; border-radius: 3px; color: #0F1A14; }
  .bundle-body pre { background: #0F1A14; color: #FAFAF7; padding: 16px 20px; border-radius: 6px; overflow-x: auto; margin: 16px 0; border-left: 3px solid #1F7A3A; }
  .bundle-body pre code { background: transparent; color: inherit; padding: 0; font-size: 13px; }
  .bundle-body ul, .bundle-body ol { margin: 12px 0; padding-left: 24px; }
  .bundle-body li { margin: 6px 0; }
  .bundle-body a { color: #1F7A3A; text-decoration: underline; }
  .bundle-body a:hover { color: #0F4D24; }
  .bundle-body table { border-collapse: collapse; margin: 16px 0; width: 100%; font-size: 14px; }
  .bundle-body th, .bundle-body td { border: 1px solid #E4E8E5; padding: 10px 12px; text-align: left; vertical-align: top; }
  .bundle-body th { background: #F4F6F4; font-weight: 600; }
  .bundle-body blockquote { border-left: 3px solid #1F7A3A; padding: 4px 16px; margin: 16px 0; color: #5C6963; background: #FAFAF7; }
  .bundle-body hr { border: 0; border-top: 1px solid #E4E8E5; margin: 32px 0; }
</style>
</head>
<body class="bg-bg text-ink">
${renderNav('home')}

<main class="max-w-7xl mx-auto px-6 py-12">
  <div class="max-w-3xl mx-auto">
    <div class="label-caps text-faint mb-2">TrustBench Bundle</div>
    <article class="bundle-body">
${htmlBody}
    </article>
    <div class="mt-12 pt-6 border-t border-border flex flex-col gap-2 text-sm text-muted">
      <div class="flex items-center gap-2">
        <span class="label-caps text-faint">Raw markdown</span>
        <a class="text-primary hover:text-primary-dark underline" href="?format=md">view as text/markdown</a>
      </div>
      <div class="text-xs text-faint">Agents and LLM runtimes typically fetch the markdown form directly; <code>.md</code>-suffixed URL or <code>Accept: text/markdown</code> works.</div>
    </div>
  </div>
</main>

${renderFooter()}
</body>
</html>`;
}
