// @vitest-environment jsdom
import { describe, it, expect, beforeAll } from 'vitest';
import { validateSpec } from '../spec/validate';
import type { ChartSpec, SlopeSpec } from '../spec/types';
import { resolveTheme } from '../theme';
import type { Surface } from '../render/surface';
import { buildSlopeModel } from '../runtime/slope';
import { drawSlope } from './slope';

beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = (() =>
    null) as typeof HTMLCanvasElement.prototype.getContext;
});

const rows = [
  { year: '2019', team: 'A', wins: 12 },
  { year: '2024', team: 'A', wins: 18 },
  { year: '2019', team: 'B', wins: 22 },
  { year: '2024', team: 'B', wins: 16 },
];

const slopeSpec = (over: Partial<SlopeSpec> = {}): SlopeSpec => ({
  type: 'slope',
  data: rows,
  encoding: {
    x: { field: 'year' },
    y: { field: 'wins' },
    series: { field: 'team' },
  },
  ...over,
});

const errPaths = (spec: ChartSpec) => validateSpec(spec).errors.map((e) => e.path);

// --- Validation -----------------------------------------------------------

describe('validateSpec — slope', () => {
  it('accepts a basic slope', () => {
    expect(validateSpec(slopeSpec()).errors).toEqual([]);
  });

  it('requires the series channel', () => {
    const spec = { ...slopeSpec(), encoding: {} } as unknown as ChartSpec;
    const paths = errPaths(spec);
    expect(paths).toContain('encoding.series');
  });
});

// --- Model geometry -------------------------------------------------------

const build = (spec: SlopeSpec, w = 640, h = 400) =>
  buildSlopeModel(spec, resolveTheme('light'), { width: w, height: h });

describe('buildSlopeModel', () => {
  it('groups rows into series with points at the right categories and spans the y data', () => {
    const m = build(slopeSpec());
    expect(m.categories).toEqual(['2019', '2024']);
    expect(m.series).toHaveLength(2);
    expect(m.series.map((s) => s.points.map((p) => p.catKey))).toEqual([
      ['2019', '2024'],
      ['2019', '2024'],
    ]);
    expect(m.series[0].points.map((p) => p.value)).toEqual([12, 18]);
    expect(m.base.y.scale.map(22)).toBeLessThan(m.base.y.scale.map(12));
  });

  it('colors rising and falling series by change when requested', () => {
    const tokens = resolveTheme('light');
    const m = buildSlopeModel(slopeSpec({ colorByChange: true }), tokens, { width: 640, height: 400 });
    expect(m.series.find((s) => s.key === 'A')?.color).toBe(tokens.color.positive);
    expect(m.series.find((s) => s.key === 'B')?.color).toBe(tokens.color.negative);
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

describe('drawSlope — smoke', () => {
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

  it('renders without throwing and emits direct series labels', () => {
    const { surface, calls } = makeSurface();
    drawSlope(surface, slopeSpec(), resolveTheme('light'), { width: 640, height: 400 });
    expect(calls()).toBeGreaterThan(0);
    const text = surface.overlay.textContent ?? '';
    expect(text).toContain('A');
  });

  it('hides direct labels when labels:false', () => {
    const { surface } = makeSurface();
    drawSlope(surface, slopeSpec({ labels: false }), resolveTheme('light'), {
      width: 640,
      height: 400,
    });
    const text = surface.overlay.textContent ?? '';
    expect(text).not.toContain('A');
  });
});
