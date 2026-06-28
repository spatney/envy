// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from 'vitest';
import type { Surface } from '../render/surface';
import { buildCartesianModel } from '../runtime/cartesian';
import { validateSpec } from '../spec/validate';
import type { ScatterSpec } from '../spec/types';
import { resolveTheme } from '../theme';
import { drawScatter } from './scatter';

beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext;
});

const data = Array.from({ length: 24 }, (_, i) => ({
  x: i + 1,
  y: i % 5 === 0 ? i * 1.4 : i * 2 + 3,
  size: i % 3 === 0 ? 50 : i + 5,
  group: i % 2 === 0 ? 'A' : 'B',
}));

function spec(over: Partial<ScatterSpec> = {}): ScatterSpec {
  return {
    type: 'scatter',
    data,
    encoding: {
      x: { field: 'x', type: 'quantitative' },
      y: { field: 'y' },
      size: { field: 'size' },
      color: { field: 'group' },
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

function modelFor(s: ScatterSpec) {
  return buildCartesianModel(s, resolveTheme('light'), { width: 640, height: 400 });
}

describe('drawScatter', () => {
  it('accepts size, color and trendline channels', () => {
    expect(validateSpec(spec({ trendline: true })).errors).toEqual([]);
  });

  it('renders many sized and colored points', () => {
    const { surface, methodCalls } = makeSurface();
    drawScatter(surface, modelFor(spec()));
    expect(methodCalls('arc')).toBe(data.length);
    expect(methodCalls('fill')).toBe(data.length);
  });

  it('skips invalid point positions but keeps valid rows', () => {
    const { surface, methodCalls } = makeSurface();
    drawScatter(surface, modelFor(spec({ data: [...data, { x: Number.NaN, y: 9, size: 10, group: 'A' }, { x: 25, y: '', size: 3, group: 'B' }] })));
    expect(methodCalls('arc')).toBe(data.length);
  });

  it('uses a midpoint radius when size values have no extent', () => {
    const { surface, methodCalls } = makeSurface();
    drawScatter(surface, modelFor(spec({ data: data.slice(0, 3).map((d) => ({ ...d, size: 5 })) })));
    expect(methodCalls('arc')).toBe(3);
  });

  it('honors row-level emphasis alpha', () => {
    const { surface, alphas } = makeSurface();
    const model = modelFor(spec());
    model.emphasis = { dim: 0.3, match: (row) => row.group === 'A' };
    drawScatter(surface, model);
    expect(alphas()).toContain(0.21);
    expect(alphas()).toContain(0.3);
  });

  it('renders points in sketch mode', () => {
    const { surface, calls } = makeSurface();
    drawScatter(surface, modelFor(spec({ sketch: { seed: 12 } })));
    expect(calls()).toBeGreaterThan(0);
  });
});
