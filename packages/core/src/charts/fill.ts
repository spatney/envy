/**
 * Fill helpers shared by mark renderers.
 *
 * Premium area/line fills use a vertical gradient that's richest just under the
 * line and fades toward the baseline, which reads with more depth than a flat
 * translucent wash while staying clean and modern.
 */

import { parseColor } from '../color';

/**
 * Build a vertical (top→bottom) gradient from a CSS color at two alpha stops.
 * `topY` is the visually upper edge (smaller pixel y, e.g. the line/peak) and
 * `bottomY` the lower edge (e.g. the baseline). Falls back to a flat fill when
 * the color can't be parsed or the band is degenerate.
 */
export function verticalFill(
  ctx: CanvasRenderingContext2D,
  color: string,
  topY: number,
  bottomY: number,
  topAlpha: number,
  bottomAlpha: number,
): CanvasGradient | string {
  const rgba = parseColor(color);
  const base = rgba ? `${rgba.r}, ${rgba.g}, ${rgba.b}` : null;
  if (!base || !Number.isFinite(topY) || !Number.isFinite(bottomY) || topY === bottomY) {
    return base ? `rgba(${base}, ${topAlpha})` : color;
  }
  const y0 = Math.min(topY, bottomY);
  const y1 = Math.max(topY, bottomY);
  const startAlpha = topY <= bottomY ? topAlpha : bottomAlpha;
  const endAlpha = topY <= bottomY ? bottomAlpha : topAlpha;
  const grad = ctx.createLinearGradient(0, y0, 0, y1);
  grad.addColorStop(0, `rgba(${base}, ${startAlpha})`);
  grad.addColorStop(1, `rgba(${base}, ${endAlpha})`);
  return grad;
}

/** Smallest finite value in a list, or `fallback` when none are finite. */
export function minFinite(values: Iterable<number>, fallback: number): number {
  let min = Infinity;
  for (const v of values) if (Number.isFinite(v) && v < min) min = v;
  return min === Infinity ? fallback : min;
}

/** Largest finite value in a list, or `fallback` when none are finite. */
export function maxFinite(values: Iterable<number>, fallback: number): number {
  let max = -Infinity;
  for (const v of values) if (Number.isFinite(v) && v > max) max = v;
  return max === -Infinity ? fallback : max;
}
