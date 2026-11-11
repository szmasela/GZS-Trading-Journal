// ============================================================================
// Hard-deletes tombstones older than the retention window.
//
//   npm run db:purge          # 30 days (the default)
//   npm run db:purge -- 7     # custom window, in days
//
// Tombstones exist so other devices can tell a deliberate deletion from a
// missing row. Once every device has had a chance to sync, the row (and its
// snapshots, via the foreign key cascade) can go for good. The API also runs
// this opportunistically at most once an hour, so the script is mainly for
// reclaiming space on demand.
// ============================================================================

import { query } from '../server/db.mjs'

const days = Math.max(1, Number(process.argv[2]) || 30)

const rows = await query(
  `with gone as (
     delete from trades
      where deleted_at is not null
        and deleted_at < now() - ($1 || ' days')::interval
      returning id
   )
   select count(*)::int as purged from gone`,
  [String(days)],
)

const purged = rows[0]?.purged ?? 0
console.log(`Purged ${purged} tombstone${purged === 1 ? '' : 's'} older than ${days} day${days === 1 ? '' : 's'}.`)
