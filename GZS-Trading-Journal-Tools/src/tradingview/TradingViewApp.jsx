import { useCallback, useEffect, useMemo, useState } from 'react'
import ChartCanvas from './chart/ChartCanvas.jsx'
import { createDrawing, updateDrawing } from './chart/drawings.js'
import DrawingBar from './components/DrawingBar.jsx'
import SymbolSearch from './components/SymbolSearch.jsx'
import Toolbar from './components/Toolbar.jsx'
import Watchlist from './components/Watchlist.jsx'
import { computeIndicator } from './data/indicators.js'
import { fetchKlines, fetchTickers } from './data/market.js'
import { SYMBOLS, TIMEFRAMES } from './data/symbols.js'
import './tradingview.css'

export default function TradingViewApp() {
  const [symbol, setSymbol] = useState('BTCUSDT')
  const [timeframe, setTimeframe] = useState('1h')
  const [chartType, setChartType] = useState('candles')
  const [candles, setCandles] = useState([])
  const [live, setLive] = useState(false)
  const [tickers, setTickers] = useState([])
  const [activeIndicators, setActiveIndicators] = useState(['MA', 'VOL'])
  const [tool, setTool] = useState('cross')
  const [drawings, setDrawings] = useState([])
  const [draft, setDraft] = useState(null)
  const [offset, setOffset] = useState(0)
  const [visible, setVisible] = useState(120)
  const [hover, setHover] = useState(null)
  const [searchOpen, setSearchOpen] = useState(false)

  const tf = TIMEFRAMES.find((item) => item.id === timeframe) || TIMEFRAMES[3]

  useEffect(() => {
    let cancelled = false
    fetchKlines(symbol, tf.interval, tf.ms).then((result) => {
      if (cancelled) return
      setCandles(result.candles)
      setLive(result.live)
      setOffset(0)
    })
    return () => {
      cancelled = true
    }
  }, [symbol, tf.interval, tf.ms])

  useEffect(() => {
    let cancelled = false
    const load = () => {
      fetchTickers(SYMBOLS.map((s) => s.symbol)).then((rows) => {
        if (!cancelled) setTickers(rows)
      })
    }
    load()
    const id = setInterval(load, 15000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [])

  const indicators = useMemo(
    () => activeIndicators.map((id) => computeIndicator(candles, id)),
    [activeIndicators, candles]
  )

  const last = candles[candles.length - 1]
  const allDrawings = draft ? [...drawings, draft] : drawings

  const onToggleIndicator = (id) => {
    setActiveIndicators((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    )
  }

  const onDrawStart = useCallback((nextTool, point) => {
    setDraft(createDrawing(nextTool, point))
  }, [])

  const onDrawMove = useCallback((point) => {
    setDraft((current) => (current ? updateDrawing(current, point) : current))
  }, [])

  const onDrawEnd = useCallback((point) => {
    setDraft((current) => {
      if (!current) return null
      setDrawings((list) => [...list, updateDrawing(current, point)])
      return null
    })
    setTool('cross')
  }, [])

  const onErase = useCallback((id) => {
    setDrawings((list) => list.filter((item) => item.id !== id))
  }, [])

  const onPan = useCallback(
    (next) => {
      const max = Math.max(0, candles.length - 20)
      setOffset(Math.max(0, Math.min(max, next)))
    },
    [candles.length]
  )

  const onZoom = useCallback((delta) => {
    setVisible((current) => Math.max(30, Math.min(300, current + (delta > 0 ? 12 : -12))))
  }, [])

  return (
    <div className="tv-root">
      <Toolbar
        symbol={symbol}
        timeframe={timeframe}
        chartType={chartType}
        live={live}
        last={last}
        onTimeframe={setTimeframe}
        onChartType={setChartType}
        onToggleIndicator={onToggleIndicator}
        activeIndicators={activeIndicators}
        onSearch={() => setSearchOpen(true)}
      />
      <div className="tv-body">
        <DrawingBar tool={tool} onTool={setTool} onClear={() => setDrawings([])} />
        <ChartCanvas
          candles={candles}
          chartType={chartType}
          indicators={indicators}
          drawings={allDrawings}
          tool={tool}
          intervalMs={tf.ms}
          offset={offset}
          visible={visible}
          hover={hover}
          onHover={setHover}
          onPan={onPan}
          onZoom={onZoom}
          onDrawStart={onDrawStart}
          onDrawMove={onDrawMove}
          onDrawEnd={onDrawEnd}
          onErase={onErase}
        />
        <Watchlist tickers={tickers} symbol={symbol} onSelect={setSymbol} />
      </div>
      <div className="tv-status">
        <span>{symbol} · {tf.label}</span>
        {hover && candles[hover.index] && (
          <span>
            {new Date(candles[hover.index].time).toUTCString()} · {hover.price.toFixed(hover.price < 1 ? 4 : 2)}
          </span>
        )}
        <span>Draw with the left toolbar · Scroll to zoom · Drag to pan</span>
      </div>
      <SymbolSearch open={searchOpen} onClose={() => setSearchOpen(false)} onSelect={setSymbol} />
    </div>
  )
}
