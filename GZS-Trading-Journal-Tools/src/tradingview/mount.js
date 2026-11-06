import { CHART_CONFIG } from './config.js'
import './tradingview.css'

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

export function mountTradingView(host) {
  if (!host) return
  if (!host.querySelector('.tv-root')) {
    host.innerHTML = `
      <div class="tv-root">
        <div class="tv-main">
          <section class="tv-panel tv-chart" id="tvChart" aria-label="Price chart"></section>
        </div>
      </div>
    `
  }

  const updateTheme = () => {
    const theme = document.body.classList.contains('light-mode') ? 'light' : 'dark'
    const chartConfig = {
      ...CHART_CONFIG,
      theme,
      backgroundColor: getComputedStyle(document.body).getPropertyValue('--bg').trim()
    }
    embedChart(host.querySelector('#tvChart'), chartConfig)
  }

  if (!host.tvThemeObserver) {
    host.tvThemeObserver = new MutationObserver(updateTheme)
    host.tvThemeObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ['class']
    })
  }
  updateTheme()
  requestAnimationFrame(() => window.dispatchEvent(new Event('resize')))
}
