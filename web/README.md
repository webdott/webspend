# WebSpend web dashboard

The browser client for WebSpend: Vite, React 19, TypeScript, `react-router-dom` v7 and
`@tanstack/react-query`. Plain CSS with the tokens from `shared/DESIGN.md` as custom properties
on `:root` (light), with dark values under `prefers-color-scheme` and `[data-theme="dark"]`.

Every route, query parameter and response shape comes from `shared/src/api.ts`, imported as
`@webspend/shared`. The client never invents fields.

## Run against the mock

```bash
pnpm install                       # at the repo root
VITE_MOCK=1 pnpm --filter web dev  # http://localhost:5173
```

`VITE_MOCK=1` makes `src/api/client.ts` route every request to `src/api/mock.ts`, an in-memory
fake that honours the contract's filters (`month`, `q`, `categoryId`, `type`, `before`...),
computes the summary from the transactions it holds, and keeps edits until the page reloads.
The fixtures make the current month look like the approved mockup. The mock starts signed in;
"Sign out" takes you to the sign-in screen, where the developer sign-in works.

## Run against the server

```bash
pnpm --filter server dev   # API on http://localhost:8787
pnpm --filter web dev      # Vite proxies /api and /auth to 8787
```

Cookies stay same-origin because Vite proxies `/api` and `/auth` (see `vite.config.ts`).
For a production build that is served from a different origin than the API, set
`VITE_API_URL=https://api.example.com` at build time; the client then prefixes every request
with it and still sends `credentials: 'include'`.

## Scripts

| command                       | what it does                            |
| ----------------------------- | --------------------------------------- |
| `pnpm --filter web dev`       | dev server on port 5173                 |
| `pnpm --filter web build`     | `tsc -b && vite build` into `web/dist`  |
| `pnpm --filter web typecheck` | `tsc -b`                                |
| `pnpm --filter web test`      | vitest: day grouping and import helpers |

## Layout

```
src/
  api/client.ts        typed fetch wrapper; ApiError carries the server's code and message
  api/mock.ts          the VITE_MOCK=1 fake
  api/hooks.ts         react-query hooks and cache keys
  lib/dates.ts         month maths, Today / Yesterday / "Mon 6 Oct" grouping
  lib/importMapping.ts CSV reader, column-to-field guessing, mapping validation
  components/          Shell (header + bottom tab bar), shared UI bits
  pages/               SignIn, Summary, Transactions, TransactionDetail, Categories,
                       Import, Accounts, Settings
  styles.css           design tokens and all component styles
public/logo.svg        placeholder logo (replace with shared/brand/logo.svg when it exists)
```

Below 720px the header's section links give way to a bottom tab bar (Summary, Activity,
Accounts, Settings); Categories and Import are reachable from Settings and Accounts.
