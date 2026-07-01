// @vitest-environment jsdom
import { describe, it, expect, beforeAll } from 'vitest';
import { resolveTheme, type ThemeTokens } from '../theme';
import type { BarSpec, LineSpec } from '../spec/types';
import { buildCartesianModel, type CartesianModel } from './cartesian';
import { buildRenderReport } from './report';

// Stub canvas so measureText falls back to its deterministic heuristic
// (length × size × 0.55) — label-overlap geometry is then reproducible.
beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = (() =>
    null) as typeof HTMLCanvasElement.prototype.getContext;
});

const tokens = (): ThemeTokens => resolveTheme();
const codes = (r: { diagnostics: { code: string }[] }): string[] =>
  r.diagnostics.map((d) => d.code);

const SIZE = { width: 640, height: 400 };

function barModel(spec: BarSpec, size = SIZE): CartesianModel {
  return buildCartesianModel(spec, tokens(), size);
}

/** A minimal model literal exposing only the fields the report reads. */
function fakeModel(over: Record<string, unknown> = {}): CartesianModel {
  const base = {
    series: [{ key: 's', label: 's', color: '#4f46e5', value: 's', rows: [{ v: 1 }] }],
    plot: { x: 50, y: 10, width: 300, height: 100 },
    x: {},
    y: { field: 'v', baseline: 110, scale: { domain: [0, 10] }, pixel: (v: number) => 110 - v },
    xTicks: [],
    yTicks: [
      { value: 0, pos: 110, label: '0' },
      { value: 10, pos: 10, label: '10' },
    ],
    frame: {},
  };
  return { ...base, ...over } as unknown as CartesianModel;
}

// --- Facts ----------------------------------------------------------------

describe('buildRenderReport — facts', () => {
  const spec: BarSpec = {
    type: 'bar',
    data: [
      { cat: 'A', v: 3 },
      { cat: 'B', v: 5 },
      { cat: 'C', v: 2 },
      { cat: 'D', v: 8 },
    ],
    encoding: { x: { field: 'cat' }, y: { field: 'v' } },
  };

  it('reports mark count, series, colors, and plot for a clean chart', () => {
    const r = buildRenderReport({ type: 'bar', spec, data: spec.data!, tokens: tokens(), size: SIZE, model: barModel(spec) });
    expect(r.markCount).toBe(4);
    expect(r.seriesCount).toBe(1);
    expect(r.colorCount).toBe(1);
    expect(r.plot).toBeDefined();
    expect(r.ok).toBe(true);
    expect(r.diagnostics).toEqual([]);
  });

  it('sums marks across series', () => {
    const multi: LineSpec = {
      type: 'line',
      data: [
        { x: 'A', y: 1, k: 'one' },
        { x: 'B', y: 2, k: 'one' },
        { x: 'A', y: 3, k: 'two' },
        { x: 'B', y: 4, k: 'two' },
      ],
      encoding: { x: { field: 'x', type: 'nominal' }, y: { field: 'y' }, series: { field: 'k' } },
    };
    const r = buildRenderReport({ type: 'line', spec: multi, data: multi.data!, tokens: tokens(), size: SIZE, model: buildCartesianModel(multi, tokens(), SIZE) });
    expect(r.markCount).toBe(4);
    expect(r.seriesCount).toBe(2);
  });
});

// --- Empty data / empty plot ----------------------------------------------

describe('buildRenderReport — empty states', () => {
  it('flags empty data', () => {
    const spec: BarSpec = { type: 'bar', data: [], encoding: { x: { field: 'cat' }, y: { field: 'v' } } };
    const r = buildRenderReport({ type: 'bar', spec, data: [], tokens: tokens(), size: SIZE, model: barModel(spec) });
    expect(codes(r)).toContain('empty-data');
    expect(r.ok).toBe(false);
  });

  it('flags a collapsed plot as an error', () => {
    const r = buildRenderReport({
      type: 'bar',
      spec: { type: 'bar', data: [{ v: 1 }], encoding: { x: { field: 'c' }, y: { field: 'v' } } },
      data: [{ v: 1 }],
      tokens: tokens(),
      size: { width: 10, height: 10 },
      model: fakeModel({ plot: { x: 5, y: 5, width: 0, height: 0 } }),
    });
    const empty = r.diagnostics.find((d) => d.code === 'empty-plot');
    expect(empty?.severity).toBe('error');
    expect(r.ok).toBe(false);
  });
});

// --- Axis label overlap ---------------------------------------------------

describe('buildRenderReport — axis label overlap', () => {
  it('warns when too many category labels share a narrow axis', () => {
    const cats = Array.from({ length: 14 }, (_, i) => `Category label ${i + 1}`);
    const spec: BarSpec = {
      type: 'bar',
      data: cats.map((c, i) => ({ cat: c, v: i + 1 })),
      encoding: { x: { field: 'cat' }, y: { field: 'v' } },
      axes: { x: { labelAngle: 0 } }, // force flat to exercise overlap detection
    };
    const size = { width: 320, height: 240 };
    const r = buildRenderReport({ type: 'bar', spec, data: spec.data!, tokens: tokens(), size, model: barModel(spec, size) });
    const d = r.diagnostics.find((x) => x.code === 'axis-label-overlap');
    expect(d).toBeDefined();
    expect(d?.axis).toBe('x');
  });

  it('auto-rotates dense category labels (45°) and reports no overlap', () => {
    const cats = Array.from({ length: 14 }, (_, i) => `Category label ${i + 1}`);
    const spec: BarSpec = {
      type: 'bar',
      data: cats.map((c, i) => ({ cat: c, v: i + 1 })),
      encoding: { x: { field: 'cat' }, y: { field: 'v' } },
    };
    const size = { width: 320, height: 240 };
    const model = barModel(spec, size);
    expect(model.frame.xLabelAngle).toBe(45);
    const r = buildRenderReport({ type: 'bar', spec, data: spec.data!, tokens: tokens(), size, model });
    expect(r.diagnostics.find((x) => x.code === 'axis-label-overlap')).toBeUndefined();
  });

  it('does not warn when labels fit', () => {
    const spec: BarSpec = {
      type: 'bar',
      data: [
        { cat: 'A', v: 1 },
        { cat: 'B', v: 2 },
        { cat: 'C', v: 3 },
      ],
      encoding: { x: { field: 'cat' }, y: { field: 'v' } },
    };
    const r = buildRenderReport({ type: 'bar', spec, data: spec.data!, tokens: tokens(), size: SIZE, model: barModel(spec) });
    expect(codes(r)).not.toContain('axis-label-overlap');
  });

  it('warns when horizontal category labels are vertically crowded', () => {
    const cats = Array.from({ length: 18 }, (_, i) => `Category ${i + 1}`);
    const spec: BarSpec = {
      type: 'bar',
      orientation: 'horizontal',
      data: cats.map((c, i) => ({ cat: c, v: i + 1 })),
      encoding: { x: { field: 'cat' }, y: { field: 'v' } },
    };
    const size = { width: 420, height: 170 };
    const r = buildRenderReport({ type: 'bar', spec, data: spec.data!, tokens: tokens(), size, model: barModel(spec, size) });
    const d = r.diagnostics.find((x) => x.code === 'axis-label-overlap');
    expect(d).toBeDefined();
    expect(d?.axis).toBe('x');
  });

  it('does not warn when horizontal category labels have vertical room', () => {
    const spec: BarSpec = {
      type: 'bar',
      orientation: 'horizontal',
      data: [
        { cat: 'A', v: 1 },
        { cat: 'B', v: 2 },
        { cat: 'C', v: 3 },
      ],
      encoding: { x: { field: 'cat' }, y: { field: 'v' } },
    };
    const r = buildRenderReport({ type: 'bar', spec, data: spec.data!, tokens: tokens(), size: SIZE, model: barModel(spec) });
    expect(codes(r)).not.toContain('axis-label-overlap');
  });
});

// --- Legend overflow ------------------------------------------------------

describe('buildRenderReport — legend overflow', () => {
  const manySeries = (n: number) => {
    const data = [];
    for (let i = 0; i < n; i++) {
      for (const x of ['A', 'B', 'C']) data.push({ x, y: i + 1, k: `series ${i + 1}` });
    }
    return data;
  };

  it('warns when a vertical legend is truncated to fit', () => {
    const spec: LineSpec = {
      type: 'line',
      data: manySeries(12),
      encoding: { x: { field: 'x', type: 'nominal' }, y: { field: 'y' }, series: { field: 'k' } },
    };
    const size = { width: 520, height: 150 };
    const r = buildRenderReport({ type: 'line', spec, data: spec.data!, tokens: tokens(), size, model: buildCartesianModel(spec, tokens(), size) });
    const d = r.diagnostics.find((x) => x.code === 'legend-overflow');
    expect(d).toBeDefined();
    expect((d?.details as { shown: number }).shown).toBeLessThan(12);
  });

  it('does not warn when the legend has room', () => {
    const spec: LineSpec = {
      type: 'line',
      data: manySeries(10),
      encoding: { x: { field: 'x', type: 'nominal' }, y: { field: 'y' }, series: { field: 'k' } },
    };
    const size = { width: 900, height: 600 };
    const r = buildRenderReport({ type: 'line', spec, data: spec.data!, tokens: tokens(), size, model: buildCartesianModel(spec, tokens(), size) });
    expect(codes(r)).not.toContain('legend-overflow');
    // 10 distinct colors → the "too many colors" advisory (info, doesn't flip ok).
    expect(codes(r)).toContain('too-many-colors');
    expect(r.ok).toBe(true);
  });
});

// --- Degenerate axis & clipped marks (synthetic models) -------------------

describe('buildRenderReport — degenerate axis', () => {
  it('warns when every y value is equal', () => {
    const r = buildRenderReport({
      type: 'line',
      spec: { type: 'line', data: [{ v: 5 }], encoding: { x: { field: 'x' }, y: { field: 'v' } } },
      data: [{ v: 5 }],
      tokens: tokens(),
      size: SIZE,
      model: fakeModel({
        y: { field: 'v', baseline: 60, scale: { domain: [5, 5] }, pixel: () => 60 },
        series: [{ key: 's', label: 's', color: '#4f46e5', value: 's', rows: [{ v: 5 }] }],
      }),
    });
    const d = r.diagnostics.find((x) => x.code === 'degenerate-axis');
    expect(d).toBeDefined();
    expect(d?.axis).toBe('y');
  });
});

describe('buildRenderReport — clipped marks', () => {
  it('warns when data falls outside the y range', () => {
    const r = buildRenderReport({
      type: 'line',
      spec: { type: 'line', data: [], encoding: { x: { field: 'x' }, y: { field: 'v' } } },
      data: [{ v: 0 }, { v: 150 }],
      tokens: tokens(),
      size: SIZE,
      model: fakeModel({
        series: [{ key: 's', label: 's', color: '#4f46e5', value: 's', rows: [{ v: 0 }, { v: 150 }] }],
        y: { field: 'v', baseline: 110, scale: { domain: [0, 120] }, pixel: (v: number) => 110 - v },
      }),
    });
    expect(codes(r)).toContain('marks-clipped');
  });

  it('does not warn for in-range horizontal bar values', () => {
    const spec: BarSpec = {
      type: 'bar',
      orientation: 'horizontal',
      data: [
        { cat: 'Very long category label A', v: 0 },
        { cat: 'Very long category label B', v: 25 },
        { cat: 'Very long category label C', v: 50 },
      ],
      encoding: { x: { field: 'cat' }, y: { field: 'v' } },
      axes: { y: { scale: { domain: [0, 50] } } },
    };
    const size = { width: 520, height: 80 };
    const model = barModel(spec, size);
    expect(model.y.pixel(0)).toBeGreaterThan(model.plot.y + model.plot.height);
    const r = buildRenderReport({ type: 'bar', spec, data: spec.data!, tokens: tokens(), size, model });
    expect(codes(r)).not.toContain('marks-clipped');
  });
});

// --- Contrast (generic, no-model path) ------------------------------------

describe('buildRenderReport — contrast', () => {
  it('warns about a near-invisible mark color', () => {
    const r = buildRenderReport({
      type: 'pie',
      spec: { type: 'pie', color: '#fefefe', data: [{ c: 'a', v: 1 }], encoding: { theta: { field: 'v' }, color: { field: 'c' } } } as never,
      data: [{ c: 'a', v: 1 }],
      tokens: tokens(), // light theme, white background
      size: SIZE,
    });
    const d = r.diagnostics.find((x) => x.code === 'low-contrast-mark');
    expect(d).toBeDefined();
    expect(d?.severity).toBe('warning');
  });

  it('does not flag the default palette against the default background', () => {
    const spec: LineSpec = {
      type: 'line',
      data: [
        { x: 'A', y: 1, k: 'one' },
        { x: 'B', y: 2, k: 'one' },
        { x: 'A', y: 5, k: 'two' },
        { x: 'B', y: 6, k: 'two' },
      ],
      encoding: { x: { field: 'x', type: 'nominal' }, y: { field: 'y' }, series: { field: 'k' } },
    };
    const r = buildRenderReport({ type: 'line', spec, data: spec.data!, tokens: tokens(), size: SIZE, model: buildCartesianModel(spec, tokens(), SIZE) });
    expect(codes(r)).not.toContain('low-contrast-mark');
    expect(codes(r)).not.toContain('low-contrast-text');
  });

  it('warns about illegible label text', () => {
    const t = tokens();
    const faded = { ...t, color: { ...t.color, textMuted: '#f4f4f4' } };
    const r = buildRenderReport({
      type: 'pie',
      spec: { type: 'pie', data: [{ c: 'a', v: 1 }] } as never,
      data: [{ c: 'a', v: 1 }],
      tokens: faded,
      size: SIZE,
    });
    expect(codes(r)).toContain('low-contrast-text');
  });
});

// --- ok flag --------------------------------------------------------------

describe('buildRenderReport — ok flag', () => {
  it('is false when any warning/error is present, true for info-only', () => {
    const warn = buildRenderReport({
      type: 'bar',
      spec: { type: 'bar', data: [], encoding: { x: { field: 'c' }, y: { field: 'v' } } },
      data: [],
      tokens: tokens(),
      size: SIZE,
      model: fakeModel(),
    });
    expect(warn.ok).toBe(false);
  });
});
