import { describe, it, expect } from 'vitest';
import { computeBackingSize } from './sizing';

describe('computeBackingSize', () => {
  it('scales backing store by dpr', () => {
    const b = computeBackingSize(200, 100, 2);
    expect(b.cssWidth).toBe(200);
    expect(b.cssHeight).toBe(100);
    expect(b.pixelWidth).toBe(400);
    expect(b.pixelHeight).toBe(200);
    expect(b.dpr).toBe(2);
  });

  it('rounds fractional device pixels', () => {
    const b = computeBackingSize(100.4, 50.6, 1.5);
    expect(b.pixelWidth).toBe(Math.round(100.4 * 1.5));
    expect(b.pixelHeight).toBe(Math.round(50.6 * 1.5));
  });

  it('falls back to dpr 1 for non-positive ratios', () => {
    expect(computeBackingSize(100, 100, 0).dpr).toBe(1);
    expect(computeBackingSize(100, 100, -2).dpr).toBe(1);
  });

  it('keeps backing dimensions at least 1px', () => {
    const b = computeBackingSize(0, 0, 2);
    expect(b.pixelWidth).toBeGreaterThanOrEqual(1);
    expect(b.pixelHeight).toBeGreaterThanOrEqual(1);
  });
});
