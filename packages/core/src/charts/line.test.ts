// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from 'vitest';
import type { Surface } from '../render/surface';
import { buildCartesianModel, type CartesianChartSpec } from '../runtime/cartesian';
import { validateSpec } from '../spec/validate';
import type { CurveType, LineSpec } from '../spec/types';
import { resolveTheme } from '../theme';
import { drawLine } from './line';

beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext;
});

const rows = [
  { month: '2024-01', value: 10, region: 'North' },
  { month: '2024-02', value: 18, region: 'North' },
  { month: '2024-03', value: null, region: 'North' },
  { month: '2024-04', value: 24, region: 'North' },
  { month: '2024-01', value: 6, region: 'South' },
  { month: '2024-02', value: 12, region: 'South' },
  { month: '2024-03', value: 16, region: 'South' },
  { month: '2024-04', value: 14, region: 'South' },
];

function spec(over: Partial<LineSpec> = {}): LineSpec {
  return {
    type: 'line',
    data: rows,
    encoding: {
      x: { field: 'month', type: 'temporal' },
      y: { field: 'value', title: 'Revenue' },
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

function modelFor(s: LineSpec) {
  return buildCartesianModel(s, resolveTheme('light'), { width: 640, height: 400 });
}

describe('drawLine', () => {
  it('accepts a rich line spec with trendline and insights options', () => {
    expect(validateSpec(spec({ trendline: true, insights: true }) as CartesianChartSpec).errors).toEqual([]);
  });

  it('renders a multi-series line with gaps', () => {
    const { surface, calls, methodCalls } = makeSurface();
    drawLine(surface, modelFor(spec()));
    expect(calls()).toBeGreaterThan(0);
    expect(methodCalls('stroke')).toBeGreaterThanOrEqual(2);
  });

  it.each<CurveType>(['linear', 'monotone', 'step', 'stepBefore', 'stepAfter', 'catmullRom'])('renders %s curves', (curve) => {
    const { surface, calls } = makeSurface();
    drawLine(surface, modelFor(spec({ curve })));
    expect(calls()).toBeGreaterThan(0);
  });

  it('renders area fill and point markers', () => {
    const { surface, methodCalls } = makeSurface();
    drawLine(surface, modelFor(spec({ area: true, points: true })));
    expect(methodCalls('fill')).toBeGreaterThan(0);
    expect(methodCalls('arc')).toBeGreaterThan(0);
  });

  it('renders a single-point series as a point marker even without points:true', () => {
    const { surface, methodCalls } = makeSurface();
    drawLine(
      surface,
      modelFor({ ...spec({ data: [{ month: '2024-01', value: 5 }] }), encoding: { x: { field: 'month', type: 'temporal' }, y: { field: 'value' } } }),
    );
    expect(methodCalls('arc')).toBeGreaterThan(0);
  });

  it('honors series emphasis by dimming non-matching series', () => {
    const { surface, alphas } = makeSurface();
    const model = modelFor(spec());
    model.emphasis = { dim: 0.25, match: (row) => row.region === 'North' };
    drawLine(surface, model);
    expect(alphas()).toContain(0.25);
  });

  it('uses the sketch rendering branch for filled lines and markers', () => {
    const { surface, calls } = makeSurface();
    drawLine(surface, modelFor(spec({ area: true, points: true, sketch: { seed: 7 } })));
    expect(calls()).toBeGreaterThan(0);
  });
});
