import { describe, expect, it } from 'vitest';
import { interpolateArray, interpolateNumber, interpolateNumberArray, interpolateObject } from './index';

describe('interpolators', () => {
  it('interpolates numbers at endpoints and midpoint', () => {
    const interpolate = interpolateNumber(10, 20);

    expect(interpolate(0)).toBe(10);
    expect(interpolate(0.5)).toBe(15);
    expect(interpolate(1)).toBe(20);
  });

  it('interpolates arrays with exact endpoints', () => {
    const interpolate = interpolateArray([0, 10], [20, 30]);

    expect(interpolate(0)).toEqual([0, 10]);
    expect(interpolate(1)).toEqual([20, 30]);
  });

  it('interpolates objects with exact endpoints', () => {
    const interpolate = interpolateObject({ x: 0, y: 10 }, { x: 20, y: 30 });

    expect(interpolate(0)).toEqual({ x: 0, y: 10 });
    expect(interpolate(1)).toEqual({ x: 20, y: 30 });
  });

  it('interpolates array-like numbers with exact endpoints', () => {
    const interpolate = interpolateNumberArray(new Float32Array([0, 10]), new Float32Array([20, 30]));

    expect(interpolate(0)).toEqual([0, 10]);
    expect(interpolate(1)).toEqual([20, 30]);
  });
});
