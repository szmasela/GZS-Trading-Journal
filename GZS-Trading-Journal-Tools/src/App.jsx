import { Navigate, Route, Routes } from 'react-router-dom'
import AppLayout from './layout/AppLayout.jsx'
import Dashboard from './pages/Dashboard.jsx'
import TradingViewPage from './pages/TradingViewPage.jsx'
import CalendarPage from './pages/CalendarPage.jsx'
import Members from './pages/Members.jsx'
import Chat from './pages/Chat.jsx'
import Events from './pages/Events.jsx'
import Treasury from './pages/Treasury.jsx'
import Settings from './pages/Settings.jsx'

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/tradingview" element={<TradingViewPage />} />
        <Route path="/calendar" element={<CalendarPage />} />
        <Route path="/members" element={<Members />} />
        <Route path="/chat" element={<Chat />} />
        <Route path="/events" element={<Events />} />
        <Route path="/treasury" element={<Treasury />} />
        <Route path="/settings" element={<Settings />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
