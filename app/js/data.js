import { TF_KEYS, SHORT_TFS, UNIVERSE_SIZE } from './config.js';

// Used until the CoinGecko "stablecoins" category has been fetched once.
export const FALLBACK_STABLES = [
  'tether', 'usd-coin', 'usds', 'ethena-usde', 'dai', 'usd1-wlfi', 'ripple-usd', 'paypal-usd',
  'global-dollar', 'falcon-finance', 'united-stables', 'usdd', 'bfusd', 'usdgo', 'open-usd', 'gho',
  'usual-usd', 'euro-coin', 'true-usd', 'ylds', 'a7a5', 'first-digital-usd', 'frax', 'usx',
  'agora-dollar', 'gusd', 'crvusd', 'cash-4', 'frax-usd', 'binance-usd',
];

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export function normalizeMarket(c) {
  return {
    id: c.id,
    sym: String(c.symbol || '').toUpperCase(),
    name: c.name || c.id,
    image: c.image || '',
    rank: c.market_cap_rank ?? null,
    price: num(c.current_price),
    mcap: num(c.market_cap),
    ch: {
      '15m': null,
      '30m': null,
      '1h': num(c.price_change_percentage_1h_in_currency),
      '4h': null,
      '1d': num(c.price_change_percentage_24h_in_currency ?? c.price_change_percentage_24h),
      '1w': num(c.price_change_percentage_7d_in_currency),
      '1m': num(c.price_change_percentage_30d_in_currency),
      '1y': num(c.price_change_percentage_1y_in_currency),
    },
  };
}

export const byRank = (a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9) || (b.mcap ?? 0) - (a.mcap ?? 0);

// Top 300 (stablecoins excluded unless asked) + the tokens the user added.
export function buildUniverse(markets, { stableIds, showStables, customIds }) {
  const custom = new Set(customIds);
  const tokens = [];
  const seen = new Set();
  const sorted = markets
    .filter((m) => m && m.id)
    .map(normalizeMarket)
    .sort(byRank);
  for (const t of sorted) {
    if (tokens.length >= UNIVERSE_SIZE) break;
    if (seen.has(t.id)) continue;
    if (!showStables && stableIds.has(t.id)) continue;
    t.custom = custom.has(t.id);
    tokens.push(t);
    seen.add(t.id);
  }
  for (const t of sorted) {
    if (!custom.has(t.id) || seen.has(t.id)) continue;
    t.custom = true;
    t.extra = true; // only present because the user added it
    tokens.push(t);
    seen.add(t.id);
  }
  return tokens.sort(byRank);
}

// Keep the previous short-timeframe values while fresh ones are loading.
export function carryShortTerm(tokens, previous) {
  for (const t of tokens) {
    const p = previous.get(t.id);
    if (!p) continue;
    for (const tf of SHORT_TFS) t.ch[tf] = p.ch[tf];
  }
}

// llama: { '15m': {id: v} | null, ... } (null = request failed, keep current values)
export function applyShortTerm(tokens, llama, paprikaRows) {
  for (const tf of SHORT_TFS) {
    const map = llama[tf];
    if (!map) continue;
    for (const t of tokens) t.ch[tf] = map[t.id] ?? null;
  }
  if (!paprikaRows) return;
  const bySym = new Map();
  for (const r of paprikaRows) {
    if (!bySym.has(r.sym)) bySym.set(r.sym, []);
    bySym.get(r.sym).push(r);
  }
  for (const t of tokens) {
    if (t.ch['15m'] != null && t.ch['30m'] != null) continue;
    // Same ticker AND a price within 5 %: avoids mixing up homonym tokens.
    const match = (bySym.get(t.sym) || []).find(
      (r) => t.price > 0 && r.price > 0 && Math.abs(r.price / t.price - 1) < 0.05,
    );
    if (!match) continue;
    if (t.ch['15m'] == null && Number.isFinite(match.m15)) t.ch['15m'] = match.m15;
    if (t.ch['30m'] == null && Number.isFinite(match.m30)) t.ch['30m'] = match.m30;
  }
}

export function needsPaprika(tokens) {
  return tokens.some((t) => t.ch['15m'] == null || t.ch['30m'] == null);
}

export function median(values) {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function stats(items, tf) {
  const vals = [];
  for (const i of items) if (i.ch[tf] != null) vals.push(i.ch[tf]);
  let up = 0;
  let down = 0;
  for (const v of vals) {
    if (v >= 0.05) up++;
    else if (v <= -0.05) down++;
  }
  return { up, down, flat: vals.length - up - down, n: vals.length, missing: items.length - vals.length, median: median(vals) };
}

// Abbreviations used when a narrative name does not fit in its bubble.
const SHORT_LABELS = { lst: 'LST' };

// Narratives: market-cap weighted change of their member tokens.
export function buildNarratives(tokens, narrData) {
  if (!narrData) return [];
  const groups = new Map(narrData.narratives.map((d) => [d.id, { def: d, tokens: [] }]));
  for (const t of tokens) {
    for (const nid of narrData.members[t.id] || []) groups.get(nid)?.tokens.push(t);
  }
  const out = [];
  for (const { def, tokens: members } of groups.values()) {
    if (!members.length) continue;
    const ch = {};
    for (const tf of TF_KEYS) {
      let w = 0;
      let s = 0;
      for (const t of members) {
        const v = t.ch[tf];
        if (v != null && t.mcap > 0) {
          w += t.mcap;
          s += t.mcap * v;
        }
      }
      ch[tf] = w > 0 ? s / w : null;
    }
    members.sort((a, b) => (b.mcap ?? 0) - (a.mcap ?? 0));
    out.push({
      id: `n:${def.id}`,
      sym: def.label,
      short: SHORT_LABELS[def.id],
      name: def.label,
      isNarrative: true,
      mcap: members.reduce((a, t) => a + (t.mcap ?? 0), 0),
      count: members.length,
      ch,
      tokens: members,
    });
  }
  out.sort((a, b) => b.mcap - a.mcap);
  out.forEach((n, i) => (n.rank = i + 1));
  return out;
}

// Compact copy for the offline snapshot.
export function snapshotOf(tokens) {
  return tokens.map(({ id, sym, name, image, rank, price, mcap, ch, custom, extra }) => ({
    id, sym, name, image, rank, price, mcap, ch, custom, extra,
  }));
}
