// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from 'vitest';
import { buildCartesianModel } from '../runtime/cartesian';
import { resolveTheme } from '../theme';
import { maxFinite, minFinite, verticalFill } from './fill';

beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext;
});

function fakeContext() {
  const stops: Array<[number, string]> = [];
  const gradient = { addColorStop(offset: number, color: string) { stops.push([offset, color]); } };
  const ctx = {
    createLinearGradient: (...args: number[]) => {
      void args;
      return gradient;
    },
  } as unknown as CanvasRenderingContext2D;
  return { ctx, gradient, stops };
}

describe('fill helpers', () => {
  it('computes finite minima and maxima with fallbacks', () => {
    expect(minFinite([], 42)).toBe(42);
    expect(maxFinite([Number.NaN, Infinity, -Infinity], -7)).toBe(-7);
    expect(minFinite([Number.NaN, 6, -2, 3], 0)).toBe(-2);
    expect(maxFinite([Number.NaN, 6, -2, 3], 0)).toBe(6);
  });

  it('builds a vertical gradient for parseable colors', () => {
    const { ctx, gradient, stops } = fakeContext();
    const fill = verticalFill(ctx, '#336699', 10, 80, 0.5, 0.1);
    expect(fill).toBe(gradient);
    expect(stops).toEqual([
      [0, 'rgba(51, 102, 153, 0.5)'],
      [1, 'rgba(51, 102, 153, 0.1)'],
    ]);
  });

  it('reverses alpha stops when top and bottom are inverted', () => {
    const { ctx, stops } = fakeContext();
    verticalFill(ctx, 'rgb(10, 20, 30)', 80, 10, 0.6, 0.2);
    expect(stops[0][1]).toBe('rgba(10, 20, 30, 0.2)');
    expect(stops[1][1]).toBe('rgba(10, 20, 30, 0.6)');
  });

  it('falls back to a flat fill for degenerate or unparseable colors', () => {
    const { ctx } = fakeContext();
    expect(verticalFill(ctx, '#336699', 25, 25, 0.4, 0)).toBe('rgba(51, 102, 153, 0.4)');
    expect(verticalFill(ctx, 'var(--series)', 10, 50, 0.4, 0)).toBe('var(--series)');
  });

  it('works with built cartesian geometry extrema', () => {
    const model = buildCartesianModel(
      {
        type: 'area',
        data: [
          { x: 'A', y: 1 },
          { x: 'B', y: 4 },
          { x: 'C', y: 2 },
        ],
        encoding: { x: { field: 'x' }, y: { field: 'y' } },
      },
      resolveTheme('light'),
      { width: 640, height: 400 },
    );
    const pixels = model.series[0].rows.map((row) => model.y.pixel(row.y));
    expect(minFinite(pixels, model.plot.y)).toBeLessThan(maxFinite(pixels, model.y.baseline));
  });
});
