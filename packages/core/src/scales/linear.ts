import { niceDomain, tickStep, ticks } from '../ticks';
import { formatNumber, precisionFromStep } from './format';
import type { ContinuousScale } from './types';

export interface LinearScaleOptions {
  domain: [number, number];
  range: [number, number];
  clamp?: boolean;
}

function clampValue(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function linearScale(opts: LinearScaleOptions): ContinuousScale {
  const domain: [number, number] = [opts.domain[0], opts.domain[1]];
  const range: [number, number] = [opts.range[0], opts.range[1]];
  const clamp = opts.clamp === true;

  const scale: ContinuousScale = {
    get domain() {
      return domain;
    },
    get range() {
      return range;
    },
    map(value: number): number {
      const [d0, d1] = domain;
      const [r0, r1] = range;
      if (d0 === d1) {
        return r0;
      }

      const mapped = r0 + ((value - d0) / (d1 - d0)) * (r1 - r0);
      return clamp ? clampValue(mapped, Math.min(r0, r1), Math.max(r0, r1)) : mapped;
    },
    invert(pixel: number): number {
      const [d0, d1] = domain;
      const [r0, r1] = range;
      if (r0 === r1) {
        return d0;
      }

      const input = clamp ? clampValue(pixel, Math.min(r0, r1), Math.max(r0, r1)) : pixel;
      return d0 + ((input - r0) / (r1 - r0)) * (d1 - d0);
    },
    ticks(count = 10): number[] {
      return ticks(domain[0], domain[1], count);
    },
    tickFormat(count = 10): (v: number) => string {
      const step = tickStep(domain[0], domain[1], count);
      const precision = precisionFromStep(step);
      return (value: number) => formatNumber(value, precision);
    },
    nice(count = 10): ContinuousScale {
      return linearScale({ domain: niceDomain(domain[0], domain[1], count), range, clamp });
    },
    copy(): ContinuousScale {
      return linearScale({ domain, range, clamp });
    },
  };

  return scale;
}
