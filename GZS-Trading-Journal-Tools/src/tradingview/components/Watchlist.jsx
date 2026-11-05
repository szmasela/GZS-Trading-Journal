import { formatChange, formatPrice } from '../utils/format.js'

export default function Watchlist({ tickers, symbol, onSelect }) {
  return (
    <aside className="tv-watch">
      <div className="tv-watch-head">Watchlist</div>
      <div className="tv-watch-list">
        {tickers.map((row) => (
          <button
            key={row.symbol}
            type="button"
            className={`tv-watch-row${row.symbol === symbol ? ' is-on' : ''}`}
            onClick={() => onSelect(row.symbol)}
          >
            <span>{row.symbol.replace('USDT', '')}</span>
            <span>{formatPrice(row.price)}</span>
            <span className={row.change >= 0 ? 'tv-up' : 'tv-down'}>{formatChange(row.change)}</span>
          </button>
        ))}
      </div>
    </aside>
  )
}
