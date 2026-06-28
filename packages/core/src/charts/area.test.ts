// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from 'vitest';
import type { Surface } from '../render/surface';
import { buildCartesianModel } from '../runtime/cartesian';
import { validateSpec } from '../spec/validate';
import type { AreaSpec } from '../spec/types';
import { resolveTheme } from '../theme';
import { drawArea } from './area';

beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext;
});

const data = [
  { month: '2024-01', value: 10, region: 'North' },
  { month: '2024-02', value: 16, region: 'North' },
  { month: '2024-03', value: '', region: 'North' },
  { month: '2024-04', value: 22, region: 'North' },
  { month: '2024-01', value: 4, region: 'South' },
  { month: '2024-02', value: 7, region: 'South' },
  { month: '2024-03', value: 12, region: 'South' },
  { month: '2024-04', value: 9, region: 'South' },
];

function spec(over: Partial<AreaSpec> = {}): AreaSpec {
  return {
    type: 'area',
    data,
    encoding: {
      x: { field: 'month', type: 'temporal' },
      y: { field: 'value' },
      series: { field: 'region' },
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

function modelFor(s: AreaSpec) {
  return buildCartesianModel(s, resolveTheme('light'), { width: 640, height: 400 });
}

describe('drawArea', () => {
  it('accepts area specs with insights and trendline fields', () => {
    expect(validateSpec(spec({ insights: true, trendline: { label: true } })).errors).toEqual([]);
  });

  it('renders overlapping single-series areas', () => {
    const { surface, calls, methodCalls } = makeSurface();
    const s = spec({ data: data.filter((d) => d.region === 'North'), encoding: { x: { field: 'month', type: 'temporal' }, y: { field: 'value' } } });
    drawArea(surface, modelFor(s));
    expect(calls()).toBeGreaterThan(0);
    expect(methodCalls('fill')).toBeGreaterThan(0);
    expect(methodCalls('stroke')).toBeGreaterThan(0);
  });

  it('renders stacked bands for multiple series', () => {
    const { surface, methodCalls } = makeSurface();
    drawArea(surface, modelFor(spec({ stack: true })));
    expect(methodCalls('fill')).toBeGreaterThanOrEqual(2);
  });

  it('honors series emphasis alpha', () => {
    const { surface, alphas } = makeSurface();
    const model = modelFor(spec());
    model.emphasis = { dim: 0.2, match: (row) => row.region === 'South' };
    drawArea(surface, model);
    expect(alphas()).toContain(0.2);
  });

  it('renders stacked areas in sketch mode', () => {
    const { surface, calls } = makeSurface();
    drawArea(surface, modelFor(spec({ stack: true, sketch: true })));
    expect(calls()).toBeGreaterThan(0);
  });
});
