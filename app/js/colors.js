import { TF_BY_KEY } from './config.js';

const PAL = {
  dark: {
    surface: [26, 27, 30],
    neutral: [62, 62, 68],
    neg: [221, 72, 62],
    pos: [40, 168, 92],
    negText: [255, 186, 179],
    posText: [160, 226, 184],
    flatText: '#b9b9be',
  },
  light: {
    surface: [255, 255, 255],
    neutral: [212, 212, 218],
    neg: [222, 64, 54],
    pos: [28, 158, 82],
    negText: [176, 34, 24],
    posText: [20, 118, 70],
    flatText: '#55565c',
  },
};

const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const rgb = (c) => `rgb(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])})`;
const lum = (c) => (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;

export const isFlat = (v) => v == null || Math.abs(v) < 0.05;

export function intensity(v, tf) {
  if (v == null) return 0;
  const scale = TF_BY_KEY[tf]?.scale ?? 10;
  return Math.min(1, Math.abs(v) / scale) ** 0.7;
}

// Solid fill for bubbles and treemap tiles.
export function fillColors(v, tf, theme) {
  const P = PAL[theme] || PAL.dark;
  if (isFlat(v)) return { bg: rgb(P.neutral), fg: theme === 'light' ? '#2a2a2e' : '#f2f2f3' };
  const strong = v > 0 ? P.pos : P.neg;
  const bg = mix(P.neutral, strong, 0.22 + 0.78 * intensity(v, tf));
  return { bg: rgb(bg), fg: lum(bg) > 0.6 ? '#1b1b1f' : '#ffffff' };
}

// Background/foreground for the % cells of the list.
export function cellColors(v, tf, theme, selected) {
  const P = PAL[theme] || PAL.dark;
  if (v == null) return null;
  if (isFlat(v)) {
    return { bg: rgb(mix(P.surface, P.neutral, selected ? 0.85 : 0.55)), fg: P.flatText };
  }
  const t = intensity(v, tf);
  const strong = v > 0 ? P.pos : P.neg;
  const text = v > 0 ? P.posText : P.negText;
  if (selected) {
    const bg = mix(P.surface, strong, 0.42 + 0.58 * t);
    return { bg: rgb(bg), fg: lum(bg) > 0.62 ? rgb(text) : '#ffffff' };
  }
  const bg = mix(P.surface, strong, theme === 'light' ? 0.1 + 0.26 * t : 0.14 + 0.3 * t);
  return { bg: rgb(bg), fg: rgb(text) };
}

export function textColor(v, theme) {
  const P = PAL[theme] || PAL.dark;
  if (isFlat(v)) return P.flatText;
  return rgb(v > 0 ? (theme === 'light' ? P.pos : P.posText) : theme === 'light' ? P.neg : P.negText);
}

export function barColor(v, theme) {
  const P = PAL[theme] || PAL.dark;
  if (isFlat(v)) return rgb(P.neutral);
  return rgb(v > 0 ? P.pos : P.neg);
}
