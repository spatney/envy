import { describe, it, expect } from 'vitest';
import type { ChartSpec } from '../spec/types';
import { autoInsightAnnotations, resolveInsightOptions } from './autoInsights';

describe('resolveInsightOptions', () => {
  it('returns null when disabled', () => {
    expect(resolveInsightOptions(undefined)).toBeNull();
    expect(resolveInsightOptions(false)).toBeNull();
  });

  it('marks max + min (not outliers) for `true`', () => {
    expect(resolveInsightOptions(true)).toEqual({ max: true, min: true, outliers: false });
  });

  it('fills omitted flags from defaults', () => {
    expect(resolveInsightOptions({ min: false })).toEqual({ max: true, min: false, outliers: false });
    expect(resolveInsightOptions({ outliers: true })).toEqual({ max: true, min: true, outliers: true });
  });
});

describe('autoInsightAnnotations — series', () => {
  const line = (insights: unknown): ChartSpec =>
    ({
      type: 'line',
      data: [
        { m: 'Jan', v: 10 },
        { m: 'Feb', v: 40 },
        { m: 'Mar', v: 25 },
      ],
      encoding: { x: { field: 'm' }, y: { field: 'v' } },
      insights,
    }) as ChartSpec;

  it('marks the peak then the trough', () => {
    expect(autoInsightAnnotations(line(true))).toEqual([
      { type: 'point', x: 'Feb', y: 40, label: '\u25B2 40' },
      { type: 'point', x: 'Jan', y: 10, label: '\u25BC 10' },
    ]);
  });

  it('honors opt-outs (max only)', () => {
    expect(autoInsightAnnotations(line({ min: false }))).toEqual([
      { type: 'point', x: 'Feb', y: 40, label: '\u25B2 40' },
    ]);
  });

  it('returns [] when insights is absent', () => {
    expect(autoInsightAnnotations(line(undefined))).toEqual([]);
  });

  it('threads the raw temporal x value (a Date) for scale mapping', () => {
    const d1 = new Date('2024-01-01');
    const d2 = new Date('2024-02-01');
    const spec = {
      type: 'line',
      data: [
        { t: d1, v: 5 },
        { t: d2, v: 9 },
      ],
      encoding: { x: { field: 't', type: 'temporal' }, y: { field: 'v' } },
      insights: { min: false },
    } as ChartSpec;
    expect(autoInsightAnnotations(spec)).toEqual([{ type: 'point', x: d2, y: 9, label: '\u25B2 9' }]);
  });

  it('skips multi-series charts to avoid clutter', () => {
    const spec = {
      type: 'line',
      data: [
        { m: 'Jan', v: 10, s: 'A' },
        { m: 'Feb', v: 40, s: 'A' },
        { m: 'Jan', v: 20, s: 'B' },
        { m: 'Feb', v: 5, s: 'B' },
      ],
      encoding: { x: { field: 'm' }, y: { field: 'v' }, series: { field: 's' } },
      insights: true,
    } as ChartSpec;
    expect(autoInsightAnnotations(spec)).toEqual([]);
  });

  it('marks only outliers when so configured', () => {
    const spec = {
      type: 'line',
      data: [
        { m: 'a', v: 10 },
        { m: 'b', v: 11 },
        { m: 'c', v: 12 },
        { m: 'd', v: 100 },
      ],
      encoding: { x: { field: 'm' }, y: { field: 'v' } },
      insights: { max: false, min: false, outliers: true },
    } as ChartSpec;
    expect(autoInsightAnnotations(spec)).toEqual([{ type: 'point', x: 'd', y: 100, label: '100' }]);
  });
});

describe('autoInsightAnnotations — category', () => {
  it('marks the top then the bottom category of a bar', () => {
    const spec = {
      type: 'bar',
      data: [
        { cat: 'A', val: 30 },
        { cat: 'B', val: 50 },
        { cat: 'C', val: 20 },
      ],
      encoding: { x: { field: 'cat' }, y: { field: 'val' } },
      insights: true,
    } as ChartSpec;
    expect(autoInsightAnnotations(spec)).toEqual([
      { type: 'point', x: 'B', y: 50, label: '\u25B2 50' },
      { type: 'point', x: 'C', y: 20, label: '\u25BC 20' },
    ]);
  });
});

describe('autoInsightAnnotations — non-summarizable', () => {
  it('returns [] for scatter (no point callouts for now)', () => {
    const spec = {
      type: 'scatter',
      data: [
        { x: 1, y: 2 },
        { x: 2, y: 4 },
      ],
      encoding: { x: { field: 'x' }, y: { field: 'y' } },
      insights: true,
    } as ChartSpec;
    expect(autoInsightAnnotations(spec)).toEqual([]);
  });
});
