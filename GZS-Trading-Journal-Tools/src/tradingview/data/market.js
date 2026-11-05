function seedFrom(symbol) {
  let hash = 0
  for (let i = 0; i < symbol.length; i += 1) {
    hash = (hash * 31 + symbol.charCodeAt(i)) >>> 0
  }
  return hash
}

function mulberry32(seed) {
  let t = seed >>> 0
  return () => {
    t += 0x6d2b79f5
    let r = Math.imul(t ^ (t >>> 15), 1 | t)
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r)
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

const BASE_PRICES = {
  BTCUSDT: 64250,
  ETHUSDT: 3120,
  SOLUSDT: 148,
  BNBUSDT: 582,
  XRPUSDT: 0.62,
  ADAUSDT: 0.45,
  DOGEUSDT: 0.148,
  AVAXUSDT: 28.4,
  LINKUSDT: 14.2,
  DOTUSDT: 6.8
}

export function generateCandles(symbol, intervalMs, count = 420) {
  const rand = mulberry32(seedFrom(symbol + String(intervalMs)))
  const now = Date.now()
  const aligned = now - (now % intervalMs)
  let price = BASE_PRICES[symbol] || 100
  const candles = []

  for (let i = count - 1; i >= 0; i -= 1) {
    const drift = (rand() - 0.48) * price * 0.012
    const open = price
    const close = Math.max(price * 0.2, open + drift)
    const high = Math.max(open, close) * (1 + rand() * 0.006)
    const low = Math.min(open, close) * (1 - rand() * 0.006)
    const volume = (500 + rand() * 4200) * (price > 50 ? 1 : 80)
    candles.push({
      time: aligned - i * intervalMs,
      open,
      high,
      low,
      close,
      volume
    })
    price = close
  }

  return candles
}

function parseKlines(raw) {
  return raw.map((row) => ({
    time: row[0],
    open: Number(row[1]),
    high: Number(row[2]),
    low: Number(row[3]),
    close: Number(row[4]),
    volume: Number(row[5])
  }))
}

export async function fetchKlines(symbol, interval, intervalMs) {
  try {
    const url = `/api/binance/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=500`
    const response = await fetch(url, { signal: AbortSignal.timeout(6000) })
    if (!response.ok) throw new Error('klines failed')
    const data = await response.json()
    if (!Array.isArray(data) || data.length < 10) throw new Error('empty klines')
    return { candles: parseKlines(data), live: true }
  } catch {
    return { candles: generateCandles(symbol, intervalMs), live: false }
  }
}

export async function fetchTickers(symbols) {
  try {
    const url = '/api/binance/api/v3/ticker/24hr'
    const response = await fetch(url, { signal: AbortSignal.timeout(6000) })
    if (!response.ok) throw new Error('ticker failed')
    const data = await response.json()
    const wanted = new Set(symbols)
    return data
      .filter((row) => wanted.has(row.symbol))
      .map((row) => ({
        symbol: row.symbol,
        price: Number(row.lastPrice),
        change: Number(row.priceChangePercent),
        volume: Number(row.quoteVolume)
      }))
  } catch {
    return symbols.map((symbol) => {
      const rand = mulberry32(seedFrom(symbol + 't'))
      const price = BASE_PRICES[symbol] || 10
      return {
        symbol,
        price: price * (0.98 + rand() * 0.04),
        change: (rand() - 0.5) * 8,
        volume: 1e8 + rand() * 4e8
      }
    })
  }
}
