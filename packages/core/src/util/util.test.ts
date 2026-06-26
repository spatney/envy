import { describe, expect, it } from 'vitest';
import {
  extent,
  groupBySeries,
  inferType,
  toDate,
  toNumber,
  uniqueValues,
} from './data';
import { clamp, crisp, lerp, range, sum } from './math';

describe('util/data', () => {
  const data = [
    { region: 'West', date: '2024-01-01', sales: 10 },
    { region: 'East', date: '2024-02-01', sales: 20 },
    { region: 'West', date: '2024-03-01', sales: 5 },
  ];

  it('coerces numbers and dates', () => {
    expect(toNumber('42')).toBe(42);
    expect(toNumber(true)).toBe(1);
    expect(Number.isNaN(toNumber('abc'))).toBe(true);
    expect(toDate('2024-01-01')?.getUTCFullYear()).toBe(2024);
    expect(toDate('nonsense')).toBeNull();
  });

  it('computes extent over a field', () => {
    expect(extent(data, 'sales')).toEqual([5, 20]);
    expect(extent([], 'sales')).toBeNull();
  });

  it('lists unique values in first-seen order', () => {
    expect(uniqueValues(data, 'region')).toEqual(['West', 'East']);
  });

  it('groups rows into series preserving order', () => {
    const series = groupBySeries(data, 'region');
    expect(series.map((s) => s.key)).toEqual(['West', 'East']);
    expect(series[0].rows).toHaveLength(2);
  });

  it('treats no series field as a single group', () => {
    const series = groupBySeries(data);
    expect(series).toHaveLength(1);
    expect(series[0].rows).toHaveLength(3);
  });

  it('infers field types', () => {
    expect(inferType(data, 'sales')).toBe('quantitative');
    expect(inferType(data, 'date')).toBe('temporal');
    expect(inferType(data, 'region')).toBe('nominal');
  });
});

describe('util/math', () => {
  it('clamps and lerps', () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-1, 0, 3)).toBe(0);
    expect(lerp(0, 10, 0.5)).toBe(5);
  });

  it('crisps odd strokes to half pixels', () => {
    expect(crisp(10, 1)).toBe(10.5);
    expect(crisp(10, 2)).toBe(10);
  });

  it('sums and ranges', () => {
    expect(sum([1, 2, 3])).toBe(6);
    expect(range(3)).toEqual([0, 1, 2]);
  });
});
