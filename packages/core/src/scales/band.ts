import type { BandScale, PointScale } from './types';

export interface BandScaleOptions {
  domain: string[];
  range: [number, number];
  paddingInner?: number;
  paddingOuter?: number;
  align?: number;
}

export interface PointScaleOptions {
  domain: string[];
  range: [number, number];
  padding?: number;
  align?: number;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

export function bandScale(opts: BandScaleOptions): BandScale {
  const domain = unique(opts.domain);
  const range: [number, number] = [opts.range[0], opts.range[1]];
  const paddingInner = clamp01(opts.paddingInner ?? 0);
  const paddingOuter = Math.max(0, opts.paddingOuter ?? 0);
  const align = clamp01(opts.align ?? 0.5);
  const count = domain.length;
  const reverse = range[1] < range[0];
  const startRange = reverse ? range[1] : range[0];
  const stopRange = reverse ? range[0] : range[1];
  const span = stopRange - startRange;
  const step = count === 0 ? 0 : span / Math.max(1, count - paddingInner + 2 * paddingOuter);
  const bandwidth = count === 0 ? 0 : step * (1 - paddingInner);
  const start = startRange + (span - step * (count - paddingInner)) * align;
  const positions = new Map<string, number>();

  domain.forEach((value, index) => {
    const positionIndex = reverse ? count - 1 - index : index;
    positions.set(value, start + positionIndex * step);
  });

  return {
    get bandwidth() {
      return bandwidth;
    },
    get step() {
      return step;
    },
    get domain() {
      return domain;
    },
    get range() {
      return range;
    },
    map(value: string): number | undefined {
      return positions.get(value);
    },
  };
}

export function pointScale(opts: PointScaleOptions): PointScale {
  const domain = unique(opts.domain);
  const range: [number, number] = [opts.range[0], opts.range[1]];
  const padding = Math.max(0, opts.padding ?? 0);
  const align = clamp01(opts.align ?? 0.5);
  const count = domain.length;
  const reverse = range[1] < range[0];
  const startRange = reverse ? range[1] : range[0];
  const stopRange = reverse ? range[0] : range[1];
  const span = stopRange - startRange;
  const step = count === 0 ? 0 : span / Math.max(1, count - 1 + 2 * padding);
  const start = startRange + (span - step * (count - 1)) * align;
  const positions = new Map<string, number>();

  domain.forEach((value, index) => {
    const positionIndex = reverse ? count - 1 - index : index;
    positions.set(value, start + positionIndex * step);
  });

  return {
    get step() {
      return step;
    },
    get domain() {
      return domain;
    },
    get range() {
      return range;
    },
    map(value: string): number | undefined {
      return positions.get(value);
    },
  };
}
