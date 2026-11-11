// ============================================================================
// GET /api/journal/photos?cursor=<n>&limit=<n> — chart snapshots, a page at a
// time.
//
// Photos are base64 JPEGs and a serverless response is capped at a few MB, so
// they cannot ride along with every full-journal read once a journal grows.
// GET /api/journal?photos=0 returns the trades without them, then the client
// walks this route until `nextCursor` is null.
// ============================================================================

import { handleJournalRequest } from '../../server/journal.mjs'

export default function handler(req, res) {
  return handleJournalRequest(req, res, { route: '/api/journal/photos' })
}
