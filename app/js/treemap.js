import { formatPct, esc, safeImg, imgSize } from './format.js';
import { fillColors } from './colors.js';

// Squarified treemap (Bruls, Huizing & van Wijk).
function worst(row, side) {
  let sum = 0;
  let max = 0;
  let min = Infinity;
  for (const n of row) {
    sum += n.a;
    if (n.a > max) max = n.a;
    if (n.a < min) min = n.a;
  }
  const s2 = sum * sum;
  const side2 = side * side;
  return Math.max((side2 * max) / s2, s2 / (side2 * min));
}

function layoutRow(row, rect, out) {
  const sum = row.reduce((a, n) => a + n.a, 0);
  if (rect.w >= rect.h) {
    const cw = sum / rect.h;
    let y = rect.y;
    for (const n of row) {
      const h = n.a / cw;
      out.push({ ...n, x: rect.x, y, w: cw, h });
      y += h;
    }
    return { x: rect.x + cw, y: rect.y, w: rect.w - cw, h: rect.h };
  }
  const rh = sum / rect.w;
  let x = rect.x;
  for (const n of row) {
    const w = n.a / rh;
    out.push({ ...n, x, y: rect.y, w, h: rh });
    x += w;
  }
  return { x: rect.x, y: rect.y + rh, w: rect.w, h: rect.h - rh };
}

export function squarify(items, W, H) {
  const total = items.reduce((a, i) => a + i.weight, 0);
  if (!total || !W || !H) return [];
  const scale = (W * H) / total;
  const nodes = items
    .map((i) => ({ item: i, a: i.weight * scale }))
    .filter((n) => n.a > 0)
    .sort((a, b) => b.a - a.a);
  const out = [];
  let rect = { x: 0, y: 0, w: W, h: H };
  let row = [];
  let i = 0;
  while (i < nodes.length) {
    const side = Math.min(rect.w, rect.h);
    const n = nodes[i];
    if (!row.length || worst([...row, n], side) <= worst(row, side)) {
      row.push(n);
      i++;
    } else {
      rect = layoutRow(row, rect, out);
      row = [];
    }
  }
  if (row.length) layoutRow(row, rect, out);
  return out;
}

const textEm = (s) => {
  let w = 0;
  for (const ch of s) w += ch.charCodeAt(0) > 0x2e80 ? 1 : 0.64;
  return Math.max(w, 1);
};

// Tile size uses the square root of the market cap so that small caps stay readable.
export function renderTreemap(el, items, { tf, theme }) {
  const W = el.clientWidth;
  const H = el.clientHeight;
  const rects = squarify(
    items.map((i) => ({ ...i, weight: Math.sqrt(Math.max(i.mcap || 0, 1)) })),
    W,
    H,
  );
  const gap = 2;
  el.innerHTML = rects
    .map(({ item, x, y, w, h }) => {
      const v = item.ch[tf];
      const { bg, fg } = fillColors(v, tf, theme);
      const iw = Math.max(0, w - gap);
      const ih = Math.max(0, h - gap);
      const em = textEm(item.sym);
      const fs = Math.max(0, Math.min(ih * 0.26, (iw * 0.82) / em, 30));
      const showIcon = item.image && iw > 64 && ih > 70;
      const icon = showIcon ? Math.min(iw, ih) * 0.28 : 0;
      let inner = '';
      if (fs >= 6) {
        inner += showIcon
          ? `<img src="${safeImg(imgSize(item.image, icon > 32 ? 'large' : 'small'))}" alt="" draggable="false" style="width:${icon}px;height:${icon}px">`
          : '';
        inner += `<span class="t-tk" style="font-size:${fs.toFixed(1)}px">${esc(item.sym)}</span>`;
        if (ih > fs * 2.6) inner += `<span class="t-pc" style="font-size:${(fs * 0.72).toFixed(1)}px">${formatPct(v)}</span>`;
      }
      return `<button type="button" class="tile" data-id="${esc(item.id)}" style="left:${x}px;top:${y}px;width:${iw}px;height:${ih}px;background:${bg};color:${fg}" aria-label="${esc(item.name)} ${formatPct(v)}">${inner}</button>`;
    })
    .join('');
}
