import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { DashboardSpec } from '../spec/dashboard';
import { validateSpec } from '../spec/validate';
import { resolveDashboardLayout, resolveDashboardSections } from './dashboard';

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
