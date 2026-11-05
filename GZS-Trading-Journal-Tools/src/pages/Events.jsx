const events = [
  { title: 'Season 14 Kickoff', date: 'Nov 8', detail: 'Alliance-wide briefing and loot rules.' },
  { title: 'Recruit Showcase', date: 'Nov 12', detail: 'Trials for DPS and support roles.' },
  { title: 'Forge Night', date: 'Nov 18', detail: 'Craft legendary weapons as a group.' }
]

export default function Events() {
  return (
    <div className="cb-grid">
      {events.map((event) => (
        <div className="cb-card" key={event.title}>
          <div className="cb-muted">{event.date}</div>
          <h3>{event.title}</h3>
          <p>{event.detail}</p>
        </div>
      ))}
    </div>
  )
}
