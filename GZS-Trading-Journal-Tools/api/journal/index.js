// ============================================================================
// GET /api/journal — the whole journal for the signed-in user.
//
// A Vercel Function. It is a thin wrapper: all routing, auth and SQL live in
// server/journal.mjs, which the Vite dev middleware uses too. The route is
// passed explicitly rather than read from req.url, so this file keeps working
// whatever path rewriting the host applies.
// ============================================================================

import { handleJournalRequest } from '../../server/journal.mjs'

export default function handler(req, res) {
  return handleJournalRequest(req, res, { route: '/api/journal' })
}
