const rows = [
  { item: 'Raid tax', amount: '+7,200g', note: 'Obsidian Keep' },
  { item: 'Repair fund', amount: '-1,150g', note: 'Guild repairs' },
  { item: 'Craft subsidy', amount: '-800g', note: 'Flasks' },
  { item: 'Donation', amount: '+2,000g', note: 'Nyx Vale' }
]

export default function Treasury() {
  return (
    <div className="cb-card">
      <h3>Ledger</h3>
      <table className="cb-table">
        <thead>
          <tr>
            <th>Entry</th>
            <th>Amount</th>
            <th>Note</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.item}>
              <td>{row.item}</td>
              <td>{row.amount}</td>
              <td>{row.note}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
