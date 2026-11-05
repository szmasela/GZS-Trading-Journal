import { useEffect, useRef } from 'react'
import { extents, getVisibleRange, priceScale, timeScale } from './geometry.js'
import { drawShape, hitDrawing } from './drawings.js'
import { formatPrice, formatTime } from '../utils/format.js'

const PAD = { left: 8, right: 72, top: 12, bottom: 28 }

function niceTicks(min, max, count) {
  const span = max - min || 1
  const step = Math.pow(10, Math.floor(Math.log10(span / count)))
  const err = (span / count) / step
  const mul = err >= 7.5 ? 10 : err >= 3 ? 5 : err >= 1.5 ? 2 : 1
  const size = step * mul
  const start = Math.ceil(min / size) * size
  const ticks = []
  for (let v = start; v <= max + size * 0.01; v += size) ticks.push(v)
  return ticks
}

export default function ChartCanvas({
  candles,
  chartType,
  indicators,
  drawings,
  tool,
  intervalMs,
  offset,
  visible,
  hover,
  onHover,
  onPan,
  onZoom,
  onDrawStart,
  onDrawMove,
  onDrawEnd,
  onErase
}) {
  const canvasRef = useRef(null)
  const wrapRef = useRef(null)
  const drag = useRef(null)

  useEffect(() => {
    const wrap = wrapRef.current
    const canvas = canvasRef.current
    if (!wrap || !canvas) return

    const draw = () => {
      const dpr = window.devicePixelRatio || 1
      const width = wrap.clientWidth
      const height = wrap.clientHeight
      canvas.width = Math.floor(width * dpr)
      canvas.height = Math.floor(height * dpr)
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      const ctx = canvas.getContext('2d')
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, width, height)

      const extraPanes = []
      if (indicators.some((i) => i.pane === 'rsi')) extraPanes.push('rsi')
      if (indicators.some((i) => i.pane === 'macd')) extraPanes.push('macd')
      const paneH = extraPanes.length ? Math.min(110, height * 0.18) : 0
      const chartH = height - PAD.top - PAD.bottom - extraPanes.length * paneH
      const plotW = width - PAD.left - PAD.right
      const { start, end } = getVisibleRange(candles, offset, visible)
      const view = candles.slice(start, end)
      if (!view.length) return

      const overlayValues = []
      indicators.forEach((ind) => {
        if (ind.pane || ind.overlay) return
        ind.series.forEach((s) => overlayValues.push(...s.values.slice(start, end)))
      })
      const { min, max } = extents(view, overlayValues)
      const yScale = priceScale(min, max, PAD.top, chartH)
      const xScale = timeScale(start, Math.max(end - start, 1), PAD.left, plotW)
      const mapX = (index) => xScale.x(index)
      const mapY = (price) => yScale.y(price)

      ctx.fillStyle = '#131722'
      ctx.fillRect(0, 0, width, height)

      ctx.strokeStyle = '#1e222d'
      ctx.lineWidth = 1
      niceTicks(min, max, 8).forEach((tick) => {
        const y = yScale.y(tick)
        ctx.beginPath()
        ctx.moveTo(PAD.left, y)
        ctx.lineTo(width - PAD.right, y)
        ctx.stroke()
        ctx.fillStyle = '#787b86'
        ctx.font = '11px IBM Plex Sans'
        ctx.textAlign = 'left'
        ctx.fillText(formatPrice(tick), width - PAD.right + 8, y + 4)
      })

      const step = Math.max(1, Math.floor((end - start) / 8))
      for (let i = start; i < end; i += step) {
        const x = xScale.x(i)
        ctx.strokeStyle = '#1e222d'
        ctx.beginPath()
        ctx.moveTo(x, PAD.top)
        ctx.lineTo(x, PAD.top + chartH)
        ctx.stroke()
        ctx.fillStyle = '#787b86'
        ctx.textAlign = 'center'
        ctx.fillText(formatTime(candles[i].time, intervalMs), x, height - 10)
      }

      const volInd = indicators.find((i) => i.type === 'VOL')
      if (volInd) {
        const vols = view.map((c) => c.volume)
        const vmax = Math.max(...vols, 1)
        view.forEach((c, idx) => {
          const i = start + idx
          const x = xScale.x(i)
          const h = (c.volume / vmax) * chartH * 0.18
          ctx.globalAlpha = 0.28
          ctx.fillStyle = c.close >= c.open ? '#26a69a' : '#ef5350'
          ctx.fillRect(x - xScale.slot * 0.32, PAD.top + chartH - h, xScale.slot * 0.64, h)
          ctx.globalAlpha = 1
        })
      }

      view.forEach((c, idx) => {
        const i = start + idx
        const x = xScale.x(i)
        const up = c.close >= c.open
        const color = up ? '#26a69a' : '#ef5350'
        ctx.strokeStyle = color
        ctx.fillStyle = color
        if (chartType === 'line' || chartType === 'area') return
        if (chartType === 'bars') {
          ctx.beginPath()
          ctx.moveTo(x, yScale.y(c.high))
          ctx.lineTo(x, yScale.y(c.low))
          ctx.moveTo(x - xScale.slot * 0.28, yScale.y(c.open))
          ctx.lineTo(x, yScale.y(c.open))
          ctx.moveTo(x, yScale.y(c.close))
          ctx.lineTo(x + xScale.slot * 0.28, yScale.y(c.close))
          ctx.stroke()
        } else {
          ctx.beginPath()
          ctx.moveTo(x, yScale.y(c.high))
          ctx.lineTo(x, yScale.y(c.low))
          ctx.stroke()
          const top = yScale.y(Math.max(c.open, c.close))
          const bot = yScale.y(Math.min(c.open, c.close))
          const h = Math.max(bot - top, 1)
          ctx.fillRect(x - xScale.slot * 0.32, top, xScale.slot * 0.64, h)
        }
      })

      if (chartType === 'line' || chartType === 'area') {
        ctx.beginPath()
        view.forEach((c, idx) => {
          const x = xScale.x(start + idx)
          const y = yScale.y(c.close)
          if (idx === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        })
        ctx.strokeStyle = '#26a69a'
        ctx.lineWidth = 1.6
        ctx.stroke()
        if (chartType === 'area') {
          const lastX = xScale.x(start + view.length - 1)
          ctx.lineTo(lastX, PAD.top + chartH)
          ctx.lineTo(xScale.x(start), PAD.top + chartH)
          ctx.closePath()
          ctx.fillStyle = 'rgba(38, 166, 154, 0.16)'
          ctx.fill()
        }
      }

      indicators.forEach((ind) => {
        if (ind.pane || ind.type === 'VOL') return
        ind.series.forEach((series) => {
          ctx.beginPath()
          let started = false
          series.values.forEach((value, i) => {
            if (i < start || i >= end || value == null) {
              started = false
              return
            }
            const x = xScale.x(i)
            const y = yScale.y(value)
            if (!started) {
              ctx.moveTo(x, y)
              started = true
            } else ctx.lineTo(x, y)
          })
          ctx.strokeStyle = series.color
          ctx.lineWidth = 1.3
          ctx.stroke()
        })
      })

      extraPanes.forEach((pane, paneIdx) => {
        const top = PAD.top + chartH + paneIdx * paneH + 8
        const h = paneH - 12
        ctx.fillStyle = '#131722'
        ctx.fillRect(PAD.left, top - 6, plotW, h + 12)
        ctx.strokeStyle = '#1e222d'
        ctx.strokeRect(PAD.left, top - 6, plotW, h + 12)
        const seriesList = indicators.filter((i) => i.pane === pane).flatMap((i) => i.series)
        const vals = seriesList.flatMap((s) => s.values.slice(start, end)).filter((v) => v != null)
        const pmin = pane === 'rsi' ? 0 : Math.min(...vals, 0)
        const pmax = pane === 'rsi' ? 100 : Math.max(...vals, 0.01)
        const pScale = priceScale(pmin, pmax, top, h)
        if (pane === 'rsi') {
          ;[30, 70].forEach((lvl) => {
            ctx.strokeStyle = '#2a2e39'
            ctx.setLineDash([4, 4])
            ctx.beginPath()
            ctx.moveTo(PAD.left, pScale.y(lvl))
            ctx.lineTo(width - PAD.right, pScale.y(lvl))
            ctx.stroke()
            ctx.setLineDash([])
          })
        }
        seriesList.forEach((series) => {
          if (series.kind === 'hist') {
            series.values.forEach((value, i) => {
              if (i < start || i >= end || value == null) return
              const x = xScale.x(i)
              const y0 = pScale.y(0)
              const y1 = pScale.y(value)
              ctx.fillStyle = value >= 0 ? '#26a69a' : '#ef5350'
              ctx.fillRect(x - xScale.slot * 0.28, Math.min(y0, y1), xScale.slot * 0.56, Math.abs(y1 - y0) || 1)
            })
            return
          }
          ctx.beginPath()
          let started = false
          series.values.forEach((value, i) => {
            if (i < start || i >= end || value == null) {
              started = false
              return
            }
            const x = xScale.x(i)
            const y = pScale.y(value)
            if (!started) {
              ctx.moveTo(x, y)
              started = true
            } else ctx.lineTo(x, y)
          })
          ctx.strokeStyle = series.color
          ctx.lineWidth = 1.3
          ctx.stroke()
        })
        ctx.fillStyle = '#787b86'
        ctx.font = '11px IBM Plex Sans'
        ctx.textAlign = 'left'
        ctx.fillText(pane.toUpperCase(), PAD.left + 6, top + 8)
      })

      drawings.forEach((d) => {
        drawShape(ctx, d, mapX, mapY, { width, height: PAD.top + chartH })
      })

      if (hover) {
        const x = xScale.x(hover.index)
        const y = yScale.y(hover.price)
        ctx.strokeStyle = '#787b86'
        ctx.setLineDash([4, 4])
        ctx.beginPath()
        ctx.moveTo(x, PAD.top)
        ctx.lineTo(x, PAD.top + chartH)
        ctx.moveTo(PAD.left, y)
        ctx.lineTo(width - PAD.right, y)
        ctx.stroke()
        ctx.setLineDash([])
        ctx.fillStyle = '#2962ff'
        ctx.fillRect(width - PAD.right, y - 9, PAD.right, 18)
        ctx.fillStyle = '#fff'
        ctx.textAlign = 'left'
        ctx.fillText(formatPrice(hover.price), width - PAD.right + 8, y + 4)
        if (candles[hover.index]) {
          ctx.fillStyle = '#2962ff'
          ctx.fillRect(x - 54, height - 22, 108, 18)
          ctx.fillStyle = '#fff'
          ctx.textAlign = 'center'
          ctx.fillText(formatTime(candles[hover.index].time, intervalMs), x, height - 9)
        }
      }

      wrap._chartMap = {
        start,
        end,
        mapX,
        mapY,
        yScale,
        xScale,
        chartH,
        width,
        height
      }
    }

    draw()
    const ro = new ResizeObserver(draw)
    ro.observe(wrap)
    return () => ro.disconnect()
  }, [candles, chartType, indicators, drawings, offset, visible, hover, intervalMs])

  const pointFromEvent = (event) => {
    const map = wrapRef.current?._chartMap
    if (!map) return null
    const rect = canvasRef.current.getBoundingClientRect()
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top
    const index = Math.round(map.xScale.index(x))
    const clamped = Math.max(0, Math.min(candles.length - 1, index))
    const price = map.yScale.price(y)
    return { x, y, index: clamped, price, map }
  }

  const onPointerDown = (event) => {
    const p = pointFromEvent(event)
    if (!p) return
    canvasRef.current.setPointerCapture(event.pointerId)
    if (tool === 'eraser') {
      const hit = [...drawings].reverse().find((d) => hitDrawing(d, p.x, p.y, p.map.mapX, p.map.mapY, p.map))
      if (hit) onErase(hit.id)
      return
    }
    if (['trend', 'ray', 'hline', 'vline', 'rect', 'fib', 'text'].includes(tool)) {
      drag.current = { mode: 'draw', start: p }
      onDrawStart(tool, p)
      return
    }
    drag.current = { mode: 'pan', x: event.clientX, offset }
  }

  const onPointerMove = (event) => {
    const p = pointFromEvent(event)
    if (p) onHover(p)
    if (!drag.current) return
    if (drag.current.mode === 'draw' && p) onDrawMove(p)
    if (drag.current.mode === 'pan') {
      const dx = event.clientX - drag.current.x
      const slots = wrapRef.current?._chartMap?.xScale.slot || 8
      onPan(drag.current.offset + Math.round(dx / slots))
    }
  }

  const onPointerUp = (event) => {
    if (drag.current?.mode === 'draw') {
      const p = pointFromEvent(event)
      if (p) onDrawEnd(p)
    }
    drag.current = null
  }

  const onWheel = (event) => {
    event.preventDefault()
    onZoom(event.deltaY)
  }

  return (
    <div className="tv-chart-wrap" ref={wrapRef}>
      <canvas
        ref={canvasRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => onHover(null)}
        onWheel={onWheel}
      />
    </div>
  )
}
