import { describe, it, expect } from 'vitest';
import { inferFieldType, inferValueType } from './infer';

describe('inferValueType', () => {
  it('classifies primitives', () => {
    expect(inferValueType(42)).toBe('quantitative');
    expect(inferValueType('hello')).toBe('nominal');
    expect(inferValueType('2024-01-15')).toBe('temporal');
    expect(inferValueType('2024')).toBe('temporal');
    expect(inferValueType('3.14')).toBe('quantitative');
    expect(inferValueType(new Date())).toBe('temporal');
    expect(inferValueType(null)).toBeUndefined();
  });
});

describe('inferFieldType', () => {
  const data = [
    { region: 'West', sales: 100, date: '2024-01-01' },
    { region: 'East', sales: 220, date: '2024-02-01' },
    { region: 'West', sales: 130, date: '2024-03-01' },
  ];
  it('infers field types across rows', () => {
    expect(inferFieldType(data, 'sales')).toBe('quantitative');
    expect(inferFieldType(data, 'region')).toBe('nominal');
    expect(inferFieldType(data, 'date')).toBe('temporal');
  });
  it('defaults to nominal when empty', () => {
    expect(inferFieldType([], 'x')).toBe('nominal');
  });
});
