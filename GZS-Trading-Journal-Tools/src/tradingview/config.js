export const TAPE_CONFIG = {
  symbols: [
    { proName: 'FXPRO:XAUUSD', title: 'Gold' },
    { proName: 'FXPRO:XAGUSD', title: 'Silver' },
    { proName: 'OANDA:NAS100USD', title: 'Nasdaq 100' },
    { proName: 'OANDA:UK100GBP', title: 'UK 100' },
    { proName: 'OANDA:US30USD', title: 'US 30' }
  ],
  colorTheme: 'dark',
  locale: 'en',
  isTransparent: true,
  showSymbolLogo: true,
  displayMode: 'adaptive'
}

export const CHART_CONFIG = {
  autosize: true,
  symbol: 'FXPRO:XAUUSD',
  interval: '5',
  range: '12M',
  timezone: 'Africa/Johannesburg',
  theme: 'dark',
  style: '1',
  locale: 'en',
  backgroundColor: '#000000',
  gridColor: 'rgba(0,0,0,0)',
  allow_symbol_change: true,
  watchlist: [
    'FXPRO:XAUUSD',
    'FXPRO:XAGUSD',
    'OANDA:NAS100USD',
    'OANDA:UK100GBP',
    'OANDA:US30USD'
  ],
  details: true,
  hotlist: false,
  calendar: false,
  withdateranges: true,
  hide_side_toolbar: false,
  hide_top_toolbar: false,
  hide_legend: false,
  save_image: true,
  support_host: 'https://www.tradingview.com'
}

export const NEWS_CONFIG = {
  feedMode: 'market',
  market: 'forex',
  colorTheme: 'dark',
  isTransparent: true,
  displayMode: 'regular',
  width: '100%',
  height: '100%',
  locale: 'en'
}
