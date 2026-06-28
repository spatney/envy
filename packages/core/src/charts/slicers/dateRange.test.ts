// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from 'vitest';
import { createSelectionStore } from '../../interaction/store';
import { validateSpec } from '../../spec/validate';
import { resolveTheme } from '../../theme';
import type { Surface } from '../../render/surface';
import type { RenderContext } from '../index';
import { drawDateRange } from './dateRange';

beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = (() => null) as any;
});

const tokens = resolveTheme('light');
const size = { width: 320, height: 130 };
const rows = [
  { day: '2024-01-01' },
  { day: '2024-01-15' },
  { day: '2024-01-31' },
  { day: new Date(2024, 1, 15) },
];

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

describe('drawDateRange', () => {
  it('renders presets, publishes a last-7-days range, and clears with All', () => {
    const spec = { type: 'dateRange', field: 'day', data: rows } as const;
    expectValid(spec);
    const s = surface();
    const c = context();

    drawDateRange(s, spec, tokens, size, c);
    expect(s.overlay.textContent).toContain('Last 7d');
    expect(s.overlay.textContent).toContain('Last 30d');
    expect(s.overlay.textContent).toContain('All');

    const last7 = [...s.overlay.querySelectorAll('button')].find((b) => b.textContent === 'Last 7d')!;
    last7.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(c.store.get('day')).toEqual({ kind: 'range', field: 'day', min: '2024-02-08', max: '2024-02-15' });

    const all = [...s.overlay.querySelectorAll('button')].find((b) => b.textContent === 'All')!;
    all.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(c.store.get('day')).toBeNull();
  });

  it('uses existing date range and arrow keys publish ISO date bounds', () => {
    const spec = { type: 'dateRange', field: 'day', data: rows, presets: false } as const;
    expectValid(spec);
    const s = surface();
    const c = context(rows, { day: { kind: 'range', field: 'day', min: '2024-01-15', max: '2024-01-31' } });

    drawDateRange(s, spec, tokens, size, c);
    expect(s.overlay.textContent).not.toContain('Last 7d');
    const thumbs = s.overlay.querySelectorAll('[role="slider"]');
    expect(thumbs[0].getAttribute('aria-valuenow')).toBe(String(new Date(2024, 0, 15).getTime()));
    expect(thumbs[1].getAttribute('aria-valuenow')).toBe(String(new Date(2024, 0, 31).getTime()));

    thumbs[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(c.store.get('day')).toEqual({ kind: 'range', field: 'day', min: '2024-01-15', max: '2024-02-01' });

    const clear = s.overlay.querySelector('button[aria-label="Clear selection"]')!;
    clear.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(c.store.get('day')).toBeNull();
  });

  it('shows an empty date-range notice when dates are missing or degenerate', () => {
    const spec = { type: 'dateRange', field: 'day', data: [{ day: 'not-a-date' }] } as const;
    expectValid(spec);
    const s = surface();
    drawDateRange(s, spec, tokens, size, context([{ day: 'not-a-date' }]));

    expect(s.overlay.textContent).toContain('No date range for "day".');
    expect(s.overlay.querySelector('[role="slider"]')).toBeNull();
  });
});
