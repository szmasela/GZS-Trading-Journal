// ============================================================================
// GET /api/journal/health — row counts for the signed-in user.
//
// The fastest way to tell "the deploy is fine but the database credentials
// aren't" from "the deploy is broken" without opening the Neon console.
// ============================================================================

import { handleJournalRequest } from '../../server/journal.mjs'

export default function handler(req, res) {
  return handleJournalRequest(req, res, { route: '/api/journal/health' })
}
