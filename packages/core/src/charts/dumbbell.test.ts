// @vitest-environment jsdom
import { describe, it, expect, beforeAll } from 'vitest';
import { validateSpec } from '../spec/validate';
import type { ChartSpec, DumbbellSpec } from '../spec/types';
import { resolveTheme } from '../theme';
import type { Surface } from '../render/surface';
import { buildDumbbellModel } from '../runtime/dumbbell';
import { drawDumbbell } from './dumbbell';

beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = (() =>
    null) as typeof HTMLCanvasElement.prototype.getContext;
});

const rows = [
  { country: 'US', year: '2000', life: 76 },
  { country: 'US', year: '2020', life: 79 },
  { country: 'FR', year: '2000', life: 79 },
  { country: 'FR', year: '2020', life: 83 },
  { country: 'JP', year: '2000', life: 81 },
  { country: 'JP', year: '2020', life: 84 },
];

const dumbbellSpec = (over: Partial<DumbbellSpec> = {}): DumbbellSpec => ({
  type: 'dumbbell',
  data: rows,
  encoding: {
    category: { field: 'country' },
    value: { field: 'life' },
    group: { field: 'year' },
  },
  ...over,
});

const errPaths = (spec: ChartSpec) => validateSpec(spec).errors.map((e) => e.path);
const build = (spec: DumbbellSpec, w = 640, h = 400) => buildDumbbellModel(spec, resolveTheme('light'), { width: w, height: h });

// --- Validation -----------------------------------------------------------

describe('validateSpec — dumbbell', () => {
  it('accepts a basic dumbbell', () => {
    expect(validateSpec(dumbbellSpec()).errors).toEqual([]);
  });

  it('requires the group channel', () => {
    const spec = { ...dumbbellSpec(), encoding: {} } as unknown as ChartSpec;
    expect(errPaths(spec)).toContain('encoding.group');
  });

  it('rejects an invalid sort', () => {
    expect(errPaths(dumbbellSpec({ sort: 'bogus' as never }))).toContain('sort');
  });
});

// --- Model ----------------------------------------------------------------

describe('buildDumbbellModel', () => {
  it('builds one row per category with group dots and min/max values', () => {
    const model = build(dumbbellSpec());
    expect(model.rows).toHaveLength(3);
    expect(model.groups.map((g) => g.label)).toEqual(['2000', '2020']);
    expect(model.rows.every((row) => row.dots.length === 2)).toBe(true);
    const fr = model.rows.find((row) => row.catLabel === 'FR');
    expect(fr?.min).toBe(79);
    expect(fr?.max).toBe(83);
  });

  it('sorts by gap with the widest gap first', () => {
    const model = build(dumbbellSpec({ sort: 'gap' }));
    expect(model.rows[0].catLabel).toBe('FR');
  });

  it('sorts ascending by the first group value', () => {
    const model = build(dumbbellSpec({ sort: 'ascending' }));
    expect(model.rows.map((row) => row.catLabel)).toEqual(['US', 'FR', 'JP']);
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

describe('drawDumbbell — smoke', () => {
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

  it('renders without throwing and emits category labels', () => {
    const { surface, calls } = makeSurface();
    drawDumbbell(surface, dumbbellSpec(), resolveTheme('light'), { width: 640, height: 400 });
    expect(calls()).toBeGreaterThan(0);
    expect(surface.overlay.textContent ?? '').toContain('US');
  });

  it('emits value labels when labels are enabled', () => {
    const { surface } = makeSurface();
    drawDumbbell(surface, dumbbellSpec({ labels: true, format: ',d' }), resolveTheme('light'), { width: 640, height: 400 });
    expect(surface.overlay.textContent ?? '').toContain('76');
  });
});