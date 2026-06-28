import { describe, it, expect } from 'vitest';
import { lintSpec } from './lint';
import { validateSpec } from './validate';
import type { ChartSpec } from './types';

const ruleIds = (spec: ChartSpec) => lintSpec(spec).map((f) => f.rule);

describe('lintSpec — temporal typed as categorical', () => {
  const data = [
    { month: '2024-01', users: 10 },
    { month: '2024-02', users: 12 },
    { month: '2024-03', users: 15 },
  ];

  it('flags a date-like field declared nominal', () => {
    const spec = {
      type: 'line',
      data,
      encoding: { x: { field: 'month', type: 'nominal' }, y: { field: 'users' } },
    } as ChartSpec;
    expect(ruleIds(spec)).toContain('temporal-typed-as-categorical');
  });

  it('does not flag when typed temporal (or left to inference)', () => {
    const typed = {
      type: 'line',
      data,
      encoding: { x: { field: 'month', type: 'temporal' }, y: { field: 'users' } },
    } as ChartSpec;
    const inferred = {
      type: 'line',
      data,
      encoding: { x: { field: 'month' }, y: { field: 'users' } },
    } as ChartSpec;
    expect(ruleIds(typed)).not.toContain('temporal-typed-as-categorical');
    expect(ruleIds(inferred)).not.toContain('temporal-typed-as-categorical');
  });
});

describe('lintSpec — pie too many slices', () => {
  const slices = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ cat: `C${i}`, v: i + 1 }));

  it('flags a pie with more than 7 slices', () => {
    const spec = {
      type: 'pie',
      data: slices(9),
      encoding: { theta: { field: 'v' }, color: { field: 'cat' } },
    } as ChartSpec;
    expect(ruleIds(spec)).toContain('pie-too-many-slices');
  });

  it('does not flag a small pie', () => {
    const spec = {
      type: 'pie',
      data: slices(5),
      encoding: { theta: { field: 'v' }, color: { field: 'cat' } },
    } as ChartSpec;
    expect(ruleIds(spec)).not.toContain('pie-too-many-slices');
  });
});

describe('lintSpec — too many series', () => {
  it('flags a series channel with > 12 distinct values', () => {
    const data = Array.from({ length: 14 }, (_, i) => ({ x: 1, y: i, s: `S${i}` }));
    const spec = {
      type: 'line',
      data,
      encoding: { x: { field: 'x' }, y: { field: 'y' }, series: { field: 's' } },
    } as ChartSpec;
    expect(ruleIds(spec)).toContain('too-many-series');
  });

  it('does not flag a handful of series', () => {
    const data = Array.from({ length: 4 }, (_, i) => ({ x: 1, y: i, s: `S${i}` }));
    const spec = {
      type: 'line',
      data,
      encoding: { x: { field: 'x' }, y: { field: 'y' }, series: { field: 's' } },
    } as ChartSpec;
    expect(ruleIds(spec)).not.toContain('too-many-series');
  });
});

describe('lintSpec — bar non-zero baseline', () => {
  const data = [
    { region: 'A', sales: 100 },
    { region: 'B', sales: 120 },
  ];

  it('flags scale.zero:false', () => {
    const spec = {
      type: 'bar',
      data,
      encoding: { x: { field: 'region' }, y: { field: 'sales', scale: { zero: false } } },
    } as ChartSpec;
    expect(ruleIds(spec)).toContain('bar-nonzero-baseline');
  });

  it('flags an explicit domain that starts above zero', () => {
    const spec = {
      type: 'bar',
      data,
      encoding: { x: { field: 'region' }, y: { field: 'sales', scale: { domain: [90, 130] } } },
    } as ChartSpec;
    expect(ruleIds(spec)).toContain('bar-nonzero-baseline');
  });

  it('does not flag a default bar', () => {
    const spec = {
      type: 'bar',
      data,
      encoding: { x: { field: 'region' }, y: { field: 'sales' } },
    } as ChartSpec;
    expect(ruleIds(spec)).not.toContain('bar-nonzero-baseline');
  });
});

describe('lintSpec — log scale with non-positive data', () => {
  it('flags a log axis when data has values <= 0', () => {
    const spec = {
      type: 'scatter',
      data: [
        { x: 1, y: 10 },
        { x: 2, y: 0 },
      ],
      encoding: { x: { field: 'x' }, y: { field: 'y', scale: { type: 'log' } } },
    } as ChartSpec;
    expect(ruleIds(spec)).toContain('log-nonpositive-data');
  });

  it('does not flag a log axis over strictly positive data', () => {
    const spec = {
      type: 'scatter',
      data: [
        { x: 1, y: 10 },
        { x: 2, y: 5 },
      ],
      encoding: { x: { field: 'x' }, y: { field: 'y', scale: { type: 'log' } } },
    } as ChartSpec;
    expect(ruleIds(spec)).not.toContain('log-nonpositive-data');
  });
});

describe('lintSpec — high-cardinality axis', () => {
  it('flags > 50 categories on a discrete axis', () => {
    const data = Array.from({ length: 60 }, (_, i) => ({ id: `item-${i}`, v: i }));
    const spec = {
      type: 'bar',
      data,
      encoding: { x: { field: 'id' }, y: { field: 'v' } },
    } as ChartSpec;
    expect(ruleIds(spec)).toContain('high-cardinality-axis');
  });

  it('does not flag a modest number of categories', () => {
    const data = Array.from({ length: 8 }, (_, i) => ({ id: `item-${i}`, v: i }));
    const spec = {
      type: 'bar',
      data,
      encoding: { x: { field: 'id' }, y: { field: 'v' } },
    } as ChartSpec;
    expect(ruleIds(spec)).not.toContain('high-cardinality-axis');
  });
});

describe('lintSpec — integration & hygiene', () => {
  it('lints the effective (post-transform) data, not raw rows', () => {
    // Raw data has 9 distinct categories, but an aggregate collapses to 3.
    const data = Array.from({ length: 9 }, (_, i) => ({ region: `R${i % 3}`, sales: i }));
    const spec = {
      type: 'pie',
      data,
      transform: [{ aggregate: [{ op: 'sum', field: 'sales', as: 'sales' }], groupby: ['region'] }],
      encoding: { theta: { field: 'sales' }, color: { field: 'region' } },
    } as ChartSpec;
    expect(ruleIds(spec)).not.toContain('pie-too-many-slices'); // 3 slices after aggregate
  });

  it('produces no findings for a clean chart', () => {
    const spec = {
      type: 'bar',
      data: [
        { region: 'West', sales: 10 },
        { region: 'East', sales: 12 },
      ],
      encoding: { x: { field: 'region' }, y: { field: 'sales' } },
    } as ChartSpec;
    expect(lintSpec(spec)).toEqual([]);
  });

  it('surfaces findings through validateSpec.warnings with rule + severity', () => {
    const result = validateSpec({
      type: 'pie',
      data: Array.from({ length: 10 }, (_, i) => ({ cat: `C${i}`, v: i + 1 })),
      encoding: { theta: { field: 'v' }, color: { field: 'cat' } },
    });
    const finding = result.warnings.find((w) => w.rule === 'pie-too-many-slices');
    expect(finding).toBeDefined();
    expect(finding?.severity).toBe('warning');
    expect(result.valid).toBe(true); // lint never blocks
  });
});
