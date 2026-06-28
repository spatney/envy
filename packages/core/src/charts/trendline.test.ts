// @vitest-environment jsdom
import { describe, it, expect, beforeAll } from 'vitest';
import { validateSpec } from '../spec/validate';
import type { ChartSpec, ScatterSpec } from '../spec/types';
import { buildCartesianModel } from '../runtime/cartesian';
import { resolveTheme } from '../theme';
import { crisp } from '../util/math';
import type { Surface } from '../render/surface';
import { drawTrendlines, drawTrendlineLabels } from './trendline';

beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = (() =>
    null) as typeof HTMLCanvasElement.prototype.getContext;
});

// --- Validation -----------------------------------------------------------

const scatterBase = {
  type: 'scatter' as const,
  data: [
    { x: 0, y: 1 },
    { x: 1, y: 3 },
    { x: 2, y: 5 },
    { x: 3, y: 7 },
  ],
  encoding: {
    x: { field: 'x', type: 'quantitative' as const },
    y: { field: 'y', type: 'quantitative' as const },
  },
};

const errPaths = (spec: ChartSpec) => validateSpec(spec).errors.map((e) => e.path);

describe('validateSpec — trendline', () => {
  it('accepts trendline: true on a scatter', () => {
    expect(validateSpec({ ...scatterBase, trendline: true } as ChartSpec).errors).toEqual([]);
  });

  it('accepts a trendline config object', () => {
    const spec = {
      ...scatterBase,
      trendline: { method: 'linear', groupBy: false, label: true, color: '#f00', strokeWidth: 3, strokeDash: [4, 4] },
    } as ChartSpec;
    expect(validateSpec(spec).errors).toEqual([]);
  });

  it('errors when trendline is not a boolean or object', () => {
    expect(errPaths({ ...scatterBase, trendline: 'yes' } as unknown as ChartSpec)).toContain('trendline');
  });

  it('annotates a bad method with a fix', () => {
    const res = validateSpec({ ...scatterBase, trendline: { method: 'lienar' } } as unknown as ChartSpec);
    const e = res.errors.find((x) => x.path === 'trendline.method');
    expect(e?.fix).toEqual([{ op: 'replace', path: '/trendline/method', value: 'linear' }]);
  });

  it('errors on a non-numeric strokeWidth and bad strokeDash', () => {
    const paths = errPaths({
      ...scatterBase,
      trendline: { strokeWidth: 'thick', strokeDash: ['a'] },
    } as unknown as ChartSpec);
    expect(paths).toContain('trendline.strokeWidth');
    expect(paths).toContain('trendline.strokeDash');
  });

  it('warns (not errors) when used on a band-axis chart (bar)', () => {
    const spec = {
      type: 'bar',
      data: [{ cat: 'a', val: 1 }],
      encoding: { x: { field: 'cat', type: 'nominal' }, y: { field: 'val' } },
      trendline: true,
    } as unknown as ChartSpec;
    const res = validateSpec(spec);
    expect(res.errors).toEqual([]);
    expect(res.warnings.some((w) => w.path === 'trendline')).toBe(true);
  });
});

// --- Geometry -------------------------------------------------------------

interface Recorder {
  moves: Array<[number, number]>;
  lines: Array<[number, number]>;
  strokes: number;
  lineCap: string;
  dash: number[];
}

function mockSurface(): { surface: Surface; rec: Recorder } {
  const rec: Recorder = { moves: [], lines: [], strokes: 0, lineCap: '', dash: [] };
  const ctx = {
    save() {},
    restore() {},
    beginPath() {},
    clip() {},
    rect() {},
    setLineDash(d: number[]) {
      rec.dash = d;
    },
    moveTo(x: number, y: number) {
      rec.moves.push([x, y]);
    },
    lineTo(x: number, y: number) {
      rec.lines.push([x, y]);
    },
    stroke() {
      rec.strokes++;
    },
    fill() {},
    arc() {},
    fillRect() {},
    set lineCap(v: string) {
      rec.lineCap = v;
    },
    globalAlpha: 1,
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
  };
  const surface = {
    marks: { ctx },
    overlay: document.createElement('div'),
    width: 400,
    height: 300,
  } as unknown as Surface;
  return { surface, rec };
}

function modelFrom(extra: Partial<ScatterSpec>) {
  const spec = { ...scatterBase, ...extra } as ScatterSpec;
  return buildCartesianModel(spec, resolveTheme('light'), { width: 400, height: 300 });
}

describe('drawTrendlines — geometry', () => {
  it('strokes the fitted line across the x-extent (y = 2x + 1)', () => {
    const model = modelFrom({ trendline: true });
    const { surface, rec } = mockSurface();
    drawTrendlines(surface, model);

    const x0 = model.x.pixel(0)!;
    const x3 = model.x.pixel(3)!;
    // Perfect fit → predict(0) = 1, predict(3) = 7.
    expect(rec.moves).toContainEqual([x0, crisp(model.y.pixel(1))]);
    expect(rec.lines).toContainEqual([x3, crisp(model.y.pixel(7))]);
    expect(rec.strokes).toBe(1);
    expect(rec.lineCap).toBe('round');
  });

  it('applies a custom strokeDash', () => {
    const model = modelFrom({ trendline: { strokeDash: [6, 3] } });
    const { surface, rec } = mockSurface();
    drawTrendlines(surface, model);
    expect(rec.dash).toEqual([6, 3]);
  });

  it('fits one line per series group when grouped', () => {
    const model = buildCartesianModel(
      {
        type: 'scatter',
        data: [
          { x: 0, y: 0, g: 'a' },
          { x: 1, y: 2, g: 'a' },
          { x: 0, y: 10, g: 'b' },
          { x: 1, y: 8, g: 'b' },
        ],
        encoding: {
          x: { field: 'x', type: 'quantitative' },
          y: { field: 'y', type: 'quantitative' },
          color: { field: 'g', type: 'nominal' },
        },
        trendline: true,
      } as ChartSpec,
      resolveTheme('light'),
      { width: 400, height: 300 },
    );
    const { surface, rec } = mockSurface();
    drawTrendlines(surface, model);
    expect(rec.strokes).toBe(2);
  });

  it('does nothing without a trendline', () => {
    const model = modelFrom({});
    const { surface, rec } = mockSurface();
    drawTrendlines(surface, model);
    expect(rec.strokes).toBe(0);
  });

  it('skips a band x-axis (no continuous regression)', () => {
    const model = buildCartesianModel(
      {
        type: 'bar',
        data: [
          { cat: 'a', val: 1 },
          { cat: 'b', val: 2 },
        ],
        encoding: { x: { field: 'cat', type: 'nominal' }, y: { field: 'val' } },
        trendline: true,
      } as unknown as ChartSpec,
      resolveTheme('light'),
      { width: 400, height: 300 },
    );
    const { surface, rec } = mockSurface();
    drawTrendlines(surface, model);
    expect(rec.strokes).toBe(0);
  });
});

describe('drawTrendlineLabels', () => {
  it('appends an R² overlay label when label is set', () => {
    const model = modelFrom({ trendline: { label: true } });
    const { surface } = mockSurface();
    drawTrendlineLabels(surface, model);
    const texts = Array.from(surface.overlay.children).map((c) => c.textContent);
    expect(texts).toContain('R\u00B2=1.00');
  });

  it('draws no label by default', () => {
    const model = modelFrom({ trendline: true });
    const { surface } = mockSurface();
    drawTrendlineLabels(surface, model);
    expect(surface.overlay.children.length).toBe(0);
  });
});
