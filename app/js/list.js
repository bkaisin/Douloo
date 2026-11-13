import { TF_KEYS, TF_BY_KEY } from './config.js';
import { formatPrice, formatPct, formatMcap, esc, safeImg, imgSize } from './format.js';
import { cellColors } from './colors.js';
import { ICONS } from './icons.js';

// Timeframe columns ordered by priority: the selected one, then its neighbours.
function tfPriority(sel) {
  const idx = Math.max(0, TF_KEYS.indexOf(sel));
  const out = [idx];
  for (let d = 1; out.length < TF_KEYS.length; d++) {
    if (idx - d >= 0) out.push(idx - d);
    if (idx + d < TF_KEYS.length) out.push(idx + d);
  }
  return out.map((i) => TF_KEYS[i]);
}

// Decides which columns fit in `width` pixels. On a phone in portrait the
// selected timeframe (plus a neighbour) is shown and the market cap moves
// under the price; wider screens progressively get every column.
export function listLayout(width, tf, mode) {
  const compact = width < 620;
  const tokens = mode === 'tokens';
  const W = compact
    ? { star: 30, token: 100, price: 88, count: 0, tf: 62 }
    : { star: 36, rank: 40, token: 180, price: 110, count: 72, tf: 70, mcap: 116, links: 70 };
  const gap = compact ? 4 : 6;
  const pad = compact ? 16 : 24;

  const fixed = [];
  if (tokens) fixed.push({ k: 'star', w: W.star });
  if (!compact) fixed.push({ k: 'rank', w: W.rank });
  fixed.push({ k: 'token', w: W.token, flex: true });
  if (tokens) fixed.push({ k: 'price', w: W.price });
  else if (!compact) fixed.push({ k: 'count', w: W.count });

  let avail = width - pad - fixed.reduce((a, c) => a + c.w + gap, 0);
  const order = tfPriority(tf);
  const prio = compact
    ? order.map((k) => ({ tf: k }))
    : [...order.slice(0, 4).map((k) => ({ tf: k })), { mcap: true }, ...order.slice(4).map((k) => ({ tf: k })), ...(tokens ? [{ links: true }] : [])];

  const shown = new Set();
  let mcap = false;
  let links = false;
  for (const p of prio) {
    const w = (p.tf ? W.tf : p.mcap ? W.mcap : W.links) + gap;
    if (w > avail && shown.size) break;
    avail -= w;
    if (p.tf) shown.add(p.tf);
    else if (p.mcap) mcap = true;
    else links = true;
  }

  const cols = [...fixed];
  for (const k of TF_KEYS) if (shown.has(k)) cols.push({ k: 'tf', tf: k, w: W.tf });
  if (mcap) cols.push({ k: 'mcap', w: W.mcap });
  if (links) cols.push({ k: 'links', w: W.links });
  const template = cols.map((c) => (c.flex ? `minmax(${c.w}px,1fr)` : `${c.w}px`)).join(' ');
  return { compact, cols, template, gap, tokens };
}

function headCell(c, L, ctx) {
  const { sort, tf } = ctx;
  const key = c.k === 'tf' ? c.tf : c.k === 'token' ? 'name' : c.k;
  const labels = {
    star: '',
    rank: '#',
    token: L.tokens ? 'Token' : 'Narratif',
    price: 'Prix',
    count: 'Tokens',
    mcap: 'MCap',
    links: 'Liens',
  };
  const label = c.k === 'tf' ? TF_BY_KEY[c.tf].short : labels[c.k];
  if (c.k === 'star' || c.k === 'links') return `<div class="h h-${c.k}">${label}</div>`;
  const active = sort.key === key || (c.k === 'token' && sort.key === 'rank' && L.compact);
  const arrow = active ? `<span class="arrow">${sort.dir > 0 ? '↑' : '↓'}</span>` : '';
  const sel = c.k === 'tf' && c.tf === tf ? ' sel' : '';
  const sortKey = c.k === 'token' && L.compact ? 'rank' : key;
  return `<button type="button" class="h h-${c.k}${sel}${active ? ' active' : ''}" data-sort="${sortKey}">${label}${arrow}</button>`;
}

function avatar(item, size) {
  const src = safeImg(imgSize(item.image, size > 32 ? 'large' : 'small'));
  if (src) return `<img class="av" src="${src}" alt="" width="${size}" height="${size}" loading="lazy" decoding="async">`;
  return `<span class="av av-txt" style="width:${size}px;height:${size}px">${esc(item.sym.slice(0, 1))}</span>`;
}

function cell(c, item, L, ctx) {
  const { tf, favs, theme } = ctx;
  switch (c.k) {
    case 'star': {
      const on = favs.has(item.id);
      return `<button type="button" class="fav${on ? ' on' : ''}" data-fav="${esc(item.id)}" aria-pressed="${on}" aria-label="${on ? 'Retirer des favoris' : 'Ajouter aux favoris'}">${on ? ICONS.starFill : ICONS.star}</button>`;
    }
    case 'rank':
      return `<div class="c-rank">${item.rank ?? '—'}</div>`;
    case 'token': {
      if (item.isNarrative) {
        const sub = L.compact ? `<span class="tok-sub">${item.count} tokens · ${formatMcap(item.mcap)}</span>` : '';
        return `<div class="c-tok"><span class="narr-badge">${esc(item.name.slice(0, 2))}</span><div class="tok-txt"><span class="tok-name">${esc(item.name)}</span>${sub}</div></div>`;
      }
      const txt = L.compact
        ? `<span class="tok-sym strong">${esc(item.sym)}</span><span class="tok-sub">${item.rank ? `#${item.rank} · ` : ''}${esc(item.name)}</span>`
        : `<span class="tok-name">${esc(item.name)}</span><span class="tok-sym">${esc(item.sym)}</span>`;
      return `<div class="c-tok">${avatar(item, L.compact ? 26 : 30)}<div class="tok-txt${L.compact ? ' stack' : ''}">${txt}</div></div>`;
    }
    case 'price':
      return `<div class="c-price">${formatPrice(item.price)}${L.compact ? `<small>${formatMcap(item.mcap)}</small>` : ''}</div>`;
    case 'count':
      return `<div class="c-num">${item.count}</div>`;
    case 'tf': {
      const v = item.ch[c.tf];
      const sel = c.tf === tf;
      const col = cellColors(v, c.tf, theme, sel);
      if (!col) return `<div class="c-chg${sel ? ' sel' : ''}"><span class="pill none">—</span></div>`;
      return `<div class="c-chg${sel ? ' sel' : ''}"><span class="pill" style="background:${col.bg};color:${col.fg}">${formatPct(v)}</span></div>`;
    }
    case 'mcap':
      return `<div class="c-num">${formatMcap(item.mcap)}</div>`;
    case 'links':
      return `<div class="c-links">${linksHtml(item)}</div>`;
    default:
      return '<div></div>';
  }
}

export function linksHtml(item) {
  const id = encodeURIComponent(item.id);
  const sym = encodeURIComponent(item.sym);
  return (
    `<a href="https://www.coingecko.com/en/coins/${id}" target="_blank" rel="noopener" aria-label="Voir ${esc(item.name)} sur CoinGecko" title="CoinGecko">${ICONS.gecko}</a>` +
    `<a href="https://www.tradingview.com/chart/?symbol=CRYPTO%3A${sym}USD" target="_blank" rel="noopener" aria-label="Graphique ${esc(item.sym)} sur TradingView" title="TradingView">${ICONS.chart}</a>`
  );
}

export function renderList(el, items, ctx) {
  const width = el.clientWidth || window.innerWidth;
  const L = listLayout(width, ctx.tf, ctx.mode);
  const head = L.cols.map((c) => headCell(c, L, ctx)).join('');
  let body;
  if (!items.length) {
    body = `<div class="empty">${ctx.emptyText}</div>`;
  } else {
    body = items
      .map((item) => `<div class="row" data-id="${esc(item.id)}" tabindex="0">${L.cols.map((c) => cell(c, item, L, ctx)).join('')}</div>`)
      .join('');
  }
  el.className = `list${L.compact ? ' compact' : ''}`;
  el.style.setProperty('--cols', L.template);
  el.style.setProperty('--gap', `${L.gap}px`);
  el.innerHTML = `<div class="list-head" role="row">${head}</div><div class="list-body">${body}</div>${ctx.extraHtml || ''}`;
  return L;
}
