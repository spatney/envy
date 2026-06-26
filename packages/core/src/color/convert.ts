import type { RGBA } from '../types';

/** Color-space conversions: sRGB <-> linear <-> OKLab <-> OKLCH. */

export const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
export const clamp255 = (x: number): number => (x < 0 ? 0 : x > 255 ? 255 : x);

/** sRGB channel (0..1) -> linear-light (0..1). */
export function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** linear-light (0..1) -> sRGB channel (0..1). */
export function linearToSrgb(c: number): number {
  return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

export interface OKLab {
  L: number;
  a: number;
  b: number;
}

export interface OKLCH {
  L: number;
  C: number;
  /** Hue in radians. */
  h: number;
}

/** RGBA (0..255) -> OKLab. */
export function rgbToOklab(color: RGBA): OKLab {
  const r = srgbToLinear(color.r / 255);
  const g = srgbToLinear(color.g / 255);
  const b = srgbToLinear(color.b / 255);

  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;

  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);

  return {
    L: 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
    a: 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
    b: 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_,
  };
}

/** OKLab -> RGBA (0..255), gamut-clamped. Alpha defaults to 1. */
export function oklabToRgb(lab: OKLab, alpha = 1): RGBA {
  const { L, a, b } = lab;
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;

  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;

  const r = linearToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s);
  const g = linearToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s);
  const bch = linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s);

  return {
    r: Math.round(clamp255(r * 255)),
    g: Math.round(clamp255(g * 255)),
    b: Math.round(clamp255(bch * 255)),
    a: clamp01(alpha),
  };
}

export function oklabToOklch(lab: OKLab): OKLCH {
  return { L: lab.L, C: Math.hypot(lab.a, lab.b), h: Math.atan2(lab.b, lab.a) };
}

export function oklchToOklab(lch: OKLCH): OKLab {
  return { L: lch.L, a: lch.C * Math.cos(lch.h), b: lch.C * Math.sin(lch.h) };
}
