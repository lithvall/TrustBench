# Stitch Prompt — TrustBench Website Redesign

> Paste the body below into Google Stitch. Attach both image files (`trustbench-logo-square.png` and `trustbench-banner.png`) before generating. Ask Stitch for **three variations per page** so you can compare composition without changing the design tokens.

---

## Product context

TrustBench is a public registry of **x402**-style API endpoints with nightly liveness telemetry and Ed25519-signed scorecards, evolving into a **non-custodial smart router** for AI-agent payments — protocol-agnostic across x402 and p402. Think "OpenRouter for x402." It is solo-founder built and aimed at agent builders, MCP-middleware authors, and x402 providers. The site must read like infrastructure, not marketing.

## Visual direction

Clean dev-tool / infrastructure aesthetic. Reference points: **Vercel docs, Linear, Stripe Docs, Resend, Anthropic docs**. Honest, technical, generous whitespace, data-forward. Avoid SaaS marketing clichés: no glossy gradient heroes, no orbiting-planet illustrations, no "10x your agent" headlines, no testimonial carousels.

## Brand assets (attached)

- **Square logo** (`trustbench-logo-square.png`): green park bench with a white "T" shield centered on the backrest. Use as the primary nav mark in the top-left of every page, 28–32px tall.
- **Wide banner** (`trustbench-banner.png`): same bench centered on a white field. Use **only on the landing-page hero**, floated to the right of the headline. Do not full-bleed it. Do not stretch.

## Color tokens (derived from the bench green; white/off-white background)

| Token | Hex | Use |
|---|---|---|
| `--surface` | `#FFFFFF` | cards, table rows, modals |
| `--bg` | `#FAFAF7` | page background, sticky table headers |
| `--brand-green` | `#1F7A3A` | links, primary buttons, active tab underline, "high" score cells |
| `--brand-green-soft` | `#E8F3EC` | pill fills, hover states, verified-badge backgrounds |
| `--brand-green-dark` | `#0F4D24` | text on green-soft backgrounds, wordmark |
| `--text` | `#0F1A14` | body, headings |
| `--text-muted` | `#5C6963` | sub-labels, table column headers |
| `--text-faint` | `#8A938E` | meta, "last updated" |
| `--border` | `#E4E8E5` | dividers, card borders |
| `--amber` | `#B45309` | "this is a liveness check, not a benchmark" callouts |
| `--red` | `#B42318` | failed verification states |
| `--mono-bg` | `#F4F6F4` | code blocks, hashes, addresses |

No drop shadows. No gradients. 1px borders + spacing do the lifting.

## Typography

- Body / UI: **Inter**, 14–15px base, 1.55 line-height
- Headings: **Inter Tight** or **Geist**, weight 500/600 (never 700), slightly tightened tracking
- Mono: **JetBrains Mono** or **Geist Mono**, 13px — used for URLs, tx hashes, addresses, code, receipt IDs
- No serifs anywhere

## Pages (5 total — all must share the same nav + footer)

### 1. Landing (new)
Hero: square logo top-left in nav; the banner image floats right of a three-line headline:

> **Public registry + live telemetry for x402 endpoints.**
> **Non-custodial smart router for agent payments.**
> **Protocol-agnostic across x402 and p402.**

Sub-headline: *"Honest measurement, signed receipts, hard spend caps. Built solo, useful for any agent builder."*

Three CTAs: `View rankings` (primary green), `How it's measured` (ghost), `Read the docs` (ghost).

Below the hero, a four-card feature row with thin mono-line icons: **Registry**, **Live Telemetry**, **Signed Receipts**, **Spend Caps + Idempotency**. Each card 1–2 sentences, no marketing claims.

Below that, a "discovery surfaces" band styled as four code-pill links: `/skill.md`, `/llms.txt`, `/.well-known/trustbench.json`, `GitHub`.

Bottom: a small honest-framing strip — *"Pay-to-list (refundable bond), never pay-to-rank. Routing decisions are measurement-based."*

### 2. /rankings
Capability tab strip: **Search · Inference · Data · Media · Infra**. Active tab gets the brand-green underline + green-soft fill.

Filter row below tabs: pill group `All` · `✅ Verified (x402)` · `🪪 Coinbase 1P` · `🔗 Coinbase 3P`, plus a search input (rounded, full-width on the right).

Sortable table, columns: rank · provider (name on top line, full URL in mono-faint below) · score (green/amber/faint based on threshold) · p50 ms · p95 ms · uptime 7d % · verified badges · updated (relative time). Row hover background `--bg`. Empty state for capabilities with no providers yet.

Footer-of-section: `X of Y shown` left, `View as JSON` link right.

### 3. /methodology
Long-form documentation page. Single column, ~720px max-width, comfortable reading rhythm. Sections: **Data collection** (bullets describing the probe), **Scoring** (formula in a mono block with a 3px green left-border), **What each metric represents** (amber-bordered callout: *"Score reflects reachability and response time, not capability quality. Latency is single-origin. Payment behavior is not yet measured."*), **Verifying a scorecard** (mono code example + link to reference verifier), **Roadmap**, **Phase 3 router**.

On desktop, a sticky right-side table of contents linking to each h2. This page must read as honest, careful, technical — never as marketing copy.

### 4. /analytics
Operator dashboard. Top: a `Last updated: <timestamp>` chip plus the same amber callout used on /methodology, linking to /methodology. Three-card row "Providers by Category" (Search / Inference / Data) showing count + top score + a tiny sparkline of the last 7 days. Below: "Current Top Providers" card with compact top-3 tables per capability. Footer link to `/health`. Less landing, more operator-console.

### 5. /receipts/:id
Receipt detail. Breadcrumb (TrustBench › Methodology › Receipt) → `Receipt` h1 → receipt id in mono-faint.

Big overall verdict banner — when both checks pass: green-soft fill, brand-green-dark text:
**✅ Verified receipt · signature valid AND on-chain settlement matches**

Two status pills below: `✅ Signature valid` and `✅ On-chain verified`. Failure variants: red and amber with reason text.

Three labelled tables, label-left value-right, dividers only:
- **Settlement** — tx hash (mono, links to Basescan with `↗`), block, payer, payee, amount, settled-at
- **Routing** — capability, provider, score at decision, alternatives considered, selection reason, latency
- **Pricing** — provider price, TrustBench fee (with `flat-per-tx` meta), total paid

"Verify yourself" section with two copy-on-hover mono code blocks (`npm run verify-receipt -- <id>` and `... --check-chain`).

Footer: `View as JSON` · `Public key` · `Methodology` · `Reference verifier`.

## Shared chrome

- **Top nav** — 64px tall, sticky, `--surface` background, 1px bottom border in `--border`. Left: logo + wordmark "TrustBench" in `--brand-green-dark`. Center / right: links `Rankings · Methodology · Analytics · GitHub`. Right edge: a green pill `View receipts`.
- **Footer** — three columns: Product (Rankings, Methodology, Analytics), Developers (skill.md, llms.txt, .well-known, public key, reference verifier), Project (GitHub, X, status). Below the columns, a one-line honest-framing reminder and the build/version hash in mono-faint.
- **Pills**: rounded-full, 6×14px padding. Active = `--brand-green-soft` fill + `--brand-green` text + `--brand-green-dark` border.
- **Tables**: zero outer border. Horizontal-only dividers in `--border`. Header row in `--bg` with `--text-muted` uppercase mini-caps. Tabular numerics for all numeric columns.
- **Code blocks**: `--mono-bg` fill, 3px `--brand-green` left-border, copy-on-hover icon in the top-right.
- **Badges**: pill-shaped soft-fill, no shadow. Green for verified / 1P / pass; faint grey for muted; red for fail; amber for unavailable.

## Tone & copy constraints (non-negotiable)

- **Never** use the words *benchmark*, *ranking authority*, *reputation oracle*, *best-in-class*, *10x*, or *AI-powered* anywhere.
- Always describe the probe honestly: HEAD request from one host, three sequential samples, HTTP 4xx/429 treated as alive — this is a liveness check, not a payment-behavior test.
- Never imply TrustBench holds agent funds. Always: agent signs, TrustBench routes, signed receipt is returned.
- Surface "Pay-to-list (refundable bond), never pay-to-rank" on the landing.
- Avoid emojis except inside the existing badge slots (`✅`, `⚠`, `❌`, `🪪`, `🔗`).

## Output

Generate **three layout variations of each of the five pages**, sharing identical color, typography, and component tokens. The comparison should be about composition, hierarchy, and density — not paint. Mobile and desktop variants for each.
