// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from 'vitest';
import { buildCartesianModel } from '../runtime/cartesian';
import { resolveTheme } from '../theme';
import { buildCartesianInteraction, tooltipEnabled } from './cartesian';

beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext;
});

function fakeContext(): { ctx: CanvasRenderingContext2D; calls: () => number; methodCalls: (name: string) => number } {
  let count = 0;
  const methods = new Map<string, number>();
  const data: Record<PropertyKey, unknown> = { setLineDash() {}, globalAlpha: 1 };
  const ctx = new Proxy(data, {
    get(t, prop: PropertyKey) {
      if (prop in t) return t[prop];
      return (...args: unknown[]) => {
        void args;
        count++;
        methods.set(String(prop), (methods.get(String(prop)) ?? 0) + 1);
        return undefined;
      };
    },
    set(t, prop: PropertyKey, value: unknown) {
      t[prop] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, calls: () => count, methodCalls: (name) => methods.get(name) ?? 0 };
}

const tokens = resolveTheme('light');
const HIT_RADIUS = 26;

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

describe('cartesian interaction hit-testing', () => {
  it('respects tooltip disabled settings', () => {
    expect(tooltipEnabled({ type: 'line', tooltip: false } as never)).toBe(false);
    expect(tooltipEnabled({ type: 'line', tooltip: { show: false } } as never)).toBe(false);
    expect(tooltipEnabled({ type: 'line' } as never)).toBe(true);
  });

  it('uses shared-x index hover for lines and picks the nearest x value', () => {
    const model = buildCartesianModel(
      {
        type: 'line',
        data: [
          { month: 'Jan', value: 10, region: 'North' },
          { month: 'Feb', value: 20, region: 'North' },
          { month: 'Jan', value: 6, region: 'South' },
          { month: 'Feb', value: 14, region: 'South' },
        ],
        encoding: { x: { field: 'month' }, y: { field: 'value' }, series: { field: 'region' } },
      },
      tokens,
      { width: 640, height: 400 },
    );
    const interaction = buildCartesianInteraction(model);
    expect(interaction).not.toBeNull();
    const febX = model.x.pixel('Feb')!;
    const hover = interaction!.hitTest(febX + 3, model.y.pixel(18));
    expect(hover?.key).toBe('Feb');
    expect(hover?.content.title).toBe('Feb');
    expect(hover?.content.rows.map((r) => r.label)).toEqual(['North', 'South']);
    expect(hover?.content.rows.some((r) => r.strong)).toBe(true);
    expect(interaction!.pick?.(febX, model.y.pixel(18))).toEqual({ kind: 'point', fields: ['month'], tuples: [['Feb']] });

    const { ctx, calls, methodCalls } = fakeContext();
    hover?.draw?.(ctx);
    expect(calls()).toBeGreaterThan(0);
    expect(methodCalls('arc')).toBeGreaterThan(0);
  });

  it('uses a category band highlight for bar charts', () => {
    const model = buildCartesianModel(
      {
        type: 'bar',
        data: [
          { category: 'A', value: 3 },
          { category: 'B', value: 7 },
        ],
        encoding: { x: { field: 'category' }, y: { field: 'value' } },
      },
      tokens,
      { width: 640, height: 400 },
    );
    const interaction = buildCartesianInteraction(model)!;
    const hover = interaction.hitTest(model.x.pixel('A')!, model.y.pixel(3));
    expect(hover?.content.rows[0].label).toBe('value');
    const { ctx, methodCalls } = fakeContext();
    hover?.draw?.(ctx);
    expect(methodCalls('fillRect')).toBe(1);
  });

  it('uses the vertical category axis for horizontal bar hover', () => {
    const model = buildCartesianModel(
      {
        type: 'bar',
        orientation: 'horizontal',
        data: [
          { category: 'A', value: 3 },
          { category: 'B', value: 7 },
          { category: 'C', value: 5 },
        ],
        encoding: { x: { field: 'category' }, y: { field: 'value' } },
      },
      tokens,
      { width: 640, height: 400 },
    );
    const interaction = buildCartesianInteraction(model)!;
    const pointerX = model.x.pixel('A')!;
    const categoryY = model.x.pixel('B')!;
    const hover = interaction.hitTest(pointerX, categoryY);

    expect(hover?.key).toBe('B');
    expect(hover?.content.title).toBe('B');
    expect(hover?.anchorX).toBe(pointerX);
    expect(hover?.anchorY).toBeCloseTo(categoryY);
    expect(interaction.pick?.(pointerX, categoryY)).toEqual({ kind: 'point', fields: ['category'], tuples: [['B']] });
  });

  it('returns null outside the plot or for disabled tooltips', () => {
    const model = buildCartesianModel(
      {
        type: 'line',
        tooltip: false,
        data: [{ x: 1, y: 2 }],
        encoding: { x: { field: 'x', type: 'quantitative' }, y: { field: 'y' } },
      },
      tokens,
      { width: 640, height: 400 },
    );
    expect(buildCartesianInteraction(model)).toBeNull();

    const enabled = buildCartesianModel(
      { ...model.spec, tooltip: true },
      tokens,
      { width: 640, height: 400 },
    );
    expect(buildCartesianInteraction(enabled)!.hitTest(enabled.plot.x - 20, enabled.plot.y - 20)).toBeNull();
  });

  it('uses nearest-point hover for scatter and includes size payloads', () => {
    const model = buildCartesianModel(
      {
        type: 'scatter',
        data: [
          { x: 1, y: 2, size: 5, group: 'A' },
          { x: 4, y: 8, size: 20, group: 'B' },
        ],
        encoding: {
          x: { field: 'x', type: 'quantitative', title: 'X' },
          y: { field: 'y', title: 'Y' },
          size: { field: 'size', title: 'Bubble' },
          color: { field: 'group' },
        },
      },
      tokens,
      { width: 640, height: 400 },
    );
    const interaction = buildCartesianInteraction(model)!;
    const px = model.x.pixel(4)!;
    const py = model.y.pixel(8);
    const hover = interaction.hitTest(px + 1, py + 1);
    expect(hover?.content.title).toBe('B');
    expect(hover?.content.rows.map((r) => r.label)).toEqual(['X', 'Y', 'Bubble']);
    expect(interaction.pick?.(px, py)).toEqual({ kind: 'point', fields: ['group'], tuples: [['B']] });
    expect(interaction.hitTest(model.plot.x - 40, model.plot.y - 40)).toBeNull();

    const { ctx, methodCalls } = fakeContext();
    hover?.draw?.(ctx);
    expect(methodCalls('arc')).toBe(2);
  });

  it('matches brute-force nearest scatter hit-testing over random points and queries', () => {
    const rand = rng(12345);
    const data = Array.from({ length: 1200 }, (_, i) => ({
      x: rand() * 1000,
      y: rand() * 1000,
      id: i,
    }));
    const model = buildCartesianModel(
      {
        type: 'scatter',
        data,
        encoding: { x: { field: 'x', type: 'quantitative' }, y: { field: 'y' } },
      },
      tokens,
      { width: 800, height: 500 },
    );
    const interaction = buildCartesianInteraction(model)!;
    const points = model.series.flatMap((s) =>
      s.rows.map((row) => ({
        px: model.x.pixel(row.x)!,
        py: model.y.pixel(row.y),
      })),
    );
    const brute = (px: number, py: number): number => {
      if (
        px < model.plot.x - HIT_RADIUS ||
        px > model.plot.x + model.plot.width + HIT_RADIUS ||
        py < model.plot.y - HIT_RADIUS ||
        py > model.plot.y + model.plot.height + HIT_RADIUS
      ) {
        return -1;
      }
      let best = -1;
      let bestSq = HIT_RADIUS * HIT_RADIUS;
      for (let i = 0; i < points.length; i++) {
        const dx = points[i].px - px;
        const dy = points[i].py - py;
        const sq = dx * dx + dy * dy;
        if (sq <= bestSq) {
          bestSq = sq;
          best = i;
        }
      }
      return best;
    };

    for (let i = 0; i < 400; i++) {
      const px = model.plot.x - HIT_RADIUS + rand() * (model.plot.width + HIT_RADIUS * 2);
      const py = model.plot.y - HIT_RADIUS + rand() * (model.plot.height + HIT_RADIUS * 2);
      const expected = brute(px, py);
      const hover = interaction.hitTest(px, py);
      expect(hover?.key ?? '-1').toBe(String(expected));
    }
    expect(interaction.hitTest(model.plot.x - HIT_RADIUS - 1, model.plot.y + model.plot.height / 2)).toBeNull();
  });

  it('picks x/y tuples for single-series scatter charts', () => {
    const model = buildCartesianModel(
      {
        type: 'scatter',
        data: [{ x: 2, y: 5 }],
        encoding: { x: { field: 'x', type: 'quantitative' }, y: { field: 'y' } },
      },
      tokens,
      { width: 640, height: 400 },
    );
    const interaction = buildCartesianInteraction(model)!;
    expect(interaction.pick?.(model.x.pixel(2)!, model.y.pixel(5))).toEqual({ kind: 'point', fields: ['x', 'y'], tuples: [[2, 5]] });
  });

  it('returns no model when there are no hit-testable rows', () => {
    const model = buildCartesianModel(
      {
        type: 'scatter',
        data: [{ x: Number.NaN, y: 1 }],
        encoding: { x: { field: 'x', type: 'quantitative' }, y: { field: 'y' } },
      },
      tokens,
      { width: 640, height: 400 },
    );
    expect(buildCartesianInteraction(model)).toBeNull();
  });
});
