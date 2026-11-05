export const TOOLS = [
  { id: 'cursor', label: 'Cursor', group: 'nav' },
  { id: 'cross', label: 'Cross', group: 'nav' },
  { id: 'trend', label: 'Trend', group: 'draw' },
  { id: 'ray', label: 'Ray', group: 'draw' },
  { id: 'hline', label: 'H Line', group: 'draw' },
  { id: 'vline', label: 'V Line', group: 'draw' },
  { id: 'rect', label: 'Rect', group: 'draw' },
  { id: 'fib', label: 'Fib', group: 'draw' },
  { id: 'text', label: 'Text', group: 'draw' },
  { id: 'eraser', label: 'Erase', group: 'edit' }
]

const FIBS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1]

export function createDrawing(tool, start) {
  return {
    id: `${tool}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    tool,
    a: { ...start },
    b: { ...start },
    text: tool === 'text' ? 'Note' : '',
    color: '#26a69a'
  }
}

export function updateDrawing(drawing, point) {
  return { ...drawing, b: { ...point } }
}

export function drawShape(ctx, drawing, mapX, mapY, scale) {
  const ax = mapX(drawing.a.index)
  const ay = mapY(drawing.a.price)
  const bx = mapX(drawing.b.index)
  const by = mapY(drawing.b.price)
  ctx.save()
  ctx.strokeStyle = drawing.color
  ctx.fillStyle = drawing.color
  ctx.lineWidth = 1.4
  ctx.setLineDash([])

  if (drawing.tool === 'trend' || drawing.tool === 'ray') {
    ctx.beginPath()
    if (drawing.tool === 'ray') {
      const dx = bx - ax || 1
      const dy = by - ay
      const k = 4000 / Math.abs(dx)
      ctx.moveTo(ax, ay)
      ctx.lineTo(bx + dx * k, by + dy * k)
    } else {
      ctx.moveTo(ax, ay)
      ctx.lineTo(bx, by)
    }
    ctx.stroke()
  } else if (drawing.tool === 'hline') {
    ctx.beginPath()
    ctx.moveTo(0, ay)
    ctx.lineTo(scale.width, ay)
    ctx.stroke()
  } else if (drawing.tool === 'vline') {
    ctx.beginPath()
    ctx.moveTo(ax, 0)
    ctx.lineTo(ax, scale.height)
    ctx.stroke()
  } else if (drawing.tool === 'rect') {
    ctx.globalAlpha = 0.12
    ctx.fillRect(Math.min(ax, bx), Math.min(ay, by), Math.abs(bx - ax), Math.abs(by - ay))
    ctx.globalAlpha = 1
    ctx.strokeRect(Math.min(ax, bx), Math.min(ay, by), Math.abs(bx - ax), Math.abs(by - ay))
  } else if (drawing.tool === 'fib') {
    const top = Math.min(ay, by)
    const bot = Math.max(ay, by)
    const h = bot - top || 1
    FIBS.forEach((level) => {
      const y = ay + (by - ay) * level
      ctx.globalAlpha = 0.85
      ctx.beginPath()
      ctx.moveTo(Math.min(ax, bx), y)
      ctx.lineTo(Math.max(ax, bx) + 80, y)
      ctx.stroke()
      ctx.font = '11px IBM Plex Sans'
      ctx.fillText(`${(level * 100).toFixed(1)}%`, Math.max(ax, bx) + 8, y - 3)
      ctx.globalAlpha = 0.08
      ctx.fillRect(Math.min(ax, bx), y, Math.abs(bx - ax) + 80, h / FIBS.length)
      ctx.globalAlpha = 1
    })
  } else if (drawing.tool === 'text') {
    ctx.font = '12px IBM Plex Sans'
    ctx.fillText(drawing.text || 'Note', ax + 6, ay - 6)
    ctx.beginPath()
    ctx.arc(ax, ay, 3, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

export function hitDrawing(drawing, px, py, mapX, mapY, scale) {
  const ax = mapX(drawing.a.index)
  const ay = mapY(drawing.a.price)
  const bx = mapX(drawing.b.index)
  const by = mapY(drawing.b.price)
  if (drawing.tool === 'hline') return Math.abs(py - ay) <= 6
  if (drawing.tool === 'vline') return Math.abs(px - ax) <= 6
  if (drawing.tool === 'text') return Math.hypot(px - ax, py - ay) <= 10
  if (drawing.tool === 'rect') {
    const x = Math.min(ax, bx)
    const y = Math.min(ay, by)
    const w = Math.abs(bx - ax)
    const h = Math.abs(by - ay)
    const inside = px >= x && px <= x + w && py >= y && py <= y + h
    const edge =
      Math.abs(px - x) <= 5 ||
      Math.abs(px - (x + w)) <= 5 ||
      Math.abs(py - y) <= 5 ||
      Math.abs(py - (y + h)) <= 5
    return inside && edge
  }
  const dx = bx - ax
  const dy = by - ay
  const len = Math.hypot(dx, dy) || 1
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (len * len)))
  const hx = ax + t * dx
  const hy = ay + t * dy
  return Math.hypot(px - hx, py - hy) <= 6 && px >= 0 && px <= scale.width
}
