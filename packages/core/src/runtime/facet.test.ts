// @vitest-environment jsdom
import { describe, it, expect, beforeAll } from 'vitest';
import { resolveTheme, type ThemeTokens } from '../theme';
import { validateSpec } from '../spec/validate';
import type { BarSpec, ChartSpec, LineSpec } from '../spec/types';
import { isFaceted, buildFacetModels, FACETABLE_TYPES } from './facet';

// Stub canvas so measureText uses the deterministic SSR heuristic.
beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = (() =>
    null) as typeof HTMLCanvasElement.prototype.getContext;
});

const tokens = (): ThemeTokens => resolveTheme();
const SIZE = { width: 800, height: 500 };

const rows = [
  { region: 'West', month: 'Jan', sales: 10 },
  { region: 'West', month: 'Feb', sales: 14 },
  { region: 'West', month: 'Mar', sales: 9 },
  { region: 'East', month: 'Jan', sales: 6 },
  { region: 'East', month: 'Feb', sales: 8 },
  { region: 'East', month: 'Mar', sales: 12 },
  { region: 'South', month: 'Jan', sales: 4 },
  { region: 'South', month: 'Feb', sales: 7 },
  { region: 'South', month: 'Mar', sales: 5 },
];

const lineSpec = (extra: Partial<LineSpec> = {}): LineSpec => ({
  type: 'line',
  data: rows,
  encoding: { x: { field: 'month' }, y: { field: 'sales' } },
  facet: { field: 'region' },
  ...extra,
});

describe('validateSpec — facet', () => {
  it('accepts a valid facet on a line chart', () => {
    expect(validateSpec(lineSpec()).errors).toEqual([]);
  });

  it('requires a non-empty field', () => {
    const res = validateSpec({ ...lineSpec(), facet: {} } as unknown as ChartSpec);
    expect(res.errors.map((e) => e.path)).toContain('facet.field');
  });

  it('rejects a non-positive / non-integer column count', () => {
    expect(validateSpec({ ...lineSpec(), facet: { field: 'region', columns: 0 } }).errors.map((e) => e.path)).toContain(
      'facet.columns',
    );
    expect(
      validateSpec({ ...lineSpec(), facet: { field: 'region', columns: 2.5 } }).errors.map((e) => e.path),
    ).toContain('facet.columns');
  });

  it('repairs a misspelled sort with a JSON Patch fix', () => {
    const res = validateSpec({
      ...lineSpec(),
      facet: { field: 'region', sort: 'ascendng' },
    } as unknown as ChartSpec);
    const e = res.errors.find((x) => x.path === 'facet.sort');
    expect(e?.fix).toEqual([{ op: 'replace', path: '/facet/sort', value: 'ascending' }]);
  });

  it('warns when faceting a non-facetable chart type', () => {
    const res = validateSpec({
      type: 'pie',
      data: rows,
      encoding: { theta: { field: 'sales' }, color: { field: 'region' } },
      facet: { field: 'region' },
    } as unknown as ChartSpec);
    expect(res.warnings.some((w) => w.path === 'facet')).toBe(true);
  });
});

describe('isFaceted', () => {
  it('is true for a facet-eligible cartesian spec with a field', () => {
    expect(isFaceted(lineSpec())).toBe(true);
  });
  it('is false without a facet', () => {
    expect(isFaceted({ ...lineSpec(), facet: undefined } as LineSpec)).toBe(false);
  });
  it('is false for a non-facetable type', () => {
    expect(FACETABLE_TYPES.has('pie')).toBe(false);
  });
});

describe('buildFacetModels', () => {
  it('builds one panel per distinct facet value', () => {
    const layout = buildFacetModels(lineSpec(), tokens(), SIZE)!;
    expect(layout).not.toBeNull();
    expect(layout.panels.map((p) => p.value)).toEqual(['East', 'South', 'West']);
    expect(layout.field).toBe('region');
  });

  it('orders panels by sort direction', () => {
    const asc = buildFacetModels(lineSpec({ facet: { field: 'region', sort: 'ascending' } }), tokens(), SIZE)!;
    const desc = buildFacetModels(lineSpec({ facet: { field: 'region', sort: 'descending' } }), tokens(), SIZE)!;
    expect(asc.panels.map((p) => p.value)).toEqual(['East', 'South', 'West']);
    expect(desc.panels.map((p) => p.value)).toEqual(['West', 'South', 'East']);
  });

  it('shares an identical y-domain across all panels', () => {
    const layout = buildFacetModels(lineSpec(), tokens(), SIZE)!;
    const domains = layout.panels.map((p) => p.model.y.scale.domain);
    for (const d of domains) {
      expect(d[0]).toBe(domains[0][0]);
      expect(d[1]).toBe(domains[0][1]);
    }
    // The shared y-domain spans the GLOBAL extent (max 14 across all regions),
    // not just one panel's local max — that is the whole comparability point.
    expect(domains[0][1]).toBeGreaterThanOrEqual(14);
  });

  it('shares an identical x category list across all panels', () => {
    const layout = buildFacetModels(lineSpec(), tokens(), SIZE)!;
    for (const p of layout.panels) {
      expect(p.model.x.categories).toEqual(['Jan', 'Feb', 'Mar']);
    }
  });

  it('honors an explicit column count and lays panels on a grid', () => {
    const layout = buildFacetModels(lineSpec({ facet: { field: 'region', columns: 1 } }), tokens(), SIZE)!;
    expect(layout.columns).toBe(1);
    expect(layout.rows).toBe(3);
    // One column → every panel shares the same left edge, stacked top to bottom.
    const xs = layout.panels.map((p) => p.model.plot.x);
    expect(new Set(xs).size).toBe(1);
    const ys = layout.panels.map((p) => p.model.plot.y);
    expect(ys[0]).toBeLessThan(ys[1]);
    expect(ys[1]).toBeLessThan(ys[2]);
  });

  it('offsets panels into distinct grid cells (2 columns)', () => {
    const layout = buildFacetModels(lineSpec({ facet: { field: 'region', columns: 2 } }), tokens(), SIZE)!;
    expect(layout.columns).toBe(2);
    // Panel 0 (col 0) is left of panel 1 (col 1); panel 2 wraps back to col 0.
    expect(layout.panels[0].model.plot.x).toBeLessThan(layout.panels[1].model.plot.x);
    expect(layout.panels[2].model.plot.x).toBeCloseTo(layout.panels[0].model.plot.x, 1);
    expect(layout.panels[2].model.plot.y).toBeGreaterThan(layout.panels[0].model.plot.y);
  });

  it('keeps a stable shared color per series across panels (multi-series)', () => {
    const spec: LineSpec = {
      type: 'line',
      data: rows.flatMap((r) => [
        { ...r, channel: 'web' },
        { ...r, channel: 'store', sales: r.sales / 2 },
      ]),
      encoding: { x: { field: 'month' }, y: { field: 'sales' }, series: { field: 'channel' } },
      facet: { field: 'region' },
    };
    const layout = buildFacetModels(spec, tokens(), SIZE)!;
    const colorFor = (m: { series: { key: string; color: string }[] }, key: string) =>
      m.series.find((s) => s.key === key)?.color;
    const web0 = colorFor(layout.panels[0].model, 'web');
    for (const p of layout.panels) {
      expect(colorFor(p.model, 'web')).toBe(web0);
    }
    // A shared legend is exposed for the multi-series facet.
    expect(layout.legendItems && layout.legendItems.length).toBeGreaterThan(1);
  });

  it('returns null when there are no rows to facet', () => {
    const layout = buildFacetModels({ ...lineSpec(), data: [] } as LineSpec, tokens(), SIZE);
    expect(layout).toBeNull();
  });

  it('facets a bar chart too', () => {
    const spec: BarSpec = {
      type: 'bar',
      data: rows,
      encoding: { x: { field: 'month' }, y: { field: 'sales' } },
      facet: { field: 'region' },
    };
    const layout = buildFacetModels(spec, tokens(), SIZE)!;
    expect(layout.panels).toHaveLength(3);
  });
});
