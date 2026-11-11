// ============================================================================
// Client for /api/journal.
//
// The journal still writes localStorage first (instant, works offline), then
// mirrors the change to Postgres in the background. Writes are diffed against
// what was last accepted by the server, so editing one trade sends one row
// instead of the whole journal.
//
// When the API says 401 (not signed in, or Clerk not configured) every call
// quietly returns false and the app behaves exactly as it did before: local
// only. Nothing here ever throws into the UI.
// ============================================================================

// Relative in the browser (same origin). The Node integration test sets
// globalThis.__JOURNAL_API_ORIGIN__ to hit a running dev server.
const BASE = `${globalThis.__JOURNAL_API_ORIGIN__ || ''}/api/journal`
const SETTINGS_DEBOUNCE_MS = 500

// The token source is injected by app.js (auth.js owns Clerk), which keeps
// this module free of browser-only imports and testable in Node.
let tokenGetter = async () => ''

export function setTokenGetter(fn) {
  tokenGetter = fn
}

/** trade id -> JSON exactly as the server last accepted it. */
const lastSynced = new Map()

let pendingSettings = null
let settingsTimer = 0
let lastError = ''

export const journalStatus = () => ({ synced: lastSynced.size, error: lastError })

async function headers(withBody) {
  let token = ''
  try {
    token = (await tokenGetter()) || ''
  } catch {
    token = ''
  }
  return {
    ...(withBody ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

async function call(path, options = {}) {
  let response
  try {
    response = await fetch(BASE + path, { ...options, headers: await headers(Boolean(options.body)) })
  } catch {
    lastError = 'Network unavailable'
    return null
  }
  if (response.status === 401) {
    lastError = ''
    return null
  }
  if (!response.ok) {
    const detail = await response.json().catch(() => null)
    lastError = detail?.error || `Sync failed (${response.status})`
    return null
  }
  lastError = ''
  return response.json()
}

/** Full journal for the signed-in user, or null when sync is unavailable. */
export async function pull() {
  const data = await call('')
  return data?.ok ? data : null
}

/**
 * Tell the client that the given trades are already on the server, so the next
 * diff only sends real changes. Used after adopting a server snapshot.
 */
export function prime(trades) {
  lastSynced.clear()
  for (const trade of trades) lastSynced.set(trade.id, JSON.stringify(trade))
}

/**
 * Push the difference between `trades` and the last accepted snapshot.
 * @param {Array<object>} trades
 */
export async function pushTrades(trades) {
  const upserts = []
  const deletes = []
  const seen = new Set()

  for (const trade of trades) {
    if (!trade || typeof trade.id !== 'string') continue
    seen.add(trade.id)
    const json = JSON.stringify(trade)
    if (lastSynced.get(trade.id) !== json) upserts.push({ trade, json })
  }
  for (const id of lastSynced.keys()) {
    if (!seen.has(id)) deletes.push(id)
  }
  if (!upserts.length && !deletes.length) return true

  const result = await call('/sync', {
    method: 'POST',
    body: JSON.stringify({ upserts: upserts.map((entry) => entry.trade), deletes }),
  })
  if (!result?.ok) return false

  for (const entry of upserts) lastSynced.set(entry.trade.id, entry.json)
  for (const id of deletes) lastSynced.delete(id)
  return true
}

async function flushSettings() {
  settingsTimer = 0
  const payload = pendingSettings
  pendingSettings = null
  if (!payload) return
  await call('/settings', { method: 'POST', body: JSON.stringify(payload) })
}

/**
 * Queue a settings write. Instrument/session edits fire on every keystroke, so
 * calls are coalesced into one request.
 */
export function queueSettings(payload) {
  pendingSettings = { ...(pendingSettings || {}), ...payload }
  if (settingsTimer) clearTimeout(settingsTimer)
  settingsTimer = setTimeout(flushSettings, SETTINGS_DEBOUNCE_MS)
}

/** Send everything, bypassing the debounce. */
export async function flushNow() {
  if (settingsTimer) clearTimeout(settingsTimer)
  await flushSettings()
}
