// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from 'vitest';
import { createSelectionStore } from '../../interaction/store';
import { validateSpec } from '../../spec/validate';
import { resolveTheme } from '../../theme';
import type { Surface } from '../../render/surface';
import type { RenderContext } from '../index';
import { drawList } from './list';

beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = (() => null) as any;
});

const tokens = resolveTheme('light');
const size = { width: 260, height: 160 };
const rows = [
  { region: 'West' },
  { region: 'East' },
  { region: 'North' },
  { region: 'South' },
  { region: 'Central' },
  { region: 'West' },
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

function context(initial?: Record<string, any>): RenderContext & { store: ReturnType<typeof createSelectionStore> } {
  const store = createSelectionStore(initial);
  return { store, sourceData: rows };
}

function expectValid(spec: unknown): void {
  const result = validateSpec(spec);
  expect(result.errors).toEqual([]);
  expect(result.valid).toBe(true);
}

describe('drawList', () => {
  it('toggles individual checkbox rows and clears from the shell', () => {
    const spec = { type: 'list', field: 'region', data: rows, searchThreshold: 99 } as const;
    expectValid(spec);
    const s = surface();
    const c = context();

    drawList(s, spec, tokens, size, c);
    const checks = [...s.overlay.querySelectorAll('input[type="checkbox"]')] as HTMLInputElement[];
    expect(checks).toHaveLength(5);

    checks[0].checked = true;
    checks[0].dispatchEvent(new Event('change', { bubbles: true }));
    expect(c.store.get('region')).toEqual({ kind: 'set', field: 'region', values: ['West'] });
    expect(s.overlay.textContent).toContain('1 selected');

    checks[1].checked = true;
    checks[1].dispatchEvent(new Event('change', { bubbles: true }));
    expect(c.store.get('region')).toEqual({ kind: 'set', field: 'region', values: ['West', 'East'] });

    const clear = s.overlay.querySelector('button[aria-label="Clear selection"]')!;
    clear.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(c.store.get('region')).toBeNull();
    expect(s.overlay.textContent).not.toContain('selected');
  });

  it('filters long lists, shows no matches, and select-all/clear applies to visible rows', () => {
    const spec = { type: 'list', field: 'region', data: rows, searchThreshold: 2 } as const;
    expectValid(spec);
    const s = surface();
    const c = context();

    drawList(s, spec, tokens, size, c);
    const search = s.overlay.querySelector('input[type="search"]') as HTMLInputElement;
    expect(search.getAttribute('aria-label')).toBe('Filter region options');

    search.value = 'o';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    expect(s.overlay.textContent).toContain('North');
    expect(s.overlay.textContent).toContain('South');
    expect(s.overlay.textContent).not.toContain('East');

    const selectAll = [...s.overlay.querySelectorAll('button')].find((b) => b.textContent === 'Select all')!;
    selectAll.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(c.store.get('region')).toEqual({ kind: 'set', field: 'region', values: ['North', 'South'] });
    expect(s.overlay.textContent).toContain('2 selected');

    const clearVisible = [...s.overlay.querySelectorAll('button')].find((b) => b.textContent === 'Clear')!;
    clearVisible.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(c.store.get('region')).toBeNull();

    search.value = 'zzz';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    expect(s.overlay.textContent).toContain('No matches');
  });

  it('respects selectAll:false and initializes from the store', () => {
    const spec = { type: 'list', field: 'region', data: rows, selectAll: false } as const;
    expectValid(spec);
    const s = surface();
    const c = context({ region: { kind: 'set', field: 'region', values: ['East'] } });

    drawList(s, spec, tokens, size, c);
    expect([...s.overlay.querySelectorAll('button')].map((b) => b.textContent)).not.toContain('Select all');
    const checks = [...s.overlay.querySelectorAll('input[type="checkbox"]')] as HTMLInputElement[];
    expect(checks[1].checked).toBe(true);
    checks[1].checked = false;
    checks[1].dispatchEvent(new Event('change', { bubbles: true }));
    expect(c.store.get('region')).toBeNull();
  });
});
