import { describe, it, expect } from 'vitest';
import type { RGBA } from '../types';
import { parseColor } from './parse';
import { rgbaToCss, toHex } from './format';
import { rgbToOklab, oklabToRgb } from './convert';
import { interpolateRgb, interpolateOklab } from './interpolate';
import { categorical, sequential, diverging } from './palettes';
import { sequentialColorScale, divergingColorScale, ordinalColorScale } from './scales';
import { relativeLuminance, contrastRatio, readableTextColor } from './contrast';

const WHITE: RGBA = { r: 255, g: 255, b: 255, a: 1 };
const BLACK: RGBA = { r: 0, g: 0, b: 0, a: 1 };

describe('parseColor', () => {
  it('parses hex forms', () => {
    expect(parseColor('#f00')).toEqual({ r: 255, g: 0, b: 0, a: 1 });
    expect(parseColor('#ff0000')).toEqual({ r: 255, g: 0, b: 0, a: 1 });
    expect(parseColor('#ff000080')?.a).toBeCloseTo(0.502, 2);
  });
  it('parses rgb/rgba and hsl', () => {
    expect(parseColor('rgb(10, 20, 30)')).toEqual({ r: 10, g: 20, b: 30, a: 1 });
    expect(parseColor('rgba(10,20,30,0.5)')).toEqual({ r: 10, g: 20, b: 30, a: 0.5 });
    expect(parseColor('hsl(0, 100%, 50%)')).toEqual({ r: 255, g: 0, b: 0, a: 1 });
  });
  it('parses named colors and rejects junk', () => {
    expect(parseColor('white')).toEqual(WHITE);
    expect(parseColor('transparent')).toEqual({ r: 0, g: 0, b: 0, a: 0 });
    expect(parseColor('not-a-color')).toBeNull();
  });
});

describe('format', () => {
  it('round-trips hex', () => {
    expect(toHex({ r: 18, g: 52, b: 86, a: 1 })).toBe('#123456');
    expect(parseColor('#123456')).toEqual({ r: 18, g: 52, b: 86, a: 1 });
  });
  it('formats css', () => {
    expect(rgbaToCss({ r: 1, g: 2, b: 3, a: 1 })).toBe('rgb(1, 2, 3)');
    expect(rgbaToCss({ r: 1, g: 2, b: 3, a: 0.5 })).toBe('rgba(1, 2, 3, 0.5)');
  });
});

describe('oklab', () => {
  it('maps black to L~0 and white to L~1', () => {
    expect(rgbToOklab(BLACK).L).toBeCloseTo(0, 3);
    expect(rgbToOklab(WHITE).L).toBeCloseTo(1, 2);
  });
  it('round-trips rgb -> oklab -> rgb within tolerance', () => {
    for (const c of [
      { r: 200, g: 30, b: 90, a: 1 },
      { r: 12, g: 200, b: 120, a: 1 },
      { r: 60, g: 60, b: 200, a: 1 },
    ]) {
      const back = oklabToRgb(rgbToOklab(c), 1);
      expect(Math.abs(back.r - c.r)).toBeLessThanOrEqual(1);
      expect(Math.abs(back.g - c.g)).toBeLessThanOrEqual(1);
      expect(Math.abs(back.b - c.b)).toBeLessThanOrEqual(1);
    }
  });
});

describe('interpolation', () => {
  it('has exact endpoints', () => {
    const ir = interpolateRgb(BLACK, WHITE);
    expect(ir(0)).toEqual(BLACK);
    expect(ir(1)).toEqual(WHITE);
    const io = interpolateOklab(BLACK, WHITE);
    expect(io(0)).toEqual(BLACK);
    expect(io(1)).toEqual(WHITE);
  });
  it('produces an intermediate color in the middle', () => {
    const mid = interpolateRgb(BLACK, WHITE)(0.5);
    expect(mid.r).toBeGreaterThan(100);
    expect(mid.r).toBeLessThan(160);
  });
});

describe('palettes', () => {
  it('categorical has >=8 parseable colors', () => {
    const p = categorical();
    expect(p.length).toBeGreaterThanOrEqual(8);
    for (const c of p) expect(parseColor(c)).not.toBeNull();
  });
  it('sequential/diverging endpoints parse', () => {
    const s = sequential('viridis');
    expect(s(0)).toBeDefined();
    expect(s(1)).toBeDefined();
    const d = diverging('redBlue');
    expect(d(0.5)).toBeDefined();
  });
});

describe('color scales', () => {
  it('sequential maps domain to colors', () => {
    const sc = sequentialColorScale({ domain: [0, 100], interpolator: sequential('blues') });
    expect(sc.map(0)).toBeDefined();
    expect(sc.map(100)).toBeDefined();
  });
  it('diverging centers at the midpoint', () => {
    const dc = divergingColorScale({ domain: [-10, 0, 10], interpolator: diverging('redBlue') });
    const mid = dc.map(0);
    expect(mid.r).toBeGreaterThan(200);
    expect(mid.g).toBeGreaterThan(200);
    expect(mid.b).toBeGreaterThan(200);
  });
  it('ordinal cycles the palette', () => {
    const oc = ordinalColorScale({ domain: ['a', 'b'] });
    const a1 = oc.map('a');
    const a2 = oc.map('a');
    expect(a1).toEqual(a2);
    expect(oc.map('b')).not.toEqual(a1);
  });
});

describe('contrast', () => {
  it('black/white contrast is 21', () => {
    expect(contrastRatio(BLACK, WHITE)).toBeCloseTo(21, 1);
    expect(contrastRatio(WHITE, WHITE)).toBeCloseTo(1, 5);
  });
  it('luminance ordering', () => {
    expect(relativeLuminance(WHITE)).toBeGreaterThan(relativeLuminance(BLACK));
  });
  it('readableTextColor picks dark on light bg and light on dark bg', () => {
    expect(readableTextColor({ r: 245, g: 245, b: 245, a: 1 })).toEqual(BLACK);
    expect(readableTextColor({ r: 20, g: 20, b: 30, a: 1 })).toEqual(WHITE);
  });
});
