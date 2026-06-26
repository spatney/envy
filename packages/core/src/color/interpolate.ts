import type { RGBA } from '../types';
import { clamp01, oklabToRgb, rgbToOklab } from './convert';

export type Interpolator = (t: number) => RGBA;

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Interpolate two colors in sRGB space. Endpoints are exact. */
export function interpolateRgb(a: RGBA, b: RGBA): Interpolator {
  return (t: number): RGBA => {
    if (t <= 0) return { ...a };
    if (t >= 1) return { ...b };
    return {
      r: Math.round(lerp(a.r, b.r, t)),
      g: Math.round(lerp(a.g, b.g, t)),
      b: Math.round(lerp(a.b, b.b, t)),
      a: clamp01(lerp(a.a, b.a, t)),
    };
  };
}

/**
 * Interpolate two colors through OKLab for perceptually smooth ramps.
 * Endpoints are returned exactly (no round-trip drift).
 */
export function interpolateOklab(a: RGBA, b: RGBA): Interpolator {
  const la = rgbToOklab(a);
  const lb = rgbToOklab(b);
  return (t: number): RGBA => {
    if (t <= 0) return { ...a };
    if (t >= 1) return { ...b };
    const rgb = oklabToRgb(
      { L: lerp(la.L, lb.L, t), a: lerp(la.a, lb.a, t), b: lerp(la.b, lb.b, t) },
      lerp(a.a, b.a, t),
    );
    return rgb;
  };
}
