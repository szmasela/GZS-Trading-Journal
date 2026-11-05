const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const events = {
  5: 'War briefing',
  7: 'Obsidian Keep',
  12: 'Recruit night',
  14: 'Skyforge',
  20: 'Alliance summit',
  22: 'Ashen Vault'
}

export default function CalendarPage() {
  return (
    <div className="cb-card">
      <h3>November 2026</h3>
      <div className="cb-cal">
        {days.map((day) => (
          <div className="cb-cal-head" key={day}>
            {day}
          </div>
        ))}
        {Array.from({ length: 30 }, (_, i) => i + 1).map((day) => (
          <div className={`cb-cal-day${day === 5 ? ' is-today' : ''}`} key={day}>
            <strong>{day}</strong>
            {events[day] && <div className="cb-event">{events[day]}</div>}
          </div>
        ))}
      </div>
    </div>
  )
}
