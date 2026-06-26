import { describe, expect, it } from 'vitest';
import { niceDomain, tickIncrement, tickStep, ticks } from './index';

describe('numeric ticks', () => {
  it('chooses 1/2/5 times powers of ten as nice steps', () => {
    expect(tickStep(0, 9, 5)).toBe(2);
    expect(tickStep(0, 1, 5)).toBe(0.2);
    expect(tickStep(10, 0, 5)).toBe(-2);
    expect(tickIncrement(0, 100, 4)).toBe(20);
  });

  it('expands domains outward to nice bounds', () => {
    expect(niceDomain(0.2, 9.6, 5)).toEqual([0, 10]);
    expect(niceDomain(9.6, 0.2, 5)).toEqual([10, 0]);
    expect(niceDomain(-0.7, 0.7, 4)).toEqual([-1, 1]);
  });

  it('returns ticks that cover the requested domain', () => {
    expect(ticks(0.2, 9.6, 5)).toEqual([0, 2, 4, 6, 8, 10]);
    expect(ticks(9.6, 0.2, 5)).toEqual([10, 8, 6, 4, 2, 0]);
    expect(ticks(-0.7, 0.7, 4)).toEqual([-1, -0.5, 0, 0.5, 1]);
  });

  it('handles degenerate and invalid inputs', () => {
    expect(ticks(3, 3, 5)).toEqual([3]);
    expect(niceDomain(3, 3, 5)).toEqual([3, 3]);
    expect(ticks(Number.NaN, 1, 5)).toEqual([]);
  });
});
