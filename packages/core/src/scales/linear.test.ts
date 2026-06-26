import { describe, expect, it } from 'vitest';
import { linearScale } from './index';

describe('linearScale', () => {
  it('maps values and inverts pixels', () => {
    const scale = linearScale({ domain: [0, 10], range: [0, 100] });

    expect(scale.map(5)).toBe(50);
    expect(scale.invert(25)).toBe(2.5);
    expect(scale.invert(scale.map(7.25))).toBeCloseTo(7.25, 12);
  });

  it('supports clamp on and off', () => {
    const unclamped = linearScale({ domain: [0, 10], range: [0, 100] });
    const clamped = linearScale({ domain: [0, 10], range: [0, 100], clamp: true });

    expect(unclamped.map(12)).toBe(120);
    expect(clamped.map(12)).toBe(100);
    expect(clamped.invert(200)).toBe(10);
  });

  it('supports reversed ranges and zero-width domains', () => {
    const reversed = linearScale({ domain: [0, 10], range: [100, 0] });
    const zero = linearScale({ domain: [5, 5], range: [20, 80] });

    expect(reversed.map(2.5)).toBe(75);
    expect(reversed.invert(75)).toBe(2.5);
    expect(zero.map(100)).toBe(20);
  });

  it('creates nice and copied scales without mutating the original', () => {
    const scale = linearScale({ domain: [0.2, 9.6], range: [0, 100] });
    const nice = scale.nice(5);
    const copy = scale.copy();

    expect(scale.domain).toEqual([0.2, 9.6]);
    expect(nice.domain).toEqual([0, 10]);
    expect(copy.domain).toEqual(scale.domain);
    expect(copy).not.toBe(scale);
  });

  it('delegates numeric ticks and concise formatting', () => {
    const scale = linearScale({ domain: [0.2, 9.6], range: [0, 100] });
    const format = scale.tickFormat(5);

    expect(scale.ticks(5)).toEqual([0, 2, 4, 6, 8, 10]);
    expect(format(2)).toBe('2');
    expect(format(2.5)).toBe('2.5');
  });
});
