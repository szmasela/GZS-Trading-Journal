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

// Hosts cap request bodies (Vercel rejects anything over 4.5 MB before the
// function even runs), and a trade with two chart snapshots is roughly 90 KB.
// A first upload of a few hundred trades would otherwise fail as one big POST,
// so changes go out in batches that stay comfortably under the limit. A batch
// that fails stops the run: the unsent ones stay in `lastSynced` as dirty and
// the next push retries them.
const MAX_BATCH_BYTES = 2.5 * 1024 * 1024
const MAX_BATCH_TRADES = 25

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
  // Trade metadata first. The snapshots are fetched separately, in pages, so
  // a journal whose photos add up to more than a host's response limit still
  // loads completely instead of failing as one oversized response.
  const data = await call('?photos=0')
  if (!data?.ok) return null
  await attachPhotos(Array.isArray(data.trades) ? data.trades : [])
  return data
}

const PHOTO_PAGE_SIZE = 12
const MAX_PHOTO_PAGES = 500

/**
 * Fill in `entryPhoto`/`exitPhoto` on the trades in place. A failure here is
 * not fatal: the journal still opens, just without the pictures, and the next
 * boot tries again.
 */
async function attachPhotos(trades) {
  if (!trades.length) return
  const byId = new Map(trades.map((trade) => [trade.id, trade]))
  let cursor = 0
  for (let page = 0; page < MAX_PHOTO_PAGES; page += 1) {
    const result = await call(`/photos?cursor=${cursor}&limit=${PHOTO_PAGE_SIZE}`)
    if (!result?.ok) return
    for (const photo of result.photos || []) {
      const trade = byId.get(photo.id)
      if (!trade) continue
      if (photo.kind === 'entry') trade.entryPhoto = photo.dataUrl
      if (photo.kind === 'exit') trade.exitPhoto = photo.dataUrl
    }
    if (result.nextCursor === null || result.nextCursor === undefined) return
    cursor = result.nextCursor
  }
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

  // Pack changes into requests. Snapshots are base64 in the JSON, so the
  // string length is a good proxy for the bytes on the wire.
  const batches = []
  let batch = []
  let bytes = 0
  for (const entry of upserts) {
    const size = entry.json.length + 1
    if (batch.length && (batch.length >= MAX_BATCH_TRADES || bytes + size > MAX_BATCH_BYTES)) {
      batches.push(batch)
      batch = []
      bytes = 0
    }
    batch.push(entry)
    bytes += size
  }
  if (batch.length) batches.push(batch)
  if (!batches.length) batches.push([]) // deletions only

  for (const [index, group] of batches.entries()) {
    const result = await call('/sync', {
      method: 'POST',
      body: JSON.stringify({
        upserts: group.map((entry) => entry.trade),
        // Deletions ride along with the first batch; they are a few bytes each.
        deletes: index === 0 ? deletes : [],
      }),
    })
    // Stop at the first failure rather than hammering a server that is down or
    // a payload it will not take. Whatever did land is recorded below, so the
    // retry only re-sends the rest.
    if (!result?.ok) return false

    for (const entry of group) lastSynced.set(entry.trade.id, entry.json)
    if (index === 0) for (const id of deletes) lastSynced.delete(id)
  }

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
