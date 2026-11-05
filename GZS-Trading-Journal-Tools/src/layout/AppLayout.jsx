import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { NAV_ITEMS } from './nav.js'
import NavIcon from './NavIcon.jsx'

const PAGE_TITLES = {
  '/': 'Dashboard',
  '/tradingview': 'TradingView',
  '/calendar': 'Calendar',
  '/members': 'Members',
  '/chat': 'Chat',
  '/events': 'Events',
  '/treasury': 'Treasury',
  '/settings': 'Settings'
}

export default function AppLayout() {
  const { pathname } = useLocation()
  const isChart = pathname === '/tradingview'
  const title = PAGE_TITLES[pathname] || 'ClanBook'

  return (
    <div className={`cb-shell${isChart ? ' cb-shell--chart' : ''}`}>
      <aside className="cb-sidebar">
        <div className="cb-brand">
          <div className="cb-mark">CB</div>
          <div>
            <div className="cb-brand-name">ClanBook</div>
            <div className="cb-brand-sub">Iron Ledger</div>
          </div>
        </div>
        <nav className="cb-nav" aria-label="Main">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) => `cb-nav-item${isActive ? ' is-active' : ''}`}
            >
              <NavIcon name={item.icon} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="cb-user">
          <div className="cb-avatar">KA</div>
          <div>
            <div className="cb-user-name">Kael Ardent</div>
            <div className="cb-user-role">Warlord</div>
          </div>
        </div>
      </aside>
      <div className="cb-main">
        {!isChart && (
          <header className="cb-topbar">
            <h1>{title}</h1>
            <div className="cb-topbar-meta">
              <span className="cb-pill">Season 14</span>
              <span className="cb-pill cb-pill--live">Online 48</span>
            </div>
          </header>
        )}
        <div className={`cb-content${isChart ? ' cb-content--fill' : ''}`}>
          <Outlet />
        </div>
      </div>
    </div>
  )
}
