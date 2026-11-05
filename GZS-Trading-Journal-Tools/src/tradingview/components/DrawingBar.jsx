import { TOOLS } from '../chart/drawings.js'

export default function DrawingBar({ tool, onTool, onClear }) {
  return (
    <div className="tv-drawbar">
      {TOOLS.map((item) => (
        <button
          key={item.id}
          type="button"
          title={item.label}
          className={tool === item.id ? 'is-on' : ''}
          onClick={() => onTool(item.id)}
        >
          {item.label}
        </button>
      ))}
      <button type="button" onClick={onClear}>
        Clear
      </button>
    </div>
  )
}
