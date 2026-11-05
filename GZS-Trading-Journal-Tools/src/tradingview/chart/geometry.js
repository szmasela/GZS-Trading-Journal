export function getVisibleRange(candles, offset, visible) {
  const end = Math.max(candles.length, 1) - offset
  const start = Math.max(0, end - visible)
  return { start, end }
}

export function priceScale(min, max, top, height) {
  const span = max - min || 1
  return {
    y(price) {
      return top + ((max - price) / span) * height
    },
    price(y) {
      return max - ((y - top) / height) * span
    }
  }
}

export function timeScale(start, visible, left, width) {
  const slot = width / Math.max(visible, 1)
  return {
    slot,
    x(index) {
      return left + (index - start + 0.5) * slot
    },
    index(x) {
      return start + (x - left) / slot - 0.5
    }
  }
}

export function extents(candles, extras = []) {
  let min = Infinity
  let max = -Infinity
  for (const candle of candles) {
    min = Math.min(min, candle.low)
    max = Math.max(max, candle.high)
  }
  for (const value of extras) {
    if (value == null) continue
    min = Math.min(min, value)
    max = Math.max(max, value)
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    min = 0
    max = 1
  }
  const pad = (max - min) * 0.08 || 1
  return { min: min - pad, max: max + pad }
}

export function hitSegment(px, py, x1, y1, x2, y2, tol = 6) {
  const dx = x2 - x1
  const dy = y2 - y1
  const len = Math.hypot(dx, dy) || 1
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (len * len)))
  const hx = x1 + t * dx
  const hy = y1 + t * dy
  return Math.hypot(px - hx, py - hy) <= tol
}
