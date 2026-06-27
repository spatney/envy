import { describe, expect, it } from 'vitest';
import { computeShowAsValue } from './matrix';

describe('matrix showAs values', () => {
  it('keeps raw values for value mode', () => {
    expect(computeShowAsValue(42, 'value', 100)).toBe(42);
    expect(computeShowAsValue(42, undefined, 100)).toBe(42);
  });

  it('computes percentages against supplied denominators', () => {
    expect(computeShowAsValue(25, 'percentOfRow', 100)).toBe(0.25);
    expect(computeShowAsValue(3, 'percentOfColumn', 12)).toBe(0.25);
    expect(computeShowAsValue(9, 'percentOfTotal', 36)).toBe(0.25);
  });

  it('returns null for null values or zero denominators', () => {
    expect(computeShowAsValue(null, 'percentOfTotal', 10)).toBeNull();
    expect(computeShowAsValue(10, 'percentOfTotal', 0)).toBeNull();
  });
});
