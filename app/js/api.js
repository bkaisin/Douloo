// Free, key-less market data sources. All three send CORS headers, so the app
// can call them straight from Safari without a backend.
//  - CoinGecko : universe, prices, market caps, 1h / 24h / 7d / 30d / 1y
//  - DefiLlama : 15m / 30m / 4h, addressed by CoinGecko id
//  - Coinpaprika : 15m / 30m fallback for coins DefiLlama has no recent data for

const CG = 'https://api.coingecko.com/api/v3';
const LLAMA = 'https://coins.llama.fi';
const PAPRIKA = 'https://api.coinpaprika.com/v1';
const PCT = '1h,24h,7d,30d,1y';

export class HttpError extends Error {
  constructor(status, source) {
    super(`${source}: HTTP ${status}`);
    this.status = status;
    this.source = source;
  }
}

async function getJSON(url, source, timeout = 20000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, { signal: ctrl.signal, cache: 'no-store' });
    if (!res.ok) throw new HttpError(res.status, source);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function cg(path, params, apiKey) {
  const u = new URL(CG + path);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, String(v));
  if (apiKey) u.searchParams.set('x_cg_demo_api_key', apiKey);
  return getJSON(u.toString(), 'CoinGecko');
}

export function fetchMarketsPage(page, apiKey) {
  return cg(
    '/coins/markets',
    { vs_currency: 'usd', order: 'market_cap_desc', per_page: 250, page, price_change_percentage: PCT },
    apiKey,
  );
}

export async function fetchMarketsByIds(ids, apiKey) {
  const out = [];
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const rows = await cg(
      '/coins/markets',
      { vs_currency: 'usd', ids: chunk.join(','), per_page: 250, page: 1, price_change_percentage: PCT },
      apiKey,
    );
    out.push(...rows);
  }
  return out;
}

export async function fetchStablecoinIds(apiKey) {
  const rows = await cg(
    '/coins/markets',
    { vs_currency: 'usd', category: 'stablecoins', order: 'market_cap_desc', per_page: 250, page: 1 },
    apiKey,
  );
  return rows.map((r) => r.id);
}

export async function searchCoins(query, apiKey) {
  const data = await cg('/search', { query }, apiKey);
  return (data.coins || []).slice(0, 15);
}

// Returns { coingeckoId: percentChange } for one period ("15m", "30m", "4h").
// The timestamp (rounded to the minute) keeps the CDN from serving an hour-old answer.
export async function fetchLlamaChanges(ids, period) {
  const ts = Math.floor(Date.now() / 60000) * 60;
  const chunks = [];
  for (let i = 0; i < ids.length; i += 150) chunks.push(ids.slice(i, i + 150));
  const result = {};
  await Promise.all(
    chunks.map(async (chunk) => {
      const coins = chunk.map((id) => `coingecko:${encodeURIComponent(id)}`).join(',');
      const data = await getJSON(`${LLAMA}/percentage/${coins}?period=${period}&timestamp=${ts}`, 'DefiLlama');
      for (const [key, v] of Object.entries(data.coins || {})) {
        if (Number.isFinite(v)) result[key.slice('coingecko:'.length)] = v;
      }
    }),
  );
  return result;
}

export async function fetchPaprikaTickers() {
  const rows = await getJSON(`${PAPRIKA}/tickers?quotes=USD`, 'Coinpaprika', 30000);
  return rows.map((r) => {
    const q = r.quotes?.USD || {};
    return { sym: String(r.symbol || '').toUpperCase(), price: q.price, m15: q.percent_change_15m, m30: q.percent_change_30m };
  });
}
