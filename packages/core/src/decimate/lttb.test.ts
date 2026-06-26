import { describe, it, expect } from 'vitest';
import { decimate, lttbRun } from './lttb';

interface XY {
  x: number;
  y: number;
}

const getX = (p: XY): number => p.x;
const getY = (p: XY): number => p.y;
const gap = (): XY => ({ x: NaN, y: NaN });

function sine(n: number): XY[] {
  return Array.from({ length: n }, (_, i) => ({ x: i, y: Math.sin(i / 5) }));
}

describe('lttbRun', () => {
  it('is identity when threshold >= length or < 3', () => {
    const pts = sine(10);
    expect(lttbRun(pts, 10, getX, getY)).toEqual(pts);
    expect(lttbRun(pts, 20, getX, getY)).toEqual(pts);
    expect(lttbRun(pts, 2, getX, getY)).toEqual(pts);
  });

  it('reduces to exactly the threshold count', () => {
    const out = lttbRun(sine(1000), 50, getX, getY);
    expect(out).toHaveLength(50);
  });

  it('keeps the first and last points', () => {
    const pts = sine(500);
    const out = lttbRun(pts, 25, getX, getY);
    expect(out[0]).toEqual(pts[0]);
    expect(out[out.length - 1]).toEqual(pts[pts.length - 1]);
  });

  it('preserves a sharp spike that uniform sampling would miss', () => {
    const pts: XY[] = Array.from({ length: 201 }, (_, i) => ({ x: i, y: 0 }));
    pts[100] = { x: 100, y: 1000 }; // lone spike between flat runs
    const out = lttbRun(pts, 20, getX, getY);
    expect(out.some((p) => p.y === 1000)).toBe(true);
  });

  it('keeps x monotonically increasing', () => {
    const out = lttbRun(sine(2000), 80, getX, getY);
    for (let i = 1; i < out.length; i++) {
      expect(out[i].x).toBeGreaterThan(out[i - 1].x);
    }
  });
});

describe('decimate (gap-aware)', () => {
  it('returns input unchanged when it already fits', () => {
    const pts = sine(40);
    expect(decimate(pts, 100, { getX, getY, gap })).toEqual(pts);
  });

  it('downsamples a single run toward the threshold', () => {
    const out = decimate(sine(5000), 200, { getX, getY, gap });
    expect(out.length).toBeLessThanOrEqual(200);
    expect(out.length).toBeGreaterThan(150);
  });

  it('decimates runs independently and rejoins them with one gap', () => {
    const left = Array.from({ length: 2000 }, (_, i) => ({ x: i, y: Math.sin(i / 7) }));
    const right = Array.from({ length: 2000 }, (_, i) => ({ x: 3000 + i, y: Math.cos(i / 7) }));
    const input = [...left, gap(), ...right];
    const out = decimate(input, 100, { getX, getY, gap });
    const gaps = out.filter((p) => Number.isNaN(p.x));
    expect(gaps).toHaveLength(1);
    // Gap is interior, not at the boundaries.
    expect(Number.isNaN(out[0].x)).toBe(false);
    expect(Number.isNaN(out[out.length - 1].x)).toBe(false);
  });

  it('handles empty input', () => {
    expect(decimate([], 100, { getX, getY, gap })).toEqual([]);
  });
});
