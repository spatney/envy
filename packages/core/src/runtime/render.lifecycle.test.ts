// @vitest-environment jsdom
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { render } from './render';
import type { BarSpec, LineSpec } from '../spec/types';

function fakeContext(): CanvasRenderingContext2D {
  const grad = { addColorStop() {} };
  const data: Record<string, unknown> = {
    canvas: { width: 640, height: 400 },
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

const barSpec = (over: Partial<BarSpec> = {}): BarSpec => ({
  type: 'bar',
  dimensions: { width: 420, height: 260, autoResize: false },
  data: [
    { category: 'A', value: 2 },
    { category: 'B', value: 5 },
    { category: 'C', value: 3 },
  ],
  encoding: { x: { field: 'category' }, y: { field: 'value' } },
  ...over,
});

const lineSpec = (): LineSpec => ({
  type: 'line',
  dimensions: { width: 420, height: 260, autoResize: false },
  data: [
    { month: '2024-01', value: 4 },
    { month: '2024-02', value: 7 },
  ],
  encoding: { x: { field: 'month', type: 'temporal' }, y: { field: 'value' } },
});

const mount = (width = 640, height = 400): HTMLElement => {
  const c = document.createElement('div');
  Object.defineProperty(c, 'clientWidth', { configurable: true, value: width });
  Object.defineProperty(c, 'clientHeight', { configurable: true, value: height });
  document.body.appendChild(c);
  return c;
};

let prevAnim: boolean | undefined;
let prevResizeObserver: typeof ResizeObserver | undefined;
beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = (() =>
    fakeContext()) as typeof HTMLCanvasElement.prototype.getContext;
  prevAnim = globalThis.__GRAPHEIN_DISABLE_ANIM;
  prevResizeObserver = globalThis.ResizeObserver;
  globalThis.__GRAPHEIN_DISABLE_ANIM = true;
});
afterAll(() => {
  globalThis.__GRAPHEIN_DISABLE_ANIM = prevAnim;
  globalThis.ResizeObserver = prevResizeObserver;
});

describe('render lifecycle', () => {
  it('mounts a surface, reports diagnostics, and exposes seeded selections', () => {
    const chart = render(
      mount(),
      barSpec({
        params: [{ name: 'picked', select: { type: 'point', fields: ['category'] }, value: { kind: 'point', fields: ['category'], tuples: [['B']] } }],
        highlight: { param: 'picked' },
      }),
    );

    expect(chart.surface.root.parentElement).toBeTruthy();
    expect(chart.surface.width).toBe(420);
    expect(chart.report()).toMatchObject({ type: 'bar', markCount: 3, ok: true });
    expect(chart.getSelection('picked')).toEqual({ kind: 'point', fields: ['category'], tuples: [['B']] });
    expect(chart.getSelection()).toEqual({ picked: { kind: 'point', fields: ['category'], tuples: [['B']] } });
    chart.destroy();
  });

  it('updates data and chart type while refreshing report and params', () => {
    const chart = render(mount(), barSpec());
    expect(chart.report().markCount).toBe(3);

    chart.update({
      ...barSpec({ data: [{ category: 'Only', value: 9 }] }),
      params: [{ name: 'category', select: { type: 'point', fields: ['category'] }, value: { kind: 'point', fields: ['category'], tuples: [['Only']] } }],
    });

    expect(chart.spec.type).toBe('bar');
    expect(chart.report().markCount).toBe(1);
    expect(chart.getSelection('category')).toEqual({ kind: 'point', fields: ['category'], tuples: [['Only']] });

    chart.update(lineSpec());
    expect(chart.spec.type).toBe('line');
    expect(chart.report()).toMatchObject({ type: 'line', markCount: 2 });
    chart.destroy();
  });

  it('resizes from container measurements when dimensions are implicit', () => {
    const c = mount(320, 180);
    const chart = render(c, {
      ...barSpec(),
      dimensions: undefined,
    });
    expect(chart.surface.width).toBe(320);
    Object.defineProperty(c, 'clientWidth', { configurable: true, value: 510 });
    Object.defineProperty(c, 'clientHeight', { configurable: true, value: 240 });
    chart.resize();
    expect(chart.surface.width).toBe(510);
    expect(chart.surface.height).toBe(240);
    chart.destroy();
  });

  it('auto-resizes with ResizeObserver and disconnects on destroy', () => {
    let observed: Element | undefined;
    let callback: ResizeObserverCallback | undefined;
    const disconnect = vi.fn();
    class StubResizeObserver {
      constructor(cb: ResizeObserverCallback) {
        callback = cb;
      }
      observe(el: Element) {
        observed = el;
      }
      disconnect = disconnect;
      unobserve() {}
      takeRecords(): ResizeObserverEntry[] {
        return [];
      }
    }
    globalThis.ResizeObserver = StubResizeObserver as unknown as typeof ResizeObserver;

    const c = mount(400, 220);
    const chart = render(c, { ...barSpec(), dimensions: undefined });
    expect(observed).toBe(c);
    expect(chart.surface.width).toBe(400);

    Object.defineProperty(c, 'clientWidth', { configurable: true, value: 720 });
    Object.defineProperty(c, 'clientHeight', { configurable: true, value: 360 });
    callback?.([] as unknown as ResizeObserverEntry[], {} as ResizeObserver);
    expect(chart.surface.width).toBe(720);
    expect(chart.surface.height).toBe(360);

    chart.destroy();
    expect(disconnect).toHaveBeenCalled();
    expect(c.children).toHaveLength(0);
  });

  it('cleans up host listeners and DOM on destroy', () => {
    const c = mount();
    const chart = render(c, barSpec({ highlight: { param: 'region' } }));
    const listener = vi.fn();
    chart.on('selectionchange', listener);
    chart.setSelection('region', { kind: 'set', field: 'region', values: ['West'] });
    expect(listener).toHaveBeenCalledTimes(1);

    chart.destroy();
    chart.store.set('region', { kind: 'set', field: 'region', values: ['East'] });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(c.children).toHaveLength(0);
  });
});
