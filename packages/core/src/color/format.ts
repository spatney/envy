import type { RGBA } from '../types';

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

/** Format an RGBA as a hex string (#rrggbb, or #rrggbbaa when includeAlpha). */
export function toHex(c: RGBA, includeAlpha = false): string {
  const base = `#${hex2(c.r)}${hex2(c.g)}${hex2(c.b)}`;
  if (includeAlpha) return base + hex2(c.a * 255);
  return base;
}
