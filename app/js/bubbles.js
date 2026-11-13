import { formatPct, esc, safeImg, imgSize } from './format.js';
import { fillColors } from './colors.js';

// Swarm view: x = variation (0 % line drawn), bubbles stack vertically and
// move with a small "liquid" physics simulation.
// Bubble AREA is proportional to the absolute variation of the timeframe.

const quantile = (sorted, q) => {
  if (!sorted.length) return 0;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
};
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// Rough text width in "em" (CJK glyphs are about twice as wide as latin ones).
function textEm(s) {
  let w = 0;
  for (const ch of s) w += ch.charCodeAt(0) > 0x2e80 ? 1 : /[A-Z0-9]/.test(ch) ? 0.66 : 0.56;
  return Math.max(w, 1);
}

// Swarm placement. Sizes are given (they encode the variation). Each bubble,
// biggest first, takes the free y closest to the centre line at its exact x;
// only when that column is full up to the stage height is it moved sideways
// to the nearest free spot, within [minX, maxX] (never across the 0 % line).
// The result has no overlap, so the bubbles do not keep colliding.
function placeSwarm(xs, rs, { gap, half, minX, maxX }) {
  const n = xs.length;
  const X = new Float64Array(n);
  const Y = new Float64Array(n);
  let maxR = 0;
  for (const r of rs) maxR = Math.max(maxR, r);
  const bw = 2 * maxR + gap;
  const buckets = new Map();
  const nearby = (x, r) => {
    const out = [];
    const reach = r + maxR + gap;
    for (let b = Math.floor((x - reach) / bw); b <= Math.floor((x + reach) / bw); b++) {
      const list = buckets.get(b);
      if (!list) continue;
      for (const j of list) {
        const d = r + rs[j] + gap;
        const dx = X[j] - x;
        if (dx < d && dx > -d) out.push(j);
      }
    }
    return out;
  };
  // Free y closest to the centre for radius r at x, or null if none within ±limit.
  const freeY = (x, r, limit, flip) => {
    const near = nearby(x, r);
    const cands = [0];
    for (const j of near) {
      const d = r + rs[j] + gap;
      const dx = X[j] - x;
      const h = Math.sqrt(Math.max(0, d * d - dx * dx));
      cands.push(Y[j] + h, Y[j] - h);
    }
    cands.sort((a, b) => Math.abs(a) - Math.abs(b) || (a - b) * flip);
    for (const y of cands) {
      if (Math.abs(y) > limit) return null;
      let free = true;
      for (const j of near) {
        const d = r + rs[j] + gap - 0.01;
        const dx = X[j] - x;
        const dy = Y[j] - y;
        if (dx * dx + dy * dy < d * d) {
          free = false;
          break;
        }
      }
      if (free) return y;
    }
    return null;
  };

  const order = [...Array(n).keys()].sort((a, b) => rs[b] - rs[a] || a - b);
  for (const i of order) {
    const r = rs[i];
    const limit = Math.max(0, half - r);
    const flip = i % 2 ? 1 : -1; // alternate up/down and left/right
    const x0 = clamp(xs[i], minX[i], maxX[i]);
    let x = x0;
    let y = freeY(x0, r, limit, flip);
    if (y === null) {
      const step = Math.max(3, r * 0.75);
      for (let k = 1; y === null; k++) {
        let inRange = false;
        for (const sgn of [flip, -flip]) {
          const xx = x0 + sgn * k * step;
          if (xx < minX[i] || xx > maxX[i]) continue;
          inRange = true;
          const yy = freeY(xx, r, limit, flip);
          if (yy !== null) {
            x = xx;
            y = yy;
            break;
          }
        }
        if (!inRange) break;
      }
      if (y === null) return { X, Y, failed: true };
    }
    X[i] = x;
    Y[i] = y;
    const b = Math.floor(x / bw);
    if (!buckets.has(b)) buckets.set(b, []);
    buckets.get(b).push(i);
  }
  return { X, Y, failed: false };
}

function niceStep(span, target = 5) {
  const raw = span / target;
  const mag = 10 ** Math.floor(Math.log10(raw));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * mag >= raw) return m * mag;
  return 10 * mag;
}

export class BubbleField {
  constructor(stage, { onSelect }) {
    this.stage = stage;
    this.onSelect = onSelect;
    this.axis = document.createElement('div');
    this.axis.className = 'axis';
    this.layer = document.createElement('div');
    this.layer.className = 'bubble-layer';
    stage.append(this.axis, this.layer);
    this.nodes = new Map();
    this.tf = '1d';
    this.theme = 'dark';
    this.W = stage.clientWidth;
    this.H = stage.clientHeight;
    this.running = false;
    this.visible = false;
    this.raf = 0;
    this.time = 0;
    this.last = 0;
    this.sx = () => this.W / 2;
    this.reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(stage);
    this.bindPointer();
  }

  setVisible(v) {
    this.visible = v;
    this.layer.hidden = !v;
    this.axis.hidden = !v;
    if (v) this.start();
    else this.stop();
  }

  // items: [{ id, sym, image, value, entity }]
  setData(items, { tf, theme }) {
    this.tf = tf;
    this.theme = theme;
    const keep = new Set();
    for (const item of items) {
      keep.add(item.id);
      let n = this.nodes.get(item.id);
      if (!n) {
        const el = document.createElement('div');
        el.className = 'bubble';
        el.dataset.id = item.id;
        el.tabIndex = 0;
        el.setAttribute('role', 'button');
        this.layer.appendChild(el);
        n = {
          id: item.id,
          el,
          x: 0,
          y: 0,
          vx: 0,
          vy: 0,
          r: 0,
          rt: 0,
          born: true,
          px: Math.random() * Math.PI * 2,
          py: Math.random() * Math.PI * 2,
          f: 0.35 + Math.random() * 0.5,
          sig: '',
        };
        this.nodes.set(item.id, n);
      }
      n.item = item;
      n.value = item.value;
      n.dying = false;
    }
    for (const n of this.nodes.values()) {
      if (!keep.has(n.id)) {
        n.dying = true;
        n.rt = 0;
      }
    }
    this.layout();
    if (this.visible) this.start();
  }

  resize() {
    const W = this.stage.clientWidth;
    const H = this.stage.clientHeight;
    if (!W || !H) return;
    if (this.W && this.H && (W !== this.W || H !== this.H)) {
      // Portrait <-> landscape: scale positions so the bubbles flow to the new shape.
      for (const n of this.nodes.values()) {
        n.x *= W / this.W;
        n.y *= H / this.H;
      }
    }
    this.W = W;
    this.H = H;
    this.layout();
  }

  layout() {
    const { W, H } = this;
    if (!W || !H) return;
    const live = [...this.nodes.values()].filter((n) => !n.dying);
    if (!live.length) {
      this.axis.innerHTML = '';
      return;
    }
    // Relative radii: area ∝ |variation|, capped at the 95th percentile so a
    // single outlier does not crush everything else.
    const abs = live.map((n) => Math.abs(n.value));
    const sortedAbs = [...abs].sort((a, b) => a - b);
    let cap = quantile(sortedAbs, 0.95);
    if (!(cap > 0)) cap = sortedAbs[sortedAbs.length - 1] || 1;
    const base = abs.map((v) => Math.sqrt(0.05 + 0.95 * Math.min(1, v / cap)));

    // Horizontal scale: variation -> x. Always includes 0.
    // Extreme outliers are pinned to the edges (their label keeps the real value).
    const vals = live.map((n) => n.value).sort((a, b) => a - b);
    const q1 = quantile(vals, 0.25);
    const q3 = quantile(vals, 0.75);
    const iqr = Math.max(q3 - q1, 0.5);
    let lo = Math.min(0, Math.max(quantile(vals, 0.02), q1 - 4 * iqr));
    let hi = Math.max(0, Math.min(quantile(vals, 0.98), q3 + 4 * iqr));
    if (hi - lo < 0.2) {
      lo -= 0.1;
      hi += 0.1;
    }
    const span = hi - lo;
    lo -= span * 0.03;
    hi += span * 0.03;
    // Vertical band: the whole stage height (minus room for the axis labels).
    const top = 22;
    const half = (H - top - 4) / 2;
    const cy = top + half;
    const maxR = Math.max(6, Math.min(W * 0.12, half * 0.9, Math.min(W, H) * 0.16));
    const gap = 2.5;

    // Global scale from the available area; the bubble sizes then stay fixed
    // and crowded columns spread sideways instead of shrinking.
    const sumB2 = base.reduce((a, b) => a + b * b, 0);
    let s = Math.sqrt((0.36 * W * 2 * half) / (Math.PI * sumB2));
    // Never smaller than what a short ticker needs.
    let minR = W * H > 400000 ? 13 : 11;
    const radii = () => base.map((b) => clamp(s * b, Math.min(minR, maxR), maxR));
    // Circles cannot fill more than ~55 % of the band with this placement:
    // when the bubbles cannot fit at all, scale them down before trying.
    const area = (r) => r.reduce((a, x) => a + Math.PI * x * x, 0);
    for (let k = 0; k < 30 && area(radii()) > 0.55 * W * 2 * half; k++) {
      s *= 0.95;
      minR *= 0.95;
    }
    let best;
    for (let attempt = 0; attempt < 10; attempt++) {
      const r = radii();
      const pad = Math.min(W * 0.3, Math.max(...r) + 6);
      const usable = Math.max(10, W - 2 * pad);
      const sx = (v) => pad + ((clamp(v, lo, hi) - lo) / (hi - lo)) * usable;
      const xs = live.map((n) => sx(n.value));
      const zero = sx(0);
      const minX = [];
      const maxX = [];
      live.forEach((n, i) => {
        let a = r[i];
        let b = W - r[i];
        if (n.value <= -0.05) b = Math.min(b, zero - 1);
        else if (n.value >= 0.05) a = Math.max(a, zero + 1);
        if (b < a) a = b = clamp(xs[i], r[i], W - r[i]);
        minX.push(a);
        maxX.push(b);
      });
      const placed = placeSwarm(xs, r, { gap, half, minX, maxX });
      best = { r, sx, x: placed.X, y: placed.Y };
      if (!placed.failed) break;
      // Not even room sideways (far too many bubbles): scale everything down.
      s *= 0.9;
      minR *= 0.9;
    }

    this.sx = best.sx;
    this.drawAxis(lo, hi);
    live.forEach((n, i) => {
      n.rt = best.r[i];
      n.tx = best.x[i];
      n.ty = cy + best.y[i];
      if (n.born) {
        n.born = false;
        n.x = n.tx + (Math.random() - 0.5) * 6;
        n.y = n.ty + (Math.random() - 0.5) * 6;
      }
      this.paint(n);
    });
  }

  drawAxis(lo, hi) {
    const zero = this.sx(0);
    let html = `<div class="zone neg" style="width:${zero}px"></div><div class="zone pos" style="left:${zero}px"></div>`;
    const step = niceStep(hi - lo);
    for (let t = Math.ceil(lo / step) * step; t <= hi + 1e-9; t += step) {
      if (Math.abs(t) < step / 1000) continue;
      html += `<div class="tick" style="left:${this.sx(t)}px"><span>${formatPct(t)}</span></div>`;
    }
    html += `<div class="tick zero" style="left:${zero}px"><span>0 %</span></div>`;
    this.axis.innerHTML = html;
  }

  // Sets size, colours and label of a bubble for its target radius.
  paint(n) {
    const { item } = n;
    const rt = n.rt;
    const { bg, fg } = fillColors(n.value, this.tf, this.theme);
    let sym = item.sym;
    let em = textEm(sym);
    const hasImg = !!item.image;
    let mode;
    if (rt >= 31 && hasImg) mode = 'full';
    else if (rt >= 20 && hasImg) mode = 'icon';
    else if (rt >= 26) mode = 'pct';
    else mode = 'tk';
    // [max font / radius, usable width / radius] for each label layout.
    const [kH, kW] = { full: [0.33, 1.55], icon: [0.36, 1.5], pct: [0.42, 1.6], tk: [0.5, 1.7] }[mode];
    const icon = mode === 'full' ? rt * 0.48 : mode === 'icon' ? rt * 0.62 : 0;
    let fsT = Math.min(rt * kH, (rt * kW) / em);
    // Long names (e.g. "Liquid Staking") fall back to their short form.
    if (fsT < 7 && item.short && item.short !== sym) {
      sym = item.short;
      em = textEm(sym);
      fsT = Math.min(rt * kH, (rt * kW) / em);
    }
    const showText = fsT >= 4;
    const showPct = mode === 'full' || mode === 'pct';
    const pct = showPct ? formatPct(n.value) : '';
    const sig = `${Math.round(rt * 2)}|${mode}|${bg}|${fg}|${pct}|${showText}|${sym}`;
    if (sig === n.sig) return;
    n.sig = sig;
    const el = n.el;
    const d = rt * 2;
    el.style.width = `${d}px`;
    el.style.height = `${d}px`;
    el.style.background = bg;
    el.style.color = fg;
    const size = icon * (window.devicePixelRatio || 2) > 64 ? 'large' : 'small';
    const img = icon ? `<img src="${safeImg(imgSize(item.image, size))}" alt="" draggable="false" style="width:${icon}px;height:${icon}px">` : '';
    const tk = showText ? `<span class="b-tk" style="font-size:${fsT.toFixed(1)}px">${esc(sym)}</span>` : '';
    const pc = showPct && showText ? `<span class="b-pc" style="font-size:${(fsT * 0.74).toFixed(1)}px">${pct}</span>` : '';
    el.innerHTML = img + tk + pc;
    el.setAttribute('aria-label', `${item.entity?.name ?? sym} ${formatPct(n.value)}`);
  }

  start() {
    if (this.running || !this.visible) return;
    this.running = true;
    this.last = performance.now();
    const loop = (now) => {
      if (!this.running) return;
      const dt = clamp((now - this.last) / 16.67, 0.2, 2.5);
      this.last = now;
      this.time += dt / 60;
      this.step(dt);
      this.render();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  step(dt) {
    const { W, H } = this;
    const nodes = [...this.nodes.values()];
    // Springs towards the beeswarm target + slow currents (liquid feel).
    const kx = 0.05;
    const ky = 0.014;
    const amp = this.reduced ? 0 : 0.03;
    const damping = Math.pow(0.9, dt);

    for (const n of nodes) {
      n.r += (n.rt - n.r) * Math.min(1, 0.12 * dt);
      if (n.dying && n.r < 0.6) {
        n.el.remove();
        this.nodes.delete(n.id);
        continue;
      }
      if (n.fixed) continue;
      let fx = ((n.tx ?? W / 2) - n.x) * kx;
      let fy = ((n.ty ?? H / 2) - n.y) * ky;
      // Liquid feel: slow, smooth, per-bubble currents.
      const t = this.time * n.f;
      fx += Math.sin(t + n.px) * amp * 0.3;
      fy += Math.cos(t * 1.3 + n.py) * amp;
      n.vx = (n.vx + fx * dt) * damping;
      n.vy = (n.vy + fy * dt) * damping;
      n.x += n.vx * dt;
      n.y += n.vy * dt;
    }

    // Collisions (two passes for stability). Light bubbles yield to heavy ones.
    const list = [...this.nodes.values()];
    const len = list.length;
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < len; i++) {
        const a = list[i];
        for (let j = i + 1; j < len; j++) {
          const b = list[j];
          const min = a.r + b.r + 1.5;
          const dx = b.x - a.x;
          if (dx > min || dx < -min) continue;
          const dy = b.y - a.y;
          if (dy > min || dy < -min) continue;
          const d2 = dx * dx + dy * dy;
          if (d2 >= min * min) continue;
          const d = Math.sqrt(d2) || 0.01;
          const nx = d2 ? dx / d : Math.random() - 0.5;
          const ny = d2 ? dy / d : Math.random() - 0.5;
          const overlap = min - d;
          const ma = a.fixed ? 1e9 : a.r * a.r + 1;
          const mb = b.fixed ? 1e9 : b.r * b.r + 1;
          const wa = mb / (ma + mb);
          const wb = ma / (ma + mb);
          const push = overlap * 0.5;
          a.x -= nx * push * wa;
          a.y -= ny * push * wa;
          b.x += nx * push * wb;
          b.y += ny * push * wb;
          const vrel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
          if (vrel < 0) {
            const imp = -vrel * 0.4;
            a.vx -= nx * imp * wa;
            a.vy -= ny * imp * wa;
            b.vx += nx * imp * wb;
            b.vy += ny * imp * wb;
          }
        }
      }
    }

    for (const n of list) {
      const r = n.r;
      if (n.x < r) {
        n.x = r;
        n.vx = Math.abs(n.vx) * 0.3;
      } else if (n.x > W - r) {
        n.x = W - r;
        n.vx = -Math.abs(n.vx) * 0.3;
      }
      if (n.y < r) {
        n.y = r;
        n.vy = Math.abs(n.vy) * 0.3;
      } else if (n.y > H - r) {
        n.y = H - r;
        n.vy = -Math.abs(n.vy) * 0.3;
      }
    }
  }

  render() {
    for (const n of this.nodes.values()) {
      const s = n.rt > 0 ? n.r / n.rt : 0;
      n.el.style.transform = `translate3d(${(n.x - n.rt).toFixed(2)}px,${(n.y - n.rt).toFixed(2)}px,0) scale(${s.toFixed(4)})`;
    }
  }

  // Tap opens the detail sheet, drag pushes the bubble through the others.
  bindPointer() {
    const stage = this.stage;
    let drag = null;
    const local = (e) => {
      const rect = stage.getBoundingClientRect();
      return [e.clientX - rect.left, e.clientY - rect.top];
    };
    stage.addEventListener('pointerdown', (e) => {
      const el = e.target.closest?.('.bubble');
      if (!el) return;
      const n = this.nodes.get(el.dataset.id);
      if (!n || n.dying) return;
      const [x, y] = local(e);
      drag = { n, id: e.pointerId, x0: x, y0: y, lx: x, ly: y, moved: false, ox: n.x - x, oy: n.y - y };
      stage.setPointerCapture?.(e.pointerId);
    });
    stage.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const [x, y] = local(e);
      if (!drag.moved && Math.hypot(x - drag.x0, y - drag.y0) > 7) {
        drag.moved = true;
        drag.n.fixed = true;
        drag.n.el.classList.add('dragging');
      }
      if (drag.moved) {
        const n = drag.n;
        n.x = clamp(x + drag.ox, n.r, this.W - n.r);
        n.y = clamp(y + drag.oy, n.r, this.H - n.r);
        n.vx = (x - drag.lx) * 0.6;
        n.vy = (y - drag.ly) * 0.6;
        drag.lx = x;
        drag.ly = y;
      }
    });
    const end = (e, cancel) => {
      if (!drag || e.pointerId !== drag.id) return;
      const { n, moved } = drag;
      n.fixed = false;
      n.el.classList.remove('dragging');
      drag = null;
      if (!moved && !cancel && n.item) this.onSelect(n.item.entity);
    };
    stage.addEventListener('pointerup', (e) => end(e, false));
    stage.addEventListener('pointercancel', (e) => end(e, true));
    stage.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const el = e.target.closest?.('.bubble');
      const n = el && this.nodes.get(el.dataset.id);
      if (n) this.onSelect(n.item.entity);
    });
  }

  repaintAll() {
    for (const n of this.nodes.values()) {
      n.sig = '';
      if (!n.dying) this.paint(n);
    }
  }
}
