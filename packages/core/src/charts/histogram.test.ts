// @vitest-environment jsdom
import { describe, it, expect, beforeAll } from 'vitest';
import { validateSpec } from '../spec/validate';
import { lintSpec } from '../spec/lint';
import type { ChartSpec, HistogramSpec } from '../spec/types';
import { resolveTheme } from '../theme';
import type { Surface } from '../render/surface';
import { buildHistogramModel } from '../runtime/histogram';
import { drawHistogram } from './histogram';

beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = (() =>
    null) as typeof HTMLCanvasElement.prototype.getContext;
});

const rows = (values: number[]) => values.map((v) => ({ v }));

const histSpec = (over: Partial<HistogramSpec> = {}): HistogramSpec => ({
  type: 'histogram',
  data: rows([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]),
  encoding: { x: { field: 'v' } },
  ...over,
});

const errPaths = (spec: ChartSpec) => validateSpec(spec).errors.map((e) => e.path);

// --- Validation -----------------------------------------------------------

describe('validateSpec — histogram', () => {
  it('accepts a basic histogram', () => {
    expect(validateSpec(histSpec()).errors).toEqual([]);
  });

  it('requires encoding.x', () => {
    const spec = { ...histSpec(), encoding: {} } as unknown as ChartSpec;
    expect(errPaths(spec)).toContain('encoding.x');
  });

  it('rejects a non-positive bin.maxbins', () => {
    expect(errPaths(histSpec({ bin: { maxbins: 0 } }))).toContain('bin.maxbins');
  });

  it('rejects a non-positive bin.step', () => {
    expect(errPaths(histSpec({ bin: { step: -2 } }))).toContain('bin.step');
  });

  it('rejects a reversed bin.extent', () => {
    expect(errPaths(histSpec({ bin: { extent: [10, 0] } }))).toContain('bin.extent');
  });

  it('rejects a non-boolean density', () => {
    const spec = histSpec({ density: 'yes' as never });
    expect(errPaths(spec)).toContain('density');
  });
});

// --- Lint -----------------------------------------------------------------

describe('lintSpec — histogram field type', () => {
  it('warns when the binned field is not quantitative', () => {
    const spec = histSpec({
      data: [{ v: 'a' }, { v: 'b' }, { v: 'a' }],
      encoding: { x: { field: 'v' } },
    });
    expect(lintSpec(spec).some((f) => f.rule === 'histogram-nonnumeric-field')).toBe(true);
  });

  it('does not warn for a numeric field', () => {
    expect(lintSpec(histSpec()).some((f) => f.rule === 'histogram-nonnumeric-field')).toBe(false);
  });
});

// --- Model geometry -------------------------------------------------------

const build = (spec: HistogramSpec, w = 600, h = 400) =>
  buildHistogramModel(spec, resolveTheme('light'), { width: w, height: h });

describe('buildHistogramModel', () => {
  it('tallies observations into evenly sized bins', () => {
    const m = build(histSpec({ bin: { step: 2, nice: false } }));
    expect(m.bins).toHaveLength(5);
    expect(m.bins.map((b) => b.count)).toEqual([2, 2, 2, 2, 2]);
    expect(m.bins[0].start).toBe(0);
    expect(m.bins[0].end).toBe(2);
    expect(m.bins[4].end).toBe(10);
  });

  it('includes the maximum value in the last bin (right-closed edge)', () => {
    const m = build(histSpec({ data: rows([0, 5, 10]), bin: { step: 5, nice: false } }));
    expect(m.bins).toHaveLength(2);
    expect(m.bins[0].count).toBe(1); // just 0
    expect(m.bins[1].count).toBe(2); // 5 and the edge value 10
  });

  it('honors an explicit step over the auto bin count', () => {
    const auto = build(histSpec());
    const stepped = build(histSpec({ bin: { step: 2, nice: false } }));
    expect(stepped.bins).toHaveLength(5);
    expect(stepped.bins.length).not.toBe(auto.bins.length);
  });

  it('normalizes to a density whose area sums to 1', () => {
    const m = build(histSpec({ bin: { step: 2, nice: false }, density: true }));
    const area = m.bins.reduce((s, b) => s + b.value * (b.end - b.start), 0);
    expect(area).toBeCloseTo(1);
  });

  it('maps the domain edges to the plot edges with a y=0 baseline', () => {
    const m = build(histSpec({ bin: { step: 2, nice: false } }));
    expect(m.xPixel(0)).toBeCloseTo(m.plot.x);
    expect(m.xPixel(10)).toBeCloseTo(m.plot.x + m.plot.width);
    expect(m.yBaseline).toBeCloseTo(m.plot.y + m.plot.height);
    expect(m.yPixel(2)).toBeLessThan(m.yBaseline); // a non-empty bar rises above 0
  });
});

// --- End-to-end draw smoke ------------------------------------------------

function fakeContext(): { ctx: CanvasRenderingContext2D; calls: () => number } {
  let count = 0;
  const grad = { addColorStop() {} };
  const data: Record<string, unknown> = {
    canvas: { width: 600, height: 400 },
    createLinearGradient: () => grad,
    createRadialGradient: () => grad,
    measureText: (t: string) => ({ width: String(t).length * 6 }),
    setLineDash() {},
  };
  const ctx = new Proxy(data, {
    get(t, prop: string) {
      if (prop in t) return t[prop];
      return (...args: unknown[]) => {
        void args;
        count++;
        return undefined;
      };
    },
    set() {
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, calls: () => count };
}

describe('drawHistogram — smoke', () => {
  it('renders without throwing and emits an axis title', () => {
    const { ctx, calls } = fakeContext();
    const surface = {
      marks: { ctx },
      overlay: document.createElement('div'),
      width: 600,
      height: 400,
    } as unknown as Surface;

    drawHistogram(surface, histSpec({ bin: { step: 2, nice: false } }), resolveTheme('light'), {
      width: 600,
      height: 400,
    });

    expect(calls()).toBeGreaterThan(0);
    expect(surface.overlay.textContent ?? '').toContain('Count'); // default y-axis title
  });
});
