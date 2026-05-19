# [DEPRECATED 2026-05-10] AgentLog — CLAUDE.md (DRAFT)

> **DEPRECATED 2026-05-10.** AgentLog concept was killed 2026-05-07 after `agentlog-competitor-verification-2026-05-07.md` confirmed the lane was already crowded and the AI-as-category trap applied (memory: `feedback_solo_founder_ai_category_velocity.md`). This was the planning-stage CLAUDE.md draft for that concept; it never activated. Kept for reference only.

**Status (historical):** Draft. Was to become the operational `CLAUDE.md` if/when Johan committed to AgentLog. AgentLog killed; this never activated.

**Purpose:** Workflow file for AgentLog. Mirrors TrustBench's `CLAUDE.md` in spirit, but with explicit lessons-learned rules baked in as enforceable workflow constraints. The goal is to never make the same mistakes we made on TrustBench — the failure modes of solo-founder strategy drift, late customer development, and unmonitored competitive landscape are the ones this file is specifically designed to prevent.

---

## Project

AgentLog is a cross-platform AI activity dashboard for end-users. Connects to AI tools and agent platforms via OAuth or credit-card-statement parsing, shows what those tools did this week / month / year — costs, decisions, accomplishments, receipts — in plain language. Free for personal use, paid for businesses.

The honest framing — and what the public site should reflect — is:

- **Today**: A "what did my AI do" tracker, MVP scope (credit card connection + OpenAI + Anthropic activity import). Not a full agent observability platform; not a builder tool; not enterprise audit/compliance tooling. Just an honest dashboard for end-users.
- **Next**: Additional integrations (Cursor, Perplexity, Midjourney, Computer Use, Operator, etc.) added based on customer demand, not aspirational roadmap.
- **Brand position**: *"the boring, honest tracker for your AI activity."* Cross-platform by design. Neutral observatory. Methodology disclosure as discipline.

The full concept lives in `agentlog-concept-2026-05-07.md`. This file is the *how we work* discipline; the concept doc is the *what we're building* statement. Read both.

**If you are picking up AgentLog in a new session, read this file plus `agentlog-concept-2026-05-07.md` plus `competitive-landscape.md` plus the latest entry in `decisions.md`. In that order.**

---

## Stack (proposed, finalize after customer dev)

TypeScript + Next.js (web app and API routes in one) + Supabase (Postgres + Auth + RLS) + Plaid (credit card connection) + Stripe (billing) + Vercel (hosting). Boring. Predictable. Solo-founder friendly.

This stack is chosen because:

- Next.js handles both the React UI and the API routes — one project, one deploy, one mental model.
- Supabase replaces the entire backend stack for a solo founder; auth + database + RLS in one platform.
- Plaid is the standard for credit-card-statement aggregation and has decent free-tier limits.
- Stripe billing is the standard for SaaS subscription billing; the boring choice.
- Vercel auto-deploys from GitHub and is free until volume requires upgrade.

Anything more exotic (custom infra, microservices, GraphQL, serverless functions across multiple providers) is rejected by default. Solo-founder principle: every additional moving part is a future maintenance tax.

---

## Commands (placeholder — finalize when project is initialized)

- Dev: `npm run dev` (Next.js dev server)
- Type check: `tsc --noEmit`
- Lint: `npm run lint`
- Test: `npm test` (Vitest, when there are tests)
- Deploy: automatic on push to main via Vercel

---

## Architecture (placeholder — finalize after wedge build is scoped)

- `src/` — all source code that ships
  - `app/` — Next.js app router pages
  - `lib/` — backend logic (Plaid client, Stripe client, Supabase client, AI provider integrations)
  - `components/` — React components for the dashboard UI
  - `integrations/` — one file per AI provider integration (`openai.ts`, `anthropic.ts`, etc.)
- `supabase/` — schema migrations
- Root files: `package.json`, `tsconfig.json`, `.env.example`, `vercel.json`, this `CLAUDE.md`, `decisions.md`, `competitive-landscape.md`, `lessons.md`, `agentlog-concept-2026-05-07.md`

---

## Rules

### Binding rule (the one that overrides every other rule)

**No architectural commitment, no major engineering work, no public positioning until at least 5 end-users have explicitly committed to paying for a beta at the validated price for the validated wedge features.** This rule is binding through day 30 and is what the day-30 kill check measures. If it conflicts with anything else in this file, it wins.

### Engineering rules

- Maximum automation, zero manual daily work. Always.
- Keep every solution simple and production-ready for one solo founder to maintain.
- Always include clear comments in code.
- Use PowerShell command syntax when giving the user shell commands (Windows host).
- No external paid services or heavy dependencies without explicit approval.
- Honest framing everywhere. The brand depends on it. AgentLog never claims to "show everything your AI did" — only what the integrations expose, with explicit disclosure when something is missing. AgentLog never claims to save users money without showing the math. AgentLog never assesses tool *quality*, only *usage* — quality assessment requires data we don't have.
- Privacy by default. Process locally where possible. Never store more user data than necessary. GDPR-compliance-by-design from day 1. Privacy policy is updated whenever a new data flow is added.

### Anti-Hallucination & Verification Rules (carryover from TrustBench)

These rules saved TrustBench multiple times. They apply here verbatim.

- Always read the current file with the `read_file` tool before proposing any edit or claiming knowledge of its contents.
- When diagnosing a bug or failure, first point at the exact logs, error messages, line numbers, or command output — then propose the fix.
- Never assume a file, function, env var, or behavior exists. Verify with tools or commands.
- For any claim about "current state" or "what the code does," run the relevant command and show the output before moving on.
- If something feels hacky or unclear, pause and ask — do not implement an elegant-sounding but unverified solution.

### Customer-development discipline (NEW vs TrustBench)

This is the rule TrustBench didn't have, and it's the most important addition.

- **Days 1–30 are customer development, not engineering.** No production code is written until at least 5 paying beta commitments are in hand. Prototypes for showing-off-during-conversations are allowed; they're throwaway.
- **Customer-dev conversations are recorded** (with permission) and notes go into a `customer-dev-notes.md` file. The pattern is: date, name, role, key quotes, would-pay-Y/N, would-pay-amount, what-they-said-they-want, what-they-pushed-back-on. Re-readable.
- **The "would you pay $X for this?" question is asked every conversation.** Not as a closer; as a calibration. The answer informs pricing.
- **A specific commitment is asked for at the end of every customer-dev call.** Either: "Would you commit to paying for the beta when it ships?" (yes/no/maybe) or "Would you be willing to introduce me to two other people who'd find this useful?" Always ask for one of the two; document the answer.
- **The day-30 kill criterion is binary**: 5 commitments to pay = pass; 4 or fewer = stop. No "let's give it more time" by default.

### Weekly monitoring tasks (NEW vs TrustBench)

Set a recurring 30-minute Monday-morning task. Two parts:

**Part A — Competitive landscape monitoring.** Update `competitive-landscape.md` with anything material that's shipped or been announced in the last week from:
- LangSmith / LangChain blog and changelog
- PostHog blog and changelog
- Helicone, LangFuse, Promptlayer (smaller competitors — quick scan)
- Rocket Money / Truebill product pages (the most realistic competitive threat)

**Part B — Behemoth roadmap monitoring.** Update `competitive-landscape.md` with anything from:
- OpenAI blog and product launches
- Anthropic blog and product launches
- Google AI blog and Apple Intelligence updates
- Microsoft Copilot announcements

Specifically watch for: any of these companies announcing aggregation across competitors. That's the canary. Probability low but the cost of monitoring is trivial. If it ever happens, AgentLog's structural-conflict moat is gone and the strategy needs immediate rethinking.

### Pricing-before-architecture rule (NEW vs TrustBench)

Any architectural decision that depends on pricing (per-event metering, subscription billing, free-tier limits, integration limits) must reference the validated pricing from customer dev. If the pricing isn't validated yet, the architectural decision is deferred until it is. No "we'll figure out pricing later"; that's how TrustBench ended up with a 1–3% spread baked into a receipt schema that had to be ripped out.

### Solo-founder hour cap (NEW vs TrustBench)

The founder commits to 35 hours/week of focused work on AgentLog as the explicit cap. This is not aspirational — it's the planning constraint. Every proposed work item names the founder hours per week it requires. The total weekly load tracked against the 35-hour cap.

If a new item would push the total over the cap, something existing has to come off — explicitly, with a note in `decisions.md` recording what was deferred and why. No silent absorption of work.

### Kill-criterion check schedule (NEW vs TrustBench)

Three kill checks at day 30, day 60, day 90. Definitions in `agentlog-concept-2026-05-07.md` § 7. The kill checks happen on schedule, regardless of how things feel. They are decisions, not vibes.

- **Day 30:** at least 5 individuals have committed to paying for a beta at validated price + features.
- **Day 60:** of those 5, at least 3 are actively using AgentLog AND have paid the first month's subscription.
- **Day 90:** at least 25 users currently paying $5+/month, with at least one user paying for the $25 or $99 tier.

If a check fails, the project is sunset. The kill is graceful: refund any paying users, open-source whatever's useful, write a "what we learned" post.

### Decision log discipline (NEW vs TrustBench)

`decisions.md` is updated every time a non-trivial decision is made. Format:

```
2026-XX-XX: <one-line decision>. Reason: <one-sentence reason>.
```

Five minutes a week of upkeep. The point isn't completeness; it's the *why* behind decisions being readable when picking up cold.

---

## Workflow

### AI Collaboration (Claude implements; Johan decides)

- **Claude** designs and implements. Reads the concept doc and the customer-dev notes. Writes the diff. Runs `tsc --noEmit` + relevant smoke tests. Self-reviews. Ships.
- **Johan** approves direction before non-trivial work. Owns customer-dev conversations directly (Claude does not impersonate Johan in customer-dev calls). Decides on kill checks. Final call on anything public-facing or partnership-bound.

### Response Structure for Any Non-Trivial Task

Follows the TrustBench discipline that worked:

1. **Plan** — clear, numbered plan before any code or file changes.
2. **Implementation** — exact, minimal diffs with clear comments.
3. **Verification** — run relevant commands, show output, prove correctness.
4. **Next Steps** — what should happen next, open questions, whether the task is shippable.

### Pre-fill style

When a response involves code changes, start with the Plan section already structured so Johan can interrupt or redirect cleanly before any disk writes.

### Lessons Learned Loop

After any correction or user feedback, append to `lessons.md` with the pattern so we never repeat the same mistake. Review relevant lessons at the start of each new session.

### Simplicity First + Minimal Impact

Make every change as simple as possible. Only touch what's necessary. Avoid introducing new complexity or bugs. If a fix feels hacky, pause and implement the elegant, maintainable solution instead.

---

## Phased plan (mirrors `agentlog-concept-2026-05-07.md` § 7)

- **Days 1–10**: Setup + first 10 customer-dev conversations.
- **Days 11–20**: Second 10 customer-dev conversations + synthesize.
- **Day 30**: Kill check 1 (5 paying beta commitments).
- **Days 31–60**: Build the wedge (credit card + OpenAI + Anthropic).
- **Day 60**: Kill check 2 (3 of 5 betas active and paid).
- **Days 61–90**: Public launch + iteration.
- **Day 90**: Kill check 3 (25 paying users).

Each phase is independently shippable in the sense that the next phase isn't started until the previous phase's kill check has passed.

---

## Watchlist of competitors and behemoths (updated weekly)

This list is the input to the weekly monitoring tasks. Maintained alphabetically; details live in `competitive-landscape.md`.

**Direct competitors (currently none, but this is where they'd appear):**
- (open)

**Adjacent products that could pivot in:**
- Helicone
- LangSmith / LangChain
- LangFuse
- PostHog
- Promptlayer
- Rocket Money / Truebill (the most realistic competitive threat)

**Behemoths with structural conflict (low probability of building cross-platform aggregation, but watch for changes):**
- Anthropic (Claude, Computer Use, Operator)
- Apple (Apple Intelligence)
- Google (Gemini, Bard, AI in Workspace)
- Microsoft (Copilot in Microsoft 365)
- OpenAI (ChatGPT, Operator)

**Specific signals to watch for:**
- Any of the behemoths announcing aggregation across competitors (canary signal — moat is gone)
- A well-funded consumer startup launching with AgentLog-shaped product
- Major platform API closures (e.g., OpenAI restricting third-party access)
- New regulatory requirements affecting personal data aggregation (GDPR updates, US state laws)

---

## Out of scope (don't touch without explicit approval)

- Enterprise tier and enterprise sales motion. AgentLog is consumer + SMB. Not enterprise.
- Custody of user funds, payment authorization on behalf of users, agent control. AgentLog is read-only and dashboard-only. We don't authorize, we don't transact, we don't decide.
- Builder/developer-focused features (prompt engineering, evals, framework SDKs). LangSmith / PostHog / Helicone serve that. AgentLog is end-user-facing.
- Vertical-specific products ("AgentLog for legal," etc.) until the horizontal product has demonstrated PMF.
- AI quality assessment or agent reputation systems. We track usage, not quality.
- Cross-user analytics ("see how others use Tool X"). Privacy-incompatible with the brand position.

---

## Solo-Founder Principles (carryover from TrustBench)

- Everything must be maintainable by one person with zero manual daily work.
- Prefer zero-cost MVP choices.
- Revenue must come from simple subscriptions — never complex enterprise sales motions.
- Keep the public dashboard useful and honest while integrations grow. The free tier is the front door until the paid tiers earn the spotlight.
- The 35-hour/week cap is real, not aspirational. Plan against it.
- Kill criteria are real, not aspirational. Honor them on schedule.

---

## What this file is not

- Not a product roadmap. The roadmap lives in `agentlog-concept-2026-05-07.md`. This file is the *how we work* document.
- Not a marketing document. The brand voice is honest and slightly boring. The marketing happens elsewhere (or doesn't, if the product doesn't pull).
- Not a hedge against TrustBench failure. AgentLog is a separate decision; if Johan commits to AgentLog, TrustBench is sunset cleanly per the concept doc § 8.

---

## Closing note from Claude (the model writing this file)

The single most important rule in this file is the binding rule at the top of § "Rules." Everything else is supporting infrastructure. The reason TrustBench drifted is that the equivalent rule didn't exist — we shipped a Phase 1, Phase 2, Phase 3, and Phase 4 worth of engineering before checking whether anyone would pay. AgentLog cannot make that same mistake.

If at any point during the first 30 days a Plan section in a Claude response says "let's start building the integration" before the binding rule has been satisfied, the rule has been violated and the response should be stopped. Any future Claude session that picks up AgentLog and finds itself wanting to build before the day-30 kill check has passed should re-read this file and adjust.

The goal is a real product with real paying customers, not an elegant codebase with no users. That's what TrustBench taught us.
