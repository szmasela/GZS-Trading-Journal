// ============================================================================
// POST /api/journal/sync — { upserts: [trade], deletes: [id] }
//
// See server/journal.mjs for the actual work. Kept as its own file so the
// function's path is its route: no catch-all, nothing to misconfigure.
// ============================================================================

import { handleJournalRequest } from '../../server/journal.mjs'

export default function handler(req, res) {
  return handleJournalRequest(req, res, { route: '/api/journal/sync' })
}
