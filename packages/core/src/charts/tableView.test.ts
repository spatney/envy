// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from 'vitest';
import { render } from '../runtime/render';
import { validateSpec } from '../spec/validate';
import type { TableSpec } from '../spec/types';
import { formatDisplayValue, resolveConditionalDomain } from './tableView';

beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = (() =>
    fakeContext()) as typeof HTMLCanvasElement.prototype.getContext;
});

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
      return (...args: unknown[]) => {
        void args;
        return undefined;
      };
    },
    set() {
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
}

const rows = Array.from({ length: 40 }, (_, i) => ({
  name: `Item ${i + 1}`,
  group: i % 2 === 0 ? 'A' : 'B',
  score: i - 20,
  ratio: i / 40,
  note: i % 3 === 0 ? 'long text that can wrap' : 'short',
}));

const spec = (over: Partial<TableSpec> = {}): TableSpec => ({
  type: 'table',
  data: rows,
  dimensions: { width: 520, height: 170 },
  density: 'comfortable',
  columns: [
    { field: 'name', width: 160, wrap: true, sortable: false },
    { field: 'group', align: 'center', width: 80 },
    {
      field: 'score',
      type: 'quantitative',
      format: ',.0f',
      negativeStyle: 'red',
      conditionalFormat: { type: 'bar', domain: [-20, 20], baseline: 'zero', showValue: false },
    },
    {
      field: 'ratio',
      type: 'quantitative',
      format: '.0%',
      conditionalFormat: {
        type: 'rules',
        rules: [{ when: 'gte', value: 0.9, background: '#064e3b', color: '#ffffff', weight: 'bold' }],
      },
    },
    { field: 'note', wrap: true, width: 90 },
  ],
  ...over,
});

describe('tableView helpers', () => {
  it('formats prefixes, suffixes, and parenthesized negatives', () => {
    expect(formatDisplayValue(-12.3, { format: ',.1f', prefix: '$', suffix: ' USD', negativeStyle: 'parens' })).toBe(
      '$(12.3) USD',
    );
    expect(formatDisplayValue(0.25, { format: '.0%', suffix: ' done' })).toBe('25% done');
  });

  it('resolves explicit, inferred, and empty conditional domains', () => {
    expect(resolveConditionalDomain({ type: 'bar', domain: [-1, 1] }, [0, 2])).toEqual([-1, 1]);
    expect(resolveConditionalDomain({ type: 'colorScale' }, [null, -3, 5, undefined])).toEqual([-3, 5]);
    expect(resolveConditionalDomain({ type: 'icon' }, [null, undefined])).toBeNull();
  });
});

describe('render — tableView branches through table specs', () => {
  function mount(tableSpec: TableSpec) {
    expect(validateSpec(tableSpec).errors).toEqual([]);
    const container = document.createElement('div');
    document.body.appendChild(container);
    const inst = render(container, tableSpec);
    return { container, inst };
  }

  it('virtualizes long tables with spacer rows and preserves footer totals', () => {
    const { container } = mount(spec({ totals: true }));

    expect(container.querySelectorAll('tbody tr[aria-hidden="true"]').length).toBeGreaterThan(0);
    expect(container.querySelector('tfoot')?.textContent).toContain('Total');
    expect(container.querySelector('tbody td div + span')?.textContent).toBe('');
  });

  it('honors non-sortable headers and toggles sortable headers', () => {
    const { container } = mount(spec({ sort: { field: 'group', order: 'asc' } }));
    const headerButtons = [...container.querySelectorAll('th button')];

    expect(headerButtons.some((button) => button.textContent?.includes('name'))).toBe(false);
    const groupHeader = headerButtons.find((button) => button.textContent?.includes('group'));
    expect(groupHeader?.closest('th')?.getAttribute('aria-sort')).toBe('ascending');

    groupHeader?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const toggledGroupHeader = [...container.querySelectorAll('th button')].find((button) =>
      button.textContent?.includes('group'),
    );
    expect(toggledGroupHeader?.closest('th')?.getAttribute('aria-sort')).toBe('descending');
  });

  it('renders sketch chrome, divergent color scales, right-side icons, and compact density', () => {
    const { container } = mount(
      spec({
        sketch: true,
        density: 'compact',
        columns: [
          { field: 'name' },
          {
            field: 'score',
            type: 'quantitative',
            conditionalFormat: { type: 'colorScale', diverging: true, midpoint: 0, scheme: 'redblue' },
          },
          {
            field: 'ratio',
            type: 'quantitative',
            format: '.0%',
            conditionalFormat: {
              type: 'icon',
              position: 'right',
              rules: [
                { when: 'gte', value: 0.75, icon: '✓', color: '#15803d' },
                { when: 'lt', value: 0.25, icon: '×', color: '#b91c1c' },
              ],
            },
          },
        ],
      }),
    );

    const host = container.querySelector('.graphein-layer-overlay > div') as HTMLElement;
    expect(host.style.borderRadius).toContain('/');
    expect(container.textContent).toMatch(/[✓×]/);
  });

  it('renders hand-drawn data bars and a viewport grid overlay in sketch mode', () => {
    const { container } = mount(spec({ sketch: true }));

    // A viewport-pinned grid/frame overlay canvas is a sibling of the scroll host.
    expect(container.querySelector('.graphein-layer-overlay > canvas')).not.toBeNull();
    // Data bars render as embedded hand-drawn canvases behind the value text.
    expect(container.querySelectorAll('tbody td canvas').length).toBeGreaterThan(0);
  });
});
