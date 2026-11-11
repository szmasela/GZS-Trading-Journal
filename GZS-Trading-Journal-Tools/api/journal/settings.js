// ============================================================================
// POST /api/journal/settings — instruments, sessions, balance, dashboard layout.
//
// Only the keys present in the body are replaced. See server/journal.mjs.
// ============================================================================

import { handleJournalRequest } from '../../server/journal.mjs'

export default function handler(req, res) {
  return handleJournalRequest(req, res, { route: '/api/journal/settings' })
}
