import { describe, expect, it } from 'vitest';
import type { Datum } from '../../types';
import {
  applyAggregate,
  applyBin,
  applyFilter,
  applyFold,
  applyTimeUnit,
  applyTransforms,
  compilePredicate,
  computeBins,
} from './index';
import { validateSpec } from '../validate';

const sales: Datum[] = [
  { region: 'East', category: 'A', sales: 100, date: '2024-01-15' },
  { region: 'East', category: 'B', sales: 150, date: '2024-02-20' },
  { region: 'West', category: 'A', sales: 50, date: '2024-01-05' },
  { region: 'West', category: 'B', sales: 75, date: '2024-03-11' },
  { region: 'West', category: 'A', sales: 125, date: '2024-02-28' },
];

describe('applyFilter', () => {
  it('keeps rows matching leaf predicates', () => {
    expect(applyFilter({ filter: { field: 'region', equals: 'West' } }, sales)).toHaveLength(3);
    expect(applyFilter({ filter: { field: 'sales', gt: 100 } }, sales)).toHaveLength(2);
    expect(applyFilter({ filter: { field: 'sales', gte: 100 } }, sales)).toHaveLength(3);
    expect(applyFilter({ filter: { field: 'category', oneOf: ['A'] } }, sales)).toHaveLength(3);
    expect(applyFilter({ filter: { field: 'region', ne: 'West' } }, sales)).toHaveLength(2);
  });

  it('composes predicates with and/or/not', () => {
    const both = applyFilter(
      { filter: { and: [{ field: 'region', equals: 'West' }, { field: 'sales', gte: 100 }] } },
      sales,
    );
    expect(both).toHaveLength(1);
    expect(both[0].sales).toBe(125);

    const either = applyFilter(
      { filter: { or: [{ field: 'sales', lt: 60 }, { field: 'sales', gt: 140 }] } },
      sales,
    );
    expect(either.map((r) => r.sales).sort((a, b) => (a as number) - (b as number))).toEqual([50, 150]);

    const negated = applyFilter({ filter: { not: { field: 'region', equals: 'West' } } }, sales);
    expect(negated).toHaveLength(2);
  });

  it('treats range bounds as temporal when comparing dates', () => {
    const q1 = applyFilter({ filter: { field: 'date', range: ['2024-01-01', '2024-01-31'] } }, sales);
    expect(q1.map((r) => r.region)).toEqual(['East', 'West']);
  });

  it('does not mutate the input array', () => {
    const copy = [...sales];
    applyFilter({ filter: { field: 'region', equals: 'West' } }, sales);
    expect(sales).toEqual(copy);
  });

  it('compiles an unknown leaf to match-nothing', () => {
    // @ts-expect-error — exercising the defensive runtime branch.
    const test = compilePredicate({ field: 'sales' });
    expect(sales.filter(test)).toHaveLength(0);
  });
});

describe('applyAggregate', () => {
  it('groups and summarizes into one row per group', () => {
    const out = applyAggregate(
      { groupby: ['region'], aggregate: [{ op: 'sum', field: 'sales', as: 'total' }] },
      sales,
    );
    expect(out).toEqual([
      { region: 'East', total: 250 },
      { region: 'West', total: 250 },
    ]);
  });

  it('counts rows when no field is given', () => {
    const out = applyAggregate(
      { groupby: ['region'], aggregate: [{ op: 'count', as: 'n' }] },
      sales,
    );
    expect(out).toEqual([
      { region: 'East', n: 2 },
      { region: 'West', n: 3 },
    ]);
  });

  it('collapses the whole dataset with no groupby', () => {
    const out = applyAggregate({ aggregate: [{ op: 'sum', field: 'sales', as: 'total' }] }, sales);
    expect(out).toEqual([{ total: 500 }]);
  });

  it('preserves first-seen group order', () => {
    const out = applyAggregate({ groupby: ['region'], aggregate: [{ op: 'count', as: 'n' }] }, sales);
    expect(out.map((r) => r.region)).toEqual(['East', 'West']);
  });
});

describe('computeBins / applyBin', () => {
  it('chooses a nice step approximating maxbins', () => {
    const layout = computeBins([0, 1, 2, 9, 10], { maxbins: 5 });
    expect(layout).not.toBeNull();
    expect(layout?.start).toBe(0);
    expect(layout?.step).toBe(2);
  });

  it('assigns each row a bin start and optional end', () => {
    const data: Datum[] = [{ v: 0 }, { v: 3 }, { v: 7 }, { v: 10 }];
    const out = applyBin({ bin: 'v', as: ['lo', 'hi'], step: 5, extent: [0, 10] }, data);
    expect(out.map((r) => [r.lo, r.hi])).toEqual([
      [0, 5],
      [0, 5],
      [5, 10],
      [5, 10],
    ]);
  });

  it('emits null bins for non-numeric or out-of-extent values', () => {
    const data: Datum[] = [{ v: 'x' }, { v: 100 }, { v: 5 }];
    const out = applyBin({ bin: 'v', as: 'b', step: 10, extent: [0, 10] }, data);
    expect(out.map((r) => r.b)).toEqual([null, null, 0]);
  });
});

describe('applyFold', () => {
  it('gathers columns into key/value rows (wide → long)', () => {
    const wide: Datum[] = [{ month: 'Jan', east: 1, west: 2 }];
    const out = applyFold({ fold: ['east', 'west'] }, wide);
    expect(out).toEqual([
      { month: 'Jan', east: 1, west: 2, key: 'east', value: 1 },
      { month: 'Jan', east: 1, west: 2, key: 'west', value: 2 },
    ]);
  });

  it('honors custom key/value names', () => {
    const wide: Datum[] = [{ id: 1, a: 10, b: 20 }];
    const out = applyFold({ fold: ['a', 'b'], as: ['metric', 'amount'] }, wide);
    expect(out.map((r) => [r.metric, r.amount])).toEqual([
      ['a', 10],
      ['b', 20],
    ]);
  });
});

describe('applyTimeUnit', () => {
  it('truncates timestamps to the start of a unit', () => {
    const data: Datum[] = [{ date: '2024-02-20' }];
    const month = applyTimeUnit({ timeUnit: 'month', field: 'date', as: 'm' }, data)[0].m as Date;
    expect(month.getFullYear()).toBe(2024);
    expect(month.getMonth()).toBe(1);
    expect(month.getDate()).toBe(1);

    const quarter = applyTimeUnit({ timeUnit: 'quarter', field: 'date', as: 'q' }, data)[0].q as Date;
    expect(quarter.getMonth()).toBe(0);
  });

  it('writes null when the field is not a date', () => {
    const out = applyTimeUnit({ timeUnit: 'month', field: 'date', as: 'm' }, [{ date: 'nope' }]);
    expect(out[0].m).toBeNull();
  });
});

describe('applyTransforms (pipeline)', () => {
  it('applies steps in order: timeUnit → aggregate', () => {
    const out = applyTransforms(
      [
        { timeUnit: 'month', field: 'date', as: 'month' },
        { groupby: ['month'], aggregate: [{ op: 'sum', field: 'sales', as: 'total' }] },
      ],
      sales,
    );
    expect(out).toHaveLength(3);
    const totals = out.map((r) => r.total);
    expect(totals).toEqual([150, 275, 75]);
  });

  it('returns the original reference for an empty pipeline (no-op)', () => {
    expect(applyTransforms(undefined, sales)).toBe(sales);
    expect(applyTransforms([], sales)).toBe(sales);
  });
});

describe('validateSpec — transforms', () => {
  it('accepts a valid pipeline and recognizes its output fields', () => {
    const result = validateSpec({
      type: 'bar',
      data: sales,
      transform: [{ groupby: ['region'], aggregate: [{ op: 'sum', field: 'sales', as: 'total' }] }],
      encoding: { x: { field: 'region' }, y: { field: 'total' } },
    });
    expect(result.valid).toBe(true);
    // `total` is produced by the transform, so it must not warn as missing.
    expect(result.warnings.some((w) => w.message.includes('total'))).toBe(false);
  });

  it('flags an unknown transform operator', () => {
    const result = validateSpec({
      type: 'bar',
      data: sales,
      transform: [{ frobnicate: true }],
      encoding: { x: { field: 'region' }, y: { field: 'sales' } },
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.path === 'transform[0]')).toBe(true);
  });

  it('flags a non-count aggregate missing its field, and a bad op', () => {
    const result = validateSpec({
      type: 'bar',
      data: sales,
      transform: [{ aggregate: [{ op: 'sum', as: 'x' }, { op: 'bogus', field: 'sales', as: 'y' }] }],
      encoding: { x: { field: 'region' }, y: { field: 'x' } },
    });
    expect(result.errors.some((e) => e.path === 'transform[0].aggregate[0].field')).toBe(true);
    expect(result.errors.some((e) => e.path === 'transform[0].aggregate[1].op')).toBe(true);
  });

  it('flags a step with two operators', () => {
    const result = validateSpec({
      type: 'bar',
      data: sales,
      transform: [{ filter: { field: 'sales', gt: 0 }, bin: 'sales', as: 'b' }],
      encoding: { x: { field: 'region' }, y: { field: 'sales' } },
    });
    expect(result.errors.some((e) => e.path === 'transform[0]')).toBe(true);
  });

  it('validates nested filter predicates', () => {
    const result = validateSpec({
      type: 'bar',
      data: sales,
      transform: [{ filter: { and: [{ field: 'sales' }] } }],
      encoding: { x: { field: 'region' }, y: { field: 'sales' } },
    });
    expect(result.errors.some((e) => e.path === 'transform[0].filter.and[0]')).toBe(true);
  });

  it('accepts a valid calculate and recognizes its output field', () => {
    const result = validateSpec({
      type: 'bar',
      data: sales,
      transform: [{ calculate: 'sales * 2', as: 'doubled' }],
      encoding: { x: { field: 'region' }, y: { field: 'doubled' } },
    });
    expect(result.valid).toBe(true);
    expect(result.warnings.some((w) => w.message.includes('doubled'))).toBe(false);
  });

  it('flags a calculate with an invalid expression', () => {
    const result = validateSpec({
      type: 'bar',
      data: sales,
      transform: [{ calculate: 'sales *', as: 'bad' }],
      encoding: { x: { field: 'region' }, y: { field: 'sales' } },
    });
    expect(result.errors.some((e) => e.path === 'transform[0].calculate')).toBe(true);
  });
});
