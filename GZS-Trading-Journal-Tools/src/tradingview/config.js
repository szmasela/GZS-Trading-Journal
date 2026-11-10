export const CHART_CONFIG = {
  autosize: true,
  symbol: 'FXPRO:XAUUSD',
  interval: '5',
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
    'OANDA:BTCUSD',
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
  hide_volume: true,
  studies: [
    { id: 'MAVolumeWeighted@tv-basicstudies', inputs: { length: 50 } },
    { id: 'StochasticRSI@tv-basicstudies', inputs: { 'RSI Length': 20 } }
  ],
  save_image: true,
  support_host: 'https://www.tradingview.com'
}
