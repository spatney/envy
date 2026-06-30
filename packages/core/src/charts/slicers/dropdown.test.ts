// @vitest-environment jsdom
import { beforeAll, afterEach, describe, expect, it } from 'vitest';
import { createSelectionStore } from '../../interaction/store';
import { validateSpec } from '../../spec/validate';
import { resolveTheme } from '../../theme';
import type { Surface } from '../../render/surface';
import type { RenderContext } from '../index';
import { drawDropdown } from './dropdown';

beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = (() => null) as any;
});

// The dropdown menu is portaled to document.body, so reset it between cases.
afterEach(() => {
  document.body.replaceChildren();
});

const tokens = resolveTheme('light');
const size = { width: 240, height: 80 };
const rows = [
  { region: 'West', sales: 10 },
  { region: 'East', sales: 20 },
  { region: 'West', sales: 30 },
  { region: 'North', sales: 40 },
];

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

function surface(): Surface {
  const { ctx } = fakeContext();
  return {
    marks: { ctx },
    overlay: document.createElement('div'),
    width: size.width,
    height: size.height,
  } as unknown as Surface;
}

function ctx(sourceData = rows): RenderContext & { store: ReturnType<typeof createSelectionStore> } {
  const store = createSelectionStore();
  return { store, sourceData };
}

function expectValid(spec: unknown): void {
  const result = validateSpec(spec);
  expect(result.errors).toEqual([]);
  expect(result.valid).toBe(true);
}

describe('drawDropdown', () => {
  it('renders placeholder, opens a single-select popover, selects and clears', () => {
    const spec = { type: 'dropdown', field: 'region', data: rows, placeholder: 'Pick one' } as const;
    expectValid(spec);
    const s = surface();
    const context = ctx();

    drawDropdown(s, spec, tokens, size, context);
    const trigger = s.overlay.querySelector('button')!;
    expect(trigger.textContent).toContain('Pick one');

    trigger.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    let options = [...document.body.querySelectorAll('[role="option"]')] as HTMLElement[];
    expect(options.map((o) => o.textContent)).toEqual(['West', 'East', 'North']);

    options[1].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(context.store.get('region')).toEqual({ kind: 'set', field: 'region', values: ['East'] });
    expect(document.body.querySelectorAll('[role="option"]')).toHaveLength(0);
    expect(trigger.textContent).toContain('East');

    trigger.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    options = [...document.body.querySelectorAll('[role="option"]')] as HTMLElement[];
    options[1].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(context.store.get('region')).toBeNull();
    expect(trigger.textContent).toContain('Pick one');
  });

  it('supports multi-select summaries, deselecting, outside close, and shell clear', () => {
    const spec = { type: 'dropdown', field: 'region', data: rows, multiple: true } as const;
    expectValid(spec);
    const s = surface();
    const context = ctx();

    drawDropdown(s, spec, tokens, size, context);
    const trigger = s.overlay.querySelector('button')!;
    expect(trigger.textContent).toContain('Any');
    trigger.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    const checks = [...document.body.querySelectorAll('input[type="checkbox"]')] as HTMLInputElement[];
    checks[0].checked = true;
    checks[0].dispatchEvent(new Event('change', { bubbles: true }));
    expect(context.store.get('region')).toEqual({ kind: 'set', field: 'region', values: ['West'] });
    expect(trigger.textContent).toContain('West');

    checks[1].checked = true;
    checks[1].dispatchEvent(new Event('change', { bubbles: true }));
    expect(context.store.get('region')).toEqual({ kind: 'set', field: 'region', values: ['West', 'East'] });
    expect(trigger.textContent).toContain('2 selected');

    checks[0].checked = false;
    checks[0].dispatchEvent(new Event('change', { bubbles: true }));
    expect(context.store.get('region')).toEqual({ kind: 'set', field: 'region', values: ['East'] });

    document.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(document.body.querySelectorAll('input[type="checkbox"]')).toHaveLength(0);

    const clear = s.overlay.querySelector('button[aria-label="Clear selection"]')!;
    clear.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(context.store.get('region')).toBeNull();
    expect(trigger.textContent).toContain('Any');
  });

  it('shows an empty menu when source data has no options', () => {
    const spec = { type: 'dropdown', field: 'region', data: [] } as const;
    expectValid(spec);
    const s = surface();
    drawDropdown(s, spec, tokens, size, ctx([]));

    const trigger = s.overlay.querySelector('button')!;
    trigger.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(document.body.querySelectorAll('[role="option"]')).toHaveLength(0);
    expect(trigger.textContent).toContain('All');
  });
});
