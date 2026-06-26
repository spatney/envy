import { timeTickFormat, timeTicks } from '../ticks';
import type { ContinuousScale } from './types';

export interface TimeScaleOptions {
  domain: [number, number] | [Date, Date];
  range: [number, number];
  clamp?: boolean;
}

function toMillis(value: number | Date): number {
  return value instanceof Date ? value.getTime() : value;
}

function clampValue(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function timeScale(opts: TimeScaleOptions): ContinuousScale {
  const domain: [number, number] = [toMillis(opts.domain[0]), toMillis(opts.domain[1])];
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
      return timeTicks(domain[0], domain[1], count);
    },
    tickFormat(count = 10): (v: number) => string {
      return timeTickFormat(this.ticks(count));
    },
    nice(count = 10): ContinuousScale {
      const values = timeTicks(domain[0], domain[1], count);
      if (values.length === 0) {
        return timeScale({ domain, range, clamp });
      }

      return timeScale({ domain: [values[0], values[values.length - 1]], range, clamp });
    },
    copy(): ContinuousScale {
      return timeScale({ domain, range, clamp });
    },
  };

  return scale;
}
