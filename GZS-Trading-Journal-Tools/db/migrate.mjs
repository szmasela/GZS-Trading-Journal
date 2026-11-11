// ============================================================================
// Applies db/schema.sql to the linked Neon database.
//
//   npm run db:migrate
//
// Statements are split on `--> statement-breakpoint` because Neon's
// SQL-over-HTTP endpoint runs exactly one command per request. Every
// statement is `create ... if not exists`, so re-running is safe.
// ============================================================================

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { query } from '../server/db.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(resolve(here, 'schema.sql'), 'utf8')

const statements = source
  .split('--> statement-breakpoint')
  .map((chunk) =>
    chunk
      .split(/\r?\n/)
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n')
      .trim(),
  )
  .filter(Boolean)

let applied = 0
for (const statement of statements) {
  const label = statement.split(/\s+/).slice(0, 4).join(' ')
  try {
    await query(statement)
    applied += 1
    console.log(`  ok   ${label}…`)
  } catch (error) {
    console.error(`  FAIL ${label}…`)
    console.error(`       ${error.message}`)
    process.exit(1)
  }
}

const tables = await query(
  `select table_name
     from information_schema.tables
    where table_schema = 'public'
    order by table_name`,
)

console.log(`\nApplied ${applied}/${statements.length} statements.`)
console.log(`Public tables (${tables.length}): ${tables.map((row) => row.table_name).join(', ')}`)
