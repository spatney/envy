import type { RGBA } from '../types';
import { srgbToLinear } from './convert';

const WHITE: RGBA = { r: 255, g: 255, b: 255, a: 1 };
const BLACK: RGBA = { r: 0, g: 0, b: 0, a: 1 };

/** WCAG relative luminance of a color. */
export function relativeLuminance(c: RGBA): number {
  const r = srgbToLinear(c.r / 255);
  const g = srgbToLinear(c.g / 255);
  const b = srgbToLinear(c.b / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two colors (1..21). */
export function contrastRatio(a: RGBA, b: RGBA): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Pick whichever of two candidate text colors (default white/black) has the
 * higher contrast against the given background — for legible labels on marks.
 */
export function readableTextColor(
  bg: RGBA,
  options: { light?: RGBA; dark?: RGBA } = {},
): RGBA {
  const light = options.light ?? WHITE;
  const dark = options.dark ?? BLACK;
  return contrastRatio(bg, light) >= contrastRatio(bg, dark) ? light : dark;
}
