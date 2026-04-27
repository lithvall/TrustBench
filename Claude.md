\## Project

TrustBench is the neutral, signed reputation \& benchmark layer for x402 and p402 providers that is evolving into a non-custodial smart router + payment plumbing layer for agents and agent builders.



\## Stack  

TypeScript + Hono (API) + Supabase (Postgres + RLS) + ioredis (Upstash Redis cache) + tsx runtime. Deployed on Railway. GitHub Actions for nightly pipeline and autonomous X posting.



\## Commands

\- Dev: `npm run dev`

\- Pipeline (probe + score): `npm run pipeline`

\- Start (for Railway): `npm start` (uses tsx src/index.ts)

\- Test single: `npx tsx src/prober.ts` or `npx tsx src/crawler.ts`

\- Lint: `npm run lint` (if added later)

\- Type check: `tsc --noEmit`



\## Architecture

\- src/ → all source code (index.ts = Hono server + routes, prober.ts = real probing + scoring, crawler.ts = CDP auto-discovery + fallback seeding, scorer.ts = rankings + Redis cache + signing, types.ts)

\- .github/workflows/ → GitHub Actions (nightly-pipeline.yml, post-to-x.yml)

\- scripts/ → post-to-x.js (dynamic daily X posts)

\- root files → package.json, tsconfig.json, .env.example, schema.sql, railway.json, Dockerfile, README.md



\## Rules

\- Maximum automation and zero manual work at all times

\- Keep every solution simple and production-ready for one solo founder to maintain

\- Always include clear comments in code

\- Use PowerShell commands for Windows users

\- Never add external paid services or complex dependencies without explicit approval

\- IMPORTANT: Never assume or add real payment custody — always stay non-custodial (agent signs the transaction)



\## Workflow

\- Approach every task with the solo-founder lens: "How do we keep this 100% automated and simple?"

\- Use conventional commits (feat:, fix:, chore:)

\- Always test locally with `npm run pipeline` and check live analytics after every push

\- When in doubt, ask before implementing large changes

\- Prefer small, shippable PRs over big refactors



\## Out of scope

\- Do not touch .env or any secret files

\- Do not modify Railway dashboard settings

\- Do not add full accounting UI or complex frontend yet

\- Do not implement on-chain anchoring or EIP-712 until we explicitly decide to



\## Payment Router Evolution (added for alignment)

We are evolving from pure benchmark/registry into a non-custodial smart router:

\- Phase 1 (done): Reputation layer + signed scorecards + live analytics

\- Phase 2: Minimal non-custodial /route endpoint (agent authorizes payment, we construct tx, agent signs, we route + return signed receipt)

\- Phase 3: Policy firewall + p402/Canton support + 1-3% routing spread revenue

Stay extremely simple and automated.



\## Solo-Founder Principles (added for alignment)

\- Everything must be maintainable by one person with zero manual daily work

\- Prefer zero-cost MVP choices (3-region probing, Redis cache, GitHub cron)

\- Revenue must come from usage-based micropayments or simple subscriptions, never complex enterprise sales

\- Always keep the public registry/dashboard useful even while building the router

