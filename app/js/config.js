// Timeframes shown in the app. `scale` is the move (in %) considered "strong"
// for that timeframe: it drives colour intensity and the bars in the detail sheet.
export const TFS = [
  { key: '15m', short: '15M', label: '15 min', scale: 1.5 },
  { key: '30m', short: '30M', label: '30 min', scale: 2 },
  { key: '1h', short: '1H', label: 'Heure', scale: 3 },
  { key: '4h', short: '4H', label: '4 heures', scale: 6 },
  { key: '1d', short: '1D', label: 'Jour', scale: 10 },
  { key: '1w', short: '1W', label: 'Semaine', scale: 20 },
  { key: '1m', short: '1M', label: 'Mois', scale: 35 },
  { key: '1y', short: '1Y', label: 'Année', scale: 80 },
];

export const TF_KEYS = TFS.map((t) => t.key);
export const TF_BY_KEY = Object.fromEntries(TFS.map((t) => [t.key, t]));

// Timeframes of the detail sheet (same five as the reference design).
export const SHEET_TFS = ['1h', '1d', '1w', '1m', '1y'];

// Timeframes that come from DefiLlama / Coinpaprika instead of CoinGecko.
export const SHORT_TFS = ['15m', '30m', '4h'];

export const VIEWS = [
  { key: 'list', label: 'Liste' },
  { key: 'bubbles', label: 'Bulles' },
  { key: 'swarm', label: 'Essaim' },
  { key: 'treemap', label: 'Heatmap' },
];

export const RANGES = [
  { key: '1-100', label: '1 - 100', from: 0, to: 100 },
  { key: '101-200', label: '101 - 200', from: 100, to: 200 },
  { key: '201-300', label: '201 - 300', from: 200, to: 300 },
  { key: 'all', label: 'Tous', from: 0, to: Infinity },
];

export const UNIVERSE_SIZE = 300;
export const REFRESH_MS = 60_000;
export const PAPRIKA_REFRESH_MS = 180_000;
export const STABLES_TTL_MS = 24 * 3600_000;
