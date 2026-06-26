import { describe, expect, it } from 'vitest';
import { bandScale, pointScale } from './index';

describe('bandScale', () => {
  it('computes standard band positions with padding', () => {
    const scale = bandScale({
      domain: ['a', 'b', 'c'],
      range: [0, 120],
      paddingInner: 0.2,
      paddingOuter: 0.1,
    });

    expect(scale.step).toBeCloseTo(40, 12);
    expect(scale.bandwidth).toBeCloseTo(32, 12);
    expect(scale.map('a')).toBeCloseTo(4, 12);
    expect(scale.map('b')).toBeCloseTo(44, 12);
    expect(scale.map('c')).toBeCloseTo(84, 12);
    expect(scale.map('missing')).toBeUndefined();
  });

  it('supports reversed ranges, empty domains, and single categories', () => {
    const reversed = bandScale({ domain: ['a', 'b'], range: [100, 0] });
    const empty = bandScale({ domain: [], range: [0, 100] });
    const single = bandScale({ domain: ['a'], range: [0, 100] });

    expect(reversed.map('a')).toBe(50);
    expect(reversed.map('b')).toBe(0);
    expect(empty.step).toBe(0);
    expect(empty.bandwidth).toBe(0);
    expect(empty.map('a')).toBeUndefined();
    expect(single.map('a')).toBe(0);
    expect(single.bandwidth).toBe(100);
  });
});

describe('pointScale', () => {
  it('computes point positions with padding and alignment', () => {
    const scale = pointScale({ domain: ['a', 'b', 'c'], range: [0, 100], padding: 0.5 });

    expect(scale.step).toBeCloseTo(100 / 3, 12);
    expect(scale.map('a')).toBeCloseTo(100 / 6, 12);
    expect(scale.map('b')).toBeCloseTo(50, 12);
    expect(scale.map('c')).toBeCloseTo(500 / 6, 12);
  });

  it('handles reversed, empty, and single-category domains', () => {
    const reversed = pointScale({ domain: ['a', 'b', 'c'], range: [100, 0] });
    const empty = pointScale({ domain: [], range: [0, 100] });
    const single = pointScale({ domain: ['only'], range: [0, 100] });

    expect(reversed.map('a')).toBe(100);
    expect(reversed.map('c')).toBe(0);
    expect(empty.step).toBe(0);
    expect(empty.map('a')).toBeUndefined();
    expect(single.map('only')).toBe(50);
  });
});
