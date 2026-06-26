/** Small numeric helpers used across layout and charts. */

/** Clamp `v` into [min, max]. */
export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

/** Linear interpolation. */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Round to `dpr`-aligned device pixels for crisp 1px strokes. */
export function crisp(v: number, strokeWidth = 1): number {
  const offset = strokeWidth % 2 === 0 ? 0 : 0.5;
  return Math.round(v) + offset;
}

/** Sum of an array. */
export function sum(values: readonly number[]): number {
  let total = 0;
  for (const v of values) total += v;
  return total;
}

/** Integer range [0, n). */
export function range(n: number): number[] {
  const out: number[] = new Array(Math.max(0, n));
  for (let i = 0; i < n; i++) out[i] = i;
  return out;
}
