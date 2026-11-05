export function formatPrice(value) {
  if (value == null || Number.isNaN(value)) return '--'
  if (value >= 1000) return value.toLocaleString(undefined, { maximumFractionDigits: 2 })
  if (value >= 1) return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return value.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 6 })
}

export function formatVolume(value) {
  if (value >= 1e9) return `${(value / 1e9).toFixed(2)}B`
  if (value >= 1e6) return `${(value / 1e6).toFixed(2)}M`
  if (value >= 1e3) return `${(value / 1e3).toFixed(2)}K`
  return value.toFixed(0)
}

export function formatTime(ts, intervalMs) {
  const date = new Date(ts)
  if (intervalMs >= 24 * 60 * 60 * 1000) {
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  }
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

export function formatChange(value) {
  const sign = value >= 0 ? '+' : ''
  return `${sign}${value.toFixed(2)}%`
}
