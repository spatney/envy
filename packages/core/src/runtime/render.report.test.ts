// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { render } from './render';
import type { BarSpec } from '../spec/types';

// A permissive Canvas2D stub so render() can mount a real Surface in jsdom.
function fakeContext(): CanvasRenderingContext2D {
  const grad = { addColorStop() {} };
  const data: Record<string, unknown> = {
    canvas: { width: 640, height: 400 },
    createLinearGradient: () => grad,
    createRadialGradient: () => grad,
    measureText: (t: string) => ({ width: String(t).length * 6 }),
    setLineDash() {},
  };
  return new Proxy(data, {
    get(t, prop: string) {
      if (prop in t) return t[prop];
      return () => undefined;
    },
    set() {
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
}

let prevAnim: boolean | undefined;
beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = (() =>
    fakeContext()) as typeof HTMLCanvasElement.prototype.getContext;
  prevAnim = globalThis.__GRAPHEIN_DISABLE_ANIM;
  globalThis.__GRAPHEIN_DISABLE_ANIM = true; // report computed synchronously
});
afterAll(() => {
  globalThis.__GRAPHEIN_DISABLE_ANIM = prevAnim;
});

const mount = (): HTMLElement => {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return el;
};

describe('render().report() — end to end', () => {
  it('exposes a populated report after the first draw', () => {
    const spec: BarSpec = {
      type: 'bar',
      dimensions: { width: 640, height: 400 },
      data: [
        { cat: 'A', v: 3 },
        { cat: 'B', v: 5 },
        { cat: 'C', v: 8 },
      ],
      encoding: { x: { field: 'cat' }, y: { field: 'v' } },
    };
    const chart = render(mount(), spec);
    const report = chart.report();
    expect(report.type).toBe('bar');
    expect(report.markCount).toBe(3);
    expect(report.plot).toBeDefined();
    expect(report.ok).toBe(true);
    expect(report.summary).toBe('C is the largest at 8 (50% of the 16 total), A the smallest at 3.');
    chart.destroy();
  });

  it('reports diagnostics for an empty dataset', () => {
    const spec: BarSpec = {
      type: 'bar',
      dimensions: { width: 640, height: 400 },
      data: [],
      encoding: { x: { field: 'cat' }, y: { field: 'v' } },
    };
    const chart = render(mount(), spec);
    const report = chart.report();
    expect(report.diagnostics.map((d) => d.code)).toContain('empty-data');
    expect(report.ok).toBe(false);
    chart.destroy();
  });

  it('refreshes the report on update()', () => {
    const el = mount();
    const chart = render(el, {
      type: 'bar',
      dimensions: { width: 640, height: 400 },
      data: [{ cat: 'A', v: 1 }],
      encoding: { x: { field: 'cat' }, y: { field: 'v' } },
    } as BarSpec);
    expect(chart.report().markCount).toBe(1);
    chart.update({
      type: 'bar',
      dimensions: { width: 640, height: 400 },
      data: [
        { cat: 'A', v: 1 },
        { cat: 'B', v: 2 },
      ],
      encoding: { x: { field: 'cat' }, y: { field: 'v' } },
    } as BarSpec);
    expect(chart.report().markCount).toBe(2);
    chart.destroy();
  });

  it('renders transform output (not raw rows) when there is no cross-filter', () => {
    const spec: BarSpec = {
      type: 'bar',
      dimensions: { width: 640, height: 400 },
      data: [
        { region: 'West', amount: 120 },
        { region: 'West', amount: 95 },
        { region: 'East', amount: 80 },
        { region: 'North', amount: 0 },
      ],
      transform: [
        { filter: { field: 'amount', gt: 0 } },
        { aggregate: [{ op: 'sum', field: 'amount', as: 'revenue' }], groupby: ['region'] },
      ],
      encoding: { x: { field: 'region' }, y: { field: 'revenue' } },
    };
    const chart = render(mount(), spec);
    // Filter drops North(0), then sum-by-region → 2 bars; the model must reflect
    // the transformed rows, not the 4 raw ones.
    expect(chart.report().markCount).toBe(2);
    chart.destroy();
  });
});
