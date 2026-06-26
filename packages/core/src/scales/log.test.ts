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
});
