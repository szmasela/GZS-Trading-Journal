import { CHART_CONFIG } from './config.js'
import { getSpec, normalizeSymbol, calcPips, calcMoney, fmtPrice, isAutoCalc, pickSession } from './instruments.js'
import { getQuote, STATUS_LABEL } from './prices.js'
import './tradingview.css'

// ---------------------------------------------------------------------------
// Symbol mapping between TradingView tickers and journal instrument names
// ---------------------------------------------------------------------------
const TV_ALIASES = {
  'FXPRO:XAUUSD': 'XAUUSD',
  'FXPRO:XAGUSD': 'XAGUSD',
  'OANDA:NAS100USD': 'US100',
  'OANDA:UK100GBP': 'UK100',
  'OANDA:US30USD': 'US30',
  'OANDA:US500USD': 'US500',
  'OANDA:DE30EUR': 'GER40',
  'OANDA:EURUSD': 'EURUSD',
  'OANDA:GBPUSD': 'GBPUSD',
  'OANDA:USDJPY': 'USDJPY',
  'OANDA:BTCUSD': 'BTCUSD'
}

const JOURNAL_ALIASES = {
  XAUUSD: 'FXPRO:XAUUSD',
  XAGUSD: 'FXPRO:XAGUSD',
  GOLD: 'FXPRO:XAUUSD',
  SILVER: 'FXPRO:XAGUSD',
  US100: 'OANDA:NAS100USD',
  NAS100: 'OANDA:NAS100USD',
  NASDAQ: 'OANDA:NAS100USD',
  UK100: 'OANDA:UK100GBP',
  FTSE: 'OANDA:UK100GBP',
  US30: 'OANDA:US30USD',
  DOW: 'OANDA:US30USD',
  US500: 'OANDA:US500USD',
  SP500: 'OANDA:US500USD',
  GER40: 'OANDA:DE30EUR',
  DAX: 'OANDA:DE30EUR',
  EURUSD: 'OANDA:EURUSD',
  GBPUSD: 'OANDA:GBPUSD',
  USDJPY: 'OANDA:USDJPY',
  BTCUSD: 'OANDA:BTCUSD',
  BTC: 'OANDA:BTCUSD'
}

const DEFAULT_TV_SYMBOLS = [
  'FXPRO:XAUUSD',
  'FXPRO:XAGUSD',
  'OANDA:BTCUSD',
  'OANDA:NAS100USD',
  'OANDA:UK100GBP',
  'OANDA:US30USD',
  'OANDA:EURUSD'
]

const INTERVALS = [
  ['1', '1m'],
  ['5', '5m'],
  ['15', '15m'],
  ['60', '1H'],
  ['240', '4H'],
  ['D', '1D'],
  ['W', '1W']
]

const SYMBOL_KEY = 'luxTVSymbol'
const INTERVAL_KEY = 'luxTVInterval'
// One record for the whole chart view: the symbol you were on and the
// timeframe you last used *per symbol* (XAUUSD on 5m, NAS100 on 1H, ...).
const VIEW_KEY = 'gzs.tv.view'
const POLL_MS = 10 * 1000

// The live TradingView widget instance — kept so the chart can be snapshotted
// for a trade's entry / exit picture.
let chartWidget = null

/**
 * Read the remembered chart view.
 *
 * TradingView's embed widget keeps its own colours/scales in the iframe, but
 * it forgets the symbol and timeframe between visits, so those live here.
 * Older builds stored them in two flat keys — still honoured on first run.
 */
function readView() {
  const legacySymbol = localStorage.getItem(SYMBOL_KEY) || ''
  const legacyInterval = localStorage.getItem(INTERVAL_KEY) || ''
  let stored = null
  try {
    stored = JSON.parse(localStorage.getItem(VIEW_KEY) || 'null')
  } catch {
    stored = null
  }
  const intervals = stored && stored.intervals && typeof stored.intervals === 'object' ? stored.intervals : {}
  const symbol =
    (stored && typeof stored.symbol === 'string' && stored.symbol) || legacySymbol || CHART_CONFIG.symbol
  const interval = intervals[symbol] || legacyInterval || CHART_CONFIG.interval
  return { symbol, interval, intervals: { ...intervals } }
}

/** Persist the chart view, keeping the legacy keys in sync for older code. */
function saveView(state) {
  const payload = {
    symbol: state.symbol,
    intervals: { ...state.intervals, [state.symbol]: state.interval }
  }
  try {
    localStorage.setItem(VIEW_KEY, JSON.stringify(payload))
    localStorage.setItem(SYMBOL_KEY, state.symbol)
    localStorage.setItem(INTERVAL_KEY, state.interval)
  } catch {
    /* storage full or blocked — the chart still works, it just won't remember */
  }
}

function journalSymbolFor(tvSymbol) {
  if (TV_ALIASES[tvSymbol]) return TV_ALIASES[tvSymbol]
  const base = tvSymbol.split(':').pop() || tvSymbol
  return base.replace(/(USD|GBP|EUR|JPY)$/, '') || base
}

function tvSymbolFor(journalName) {
  if (!journalName) return CHART_CONFIG.symbol
  const key = String(journalName).trim().toUpperCase()
  if (JOURNAL_ALIASES[key]) return JOURNAL_ALIASES[key]
  // fuzzy: a known TV symbol whose mapped journal name matches
  const tv = Object.keys(TV_ALIASES).find((s) => TV_ALIASES[s] === key)
  return tv || `FXPRO:${key}`
}

function localDateTime() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function loadChartScript() {
  if (window.TradingView) return Promise.resolve(window.TradingView)
  if (window.__tvChartScript) return window.__tvChartScript
  window.__tvChartScript = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://s3.tradingview.com/tv.js'
    script.async = true
    script.onload = () => resolve(window.TradingView)
    script.onerror = () => reject(new Error('TradingView chart failed to load'))
    document.head.appendChild(script)
  })
  return window.__tvChartScript
}

async function embedChart(target, config) {
  if (!target) return
  const signature = JSON.stringify(config)
  if (target.dataset.tvMounted === 'true' && target.dataset.tvConfig === signature) return
  target.innerHTML = ''
  target.dataset.tvMounted = 'true'
  target.dataset.tvConfig = signature
  const TradingView = await loadChartScript()
  if (target.dataset.tvConfig !== signature) return
  chartWidget = new TradingView.widget({
    ...config,
    width: '100%',
    height: '100%',
    hide_side_toolbar: false,
    hide_top_toolbar: false,
    withdateranges: true,
    details: true,
    watchlist: config.watchlist,
    container_id: target.id
  })
}

// ---------------------------------------------------------------------------
// Chart snapshots — stored with the trade as its entry / exit picture
// ---------------------------------------------------------------------------
// The widget can render its own canvas (`imageCanvas()`), which is the only
// way to read the chart out of the cross-origin iframe. Note: TradingView's
// widget snapshot draws the price action, studies and axes, but NOT the
// line-tool drawings the user has added on top.
const SNAPSHOT_WIDTH = 800
const SNAPSHOT_QUALITY = 0.62

/** Snapshot the chart as a compact JPEG data URL ('' when unavailable). */
async function captureChart() {
  if (!chartWidget || typeof chartWidget.imageCanvas !== 'function') return ''
  try {
    const source = await chartWidget.imageCanvas()
    if (!source || !source.width || !source.height) return ''
    const scale = Math.min(1, SNAPSHOT_WIDTH / source.width)
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(source.width * scale)
    canvas.height = Math.round(source.height * scale)
    const ctx = canvas.getContext('2d')
    if (!ctx) return ''
    ctx.fillStyle = '#000000'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', SNAPSHOT_QUALITY)
  } catch {
    return ''
  }
}

function fmtMoney(value) {
  const n = Number(value) || 0
  const sign = n < 0 ? '-' : ''
  return `${sign}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtShortDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d)) return iso
  return d.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  })
}

// A trade is "active/open" only while it has neither an exit price nor an
// exit date — once either is recorded it's closed and must not be shown.
function isActiveTrade(t) {
  const hasExitPrice = t.exitPrice !== '' && t.exitPrice != null
  const hasExitDate = !!t.exitDate
  return !hasExitPrice && !hasExitDate
}

function pnlClass(value) {
  const n = Number(value) || 0
  return n > 0 ? 'pos' : n < 0 ? 'neg' : 'flat'
}

function buildActivePanel(panel) {
  const list = panel.querySelector('#tvActiveList')
  const countEl = panel.querySelector('#tvActiveCount')
  const label = panel.querySelector('#tvActiveSymbol')
  const badge = panel.querySelector('#tvLiveBadge')
  if (!list) return

  const state = panel.__tvState
  const journalName = normalizeSymbol(journalSymbolFor(state.symbol))
  label.textContent = journalName

  const open = (state.getTrades() || [])
    .filter((t) => normalizeSymbol(t.symbol) === journalName)
    .filter(isActiveTrade)
    .sort((a, b) => String(b.entryDate || '').localeCompare(String(a.entryDate || '')))

  countEl.textContent = open.length
    ? `${open.length} open`
    : ''

  // keep the collapsed/expanded state in sync with the user's choice
  panel.classList.toggle('collapsed', !state.panelOpen)
  const headEl = panel.querySelector('#tvActiveHead')

  // a trade logged while the panel is collapsed nudges the header so the
  // new position isn't missed
  const prevCount = Number(panel.dataset.count || 0)
  panel.dataset.count = String(open.length)
  if (headEl && !state.panelOpen && prevCount > 0 && open.length > prevCount) {
    headEl.classList.remove('tv-pulse')
    void headEl.offsetWidth
    headEl.classList.add('tv-pulse')
    setTimeout(() => headEl.classList.remove('tv-pulse'), 1400)
  }

  // With no open trades, only the Buy/Sell buttons remain — hide the panel
  panel.hidden = open.length === 0
  if (open.length === 0) {
    if (state.endHold) state.endHold()
    state.onOpenChanged && state.onOpenChanged([])
    return
  }

  list.innerHTML = open
    .map((t) => {
      const long = String(t.direction).toLowerCase() === 'long'
      const spec = getSpec(t.symbol)
      return `
        <div class="tv-active-row" data-id="${t.id}" data-symbol="${normalizeSymbol(t.symbol)}" title="Click to open this trade and edit its strategy and notes">
          <span class="tv-trade-side ${long ? 'long' : 'short'}">${long ? 'BUY' : 'SELL'}</span>
          <span class="tv-cell tv-open">${fmtPrice(t.entryPrice, spec)}</span>
          <span class="tv-cell">${t.quantity ?? '—'}</span>
          <span class="tv-cell tv-cur" data-role="market">…</span>
          <span class="tv-cell tv-pnl flat" data-role="pnl">…</span>
          <span class="tv-row-actions">
            <button type="button" class="tv-row-btn tv-close-btn" data-id="${t.id}" title="Close this trade at the current market price — saved immediately">Close</button>
          </span>
        </div>`
    })
    .join('')

  // The row itself opens the trade dialog (strategy + notes); the Close
  // button inside it saves the closing details immediately. They are
  // independent — Close never opens the dialog.

  list.querySelectorAll('.tv-active-row').forEach((row) => {
    row.onclick = (e) => {
      if (e.target.closest('.tv-close-btn')) return // handled by its own click
      const trade = (state.getTrades() || []).find((t) => t.id === row.dataset.id)
      if (!trade || !state.openTrade) return
      // exit fields are left untouched — this only opens the record for
      // strategy/notes editing, it never closes the trade
      state.openTrade({ ...trade, __focus: 'strategy' })
    }
  })

  list.querySelectorAll('.tv-close-btn').forEach((btn) => {
    btn.onclick = async (e) => {
      e.stopPropagation()
      const trade = (state.getTrades() || []).find((t) => t.id === btn.dataset.id)
      if (!trade) return

      // Closing needs a real price. Use the last live quote (XAUUSD) and
      // fetch one if the panel has none yet.
      let price = null
      const sym = normalizeSymbol(trade.symbol)
      if (isAutoCalc(sym)) {
        const cached = state.lastQuotes[sym]
        if (cached && cached.price != null) price = cached.price
        else {
          const q = await getQuote(sym)
          if (q && q.price != null) {
            state.lastQuotes[sym] = q
            price = q.price
          }
        }
      }

      if (price != null && state.closeTrade) {
        btn.disabled = true
        btn.textContent = '…'
        // keep the open-trades list visible across the row rebuild
        if (state.holdPanelOpen) state.holdPanelOpen()
        // snapshot the chart at the exit moment, before the row disappears
        const snapshot = await captureChart()
        const closed = await state.closeTrade(trade.id, price, snapshot)
        if (closed) return // row disappears via gzs:trades-changed
        if (state.endHold) state.endHold()
        btn.disabled = false
        btn.textContent = 'Close'
      }

      // No price available (instrument without a feed, or feed down): never
      // invent one — open the dialog so the exit price can be entered manually.
      if (state.openTrade) {
        state.openTrade({ ...trade, exitDate: localDateTime(), exitPrice: price != null ? price : '' })
      }
    }
  })

  state.onOpenChanged && state.onOpenChanged(open)
  updateLiveValues(panel)
}

/** Total floating P/L of the open trades, shown in the panel header. */
function setHeaderTotal(panel, value) {
  const el = panel.querySelector('#tvTotalPnl')
  if (!el) return
  if (value == null || !Number.isFinite(Number(value))) {
    el.textContent = '—'
    el.className = 'tv-total-pnl flat'
    return
  }
  const n = Number(value)
  el.textContent = `${n > 0 ? '+' : ''}${fmtMoney(n)}`
  el.className = 'tv-total-pnl ' + pnlClass(n)
}

/** Fetch quotes for every open symbol and patch the rows in place. */
async function updateLiveValues(panel) {
  const state = panel.__tvState
  if (!state) return
  const rows = [...panel.querySelectorAll('.tv-active-row')]
  if (!rows.length) return

  // Live calculation applies to XAUUSD only — every other instrument keeps
  // its existing manual behaviour (dashes, no price fetching).
  const liveRows = rows.filter((r) => isAutoCalc(r.dataset.symbol))
  rows.forEach((row) => {
    if (!liveRows.includes(row)) {
      const m = row.querySelector('[data-role=market]')
      const pnlEl = row.querySelector('[data-role=pnl]')
      if (m) m.textContent = '—'
      if (pnlEl) { pnlEl.textContent = '—'; pnlEl.className = 'tv-cell tv-pnl flat' }
    }
  })

  const badge = panel.querySelector('#tvLiveBadge')
  if (badge) badge.hidden = liveRows.length === 0
  setHeaderTotal(panel, null)

  const symbols = [...new Set(liveRows.map((r) => r.dataset.symbol))]
  if (!symbols.length) return
  const quotes = {}
  await Promise.all(symbols.map(async (sym) => {
    quotes[sym] = await getQuote(sym)
    state.lastQuotes[sym] = quotes[sym]
  }))

  // overall feed badge (worst status wins)
  if (badge) {
    const order = { live: 0, delayed: 1, unavailable: 2 }
    const worst = symbols
      .map((s) => quotes[s]?.status || 'unavailable')
      .sort((a, b) => order[b] - order[a])[0]
    badge.textContent = STATUS_LABEL[worst] || 'NO DATA'
    badge.className = 'tv-live-badge ' + worst
  }

  let totalPnl = 0
  let counted = 0

  liveRows.forEach((row) => {
    const q = quotes[row.dataset.symbol]
    const trade = (state.getTrades() || []).find((t) => t.id === row.dataset.id)
    if (!trade) return
    const spec = getSpec(trade.symbol)
    const pnlEl = row.querySelector('[data-role=pnl]')
    const mkt = row.querySelector('[data-role=market]')

    if (!q || q.price == null) {
      // feed unavailable — keep last known market price, show dashes for live values
      if (mkt) mkt.textContent = row.dataset.market || '—'
      if (pnlEl) { pnlEl.textContent = '—'; pnlEl.className = 'tv-cell tv-pnl flat' }
      return
    }

    const pips = calcPips({ direction: trade.direction, entryPrice: trade.entryPrice, currentPrice: q.price, spec })
    const floating = calcMoney({ pips, spec, quantity: trade.quantity })

    row.dataset.market = fmtPrice(q.price, spec)
    row.title = `${pips >= 0 ? '+' : ''}${Number(pips.toFixed(1))} pips · ${fmtShortDate(trade.entryDate)}`
    if (mkt) {
      mkt.textContent = fmtPrice(q.price, spec)
      mkt.className = 'tv-cell tv-cur ' + pnlClass(floating)
    }
    if (pnlEl) {
      pnlEl.textContent = fmtMoney(floating)
      pnlEl.className = 'tv-cell tv-pnl ' + pnlClass(floating)
    }
    totalPnl += floating
    counted += 1
  })

  setHeaderTotal(panel, counted ? totalPnl : null)
}

export function mountTradingView(host, api = {}) {
  if (!host) return

  const view = readView()
  const state = {
    symbol: view.symbol,
    interval: view.interval,
    intervals: view.intervals,
    openTrade: typeof api.openTrade === 'function' ? api.openTrade : null,
    addTrade: typeof api.addTrade === 'function' ? api.addTrade : null,
    closeTrade: typeof api.closeTrade === 'function' ? api.closeTrade : null,
    getTrades: typeof api.getTrades === 'function' ? api.getTrades : () => [],
    lastQuotes: {}
  }

  if (!host.querySelector('.tv-root')) {
    host.innerHTML = `
      <div class="tv-root">
        <div class="tv-topbar">
          <label class="tv-symbol-label">Symbol
            <select id="tvSymbolSelect" class="tv-symbol-select" aria-label="Chart symbol"></select>
          </label>
          <div class="tv-intervals" id="tvIntervals" role="group" aria-label="Chart interval"></div>
          <button type="button" id="tvFullscreen" class="tv-icon-btn" aria-pressed="false" title="Full screen (F)" aria-label="Full screen chart">⛶</button>
          <div class="tv-overlay">
            <div class="tv-quick">
              <button type="button" id="tvSell" class="tv-trade-btn tv-sell" title="Log a Short trade for this symbol">▼ Sell</button>
              <div class="tv-lot" id="tvLot" role="group" aria-label="Lot size for new trades">
                <button type="button" class="tv-lot-step" id="tvLotDown" aria-label="Decrease lot size" title="Decrease (Shift: 0.1)">−</button>
                <input id="tvLotInput" class="tv-lot-input" type="text" inputmode="decimal" autocomplete="off"
                       value="0.01" aria-label="Lot size" title="Lot size — type a value, or use ↑ ↓" />
                <button type="button" class="tv-lot-step" id="tvLotUp" aria-label="Increase lot size" title="Increase (Shift: 0.1)">+</button>
              </div>
              <button type="button" id="tvBuy" class="tv-trade-btn tv-buy" title="Log a Long trade for this symbol">▲ Buy</button>
            </div>
            <div class="tv-active collapsed" id="tvActivePanel">
              <div class="tv-active-head" id="tvActiveHead" title="Hover to show the open trades">
                <span class="tv-head-title">Trades · <b id="tvActiveSymbol"></b></span>
                <span class="tv-head-right">
                  <span id="tvLiveBadge" class="tv-live-badge">…</span>
                  <span id="tvTotalPnl" class="tv-total-pnl flat" title="Total floating P/L of the open trades shown">—</span>
                  <span id="tvActiveCount" class="tv-active-count"></span>
                  <span class="tv-chevron" aria-hidden="true">▾</span>
                </span>
              </div>
              <div class="tv-cols">
                <span></span>
                <span>open</span>
                <span>Lots</span>
                <span>Current</span>
                <span>P/L</span>
                <span></span>
              </div>
              <div class="tv-active-list" id="tvActiveList"></div>
            </div>
          </div>
        </div>
        <div class="tv-main">
          <section class="tv-panel tv-chart" id="tvChart" aria-label="Price chart"></section>
        </div>
      </div>
    `
  }

  const body = host.querySelector('.tv-root')

  // --- symbol select: defaults + every journal instrument -------------------
  const select = body.querySelector('#tvSymbolSelect')
  const journalSymbols = [...new Set((state.getTrades() || []).map((t) => String(t.symbol || '').trim().toUpperCase()).filter(Boolean))]
  const options = [...new Set([...DEFAULT_TV_SYMBOLS, ...journalSymbols.map(tvSymbolFor)])]
  select.innerHTML = options
    .map((tv) => `<option value="${tv}">${journalSymbolFor(tv)}</option>`)
    .join('')
  if (![...select.options].some((o) => o.value === state.symbol)) {
    state.symbol = CHART_CONFIG.symbol
    state.interval = state.intervals[state.symbol] || CHART_CONFIG.interval
    saveView(state)
  }
  select.value = state.symbol
  saveView(state)

  // Each symbol keeps its own timeframe: switching to NAS100 and back to
  // XAUUSD returns you to 5m, not to whatever the other symbol used.
  select.onchange = () => {
    const next = select.value
    if (!next || next === state.symbol) return
    state.intervals[state.symbol] = state.interval
    state.symbol = next
    state.interval = state.intervals[next] || CHART_CONFIG.interval
    saveView(state)
    syncIntervals()
    refresh()
  }

  // --- interval buttons ------------------------------------------------------
  const intervalWrap = body.querySelector('#tvIntervals')
  intervalWrap.innerHTML = INTERVALS.map(
    ([val, label]) => `<button type="button" class="tv-interval${val === state.interval ? ' active' : ''}" data-interval="${val}">${label}</button>`
  ).join('')

  function syncIntervals() {
    intervalWrap.querySelectorAll('.tv-interval').forEach((b) => {
      b.classList.toggle('active', b.dataset.interval === state.interval)
    })
  }

  intervalWrap.querySelectorAll('.tv-interval').forEach((btn) => {
    btn.onclick = () => {
      state.interval = btn.dataset.interval
      state.intervals[state.symbol] = state.interval
      saveView(state)
      syncIntervals()
      refresh()
    }
  })

  // --- Full screen -----------------------------------------------------------
  // The whole .tv-root goes full screen, not just the chart panel, so the
  // symbol, timeframe and Buy/Sell controls stay reachable. Browsers can refuse
  // the Fullscreen API (permissions, embedded frames), so falling back to a
  // fixed-position class guarantees the button always does something.
  const fullscreenBtn = body.querySelector('#tvFullscreen')
  const isFullscreen = () => document.fullscreenElement === body || body.classList.contains('tv-focus')
  function syncFullscreenButton() {
    const on = isFullscreen()
    fullscreenBtn.classList.toggle('active', on)
    fullscreenBtn.setAttribute('aria-pressed', String(on))
    fullscreenBtn.title = on ? 'Exit full screen (F)' : 'Full screen (F)'
    fullscreenBtn.setAttribute('aria-label', on ? 'Exit full screen' : 'Full screen chart')
  }
  function exitFocusMode() {
    body.classList.remove('tv-focus')
    syncFullscreenButton()
  }
  async function toggleFullscreen() {
    if (document.fullscreenElement === body) {
      try { await document.exitFullscreen() } catch { /* already gone */ }
      return
    }
    if (body.classList.contains('tv-focus')) { exitFocusMode(); return }
    try {
      await body.requestFullscreen()
      return
    } catch { /* fall through to the CSS fallback */ }
    body.classList.add('tv-focus')
    syncFullscreenButton()
  }
  fullscreenBtn.onclick = () => toggleFullscreen()
  if (!body.dataset.fullscreenBound) {
    body.dataset.fullscreenBound = '1'
    document.addEventListener('fullscreenchange', () => {
      if (!document.fullscreenElement) body.classList.remove('tv-focus')
      syncFullscreenButton()
    })
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        // Browsers normally leave full screen on Esc themselves; doing it here
        // too keeps the button state honest in every environment.
        if (body.classList.contains('tv-focus')) { exitFocusMode(); return }
        if (document.fullscreenElement === body) { e.preventDefault(); document.exitFullscreen().catch(() => {}) }
        return
      }
      if (e.key !== 'f' && e.key !== 'F') return
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const tag = String(e.target.tagName || '').toLowerCase()
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable) return
      // Only while the chart page is on screen.
      if (!document.querySelector('.app-shell.tradingview-open')) return
      e.preventDefault()
      toggleFullscreen()
    })
  }
  syncFullscreenButton()

  // --- lot size -------------------------------------------------------------
  // Between Sell and Buy, the way an order ticket puts it: the size is part of
  // placing the trade, so it belongs next to the buttons instead of in the
  // edit dialog afterwards. The input's value is the single source of truth —
  // mountTradingView runs again on every page re-render, and closure state
  // would go stale across those runs.
  const lotInput = body.querySelector('#tvLotInput')
  const LOT_MIN = 0.01
  const LOT_MAX = 100
  const LOT_KEY = 'tvLotSize'

  const clampLot = (value) => Math.min(LOT_MAX, Math.max(LOT_MIN, Math.round(value * 100) / 100))

  function readLotSize() {
    const parsed = Number(String(lotInput.value).replace(',', '.').trim())
    return Number.isFinite(parsed) && parsed > 0 ? clampLot(parsed) : clampLot(LOT_MIN)
  }

  function writeLotSize(value) {
    const next = clampLot(value)
    lotInput.value = next.toFixed(2)
    try { localStorage.setItem(LOT_KEY, String(next)) } catch { /* private mode */ }
  }

  function stepLot(direction, event) {
    // Shift jumps by a tenth — the difference between nudging a size and
    // changing it.
    writeLotSize(readLotSize() + direction * (event && event.shiftKey ? 0.1 : 0.01))
  }

  body.querySelector('#tvLotUp').onclick = (event) => stepLot(1, event)
  body.querySelector('#tvLotDown').onclick = (event) => stepLot(-1, event)

  if (!lotInput.dataset.lotBound) {
    lotInput.dataset.lotBound = '1'
    const saved = Number(localStorage.getItem(LOT_KEY))
    if (Number.isFinite(saved) && saved > 0) writeLotSize(saved)
    // Reformat on commit, not on every keystroke: rewriting the value mid-typing
    // moves the caret and makes "0.05" impossible to type.
    lotInput.addEventListener('change', () => writeLotSize(readLotSize()))
    lotInput.addEventListener('blur', () => writeLotSize(readLotSize()))
    lotInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault()
        writeLotSize(readLotSize())
        lotInput.blur()
      } else if (event.key === 'ArrowUp') {
        event.preventDefault()
        stepLot(1, event)
      } else if (event.key === 'ArrowDown') {
        event.preventDefault()
        stepLot(-1, event)
      }
    })
  }

  // --- Buy / Sell quick-log buttons ------------------------------------------
  // Prefill entry price from the live feed (XAUUSD) and auto-detect the
  // trading session from the current time.
  async function quickLog(direction) {
    if (!state.addTrade && !state.openTrade) return
    const sym = journalSymbolFor(state.symbol)
    let price = ''
    if (isAutoCalc(sym)) {
      const q = await getQuote(sym)
      if (q && q.price != null) {
        state.lastQuotes[normalizeSymbol(sym)] = q
        price = q.price
      }
    }
    const session = pickSession(new Date())
    // Snapshot the chart as it looks at entry, so the trade keeps the picture
    // it was taken from.
    const snapshot = await captureChart()
    const payload = {
      symbol: sym,
      direction,
      entryDate: localDateTime(),
      entryPrice: price,
      quantity: readLotSize(),
      sessionId: session ? session.id : '',
      entryPhoto: snapshot || ''
    }
    // Instant one-click logging: record the trade immediately, no dialog.
    // The dialog is reserved for closing/editing via the Close button.
    if (state.addTrade) {
      state.addTrade(payload)
    } else if (state.openTrade) {
      state.openTrade(payload)
    }
  }
  body.querySelector('#tvBuy').onclick = () => quickLog('Long')
  body.querySelector('#tvSell').onclick = () => quickLog('Short')

  // --- active-trades overlay + live refresh ----------------------------------
  const panel = body.querySelector('#tvActivePanel')
  panel.__tvState = state

  // --- hover-revealed open-trades panel -------------------------------------
  // Only the slim header bar shows by default; hovering the bar (or tabbing
  // into it with the keyboard) slides the trade rows out, and leaving the
  // panel tucks them away again. No click needed.
  state.panelOpen = false

  function applyPanelState() {
    panel.classList.toggle('collapsed', !state.panelOpen)
  }

  function setPanelOpen(open) {
    if (state.panelOpen === open) return
    state.panelOpen = open
    applyPanelState()
    if (open) updateLiveValues(panel)
  }

  panel.addEventListener('mouseenter', () => setPanelOpen(true))

  // Closing a trade rebuilds the rows, which makes the browser fire a
  // synthetic mouseleave/focusout even though the pointer never moved away —
  // and the shrunken panel can leave the pointer outside its new box. Both
  // used to collapse the list right after a Close click. While a hold is
  // active the list stays open, and it collapses again as soon as the pointer
  // genuinely leaves the panel.
  let holdTimer = null

  function pointerInside(x, y) {
    const r = panel.getBoundingClientRect()
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom
  }

  function endHold() {
    state.holdOpen = false
    if (holdTimer) { clearTimeout(holdTimer); holdTimer = null }
  }

  /**
   * Keep the list open across the rebuild that follows a Close click.
   * Removing a row shrinks the panel, so the pointer can end up outside its
   * new box and the browser fires a mouseleave — which used to collapse the
   * list immediately, hiding the trades that were still open. That leave is
   * ignored for a grace period; if the pointer isn't over the list when the
   * grace period ends, it collapses as usual.
   */
  function holdPanelOpen() {
    state.holdOpen = true
    setPanelOpen(true)
    if (holdTimer) clearTimeout(holdTimer)
    holdTimer = setTimeout(() => {
      holdTimer = null
      state.holdOpen = false
      // stay open while the pointer is actually over the list
      if (!state.pointerOverPanel) setPanelOpen(false)
    }, 3000)
  }
  state.holdPanelOpen = holdPanelOpen
  state.endHold = endHold
  state.holdOpen = false
  state.pointerOverPanel = false

  panel.addEventListener('mouseenter', () => {
    state.pointerOverPanel = true
    endHold() // back over the list — normal hover behaviour from here
    setPanelOpen(true)
  })
  panel.addEventListener('mouseleave', (e) => {
    state.pointerOverPanel = pointerInside(e.clientX, e.clientY)
    if (state.pointerOverPanel) return // rows shifted under the cursor
    if (state.holdOpen) return // grace period after a close decides
    setPanelOpen(false)
  })
  panel.addEventListener('focusin', () => setPanelOpen(true))
  panel.addEventListener('focusout', () => {
    if (state.holdOpen) return
    if (!panel.contains(document.activeElement)) setPanelOpen(false)
  })
  applyPanelState()

  // poll only while there are open trades; reset cleanly on re-mount
  if (host.__tvPollTimer) clearInterval(host.__tvPollTimer)
  state.onOpenChanged = (open) => {
    if (open && open.length) {
      if (!host.__tvPollTimer) {
        host.__tvPollTimer = setInterval(() => updateLiveValues(panel), POLL_MS)
      }
    } else if (host.__tvPollTimer) {
      clearInterval(host.__tvPollTimer)
      host.__tvPollTimer = null
    }
  }
  state.onOpenChanged((state.getTrades() || []).filter(isActiveTrade))

  const onTradesChanged = () => buildActivePanel(panel)
  if (host.__tvOnTradesChanged) {
    window.removeEventListener('gzs:trades-changed', host.__tvOnTradesChanged)
    window.removeEventListener('storage', host.__tvOnTradesChanged)
  }
  host.__tvOnTradesChanged = onTradesChanged
  window.addEventListener('gzs:trades-changed', onTradesChanged)
  window.addEventListener('storage', onTradesChanged)

  // --- chart rendering with theme sync ---------------------------------------
  const chartEl = host.querySelector('#tvChart')

  function refresh() {
    buildActivePanel(panel)
    const theme = document.body.classList.contains('light-mode') ? 'light' : 'dark'
    const chartConfig = {
      ...CHART_CONFIG,
      symbol: state.symbol,
      interval: state.interval,
      theme,
      backgroundColor: getComputedStyle(document.body).getPropertyValue('--bg').trim()
    }
    embedChart(chartEl, chartConfig)
  }

  if (!host.tvThemeObserver) {
    host.tvThemeObserver = new MutationObserver(refresh)
    host.tvThemeObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ['class']
    })
  }
  refresh()
  requestAnimationFrame(() => window.dispatchEvent(new Event('resize')))
}
