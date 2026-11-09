// Historical XAUUSD price lookup.
//
// Resolves the closest available historical candle to a given local
// date-time and returns its OHLC data. Two sources are tried in order:
//
// 1. /api/historical — a dev/preview-server middleware (vite.config.js)
//    that proxies Yahoo Finance "XAUUSD=X" candles. This gives real gold
//    prices (1m candles for the last 7 days, 5m for 60 days, 1h for 2
//    years, 1d beyond) and works even though Yahoo sends no CORS headers.
// 2. Direct Binance PAXG/USDT 1-minute klines (CORS-enabled, no key).
//    PAXG is a gold-backed token that tracks spot gold, so its candles
//    serve as an clearly-labelled illustrative fallback.
//
// The lookup never returns "the current price" — only historical candles —
// and callers must never auto-overwrite a manually entered price.

import { isAutoCalc } from './instruments.js'

const PRICE_FIELDS = ['open', 'high', 'low', 'close']
const BINANCE_KLINES = 'https://api.binance.com/api/v3/klines'
const BINANCE_GOLD_PROXY = 'PAXGUSDT'

function normalizeResult(r) {
  if (!r || typeof r !== 'object' || !r.ok) return r
  const out = { ...r }
  PRICE_FIELDS.forEach((f) => { out[f] = Number.isFinite(Number(r[f])) ? Number(r[f]) : null })
  out.price = Number.isFinite(Number(r.price)) ? Number(r.price) : out[r.field || 'close']
  out.distanceMs = Number(r.distanceMs) || 0
  out.exact = Boolean(r.exact)
  out.candleTs = r.candleTs || ''
  out.granularity = r.granularity || '1m'
  out.source = r.source || ''
  return out
}

async function fetchViaServer(ts, field) {
  const res = await fetch(`/api/historical?symbol=XAUUSD&ts=${encodeURIComponent(ts)}&field=${encodeURIComponent(field)}`)
  if (!res.ok) throw new Error(`historical endpoint ${res.status}`)
  const data = await res.json()
  if (!data || !data.ok) throw new Error(data?.error || 'historical endpoint returned no data')
  return normalizeResult(data)
}

async function fetchViaBinance(ts, field) {
  const call = async (query) => {
    const res = await fetch(BINANCE_KLINES + query)
    if (!res.ok) throw new Error(`binance ${res.status}`)
    return res.json()
  }
  // One candle at-or-after the target and one at-or-before: whichever is
  // closer is "the closest available historical candle".
  const [after, before] = await Promise.all([
    call(`?symbol=${BINANCE_GOLD_PROXY}&interval=1m&startTime=${ts}&limit=1`),
    call(`?symbol=${BINANCE_GOLD_PROXY}&interval=1m&endTime=${ts}&limit=1`)
  ])
  const candidates = []
  for (const rows of [after, before]) {
    if (Array.isArray(rows) && rows.length) {
      const k = rows[0]
      candidates.push({ ts: Number(k[0]), open: Number(k[1]), high: Number(k[2]), low: Number(k[3]), close: Number(k[4]) })
    }
  }
  if (!candidates.length) throw new Error('no historical candle for that time')
  candidates.sort((a, b) => Math.abs(a.ts - ts) - Math.abs(b.ts - ts))
  const k = candidates[0]
  return normalizeResult({
    ok: true,
    field,
    price: k[field] ?? k.close,
    ...k,
    candleTs: new Date(k.ts).toISOString(),
    granularity: '1m',
    distanceMs: k.ts - ts,
    exact: Math.abs(k.ts - ts) <= 60 * 1000,
    source: 'PAXG/USDT gold proxy (illustrative)'
  })
}

/**
 * Look up the closest historical XAUUSD candle for a datetime-local value.
 * @param {string} symbol  journal symbol (only XAUUSD is supported)
 * @param {string} isoDateTime  e.g. "2026-11-09T09:30" (local time)
 * @param {('open'|'high'|'low'|'close')} [field]  which candle price to use
 * @returns {{ok:boolean, price?:number, open?,high?,low?,close?, candleTs?, granularity?, distanceMs?, exact?, source?, message?}}
 */
export async function getHistoricalPrice(symbol, isoDateTime, field = 'close') {
  if (!isAutoCalc(symbol)) {
    return { ok: false, reason: 'unsupported', message: 'Historical lookup is available for XAUUSD only.' }
  }
  const useField = PRICE_FIELDS.includes(field) ? field : 'close'
  const picked = isoDateTime ? new Date(isoDateTime) : null
  if (!picked || isNaN(picked.getTime())) {
    return { ok: false, reason: 'bad-time', message: 'Pick a valid date and time first.' }
  }
  if (picked.getTime() > Date.now()) {
    return { ok: false, reason: 'future', message: 'That time is in the future — there is no historical price yet.' }
  }
  const ts = picked.getTime()
  try {
    return await fetchViaServer(ts, useField)
  } catch { /* dev/preview server not running or feed failed — fall through */ }
  try {
    return await fetchViaBinance(ts, useField)
  } catch { /* network blocked — fall through */ }
  return { ok: false, reason: 'unavailable', message: 'No historical data available for that time. You can enter the price manually.' }
}
