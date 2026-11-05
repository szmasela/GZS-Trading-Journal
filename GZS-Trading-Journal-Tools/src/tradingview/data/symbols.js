export const SYMBOLS = [
  { symbol: 'BTCUSDT', name: 'Bitcoin', base: 'BTC' },
  { symbol: 'ETHUSDT', name: 'Ethereum', base: 'ETH' },
  { symbol: 'SOLUSDT', name: 'Solana', base: 'SOL' },
  { symbol: 'BNBUSDT', name: 'BNB', base: 'BNB' },
  { symbol: 'XRPUSDT', name: 'XRP', base: 'XRP' },
  { symbol: 'ADAUSDT', name: 'Cardano', base: 'ADA' },
  { symbol: 'DOGEUSDT', name: 'Dogecoin', base: 'DOGE' },
  { symbol: 'AVAXUSDT', name: 'Avalanche', base: 'AVAX' },
  { symbol: 'LINKUSDT', name: 'Chainlink', base: 'LINK' },
  { symbol: 'DOTUSDT', name: 'Polkadot', base: 'DOT' }
]

export const TIMEFRAMES = [
  { id: '1m', label: '1m', interval: '1m', ms: 60 * 1000 },
  { id: '5m', label: '5m', interval: '5m', ms: 5 * 60 * 1000 },
  { id: '15m', label: '15m', interval: '15m', ms: 15 * 60 * 1000 },
  { id: '1h', label: '1H', interval: '1h', ms: 60 * 60 * 1000 },
  { id: '4h', label: '4H', interval: '4h', ms: 4 * 60 * 60 * 1000 },
  { id: '1d', label: '1D', interval: '1d', ms: 24 * 60 * 60 * 1000 },
  { id: '1w', label: '1W', interval: '1w', ms: 7 * 24 * 60 * 60 * 1000 }
]

export const CHART_TYPES = [
  { id: 'candles', label: 'Candles' },
  { id: 'bars', label: 'Bars' },
  { id: 'line', label: 'Line' },
  { id: 'area', label: 'Area' }
]
