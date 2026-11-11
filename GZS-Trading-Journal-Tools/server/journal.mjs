// ============================================================================
// /api/journal — the journal's server side.
//
//   GET  /api/journal            full state for the signed-in user
//   GET  /api/journal/health     connectivity + row counts
//   POST /api/journal/sync       { upserts: [trade], deletes: [id] }
//   POST /api/journal/settings   { instruments, sessions, balanceBase, ... }
//
// Auth: `Authorization: Bearer <clerk session token>`. The token is verified
// server-side and its `sub` becomes user_id; every query is scoped to it.
// Without a valid token the request is rejected with 401, and the client
// falls back to localStorage — the journal keeps working, just unsynced.
//
// Escape hatch for local testing only: set JOURNAL_DEV_USER=<any id> in the
// environment and unsigned requests act as that user. It is ignored when
// NODE_ENV=production.
// ============================================================================

import { loadEnv } from './env.mjs'
import { query, queryOne } from './db.mjs'
import { verifySessionToken } from './clerk.mjs'

const MAX_BODY_BYTES = 32 * 1024 * 1024

function send(res, status, payload) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  })
  res.end(JSON.stringify(payload))
}

function readJson(req) {
  // Some hosts (and the Node integration tests) hand over a body that has
  // already been consumed and parsed. Use it rather than waiting on a stream
  // that will never emit another chunk.
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    return Promise.resolve(req.body)
  }
  if (typeof req.body === 'string') {
    try {
      return Promise.resolve(req.body ? JSON.parse(req.body) : {})
    } catch {
      return Promise.reject(Object.assign(new Error('Invalid JSON body'), { status: 400 }))
    }
  }
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error('Payload too large'), { status: 413 }))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (!chunks.length) return resolve({})
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch {
        reject(Object.assign(new Error('Invalid JSON body'), { status: 400 }))
      }
    })
    req.on('error', reject)
  })
}

let warnedBadToken = false

async function identify(req) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
  if (token) {
    const session = await verifySessionToken(token)
    if (!session && !warnedBadToken) {
      // A present-but-unverifiable token means the app will silently stay
      // local. Say so once, so a misconfigured Clerk key is not invisible.
      warnedBadToken = true
      console.warn('[journal] session token rejected — check VITE_CLERK_PUBLISHABLE_KEY and that the session is fresh')
    }
    return session
  }
  const devUser = loadEnv().JOURNAL_DEV_USER
  if (devUser && process.env.NODE_ENV !== 'production') return { userId: devUser, sessionId: '' }
  return null
}

// ---------------------------------------------------------------- mapping --

/**
 * Run `worker` over `items` with at most `limit` in flight. Each item's own
 * steps stay sequential — that matters below, where a trade's row must exist
 * before its snapshot's `exists` guard can see it — but different items
 * overlap. Serverless bills the wall clock, and Neon's HTTP endpoint answers
 * one statement per round trip, so serialising everything was the slow part.
 */
async function mapLimit(items, limit, worker) {
  const results = new Array(items.length)
  let next = 0
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const index = next++
      if (index >= items.length) return
      results[index] = await worker(items[index], index)
    }
  })
  await Promise.all(runners)
  return results
}

const num = (value) => {
  if (value === '' || value === null || value === undefined) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

/** 'YYYY-MM-DDTHH:mm' (the app's local wall-clock string) -> 'YYYY-MM-DD HH:mm'. */
const stamp = (value) => {
  if (typeof value !== 'string') return null
  const text = value.trim()
  if (!text) return null
  return text.length >= 16 ? `${text.slice(0, 10)} ${text.slice(11, 16)}` : text
}

const text = (value) => (typeof value === 'string' ? value : '')

function tradeParams(trade, userId) {
  return [
    text(trade.id),
    userId,
    text(trade.symbol).toUpperCase(),
    text(trade.direction) || 'Long',
    stamp(trade.entryDate),
    stamp(trade.exitDate),
    num(trade.entryPrice),
    num(trade.exitPrice),
    num(trade.quantity) ?? 0,
    num(trade.pnl) ?? 0,
    text(trade.strategy),
    text(trade.tags),
    text(trade.notes),
    text(trade.sessionId),
    text(trade.sessionName),
    text(trade.sessionColor),
    num(trade.commission) ?? 0,
    num(trade.swap) ?? 0,
    num(trade.fees) ?? 0,
    num(trade.pips),
    text(trade.status) || 'open',
  ]
}

const TRADE_UPSERT = `
insert into trades (
  id, user_id, symbol, direction, entry_at, exit_at, entry_price, exit_price,
  quantity, pnl, strategy, tags, notes, session_id, session_name, session_color,
  commission, swap, fees, pips, status
) values (
  $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
  $17, $18, $19, $20, $21
)
on conflict (id) do update set
  symbol = excluded.symbol,
  direction = excluded.direction,
  entry_at = excluded.entry_at,
  exit_at = excluded.exit_at,
  entry_price = excluded.entry_price,
  exit_price = excluded.exit_price,
  quantity = excluded.quantity,
  pnl = excluded.pnl,
  strategy = excluded.strategy,
  tags = excluded.tags,
  notes = excluded.notes,
  session_id = excluded.session_id,
  session_name = excluded.session_name,
  session_color = excluded.session_color,
  commission = excluded.commission,
  swap = excluded.swap,
  fees = excluded.fees,
  pips = excluded.pips,
  status = excluded.status,
  updated_at = now()
where trades.user_id = excluded.user_id
  -- A tombstoned trade is never revived by a stale client re-uploading it.
  and trades.deleted_at is null`

const TRADE_SELECT = `
select id, symbol, direction,
       to_char(entry_at, 'YYYY-MM-DD"T"HH24:MI') as entry_date,
       to_char(exit_at, 'YYYY-MM-DD"T"HH24:MI') as exit_date,
       entry_price::float8 as entry_price,
       exit_price::float8 as exit_price,
       quantity::float8 as quantity,
       pnl::float8 as pnl,
       strategy, tags, notes,
       session_id, session_name, session_color,
       commission::float8 as commission,
       swap::float8 as swap,
       fees::float8 as fees,
       pips::float8 as pips,
       status
from trades
where user_id = $1 and deleted_at is null
order by entry_at desc nulls last, created_at desc`

function toTrade(row, photos) {
  return {
    id: row.id,
    symbol: row.symbol,
    direction: row.direction,
    entryDate: row.entry_date || '',
    exitDate: row.exit_date || '',
    entryPrice: row.entry_price,
    exitPrice: row.exit_price,
    quantity: row.quantity,
    pnl: row.pnl,
    strategy: row.strategy,
    tags: row.tags,
    notes: row.notes,
    sessionId: row.session_id,
    sessionName: row.session_name,
    sessionColor: row.session_color,
    commission: row.commission,
    swap: row.swap,
    fees: row.fees,
    pips: row.pips,
    status: row.status,
    entryPhoto: photos?.entry || '',
    exitPhoto: photos?.exit || '',
  }
}

// ---------------------------------------------------------------- queries --

async function ensureUser(userId) {
  await query('insert into app_users (id) values ($1) on conflict (id) do nothing', [userId])
}

async function readTrades(userId, { photos = true } = {}) {
  if (!photos) {
    // Metadata only. A journal with a chart snapshot on every trade is several
    // MB of base64, which overruns a serverless response limit — the client
    // asks for the pictures in pages afterwards instead.
    const rows = await query(TRADE_SELECT, [userId])
    return rows.map((row) => toTrade(row))
  }

  const [rows, snapshots] = await Promise.all([
    query(TRADE_SELECT, [userId]),
    query(
      `select s.trade_id, s.kind, s.data_url
         from trade_snapshots s
         join trades t on t.id = s.trade_id
        where t.user_id = $1 and t.deleted_at is null`,
      [userId],
    ),
  ])

  const photosByTrade = new Map()
  for (const shot of snapshots) {
    const entry = photosByTrade.get(shot.trade_id) || {}
    entry[shot.kind] = shot.data_url
    photosByTrade.set(shot.trade_id, entry)
  }

  return rows.map((row) => toTrade(row, photosByTrade.get(row.id)))
}

/**
 * One page of chart snapshots, walking trades in the same order as
 * TRADE_SELECT so `cursor` is just an offset into that list.
 *
 * @returns {Promise<{photos: Array<{id: string, kind: string, dataUrl: string}>, count: number}>}
 */
async function readPhotosPage(userId, cursor, limit) {
  const rows = await query(
    `with page as (
       select id, entry_at, created_at
         from trades
        where user_id = $1 and deleted_at is null
        order by entry_at desc nulls last, created_at desc
        limit $2 offset $3
     )
     select page.id, s.kind, s.data_url
       from page
       left join trade_snapshots s on s.trade_id = page.id
      order by page.entry_at desc nulls last, page.created_at desc, s.kind`,
    [userId, limit, cursor],
  )

  // `count` is distinct trades in the page, not rows: a trade with both
  // snapshots returns two rows, and the cursor must advance by trades.
  const ids = new Set()
  const photos = []
  for (const row of rows) {
    ids.add(row.id)
    if (row.kind && row.data_url) {
      photos.push({ id: row.id, kind: row.kind, dataUrl: row.data_url })
    }
  }
  return { photos, count: ids.size }
}

/**
 * Every tombstone for this user. The client uses the ids to drop cached
 * trades that were deleted on another device.
 */
async function readTombstones(userId) {
  const rows = await query(
    `select id, deleted_at
       from trades
      where user_id = $1 and deleted_at is not null
      order by deleted_at desc`,
    [userId],
  )
  return rows.map((row) => ({ id: row.id, deletedAt: row.deleted_at }))
}

// Tombstones older than this are removed for real, along with their snapshots.
const PURGE_AFTER_DAYS = 30
const PURGE_INTERVAL_MS = 60 * 60 * 1000
let lastPurgeAt = 0

/** Reclaim tombstones past their retention window. Runs at most hourly. */
async function purgeTombstones(userId) {
  if (Date.now() - lastPurgeAt < PURGE_INTERVAL_MS) return 0
  lastPurgeAt = Date.now()
  const rows = await query(
    `with gone as (
       delete from trades
        where user_id = $1
          and deleted_at is not null
          and deleted_at < now() - interval '${PURGE_AFTER_DAYS} days'
        returning id
     )
     select count(*)::int as purged from gone`,
    [userId],
  )
  return rows[0]?.purged ?? 0
}

async function readSettings(userId) {
  const [instruments, sessions, adjustments, settings] = await Promise.all([
    query('select symbol from instruments where user_id = $1 order by position, symbol', [userId]),
    query(
      `select id, name, description, start_time, end_time, color
         from sessions where user_id = $1 order by position, name`,
      [userId],
    ),
    query(
      `select id, kind, amount::float8 as amount,
              to_char(occurred_on, 'YYYY-MM-DD') as occurred_on,
              to_char(occurred_at, 'HH24:MI') as occurred_at,
              reason, notes
         from balance_adjustments
        where user_id = $1
        order by occurred_on, occurred_at`,
      [userId],
    ),
    queryOne('select balance_base::float8 as balance_base, dashboard_layout from app_settings where user_id = $1', [userId]),
  ])

  return {
    // A settings row is created the first time this user syncs, so it doubles
    // as the "server has seen this user" flag the client checks before it
    // uploads a local journal for the first time.
    initialized: Boolean(settings),
    instruments: instruments.map((row) => row.symbol),
    sessions: sessions.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      start: row.start_time,
      end: row.end_time,
      color: row.color,
    })),
    balanceBase: settings?.balance_base ?? 100,
    balanceAdjustments: adjustments.map((row) => ({
      id: row.id,
      type: row.kind,
      amount: row.amount,
      date: row.occurred_on,
      time: row.occurred_at,
      reason: row.reason,
      notes: row.notes,
    })),
    dashboardLayout: settings?.dashboard_layout ?? null,
  }
}

async function writeTrades(userId, { upserts = [], deletes = [] } = {}) {
  const writeList = (Array.isArray(upserts) ? upserts : []).filter(
    (trade) => trade && typeof trade.id === 'string' && trade.id,
  )
  const deleteList = (Array.isArray(deletes) ? deletes : []).filter(
    (id) => typeof id === 'string' && id,
  )

  // One trade at a time within a trade; several trades at a time overall.
  await mapLimit(writeList, 8, async (trade) => {
    await query(TRADE_UPSERT, tradeParams(trade, userId))

    for (const [kind, key] of [
      ['entry', 'entryPhoto'],
      ['exit', 'exitPhoto'],
    ]) {
      const dataUrl = text(trade[key])
      if (dataUrl) {
        // The `exists` guard keeps a forged trade id from writing a snapshot
        // onto another user's trade. It relies on the row above having landed.
        await query(
          `insert into trade_snapshots (trade_id, kind, data_url)
           select $1, $2, $3
            where exists (select 1 from trades where id = $1 and user_id = $4)
           on conflict (trade_id, kind)
           do update set data_url = excluded.data_url, updated_at = now()`,
          [trade.id, kind, dataUrl, userId],
        )
      } else {
        await query(
          `delete from trade_snapshots s
                 using trades t
                 where s.trade_id = $1 and s.kind = $2
                   and t.id = s.trade_id and t.user_id = $3`,
          [trade.id, kind, userId],
        )
      }
    }
  })

  // Soft delete: the row becomes a tombstone so other devices can tell a
  // deliberate deletion from a missing row. Purged after 30 days.
  await mapLimit(deleteList, 8, (id) =>
    query(
      `update trades set deleted_at = now(), updated_at = now()
        where id = $1 and user_id = $2 and deleted_at is null`,
      [id, userId],
    ),
  )

  return { written: writeList.length, removed: deleteList.length }
}

async function writeSettings(userId, body) {
  if (Array.isArray(body.instruments)) {
    await query('delete from instruments where user_id = $1', [userId])
    for (const [index, symbol] of body.instruments.entries()) {
      if (typeof symbol !== 'string' || !symbol.trim()) continue
      await query(
        `insert into instruments (user_id, symbol, position) values ($1, $2, $3)
         on conflict (user_id, symbol) do update set position = excluded.position`,
        [userId, symbol.trim().toUpperCase(), index],
      )
    }
  }

  if (Array.isArray(body.sessions)) {
    await query('delete from sessions where user_id = $1', [userId])
    for (const [index, session] of body.sessions.entries()) {
      if (!session || typeof session.id !== 'string' || !session.id) continue
      await query(
        `insert into sessions (id, user_id, name, description, start_time, end_time, color, position)
         values ($1, $2, $3, $4, $5, $6, $7, $8)
         on conflict (id) do update set
           name = excluded.name,
           description = excluded.description,
           start_time = excluded.start_time,
           end_time = excluded.end_time,
           color = excluded.color,
           position = excluded.position
         where sessions.user_id = excluded.user_id`,
        [
          session.id,
          userId,
          text(session.name) || 'Session',
          text(session.description),
          text(session.start) || '00:00',
          text(session.end) || '00:00',
          text(session.color) || '#37d6a0',
          index,
        ],
      )
    }
  }

  if (Array.isArray(body.balanceAdjustments)) {
    await query('delete from balance_adjustments where user_id = $1', [userId])
    for (const adjustment of body.balanceAdjustments) {
      if (!adjustment || typeof adjustment.id !== 'string' || !adjustment.id) continue
      const amount = num(adjustment.amount)
      if (!amount || amount <= 0) continue
      await query(
        `insert into balance_adjustments
           (id, user_id, kind, amount, occurred_on, occurred_at, reason, notes)
         values ($1, $2, $3, $4, $5, $6, $7, $8)
         on conflict (id) do update set
           kind = excluded.kind,
           amount = excluded.amount,
           occurred_on = excluded.occurred_on,
           occurred_at = excluded.occurred_at,
           reason = excluded.reason,
           notes = excluded.notes
         where balance_adjustments.user_id = excluded.user_id`,
        [
          adjustment.id,
          userId,
          adjustment.type === 'subtract' ? 'subtract' : 'add',
          amount,
          text(adjustment.date) || new Date().toISOString().slice(0, 10),
          text(adjustment.time) || '00:00',
          text(adjustment.reason) || 'Other',
          text(adjustment.notes),
        ],
      )
    }
  }

  const hasBase = Number.isFinite(Number(body.balanceBase))
  const hasLayout = body.dashboardLayout && typeof body.dashboardLayout === 'object'
  if (hasBase || hasLayout) {
    await query(
      `insert into app_settings (user_id, balance_base, dashboard_layout)
       values ($1, $2, $3)
       on conflict (user_id) do update set
         balance_base = coalesce(excluded.balance_base, app_settings.balance_base),
         dashboard_layout = coalesce(excluded.dashboard_layout, app_settings.dashboard_layout),
         updated_at = now()`,
      [userId, hasBase ? Number(body.balanceBase) : null, hasLayout ? JSON.stringify(body.dashboardLayout) : null],
    )
  }

  return readSettings(userId)
}

async function health(userId) {
  const row = await queryOne(
    `select (select count(*) from trades where user_id = $1 and deleted_at is null)::int as trades,
            (select count(*) from trades where user_id = $1 and deleted_at is not null)::int as deleted,
            (select count(*) from trade_snapshots s
               join trades t on t.id = s.trade_id
              where t.user_id = $1 and t.deleted_at is null)::int as snapshots,
            (select count(*) from instruments where user_id = $1)::int as instruments`,
    [userId],
  )
  return { ok: true, user: userId, ...row }
}

// --------------------------------------------------------------- middleware --

/**
 * Handle one /api/journal request. Framework-neutral on purpose: the Vite dev
 * middleware below and the Vercel Functions in `api/` both call this, so there
 * is exactly one implementation of the routes and one place to fix a bug.
 *
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @param {{ route?: string }} [options] absolute path to handle; defaults to
 *   the request URL's pathname (Vercel functions know their own route, so they
 *   pass it explicitly and don't depend on how the host rewrites `req.url`)
 * @returns {Promise<boolean>} true when this handled the request
 */
export async function handleJournalRequest(req, res, options = {}) {
  const url = new URL(req.url || '/', 'http://localhost')
  const route = (options.route || url.pathname).replace(/\/+$/, '') || '/'
  const isJournalRoute = route === '/api/journal' || route.startsWith('/api/journal/')
  if (!isJournalRoute) return false

  let session
  try {
    session = await identify(req)
  } catch {
    session = null
  }
  if (!session) {
    send(res, 401, { ok: false, error: 'Sign in to sync your journal' })
    return true
  }
  const userId = session.userId

  try {
    if (route === '/api/journal/health' && req.method === 'GET') {
      send(res, 200, await health(userId))
      return true
    }

    if (route === '/api/journal' && req.method === 'GET') {
      // `?photos=0` leaves the snapshots out so the payload stays small; the
      // client then collects them from /api/journal/photos page by page.
      const withPhotos = url.searchParams.get('photos') !== '0'
      const [trades, deleted, settings] = await Promise.all([
        readTrades(userId, { photos: withPhotos }),
        readTombstones(userId),
        readSettings(userId),
      ])
      send(res, 200, { ok: true, user: userId, trades, deleted, ...settings })
      return true
    }

    if (route === '/api/journal/photos' && req.method === 'GET') {
      const cursor = Math.max(0, Math.trunc(Number(url.searchParams.get('cursor'))) || 0)
      const requested = Math.trunc(Number(url.searchParams.get('limit'))) || 20
      const limit = Math.min(50, Math.max(1, requested))
      const page = await readPhotosPage(userId, cursor, limit)
      send(res, 200, {
        ok: true,
        photos: page.photos,
        // A short page is the last page; anything else means there is more.
        nextCursor: page.count < limit ? null : cursor + page.count,
      })
      return true
    }

    if (route === '/api/journal/sync' && req.method === 'POST') {
      const body = await readJson(req)
      await ensureUser(userId)
      const result = await writeTrades(userId, body)
      const purged = await purgeTombstones(userId).catch(() => 0)
      send(res, 200, { ok: true, ...result, purged })
      return true
    }

    if (route === '/api/journal/settings' && req.method === 'POST') {
      const body = await readJson(req)
      await ensureUser(userId)
      send(res, 200, { ok: true, settings: await writeSettings(userId, body) })
      return true
    }

    send(res, 404, { ok: false, error: 'Unknown journal route' })
    return true
  } catch (error) {
    const status = error.status || 500
    send(res, status, {
      ok: false,
      error: status === 500 ? `Database error: ${error.message}` : error.message,
    })
    return true
  }
}

/** Vite plugin: mounts the handler in `vite dev` and `vite preview`. */
export function createJournalApi() {
  const middleware = async (req, res, next) => {
    if (await handleJournalRequest(req, res)) return
    next()
  }

  return {
    name: 'gzs-journal-api',
    configureServer(server) {
      server.middlewares.use(middleware)
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware)
    },
  }
}
