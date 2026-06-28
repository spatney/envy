import { describe, expect, it } from 'vitest';
import { linearRegression } from './regression';

describe('linearRegression', () => {
  it('recovers an exact line through perfectly linear points', () => {
    const xs = [0, 1, 2, 3, 4];
    const ys = [1, 3, 5, 7, 9]; // y = 2x + 1
    const fit = linearRegression(xs, ys);
    expect(fit).not.toBeNull();
    expect(fit!.slope).toBeCloseTo(2, 10);
    expect(fit!.intercept).toBeCloseTo(1, 10);
    expect(fit!.r2).toBeCloseTo(1, 10);
    expect(fit!.n).toBe(5);
    expect(fit!.predict(10)).toBeCloseTo(21, 10);
  });

  it('fits a best line through noisy points with 0 < r² < 1', () => {
    const xs = [1, 2, 3, 4, 5];
    const ys = [2, 1, 4, 3, 6];
    const fit = linearRegression(xs, ys);
    expect(fit).not.toBeNull();
    expect(fit!.slope).toBeGreaterThan(0);
    expect(fit!.r2).toBeGreaterThan(0);
    expect(fit!.r2).toBeLessThan(1);
  });

  it('handles a negative slope', () => {
    const xs = [0, 1, 2, 3];
    const ys = [10, 8, 6, 4]; // y = -2x + 10
    const fit = linearRegression(xs, ys);
    expect(fit!.slope).toBeCloseTo(-2, 10);
    expect(fit!.intercept).toBeCloseTo(10, 10);
  });

  it('returns null when there are fewer than two points', () => {
    expect(linearRegression([1], [2])).toBeNull();
    expect(linearRegression([], [])).toBeNull();
  });

  it('returns null when x has no spread (vertical fit)', () => {
    expect(linearRegression([3, 3, 3], [1, 2, 3])).toBeNull();
  });

  it('fits a flat line (r² = 1) when y is constant', () => {
    const fit = linearRegression([1, 2, 3], [5, 5, 5]);
    expect(fit).not.toBeNull();
    expect(fit!.slope).toBeCloseTo(0, 10);
    expect(fit!.intercept).toBeCloseTo(5, 10);
    expect(fit!.r2).toBe(1);
  });

  it('ignores non-finite pairs', () => {
    const xs = [0, 1, NaN, 2, 3];
    const ys = [1, 3, 10, 5, 7]; // y = 2x + 1 for the finite ones
    const fit = linearRegression(xs, ys);
    expect(fit!.n).toBe(4);
    expect(fit!.slope).toBeCloseTo(2, 10);
    expect(fit!.intercept).toBeCloseTo(1, 10);
  });

  it('clamps r² to at most 1', () => {
    const fit = linearRegression([0, 1, 2, 3, 4], [0, 2, 4, 6, 8]);
    expect(fit!.r2).toBeLessThanOrEqual(1);
  });
});
