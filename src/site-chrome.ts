// src/site-chrome.ts — shared HTML chrome for the public site (Phase 4 redesign).
//
// Every public page (/, /rankings, /methodology, /analytics, /receipts/:id)
// shares the same nav + footer + design tokens. Inlining identical chrome in
// every renderer was making drift a real risk, so the head/nav/footer live
// here as single sources of truth.
//
// Design tokens come from the Stitch "Technical Integrity" design system:
// brand-green #1F7A3A on warm off-white #FAFAF7, white card surfaces, 1px
// borders #E4E8E5. Inter for UI, JetBrains Mono for code/labels.
//
// Tailwind is loaded via the play CDN (cdn.tailwindcss.com) to avoid adding
// a build step to a solo-founder repo. Acceptable trade-off for a low-traffic
// public site; can be replaced with a precompiled stylesheet later.

// Active-nav identifier for highlighting the current page in the top bar.
export type ActiveNav = 'home' | 'rankings' | 'methodology' | 'pricing' | 'analytics' | 'github' | 'receipt';

// Inline SVG bench-and-shield mark. Brand-green on transparent so it works
// on white nav and any light surface. 32×32 with viewBox so it scales cleanly.
// Rendered inline (no <img> request) to avoid a static-asset hosting story.
export const BENCH_LOGO_SVG = `<svg width="28" height="28" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" aria-label="TrustBench" role="img">
  <!-- bench top slat -->
  <rect x="3" y="13" width="26" height="2.5" rx="0.5" fill="#1F7A3A"/>
  <rect x="3" y="17" width="26" height="2" rx="0.5" fill="#1F7A3A"/>
  <!-- bench seat -->
  <rect x="3" y="20.5" width="26" height="2" rx="0.5" fill="#1F7A3A"/>
  <!-- bench legs -->
  <rect x="5" y="22.5" width="2" height="6" fill="#1F7A3A"/>
  <rect x="25" y="22.5" width="2" height="6" fill="#1F7A3A"/>
  <!-- shield centered on backrest -->
  <path d="M16 4 L22 6 L22 12 Q22 15.5 16 18 Q10 15.5 10 12 L10 6 Z" fill="#1F7A3A" stroke="#FAFAF7" stroke-width="0.6"/>
  <!-- T glyph on shield -->
  <text x="16" y="13.4" text-anchor="middle" font-family="Inter, sans-serif" font-weight="700" font-size="8.5" fill="#FFFFFF">T</text>
</svg>`;

// Identifier for a per-page OG/Twitter card image. Each value maps to a
// PNG at /og/<name>.png served by src/index.ts (whitelisted, year-immutable
// cache). Add a new card by (1) generating the PNG via
// scripts/generate-og-cards.py, (2) committing it to public/og/, (3) adding
// the key to OG_CARDS in src/index.ts, and (4) extending this union.
export type OgCard = 'home' | 'methodology' | 'rankings' | 'pricing' | 'receipt';

// Canonical, absolute base URL. Hard-coded to the production hostname so
// social-card meta tags resolve to a real HTTPS URL regardless of which
// host the response was served from (Railway internal hostname, preview
// deploys, etc.). X/Slack/Discord require absolute URLs for og:image.
const SITE_ORIGIN = 'https://trustbench.io';

// Shared <head> contents — Tailwind config, fonts, base styles, social card
// meta tags. Pages append their own page-specific <link>s or <meta>s after
// this. The optional `ogCard` arg selects the per-page card; default 'home'
// is fine for any page that doesn't have a dedicated card yet.
//
// Tailwind config note: only the design tokens that pages actually use are
// declared here. If a page introduces a new token, add it here so every page
// renders consistently.
export function siteHead(title: string, description: string, ogCard: OgCard = 'home'): string {
  const ogImageUrl = `${SITE_ORIGIN}/og/${ogCard}.png`;
  return `<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}">
<meta property="og:type" content="website">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:image" content="${ogImageUrl}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:type" content="image/png">
<meta property="og:image:alt" content="${escapeHtml(title)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(title)}">
<meta name="twitter:description" content="${escapeHtml(description)}">
<meta name="twitter:image" content="${ogImageUrl}">
<meta name="twitter:image:alt" content="${escapeHtml(title)}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<script src="https://cdn.tailwindcss.com"></script>
<script>
tailwind.config = {
  theme: {
    extend: {
      colors: {
        primary: '#1F7A3A',
        'primary-dark': '#0F4D24',
        'soft-green': '#E8F3EC',
        bg: '#FAFAF7',
        surface: '#FFFFFF',
        ink: '#0F1A14',
        muted: '#5C6963',
        faint: '#8A938E',
        border: '#E4E8E5',
        amber: '#B45309',
        'amber-soft': '#FFFBEB',
        'amber-ink': '#92400E',
        'red-soft': '#FEF2F2',
        'red-ink': '#B42318',
        mono: '#F4F6F4',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
    },
  },
};
</script>
<style>
  body { font-family: 'Inter', system-ui, sans-serif; background: #FAFAF7; color: #0F1A14; -webkit-font-smoothing: antialiased; }
  code, pre, .mono { font-family: 'JetBrains Mono', ui-monospace, monospace; }
  .label-caps { font-family: 'JetBrains Mono', monospace; font-size: 11px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; }
  html { scroll-behavior: smooth; }
</style>`;
}

// Shared top navigation. `active` highlights the current page link.
// "View receipts" pill on the right links to the latest milestone receipt
// since there's no list view yet — better UX than a broken /receipts.
export function renderNav(active: ActiveNav): string {
  const link = (key: ActiveNav, href: string, label: string) => {
    const cls = active === key
      ? 'text-primary border-b-2 border-primary pb-1 font-medium'
      : 'text-muted hover:text-primary transition-colors';
    return `<a href="${href}" class="${cls} text-sm">${label}</a>`;
  };
  return `<nav class="bg-surface border-b border-border sticky top-0 z-50">
  <div class="max-w-7xl mx-auto px-6 flex justify-between items-center h-16">
    <a href="/" class="flex items-center gap-3" aria-label="TrustBench home">
      ${BENCH_LOGO_SVG}
      <span class="font-semibold tracking-tight text-[18px] text-ink">TrustBench</span>
    </a>
    <div class="hidden md:flex items-center gap-7">
      ${link('rankings', '/rankings?capability=search', 'Rankings')}
      ${link('methodology', '/methodology', 'Methodology')}
      ${link('pricing', '/pricing', 'Pricing')}
      ${link('analytics', '/analytics', 'Analytics')}
      <a href="https://github.com/lithvall/TrustBench" target="_blank" rel="noopener noreferrer" class="text-muted hover:text-primary transition-colors text-sm">GitHub</a>
    </div>
    <div class="flex items-center gap-3">
      <a href="/receipts/rcpt_01KQY7C44GAPSXZPFQYRZ1D10C" class="bg-primary hover:bg-primary-dark text-white text-sm font-medium px-4 py-2 rounded transition-colors">View receipt</a>
    </div>
  </div>
</nav>`;
}

// Shared footer. Three columns + a thin bottom strip with the build hash and
// honest-framing reminder. Every link goes to a real surface that exists.
export function renderFooter(): string {
  return `<footer class="bg-surface border-t border-border mt-16">
  <div class="max-w-7xl mx-auto px-6 py-12 grid grid-cols-2 md:grid-cols-4 gap-8">
    <div class="col-span-2 md:col-span-1 flex flex-col gap-3">
      <div class="flex items-center gap-2">${BENCH_LOGO_SVG}<span class="font-semibold text-ink">TrustBench</span></div>
      <p class="text-sm text-muted leading-relaxed max-w-xs">Public registry + live telemetry for x402 endpoints. Non-custodial smart router for agent payments.</p>
    </div>
    <div class="flex flex-col gap-2">
      <span class="label-caps text-primary">Product</span>
      <a href="/rankings?capability=search" class="text-sm text-muted hover:text-primary">Rankings</a>
      <a href="/methodology" class="text-sm text-muted hover:text-primary">Methodology</a>
      <a href="/pricing" class="text-sm text-muted hover:text-primary">Pricing</a>
      <a href="/analytics" class="text-sm text-muted hover:text-primary">Analytics</a>
    </div>
    <div class="flex flex-col gap-2">
      <span class="label-caps text-primary">Developers</span>
      <a href="/skill.md" class="text-sm text-muted hover:text-primary">skill.md</a>
      <a href="/llms.txt" class="text-sm text-muted hover:text-primary">llms.txt</a>
      <a href="/.well-known/trustbench.json" class="text-sm text-muted hover:text-primary">.well-known</a>
      <a href="/.well-known/trustbench-pubkey" class="text-sm text-muted hover:text-primary">Public key</a>
      <a href="https://github.com/lithvall/TrustBench/blob/main/scripts/verify-receipt.js" target="_blank" rel="noopener noreferrer" class="text-sm text-muted hover:text-primary">Reference verifier</a>
    </div>
    <div class="flex flex-col gap-2">
      <span class="label-caps text-primary">Project</span>
      <a href="https://github.com/lithvall/TrustBench" target="_blank" rel="noopener noreferrer" class="text-sm text-muted hover:text-primary">GitHub</a>
      <a href="https://x.com/InfopunksHQ" target="_blank" rel="noopener noreferrer" class="text-sm text-muted hover:text-primary">X</a>
      <a href="/health" class="text-sm text-muted hover:text-primary">Status</a>
    </div>
  </div>
  <div class="border-t border-border">
    <div class="max-w-7xl mx-auto px-6 py-4 flex flex-col md:flex-row justify-between items-center gap-2 text-xs text-faint">
      <span class="mono">Pay-to-list (refundable bond), never pay-to-rank.</span>
      <span class="mono">© 2026 TrustBench · Solo-founder</span>
    </div>
  </div>
</footer>`;
}

// Defense-in-depth HTML escape for any string that might be user-influenced
// (capability names from query strings, provider names from the registry).
export function escapeHtml(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
