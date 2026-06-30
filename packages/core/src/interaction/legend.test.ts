// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { render } from '../runtime/render';
import { buildCartesianModel } from '../runtime/cartesian';
import { resolveTheme } from '../theme';
import { buildCartesianInteraction } from './cartesian';
import type { LineSpec } from '../spec/types';

function fakeContext(): CanvasRenderingContext2D {
  const grad = { addColorStop() {} };
  const data: Record<string, unknown> = {
    canvas: { width: 360, height: 240 },
    createLinearGradient: () => grad,
    createRadialGradient: () => grad,
    measureText: (t: string) => ({ width: String(t).length * 6 }),
    setLineDash() {},
  };
  return new Proxy(data, {
    get(t, prop: string) {
      if (prop in t) return t[prop];
      return () => undefined;
    },
    set() {
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
}

const spec = (interactive = true): LineSpec => ({
  type: 'line',
  dimensions: { width: 360, height: 240, autoResize: false },
  data: [
    { month: 'Jan', value: 10, region: 'North' },
    { month: 'Feb', value: 12, region: 'North' },
    { month: 'Jan', value: 6, region: 'South' },
    { month: 'Feb', value: 8, region: 'South' },
  ],
  encoding: { x: { field: 'month' }, y: { field: 'value' }, series: { field: 'region' } },
  legend: interactive ? { interactive: true, param: 'visibleRegion' } : undefined,
});

function mount(): HTMLElement {
  const c = document.createElement('div');
  Object.defineProperty(c, 'clientWidth', { configurable: true, value: 360 });
  Object.defineProperty(c, 'clientHeight', { configurable: true, value: 240 });
  document.body.appendChild(c);
  return c;
}

beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = (() =>
    fakeContext()) as typeof HTMLCanvasElement.prototype.getContext;
  globalThis.__GRAPHEIN_DISABLE_ANIM = true;
});

afterEach(() => {
  document.body.replaceChildren();
});

describe('interactive legend selections', () => {
  it('exposes full-item hit regions (swatch + label) with the series key', () => {
    const model = buildCartesianModel(spec(), resolveTheme(), { width: 360, height: 240 });
    const interaction = buildCartesianInteraction(model);
    expect(interaction?.legendHits?.map((h) => h.key)).toEqual(['North', 'South']);
    const first = interaction!.legendHits![0];
    // The rect spans the whole item (swatch + gap + label), not just the chip,
    // so the label text is clickable. Label "North" measures ~30px in the fake ctx.
    expect(first.rect.width).toBeGreaterThan(20);
    expect(first.value).toBe('North');
  });

  it('omits legend hit regions unless legend.interactive is true', () => {
    const model = buildCartesianModel(spec(false), resolveTheme(), { width: 360, height: 240 });
    expect(buildCartesianInteraction(model)?.legendHits).toBeUndefined();
  });

  it('publishes visible-series sets and supports isolate clicks', () => {
    const chart = render(mount(), spec());
    const model = buildCartesianModel(spec(), resolveTheme(), { width: 360, height: 240 });
    const north = model.legendHits![0];
    const south = model.legendHits![1];

    chart.surface.root.dispatchEvent(new MouseEvent('click', {
      bubbles: true,
      clientX: south.rect.x + 1,
      clientY: south.rect.y + 1,
    }));
    expect(chart.getSelection('visibleRegion')).toEqual({
      kind: 'set',
      field: 'region',
      values: ['North'],
    });

    chart.surface.root.dispatchEvent(new MouseEvent('click', {
      bubbles: true,
      shiftKey: true,
      clientX: south.rect.x + 1,
      clientY: south.rect.y + 1,
    }));
    expect(chart.getSelection('visibleRegion')).toEqual({
      kind: 'set',
      field: 'region',
      values: ['South'],
    });

    chart.surface.root.dispatchEvent(new MouseEvent('click', {
      bubbles: true,
      altKey: true,
      clientX: south.rect.x + 1,
      clientY: south.rect.y + 1,
    }));
    expect(chart.getSelection('visibleRegion')).toBeNull();

    chart.surface.root.dispatchEvent(new MouseEvent('click', {
      bubbles: true,
      clientX: north.rect.x + 1,
      clientY: north.rect.y + 1,
    }));
    expect(chart.getSelection('visibleRegion')).toEqual({
      kind: 'set',
      field: 'region',
      values: ['South'],
    });
    chart.destroy();
  });

  it('toggles when the legend label text is clicked, not just the swatch', () => {
    const chart = render(mount(), spec());
    const model = buildCartesianModel(spec(), resolveTheme(), { width: 360, height: 240 });
    const south = model.legendHits![1];
    // Click near the right edge of the hit region — over the label text, well
    // past the ~11px color swatch.
    expect(south.rect.width).toBeGreaterThan(20);
    chart.surface.root.dispatchEvent(new MouseEvent('click', {
      bubbles: true,
      clientX: south.rect.x + south.rect.width - 2,
      clientY: south.rect.y + south.rect.height / 2,
    }));
    expect(chart.getSelection('visibleRegion')).toEqual({
      kind: 'set',
      field: 'region',
      values: ['North'],
    });
    chart.destroy();
  });
});
