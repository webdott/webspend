# WebSpend server

The API, email intake, alert parsers, rules and database. The web, Mac and iPhone apps are
clients of this one server. The contract they share is `shared/src/api.ts`.

## Run

Needs Node 22.18 or newer (it runs the TypeScript directly) and pnpm.

```bash
pnpm install                # from the repo root
cd server
cp .env.example .env        # optional; the defaults work for local development
pnpm seed                   # demo user dev@webspend.local with October 2026 data
pnpm dev                    # http://localhost:8787, restarts on change
pnpm test                   # node --test, in-memory database, no network
pnpm typecheck
```

Sign in without Google while developing:

```bash
curl -s -X POST localhost:8787/auth/dev -H 'content-type: application/json' \
  -d '{"email":"dev@webspend.local"}'
# → { "token": "...", "user": {...} }; also sets the ws_session cookie
curl -s 'localhost:8787/api/summary?month=2026-10' -H 'authorization: Bearer <token>'
```

## Environment

All variables are optional for local use. See `.env.example` for the full list with comments.

| Variable                                   | Default                         | Meaning                                                               |
| ------------------------------------------ | ------------------------------- | --------------------------------------------------------------------- |
| `PORT`                                     | `8787`                          | Listen port.                                                          |
| `DATABASE_URL`                             | unset                           | Postgres URL. Unset means embedded PGlite.                            |
| `PGLITE_DIR`                               | `data/webspend`                 | PGlite directory, relative to `server/`.                              |
| `PUBLIC_URL`                               | `http://localhost:8787`         | Where Google redirects back to; also sets the cookie's `Secure` flag. |
| `WEB_ORIGIN`                               | `http://localhost:5173`         | CORS origin allowed with credentials.                                 |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | unset                           | Enables Google sign-in and the Gmail poller.                          |
| `DEV_AUTH`                                 | on unless `NODE_ENV=production` | `1` enables `POST /auth/dev`.                                         |
| `INTAKE_SECRET`                            | unset                           | Enables `POST /api/intake/email` (header `X-Intake-Secret`).          |
| `POLL_INTERVAL_SECONDS`                    | `60`                            | Gmail poll interval.                                                  |
| `RATE_SOURCE`                              | `open-er-api`                   | `open-er-api` (no key) or `fixed`.                                    |
| `FIXED_RATES`                              | unset                           | `NGN:1500,GBP:0.78,EUR:0.92`, units per US dollar, for `fixed`.       |

With `NODE_ENV=production` the server also serves `../web/dist` with an SPA fallback when it exists.

## Layout

```
src/
  main.ts          starts db, app, poller (if Google is configured) and the daily rate job
  config.ts        environment → Config, loads server/.env
  api/             Hono app, routes, error mapping
  auth/            sessions (hashed tokens), Google OAuth, dev sign-in
  alerts/          one parser per bank; parseAlert(email) → ParsedAlert or a reason
  intake/          pipeline (email → raw_alerts row → transaction), Gmail client, poller, html→text
  ledger/          repositories (accounts, categories, transactions, payees, users),
                   recordTransaction and the rules under ledger/rules/
  import/          CSV and JSON reading, mapping suggestion, date parsing, commit
  rates/           rate sources and the fx_rates store
  db/              PGlite or Postgres behind one interface, migrations/
  dev/seed.ts      demo data
```

## How intake works

1. The poller (or a relay posting to `/api/intake/email`) hands the pipeline one email: id, sender,
   subject, text, received time and whether it passed SPF and DKIM.
2. `processAlertEmail` writes a `raw_alerts` row for every email, whatever happens next. The status
   says why nothing was logged: `duplicate` (message id already seen), `failed_authentication`,
   `unknown_sender`, `not_a_transaction`, `unrecognised_layout` (a bank changed its layout: the
   text is kept so the parser can be fixed and re-run), or `before_tracking_from`.
3. `parseAlert` picks the parser by sender address and returns amount, time, account, balance
   after, counterparty, description and reference.
4. The alert is logged under a tracked account at that bank: the one whose number matches the
   alert's (masked suffixes are fine), else the first. Alerts older than its `tracking_from`
   are ignored; the past is never read.
5. `recordTransaction` inserts the row with the day's exchange rate and applies the rules:
   - remembered category for the payee;
   - transfer to self: own account number named in the alert, same bank reference on both legs,
     equal and opposite amount within 15 minutes, or Grey dollars arriving as naira within a day
     (the shortfall against the official rate is logged as "Exchange loss & fees").

Transfers to self never count in totals. Imports and manual entries go through the same
`recordTransaction`, so the same pairing applies to them (manual entries keep the type the user
chose).

## Adding a bank

1. Save a few real alerts with names, numbers and amounts replaced under `shared/sample-alerts/`.
2. Write `src/alerts/<bank>.ts` returning a `ParsedAlert`, following `opay.ts`. Use `capture` so a
   missing field becomes an `unrecognised_layout` result rather than a crash.
3. Register the sender address in `PARSER_BY_SENDER` in `src/alerts/index.ts`. The poller watches
   that list, so no other change is needed for intake.
4. Add the samples to `src/alerts/alerts.test.ts`.
5. If the bank is new to the product, add it to `Bank` in `shared/src/api.ts` and to the default
   accounts in `src/ledger/users.ts`.
