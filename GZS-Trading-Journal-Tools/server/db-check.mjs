// ============================================================================
// Verify the Neon connection without a Postgres driver.
//
// `neon init` writes DATABASE_URL into .env.local at the repo root (one level
// above this app). Those are SERVER-ONLY secrets: never prefix them with
// VITE_, or Vite will inline them into the browser bundle.
//
// This script reads the URL, calls Neon's SQL-over-HTTP endpoint and prints
// what came back. It never prints the connection string itself.
//
//   npm run db:check
// ============================================================================

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

function readDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL

  // Repo root first (where `neon init` writes), then this app's own folder.
  for (const name of ['../../.env.local', '../../.env', '../.env.local', '../.env']) {
    let text
    try {
      text = readFileSync(resolve(here, name), 'utf8')
    } catch {
      continue
    }
    // Only the exact key, so DATABASE_URL_UNPOOLED is not picked up by mistake.
    const line = text.split(/\r?\n/).find((row) => row.trim().startsWith('DATABASE_URL='))
    if (line) return line.slice(line.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')
  }

  throw new Error('DATABASE_URL is not set. Run `neon init` or add it to .env.local.')
}

const raw = readDatabaseUrl()
const target = new URL(raw)
const endpoint = `https://${target.hostname}/sql`

const response = await fetch(endpoint, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Neon-Connection-String': raw,
  },
  body: JSON.stringify({
    query: `
      select current_database() as database,
             split_part(version(), ' ', 1) || ' ' || split_part(version(), ' ', 2) as engine,
             (select count(*) from information_schema.tables
               where table_schema not in ('pg_catalog', 'information_schema')) as tables,
             (select count(*) from pg_class where relkind = 'r') as relations
    `,
    params: [],
  }),
})

if (!response.ok) {
  const detail = await response.text().catch(() => '')
  console.error(`Connection failed: HTTP ${response.status}`)
  if (detail) console.error(detail.slice(0, 400))
  process.exit(1)
}

const result = await response.json()
const [row] = result.rows ?? []
console.log('Neon connection OK')
console.log(`  database   ${row.database}`)
console.log(`  engine     ${row.engine}`)
console.log(`  tables     ${row.tables}`)
console.log(`  relations  ${row.relations}`)
