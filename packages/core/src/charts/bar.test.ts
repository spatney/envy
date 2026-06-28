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
});
