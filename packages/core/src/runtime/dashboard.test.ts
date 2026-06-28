// @vitest-environment jsdom
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { DashboardSpec } from '../spec/dashboard';
import { validateSpec } from '../spec/validate';
import { renderDashboard, resolveDashboardLayout, resolveDashboardSections } from './dashboard';

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

let prevAnim: boolean | undefined;
beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = (() =>
    fakeContext()) as typeof HTMLCanvasElement.prototype.getContext;
  prevAnim = globalThis.__GRAPHEIN_DISABLE_ANIM;
  globalThis.__GRAPHEIN_DISABLE_ANIM = true;
});
afterAll(() => {
  globalThis.__GRAPHEIN_DISABLE_ANIM = prevAnim;
});

const spec = (type = 'kpi') =>
  type === 'kpi'
    ? ({ type: 'kpi', value: 1 } as const)
    : ({ type: 'bar', data: [{ x: 'A', y: 1 }], encoding: { x: { field: 'x' }, y: { field: 'y' } } } as const);

describe('dashboard layout helpers', () => {
  it('keeps legacy layout defaults when new chrome fields are absent', () => {
    expect(resolveDashboardLayout()).toMatchObject({ cols: 12, rowHeight: 96, gap: 14 });
  });

  it('builds explicit sections plus an implicit trailing section', () => {
    const layout = resolveDashboardLayout({
      sections: [{ title: 'A', views: ['a'], cols: 6, rowHeight: 80 }],
    });
    const sections = resolveDashboardSections(
      [
        { id: 'a', spec: spec() },
        { id: 'b', spec: spec('bar') },
      ],
      layout,
    );
    expect(sections).toHaveLength(2);
    expect(sections[0]).toMatchObject({ cols: 6, rowHeight: 80, explicit: true });
    expect(sections[0].views.map((v) => v.id)).toEqual(['a']);
    expect(sections[1].views.map((v) => v.id)).toEqual(['b']);
  });
});

describe('dashboard validation', () => {
  it('validates sections, card chrome, responsive spans, and page chrome', () => {
    const dash: DashboardSpec = {
      type: 'dashboard',
      data: [{ month: '2024-01', sales: 10 }],
      layout: {
        preset: 'kpi-first',
        density: 'compact',
        padding: 8,
        maxWidth: 900,
        sections: [{ title: 'Overview', views: ['k'] }],
      },
      views: [
        {
          id: 'k',
          title: 'Revenue',
          accent: '#14b8a6',
          padding: 'standard',
          responsive: [{ maxWidth: 600, w: 12, h: 2 }],
          spec: { type: 'kpi', value: { field: 'sales', aggregate: 'sum' } },
        },
      ],
    };
    expect(validateSpec(dash).errors).toEqual([]);
  });

  it('rejects duplicate section assignments and bad responsive rules', () => {
    const result = validateSpec({
      type: 'dashboard',
      data: [{ sales: 1 }],
      layout: { sections: [{ views: ['k'] }, { views: ['k', 'missing'] }], density: 'tight' },
      views: [{ id: 'k', responsive: [{ maxWidth: 'small' }], spec: { type: 'kpi', value: 1 } }],
    });
    expect(result.errors.map((e) => e.path)).toEqual(
      expect.arrayContaining([
        'views[0].responsive[0].maxWidth',
        'layout.density',
        'layout.sections[1].views[0]',
        'layout.sections[1].views[1]',
      ]),
    );
  });

  it('validates the documented sections example', () => {
    const example = JSON.parse(
      readFileSync(resolve(process.cwd(), '..', '..', 'docs', 'examples', 'dashboard-sections.json'), 'utf8'),
    );
    expect(validateSpec(example).errors).toEqual([]);
  });
});

describe('renderDashboard', () => {
  const rows = [
    { region: 'West', month: 'Jan', sales: 10 },
    { region: 'East', month: 'Jan', sales: 6 },
    { region: 'West', month: 'Feb', sales: 14 },
    { region: 'East', month: 'Feb', sales: 8 },
  ];

  const dashboard = (over: Partial<DashboardSpec> = {}): DashboardSpec => ({
    type: 'dashboard',
    title: 'Sales dashboard',
    subtitle: 'Regional performance',
    data: rows,
    dimensions: { width: 900, height: 520 },
    layout: {
      preset: 'kpi-first',
      density: 'compact',
      maxWidth: 1000,
      sections: [{ id: 'main', title: 'Main', subtitle: 'Charts', views: ['total', 'trend'], cols: 6, rowHeight: 70 }],
    },
    views: [
      { id: 'region', title: 'Region', spec: { type: 'dropdown', field: 'region', multiple: true }, w: 3, h: 2 },
      { id: 'total', title: 'Total sales', accent: '#14b8a6', spec: { type: 'kpi', value: { field: 'sales', aggregate: 'sum' } } },
      {
        id: 'trend',
        title: 'Trend',
        responsive: [{ maxWidth: 500, hidden: true }],
        spec: { type: 'bar', encoding: { x: { field: 'month' }, y: { field: 'sales' }, series: { field: 'region' } } },
      },
    ],
    interactions: 'auto',
    ...over,
  });

  const mount = () => {
    const c = document.createElement('div');
    Object.defineProperty(c, 'clientWidth', { configurable: true, value: 900 });
    Object.defineProperty(c, 'clientHeight', { configurable: true, value: 520 });
    document.body.appendChild(c);
    return c;
  };

  it('mounts dashboard chrome, sections, navigators, and view instances', () => {
    const c = mount();
    const d = renderDashboard(c, dashboard());
    expect(c.querySelector('.graphein-dashboard')).toBeTruthy();
    expect(c.textContent).toContain('Sales dashboard');
    expect(c.textContent).toContain('Main');
    expect(c.querySelectorAll('[data-view-id]')).toHaveLength(3);
    expect(d.views).toHaveLength(3);
    expect(d.views.map((v) => v.report().type)).toEqual(['dropdown', 'kpi', 'bar']);
    d.destroy();
    expect(c.children).toHaveLength(0);
  });

  it('shares dashboard selections, notifies listeners, and cross-filters chart rows', () => {
    const d = renderDashboard(mount(), dashboard());
    const chart = d.views.find((v) => v.report().type === 'bar')!;
    expect(chart.report().markCount).toBe(4);
    const events: Array<[string, unknown]> = [];
    const off = d.on('selectionchange', (name, value) => events.push([name, value]));

    d.setSelection('region', { kind: 'set', field: 'region', values: ['West'] });

    expect(d.getSelection('region')).toEqual({ kind: 'set', field: 'region', values: ['West'] });
    expect(events).toHaveLength(1);
    expect(chart.report().markCount).toBe(2);
    off();
    d.clearSelection('region');
    expect(events).toHaveLength(1);
    expect(chart.report().markCount).toBe(4);
    d.destroy();
  });

  it('updates, resizes, and ignores updates after destroy', () => {
    const d = renderDashboard(mount(), dashboard());
    d.update(
      dashboard({
        title: 'Updated',
        views: [
          { id: 'region', spec: { type: 'dropdown', field: 'region' } },
          { id: 'total', spec: { type: 'kpi', value: { field: 'sales', aggregate: 'sum' } } },
        ],
      }),
    );
    expect(d.spec.title).toBe('Updated');
    expect(d.views).toHaveLength(2);
    d.resize();
    expect(d.views.every((v) => v.surface.width > 0)).toBe(true);
    d.destroy();
    d.update(dashboard({ title: 'After destroy' }));
    expect(d.spec.title).toBe('Updated');
  });

  it('lays out responsive cells and mounts collapsed sections when opened', () => {
    const c = mount();
    Object.defineProperty(c, 'clientWidth', { configurable: true, value: 420 });
    const d = renderDashboard(
      c,
      dashboard({
        layout: { sections: [{ title: 'Hidden', views: ['trend'], collapsed: true }] },
        views: [
          { id: 'region', spec: { type: 'dropdown', field: 'region' } },
          {
            id: 'trend',
            responsive: [{ maxWidth: 500, w: 1, h: 3 }],
            spec: { type: 'bar', encoding: { x: { field: 'month' }, y: { field: 'sales' } } },
          },
        ],
      }),
    );
    expect(d.views.map((v) => v.report().type)).toEqual(['dropdown']);
    const button = c.querySelector('.graphein-dashboard-section > button')!;
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(d.views.map((v) => v.report().type)).toEqual(['dropdown', 'bar']);
    d.destroy();
  });
});
