import type { RGBA } from '../types';
import { clamp01 } from './convert';

/** A small but useful set of CSS named colors. */
const NAMED: Record<string, RGBA> = {
  transparent: { r: 0, g: 0, b: 0, a: 0 },
  white: { r: 255, g: 255, b: 255, a: 1 },
  black: { r: 0, g: 0, b: 0, a: 1 },
  red: { r: 255, g: 0, b: 0, a: 1 },
  green: { r: 0, g: 128, b: 0, a: 1 },
  blue: { r: 0, g: 0, b: 255, a: 1 },
  gray: { r: 128, g: 128, b: 128, a: 1 },
  grey: { r: 128, g: 128, b: 128, a: 1 },
  orange: { r: 255, g: 165, b: 0, a: 1 },
  purple: { r: 128, g: 0, b: 128, a: 1 },
  teal: { r: 0, g: 128, b: 128, a: 1 },
  yellow: { r: 255, g: 255, b: 0, a: 1 },
};

function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  };
}

function parseHex(hex: string): RGBA | null {
  const h = hex.slice(1);
  const expand = (s: string) => parseInt(s.length === 1 ? s + s : s, 16);
  if (h.length === 3 || h.length === 4) {
    const r = expand(h[0]);
    const g = expand(h[1]);
    const b = expand(h[2]);
    const a = h.length === 4 ? expand(h[3]) / 255 : 1;
    return { r, g, b, a };
  }
  if (h.length === 6 || h.length === 8) {
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
    if ([r, g, b].some(Number.isNaN)) return null;
    return { r, g, b, a };
  }
  return null;
}

/**
 * Parse a CSS color string into RGBA (r,g,b in 0..255, a in 0..1).
 * Supports hex (#rgb/#rgba/#rrggbb/#rrggbbaa), rgb()/rgba(), hsl()/hsla(),
 * and a small set of named colors. Returns null when unparseable.
 */
export function parseColor(input: string): RGBA | null {
  if (typeof input !== 'string') return null;
  const str = input.trim().toLowerCase();
  if (str === '') return null;

  if (str in NAMED) return { ...NAMED[str] };
  if (str.startsWith('#')) return parseHex(str);

  const fn = /^(rgba?|hsla?)\(([^)]+)\)$/.exec(str);
  if (!fn) return null;
  const kind = fn[1];
  const parts = fn[2]
    .split(/[,/\s]+/)
    .map((p) => p.trim())
    .filter((p) => p !== '');

  const num = (p: string): number => (p.endsWith('%') ? parseFloat(p) / 100 : parseFloat(p));

  if (kind === 'rgb' || kind === 'rgba') {
    if (parts.length < 3) return null;
    const ch = (p: string) => (p.endsWith('%') ? Math.round((parseFloat(p) / 100) * 255) : Math.round(parseFloat(p)));
    return {
      r: ch(parts[0]),
      g: ch(parts[1]),
      b: ch(parts[2]),
      a: parts[3] !== undefined ? clamp01(num(parts[3])) : 1,
    };
  }
  // hsl / hsla
  if (parts.length < 3) return null;
  const h = parseFloat(parts[0]);
  const s = clamp01(num(parts[1]));
  const l = clamp01(num(parts[2]));
  const { r, g, b } = hslToRgb(h, s, l);
  return { r, g, b, a: parts[3] !== undefined ? clamp01(num(parts[3])) : 1 };
}
