// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from 'vitest';
import type { Surface } from '../render/surface';
import { buildCartesianModel } from '../runtime/cartesian';
import { validateSpec } from '../spec/validate';
import type { BarSpec } from '../spec/types';
import { resolveTheme } from '../theme';
import { drawBar } from './bar';

beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext;
});

const data = [
  { category: 'A', value: 10, segment: 'North' },
  { category: 'B', value: -4, segment: 'North' },
  { category: 'C', value: 15, segment: 'North' },
  { category: 'A', value: 7, segment: 'South' },
  { category: 'B', value: -8, segment: 'South' },
  { category: 'C', value: 5, segment: 'South' },
  { category: 'D', value: 0, segment: 'South' },
];

function spec(over: Partial<BarSpec> = {}): BarSpec {
  return {
    type: 'bar',
    data,
    encoding: {
      x: { field: 'category' },
      y: { field: 'value' },
      series: { field: 'segment' },
    },
    ...over,
  };
}

function fakeContext(): { ctx: CanvasRenderingContext2D; calls: () => number; methodCalls: (name: string) => number; alphas: () => number[] } {
  let count = 0;
  const methods = new Map<string, number>();
  const alphaValues: number[] = [];
  const grad = { addColorStop() {} };
  const data: Record<PropertyKey, unknown> = {
    canvas: { width: 640, height: 400 },
    createLinearGradient: () => grad,
    createRadialGradient: () => grad,
    measureText: (t: string) => ({ width: String(t).length * 6 }),
    setLineDash() {},
    globalAlpha: 1,
  };
  const ctx = new Proxy(data, {
    get(t, prop: PropertyKey) {
      if (prop in t) return t[prop];
      return (...args: unknown[]) => {
        void args;
        count++;
        methods.set(String(prop), (methods.get(String(prop)) ?? 0) + 1);
        return undefined;
      };
    },
    set(t, prop: PropertyKey, value: unknown) {
      if (prop === 'globalAlpha') alphaValues.push(Number(value));
      t[prop] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, calls: () => count, methodCalls: (name) => methods.get(name) ?? 0, alphas: () => alphaValues };
}

function makeSurface() {
  const { ctx, calls, methodCalls, alphas } = fakeContext();
  return {
    surface: { marks: { ctx }, overlay: document.createElement('div'), width: 640, height: 400 } as unknown as Surface,
    calls,
    methodCalls,
    alphas,
  };
}

function modelFor(s: BarSpec) {
  return buildCartesianModel(s, resolveTheme('light'), { width: 640, height: 400 });
}

interface BBox {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

/** A canvas stub that records the bounding box of each filled path. */
function capturingSurface(): { surface: Surface; rects: () => BBox[] } {
  const paths: { x: number; y: number }[][] = [];
  let cur: { x: number; y: number }[] = [];
  const rec = (x: number, y: number): void => {
    cur.push({ x, y });
  };
  const grad = { addColorStop() {} };
  const data: Record<PropertyKey, unknown> = {
    canvas: { width: 640, height: 400 },
    createLinearGradient: () => grad,
    createRadialGradient: () => grad,
    measureText: (t: string) => ({ width: String(t).length * 6 }),
    setLineDash() {},
    globalAlpha: 1,
    beginPath: () => {
      cur = [];
    },
    moveTo: rec,
    lineTo: rec,
    quadraticCurveTo: (_cx: number, _cy: number, x: number, y: number) => rec(x, y),
    fill: () => {
      if (cur.length) paths.push(cur.slice());
    },
  };
  const ctx = new Proxy(data, {
    get(t, prop: PropertyKey) {
      if (prop in t) return t[prop];
      return () => undefined;
    },
    set(t, prop: PropertyKey, value: unknown) {
      t[prop] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  const surface = {
    marks: { ctx },
    overlay: document.createElement('div'),
    width: 640,
    height: 400,
  } as unknown as Surface;
  const rects = (): BBox[] =>
    paths.map((pts) => {
      const xs = pts.map((p) => p.x);
      const ys = pts.map((p) => p.y);
      return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
    });
  return { surface, rects };
}

const singleData = [
  { category: 'A', value: 10 },
  { category: 'C', value: 15 },
];
function singleSpec(over: Partial<BarSpec> = {}): BarSpec {
  return {
    type: 'bar',
    data: singleData,
    encoding: { x: { field: 'category' }, y: { field: 'value' } },
    ...over,
  };
}

describe('drawBar', () => {
  it('accepts grouped, stacked, horizontal, and insight options', () => {
    expect(validateSpec(spec({ group: true, insights: true, orientation: 'horizontal' })).errors).toEqual([]);
    expect(validateSpec(spec({ stack: true })).errors).toEqual([]);
  });

  it('renders grouped positive and negative bars', () => {
    const { surface, methodCalls } = makeSurface();
    drawBar(surface, modelFor(spec({ cornerRadius: 3 })));
    expect(methodCalls('fill')).toBeGreaterThanOrEqual(6);
  });

  it('renders stacked bars with positive and negative stacks', () => {
    const { surface, methodCalls } = makeSurface();
    drawBar(surface, modelFor(spec({ stack: true })));
    expect(methodCalls('fill')).toBeGreaterThanOrEqual(6);
  });

  it('honors row-level emphasis alpha', () => {
    const { surface, alphas } = makeSurface();
    const model = modelFor(spec());
    model.emphasis = { dim: 0.4, match: (row) => row.segment === 'South' };
    drawBar(surface, model);
    expect(alphas()).toContain(0.4);
  });

  it('renders grouped bars in sketch mode', () => {
    const { surface, calls } = makeSurface();
    drawBar(surface, modelFor(spec({ sketch: true })));
    expect(calls()).toBeGreaterThan(0);
  });

  it('returns without drawing when the x scale is not a band scale', () => {
    const { surface, calls } = makeSurface();
    const model = modelFor(spec()) as ReturnType<typeof modelFor>;
    model.x.kind = 'linear';
    drawBar(surface, model);
    expect(calls()).toBe(0);
  });

  it('keeps vertical bars on the classic axes', () => {
    const model = modelFor(spec());
    expect(model.orientation).toBe('vertical');
    expect(model.project(100, 200)).toEqual({ x: 100, y: 200 });
  });

  it('lays horizontal bars out along swapped axes', () => {
    const model = modelFor(spec({ orientation: 'horizontal' }));
    const { x, y, width, height } = model.plot;
    expect(model.orientation).toBe('horizontal');
    // project swaps the (category, value) pixel pair.
    expect(model.project(100, 200)).toEqual({ x: 200, y: 100 });
    // Value axis runs horizontally: larger value → larger screen-x, within plot.
    expect(model.y.pixel(15)).toBeGreaterThan(model.y.pixel(-8));
    expect(model.y.pixel(15)).toBeLessThanOrEqual(x + width + 1);
    expect(model.y.pixel(-8)).toBeGreaterThanOrEqual(x - 1);
    // Baseline (value 0) is a horizontal pixel inside the plot width.
    expect(model.y.baseline).toBeGreaterThanOrEqual(x - 1);
    expect(model.y.baseline).toBeLessThanOrEqual(x + width + 1);
    // Category axis runs vertically: band centers sit within the plot height.
    const cat = model.x.pixel('A');
    expect(cat).not.toBeNull();
    expect(cat as number).toBeGreaterThanOrEqual(y);
    expect(cat as number).toBeLessThanOrEqual(y + height);
  });

  it('renders horizontal grouped and stacked bars', () => {
    const grouped = makeSurface();
    drawBar(grouped.surface, modelFor(spec({ orientation: 'horizontal', cornerRadius: 3 })));
    expect(grouped.methodCalls('fill')).toBeGreaterThanOrEqual(6);
    const stacked = makeSurface();
    drawBar(stacked.surface, modelFor(spec({ orientation: 'horizontal', stack: true })));
    expect(stacked.methodCalls('fill')).toBeGreaterThanOrEqual(6);
  });

  it('grows horizontal bars along x from a shared left baseline', () => {
    const { surface, rects } = capturingSurface();
    drawBar(surface, modelFor(singleSpec({ orientation: 'horizontal' })));
    const r = rects();
    expect(r.length).toBe(2);
    // The value-15 bar is wider (greater x-extent) than the value-10 bar.
    const widths = r.map((b) => b.x1 - b.x0).sort((a, b) => a - b);
    expect(widths[1]).toBeGreaterThan(widths[0]);
    // Both bars start at the same left baseline.
    expect(Math.abs(r[0].x0 - r[1].x0)).toBeLessThan(1.5);
  });

  it('grows vertical bars along y from a shared bottom baseline', () => {
    const { surface, rects } = capturingSurface();
    drawBar(surface, modelFor(singleSpec()));
    const r = rects();
    expect(r.length).toBe(2);
    // The value-15 bar is taller (greater y-extent) than the value-10 bar.
    const heights = r.map((b) => b.y1 - b.y0).sort((a, b) => a - b);
    expect(heights[1]).toBeGreaterThan(heights[0]);
    // Both bars share the same bottom baseline.
    expect(Math.abs(r[0].y1 - r[1].y1)).toBeLessThan(1.5);
  });
});
