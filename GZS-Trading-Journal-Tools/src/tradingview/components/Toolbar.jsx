import { CHART_TYPES, TIMEFRAMES } from '../data/symbols.js'
import { INDICATOR_OPTIONS } from '../data/indicators.js'

export default function Toolbar({
  symbol,
  timeframe,
  chartType,
  live,
  last,
  onTimeframe,
  onChartType,
  onToggleIndicator,
  activeIndicators,
  onSearch
}) {
  const change = last ? ((last.close - last.open) / last.open) * 100 : 0
  const up = change >= 0

  return (
    <div className="tv-toolbar">
      <button className="tv-symbol-btn" onClick={onSearch} type="button">
        {symbol}
      </button>
      <div className="tv-ohlc">
        {last && (
          <>
            <span>O {last.open.toFixed(last.open < 1 ? 4 : 2)}</span>
            <span>H {last.high.toFixed(last.high < 1 ? 4 : 2)}</span>
            <span>L {last.low.toFixed(last.low < 1 ? 4 : 2)}</span>
            <span className={up ? 'tv-up' : 'tv-down'}>
              C {last.close.toFixed(last.close < 1 ? 4 : 2)} {up ? '+' : ''}
              {change.toFixed(2)}%
            </span>
          </>
        )}
      </div>
      <div className="tv-tf">
        {TIMEFRAMES.map((tf) => (
          <button
            key={tf.id}
            type="button"
            className={tf.id === timeframe ? 'is-on' : ''}
            onClick={() => onTimeframe(tf.id)}
          >
            {tf.label}
          </button>
        ))}
      </div>
      <div className="tv-tf">
        {CHART_TYPES.map((ct) => (
          <button
            key={ct.id}
            type="button"
            className={ct.id === chartType ? 'is-on' : ''}
            onClick={() => onChartType(ct.id)}
          >
            {ct.label}
          </button>
        ))}
      </div>
      <div className="tv-tf">
        {INDICATOR_OPTIONS.map((opt) => (
          <button
            key={opt.id}
            type="button"
            className={activeIndicators.includes(opt.id) ? 'is-on' : ''}
            onClick={() => onToggleIndicator(opt.id)}
          >
            {opt.label}
          </button>
        ))}
      </div>
      <span className={`tv-live${live ? ' is-live' : ''}`}>{live ? 'BINANCE LIVE' : 'SIMULATED'}</span>
    </div>
  )
}
