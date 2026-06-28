// @vitest-environment jsdom
import { describe, it, expect, beforeAll } from 'vitest';
import { validateSpec } from '../spec/validate';
import { lintSpec } from '../spec/lint';
import type { ChartSpec, ComboSpec } from '../spec/types';
import { resolveTheme } from '../theme';
import type { Surface } from '../render/surface';
import { buildComboModel } from '../runtime/combo';
import { drawCombo } from './combo';

beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = (() =>
    null) as typeof HTMLCanvasElement.prototype.getContext;
});

const DATA = [
  { month: 'Jan', revenue: 100, units: 5 },
  { month: 'Feb', revenue: 200, units: 9 },
  { month: 'Mar', revenue: 150, units: 7 },
];

const comboSpec = (over: Partial<ComboSpec> = {}): ComboSpec => ({
  type: 'combo',
  data: DATA,
  encoding: { x: { field: 'month' } },
  layers: [
    { mark: 'bar', encoding: { y: { field: 'revenue' } } },
    { mark: 'line', axis: 'right', encoding: { y: { field: 'units' } } },
  ],
  ...over,
});

const errPaths = (spec: ChartSpec) => validateSpec(spec).errors.map((e) => e.path);

// --- Validation -----------------------------------------------------------

describe('validateSpec — combo', () => {
  it('accepts a bar + line dual-axis combo', () => {
    expect(validateSpec(comboSpec()).errors).toEqual([]);
  });

  it('requires a layers array', () => {
    const { layers, ...rest } = comboSpec();
    void layers;
    expect(errPaths(rest as ChartSpec)).toContain('layers');
  });

  it('rejects an empty layers array', () => {
    expect(errPaths(comboSpec({ layers: [] }))).toContain('layers');
  });

  it('requires encoding.x', () => {
    const spec = { ...comboSpec(), encoding: {} } as unknown as ChartSpec;
    expect(errPaths(spec)).toContain('encoding.x');
  });

  it('annotates a misspelled mark with a fix', () => {
    const spec = comboSpec({ layers: [{ mark: 'lien', encoding: { y: { field: 'units' } } }] as never });
    const e = validateSpec(spec).errors.find((x) => x.path === 'layers[0].mark');
    expect(e?.fix).toEqual([{ op: 'replace', path: '/layers/0/mark', value: 'line' }]);
  });

  it('requires encoding.y on each layer', () => {
    const spec = comboSpec({ layers: [{ mark: 'line' }] as never });
    expect(errPaths(spec)).toContain('layers[0].encoding.y');
  });

  it('annotates a bad axis with a fix', () => {
    const spec = comboSpec({
      layers: [{ mark: 'line', axis: 'rihgt', encoding: { y: { field: 'units' } } }] as never,
    });
    const e = validateSpec(spec).errors.find((x) => x.path === 'layers[0].axis');
    expect(e?.fix).toEqual([{ op: 'replace', path: '/layers/0/axis', value: 'right' }]);
  });

  it('warns when a bar layer is paired with a quantitative x', () => {
    const spec = comboSpec({ encoding: { x: { field: 'month', type: 'quantitative' } } });
    expect(validateSpec(spec).warnings.some((w) => w.path === 'encoding.x')).toBe(true);
  });
});

// --- Lint -----------------------------------------------------------------

describe('lintSpec — combo dual-axis', () => {
  it('flags a dual-axis combo (info)', () => {
    const f = lintSpec(comboSpec()).find((x) => x.rule === 'combo-dual-axis');
    expect(f?.severity).toBe('info');
  });

  it('does not flag a single-axis combo', () => {
    const spec = comboSpec({
      layers: [
        { mark: 'bar', encoding: { y: { field: 'revenue' } } },
        { mark: 'line', encoding: { y: { field: 'units' } } },
      ],
    });
    expect(lintSpec(spec).some((x) => x.rule === 'combo-dual-axis')).toBe(false);
  });
});

// --- Model geometry -------------------------------------------------------

const build = (spec: ComboSpec, w = 600, h = 400) => buildComboModel(spec, resolveTheme('light'), { width: w, height: h });

describe('buildComboModel', () => {
  it('produces one model per layer sharing the plot + x scale', () => {
    const m = build(comboSpec());
    expect(m.layers).toHaveLength(2);
    expect(m.layers[0].model.plot).toBe(m.plot);
    expect(m.layers[1].model.plot).toBe(m.plot);
    // Single bar layer ⇒ no grouping offset ⇒ shares the combo x model.
    expect(m.layers[0].model.x).toBe(m.x);
    expect(m.layers[1].model.x).toBe(m.x);
  });

  it('gives left and right layers independent y-scales', () => {
    const m = build(comboSpec());
    expect(m.right).toBeDefined();
    // The same numeric value maps to different pixels on the two scales.
    const left = m.layers[0].model.y.pixel(8);
    const right = m.layers[1].model.y.pixel(8);
    expect(left).not.toBe(right);
  });

  it('reserves a right gutter, shrinking the plot vs a single-axis combo', () => {
    const withRight = build(comboSpec());
    const singleAxis = build(
      comboSpec({
        layers: [
          { mark: 'bar', encoding: { y: { field: 'revenue' } } },
          { mark: 'line', encoding: { y: { field: 'units' } } },
        ],
      }),
    );
    expect(withRight.plot.width).toBeLessThan(singleAxis.plot.width);
    expect(singleAxis.right).toBeUndefined();
  });

  it('emits one legend item per layer with a mark-appropriate symbol', () => {
    const m = build(comboSpec());
    expect(m.legendItems.map((l) => l.label)).toEqual(['revenue', 'units']);
    expect(m.legendItems.map((l) => l.symbol)).toEqual(['square', 'line']);
  });

  it('narrows and offsets multiple bar layers so they group side by side', () => {
    const m = build(
      comboSpec({
        layers: [
          { mark: 'bar', encoding: { y: { field: 'revenue' } } },
          { mark: 'bar', encoding: { y: { field: 'units' } } },
        ],
      }),
    );
    expect(m.layers[0].model.x.bandwidth).toBeCloseTo(m.x.bandwidth / 2);
    const a = m.layers[0].model.x.pixel('Feb');
    const b = m.layers[1].model.x.pixel('Feb');
    expect(a).not.toBe(b); // offset to either side of the category center
  });
});

// --- End-to-end draw smoke ------------------------------------------------

/** A no-op Canvas2D context that records that draw calls happened. */
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

describe('drawCombo — smoke', () => {
  it('renders without throwing and emits axis + legend text', () => {
    const { ctx, calls } = fakeContext();
    const surface = {
      marks: { ctx },
      overlay: document.createElement('div'),
      width: 600,
      height: 400,
    } as unknown as Surface;

    const result = drawCombo(surface, comboSpec(), resolveTheme('light'), { width: 600, height: 400 });

    expect(calls()).toBeGreaterThan(0);
    expect(result).toBeTruthy(); // an interaction model is returned
    const text = surface.overlay.textContent ?? '';
    expect(text).toContain('revenue'); // left legend
    expect(text).toContain('units'); // right legend
  });
});
