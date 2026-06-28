// @vitest-environment jsdom
import { describe, it, expect, beforeAll } from 'vitest';
import { validateSpec } from '../spec/validate';
import type { FunnelSpec } from '../spec/types';
import { resolveTheme } from '../theme';
import type { Surface } from '../render/surface';
import { buildStages, drawFunnel, funnelPercents } from './funnel';

beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext;
});

const funnelSpec = (over: Partial<FunnelSpec> = {}): FunnelSpec => ({
  type: 'funnel',
  data: [
    { stage: 'Visited', users: 100 },
    { stage: 'Signed up', users: 50 },
    { stage: 'Purchased', users: 10 },
  ],
  encoding: { stage: { field: 'stage' }, value: { field: 'users' } },
  ...over,
});

describe('validateSpec — funnel', () => {
  it('accepts a basic funnel', () => {
    expect(validateSpec(funnelSpec()).errors).toEqual([]);
  });
});

describe('buildStages', () => {
  it('drops stages that aggregate to non-positive values', () => {
    const stages = buildStages(
      funnelSpec({
        data: [
          { stage: 'Zero', users: 0 },
          { stage: 'Negative', users: -4 },
          { stage: 'Positive', users: 10 },
          { stage: 'Cancelled', users: 3 },
          { stage: 'Cancelled', users: -3 },
        ],
      }),
      resolveTheme('light').color.palette,
    );

    expect(stages.map((stage) => [stage.label, stage.value])).toEqual([['Positive', 10]]);
  });
});

describe('funnelPercents', () => {
  it('returns finite first-mode percentages when the first stage is zero', () => {
    const percents = funnelPercents([{ value: 0 }, { value: 25 }], 'first');
    expect(percents).toEqual([0, 0]);
    expect(percents.every(Number.isFinite)).toBe(true);
  });

  it('returns finite previous-mode percentages when a predecessor is zero', () => {
    const percents = funnelPercents([{ value: 100 }, { value: 0 }, { value: 25 }], 'previous');
    expect(percents).toEqual([1, 0, 0]);
    expect(percents.every(Number.isFinite)).toBe(true);
  });
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

describe('drawFunnel — smoke', () => {
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

  it('renders after dropping a leading zero stage without emitting Infinity%', () => {
    const { surface, calls } = makeSurface();
    drawFunnel(
      surface,
      funnelSpec({
        data: [
          { stage: 'Zero', users: 0 },
          { stage: 'Later', users: 25 },
        ],
      }),
      resolveTheme('light'),
      { width: 640, height: 400 },
    );

    expect(calls()).toBeGreaterThan(0);
    const text = surface.overlay.textContent ?? '';
    expect(text).not.toContain('Infinity%');
    expect(text).not.toContain('NaN%');
    expect(text).toContain('100%');
  });

  it('hit-tests the remaining positive stage', () => {
    const { surface } = makeSurface();
    const model = drawFunnel(
      surface,
      funnelSpec({
        data: [
          { stage: 'Zero', users: 0 },
          { stage: 'Later', users: 25 },
        ],
      }),
      resolveTheme('light'),
      { width: 640, height: 400 },
    );

    const hover = model && 'hitTest' in model ? model.hitTest(320, 200) : null;
    expect(hover?.content.title).toBe('Later');
  });
});
