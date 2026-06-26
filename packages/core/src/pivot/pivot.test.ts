import { describe, expect, it } from 'vitest';
import type { Datum } from '../types';
import { aggregateValues, groupBy, pivot } from './index';

const data: Datum[] = [
  { region: 'East', category: 'A', quarter: 'Q1', sales: 100, units: 1 },
  { region: 'East', category: 'A', quarter: 'Q2', sales: 150, units: 2 },
  { region: 'East', category: 'B', quarter: 'Q1', sales: 200, units: 3 },
  { region: 'West', category: 'A', quarter: 'Q1', sales: 50, units: 4 },
  { region: 'West', category: 'B', quarter: 'Q2', sales: 75, units: 5 },
  { region: 'West', category: 'B', quarter: 'Q1', sales: 125, units: 6 },
];

function cellValue(rowIndex: number, colIndex: number): number | null {
  const result = pivot(data, {
    rows: ['region'],
    columns: ['category'],
    values: [{ field: 'sales', op: 'sum' }],
  });
  const row = result.rows[rowIndex];
  const column = result.columnLeaves[colIndex];
  return row.cellsByColumnKey.get(column.path.join('\u0000'))?.values[0] ?? null;
}

describe('aggregateValues', () => {
  it('computes numeric aggregations while skipping non-finite values', () => {
    expect(aggregateValues(['2', 3, Number.POSITIVE_INFINITY, 'x', null], 'sum')).toBe(5);
    expect(aggregateValues([2, 4, '6', null], 'mean')).toBe(4);
    expect(aggregateValues([2, 4, '6', null], 'avg')).toBe(4);
    expect(aggregateValues([5, '2', Number.NaN], 'min')).toBe(2);
    expect(aggregateValues([5, '2', Number.NaN], 'max')).toBe(5);
  });

  it('computes median for odd and even numeric inputs', () => {
    expect(aggregateValues([9, 1, 5], 'median')).toBe(5);
    expect(aggregateValues([9, 1, 5, 3], 'median')).toBe(4);
  });

  it('computes counts, distinct counts, first, last, and empty cases', () => {
    expect(aggregateValues([1, null, undefined, 'x', 0], 'count')).toBe(3);
    expect(aggregateValues([1, 1, '1', null, null], 'countDistinct')).toBe(3);
    expect(aggregateValues([null, undefined, '5', 6], 'first')).toBe(5);
    expect(aggregateValues([5, null, undefined, '6'], 'last')).toBe(6);
    expect(aggregateValues([], 'sum')).toBeNull();
    expect(aggregateValues([], 'median')).toBeNull();
    expect(aggregateValues([], 'count')).toBe(0);
    expect(aggregateValues([], 'countDistinct')).toBeNull();
    expect(aggregateValues([null, undefined], 'first')).toBeNull();
  });
});

describe('groupBy', () => {
  it('creates nested maps keyed by stable string values', () => {
    const grouped = groupBy(data, ['region', 'category']);
    const east = grouped.get('East');

    expect(east).toBeInstanceOf(Map);
    expect((east as Map<string, Datum[]>).get('A')).toHaveLength(2);
    expect((east as Map<string, Datum[]>).get('B')).toHaveLength(1);
  });
});

describe('pivot', () => {
  it('returns a single grand-total row when there are no groups', () => {
    const result = pivot(data, {
      values: [
        { field: 'sales', op: 'sum' },
        { field: 'units', op: 'count' },
      ],
    });

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].isGrandTotal).toBe(true);
    expect(result.columnLeaves).toHaveLength(1);
    expect(result.valueAt([], [], 0)).toBe(700);
    expect(result.valueAt([], [], 1)).toBe(6);
    expect(result.rows[0].cellsByColumnKey.get('')?.values).toEqual([700, 6]);
  });

  it('groups one row level and appends an optional grand total', () => {
    const result = pivot(data, {
      rows: ['region'],
      values: [{ field: 'sales', op: 'sum' }],
      includeGrandTotals: true,
    });

    expect(result.rows.map((row) => row.label)).toEqual(['East', 'West', 'Grand Total']);
    expect(result.rows.map((row) => row.cellsByColumnKey.get('')?.values[0])).toEqual([450, 250, 700]);
    expect(result.rows[2].cellsByColumnKey.get('')?.values[0]).toBe(
      (result.rows[0].cellsByColumnKey.get('')?.values[0] ?? 0) +
        (result.rows[1].cellsByColumnKey.get('')?.values[0] ?? 0),
    );
  });

  it('adds two-level row subtotals after children and a grand total after subtotals', () => {
    const result = pivot(data, {
      rows: ['region', 'category'],
      values: [{ field: 'sales', op: 'sum' }],
      includeRowSubtotals: true,
      includeGrandTotals: true,
    });

    expect(result.rows.map((row) => row.label)).toEqual(['A', 'B', 'Total', 'A', 'B', 'Total', 'Grand Total']);
    expect(result.rows.map((row) => row.path)).toEqual([
      ['East', 'A'],
      ['East', 'B'],
      ['East'],
      ['West', 'A'],
      ['West', 'B'],
      ['West'],
      [],
    ]);
    expect(result.rows.map((row) => row.cellsByColumnKey.get('')?.values[0])).toEqual([250, 200, 450, 50, 200, 250, 700]);
    expect(result.valueAt(['East'], [], 0)).toBe(450);
    expect(result.valueAt(['West'], [], 0)).toBe(250);
  });

  it('builds a row and column matrix with subtotals and grand-total columns', () => {
    const result = pivot(data, {
      rows: ['region'],
      columns: ['category', 'quarter'],
      values: [{ field: 'sales', op: 'sum' }],
      includeColumnSubtotals: true,
      includeGrandTotals: true,
    });

    expect(result.columnLeaves.map((leaf) => leaf.path)).toEqual([
      ['A', 'Q1'],
      ['A', 'Q2'],
      ['A'],
      ['B', 'Q1'],
      ['B', 'Q2'],
      ['B'],
      [],
    ]);
    expect(result.columnLeaves).toHaveLength(7);
    expect(result.columnTree[0].span).toBe(3);
    expect(result.valueAt(['East'], ['A', 'Q1'], 0)).toBe(100);
    expect(result.valueAt(['East'], ['A', 'Q2'], 0)).toBe(150);
    expect(result.valueAt(['East'], ['A'], 0)).toBe(250);
    expect(result.valueAt(['East'], [], 0)).toBe(450);
    expect(result.valueAt(['West'], ['B', 'Q1'], 0)).toBe(125);
    expect(result.valueAt(['West'], ['B', 'Q2'], 0)).toBe(75);
    expect(result.valueAt(['West'], ['B'], 0)).toBe(200);
    expect(result.valueAt(['West'], [], 0)).toBe(250);

    const east = result.rows[0];
    expect(east.cellsByColumnKey.get('A\u0000Q1')?.values[0]).toBe(100);
    expect(east.cellsByColumnKey.get('A')?.values[0]).toBe(250);
    expect(east.cellsByColumnKey.get('')?.values[0]).toBe(450);
  });

  it('sorts group keys ascending, descending, or by first-seen order', () => {
    const unsorted: Datum[] = [
      { region: 'West', sales: 1 },
      { region: 'East', sales: 2 },
      { region: 'North', sales: 3 },
    ];

    expect(pivot(unsorted, { rows: ['region'], values: [{ field: 'sales', op: 'sum' }] }).rows.map((row) => row.label)).toEqual([
      'East',
      'North',
      'West',
    ]);
    expect(
      pivot(unsorted, { rows: ['region'], values: [{ field: 'sales', op: 'sum' }], sort: 'desc' }).rows.map(
        (row) => row.label,
      ),
    ).toEqual(['West', 'North', 'East']);
    expect(
      pivot(unsorted, { rows: ['region'], values: [{ field: 'sales', op: 'sum' }], sort: 'none' }).rows.map(
        (row) => row.label,
      ),
    ).toEqual(['West', 'East', 'North']);
  });

  it('uses null aggregate cells for empty data with an implicit grand total', () => {
    const result = pivot([], {
      values: [
        { field: 'sales', op: 'sum' },
        { field: 'sales', op: 'count' },
      ],
    });

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].label).toBe('Grand Total');
    expect(result.columnLeaves).toHaveLength(1);
    expect(result.rows[0].cellsByColumnKey.get('')?.values).toEqual([null, 0]);
  });

  it('exposes cell values in display order for simple row and column groups', () => {
    expect(cellValue(0, 0)).toBe(250);
    expect(cellValue(0, 1)).toBe(200);
    expect(cellValue(1, 0)).toBe(50);
    expect(cellValue(1, 1)).toBe(200);
  });
});
