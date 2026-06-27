import type { RGBA } from '../types';
import { parseColor } from './parse';
import { categorical } from './palettes';
import type { Interpolator } from './interpolate';

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

export interface ColorScale<T> {
  map(value: T): RGBA;
}

/** Map a continuous numeric domain through a sequential interpolator. */
export function sequentialColorScale(opts: {
  domain: [number, number];
  interpolator: Interpolator;
  clamp?: boolean;
}): ColorScale<number> {
  const [d0, d1] = opts.domain;
  const span = d1 - d0;
  return {
    map(value: number): RGBA {
      let t = span === 0 ? 0.5 : (value - d0) / span;
      if (opts.clamp !== false) t = clamp01(t);
      return opts.interpolator(t);
    },
  };
}

/** Map a [min, mid, max] domain symmetrically through a diverging interpolator. */
export function divergingColorScale(opts: {
  domain: [number, number, number];
  interpolator: Interpolator;
  clamp?: boolean;
}): ColorScale<number> {
  const [d0, dm, d1] = opts.domain;
  return {
    map(value: number): RGBA {
      let t: number;
      if (value <= dm) {
        const lo = dm - d0;
        t = lo === 0 ? 0 : 0.5 * ((value - d0) / lo);
      } else {
        const hi = d1 - dm;
        t = hi === 0 ? 1 : 0.5 + 0.5 * ((value - dm) / hi);
      }
      if (opts.clamp !== false) t = clamp01(t);
      return opts.interpolator(t);
    },
  };
}

/** Map categorical keys to palette colors (cycled by first-seen index). */
export function ordinalColorScale(opts: {
  domain?: string[];
  palette?: string[];
}): ColorScale<string> {
  const palette = (opts.palette ?? categorical()).map((c) => {
    const rgba = parseColor(c);
    if (!rgba) throw new Error(`Graphein: invalid palette color ${c}`);
    return rgba;
  });
  const index = new Map<string, number>();
  (opts.domain ?? []).forEach((k, i) => index.set(k, i));
  let next = index.size;
  return {
    map(value: string): RGBA {
      let i = index.get(value);
      if (i === undefined) {
        i = next++;
        index.set(value, i);
      }
      return palette[i % palette.length];
    },
  };
}
