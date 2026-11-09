// ============================================================================
// Instrument specifications + pip / money calculation engine.
//
// One consistent engine for open (floating) and closed (realized) trades.
// Pip sizes are configurable per instrument because brokers differ:
// overrides live in localStorage key "luxInstrumentSpecs" as JSON:
//   { "XAUUSD": { "pipSize": 0.1, "contractSize": 100 }, ... }
// All monetary values assume a USD account currency.
// ============================================================================

const SPECS_KEY = 'luxInstrumentSpecs'

// pipSize  = price increment that counts as one pip (NOT a tick or point)
// digits   = display precision for prices of this instrument
// contractSize = units per 1.0 lot (value of a full price unit move × qty)
const DEFAULT_SPECS = {
  XAUUSD: { label: 'Gold (XAUUSD)', pipSize: 0.01, digits: 2, contractSize: 100 },
  XAGUSD: { label: 'Silver (XAGUSD)', pipSize: 0.001, digits: 3, contractSize: 5000 },
  EURUSD: { label: 'Euro / USD', pipSize: 0.0001, digits: 5, contractSize: 100000 },
  GBPUSD: { label: 'Pound / USD', pipSize: 0.0001, digits: 5, contractSize: 100000 },
  AUDUSD: { label: 'Aussie / USD', pipSize: 0.0001, digits: 5, contractSize: 100000 },
  NZDUSD: { label: 'Kiwi / USD', pipSize: 0.0001, digits: 5, contractSize: 100000 },
  USDJPY: { label: 'USD / Yen', pipSize: 0.01, digits: 3, contractSize: 100000 },
  EURJPY: { label: 'Euro / Yen', pipSize: 0.01, digits: 3, contractSize: 100000 },
  GBPJPY: { label: 'Pound / Yen', pipSize: 0.01, digits: 3, contractSize: 100000 },
  USDCAD: { label: 'USD / Cad', pipSize: 0.0001, digits: 5, contractSize: 100000 },
  USDCHF: { label: 'USD / Franc', pipSize: 0.0001, digits: 5, contractSize: 100000 },
  US30: { label: 'Dow Jones 30', pipSize: 1, digits: 1, contractSize: 1 },
  US500: { label: 'S&P 500', pipSize: 0.1, digits: 1, contractSize: 1 },
  NAS100: { label: 'Nasdaq 100', pipSize: 1, digits: 1, contractSize: 1 },
  UK100: { label: 'FTSE 100', pipSize: 1, digits: 1, contractSize: 1 },
  GER40: { label: 'DAX 40', pipSize: 1, digits: 1, contractSize: 1 },
  BTCUSD: { label: 'Bitcoin', pipSize: 1, digits: 2, contractSize: 1 },
  ETHUSD: { label: 'Ethereum', pipSize: 0.1, digits: 2, contractSize: 1 }
}

// common journal spellings -> canonical spec key
const ALIASES = {
  GOLD: 'XAUUSD',
  SILVER: 'XAGUSD',
  NAS100USD: 'NAS100',
  NASDAQ: 'NAS100',
  US100: 'NAS100',
  DOW: 'US30',
  DOWJONES: 'US30',
  DJ30: 'US30',
  SP500: 'US500',
  US500USD: 'US500',
  FTSE: 'UK100',
  DAX: 'GER40',
  DE30: 'GER40',
  GER30: 'GER40',
  BTC: 'BTCUSD',
  ETH: 'ETHUSD'
}

export function getSpec(symbol) {
  let overrides = {}
  try {
    overrides = JSON.parse(localStorage.getItem(SPECS_KEY) || '{}')
  } catch {
    overrides = {}
  }
  const key = normalizeSymbol(symbol)
  const base = DEFAULT_SPECS[key] || { label: key, pipSize: 0.0001, digits: 5, contractSize: 100000 }
  const ov = overrides[key] || {}
  return {
    key,
    label: ov.label || base.label,
    // fall back to base values if an override field is missing/invalid
    pipSize: Number(ov.pipSize) > 0 ? Number(ov.pipSize) : base.pipSize,
    digits: Number.isFinite(Number(ov.digits)) ? Number(ov.digits) : base.digits,
    contractSize: Number(ov.contractSize) > 0 ? Number(ov.contractSize) : base.contractSize
  }
}

export function normalizeSymbol(symbol) {
  const key = String(symbol || '').trim().toUpperCase()
  if (ALIASES[key]) return ALIASES[key]
  // Fold broker suffixes and separators into the canonical key so that
  // "XAUUSD.m", "XAUUSDm", "XAU/USD", "GOLD.pro", "GOLDmicrolot" …
  // all resolve to XAUUSD (silver spellings fold to XAGUSD).
  const flat = key.replace(/[^A-Z0-9]/g, '')
  if (flat === 'XAU' || flat.startsWith('XAUUSD') || flat.startsWith('GOLD')) return 'XAUUSD'
  if (flat.startsWith('XAGUSD') || flat.startsWith('SILVER')) return 'XAGUSD'
  return ALIASES[flat] || key
}

export function isBuy(direction) {
  return /^(buy|long|b)$/i.test(String(direction || '').trim())
}

// ----------------------------------------------------------------------------
// Automatic live pip / P/L calculation is enabled for XAUUSD (Gold) ONLY.
// All other instruments keep their existing manual behaviour — no live
// calculation, no auto-populated fields.
// ----------------------------------------------------------------------------
const AUTO_CALC_SYMBOLS = new Set(['XAUUSD'])

export function isAutoCalc(symbol) {
  return AUTO_CALC_SYMBOLS.has(normalizeSymbol(symbol))
}

// ----------------------------------------------------------------------------
// Trading session picker — matches a session whose start–end window (HH:MM,
// from Settings) contains the given time. Windows may span midnight.
// ----------------------------------------------------------------------------
export function pickSession(date) {
  let sessions = []
  try {
    sessions = JSON.parse(localStorage.getItem('luxTradeJournalSessions') || '[]')
  } catch {
    sessions = []
  }
  const d = date instanceof Date ? date : new Date(date)
  if (!d || isNaN(d.getTime())) return null
  const mins = d.getHours() * 60 + d.getMinutes()
  const toMin = (hhmm) => {
    const [h, m] = String(hhmm || '').split(':').map(Number)
    return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null
  }
  return (
    sessions.find((s) => {
      const a = toMin(s.start)
      const b = toMin(s.end)
      if (a == null || b == null) return false
      return a <= b ? mins >= a && mins < b : mins >= a || mins < b
    }) || null
  )
}

/**
 * Pip movement between entry and a later price.
 * BUY/LONG:  (current - entry) / pipSize
 * SELL/SHORT:(entry - current) / pipSize
 * Positive = in favour of the trade.
 */
export function calcPips({ direction, entryPrice, currentPrice, spec }) {
  const entry = Number(entryPrice)
  const current = Number(currentPrice)
  if (!Number.isFinite(entry) || !Number.isFinite(current) || !spec?.pipSize) return 0
  const diff = isBuy(direction) ? current - entry : entry - current
  return diff / spec.pipSize
}

/**
 * Monetary value of a pip movement for this instrument & lot size.
 * $ per pip = contractSize × pipSize × quantity   (USD account)
 */
export function calcMoney({ pips, spec, quantity }) {
  const p = Number(pips)
  const q = Number(quantity)
  if (!Number.isFinite(p) || !spec?.pipSize || !spec?.contractSize) return 0
  return p * spec.contractSize * spec.pipSize * (Number.isFinite(q) ? q : 0)
}

/** Gross P/L directly from prices (same engine as calcPips). */
export function calcGross({ direction, entryPrice, exitPrice, spec, quantity }) {
  const pips = calcPips({ direction, entryPrice, currentPrice: exitPrice, spec })
  return { pips, gross: calcMoney({ pips, spec, quantity }) }
}

/** Net = gross − commissions − swaps − other fees. */
export function calcNet({ gross, commission = 0, swap = 0, fees = 0 }) {
  return Number(gross) - Number(commission || 0) - Number(swap || 0) - Number(fees || 0)
}

/** Format a price with the instrument's display precision. */
export function fmtPrice(price, spec) {
  const n = Number(price)
  if (!Number.isFinite(n)) return '—'
  const digits = Math.min(Math.max(spec?.digits ?? 2, 0), 8)
  return n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}
