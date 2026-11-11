// ============================================================================
// Minimal .env loader for the server-side code (API middleware, migrations,
// the db:check probe). Vite only exposes VITE_* variables to the browser, so
// nothing here can leak into the client bundle — these values stay in Node.
//
// Search order, first hit wins per key:
//   1. real process env
//   2. <repo root>/.env.local   (written by `neon init` / `neon env pull`)
//   3. <repo root>/.env
//   4. <app dir>/.env.local     (Clerk keys live here)
//   5. <app dir>/.env
// ============================================================================

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const FILES = ['../../.env.local', '../../.env', '../.env.local', '../.env']

let cache

function parse(text) {
  const out = {}
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq < 1) continue
    const key = line.slice(0, eq).trim()
    let value = line.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    out[key] = value
  }
  return out
}

/** All server-side env values, merged with process.env taking precedence. */
export function loadEnv() {
  if (cache) return cache
  const merged = {}
  // Reverse order so earlier files overwrite later ones.
  for (const file of [...FILES].reverse()) {
    let text
    try {
      text = readFileSync(resolve(here, file), 'utf8')
    } catch {
      continue
    }
    Object.assign(merged, parse(text))
  }
  cache = { ...merged, ...process.env }
  return cache
}

/** Read one variable, throwing a clear error when a required key is missing. */
export function requireEnv(key) {
  const value = loadEnv()[key]
  if (!value) throw new Error(`${key} is not set. Run \`neon init\` or add it to .env.local.`)
  return value
}

export function databaseUrl() {
  return requireEnv('DATABASE_URL')
}
