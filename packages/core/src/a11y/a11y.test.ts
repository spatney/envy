// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import type { Surface } from '../render/surface';
import type { ChartSpec } from '../spec/types';
import { summarizeChart, chartTitleText, chartTypeLabel } from './describe';
import { buildDataTableFallback } from './table';
import { applyA11y } from './apply';

describe('chartTypeLabel', () => {
  it('maps known types and falls back to "Chart"', () => {
    expect(chartTypeLabel('bar')).toBe('Bar chart');
    expect(chartTypeLabel('matrix')).toBe('Pivot matrix');
    expect(chartTypeLabel('mystery')).toBe('Chart');
  });
});

describe('chartTitleText', () => {
  it('reads string titles and TitleConfig.text', () => {
    expect(chartTitleText({ type: 'bar', title: 'Revenue' } as ChartSpec)).toBe('Revenue');
    expect(chartTitleText({ type: 'bar', title: { text: 'Revenue' } } as ChartSpec)).toBe('Revenue');
    expect(chartTitleText({ type: 'bar' } as ChartSpec)).toBeUndefined();
    expect(chartTitleText({ type: 'bar', title: '  ' } as ChartSpec)).toBeUndefined();
  });
});

describe('summarizeChart', () => {
  it('synthesizes type + title + data-point count', () => {
    const spec = {
      type: 'bar',
      title: 'Revenue by region',
      data: [{ r: 'N' }, { r: 'S' }, { r: 'E' }],
    } as unknown as ChartSpec;
    expect(summarizeChart(spec)).toEqual({
      label: 'Bar chart: Revenue by region. 3 data points.',
      rowCount: 3,
    });
  });

  it('uses the singular "data point" for a single row', () => {
    const spec = { type: 'line', data: [{ x: 1 }] } as unknown as ChartSpec;
    expect(summarizeChart(spec).label).toBe('Line chart. 1 data point.');
  });

  it('prefers an explicit description verbatim', () => {
    const spec = {
      type: 'bar',
      title: 'ignored',
      description: 'Quarterly revenue, highest in the West.',
      data: [{ r: 'N' }],
    } as unknown as ChartSpec;
    expect(summarizeChart(spec).label).toBe('Quarterly revenue, highest in the West.');
  });

  it('uses the kpi label and omits the data-point count', () => {
    const spec = {
      type: 'kpi',
      label: 'Active users',
      value: { field: 'v' },
      data: [{ v: 1 }, { v: 2 }],
    } as unknown as ChartSpec;
    expect(summarizeChart(spec).label).toBe('KPI card: Active users');
  });

  it('falls back to just the type label with no title or data', () => {
    expect(summarizeChart({ type: 'scatter' } as ChartSpec).label).toBe('Scatter plot');
  });
});

describe('buildDataTableFallback', () => {
  it('returns null when there is no data', () => {
    expect(buildDataTableFallback({ type: 'bar', data: [] } as unknown as ChartSpec)).toBeNull();
    expect(buildDataTableFallback({ type: 'bar' } as ChartSpec)).toBeNull();
  });

  it('builds a captioned table with col-scoped headers and rows', () => {
    const spec = {
      type: 'bar',
      title: 'Sales',
      data: [
        { region: 'North', sales: 120 },
        { region: 'South', sales: 90 },
      ],
    } as unknown as ChartSpec;
    const table = buildDataTableFallback(spec);
    expect(table).not.toBeNull();
    expect(table!.tagName).toBe('TABLE');
    expect(table!.querySelector('caption')?.textContent).toBe('Bar chart: Sales. 2 data points.');
    const headers = [...table!.querySelectorAll('thead th')];
    expect(headers.map((h) => h.textContent)).toEqual(['region', 'sales']);
    expect(headers.every((h) => h.getAttribute('scope') === 'col')).toBe(true);
    const bodyRows = table!.querySelectorAll('tbody tr');
    expect(bodyRows.length).toBe(2);
    expect([...bodyRows[0].querySelectorAll('td')].map((td) => td.textContent)).toEqual([
      'North',
      '120',
    ]);
  });

  it('unions keys across heterogeneous rows in first-seen order', () => {
    const spec = {
      type: 'scatter',
      data: [
        { a: 1, b: 2 },
        { b: 3, c: 4 },
      ],
    } as unknown as ChartSpec;
    const table = buildDataTableFallback(spec)!;
    expect([...table.querySelectorAll('thead th')].map((h) => h.textContent)).toEqual([
      'a',
      'b',
      'c',
    ]);
    // Missing keys render as empty cells.
    const row2 = table.querySelectorAll('tbody tr')[1];
    expect([...row2.querySelectorAll('td')].map((td) => td.textContent)).toEqual(['', '3', '4']);
  });

  it('caps rows and appends a truncation note', () => {
    const data = Array.from({ length: 101 }, (_, i) => ({ i }));
    const table = buildDataTableFallback({ type: 'line', data } as unknown as ChartSpec)!;
    const rows = table.querySelectorAll('tbody tr');
    // 100 data rows + 1 truncation note row.
    expect(rows.length).toBe(101);
    expect(rows[rows.length - 1].textContent).toBe('…and 1 more row');
  });

  it('renders Date cells as ISO strings', () => {
    const spec = {
      type: 'line',
      data: [{ when: new Date('2024-05-03T00:00:00Z') }],
    } as unknown as ChartSpec;
    const table = buildDataTableFallback(spec)!;
    expect(table.querySelector('tbody td')?.textContent).toBe('2024-05-03T00:00:00.000Z');
  });
});

function fakeSurface(): Surface {
  return {
    root: document.createElement('div'),
    marks: { canvas: document.createElement('canvas') },
    interaction: { canvas: document.createElement('canvas') },
    a11y: document.createElement('div'),
  } as unknown as Surface;
}

describe('applyA11y', () => {
  it('labels the root as a figure and hides the canvases', () => {
    const surface = fakeSurface();
    applyA11y(surface, { type: 'bar', title: 'Sales', data: [{ r: 'N', v: 1 }] } as unknown as ChartSpec);
    expect(surface.root.getAttribute('role')).toBe('figure');
    expect(surface.root.getAttribute('aria-label')).toBe('Bar chart: Sales. 1 data point.');
    expect(surface.marks.canvas.getAttribute('aria-hidden')).toBe('true');
    expect(surface.interaction.canvas.getAttribute('aria-hidden')).toBe('true');
  });

  it('injects a hidden data table for canvas charts', () => {
    const surface = fakeSurface();
    applyA11y(surface, { type: 'bar', data: [{ r: 'N', v: 1 }] } as unknown as ChartSpec);
    expect(surface.a11y.querySelector('table')).not.toBeNull();
  });

  it('does not inject a fallback for self-describing charts (table/matrix/kpi)', () => {
    for (const type of ['table', 'matrix', 'kpi'] as const) {
      const surface = fakeSurface();
      applyA11y(surface, { type, data: [{ r: 'N', v: 1 }] } as unknown as ChartSpec);
      expect(surface.a11y.querySelector('table')).toBeNull();
    }
  });

  it('is idempotent across re-draws (no duplicate fallback)', () => {
    const surface = fakeSurface();
    const spec = { type: 'bar', data: [{ r: 'N', v: 1 }] } as unknown as ChartSpec;
    applyA11y(surface, spec);
    applyA11y(surface, spec);
    expect(surface.a11y.querySelectorAll('table').length).toBe(1);
  });
});
