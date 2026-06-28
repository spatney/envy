import { describe, expect, it } from 'vitest';
import { resolveSketch } from './sketch';
import type { ChartSpec } from './types';

const base: ChartSpec = {
  type: 'bar',
  data: [{ a: 1, b: 2 }],
  encoding: { x: { field: 'a' }, y: { field: 'b' } },
};

describe('resolveSketch', () => {
  it('returns null when sketch is absent or false', () => {
    expect(resolveSketch(base)).toBeNull();
    expect(resolveSketch({ ...base, sketch: false })).toBeNull();
  });

  it('applies defaults for sketch: true', () => {
    const r = resolveSketch({ ...base, sketch: true })!;
    expect(r).not.toBeNull();
    expect(r.fillStyle).toBe('hachure');
    expect(r.roughness).toBe(1);
    expect(r.font).toBe(true);
    expect(r.seed).toBeGreaterThan(0);
  });

  it('honors explicit overrides', () => {
    const r = resolveSketch({
      ...base,
      sketch: { roughness: 2.5, fillStyle: 'solid', seed: 7, font: false },
    })!;
    expect(r.roughness).toBe(2.5);
    expect(r.fillStyle).toBe('solid');
    expect(r.seed).toBe(7);
    expect(r.font).toBe(false);
  });

  it('derives a stable seed from spec identity', () => {
    const a = resolveSketch({ ...base, sketch: true })!;
    const b = resolveSketch({ ...base, sketch: true })!;
    expect(a.seed).toBe(b.seed);
  });

  it('derives different seeds for materially different specs', () => {
    const a = resolveSketch({ ...base, sketch: true, title: 'One' })!;
    const b = resolveSketch({ ...base, sketch: true, title: 'Two' })!;
    expect(a.seed).not.toBe(b.seed);
  });

  it('uses title text or subtitle plus data shape when deriving seeds', () => {
    const titled = resolveSketch({ ...base, sketch: true, title: { text: 'Sales' } })!;
    const titledAgain = resolveSketch({ ...base, sketch: true, title: { text: 'Sales', subtitle: 'Ignored' } })!;
    const subtitled = resolveSketch({ ...base, sketch: true, title: { subtitle: 'Sales subtitle' } })!;
    const differentShape = resolveSketch({
      ...base,
      data: [{ c: 1, d: 2 }],
      encoding: { x: { field: 'c' }, y: { field: 'd' } },
      sketch: true,
      title: { text: 'Sales' },
    })!;

    expect(titled.seed).toBe(titledAgain.seed);
    expect(titled.seed).not.toBe(subtitled.seed);
    expect(titled.seed).not.toBe(differentShape.seed);
  });

  it('resolves every sketch object field and coerces seed to uint32', () => {
    const r = resolveSketch({
      ...base,
      sketch: {
        roughness: 2,
        bowing: 3,
        fillStyle: 'cross-hatch',
        hachureGap: 6,
        hachureAngle: 15,
        strokeWidth: 4,
        seed: -1,
      },
    })!;

    expect(r).toMatchObject({
      roughness: 2,
      bowing: 3,
      fillStyle: 'cross-hatch',
      hachureGap: 6,
      hachureAngle: 15,
      strokeWidth: 4,
      seed: 0xffffffff,
      font: true,
    });
  });
});
