// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from 'vitest';
import { render } from '../runtime/render';
import { validateSpec } from '../spec/validate';
import type { TableSpec } from '../spec/types';

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

const data = [
  { team: 'Alpha', owner: 'Ava', date: '2026-01-02', revenue: 1200, margin: 0.32, status: 'good', change: 0.18 },
  { team: 'Beta', owner: 'Bea', date: '2026-02-03', revenue: -250, margin: -0.05, status: 'bad', change: -0.12 },
  { team: 'Gamma', owner: 'Gus', date: '2026-03-04', revenue: 800, margin: 0.14, status: 'warn', change: 0.01 },
];

const tableSpec = (over: Partial<TableSpec> = {}): TableSpec => ({
  type: 'table',
  data,
  dimensions: { width: 780, height: 340 },
  columns: [
    { field: 'team', title: 'Team', group: 'Who' },
    { field: 'owner', title: 'Owner', group: 'Who', hidden: false },
    { field: 'date', title: 'Date', type: 'temporal', format: '%b %d, %Y', group: 'When' },
    {
      field: 'revenue',
      title: 'Revenue',
      type: 'quantitative',
      format: ',.0f',
      prefix: '$',
      negativeStyle: 'parens-red',
      conditionalFormat: { type: 'bar', baseline: 'zero', negativeColor: '#ef4444' },
      group: 'Metrics',
    },
    {
      field: 'margin',
      title: 'Margin',
      type: 'quantitative',
      format: '.0%',
      conditionalFormat: { type: 'colorScale', scheme: 'teal', target: 'background' },
      group: 'Metrics',
    },
    {
      field: 'change',
      title: 'Change',
      type: 'quantitative',
      format: '.0%',
      conditionalFormat: { type: 'icon', set: 'arrows', position: 'right' },
      group: 'Metrics',
    },
  ],
  ...over,
});

describe('render — table', () => {
  function mount(spec: TableSpec) {
    expect(validateSpec(spec).errors).toEqual([]);
    const container = document.createElement('div');
    document.body.appendChild(container);
    const inst = render(container, spec);
    return { container, inst };
  }

  it('renders column groups, formatted cells, and totals', () => {
    const { container, inst } = mount(tableSpec({ totals: { label: 'Grand total' }, striped: true }));

    expect(container.querySelector('table[role="table"]')).not.toBeNull();
    const text = container.textContent ?? '';
    expect(text).toContain('Who');
    expect(text).toContain('Metrics');
    expect(text).toContain('Alpha');
    expect(text).toContain('Jan 02, 2026');
    expect(text).toContain('$1,200');
    expect(text).toContain('$(250)');
    expect(text).toContain('32%');
    expect(text).toContain('Grand total');
    expect(text).toContain('$1,750');
    expect(inst.report().ok).toBe(true);
  });

  it('sorts rows from an initial sort and from header clicks', () => {
    const { container } = mount(tableSpec({ sort: { field: 'revenue', order: 'desc' } }));
    const firstBodyRow = () => container.querySelector('tbody tr:not([aria-hidden="true"])')?.textContent ?? '';

    expect(firstBodyRow()).toContain('Alpha');
    const teamButton = [...container.querySelectorAll('th button')].find((button) => button.textContent?.includes('Team'));
    teamButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(firstBodyRow()).toContain('Alpha');
    teamButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(firstBodyRow()).toContain('Gamma');
  });

  it('infers columns when omitted and renders a compact table without sticky headers', () => {
    const { container } = mount({
      type: 'table',
      data: [{ city: 'Seattle', value: 3 }, { city: 'Portland', value: 5 }],
      density: 'compact',
      stickyHeader: false,
      dimensions: { width: 360, height: 180 },
    });

    expect(container.textContent).toContain('city');
    expect(container.textContent).toContain('Seattle');
    expect(container.querySelector('th')?.style.position).not.toBe('sticky');
  });

  it('renders rules and text color-scale conditional formatting', () => {
    const { container } = mount(
      tableSpec({
        columns: [
          { field: 'team' },
          {
            field: 'status',
            conditionalFormat: {
              type: 'rules',
              rules: [{ when: 'eq', value: 'bad', icon: '!', color: '#b91c1c', weight: 'bold' }],
            },
          },
          {
            field: 'margin',
            type: 'quantitative',
            format: '.0%',
            conditionalFormat: { type: 'colorScale', target: 'text', domain: [-0.1, 0.4] },
          },
        ],
      }),
    );

    expect(container.textContent).toContain('!');
    const icon = container.querySelector('td span[aria-hidden="true"]');
    expect(icon?.textContent).toBe('!');
  });
});
