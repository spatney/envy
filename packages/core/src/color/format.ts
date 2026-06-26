import type { RGBA } from '../types';
import { parseColor } from './parse';

const hex2 = (n: number): string => {
  const v = Math.max(0, Math.min(255, Math.round(n)));
  return v.toString(16).padStart(2, '0');
};

/** Format an RGBA as a CSS rgb()/rgba() string. */
export function rgbaToCss(c: RGBA): string {
  const r = Math.round(c.r);
  const g = Math.round(c.g);
  const b = Math.round(c.b);
  if (c.a >= 1) return `rgb(${r}, ${g}, ${b})`;
  return `rgba(${r}, ${g}, ${b}, ${Number(c.a.toFixed(3))})`;
}

/**
 * Return `color` as a CSS rgba() string at the given alpha (0..1). Accepts any
 * parseable CSS color; falls back to the input string when unparseable.
 */
export function withAlpha(color: string, alpha: number): string {
  const rgba = parseColor(color);
  if (!rgba) return color;
  return rgbaToCss({ ...rgba, a: Math.max(0, Math.min(1, alpha)) });
}

/** Format an RGBA as a hex string (#rrggbb, or #rrggbbaa when includeAlpha). */
export function toHex(c: RGBA, includeAlpha = false): string {
  const base = `#${hex2(c.r)}${hex2(c.g)}${hex2(c.b)}`;
  if (includeAlpha) return base + hex2(c.a * 255);
  return base;
}
