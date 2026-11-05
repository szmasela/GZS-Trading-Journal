function sma(values, period) {
  const out = Array(values.length).fill(null)
  let sum = 0
  for (let i = 0; i < values.length; i += 1) {
    sum += values[i]
    if (i >= period) sum -= values[i - period]
    if (i >= period - 1) out[i] = sum / period
  }
  return out
}

function ema(values, period) {
  const out = Array(values.length).fill(null)
  const k = 2 / (period + 1)
  let prev = null
  for (let i = 0; i < values.length; i += 1) {
    if (i < period - 1) continue
    if (prev == null) {
      let sum = 0
      for (let j = i - period + 1; j <= i; j += 1) sum += values[j]
      prev = sum / period
    } else {
      prev = values[i] * k + prev * (1 - k)
    }
    out[i] = prev
  }
  return out
}

function stdev(values, period, means) {
  const out = Array(values.length).fill(null)
  for (let i = period - 1; i < values.length; i += 1) {
    const mean = means[i]
    if (mean == null) continue
    let acc = 0
    for (let j = i - period + 1; j <= i; j += 1) {
      const d = values[j] - mean
      acc += d * d
    }
    out[i] = Math.sqrt(acc / period)
  }
  return out
}

export function computeIndicator(candles, type) {
  const closes = candles.map((c) => c.close)
  if (type === 'MA') {
    return { type, series: [{ name: 'MA 20', color: '#fbbf24', values: sma(closes, 20) }] }
  }
  if (type === 'EMA') {
    return { type, series: [{ name: 'EMA 20', color: '#60a5fa', values: ema(closes, 20) }] }
  }
  if (type === 'BB') {
    const mid = sma(closes, 20)
    const sd = stdev(closes, 20, mid)
    return {
      type,
      series: [
        { name: 'BB Mid', color: '#a78bfa', values: mid },
        { name: 'BB Upper', color: '#818cf8', values: mid.map((v, i) => (v == null || sd[i] == null ? null : v + 2 * sd[i])) },
        { name: 'BB Lower', color: '#818cf8', values: mid.map((v, i) => (v == null || sd[i] == null ? null : v - 2 * sd[i])) }
      ]
    }
  }
  if (type === 'RSI') {
    const gains = []
    const losses = []
    for (let i = 1; i < closes.length; i += 1) {
      const diff = closes[i] - closes[i - 1]
      gains.push(Math.max(diff, 0))
      losses.push(Math.max(-diff, 0))
    }
    const avgGain = sma(gains, 14)
    const avgLoss = sma(losses, 14)
    const values = [null]
    for (let i = 0; i < avgGain.length; i += 1) {
      if (avgGain[i] == null || avgLoss[i] == null) {
        values.push(null)
      } else if (avgLoss[i] === 0) {
        values.push(100)
      } else {
        const rs = avgGain[i] / avgLoss[i]
        values.push(100 - 100 / (1 + rs))
      }
    }
    return { type, pane: 'rsi', series: [{ name: 'RSI 14', color: '#f472b6', values }] }
  }
  if (type === 'MACD') {
    const fast = ema(closes, 12)
    const slow = ema(closes, 26)
    const macd = closes.map((_, i) => (fast[i] == null || slow[i] == null ? null : fast[i] - slow[i]))
    const signal = ema(macd.map((v) => v ?? 0), 9)
    const hist = macd.map((v, i) => (v == null || signal[i] == null ? null : v - signal[i]))
    return {
      type,
      pane: 'macd',
      series: [
        { name: 'MACD', color: '#38bdf8', values: macd },
        { name: 'Signal', color: '#f59e0b', values: signal },
        { name: 'Hist', color: '#34d399', values: hist, kind: 'hist' }
      ]
    }
  }
  if (type === 'VOL') {
    return {
      type,
      overlay: true,
      series: [{ name: 'Volume', color: '#64748b', values: candles.map((c) => c.volume), kind: 'volume' }]
    }
  }
  return { type, series: [] }
}

export const INDICATOR_OPTIONS = [
  { id: 'MA', label: 'Moving Average' },
  { id: 'EMA', label: 'EMA' },
  { id: 'BB', label: 'Bollinger Bands' },
  { id: 'VOL', label: 'Volume' },
  { id: 'RSI', label: 'RSI' },
  { id: 'MACD', label: 'MACD' }
]
