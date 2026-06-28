import { describe, it, expect } from 'vitest';
import type { ChartSpec } from '../spec/types';
import { analyzeChart, computeSeriesInsights } from './insights';

describe('computeSeriesInsights', () => {
  it('derives first/last/min/max/mean/sum/trend over an ordered series', () => {
    const s = computeSeriesInsights([10, 20, 15, 40], ['a', 'b', 'c', 'd'], 'x')!;
    expect(s.key).toBe('x');
    expect(s.count).toBe(4);
    expect(s.first).toMatchObject({ value: 10, label: 'a', index: 0 });
    expect(s.last).toMatchObject({ value: 40, label: 'd', index: 3 });
    expect(s.min.value).toBe(10);
    expect(s.max.value).toBe(40);
    expect(s.mean).toBe(21.25);
    expect(s.sum).toBe(85);
    expect(s.netChange).toBe(30);
    expect(s.pctChange).toBe(3);
    expect(s.direction).toBe('up');
    expect(s.biggestJump).toMatchObject({ delta: 25 });
    expect(s.biggestJump!.from.value).toBe(15);
    expect(s.biggestJump!.to.value).toBe(40);
  });

  it('flags a flat series and a null pctChange when the first value is zero', () => {
    expect(computeSeriesInsights([5, 5, 5], ['a', 'b', 'c'])!.direction).toBe('flat');
    const z = computeSeriesInsights([0, 10], ['a', 'b'])!;
    expect(z.pctChange).toBeNull();
    expect(z.netChange).toBe(10);
    expect(z.direction).toBe('up');
  });

  it('detects Tukey-fence outliers (>=4 points)', () => {
    const s = computeSeriesInsights([10, 11, 12, 13, 14, 15, 100], ['a', 'b', 'c', 'd', 'e', 'f', 'g'])!;
    expect(s.outliers).toHaveLength(1);
    expect(s.outliers[0].value).toBe(100);
  });

  it('returns null when there are no finite values', () => {
    expect(computeSeriesInsights([NaN, Infinity], ['a', 'b'])).toBeNull();
    expect(computeSeriesInsights([], [])).toBeNull();
  });
});

describe('analyzeChart — families', () => {
  it('analyzes a single-series line as the series family', () => {
    const spec: ChartSpec = {
      type: 'line',
      data: [
        { month: '2024-01', users: 4200 },
        { month: '2024-02', users: 6400 },
        { month: '2024-03', users: 6150 },
      ],
      encoding: { x: { field: 'month', type: 'temporal' }, y: { field: 'users' } },
    } as ChartSpec;
    const ins = analyzeChart(spec)!;
    expect(ins.family).toBe('series');
    expect(ins.measureField).toBe('users');
    expect(ins.series).toHaveLength(1);
    expect(ins.series![0].max.value).toBe(6400);
  });

  it('computes leader and biggest mover for multi-series', () => {
    const spec: ChartSpec = {
      type: 'slope',
      data: [
        { yr: '2019', brand: 'Aurora', share: 34 },
        { yr: '2024', brand: 'Aurora', share: 22 },
        { yr: '2019', brand: 'Cirrus', share: 27 },
        { yr: '2024', brand: 'Cirrus', share: 31 },
      ],
      encoding: { x: { field: 'yr' }, y: { field: 'share' }, series: { field: 'brand' } },
    } as ChartSpec;
    const ins = analyzeChart(spec)!;
    expect(ins.series).toHaveLength(2);
    expect(ins.leader).toEqual({ key: 'Cirrus', value: 31 });
    expect(ins.biggestMover).toEqual({ key: 'Aurora', delta: -12 });
  });

  it('analyzes a bar without a series as the category family (top/bottom/share)', () => {
    const spec: ChartSpec = {
      type: 'bar',
      data: [
        { region: 'West', sales: 420 },
        { region: 'East', sales: 310 },
        { region: 'South', sales: 90 },
      ],
      encoding: { x: { field: 'region' }, y: { field: 'sales' } },
    } as ChartSpec;
    const ins = analyzeChart(spec)!;
    expect(ins.family).toBe('category');
    expect(ins.category!.top).toMatchObject({ label: 'West', value: 420 });
    expect(ins.category!.bottom).toMatchObject({ label: 'South', value: 90 });
    expect(ins.category!.total).toBe(820);
    expect(ins.category!.topShare).toBeCloseTo(420 / 820, 6);
  });

  it('sums the measure per slice for pie (category family)', () => {
    const spec: ChartSpec = {
      type: 'pie',
      data: [
        { kind: 'A', n: 30 },
        { kind: 'B', n: 50 },
        { kind: 'A', n: 20 },
      ],
      encoding: { theta: { field: 'n' }, color: { field: 'kind' } },
    } as ChartSpec;
    const ins = analyzeChart(spec)!;
    expect(ins.family).toBe('category');
    expect(ins.category!.top).toMatchObject({ label: 'A', value: 50 });
    expect(ins.category!.total).toBe(100);
  });

  it('analyzes scatter with a Pearson correlation', () => {
    const spec: ChartSpec = {
      type: 'scatter',
      data: [
        { x: 1, y: 2 },
        { x: 2, y: 4 },
        { x: 3, y: 5 },
        { x: 4, y: 9 },
      ],
      encoding: { x: { field: 'x' }, y: { field: 'y' } },
    } as ChartSpec;
    const ins = analyzeChart(spec)!;
    expect(ins.family).toBe('scatter');
    expect(ins.scatter!.xExtent).toEqual([1, 4]);
    expect(ins.scatter!.yExtent).toEqual([2, 9]);
    expect(ins.scatter!.correlation!).toBeGreaterThan(0.9);
  });

  it('resolves an aggregated value vs. target (value family)', () => {
    const spec: ChartSpec = {
      type: 'gauge',
      data: [{ uptime: 99.2 }, { uptime: 98.7 }, { uptime: 99.6 }],
      value: { field: 'uptime', aggregate: 'mean' },
      max: 100,
      target: 99,
    } as ChartSpec;
    const ins = analyzeChart(spec)!;
    expect(ins.family).toBe('value');
    expect(ins.value!.value).toBeCloseTo(99.1667, 3);
    expect(ins.value!.target).toBe(99);
    expect(ins.value!.toTarget!).toBeGreaterThan(0);
  });

  it('analyzes a histogram as a distribution', () => {
    const spec: ChartSpec = {
      type: 'histogram',
      data: [{ v: 1 }, { v: 2 }, { v: 2 }, { v: 3 }, { v: 8 }],
      encoding: { x: { field: 'v' } },
    } as ChartSpec;
    const ins = analyzeChart(spec)!;
    expect(ins.family).toBe('distribution');
    expect(ins.distribution!.count).toBe(5);
    expect(ins.distribution!.min.value).toBe(1);
    expect(ins.distribution!.max.value).toBe(8);
    expect(ins.distribution!.mean).toBeCloseTo(3.2, 6);
  });

  it('returns null for non-summarizable types and empty data', () => {
    expect(analyzeChart({ type: 'table', data: [{ a: 1 }], columns: [] } as unknown as ChartSpec)).toBeNull();
    expect(analyzeChart({ type: 'line', data: [], encoding: { x: { field: 'a' }, y: { field: 'b' } } } as ChartSpec)).toBeNull();
  });
});
