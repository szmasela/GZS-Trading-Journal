# Trade Journal

Local-first trading journal. Same workspace as before — dashboard, calendar, journal, reports, playbook, balance adjuster, and settings — restyled to the LuxAlgo dark trading-terminal look.

Data stays in this browser (`localStorage`). Import/export JSON to move it between devices. When the dev or preview server is running, JSON backups are written to `public/backups/`, and the import picker lists them first.

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
