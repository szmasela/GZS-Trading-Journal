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
| `GET /api/journal` | Everything for the signed-in user: trades (with snapshots), instruments, sessions, balance, dashboard layout. Add `?photos=0` to leave the snapshots out |
| `GET /api/journal/photos` | `?cursor=<n>&limit=<n>` — chart snapshots a page at a time |
| `POST /api/journal/sync` | `{ upserts: [trade], deletes: [id] }` |
| `POST /api/journal/settings` | `{ instruments, sessions, balanceBase, balanceAdjustments, dashboardLayout }` — only the keys present are replaced |
| `GET /api/journal/health` | Row counts for the signed-in user |

There is one implementation of these routes, in `server/journal.mjs`, and two ways to reach it: a Vite plugin for `vite dev` / `vite preview`, and the files in `api/journal/` for Vercel. Both call `handleJournalRequest`, so a bug is fixed once. Requests carry `Authorization: Bearer <clerk session token>`; `server/clerk.mjs` verifies the RS256 signature against the instance JWKS and uses `sub` as `user_id`. A request without a valid token gets `401` and the client quietly stays local — the journal never stops working because sync is unavailable.

For local testing without a Clerk session, start the dev server with `JOURNAL_DEV_USER=someone npm run dev`. Unsigned requests then act as that user. It is ignored when `NODE_ENV=production`.

### Deploying to Vercel

The functions in `api/journal/` are picked up automatically — no `vercel.json` and no build step for them. Three things have to be true:

- **Root Directory is this folder** (`GZS-Trading-Journal-Tools`), not the repo root. Vercel only scans `api/` inside the configured root, and this is also where `package.json` and `vite.config.js` live. Output directory `dist`, framework preset Vite.
- **Two environment variables** are set for Production *and* Preview: `DATABASE_URL` (the Neon pooled connection string, no `VITE_` prefix) and `VITE_CLERK_PUBLISHABLE_KEY`. The server needs the publishable key too — it decodes it to find the Clerk instance domain for JWKS, which is why a deploy with only the database URL answers `401` to every request.
- **`JOURNAL_DEV_USER` is not set there.** It is ignored in production anyway; this is just to avoid confusion when `db:check` works locally and the API doesn't.

Check a deployment with `GET https://<domain>/api/journal/health` while signed in. `{"ok":true,...}` means function, credentials and auth are all fine; `401` means the token or Clerk key; a 500 naming the database means `DATABASE_URL`.

**Body and response limits.** Vercel caps a function's request and response at 4.5 MB. Chart snapshots are base64 JPEGs (~60–110 KB each), so both directions are chunked rather than sent whole:

- Writes go out in batches of at most 25 trades / 2.5 MB (`pushTrades`). A failed batch stops the run and leaves the rest dirty for the next attempt.
- Reads fetch trade metadata first (`?photos=0`), then walk `/api/journal/photos` twelve trades at a time. Photos are cosmetic here: if that walk fails, the journal still opens without them.

Writes are also parallelised eight at a time on the server. Each statement is still its own round trip to Neon, so a 25-trade batch is ~75 requests; serialised that was seconds of wall clock, overlapped it is well under a second.

### How sync behaves

- Writes go to `localStorage` first, so the UI never waits on the network.
- `src/journalApi.js` diffs trades against the last accepted snapshot and sends only changed rows and deletions.
- On boot the server's journal is adopted and cached locally. A non-empty local journal is never wiped by an empty server response, and the first sync for a new user uploads whatever is already in the browser.
- Deleting a trade writes a **tombstone** (`trades.deleted_at`) instead of removing the row. `GET /api/journal` returns those ids in `deleted`, and the client drops them from its cache, so a device that still holds an old copy cannot resurrect the trade. Tombstoned rows are purged after 30 days — by the API at most hourly, or on demand with `npm run db:purge` (pass a number of days to change the window).

Soft delete keeps the trade's snapshots until the purge, so a tombstone still occupies its photo bytes for up to 30 days. That is the cost of being able to tell "deleted" from "missing".

