const raids = [
  { name: 'Obsidian Keep', time: 'Tonight 21:00', status: 'Ready', lead: 'Mira' },
  { name: 'Ashen Vault', time: 'Fri 19:30', status: 'Needs 3', lead: 'Torren' },
  { name: 'Skyforge', time: 'Sat 16:00', status: 'Full', lead: 'Kael' }
]

const activity = [
  { who: 'Lira', what: 'deposited 2,400 gold', when: '8m ago' },
  { who: 'Dax', what: 'signed for Skyforge', when: '22m ago' },
  { who: 'Nyx', what: 'posted strategy notes', when: '1h ago' },
  { who: 'Vale', what: 'promoted to Officer', when: '3h ago' }
]

export default function Dashboard() {
  return (
    <div className="cb-grid">
      <div className="cb-grid cb-grid-4">
        <div className="cb-card cb-kpi">
          <span>Clan Power</span>
          <strong>184,220</strong>
          <em>+4.8% this week</em>
        </div>
        <div className="cb-card cb-kpi">
          <span>Active Members</span>
          <strong>62 / 80</strong>
          <em>48 online</em>
        </div>
        <div className="cb-card cb-kpi">
          <span>Treasury</span>
          <strong>91,450g</strong>
          <em>Raid tax 8%</em>
        </div>
        <div className="cb-card cb-kpi">
          <span>Win Rate</span>
          <strong>73%</strong>
          <em>Last 20 wars</em>
        </div>
      </div>
      <div className="cb-grid cb-grid-2">
        <div className="cb-card">
          <h3>Upcoming Raids</h3>
          <table className="cb-table">
            <thead>
              <tr>
                <th>Instance</th>
                <th>Time</th>
                <th>Lead</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {raids.map((raid) => (
                <tr key={raid.name}>
                  <td>{raid.name}</td>
                  <td>{raid.time}</td>
                  <td>{raid.lead}</td>
                  <td>{raid.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="cb-card">
          <h3>Clan Feed</h3>
          {activity.map((item) => (
            <div className="cb-row" key={item.what}>
              <div>
                <strong>{item.who}</strong>
                <div className="cb-muted">{item.what}</div>
              </div>
              <span className="cb-muted">{item.when}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
