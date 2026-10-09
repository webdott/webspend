# WebSpend

A personal spending tracker that logs transactions by reading bank alert emails as they arrive.
One server does the work; a Mac app, an iPhone app and a web dashboard are clients of its API.

## Layout

```
server/   API, email intake, alert parsers, rules, database (TypeScript, Node 22+)
shared/   API contract (api.ts), zod schemas, money helpers, design tokens, sample alerts, brand
web/      dashboard (Vite + React)
apple/    WebSpendKit Swift package, Mac app and iPhone app (SwiftUI)
landing/  public landing page (static)
```

The server and web app share the TypeScript types in `shared/`. The Swift models in
`apple/WebSpendKit` mirror them. The sample alerts in `shared/sample-alerts` are the parser tests,
with personal details removed. Never commit a real alert.

## Running it

Requires Node 22.18 or newer (runs TypeScript directly) and pnpm. No database install: the
server uses an embedded Postgres (PGlite) under `server/data/` unless `DATABASE_URL` points at a
real one.

```bash
pnpm install
pnpm seed        # demo user and October 2026 data from the sample alerts
pnpm dev         # API on http://localhost:8787 (dev sign-in on unless NODE_ENV=production)
pnpm web         # dashboard on http://localhost:5173, proxied to the API
pnpm test        # parsers, ledger rules, import, API, money helpers
pnpm typecheck
```

Sign in on the dashboard with the developer sign-in and the email the seed printed. For the real
thing, set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `server/.env` (see
`server/.env.example`) and sign in with Google; the inbox you sign in with is the one that is read.

The Mac and iPhone apps open from `apple/WebSpend.xcodeproj`; see `apple/README.md`.
The landing page is `landing/index.html`; see `landing/README.md`.

## How tracking works

Money is logged only when it crosses the edge of the accounts that belong to the user. Movement
inside that edge is a transfer to self and stays out of the totals. Each bank has a
"tracking from" time set when it is switched on; emails before it are never read. Every alert
carries the balance after the transaction, so a missed one shows up as a gap to fill by importing
a statement. Small unexplained drops are logged as fees. See `server/README.md` for the rules.

## Adding a bank

Add a parser in `server/src/alerts/`, register its sender address in `server/src/alerts/index.ts`,
and add sample alerts to `shared/sample-alerts`. Each sample pins one layout, so a bank changing
its email fails a test here instead of transactions going missing.
