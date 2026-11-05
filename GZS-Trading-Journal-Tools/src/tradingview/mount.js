import { CHART_CONFIG, NEWS_CONFIG, TAPE_CONFIG } from './config.js'
import './tradingview.css'

function embedWidget(target, widget, config) {
  if (!target) return
  const signature = JSON.stringify(config)
  if (target.dataset.tvMounted === 'true' && target.dataset.tvConfig === signature) return
  target.innerHTML = ''
  const wrap = document.createElement('div')
  wrap.className = 'tradingview-widget-container'
  const inner = document.createElement('div')
  inner.className = 'tradingview-widget-container__widget'
  wrap.appendChild(inner)
  const script = document.createElement('script')
  script.src = `https://s3.tradingview.com/external-embedding/embed-widget-${widget}.js`
  script.async = true
  script.text = signature
  wrap.appendChild(script)
  target.appendChild(wrap)
  target.dataset.tvMounted = 'true'
  target.dataset.tvConfig = signature
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

async function embedChart(target) {
  if (!target) return
  const signature = JSON.stringify(CHART_CONFIG)
  if (target.dataset.tvMounted === 'true' && target.dataset.tvConfig === signature) return
  target.innerHTML = ''
  target.id = 'tvChartHost'
  target.dataset.tvMounted = 'true'
  target.dataset.tvConfig = signature
  const TradingView = await loadChartScript()
  if (target.dataset.tvConfig !== signature) return
  new TradingView.widget({
    ...CHART_CONFIG,
    width: '100%',
    height: '100%',
    hide_side_toolbar: false,
    hide_top_toolbar: false,
    withdateranges: true,
    details: true,
    watchlist: CHART_CONFIG.watchlist,
    container_id: target.id
  })
}

function bindNewsToggle(root) {
  const panel = root.querySelector('#tvNewsPanel')
  const body = root.querySelector('#tvNews')
  const btn = root.querySelector('#tvMinBtn')
  const chev = root.querySelector('#tvChev')
  if (!panel || !body || !btn || !chev || btn.dataset.bound === 'true') return
  btn.dataset.bound = 'true'
  btn.addEventListener('click', () => {
    const collapsed = panel.classList.toggle('collapsed')
    body.hidden = collapsed
    btn.setAttribute('aria-expanded', String(!collapsed))
    btn.setAttribute('aria-label', collapsed ? 'Expand market news' : 'Minimize market news')
    btn.title = collapsed ? 'Expand' : 'Minimize'
    chev.setAttribute('d', collapsed ? 'M9 2 4 7l5 5' : 'M5 2l5 5-5 5')
  })
}

export function mountTradingView(host) {
  if (!host) return
  if (!host.querySelector('.tv-root')) {
    host.innerHTML = `
      <div class="tv-root">
        <header class="tv-header">
          <div class="tv-brand"><i aria-hidden="true"></i>Gold Desk</div>
          <div class="tv-tape" id="tvTape"></div>
        </header>
        <div class="tv-main">
          <section class="tv-panel tv-chart" id="tvChart" aria-label="Price chart"></section>
          <section class="tv-panel tv-news" id="tvNewsPanel" aria-label="Market news">
            <div class="tv-panel-head">
              <h2>Market news</h2>
              <button type="button" class="tv-min-btn" id="tvMinBtn" aria-expanded="true" aria-label="Minimize market news" title="Minimize">
                <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
                  <path id="tvChev" d="M5 2l5 5-5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </button>
            </div>
            <div class="tv-body" id="tvNews"></div>
          </section>
        </div>
      </div>
    `
  }

  embedWidget(host.querySelector('#tvTape'), 'ticker-tape', TAPE_CONFIG)
  embedChart(host.querySelector('#tvChart'))
  embedWidget(host.querySelector('#tvNews'), 'timeline', NEWS_CONFIG)
  bindNewsToggle(host)
  requestAnimationFrame(() => window.dispatchEvent(new Event('resize')))
}
