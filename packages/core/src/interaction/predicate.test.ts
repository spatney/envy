import { describe, expect, it } from 'vitest';
import type { Datum } from '../types';
import type { SelectionValue } from '../spec/selection';
import { filterRows, isEmptyValue, literalToValue, matchesValue } from './predicate';

const rows: Datum[] = [
  { region: 'East', category: 'A', sales: 100, date: '2024-01-15' },
  { region: 'East', category: 'B', sales: 200, date: '2024-02-10' },
  { region: 'West', category: 'A', sales: 50, date: '2024-03-05' },
  { region: 'West', category: 'B', sales: 75, date: '2024-04-20' },
];

describe('isEmptyValue', () => {
  it('treats null and empty constraints as empty', () => {
    expect(isEmptyValue(null)).toBe(true);
    expect(isEmptyValue({ kind: 'point', fields: ['region'], tuples: [] })).toBe(true);
    expect(isEmptyValue({ kind: 'set', field: 'region', values: [] })).toBe(true);
    expect(isEmptyValue({ kind: 'text', field: 'region', query: '  ' })).toBe(true);
    expect(isEmptyValue({ kind: 'range', field: 'sales' })).toBe(true);
  });

  it('treats populated constraints as non-empty', () => {
    expect(isEmptyValue({ kind: 'set', field: 'region', values: ['East'] })).toBe(false);
    expect(isEmptyValue({ kind: 'range', field: 'sales', min: 10 })).toBe(false);
  });
});

describe('matchesValue', () => {
  it('matches point selections by field tuples', () => {
    const value: SelectionValue = {
      kind: 'point',
      fields: ['region', 'category'],
      tuples: [['East', 'A']],
    };
    expect(matchesValue(rows[0], value)).toBe(true);
    expect(matchesValue(rows[1], value)).toBe(false);
  });

  it('matches set selections by membership', () => {
    const value: SelectionValue = { kind: 'set', field: 'region', values: ['West'] };
    expect(matchesValue(rows[2], value)).toBe(true);
    expect(matchesValue(rows[0], value)).toBe(false);
  });

  it('matches numeric ranges inclusively', () => {
    const value: SelectionValue = { kind: 'range', field: 'sales', min: 75, max: 150 };
    expect(matchesValue(rows[0], value)).toBe(true); // 100
    expect(matchesValue(rows[3], value)).toBe(true); // 75 (boundary)
    expect(matchesValue(rows[2], value)).toBe(false); // 50
  });

  it('matches temporal ranges from ISO strings', () => {
    const value: SelectionValue = {
      kind: 'range',
      field: 'date',
      min: '2024-02-01',
      max: '2024-03-31',
    };
    expect(matchesValue(rows[1], value)).toBe(true); // Feb
    expect(matchesValue(rows[2], value)).toBe(true); // Mar
    expect(matchesValue(rows[0], value)).toBe(false); // Jan
  });

  it('matches text selections case-insensitively', () => {
    const value: SelectionValue = { kind: 'text', field: 'region', query: 'es' };
    expect(matchesValue(rows[2], value)).toBe(true); // West
    expect(matchesValue(rows[0], value)).toBe(false); // East
  });

  it('matches all rows when the constraint is empty', () => {
    expect(matchesValue(rows[0], null)).toBe(true);
    expect(matchesValue(rows[0], { kind: 'set', field: 'region', values: [] })).toBe(true);
  });
});

describe('filterRows', () => {
  it('ANDs multiple selections together', () => {
    const out = filterRows(rows, [
      { kind: 'set', field: 'region', values: ['East'] },
      { kind: 'range', field: 'sales', min: 150 },
    ]);
    expect(out).toEqual([rows[1]]);
  });

  it('returns all rows when no active constraints', () => {
    expect(filterRows(rows, [null, { kind: 'set', field: 'region', values: [] }])).toEqual(rows);
  });

  it('ignores a clause whose field is absent from the data (not-applicable)', () => {
    // A page-wide cross-filter on a column this (e.g. pre-aggregated) dataset
    // doesn't carry should be a no-op, not blank the visual.
    const out = filterRows(rows, [
      { kind: 'set', field: 'region', values: ['West'] },
      { kind: 'set', field: 'product', values: ['Widgets'] }, // no 'product' column
    ]);
    expect(out).toEqual([rows[2], rows[3]]); // filtered by the present field only
  });

  it('blanks correctly when a present field matches nothing', () => {
    // Presence guard must not mask a genuine empty result on a real column.
    expect(filterRows(rows, [{ kind: 'set', field: 'region', values: ['North'] }])).toEqual([]);
  });
});

describe('literalToValue', () => {
  it('maps every literal predicate form', () => {
    expect(literalToValue({ field: 'r', equals: 'East' })).toEqual({
      kind: 'set',
      field: 'r',
      values: ['East'],
    });
    expect(literalToValue({ field: 'r', oneOf: ['a', 'b'] })).toEqual({
      kind: 'set',
      field: 'r',
      values: ['a', 'b'],
    });
    expect(literalToValue({ field: 's', range: [1, 9] })).toEqual({
      kind: 'range',
      field: 's',
      min: 1,
      max: 9,
    });
    expect(literalToValue({ field: 'n', contains: 'x' })).toEqual({
      kind: 'text',
      field: 'n',
      query: 'x',
    });
  });
});
