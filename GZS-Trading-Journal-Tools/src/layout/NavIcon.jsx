const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round',
  strokeLinejoin: 'round'
}

export default function NavIcon({ name }) {
  switch (name) {
    case 'grid':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="3.5" y="3.5" width="7" height="7" rx="1.4" {...stroke} />
          <rect x="13.5" y="3.5" width="7" height="7" rx="1.4" {...stroke} />
          <rect x="3.5" y="13.5" width="7" height="7" rx="1.4" {...stroke} />
          <rect x="13.5" y="13.5" width="7" height="7" rx="1.4" {...stroke} />
        </svg>
      )
    case 'chart':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 19V5" {...stroke} />
          <path d="M4 19h16" {...stroke} />
          <path d="M7 15l4-5 3 3 5-7" {...stroke} />
        </svg>
      )
    case 'calendar':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="3.5" y="5" width="17" height="15.5" rx="2" {...stroke} />
          <path d="M8 3.5v4M16 3.5v4M3.5 10h17" {...stroke} />
        </svg>
      )
    case 'users':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="9" cy="8" r="3" {...stroke} />
          <path d="M3.8 19c.6-3 2.7-4.6 5.2-4.6S13.6 16 14.2 19" {...stroke} />
          <circle cx="16.5" cy="8.5" r="2.4" {...stroke} />
          <path d="M16.2 14.6c2 .2 3.6 1.5 4.2 4.4" {...stroke} />
        </svg>
      )
    case 'chat':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 6.5h14a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5H9l-4.5 3V8A1.5 1.5 0 0 1 5 6.5z" {...stroke} />
        </svg>
      )
    case 'flag':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 21V4.5" {...stroke} />
          <path d="M6 5h11l-2.2 3.4L17 12H6" {...stroke} />
        </svg>
      )
    case 'coin':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <ellipse cx="12" cy="7" rx="7.5" ry="3.2" {...stroke} />
          <path d="M4.5 7v10c0 1.8 3.4 3.2 7.5 3.2s7.5-1.4 7.5-3.2V7" {...stroke} />
          <path d="M4.5 12c0 1.8 3.4 3.2 7.5 3.2s7.5-1.4 7.5-3.2" {...stroke} />
        </svg>
      )
    case 'gear':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="3.1" {...stroke} />
          <path d="M12 3.6v2.2M12 18.2v2.2M4.8 7.4l1.9 1.1M17.3 15.5l1.9 1.1M4.8 16.6l1.9-1.1M17.3 8.5l1.9-1.1M3.6 12h2.2M18.2 12h2.2" {...stroke} />
        </svg>
      )
    default:
      return null
  }
}
