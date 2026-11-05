export default function Settings() {
  return (
    <div className="cb-grid cb-grid-2">
      <div className="cb-card">
        <h3>Clan Profile</h3>
        <div className="cb-row">
          <span>Name</span>
          <strong>Iron Ledger</strong>
        </div>
        <div className="cb-row">
          <span>Realm</span>
          <strong>Northwatch</strong>
        </div>
        <div className="cb-row">
          <span>Recruiting</span>
          <strong>Open</strong>
        </div>
      </div>
      <div className="cb-card">
        <h3>Preferences</h3>
        <div className="cb-row">
          <span>Notifications</span>
          <strong>Raids, wars, treasury</strong>
        </div>
        <div className="cb-row">
          <span>Default page</span>
          <strong>Dashboard</strong>
        </div>
      </div>
    </div>
  )
}
