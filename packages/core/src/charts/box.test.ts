// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from 'vitest';
import type { Surface } from '../render/surface';
import { buildCartesianModel } from '../runtime/cartesian';
import type { BoxSpec } from '../spec/types';
import { validateSpec } from '../spec/validate';
import { resolveTheme } from '../theme';
import { buildBoxInteraction, computeBoxes, computeStats, drawBox } from './box';

beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = (() =>
    null) as typeof HTMLCanvasElement.prototype.getContext;
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

const baseRows = [1, 2, 3, 4, 100].map((value) => ({ category: 'X', value }));

const boxSpec = (over: Partial<BoxSpec> = {}): BoxSpec => ({
  type: 'box',
  data: baseRows,
  encoding: {
    x: { field: 'category', type: 'nominal' },
    y: { field: 'value', type: 'quantitative' },
  },
  ...over,
});

const build = (spec: BoxSpec, w = 640, h = 400) =>
  buildCartesianModel(spec, resolveTheme('light'), { width: w, height: h });

describe('box stats and geometry', () => {
  it('validates a basic box spec and computes Tukey quartiles/outliers', () => {
    expect(validateSpec(boxSpec()).errors).toEqual([]);
    const stats = computeStats([1, 2, 3, 4, 100], 'tukey');
    expect(stats).toEqual({
      min: 1,
      q1: 2,
      median: 3,
      q3: 4,
      max: 4,
      outliers: [100],
      count: 5,
    });

    const layout = computeBoxes(build(boxSpec()));
    expect(layout?.geoms[0].stats.q1).toBe(2);
    expect(layout?.geoms[0].stats.outliers).toEqual([100]);
  });

  it('draws without throwing', () => {
    const { ctx, calls } = fakeContext();
    const surface = {
      marks: { ctx },
      overlay: document.createElement('div'),
      width: 640,
      height: 400,
    } as unknown as Surface;
    drawBox(surface, build(boxSpec()));
    expect(calls()).toBeGreaterThan(0);
  });
});

describe('box interaction', () => {
  it('hit-tests a Tukey outlier point as the owning box', () => {
    const model = build(boxSpec());
    const layout = computeBoxes(model);
    const geom = layout!.geoms[0];
    const interaction = buildBoxInteraction(model);
    const hover = interaction?.hitTest(geom.cx, model.y.pixel(100));
    expect(hover).not.toBeNull();
    expect(hover?.content.title).toBe('X');
    expect(hover?.content.rows.some((row) => row.label === 'Outliers')).toBe(true);
  });

  it('includes the series field in grouped box picks', () => {
    const rows = [
      ...[1, 2, 3, 4, 100].map((value) => ({ category: 'X', group: 'A', value })),
      ...[10, 11, 12, 13, 14].map((value) => ({ category: 'X', group: 'B', value })),
    ];
    const spec = boxSpec({
      data: rows,
      encoding: {
        x: { field: 'category', type: 'nominal' },
        y: { field: 'value', type: 'quantitative' },
        series: { field: 'group', type: 'nominal' },
      },
    });
    const model = build(spec);
    const geom = computeBoxes(model)!.geoms.find((g) => g.seriesValue === 'A')!;
    const pick = buildBoxInteraction(model)?.pick?.(geom.cx, (geom.top + geom.bottom) / 2);
    expect(pick).toEqual({ kind: 'point', fields: ['category', 'group'], tuples: [['X', 'A']] });
  });
});
