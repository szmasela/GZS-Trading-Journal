// ============================================================================
// Postgres access over Neon's SQL-over-HTTP endpoint.
//
// No driver, no connection pool, no native module: the connection string is
// sent as a header and Postgres runs the query on the far side. That keeps the
// dependency list at zero and means the same code works in the Vite dev
// middleware, `vite preview` and a serverless function.
//
// Limits worth knowing: one statement per request (multi-statement strings are
// rejected with 42601) and each request is its own transaction, so write
// sequences are ordered but not atomic. Every write here is an idempotent
// upsert, so a retry after a partial failure converges on the same rows.
// ============================================================================

import { databaseUrl } from './env.mjs'

let endpoint
let connection

function target() {
  if (!endpoint) {
    const url = new URL(databaseUrl())
    endpoint = `https://${url.hostname}/sql`
    connection = url.toString()
  }
  return { endpoint, connection }
}

/**
 * Run one statement. Returns the result rows.
 * @param {string} text SQL with $1..$n placeholders
 * @param {unknown[]} params
 */
export async function query(text, params = []) {
  const { endpoint: url, connection: conn } = target()
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Neon-Connection-String': conn,
    },
    body: JSON.stringify({ query: text, params }),
  })

  if (!response.ok) {
    const detail = await response.json().catch(() => null)
    const error = new Error(detail?.message || `Database request failed (HTTP ${response.status})`)
    error.code = detail?.code
    error.status = response.status
    throw error
  }

  const body = await response.json()
  return body.rows ?? []
}

/** Run one statement and return its first row (or null). */
export async function queryOne(text, params = []) {
  const rows = await query(text, params)
  return rows[0] ?? null
}

/** Run several statements in order. */
export async function queryAll(statements) {
  const results = []
  for (const [text, params] of statements) {
    results.push(await query(text, params ?? []))
  }
  return results
}
