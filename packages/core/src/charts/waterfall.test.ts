// @vitest-environment jsdom
import { describe, it, expect, beforeAll } from 'vitest';
import { validateSpec } from '../spec/validate';
import type { ChartSpec, WaterfallSpec } from '../spec/types';
import { resolveTheme } from '../theme';
import type { Surface } from '../render/surface';
import { buildWaterfallModel } from '../runtime/waterfall';
import { drawWaterfall } from './waterfall';

beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = (() =>
    null) as typeof HTMLCanvasElement.prototype.getContext;
});

const steps = [
  { stage: 'Start', delta: 100 },
  { stage: 'Q1', delta: 50 },
  { stage: 'Q2', delta: -30 },
  { stage: 'Q3', delta: 20 },
];

const wfSpec = (over: Partial<WaterfallSpec> = {}): WaterfallSpec => ({
  type: 'waterfall',
  data: steps,
  encoding: { stage: { field: 'stage' }, value: { field: 'delta' } },
  ...over,
});

const errPaths = (spec: ChartSpec) => validateSpec(spec).errors.map((e) => e.path);

// --- Validation -----------------------------------------------------------

describe('validateSpec — waterfall', () => {
  it('accepts a basic waterfall', () => {
    expect(validateSpec(wfSpec()).errors).toEqual([]);
  });

  it('requires the stage and value channels', () => {
    const spec = { ...wfSpec(), encoding: {} } as unknown as ChartSpec;
    const paths = errPaths(spec);
    expect(paths).toContain('encoding.stage');
    expect(paths).toContain('encoding.value');
  });

  it('rejects a non-array totals', () => {
    expect(errPaths(wfSpec({ totals: 'Q2' as never }))).toContain('totals');
  });

  it('rejects non-string totals entries', () => {
    expect(errPaths(wfSpec({ totals: [2 as never] }))).toContain('totals');
  });

  it('rejects a non-boolean showTotal', () => {
    expect(errPaths(wfSpec({ showTotal: 'yes' as never }))).toContain('showTotal');
  });

  it('rejects a negative cornerRadius', () => {
    expect(errPaths(wfSpec({ cornerRadius: -3 }))).toContain('cornerRadius');
  });
});

// --- Model geometry -------------------------------------------------------

const build = (spec: WaterfallSpec, w = 640, h = 400) =>
  buildWaterfallModel(spec, resolveTheme('light'), { width: w, height: h });

describe('buildWaterfallModel', () => {
  it('floats each bar from the running total to its new level', () => {
    const m = build(wfSpec());
    expect(m.bars.map((b) => b.cumulative)).toEqual([100, 150, 120, 140]);
    expect(m.bars.map((b) => [b.base, b.top])).toEqual([
      [0, 100],
      [100, 150],
      [150, 120],
      [120, 140],
    ]);
  });

  it('colors steps by direction (increase vs decrease)', () => {
    const m = build(wfSpec());
    expect(m.bars.map((b) => b.kind)).toEqual(['increase', 'increase', 'decrease', 'increase']);
  });

  it('labels steps with the signed delta', () => {
    const m = build(wfSpec());
    expect(m.bars.map((b) => b.displayValue)).toEqual([100, 50, -30, 20]);
  });

  it('draws a stage named in `totals` as an absolute bar from the baseline', () => {
    const m = build(
      wfSpec({
        data: [
          { stage: 'A', delta: 100 },
          { stage: 'B', delta: 50 },
          { stage: 'Subtotal', delta: 0 },
        ],
        totals: ['Subtotal'],
      }),
    );
    const sub = m.bars[2];
    expect(sub.kind).toBe('total');
    expect(sub.base).toBe(0);
    expect(sub.top).toBe(150);
    expect(sub.displayValue).toBe(150);
  });

  it('appends a grand-total bar when showTotal is set', () => {
    const m = build(wfSpec({ showTotal: true, totalLabel: 'End' }));
    expect(m.bars).toHaveLength(5);
    const total = m.bars[4];
    expect(total.kind).toBe('total');
    expect(total.label).toBe('End');
    expect(total.base).toBe(0);
    expect(total.top).toBe(140);
    expect(total.stageValue).toBeUndefined(); // synthetic — not selectable
  });

  it('covers the zero baseline in the y domain and places it in the plot', () => {
    const m = build(wfSpec());
    const baseline = m.base.y.scale.map(0);
    expect(baseline).toBeGreaterThanOrEqual(m.plot.y - 0.5);
    expect(baseline).toBeLessThanOrEqual(m.plot.y + m.plot.height + 0.5);
    // A positive level sits above (smaller pixel y than) the baseline.
    expect(m.base.y.scale.map(140)).toBeLessThan(baseline);
  });

  it('joins consecutive bars with a connector at the running level', () => {
    const m = build(wfSpec());
    expect(m.connectors).toHaveLength(m.bars.length - 1);
    expect(m.connectors[0].y).toBeCloseTo(m.base.y.scale.map(m.bars[0].cumulative));
    expect(m.connectors[0].x1).toBeLessThanOrEqual(m.connectors[0].x2);
  });
});

// --- End-to-end draw smoke ------------------------------------------------

function fakeContext(): { ctx: CanvasRenderingContext2D; calls: () => number } {
  let count = 0;
  const grad = { addColorStop() {} };
  const data: Record<string, unknown> = {
    canvas: { width: 640, height: 400 },
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

describe('drawWaterfall — smoke', () => {
  const makeSurface = () => {
    const { ctx, calls } = fakeContext();
    const surface = {
      marks: { ctx },
      overlay: document.createElement('div'),
      width: 640,
      height: 400,
    } as unknown as Surface;
    return { surface, calls };
  };

  it('renders without throwing and emits signed value labels', () => {
    const { surface, calls } = makeSurface();
    drawWaterfall(surface, wfSpec(), resolveTheme('light'), { width: 640, height: 400 });
    expect(calls()).toBeGreaterThan(0);
    const text = surface.overlay.textContent ?? '';
    expect(text).toContain('+100');
    expect(text).toContain('-30');
  });

  it('hit-tests a bar and reports its running total', () => {
    const { surface } = makeSurface();
    const model = drawWaterfall(surface, wfSpec(), resolveTheme('light'), {
      width: 640,
      height: 400,
    });
    expect(model).toBeTruthy();
    const geo = build(wfSpec());
    const r = geo.bars[1].rect;
    const hover = model && 'hitTest' in model ? model.hitTest(r.x + r.width / 2, r.y + r.height / 2) : null;
    expect(hover?.content.title).toBe('Q1');
    expect(hover?.content.rows.some((row) => row.label === 'running total')).toBe(true);
  });

  it('hides value labels when labels:false', () => {
    const { surface } = makeSurface();
    drawWaterfall(surface, wfSpec({ labels: false }), resolveTheme('light'), {
      width: 640,
      height: 400,
    });
    const text = surface.overlay.textContent ?? '';
    expect(text).not.toContain('+100');
  });
});
