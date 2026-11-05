import { useMemo, useState } from 'react'
import { SYMBOLS } from '../data/symbols.js'

export default function SymbolSearch({ open, onClose, onSelect }) {
  const [q, setQ] = useState('')
  const list = useMemo(() => {
    const query = q.trim().toUpperCase()
    if (!query) return SYMBOLS
    return SYMBOLS.filter(
      (s) => s.symbol.includes(query) || s.name.toUpperCase().includes(query) || s.base.includes(query)
    )
  }, [q])

  if (!open) return null

  return (
    <div className="tv-modal" onClick={onClose}>
      <div className="tv-modal-card" onClick={(e) => e.stopPropagation()}>
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search symbol"
        />
        <div className="tv-modal-list">
          {list.map((s) => (
            <button
              key={s.symbol}
              type="button"
              onClick={() => {
                onSelect(s.symbol)
                onClose()
              }}
            >
              <strong>{s.symbol}</strong>
              <span>{s.name}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
