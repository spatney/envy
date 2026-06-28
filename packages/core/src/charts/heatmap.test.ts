// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from 'vitest';
import { validateSpec } from '../spec/validate';
import type { ChartSpec, HeatmapSpec } from '../spec/types';
import type { Surface } from '../render/surface';
import { resolveTheme } from '../theme';
import { drawHeatmap, heatmapColorDomain } from './heatmap';

beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = (() =>
    null) as typeof HTMLCanvasElement.prototype.getContext;
});

const rows = [
  { x: 'A', y: 'B', v: Infinity },
  { x: 'A', y: 'C', v: 1 },
  { x: 'B', y: 'B', v: Number.NaN },
  { x: 'B', y: 'C', v: 5 },
];

const heatmapSpec = (over: Partial<HeatmapSpec> = {}): HeatmapSpec => ({
  type: 'heatmap',
  data: rows,
  encoding: {
    x: { field: 'x' },
    y: { field: 'y' },
    color: { field: 'v', title: 'Value' },
  },
  ...over,
});

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

function makeSurface(ctx: CanvasRenderingContext2D): Surface {
  return {
    marks: { ctx },
    overlay: document.createElement('div'),
    width: 640,
    height: 400,
  } as unknown as Surface;
}

describe('validateSpec — heatmap', () => {
  it('accepts a basic heatmap', () => {
    expect(validateSpec(heatmapSpec()).errors).toEqual([]);
  });

  it('requires the x, y, and color channels', () => {
    const paths = validateSpec({ ...heatmapSpec(), encoding: {} } as unknown as ChartSpec).errors.map((e) => e.path);
    expect(paths).toContain('encoding.x');
    expect(paths).toContain('encoding.y');
    expect(paths).toContain('encoding.color');
  });
});

describe('heatmapColorDomain', () => {
  it('excludes non-finite color values from the domain', () => {
    expect(heatmapColorDomain(rows, 'v')).toEqual([1, 5]);
  });

  it('returns null when no finite color values exist', () => {
    expect(heatmapColorDomain([{ x: 'A', y: 'B', v: Infinity }, { x: 'B', y: 'C', v: Number.NaN }], 'v')).toBeNull();
  });
});

describe('drawHeatmap — smoke', () => {
  it('renders finite cells without throwing and skips non-finite cells for hover', () => {
    const { ctx, calls } = fakeContext();
    const surface = makeSurface(ctx);
    const spec = heatmapSpec();

    const model = drawHeatmap(surface, spec, resolveTheme('light'), { width: 640, height: 400 });

    expect(calls()).toBeGreaterThan(0);
    expect(surface.overlay.textContent ?? '').toContain('15');
    expect(model).toBeTruthy();
    const finiteHit = model!.hitTest(model!.region.x + model!.region.width * 0.25, model!.region.y + model!.region.height * 0.75);
    expect(finiteHit?.content.rows[0]).toMatchObject({ label: 'Value', value: '1' });
    const missingHit = model!.hitTest(model!.region.x + model!.region.width * 0.25, model!.region.y + model!.region.height * 0.25);
    expect(missingHit).toBeNull();
  });
});
