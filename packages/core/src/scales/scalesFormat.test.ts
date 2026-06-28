import { describe, expect, it } from 'vitest';
import { formatNumber, precisionFromStep } from './format';

describe('scales/format formatNumber', () => {
  it('returns non-finite and zero values without numeric formatting', () => {
    expect(formatNumber(Number.NaN)).toBe('NaN');
    expect(formatNumber(Number.POSITIVE_INFINITY)).toBe('Infinity');
    expect(formatNumber(Number.NEGATIVE_INFINITY)).toBe('-Infinity');
    expect(formatNumber(0)).toBe('0');
    expect(formatNumber(-0)).toBe('0');
  });

  it('trims fixed-point trailing zeroes using bounded precision', () => {
    expect(formatNumber(12.340000, 6)).toBe('12.34');
    expect(formatNumber(-12.340000, 6)).toBe('-12.34');
    expect(formatNumber(1 / 3, 4)).toBe('0.3333');
    expect(formatNumber(1.23456, -5)).toBe('1');
    expect(formatNumber(1.23456, 99)).toBe('1.23456');
  });

  it('uses compact exponential notation for huge and tiny magnitudes', () => {
    expect(formatNumber(1_200_000, 4)).toBe('1.2e+6');
    expect(formatNumber(-9_876_543_210, 3)).toBe('-9.877e+9');
    expect(formatNumber(0.0000123, 6)).toBe('1.23e-5');
    expect(formatNumber(-0.00000098765, 5)).toBe('-9.8765e-7');
  });

  it('respects exponential precision clamping', () => {
    expect(formatNumber(1e8, -1)).toBe('1e+8');
    expect(formatNumber(1.23456789e8, 99)).toBe('1.234568e+8');
    expect(formatNumber(9.99e-8, 0)).toBe('1e-7');
  });
});

describe('scales/format precisionFromStep', () => {
  it('falls back for invalid or zero steps', () => {
    expect(precisionFromStep(0)).toBe(12);
    expect(precisionFromStep(Number.NaN)).toBe(12);
    expect(precisionFromStep(Number.POSITIVE_INFINITY)).toBe(12);
  });

  it('derives bounded precision from positive and negative step sizes', () => {
    expect(precisionFromStep(100)).toBe(0);
    expect(precisionFromStep(1)).toBe(2);
    expect(precisionFromStep(0.1)).toBe(3);
    expect(precisionFromStep(-0.001)).toBe(5);
    expect(precisionFromStep(1e-20)).toBe(12);
  });
});
