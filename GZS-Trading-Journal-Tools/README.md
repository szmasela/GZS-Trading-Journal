# Trade Journal

Local-first trading journal. Same workspace as before — dashboard, calendar, journal, reports, playbook, balance adjuster, and settings — restyled to the LuxAlgo dark trading-terminal look.

Data is written to this browser (`localStorage`) first, then mirrored to Postgres in the background. Import/export JSON to move it between devices. When the dev or preview server is running, JSON backups are written to `public/backups/`, and the import picker lists them first.

The dashboard opens with the Overview layout by default. Dashboard customizations are saved in the browser and are retained when the defaults change.

```bash
npm run dev
```

## Neon Postgres

The project is linked to Neon (`wispy-unit-30772770`, branch `production`). `neon init` wrote the connection strings to `.env.local` in the **repo root**, one level above this app — git-ignored, never committed.

Two rules keep the credentials safe:

- **No `VITE_` prefix.** Vite inlines every `VITE_*` variable into the client bundle, so `DATABASE_URL` stays unprefixed and unprefixed variables are only readable by server-side code.
- **The browser never sees them.** Queries go through an API route that runs on the server; the SPA keeps talking to that route, not to Postgres directly.

Check the connection (no driver needed — it uses Neon's SQL-over-HTTP endpoint and prints no secrets):

```bash
npm run db:check
```

### Schema

```bash
npm run db:migrate
```

Applies `db/schema.sql` — seven tables (`app_users`, `instruments`, `sessions`, `trades`, `trade_snapshots`, `balance_adjustments`, `app_settings`). Every statement is `if not exists`, so it is safe to re-run. Statements are separated by a `statement-breakpoint` marker because Neon's HTTP endpoint runs one command per request.

Chart snapshots live in `trade_snapshots`, not on the trade row: a 32 KB JPEG data URL per side would bloat every list query and every backup. That table is also the single place to swap in object storage later.

### API

| Route | Purpose |
| --- | --- |
| `GET /api/journal` | Everything for the signed-in user: trades (with snapshots), instruments, sessions, balance, dashboard layout |
| `POST /api/journal/sync` | `{ upserts: [trade], deletes: [id] }` |
| `POST /api/journal/settings` | `{ instruments, sessions, balanceBase, balanceAdjustments, dashboardLayout }` — only the keys present are replaced |
| `GET /api/journal/health` | Row counts for the signed-in user |

The routes are a Vite plugin (`server/journal.mjs`), so they run in `vite dev` and `vite preview` with no extra process. Requests carry `Authorization: Bearer <clerk session token>`; `server/clerk.mjs` verifies the RS256 signature against the instance JWKS and uses `sub` as `user_id`. A request without a valid token gets `401` and the client quietly stays local — the journal never stops working because sync is unavailable.

For local testing without a Clerk session, start the dev server with `JOURNAL_DEV_USER=someone npm run dev`. Unsigned requests then act as that user. It is ignored when `NODE_ENV=production`.

### How sync behaves

- Writes go to `localStorage` first, so the UI never waits on the network.
- `src/journalApi.js` diffs trades against the last accepted snapshot and sends only changed rows and deletions.
- On boot the server's journal is adopted and cached locally. A non-empty local journal is never wiped by an empty server response, and the first sync for a new user uploads whatever is already in the browser.
- Deletions propagate from the device that made them. There are no tombstones yet, so a device holding a stale cached copy can re-upload a deleted trade.
