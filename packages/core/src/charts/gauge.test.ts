// @vitest-environment jsdom
import { describe, it, expect, beforeAll } from 'vitest';
import type { ChartSpec, GaugeSpec } from '../spec/types';
import { validateSpec } from '../spec/validate';
import type { Surface } from '../render/surface';
import { resolveTheme } from '../theme';
import { drawGauge } from './gauge';

beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext;
});

const errPaths = (spec: ChartSpec) => validateSpec(spec).errors.map((e) => e.path);

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

describe('validateSpec — gauge', () => {
  it('accepts a literal-value gauge', () => {
    expect(validateSpec({ type: 'gauge', value: 72, max: 100 }).errors).toEqual([]);
  });

  it('requires max', () => {
    expect(errPaths({ type: 'gauge', value: 72 } as unknown as ChartSpec)).toContain('max');
  });

  it('requires value', () => {
    expect(errPaths({ type: 'gauge', max: 100 } as unknown as ChartSpec)).toContain('value');
  });
});

describe('drawGauge — smoke', () => {
  it('renders a literal value and emits formatted overlay text', () => {
    const { ctx, calls } = fakeContext();
    const surface = makeSurface(ctx);
    const spec: GaugeSpec = { type: 'gauge', value: 72, max: 100, format: ',.0f', title: 'Health score' };

    drawGauge(surface, spec, resolveTheme('light'), { width: 600, height: 400 });

    expect(calls()).toBeGreaterThan(0);
    expect(surface.overlay.textContent ?? '').toContain('72');
  });

  it('renders an aggregated field value with bands and supports hover', () => {
    const { ctx } = fakeContext();
    const surface = makeSurface(ctx);
    const spec: GaugeSpec = {
      type: 'gauge',
      data: [{ score: 70 }, { score: 80 }, { score: 90 }],
      value: { field: 'score', aggregate: 'mean' },
      max: 100,
      target: 85,
      bands: [{ to: 60 }, { to: 80 }, { to: 100 }],
      label: 'Average score',
    };

    const model = drawGauge(surface, spec, resolveTheme('light'), { width: 600, height: 400 });

    expect(model).toBeTruthy();
    expect(model?.hitTest(300, 190)).not.toBeNull();
  });
});
