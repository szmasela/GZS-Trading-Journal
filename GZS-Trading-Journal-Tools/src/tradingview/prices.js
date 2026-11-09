// ============================================================================
// Market price feed — one shared connection used by the live pip/P/L engine.
//
// The TradingView embed is an iframe and does not expose prices, so this
// module provides lightweight free quotes (all CORS-enabled, verified):
//   • metals  (XAUUSD/XAGUSD)  -> api.gold-api.com        (live)
//   • crypto  (BTCUSD/ETHUSD)  -> api.binance.com         (live)
//   • FX      (EURUSD/GBPUSD/…) -> open.er-api.com         (delayed, daily)
//   • indices (US30/NAS100/…)   -> not available yet       (manual entry)
//
// The last known price of every instrument is cached (localStorage) so the
// UI can keep showing a value and flag it DELAYED/UNAVAILABLE if the feed
// goes down — prices are never silently wrong.
// ============================================================================

const CACHE_KEY = 'luxLastPrices'
const CACHE_TTL = 12 * 60 * 60 * 1000 // last-known prices stay usable 12h

// journal symbol spellings -> canonical
const ALIASES = {
  GOLD: 'XAUUSD',
  SILVER: 'XAGUSD',
  BTC: 'BTCUSD',
  ETH: 'ETHUSD',
  US100: 'NAS100',
  NASDAQ: 'NAS100',
  DOW: 'US30',
  DJ30: 'US30',
  SP500: 'US500',
  FTSE: 'UK100',
  DAX: 'GER40',
  DE30: 'GER40'
}

// FX pairs served by the exchange-rate feed (base USD)
const FX_SET = new Set([
  'EURUSD', 'GBPUSD', 'AUDUSD', 'NZDUSD', 'USDCAD', 'USDCHF', 'USDJPY',
  'EURJPY', 'GBPJPY', 'EURGBP', 'AUDJPY', 'NZDJPY', 'CADJPY', 'CHFJPY'
])

export function normalizeQuoteSymbol(symbol) {
  const key = String(symbol || '').trim().toUpperCase()
  if (ALIASES[key]) return ALIASES[key]
  // Same folding as instruments.normalizeSymbol: broker suffixes like
  // "XAUUSDm" / "XAUUSD.pro" / "XAU/USD" / "GOLD.i" resolve to XAUUSD.
  const flat = key.replace(/[^A-Z0-9]/g, '')
  if (flat === 'XAU' || flat.startsWith('XAUUSD') || flat.startsWith('GOLD')) return 'XAUUSD'
  if (flat.startsWith('XAGUSD') || flat.startsWith('SILVER')) return 'XAGUSD'
  return ALIASES[flat] || key
}

function quoteKind(sym) {
  if (sym === 'XAUUSD' || sym === 'XAGUSD') return 'metal'
  if (sym === 'BTCUSD' || sym === 'ETHUSD') return 'crypto'
  if (FX_SET.has(sym)) return 'fx'
  return null
}

const memoryCache = {} // sym -> { price, ts, status }

function readPersisted(sym) {
  try {
    const all = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}')
    const hit = all[sym]
    if (hit && Date.now() - hit.ts < CACHE_TTL) return hit
  } catch { /* ignore */ }
  return null
}

function persist(sym, entry) {
  memoryCache[sym] = entry
  try {
    const all = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}')
    all[sym] = entry
    localStorage.setItem(CACHE_KEY, JSON.stringify(all))
  } catch { /* ignore */ }
}

function cached(sym) {
  return memoryCache[sym] || readPersisted(sym) || null
}

async function fetchJson(url, timeoutMs = 8000) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, { signal: ctrl.signal })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.json()
  } finally {
    clearTimeout(timer)
  }
}

const inflight = {} // sym -> Promise<entry|null>

async function fetchQuote(sym) {
  const kind = quoteKind(sym)
  try {
    if (kind === 'metal') {
      const data = await fetchJson(`https://api.gold-api.com/price/${sym === 'XAUUSD' ? 'XAU' : 'XAG'}`)
      const price = Number(data?.price)
      if (!(price > 0)) throw new Error('bad price')
      const age = data?.updatedAt ? Date.now() - new Date(data.updatedAt).getTime() : 0
      return { price, ts: Date.now(), status: age < 15 * 60 * 1000 ? 'live' : 'delayed' }
    }
    if (kind === 'crypto') {
      const pair = sym === 'BTCUSD' ? 'BTCUSDT' : 'ETHUSDT'
      const data = await fetchJson(`https://api.binance.com/api/v3/ticker/price?symbol=${pair}`)
      const price = Number(data?.price)
      if (!(price > 0)) throw new Error('bad price')
      return { price, ts: Date.now(), status: 'live' }
    }
    if (kind === 'fx') {
      const base = sym.slice(0, 3)
      const quote = sym.slice(3, 6)
      const data = await fetchJson(`https://open.er-api.com/v6/latest/${base}`)
      let rate = data?.rates?.[quote]
      if (!(rate > 0)) throw new Error('bad rate')
      // keep FX precision realistic (5 decimals) for pip maths
      const price = Number(Number(rate).toFixed(5))
      return { price, ts: Date.now(), status: 'delayed' }
    }
  } catch {
    // fall through to last-known handling
  }
  return null
}

/**
 * Get the latest quote for a journal symbol.
 * @returns {Promise<{price:number|null, ts:number|null, status:'live'|'delayed'|'unavailable'}>}
 */
export async function getQuote(symbol) {
  const sym = normalizeQuoteSymbol(symbol)
  if (!quoteKind(sym)) {
    const last = cached(sym)
    return last
      ? { ...last, status: 'unavailable' }
      : { price: null, ts: null, status: 'unavailable' }
  }

  // refetch at most every 10s per symbol
  const last = cached(sym)
  if (last && Date.now() - last.ts < 10 * 1000) return last

  if (!inflight[sym]) {
    inflight[sym] = fetchQuote(sym).then((entry) => {
      delete inflight[sym]
      if (entry) {
        persist(sym, entry)
        return entry
      }
      return null
    }).catch(() => {
      delete inflight[sym]
      return null
    })
  }
  const fresh = await inflight[sym]
  if (fresh) return fresh

  // feed failed: keep last known price, flag it
  if (last) return { ...last, status: 'delayed' }
  return { price: null, ts: null, status: 'unavailable' }
}

export const STATUS_LABEL = {
  live: 'LIVE',
  delayed: 'DELAYED',
  unavailable: 'NO DATA'
}
