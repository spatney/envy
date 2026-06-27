import { describe, it, expect } from 'vitest';
import { thumbLeftCss } from './controls';

describe('thumbLeftCss (dual-slider thumb positioning)', () => {
  it('emits a unitless calc multiplier at the extremes and midpoint', () => {
    expect(thumbLeftCss(0)).toBe('calc(8px + 0 * (100% - 16px))');
    expect(thumbLeftCss(50)).toBe('calc(8px + 0.5 * (100% - 16px))');
    expect(thumbLeftCss(100)).toBe('calc(8px + 1 * (100% - 16px))');
  });

  it('never multiplies a percentage by a length (the invalid-CSS regression)', () => {
    // `calc(45% * (100% - 16px))` is invalid and the browser drops `left`,
    // collapsing both thumbs to the left edge — the original single-handle bug.
    for (const p of [0, 12.5, 33.3, 66.6, 99.9, 100]) {
      expect(thumbLeftCss(p)).not.toMatch(/%\s*\*/);
    }
  });

  it('clamps out-of-range input to [0, 100]', () => {
    expect(thumbLeftCss(-10)).toBe('calc(8px + 0 * (100% - 16px))');
    expect(thumbLeftCss(150)).toBe('calc(8px + 1 * (100% - 16px))');
  });

  it('is monotonic across the track', () => {
    const at = (p: number): number => Number(/\+ ([\d.]+) \*/.exec(thumbLeftCss(p))![1]);
    expect(at(10)).toBeLessThan(at(20));
    expect(at(20)).toBeLessThan(at(90));
  });
});
