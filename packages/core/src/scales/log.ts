import { formatNumber } from './format';
import type { ContinuousScale } from './types';

export interface LogScaleOptions {
  domain: [number, number];
  range: [number, number];
  base?: number;
  clamp?: boolean;
}

function clampValue(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function assertDomain(domain: [number, number], base: number): void {
  if (base <= 0 || base === 1 || !Number.isFinite(base)) {
    throw new Error('logScale base must be a finite positive number other than 1');
  }

  if (domain[0] === 0 || domain[1] === 0 || domain[0] * domain[1] <= 0) {
    throw new Error('logScale domain must be strictly positive or strictly negative');
  }
}

function transform(value: number, sign: number, base: number): number {
  return sign * (Math.log(Math.abs(value)) / Math.log(base));
}

function untransform(value: number, sign: number, base: number): number {
  return sign > 0 ? base ** value : -(base ** -value);
}

function logTicks(domain: [number, number], base: number): number[] {
  const sign = domain[0] < 0 ? -1 : 1;
  const reverse = domain[1] < domain[0];
  const min = Math.min(Math.abs(domain[0]), Math.abs(domain[1]));
  const max = Math.max(Math.abs(domain[0]), Math.abs(domain[1]));
  const first = Math.ceil(Math.log(min) / Math.log(base) - 1e-12);
  const last = Math.floor(Math.log(max) / Math.log(base) + 1e-12);
  const values: number[] = [];

  for (let exponent = first; exponent <= last; exponent += 1) {
    values.push(sign * base ** exponent);
  }

  if (sign < 0) {
    values.reverse();
  }

  return reverse ? values.reverse() : values;
}

function niceLogDomain(domain: [number, number], base: number): [number, number] {
  const sign = domain[0] < 0 ? -1 : 1;
  const reverse = domain[1] < domain[0];
  const min = Math.min(Math.abs(domain[0]), Math.abs(domain[1]));
  const max = Math.max(Math.abs(domain[0]), Math.abs(domain[1]));
  const niceMin = sign * base ** Math.floor(Math.log(min) / Math.log(base) + 1e-12);
  const niceMax = sign * base ** Math.ceil(Math.log(max) / Math.log(base) - 1e-12);

  if (sign < 0) {
    return reverse ? [niceMin, niceMax] : [niceMax, niceMin];
  }

  return reverse ? [niceMax, niceMin] : [niceMin, niceMax];
}

export function logScale(opts: LogScaleOptions): ContinuousScale {
  const domain: [number, number] = [opts.domain[0], opts.domain[1]];
  const range: [number, number] = [opts.range[0], opts.range[1]];
  const base = opts.base ?? 10;
  const clamp = opts.clamp === true;
  assertDomain(domain, base);

  const sign = domain[0] < 0 ? -1 : 1;
  const transformedDomain: [number, number] = [
    transform(domain[0], sign, base),
    transform(domain[1], sign, base),
  ];

  const scale: ContinuousScale = {
    get domain() {
      return domain;
    },
    get range() {
      return range;
    },
    map(value: number): number {
      const [d0, d1] = transformedDomain;
      const [r0, r1] = range;
      // A log scale is only defined for finite values on the same side of zero
      // as its domain; a zero, non-finite, or wrong-sign value has no image here.
      if (!Number.isFinite(value) || value * sign <= 0) return NaN;
      // Degenerate domain (min === max): every in-sign value maps to the start.
      if (d0 === d1) {
        return clamp ? clampValue(r0, Math.min(r0, r1), Math.max(r0, r1)) : r0;
      }
      const transformed = transform(value, sign, base);
      const mapped = r0 + ((transformed - d0) / (d1 - d0)) * (r1 - r0);
      return clamp ? clampValue(mapped, Math.min(r0, r1), Math.max(r0, r1)) : mapped;
    },
    invert(pixel: number): number {
      const [d0, d1] = transformedDomain;
      const [r0, r1] = range;
      // Degenerate domain: the inverse of a constant scale is that constant.
      if (d0 === d1) return domain[0];
      const input = clamp ? clampValue(pixel, Math.min(r0, r1), Math.max(r0, r1)) : pixel;
      return untransform(d0 + ((input - r0) / (r1 - r0)) * (d1 - d0), sign, base);
    },
    ticks(): number[] {
      return logTicks(domain, base);
    },
    tickFormat(): (v: number) => string {
      return (value: number) => formatNumber(value, 12);
    },
    nice(): ContinuousScale {
      return logScale({ domain: niceLogDomain(domain, base), range, base, clamp });
    },
    copy(): ContinuousScale {
      return logScale({ domain, range, base, clamp });
    },
  };

  return scale;
}
