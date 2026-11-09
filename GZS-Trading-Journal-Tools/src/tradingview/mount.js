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
const POLL_MS = 10 * 1000

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
  new TradingView.widget({
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

  // With no open trades, only the Buy/Sell buttons remain — hide the panel
  panel.hidden = open.length === 0
  if (open.length === 0) {
    state.onOpenChanged && state.onOpenChanged([])
    return
  }

  list.innerHTML = open
    .map((t) => {
      const long = String(t.direction).toLowerCase() === 'long'
      const spec = getSpec(t.symbol)
      return `
        <div class="tv-active-row" data-id="${t.id}" data-symbol="${normalizeSymbol(t.symbol)}">
          <span class="tv-trade-side ${long ? 'long' : 'short'}">${long ? 'BUY' : 'SELL'}</span>
          <span class="tv-cell tv-open">${fmtPrice(t.entryPrice, spec)}</span>
          <span class="tv-cell">${t.quantity ?? '—'}</span>
          <span class="tv-cell tv-cur" data-role="market">…</span>
          <span class="tv-cell tv-pnl flat" data-role="pnl">…</span>
          <button type="button" class="tv-close-btn" data-id="${t.id}" title="Close this trade — fills exit price & time, calculates pips and net P/L">Close</button>
        </div>`
    })
    .join('')

  // The dialog opens ONLY via the Close button — clicking elsewhere on the
  // row does nothing, so accidental edits of an open trade are impossible.

  // close button = prefill the dialog for closing (exit price = live market)
  list.querySelectorAll('.tv-close-btn').forEach((btn) => {
    btn.onclick = (e) => {
      e.stopPropagation()
      const trade = (state.getTrades() || []).find((t) => t.id === btn.dataset.id)
      if (!trade || !state.openTrade) return
      // live exit-price prefill is part of the XAUUSD auto-calc feature
      const live = isAutoCalc(trade.symbol) ? state.lastQuotes[normalizeSymbol(trade.symbol)] : null
      state.openTrade({
        ...trade,
        exitDate: localDateTime(),
        exitPrice: live && live.price != null ? live.price : ''
      })
    }
  })

  state.onOpenChanged && state.onOpenChanged(open)
  updateLiveValues(panel)
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
  })
}

export function mountTradingView(host, api = {}) {
  if (!host) return

  const state = {
    symbol: localStorage.getItem(SYMBOL_KEY) || CHART_CONFIG.symbol,
    interval: localStorage.getItem(INTERVAL_KEY) || CHART_CONFIG.interval,
    openTrade: typeof api.openTrade === 'function' ? api.openTrade : null,
    addTrade: typeof api.addTrade === 'function' ? api.addTrade : null,
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
        </div>
        <div class="tv-main">
          <section class="tv-panel tv-chart" id="tvChart" aria-label="Price chart"></section>
          <div class="tv-overlay">
            <div class="tv-quick">
              <button type="button" id="tvSell" class="tv-trade-btn tv-sell" title="Log a Short trade for this symbol">▼ Sell</button>
              <button type="button" id="tvBuy" class="tv-trade-btn tv-buy" title="Log a Long trade for this symbol">▲ Buy</button>
            </div>
            <div class="tv-active" id="tvActivePanel">
              <div class="tv-active-head">
                <span>Trades · <b id="tvActiveSymbol"></b></span>
                <span id="tvLiveBadge" class="tv-live-badge">…</span>
                <span id="tvActiveCount" class="tv-active-count"></span>
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
    localStorage.setItem(SYMBOL_KEY, state.symbol)
  }
  select.value = state.symbol
  select.onchange = () => {
    state.symbol = select.value
    localStorage.setItem(SYMBOL_KEY, state.symbol)
    refresh()
  }

  // --- interval buttons ------------------------------------------------------
  const intervalWrap = body.querySelector('#tvIntervals')
  intervalWrap.innerHTML = INTERVALS.map(
    ([val, label]) => `<button type="button" class="tv-interval${val === state.interval ? ' active' : ''}" data-interval="${val}">${label}</button>`
  ).join('')
  intervalWrap.querySelectorAll('.tv-interval').forEach((btn) => {
    btn.onclick = () => {
      state.interval = btn.dataset.interval
      localStorage.setItem(INTERVAL_KEY, state.interval)
      intervalWrap.querySelectorAll('.tv-interval').forEach((b) => b.classList.toggle('active', b === btn))
      refresh()
    }
  })

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
    const payload = {
      symbol: sym,
      direction,
      entryDate: localDateTime(),
      entryPrice: price,
      sessionId: session ? session.id : ''
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
