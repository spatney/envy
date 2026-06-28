// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from 'vitest';
import { createSelectionStore } from '../../interaction/store';
import { validateSpec } from '../../spec/validate';
import { resolveTheme } from '../../theme';
import type { Surface } from '../../render/surface';
import type { RenderContext } from '../index';
import { drawRange } from './range';

beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = (() => null) as any;
});

const tokens = resolveTheme('light');
const size = { width: 260, height: 100 };
const rows = [{ sales: 0 }, { sales: 10 }, { sales: 20 }, { sales: 30 }];

function fakeContext(): { ctx: CanvasRenderingContext2D; calls: () => number } {
  let count = 0;
  const data: Record<string, unknown> = {
    canvas: { width: 640, height: 400 },
    createLinearGradient: () => ({ addColorStop() {} }),
    createRadialGradient: () => ({ addColorStop() {} }),
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
    set: () => true,
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, calls: () => count };
}

function surface(): Surface {
  const { ctx } = fakeContext();
  return { marks: { ctx }, overlay: document.createElement('div'), width: size.width, height: size.height } as unknown as Surface;
}

function context(sourceData = rows, initial?: Record<string, any>): RenderContext & { store: ReturnType<typeof createSelectionStore> } {
  const store = createSelectionStore(initial);
  return { store, sourceData };
}

function expectValid(spec: unknown): void {
  const result = validateSpec(spec);
  expect(result.errors).toEqual([]);
  expect(result.valid).toBe(true);
}

describe('drawRange', () => {
  it('derives min/max from data, steps the low handle, and clears full extent', () => {
    const spec = { type: 'range', field: 'sales', data: rows, step: 10 } as const;
    expectValid(spec);
    const s = surface();
    const c = context();

    drawRange(s, spec, tokens, size, c);
    const thumbs = s.overlay.querySelectorAll('[role="slider"]');
    expect(thumbs[0].getAttribute('aria-valuemin')).toBe('0');
    expect(thumbs[0].getAttribute('aria-valuemax')).toBe('30');
    expect(thumbs[0].getAttribute('aria-valuenow')).toBe('0');
    expect(thumbs[1].getAttribute('aria-valuenow')).toBe('30');

    thumbs[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(c.store.get('sales')).toEqual({ kind: 'range', field: 'sales', min: 10, max: 30 });
    expect(s.overlay.querySelector('button[aria-label="Clear selection"]')).not.toBeNull();

    const clear = s.overlay.querySelector('button[aria-label="Clear selection"]')!;
    clear.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(c.store.get('sales')).toBeNull();
    expect(thumbs[0].getAttribute('aria-valuenow')).toBe('0');
    expect(thumbs[1].getAttribute('aria-valuenow')).toBe('30');
  });

  it('uses explicit bounds and an existing store range', () => {
    const spec = { type: 'range', field: 'sales', data: rows, min: 0, max: 100, step: 25 } as const;
    expectValid(spec);
    const s = surface();
    const c = context(rows, { sales: { kind: 'range', field: 'sales', min: 25, max: 75 } });

    drawRange(s, spec, tokens, size, c);
    const thumbs = s.overlay.querySelectorAll('[role="slider"]');
    expect(thumbs[0].getAttribute('aria-valuenow')).toBe('25');
    expect(thumbs[1].getAttribute('aria-valuenow')).toBe('75');

    thumbs[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    expect(c.store.get('sales')).toEqual({ kind: 'range', field: 'sales', min: 25, max: 50 });
  });

  it('shows an empty numeric-range notice for degenerate data', () => {
    const spec = { type: 'range', field: 'sales', data: [{ sales: 5 }] } as const;
    expectValid(spec);
    const s = surface();
    drawRange(s, spec, tokens, size, context([{ sales: 5 }]));

    expect(s.overlay.textContent).toContain('No numeric range for "sales".');
    expect(s.overlay.querySelector('[role="slider"]')).toBeNull();
  });
});
