// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createSelectionStore } from '../../interaction/store';
import { validateSpec } from '../../spec/validate';
import { resolveTheme } from '../../theme';
import type { Surface } from '../../render/surface';
import type { RenderContext } from '../index';
import { drawSearch } from './search';

beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = (() => null) as any;
});

afterEach(() => {
  vi.useRealTimers();
});

const tokens = resolveTheme('light');
const size = { width: 240, height: 80 };
const rows = [{ customer: 'Ada' }, { customer: 'Grace' }];

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

function context(initial?: Record<string, any>): RenderContext & { store: ReturnType<typeof createSelectionStore> } {
  const store = createSelectionStore(initial);
  return { store, sourceData: rows };
}

function expectValid(spec: unknown): void {
  const result = validateSpec(spec);
  expect(result.errors).toEqual([]);
  expect(result.valid).toBe(true);
}

describe('drawSearch', () => {
  it('debounces typing, trims query, and publishes a text selection', () => {
    vi.useFakeTimers();
    const spec = { type: 'search', field: 'customer', data: rows, debounce: 50 } as const;
    expectValid(spec);
    const s = surface();
    const c = context();

    drawSearch(s, spec, tokens, size, c);
    const input = s.overlay.querySelector('input[type="search"]') as HTMLInputElement;
    expect(input.placeholder).toBe('Search customer…');
    expect(input.getAttribute('aria-label')).toBe('customer');

    input.value = '  Ada  ';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(c.store.get('customer')).toBeNull();
    vi.advanceTimersByTime(49);
    expect(c.store.get('customer')).toBeNull();
    vi.advanceTimersByTime(1);
    expect(c.store.get('customer')).toEqual({ kind: 'text', field: 'customer', query: 'Ada' });
    expect(s.overlay.querySelector('button[aria-label="Clear selection"]')).not.toBeNull();
  });

  it('publishes immediately on Enter and clear removes the selection', () => {
    vi.useFakeTimers();
    const spec = { type: 'search', field: 'customer', data: rows, placeholder: 'Find', debounce: 200 } as const;
    expectValid(spec);
    const s = surface();
    const c = context();

    drawSearch(s, spec, tokens, size, c);
    const input = s.overlay.querySelector('input') as HTMLInputElement;
    expect(input.placeholder).toBe('Find');

    input.value = 'Grace';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(c.store.get('customer')).toEqual({ kind: 'text', field: 'customer', query: 'Grace' });
    vi.advanceTimersByTime(200);
    expect(c.store.get('customer')).toEqual({ kind: 'text', field: 'customer', query: 'Grace' });

    const clear = s.overlay.querySelector('button[aria-label="Clear selection"]')!;
    clear.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(c.store.get('customer')).toBeNull();
    expect(input.value).toBe('');
  });

  it('initializes from store and clears a whitespace-only query to null', () => {
    vi.useFakeTimers();
    const spec = { type: 'search', field: 'customer', data: rows, debounce: 0 } as const;
    expectValid(spec);
    const s = surface();
    const c = context({ customer: { kind: 'text', field: 'customer', query: 'Ada' } });

    drawSearch(s, spec, tokens, size, c);
    const input = s.overlay.querySelector('input') as HTMLInputElement;
    expect(input.value).toBe('Ada');
    expect(s.overlay.querySelector('button[aria-label="Clear selection"]')).not.toBeNull();

    input.value = '   ';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    vi.advanceTimersByTime(0);
    expect(c.store.get('customer')).toBeNull();
  });
});
