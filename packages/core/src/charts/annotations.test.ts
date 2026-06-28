// @vitest-environment jsdom
import { describe, it, expect, beforeAll } from 'vitest';
import { validateSpec } from '../spec/validate';
import type { ChartSpec, LineSpec } from '../spec/types';
import { buildCartesianModel } from '../runtime/cartesian';
import { resolveTheme } from '../theme';
import { crisp } from '../util/math';
import type { Surface } from '../render/surface';
import { drawAnnotations, drawAnnotationLabels } from './annotations';

beforeAll(() => {
  // jsdom has no real 2D canvas context; return null so text measurement uses its
  // heuristic fallback without emitting a noisy "not implemented" warning.
  HTMLCanvasElement.prototype.getContext = (() =>
    null) as typeof HTMLCanvasElement.prototype.getContext;
});

// --- Validation -----------------------------------------------------------

const base = {
  type: 'line' as const,
  data: [
    { month: '2024-01', users: 10 },
    { month: '2024-02', users: 30 },
  ],
  encoding: { x: { field: 'month', type: 'temporal' as const }, y: { field: 'users' } },
};

const errPaths = (spec: ChartSpec) => validateSpec(spec).errors.map((e) => e.path);

describe('validateSpec — annotations', () => {
  it('accepts a reference line and a band', () => {
    const spec = {
      ...base,
      annotations: [
        { value: 20, label: 'Target' },
        { type: 'zone', from: 25, to: 30, color: '#f00' },
      ],
    } as ChartSpec;
    expect(validateSpec(spec).errors).toEqual([]);
  });

  it('errors when "annotations" is not an array', () => {
    expect(errPaths({ ...base, annotations: {} } as unknown as ChartSpec)).toContain('annotations');
  });

  it('requires a value for a line', () => {
    expect(errPaths({ ...base, annotations: [{ type: 'line' }] } as ChartSpec)).toContain('annotations[0].value');
  });

  it('requires from+to for a band', () => {
    expect(errPaths({ ...base, annotations: [{ type: 'band', from: 1 }] } as ChartSpec)).toContain('annotations[0]');
  });

  it('annotates a misspelled type with a fix', () => {
    const res = validateSpec({ ...base, annotations: [{ type: 'lien', value: 1 }] } as unknown as ChartSpec);
    const e = res.errors.find((x) => x.path === 'annotations[0].type');
    expect(e?.fix).toEqual([{ op: 'replace', path: '/annotations/0/type', value: 'line' }]);
  });

  it('validates the axis enum and label position', () => {
    const paths = errPaths({
      ...base,
      annotations: [{ value: 1, axis: 'z', labelPosition: 'top' }],
    } as unknown as ChartSpec);
    expect(paths).toContain('annotations[0].axis');
    expect(paths).toContain('annotations[0].labelPosition');
  });

  it('warns (not errors) when used on a non-cartesian chart', () => {
    const spec = {
      type: 'pie',
      data: [{ cat: 'a', val: 1 }],
      encoding: { theta: { field: 'val' }, color: { field: 'cat' } },
      annotations: [{ value: 1 }],
    } as unknown as ChartSpec;
    const res = validateSpec(spec);
    expect(res.errors).toEqual([]);
    expect(res.warnings.some((w) => w.path === 'annotations')).toBe(true);
  });

  it('accepts a point annotation with x and y', () => {
    const spec = { ...base, annotations: [{ type: 'point', x: '2024-01', y: 10, label: 'P' }] } as ChartSpec;
    expect(validateSpec(spec).errors).toEqual([]);
  });

  it('requires both x and y for a point', () => {
    expect(errPaths({ ...base, annotations: [{ type: 'point', x: '2024-01' }] } as ChartSpec)).toContain('annotations[0]');
  });
});

describe('validateSpec — insights', () => {
  it('accepts insights:true and an options object on a line', () => {
    expect(validateSpec({ ...base, insights: true } as ChartSpec).errors).toEqual([]);
    expect(validateSpec({ ...base, insights: { max: true, outliers: false } } as ChartSpec).errors).toEqual([]);
  });

  it('errors when insights is neither a boolean nor an object', () => {
    expect(errPaths({ ...base, insights: 5 } as unknown as ChartSpec)).toContain('insights');
  });

  it('errors when an option flag is not a boolean', () => {
    expect(errPaths({ ...base, insights: { max: 'yes' } } as unknown as ChartSpec)).toContain('insights.max');
  });

  it('warns (not errors) when used on a non-applicable chart', () => {
    const spec = {
      type: 'scatter',
      data: [{ x: 1, y: 2 }],
      encoding: { x: { field: 'x' }, y: { field: 'y' } },
      insights: true,
    } as unknown as ChartSpec;
    const res = validateSpec(spec);
    expect(res.errors).toEqual([]);
    expect(res.warnings.some((w) => w.path === 'insights')).toBe(true);
  });
});

// --- Drawing geometry -----------------------------------------------------

interface Recorder {
  moves: Array<[number, number]>;
  lines: Array<[number, number]>;
  rects: Array<[number, number, number, number]>;
  arcs: Array<[number, number, number]>;
  strokes: number;
  fills: number;
}

function mockSurface(): { surface: Surface; rec: Recorder } {
  const rec: Recorder = { moves: [], lines: [], rects: [], arcs: [], strokes: 0, fills: 0 };
  const ctx = {
    save() {},
    restore() {},
    beginPath() {},
    clip() {},
    rect() {},
    setLineDash() {},
    moveTo(x: number, y: number) {
      rec.moves.push([x, y]);
    },
    lineTo(x: number, y: number) {
      rec.lines.push([x, y]);
    },
    arc(x: number, y: number, r: number) {
      rec.arcs.push([x, y, r]);
    },
    stroke() {
      rec.strokes++;
    },
    fill() {
      rec.fills++;
    },
    fillRect(x: number, y: number, w: number, h: number) {
      rec.rects.push([x, y, w, h]);
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

function modelWith(annotations: LineSpec['annotations']) {
  const spec = { ...base, annotations } as LineSpec;
  return buildCartesianModel(spec, resolveTheme('light'), { width: 400, height: 300 });
}

function modelFromSpec(extra: Partial<LineSpec>) {
  const spec = { ...base, ...extra } as LineSpec;
  return buildCartesianModel(spec, resolveTheme('light'), { width: 400, height: 300 });
}

describe('drawAnnotations — geometry', () => {
  it('strokes a horizontal rule at the y-pixel of the value', () => {
    const model = modelWith([{ value: 20 }]);
    const { surface, rec } = mockSurface();
    drawAnnotations(surface, model);

    const expectedY = crisp(model.y.pixel(20));
    // A full-width horizontal segment: moveTo(plot.x, y) → lineTo(x1, y).
    expect(rec.moves.some(([, y]) => y === expectedY)).toBe(true);
    expect(rec.lines.some(([x, y]) => y === expectedY && x === model.plot.x + model.plot.width)).toBe(true);
    expect(rec.strokes).toBeGreaterThan(0);
  });

  it('fills a band rect spanning the plot width between from and to', () => {
    const model = modelWith([{ from: 10, to: 20 }]);
    const { surface, rec } = mockSurface();
    drawAnnotations(surface, model);

    const a = model.y.pixel(10);
    const b = model.y.pixel(20);
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    expect(rec.rects).toContainEqual([model.plot.x, lo, model.plot.width, hi - lo]);
  });

  it('does nothing when there are no annotations', () => {
    const model = modelWith(undefined);
    const { surface, rec } = mockSurface();
    drawAnnotations(surface, model);
    expect(rec.strokes).toBe(0);
    expect(rec.rects).toEqual([]);
  });

  it('draws a marker dot at the (x, y) of a point annotation', () => {
    const model = modelWith([{ type: 'point', x: '2024-02', y: 30, label: 'Peak' }]);
    const { surface, rec } = mockSurface();
    drawAnnotations(surface, model);

    const px = model.x.pixel('2024-02')!;
    const py = model.y.pixel(30);
    // A halo arc (r + 1.6) and the dot arc (r), both centered on the point.
    expect(rec.arcs.some(([x, y]) => x === px && y === py)).toBe(true);
    expect(rec.fills).toBeGreaterThanOrEqual(2);
  });
});

describe('auto-insights (spec.insights)', () => {
  it('expands insights:true into max and min point markers', () => {
    const model = modelFromSpec({ insights: true });
    const { surface, rec } = mockSurface();
    drawAnnotations(surface, model);

    const yMax = model.y.pixel(30);
    const yMin = model.y.pixel(10);
    expect(rec.arcs.some(([, y]) => y === yMax)).toBe(true);
    expect(rec.arcs.some(([, y]) => y === yMin)).toBe(true);
  });

  it('labels the auto markers with arrowed, formatted values', () => {
    const model = modelFromSpec({ insights: true });
    const { surface } = mockSurface();
    drawAnnotationLabels(surface, model);
    const text = surface.overlay.textContent ?? '';
    expect(text).toContain('\u25B2 30');
    expect(text).toContain('\u25BC 10');
  });

  it('adds no markers when insights is absent', () => {
    const model = modelFromSpec({});
    const { surface, rec } = mockSurface();
    drawAnnotations(surface, model);
    expect(rec.arcs).toEqual([]);
  });
});

describe('drawAnnotationLabels', () => {
  it('appends a label div to the overlay', () => {
    const model = modelWith([{ value: 20, label: 'Target' }]);
    const { surface } = mockSurface();
    drawAnnotationLabels(surface, model);
    expect(surface.overlay.textContent).toContain('Target');
  });

  it('skips annotations without a label', () => {
    const model = modelWith([{ value: 20 }]);
    const { surface } = mockSurface();
    drawAnnotationLabels(surface, model);
    expect(surface.overlay.children.length).toBe(0);
  });
});
