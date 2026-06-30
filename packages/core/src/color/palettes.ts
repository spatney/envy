import type { RGBA } from '../types';
import { parseColor } from './parse';
import { interpolateOklab, type Interpolator } from './interpolate';

/** A vibrant, accessible categorical palette (matches the default theme). */
const CATEGORICAL: Record<string, string[]> = {
  graphein: [
    '#3b82f6',
    '#14b8a6',
    '#f59e0b',
    '#ef4444',
    '#8b5cf6',
    '#ec4899',
    '#10b981',
    '#f97316',
    '#6366f1',
    '#84cc16',
  ],
  colorblind: ['#E69F00', '#56B4E9', '#009E73', '#F0E442', '#0072B2', '#D55E00', '#CC79A7', '#999999'],
  bright: [
    '#2563eb',
    '#06b6d4',
    '#22c55e',
    '#eab308',
    '#f97316',
    '#ef4444',
    '#a855f7',
    '#ec4899',
  ],
  muted: [
    '#4f46e5',
    '#0f766e',
    '#65a30d',
    '#ca8a04',
    '#c2410c',
    '#be123c',
    '#7c3aed',
    '#475569',
  ],
};

/** Get a categorical palette by name (defaults to the 'graphein' palette). */
export function categorical(name = 'graphein'): string[] {
  return [...(CATEGORICAL[name] ?? CATEGORICAL.graphein)];
}

export const categoricalSchemes = Object.keys(CATEGORICAL);

const must = (hex: string): RGBA => {
  const c = parseColor(hex);
  if (!c) throw new Error(`Graphein: invalid palette color ${hex}`);
  return c;
};

/**
 * Build a continuous ramp from ordered color stops, interpolating each segment
 * in OKLab. Endpoints (t=0,1) return the first/last stop exactly.
 */
export function rampFromStops(stops: string[]): Interpolator {
  const colors = stops.map(must);
  if (colors.length === 1) return () => ({ ...colors[0] });
  const n = colors.length - 1;
  const segs = colors.slice(0, n).map((c, i) => interpolateOklab(c, colors[i + 1]));
  return (t: number): RGBA => {
    if (t <= 0) return { ...colors[0] };
    if (t >= 1) return { ...colors[n] };
    const scaled = t * n;
    const i = Math.min(n - 1, Math.floor(scaled));
    return segs[i](scaled - i);
  };
}

const SEQUENTIAL_STOPS: Record<string, string[]> = {
  blues: ['#f7fbff', '#c6dbef', '#6baed6', '#2171b5', '#08306b'],
  teal: ['#f0fdfa', '#99f6e4', '#2dd4bf', '#0d9488', '#134e4a'],
  viridis: ['#440154', '#3b528b', '#21918c', '#5ec962', '#fde725'],
  magma: ['#000004', '#3b0f70', '#8c2981', '#de4968', '#fe9f6d', '#fcfdbf'],
  greys: ['#ffffff', '#bdbdbd', '#636363', '#000000'],
};

const DIVERGING_STOPS: Record<string, string[]> = {
  redblue: ['#b2182b', '#f7f7f7', '#2166ac'],
  spectral: ['#d53e4f', '#fc8d59', '#fee08b', '#ffffbf', '#99d594', '#3288bd'],
  bluered: ['#2166ac', '#f7f7f7', '#b2182b'],
};

/** A named sequential interpolator (blues, teal, viridis, magma, greys). */
export function sequential(name: string): Interpolator {
  return rampFromStops(SEQUENTIAL_STOPS[name.toLowerCase()] ?? SEQUENTIAL_STOPS.viridis);
}

/** A named diverging interpolator (redBlue, spectral, blueRed). */
export function diverging(name: string): Interpolator {
  return rampFromStops(DIVERGING_STOPS[name.toLowerCase()] ?? DIVERGING_STOPS.redblue);
}

export const sequentialSchemes = Object.keys(SEQUENTIAL_STOPS);
export const divergingSchemes = Object.keys(DIVERGING_STOPS);
