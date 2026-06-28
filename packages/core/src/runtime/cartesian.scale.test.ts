// @vitest-environment jsdom
import { describe, it, expect, beforeAll } from 'vitest';
import { resolveTheme, type ThemeTokens } from '../theme';
import { buildCartesianModel, type CartesianChartSpec } from './cartesian';
import type { BarSpec, LineSpec, ScatterSpec } from '../spec/types';

// Stub canvas so measureText uses the deterministic SSR heuristic.
beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = (() =>
    null) as typeof HTMLCanvasElement.prototype.getContext;
});

const tokens = (): ThemeTokens => resolveTheme();
const SIZE = { width: 800, height: 500 };

const build = (spec: CartesianChartSpec) => buildCartesianModel(spec, tokens(), SIZE);

const tickValues = (ticks: { value: number | string }[]): number[] =>
  ticks.map((t) => Number(t.value));

describe('cartesian scale options — axes.tickValues (B1)', () => {
  it('uses explicit y tickValues verbatim (within domain)', () => {
    const spec: LineSpec = {
      type: 'line',
      data: [
        { x: 'a', y: 0 },
        { x: 'b', y: 50 },
      ],
      encoding: { x: { field: 'x' }, y: { field: 'y' } },
      axes: { y: { tickValues: [0, 25, 50] } },
    };
    const model = build(spec);
    expect(tickValues(model.yTicks)).toEqual([0, 25, 50]);
  });

  it('uses explicit numeric x tickValues', () => {
    const spec: ScatterSpec = {
      type: 'scatter',
      data: [
        { x: 0, y: 1 },
        { x: 10, y: 2 },
      ],
      encoding: { x: { field: 'x', type: 'quantitative' }, y: { field: 'y' } },
      axes: { x: { tickValues: [0, 5, 10] } },
    };
    const model = build(spec);
    expect(tickValues(model.xTicks)).toEqual([0, 5, 10]);
  });

  it('drops explicit tick values that fall outside the domain', () => {
    const spec: LineSpec = {
      type: 'line',
      data: [
        { x: 'a', y: 10 },
        { x: 'b', y: 40 },
      ],
      encoding: { x: { field: 'x' }, y: { field: 'y', scale: { domain: [0, 50] } } },
      axes: { y: { tickValues: [-10, 0, 25, 50, 99] } },
    };
    const model = build(spec);
    expect(tickValues(model.yTicks)).toEqual([0, 25, 50]);
  });
});

describe('cartesian scale options — log scale (B2)', () => {
  it('y log scale: ticks are powers of the base and map logarithmically', () => {
    const spec: LineSpec = {
      type: 'line',
      data: [
        { x: 'a', y: 1 },
        { x: 'b', y: 10 },
        { x: 'c', y: 100 },
        { x: 'd', y: 1000 },
      ],
      encoding: { x: { field: 'x' }, y: { field: 'y', scale: { type: 'log' } } },
    };
    const model = build(spec);
    expect(tickValues(model.yTicks)).toEqual([1, 10, 100, 1000]);

    // Equal multiplicative steps occupy equal pixel distances on a log scale.
    const s = model.y.scale;
    const d1 = s.map(1) - s.map(10);
    const d2 = s.map(10) - s.map(100);
    const d3 = s.map(100) - s.map(1000);
    expect(d1).toBeCloseTo(d2, 6);
    expect(d2).toBeCloseTo(d3, 6);
  });

  it('y log scale: baseline sits at the plot bottom (zero has no log)', () => {
    const spec: LineSpec = {
      type: 'line',
      data: [
        { x: 'a', y: 1 },
        { x: 'b', y: 1000 },
      ],
      encoding: { x: { field: 'x' }, y: { field: 'y', scale: { type: 'log' } } },
    };
    const model = build(spec);
    expect(model.y.baseline).toBeCloseTo(model.plot.y + model.plot.height, 6);
  });

  it('y log scale: sanitizes a non-positive explicit domain to positive data', () => {
    const spec: LineSpec = {
      type: 'line',
      data: [
        { x: 'a', y: 2 },
        { x: 'b', y: 200 },
      ],
      encoding: { x: { field: 'x' }, y: { field: 'y', scale: { type: 'log', domain: [0, 200] } } },
    };
    const model = build(spec);
    // The lower bound is clamped off zero, so every tick is strictly positive.
    expect(model.yTicks.every((t) => Number(t.value) > 0)).toBe(true);
    expect(Number.isFinite(model.y.scale.map(2))).toBe(true);
  });

  it('numeric x log scale: ticks are powers of the base and map logarithmically', () => {
    const spec: ScatterSpec = {
      type: 'scatter',
      data: [
        { x: 1, y: 1 },
        { x: 10, y: 2 },
        { x: 100, y: 3 },
        { x: 1000, y: 4 },
      ],
      encoding: {
        x: { field: 'x', type: 'quantitative', scale: { type: 'log' } },
        y: { field: 'y' },
      },
    };
    const model = build(spec);
    expect(tickValues(model.xTicks)).toEqual([1, 10, 100, 1000]);

    const p1 = model.x.pixel(1)!;
    const p10 = model.x.pixel(10)!;
    const p100 = model.x.pixel(100)!;
    expect(p10 - p1).toBeCloseTo(p100 - p10, 6);
  });
});

describe('cartesian scale options — scale.zero (B3)', () => {
  it('line: zero:true forces the domain to include zero', () => {
    const spec: LineSpec = {
      type: 'line',
      data: [
        { x: 'a', y: 20 },
        { x: 'b', y: 50 },
      ],
      encoding: { x: { field: 'x' }, y: { field: 'y', scale: { zero: true } } },
    };
    const model = build(spec);
    expect(Math.min(...tickValues(model.yTicks))).toBe(0);
  });

  it('line: default does not include zero for a non-zero baseline data range', () => {
    const spec: LineSpec = {
      type: 'line',
      data: [
        { x: 'a', y: 20 },
        { x: 'b', y: 50 },
      ],
      encoding: { x: { field: 'x' }, y: { field: 'y' } },
    };
    const model = build(spec);
    expect(Math.min(...tickValues(model.yTicks))).toBeGreaterThan(0);
  });

  it('bar: zero:false suppresses the default zero baseline', () => {
    const spec: BarSpec = {
      type: 'bar',
      data: [
        { x: 'a', y: 20 },
        { x: 'b', y: 50 },
      ],
      encoding: { x: { field: 'x' }, y: { field: 'y', scale: { zero: false } } },
    };
    const model = build(spec);
    expect(Math.min(...tickValues(model.yTicks))).toBeGreaterThan(0);
  });
});

describe('cartesian scale options — scale.clamp (B4)', () => {
  it('clamps out-of-domain y values into range', () => {
    const spec: LineSpec = {
      type: 'line',
      data: [
        { x: 'a', y: 0 },
        { x: 'b', y: 50 },
      ],
      encoding: { x: { field: 'x' }, y: { field: 'y', scale: { domain: [0, 50], clamp: true } } },
    };
    const model = build(spec);
    // 100 is past the top of the domain; clamped, it lands on the same pixel as 50.
    expect(model.y.scale.map(100)).toBeCloseTo(model.y.scale.map(50), 6);
  });

  it('without clamp, an out-of-domain y value extrapolates past the plot', () => {
    const spec: LineSpec = {
      type: 'line',
      data: [
        { x: 'a', y: 0 },
        { x: 'b', y: 50 },
      ],
      encoding: { x: { field: 'x' }, y: { field: 'y', scale: { domain: [0, 50] } } },
    };
    const model = build(spec);
    // y range is inverted (bottom→top), so a larger value yields a smaller pixel.
    expect(model.y.scale.map(100)).toBeLessThan(model.y.scale.map(50));
  });
});

describe('cartesian scale options — categorical domain (B5)', () => {
  it('honors an explicit categorical x domain order and subset', () => {
    const spec: BarSpec = {
      type: 'bar',
      data: [
        { x: 'A', y: 1 },
        { x: 'B', y: 2 },
        { x: 'C', y: 3 },
      ],
      encoding: { x: { field: 'x', scale: { domain: ['C', 'A'] } }, y: { field: 'y' } },
    };
    const model = build(spec);
    expect(model.x.categories).toEqual(['C', 'A']);
    // The first category sits left of the second.
    expect(model.x.pixel('C')!).toBeLessThan(model.x.pixel('A')!);
  });
});

describe('cartesian scale options — numeric x tick domain filter (B6)', () => {
  it('filters generated numeric x ticks to the explicit domain', () => {
    const spec: ScatterSpec = {
      type: 'scatter',
      data: [
        { x: 0, y: 1 },
        { x: 100, y: 2 },
      ],
      encoding: {
        x: { field: 'x', type: 'quantitative', scale: { domain: [5, 45] } },
        y: { field: 'y' },
      },
    };
    const model = build(spec);
    const xs = tickValues(model.xTicks);
    expect(xs.length).toBeGreaterThan(0);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(5);
    expect(Math.max(...xs)).toBeLessThanOrEqual(45);
  });
});
