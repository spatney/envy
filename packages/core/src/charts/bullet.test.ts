// @vitest-environment jsdom
import { describe, expect, it, beforeAll } from 'vitest';
import { validateSpec } from '../spec/validate';
import type { ChartSpec } from '../spec/types';
import { resolveTheme } from '../theme';
import type { Surface } from '../render/surface';
import { bulletValueToX, drawBullet } from './bullet';

beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext;
});

const errPaths = (spec: ChartSpec) => validateSpec(spec).errors.map((e) => e.path);

describe('validateSpec — bullet', () => {
  it('accepts a basic bullet graph', () => {
    expect(validateSpec({ type: 'bullet', value: 72, target: 90, ranges: [50, 75, 100] }).errors).toEqual([]);
  });

  it('requires value', () => {
    expect(errPaths({ type: 'bullet' } as unknown as ChartSpec)).toContain('value');
  });

  it('rejects non-array ranges', () => {
    expect(errPaths({ type: 'bullet', value: 72, ranges: 100 } as unknown as ChartSpec)).toContain('ranges');
  });
});

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

function makeSurface(ctx: CanvasRenderingContext2D): Surface {
  return {
    marks: { ctx },
    overlay: document.createElement('div'),
    width: 600,
    height: 400,
  } as unknown as Surface;
}

describe('drawBullet — smoke', () => {
  it('renders a literal value and overlays the formatted value', () => {
    const { ctx, calls } = fakeContext();
    const surface = makeSurface(ctx);

    drawBullet(
      surface,
      { type: 'bullet', value: 72, target: 90, ranges: [50, 75, 100], format: ',.0f' },
      resolveTheme('light'),
      { width: 600, height: 400 },
    );

    expect(calls()).toBeGreaterThan(0);
    expect(surface.overlay.textContent ?? '').toContain('72');
  });

  it('renders an aggregated field value and exposes track hit testing', () => {
    const { ctx } = fakeContext();
    const surface = makeSurface(ctx);

    const model = drawBullet(
      surface,
      {
        type: 'bullet',
        data: [{ sales: 20 }, { sales: 30 }, { sales: 22 }],
        value: { field: 'sales', aggregate: 'sum' },
        target: 90,
        ranges: [50, 75, 100],
        label: 'Sales',
      },
      resolveTheme('light'),
      { width: 600, height: 400 },
    );

    expect(model?.hitTest(300, 180)).not.toBeNull();
  });
});

describe('bulletValueToX', () => {
  it('maps domain edges to the track edges', () => {
    const track = { x: 120, y: 40, width: 300, height: 32 };
    expect(bulletValueToX(0, 0, 100, track)).toBe(track.x);
    expect(bulletValueToX(100, 0, 100, track)).toBe(track.x + track.width);
  });
});
