const cache = new Map();
function nf(opts) {
  const key = JSON.stringify(opts);
  let f = cache.get(key);
  if (!f) {
    f = new Intl.NumberFormat('fr-FR', opts);
    cache.set(key, f);
  }
  return f;
}

const NBSP = ' ';
const MINUS = '−';

export function formatPrice(p) {
  if (p == null || !Number.isFinite(p)) return '—';
  let s;
  if (p >= 10000) s = nf({ maximumFractionDigits: 0 }).format(p);
  else if (p >= 100) s = nf({ minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(p);
  else if (p >= 1) s = nf({ minimumSignificantDigits: 3, maximumSignificantDigits: 4 }).format(p);
  else if (p > 0) s = nf({ maximumSignificantDigits: 6 }).format(p);
  else s = '0';
  return `${s}${NBSP}$`;
}

export function formatPct(v, { sign = true } = {}) {
  if (v == null || !Number.isFinite(v)) return '—';
  const abs = Math.abs(v);
  const digits = abs >= 1000 ? 0 : 1;
  const rounded = Number(abs.toFixed(digits));
  const body = nf({ minimumFractionDigits: digits, maximumFractionDigits: digits }).format(rounded);
  let prefix = '';
  if (sign && rounded !== 0) prefix = v > 0 ? '+' : MINUS;
  return `${prefix}${body}${NBSP}%`;
}

export function formatMcap(m) {
  if (m == null || !Number.isFinite(m) || m <= 0) return '—';
  const two = nf({ minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (m >= 1e9) return `${two.format(m / 1e9)}${NBSP}Md$`;
  if (m >= 1e6) return `${two.format(m / 1e6)}${NBSP}M$`;
  return `${nf({ maximumFractionDigits: 0 }).format(m / 1e3)}${NBSP}k$`;
}

export function timeAgo(ts) {
  if (!ts) return '';
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 10) return "à l'instant";
  if (s < 60) return `il y a ${s}${NBSP}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `il y a ${m}${NBSP}min`;
  const h = Math.round(m / 60);
  return `il y a ${h}${NBSP}h`;
}

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
}

// Only allow https image URLs coming from the APIs.
export function safeImg(url) {
  return typeof url === 'string' && url.startsWith('https://') ? esc(url) : '';
}

// CoinGecko serves thumb (25px), small (64px) and large (250px) variants.
export function imgSize(url, size) {
  if (!url) return '';
  return url.replace('/large/', `/${size}/`);
}
