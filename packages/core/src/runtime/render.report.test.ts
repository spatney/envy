// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { render } from './render';
import { repairReport, type RenderReport } from './report';
import type { BarSpec, ChartSpec, LineSpec } from '../spec/types';

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

const diagnostic = (spec: ChartSpec, code: string) => {
  const chart = render(mount(), spec);
  const report = chart.report();
  chart.destroy();
  const d = report.diagnostics.find((x) => x.code === code);
  expect(d).toBeDefined();
  return { report, d: d! };
};

function expectIdempotentRepair(spec: ChartSpec, report: RenderReport) {
  const once = repairReport(spec, report);
  const twice = repairReport(once.spec, report);
  expect(twice.spec).toEqual(once.spec);
  expect(once.applied.length).toBeGreaterThan(0);
  return once;
}

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
    expect(report.diagnostics.every((d) => d.fix === undefined)).toBe(true);
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

  it('attaches an x label rotation fix for axis label overlap', () => {
    const cats = Array.from({ length: 14 }, (_, i) => `Category label ${i + 1}`);
    const spec: BarSpec = {
      type: 'bar',
      dimensions: { width: 320, height: 240 },
      data: cats.map((cat, i) => ({ cat, v: i + 1 })),
      encoding: { x: { field: 'cat' }, y: { field: 'v' } },
      axes: { x: { labelAngle: 0 } },
    };
    const { report, d } = diagnostic(spec, 'axis-label-overlap');
    expect(d.fix).toEqual([{ op: 'replace', path: '/axes/x/labelAngle', value: 45 }]);
    const repaired = expectIdempotentRepair(spec, report);
    expect((repaired.spec as BarSpec).axes?.x?.labelAngle).toBe(45);
  });

  it('attaches a bottom legend-position fix for legend overflow', () => {
    const data = Array.from({ length: 12 }, (_, i) => i).flatMap((i) =>
      ['A', 'B', 'C'].map((x) => ({ x, y: i + 1, k: `series ${i + 1}` })),
    );
    const spec: LineSpec = {
      type: 'line',
      dimensions: { width: 520, height: 150 },
      data,
      encoding: { x: { field: 'x', type: 'nominal' }, y: { field: 'y' }, series: { field: 'k' } },
    };
    const { report, d } = diagnostic(spec, 'legend-overflow');
    expect(d.fix).toEqual([{ op: 'add', path: '/legend', value: { position: 'bottom' } }]);
    const repaired = expectIdempotentRepair(spec, report);
    expect((repaired.spec as LineSpec).legend).toEqual({ position: 'bottom' });
  });

  it('attaches a colorblind palette fix and hint for too many colors', () => {
    const data = Array.from({ length: 10 }, (_, i) => i).flatMap((i) =>
      ['A', 'B', 'C'].map((x) => ({ x, y: i + 1, k: `series ${i + 1}` })),
    );
    const spec: LineSpec = {
      type: 'line',
      dimensions: { width: 900, height: 600 },
      data,
      encoding: { x: { field: 'x', type: 'nominal' }, y: { field: 'y' }, series: { field: 'k' } },
    };
    const { report, d } = diagnostic(spec, 'too-many-colors');
    expect(d.fix).toEqual([{ op: 'add', path: '/palette', value: 'colorblind' }]);
    expect(d.hint).toContain('colorblind palette');
    const repaired = expectIdempotentRepair(spec, report);
    expect((repaired.spec as LineSpec).palette).toBe('colorblind');
  });

  it('removes a manual y domain when marks are clipped', () => {
    const spec: LineSpec = {
      type: 'line',
      dimensions: { width: 640, height: 400 },
      data: [{ x: 'A', v: 0 }, { x: 'B', v: 150 }],
      encoding: { x: { field: 'x', type: 'nominal' }, y: { field: 'v', scale: { domain: [0, 120] } } },
    };
    const { report, d } = diagnostic(spec, 'marks-clipped');
    expect(d.fix).toEqual([{ op: 'remove', path: '/encoding/y/scale/domain' }]);
    const repaired = expectIdempotentRepair(spec, report);
    expect((repaired.spec as LineSpec).encoding.y.scale?.domain).toBeUndefined();
  });
});
