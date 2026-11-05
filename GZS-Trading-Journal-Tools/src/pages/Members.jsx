const members = [
  { name: 'Kael Ardent', role: 'Warlord', class: 'Guardian', power: 12480 },
  { name: 'Mira Voss', role: 'Officer', class: 'Ranger', power: 11820 },
  { name: 'Torren Hale', role: 'Officer', class: 'Berserker', power: 11240 },
  { name: 'Lira Quen', role: 'Treasurer', class: 'Mystic', power: 10110 },
  { name: 'Dax Rune', role: 'Raider', class: 'Assassin', power: 9870 },
  { name: 'Nyx Vale', role: 'Raider', class: 'Warlock', power: 9640 }
]

export default function Members() {
  return (
    <div className="cb-card">
      <h3>Roster</h3>
      {members.map((member) => (
        <div className="cb-member" key={member.name}>
          <div className="cb-avatar">{member.name.slice(0, 2).toUpperCase()}</div>
          <div style={{ flex: 1 }}>
            <strong>{member.name}</strong>
            <div className="cb-muted">
              {member.role} · {member.class}
            </div>
          </div>
          <div>{member.power.toLocaleString()} GS</div>
        </div>
      ))}
    </div>
  )
}
