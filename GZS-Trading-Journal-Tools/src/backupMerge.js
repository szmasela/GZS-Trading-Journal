// ============================================================================
// Backup import — safe comparison & merge engine.
//
// Loading a backup MERGES into the existing database instead of replacing it:
//   • trades only in the backup        -> imported
//   • trades in both (same id/fingerprint) -> matched, never duplicated
//   • trades only in the current database  -> always kept
//   • differing records                -> existing record wins; missing fields
//                                         (photos, notes, exit data…) are
//                                         back-filled from the backup
//
// Matching: stable trade id first; fallback fingerprint of
// symbol|direction|entryDate|entryPrice|quantity (never instrument+price alone).
// ============================================================================

// Fields compared when deciding whether a matched record has differences
const TRADE_COMPARE_KEYS = [
  'symbol', 'direction', 'entryDate', 'exitDate', 'entryPrice', 'exitPrice',
  'quantity', 'pnl', 'strategy', 'tags', 'notes', 'sessionId', 'sessionName',
  'sessionColor', 'commission', 'swap', 'fees', 'pips', 'entryPhoto', 'exitPhoto'
]

export function tradeFingerprint(t) {
  return ['symbol', 'direction', 'entryDate', 'entryPrice', 'quantity']
    .map((k) => String((t && t[k]) ?? '').trim().toLowerCase())
    .join('|')
}

function isEmptyValue(v) {
  return v === '' || v === null || v === undefined
}

function sameValue(a, b) {
  return String(a) === String(b)
}

/**
 * Merge incoming (backup) trades into the current trade list.
 * @returns {{merged: Array, added: number, matched: number, differences: number, deleted: number}}
 */
export function mergeTradeCollections(current, incoming) {
  const cur = Array.isArray(current) ? current.slice() : []
  const inc = Array.isArray(incoming) ? incoming.filter((t) => t && typeof t === 'object' && !Array.isArray(t)) : []

  const idIndex = new Map()
  const fpIndex = new Map()
  cur.forEach((t, i) => {
    if (t?.id && !idIndex.has(t.id)) idIndex.set(t.id, i)
    const fp = tradeFingerprint(t)
    if (fp !== '||||' && !fpIndex.has(fp)) fpIndex.set(fp, i)
  })

  const merged = cur
  let added = 0
  let matched = 0
  let differences = 0

  inc.forEach((t) => {
    let idx = t.id && idIndex.has(t.id) ? idIndex.get(t.id) : null
    if (idx == null) {
      const fp = tradeFingerprint(t)
      if (fp !== '||||' && fpIndex.has(fp)) idx = fpIndex.get(fp)
    }

    // Trade only in the backup -> import it (preserve id where possible)
    if (idx == null) {
      const trade = { ...t }
      if (!trade.id) trade.id = `trade_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
      idIndex.set(trade.id, merged.length)
      const fp = tradeFingerprint(trade)
      if (fp !== '||||') fpIndex.set(fp, merged.length)
      merged.push(trade)
      added++
      return
    }

    // Trade exists in both -> never duplicate; keep existing record and only
    // back-fill fields that are empty in the current database.
    matched++
    const existing = merged[idx]
    let differs = false
    TRADE_COMPARE_KEYS.forEach((k) => {
      const a = existing[k]
      const b = t[k]
      if (isEmptyValue(a) && !isEmptyValue(b)) {
        existing[k] = b
        differs = true
      } else if (!isEmptyValue(a) && !isEmptyValue(b) && !sameValue(a, b)) {
        differs = true // conflicting values — existing record is kept
      }
    })
    if (differs) differences++
  })

  return { merged, added, matched, differences, deleted: 0 }
}

/**
 * Merge settings collections (instruments / sessions / balance adjustments)
 * union-style: current data always kept, backup-only entries appended.
 */
export function mergeSettings(currentInstruments, currentSessions, currentAdjustments, data) {
  const instruments = Array.isArray(currentInstruments) ? currentInstruments.slice() : []
  const addedInstruments = (Array.isArray(data.instruments) ? data.instruments : [])
    .filter((i) => i && !instruments.some((x) => String(x).toLowerCase() === String(i).toLowerCase()))

  const sessions = Array.isArray(currentSessions) ? currentSessions.slice() : []
  const addedSessions = (Array.isArray(data.sessions) ? data.sessions : [])
    .filter((s) => s && s.id && !sessions.some((x) => x.id === s.id) && !sessions.some((x) => String(x.name).toLowerCase() === String(s.name).toLowerCase()))

  const adjustments = Array.isArray(currentAdjustments) ? currentAdjustments.slice() : []
  const addedAdjustments = (Array.isArray(data.balanceAdjustments) ? data.balanceAdjustments : [])
    .filter((a) => a && a.id && !adjustments.some((x) => x.id === a.id))

  return {
    instruments,
    sessions,
    adjustments,
    addedInstruments: addedInstruments.length,
    addedSessions: addedSessions.length,
    addedAdjustments: addedAdjustments.length,
    instrumentsMerged: [...instruments, ...addedInstruments],
    sessionsMerged: [...sessions, ...addedSessions],
    adjustmentsMerged: [...adjustments, ...addedAdjustments]
  }
}
