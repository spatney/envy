import { describe, expect, it } from 'vitest';
import { logScale } from './index';

describe('logScale', () => {
  it('maps logarithmically and inverts pixels', () => {
    const scale = logScale({ domain: [1, 1000], range: [0, 300] });

    expect(scale.map(10)).toBeCloseTo(100, 12);
    expect(scale.map(100)).toBeCloseTo(200, 12);
    expect(scale.invert(100)).toBeCloseTo(10, 12);
  });

  it('returns powers of base as ticks', () => {
    const scale = logScale({ domain: [1, 16], range: [0, 100], base: 2 });

    expect(scale.ticks()).toEqual([1, 2, 4, 8, 16]);
  });

  it('supports reversed and negative domains', () => {
    const reversed = logScale({ domain: [1000, 1], range: [0, 300] });
    const negative = logScale({ domain: [-1000, -1], range: [0, 300] });

    expect(reversed.ticks()).toEqual([1000, 100, 10, 1]);
    expect(negative.ticks()).toEqual([-1000, -100, -10, -1]);
    expect(negative.map(-10)).toBeCloseTo(200, 12);
  });

  it('rejects domains crossing zero', () => {
    expect(() => logScale({ domain: [-1, 1], range: [0, 1] })).toThrow();
    expect(() => logScale({ domain: [0, 1], range: [0, 1] })).toThrow();
  });

  it('returns NaN for zero and wrong-sign values (B7)', () => {
    const positive = logScale({ domain: [1, 100], range: [0, 100] });
    // Previously Math.abs() let a negative value masquerade as its magnitude
    // (e.g. map(-10) === map(10) === 50). It must now be undefined → NaN.
    expect(Number.isNaN(positive.map(-10))).toBe(true);
    expect(Number.isNaN(positive.map(0))).toBe(true);
    expect(Number.isNaN(positive.map(NaN))).toBe(true);
    expect(Number.isNaN(positive.map(Infinity))).toBe(true);
    // Correct-sign values still map normally.
    expect(positive.map(10)).toBeCloseTo(50, 12);

    const negative = logScale({ domain: [-100, -1], range: [0, 100] });
    expect(Number.isNaN(negative.map(10))).toBe(true);
    expect(negative.map(-10)).toBeCloseTo(50, 12);
  });

  it('maps a degenerate domain to the range start instead of NaN (B8)', () => {
    const scale = logScale({ domain: [1, 1], range: [0, 100] });
    expect(scale.map(1)).toBe(0);
    expect(scale.invert(50)).toBe(1);
  });
});
