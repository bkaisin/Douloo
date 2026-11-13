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
    // Radii: area ∝ |variation|, capped at the 95th percentile so a single
    // outlier does not crush everything else, then scaled to fill the stage.
    const abs = live.map((n) => Math.abs(n.value));
    const sortedAbs = [...abs].sort((a, b) => a - b);
    let cap = quantile(sortedAbs, 0.95);
    if (!(cap > 0)) cap = sortedAbs[sortedAbs.length - 1] || 1;
    const weights = abs.map((v) => 0.05 + 0.95 * Math.min(1, v / cap));
    const sumW = weights.reduce((a, b) => a + b, 0);
    const fill = 0.34;
    const R = Math.sqrt((fill * W * H) / (Math.PI * sumW));
    const maxR = Math.min(W, H) * 0.13;
    // Never smaller than what is needed to read a short ticker.
    const minR = Math.min(maxR, W * H > 400000 ? 13 : 11);
    let biggest = 0;
    live.forEach((n, i) => {
      n.rt = clamp(R * Math.sqrt(weights[i]), minR, maxR);
      biggest = Math.max(biggest, n.rt);
    });

    // Horizontal scale: variation -> x. Always includes 0.
    const vals = live.map((n) => n.value).sort((a, b) => a - b);
    let lo = Math.min(0, quantile(vals, 0.02));
    let hi = Math.max(0, quantile(vals, 0.98));
    if (hi - lo < 0.2) {
      lo -= 0.1;
      hi += 0.1;
    }
    const span = hi - lo;
    lo -= span * 0.03;
    hi += span * 0.03;
    const padL = Math.min(W * 0.3, biggest + 6);
    const padR = padL;
    const usable = Math.max(10, W - padL - padR);
    this.sx = (v) => padL + ((clamp(v, lo, hi) - lo) / (hi - lo)) * usable;
    this.drawAxis(lo, hi);

    for (const n of live) {
      if (n.born) {
        n.born = false;
        n.x = clamp(this.sx(n.value) + (Math.random() - 0.5) * 40, n.rt, W - n.rt);
        n.y = clamp(H / 2 + (Math.random() - 0.5) * H * 0.8, n.rt, H - n.rt);
      }
      this.paint(n);
    }
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
    const sym = item.sym;
    const em = textEm(sym);
    const hasImg = !!item.image;
    let mode;
    if (rt >= 31 && hasImg) mode = 'full';
    else if (rt >= 20 && hasImg) mode = 'icon';
    else if (rt >= 26) mode = 'pct';
    else mode = 'tk';
    let fsT;
    let icon = 0;
    if (mode === 'full') {
      icon = rt * 0.48;
      fsT = Math.min(rt * 0.33, (rt * 1.55) / em);
    } else if (mode === 'icon') {
      icon = rt * 0.62;
      fsT = Math.min(rt * 0.36, (rt * 1.5) / em);
    } else if (mode === 'pct') {
      fsT = Math.min(rt * 0.42, (rt * 1.6) / em);
    } else {
      fsT = Math.min(rt * 0.5, (rt * 1.7) / em);
    }
    const showText = fsT >= 4;
    const showPct = mode === 'full' || mode === 'pct';
    const pct = showPct ? formatPct(n.value) : '';
    const sig = `${Math.round(rt * 2)}|${mode}|${bg}|${fg}|${pct}|${showText}`;
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
    const kx = 0.05;
    const ky = 0.0025;
    const amp = this.reduced ? 0 : 0.022;
    const damping = Math.pow(0.9, dt);
    const cy = H / 2;

    for (const n of nodes) {
      n.r += (n.rt - n.r) * Math.min(1, 0.12 * dt);
      if (n.dying && n.r < 0.6) {
        n.el.remove();
        this.nodes.delete(n.id);
        continue;
      }
      if (n.fixed) continue;
      let fx = (this.sx(n.value) - n.x) * kx;
      let fy = (cy - n.y) * ky;
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
