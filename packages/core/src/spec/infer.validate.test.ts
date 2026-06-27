import { describe, it, expect } from 'vitest';
import { validateSpec, assertValidSpec } from './validate';

describe('validateSpec', () => {
  it('rejects non-objects', () => {
    expect(validateSpec(null).valid).toBe(false);
    expect(validateSpec(42).valid).toBe(false);
  });

  it('requires a known type', () => {
    expect(validateSpec({}).valid).toBe(false);
    const r = validateSpec({ type: 'bogus', data: [{ a: 1 }] });
    expect(r.valid).toBe(false);
    expect(r.errors[0].path).toBe('type');
  });

  it('accepts a valid line spec', () => {
    const r = validateSpec({
      type: 'line',
      data: [
        { d: '2024-01', v: 1 },
        { d: '2024-02', v: 2 },
      ],
      encoding: { x: { field: 'd' }, y: { field: 'v' } },
    });
    expect(r.valid).toBe(true);
    expect(r.errors).toHaveLength(0);
  });

  it('requires encoding channels for charts', () => {
    const r = validateSpec({ type: 'line', data: [{ d: 1, v: 2 }], encoding: { x: { field: 'd' } } });
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.path === 'encoding.y')).toBe(true);
  });

  it('warns about unknown fields but stays valid', () => {
    const r = validateSpec({
      type: 'scatter',
      data: [{ a: 1, b: 2 }],
      encoding: { x: { field: 'a' }, y: { field: 'missing' } },
    });
    expect(r.valid).toBe(true);
    expect(r.warnings.some((w) => w.path === 'encoding.y.field')).toBe(true);
  });

  it('validates kpi value', () => {
    expect(validateSpec({ type: 'kpi', value: 42 }).valid).toBe(true);
    expect(validateSpec({ type: 'kpi' }).valid).toBe(false);
    expect(validateSpec({ type: 'kpi', value: { field: 'sales', aggregate: 'sum' }, data: [{ sales: 1 }] }).valid).toBe(
      true,
    );
  });

  it('validates pie label objects', () => {
    const data = [
      { c: 'A', v: 5 },
      { c: 'B', v: 3 },
    ];
    expect(validateSpec({ type: 'pie', data, encoding: { theta: { field: 'v' }, color: { field: 'c' } }, labels: true }).valid).toBe(true);
    expect(
      validateSpec({
        type: 'pie',
        data,
        encoding: { theta: { field: 'v' }, color: { field: 'c' } },
        labels: { placement: 'outside', content: 'category-percent', minShare: 0.02, connector: 'muted' },
      }).valid,
    ).toBe(true);
    const bad = validateSpec({
      type: 'pie',
      data,
      encoding: { theta: { field: 'v' }, color: { field: 'c' } },
      labels: { placement: 'sideways', content: 'nope', minShare: 2 },
    });
    expect(bad.valid).toBe(false);
    expect(bad.errors.some((e) => e.path === 'labels.placement')).toBe(true);
    expect(bad.errors.some((e) => e.path === 'labels.content')).toBe(true);
    expect(bad.errors.some((e) => e.path === 'labels.minShare')).toBe(true);
  });

  it('validates matrix requirements', () => {
    const bad = validateSpec({ type: 'matrix', data: [{ r: 'a', v: 1 }] });
    expect(bad.valid).toBe(false);
    const good = validateSpec({
      type: 'matrix',
      data: [{ r: 'a', v: 1 }],
      rows: ['r'],
      values: [{ field: 'v', op: 'sum' }],
    });
    expect(good.valid).toBe(true);
  });

  it('validates box requirements', () => {
    const good = validateSpec({
      type: 'box',
      data: [
        { g: 'A', v: 1 },
        { g: 'A', v: 3 },
      ],
      encoding: { x: { field: 'g' }, y: { field: 'v' } },
    });
    expect(good.valid).toBe(true);
    const bad = validateSpec({ type: 'box', data: [{ g: 'A', v: 1 }], encoding: { x: { field: 'g' } } });
    expect(bad.valid).toBe(false);
    expect(bad.errors.some((e) => e.path === 'encoding.y')).toBe(true);
  });

  it('validates sankey requirements', () => {
    const good = validateSpec({
      type: 'sankey',
      data: [{ s: 'A', t: 'B', v: 5 }],
      encoding: { source: { field: 's' }, target: { field: 't' }, value: { field: 'v' } },
    });
    expect(good.valid).toBe(true);
    const bad = validateSpec({
      type: 'sankey',
      data: [{ s: 'A', t: 'B', v: 5 }],
      encoding: { source: { field: 's' }, target: { field: 't' } },
    });
    expect(bad.valid).toBe(false);
    expect(bad.errors.some((e) => e.path === 'encoding.value')).toBe(true);
  });

  it('validates funnel requirements', () => {
    const good = validateSpec({
      type: 'funnel',
      data: [
        { stage: 'Visited', users: 1000 },
        { stage: 'Signed up', users: 420 },
        { stage: 'Purchased', users: 110 },
      ],
      encoding: { stage: { field: 'stage' }, value: { field: 'users' } },
    });
    expect(good.valid).toBe(true);
    const bad = validateSpec({
      type: 'funnel',
      data: [{ stage: 'Visited', users: 1000 }],
      encoding: { stage: { field: 'stage' } },
    });
    expect(bad.valid).toBe(false);
    expect(bad.errors.some((e) => e.path === 'encoding.value')).toBe(true);
  });

  it('validates choropleth requirements', () => {
    const geo = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { name: 'X' },
          geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] },
        },
      ],
    };
    const good = validateSpec({
      type: 'choropleth',
      geo,
      data: [{ k: 'X', c: 3 }],
      encoding: { key: { field: 'k' }, color: { field: 'c' } },
      featureId: 'name',
    });
    expect(good.valid).toBe(true);
    const noGeo = validateSpec({
      type: 'choropleth',
      data: [{ k: 'X', c: 3 }],
      encoding: { key: { field: 'k' }, color: { field: 'c' } },
    });
    expect(noGeo.valid).toBe(false);
    expect(noGeo.errors.some((e) => e.path === 'geo')).toBe(true);
  });

  it('assertValidSpec throws with a readable message', () => {
    expect(() => assertValidSpec({ type: 'line' })).toThrow(/Invalid Graphein chart spec/);
  });

  describe('slicers', () => {
    const data = [{ region: 'West', amount: 10 }, { region: 'East', amount: 20 }];

    it('accepts each slicer type with a field', () => {
      for (const type of ['dropdown', 'search', 'list', 'range', 'dateRange'] as const) {
        const r = validateSpec({ type, field: 'region', data });
        expect(r.valid, `${type} should be valid`).toBe(true);
      }
    });

    it('requires a field', () => {
      const r = validateSpec({ type: 'dropdown', data });
      expect(r.valid).toBe(false);
      expect(r.errors.some((e) => e.path === 'field')).toBe(true);
    });

    it('validates option flags and bounds', () => {
      expect(validateSpec({ type: 'dropdown', field: 'region', data, multiple: 'yes' }).valid).toBe(false);
      expect(validateSpec({ type: 'search', field: 'region', data, debounce: -5 }).valid).toBe(false);
      expect(validateSpec({ type: 'list', field: 'region', data, selectAll: 1 }).valid).toBe(false);
      const badRange = validateSpec({ type: 'range', field: 'amount', data, min: 10, max: 5 });
      expect(badRange.valid).toBe(false);
      expect(badRange.errors.some((e) => e.path === 'max')).toBe(true);
    });

    it('validates "as" and "param"', () => {
      expect(validateSpec({ type: 'dropdown', field: 'region', data, as: 'nope' }).valid).toBe(false);
      expect(validateSpec({ type: 'dropdown', field: 'region', data, param: '' }).valid).toBe(false);
    });
  });

  describe('interaction surface', () => {
    const data = [{ region: 'West', amount: 10 }];
    const base = { type: 'bar', data, encoding: { x: { field: 'region' }, y: { field: 'amount' } } };

    it('accepts params / highlight / filter', () => {
      const r = validateSpec({
        ...base,
        params: [{ name: 'sel', select: { type: 'point', fields: ['region'] } }],
        highlight: { param: 'other' },
        filter: [{ param: 'region' }, { field: 'amount', range: [0, 100] }],
      });
      expect(r.valid).toBe(true);
    });

    it('flags duplicate param names and bad selection types', () => {
      const dup = validateSpec({
        ...base,
        params: [
          { name: 'a', select: { type: 'point' } },
          { name: 'a', select: { type: 'interval' } },
        ],
      });
      expect(dup.valid).toBe(false);
      expect(dup.errors.some((e) => /Duplicate param/.test(e.message))).toBe(true);

      const badType = validateSpec({ ...base, params: [{ name: 'a', select: { type: 'lasso' } }] });
      expect(badType.valid).toBe(false);
    });

    it('flags malformed filter clauses', () => {
      const noForm = validateSpec({ ...base, filter: [{ field: 'amount' }] });
      expect(noForm.valid).toBe(false);
      const badOneOf = validateSpec({ ...base, filter: [{ field: 'region', oneOf: 'West' }] });
      expect(badOneOf.valid).toBe(false);
      const badRange = validateSpec({ ...base, filter: [{ field: 'amount', range: [1] }] });
      expect(badRange.valid).toBe(false);
    });

    it('validates initial param values', () => {
      const bad = validateSpec({
        ...base,
        params: [{ name: 'a', select: { type: 'point' }, value: { kind: 'bogus' } }],
      });
      expect(bad.valid).toBe(false);
    });
  });

  describe('dashboard', () => {
    const data = [
      { region: 'West', month: '2024-01', sales: 10 },
      { region: 'East', month: '2024-02', sales: 20 },
    ];
    const dash = (over: Record<string, unknown> = {}) => ({
      type: 'dashboard',
      data,
      views: [
        { id: 'slicer', spec: { type: 'dropdown', field: 'region' } },
        {
          id: 'bars',
          spec: { type: 'bar', encoding: { x: { field: 'region' }, y: { field: 'sales' } } },
        },
      ],
      ...over,
    });

    it('accepts a valid auto dashboard (views inherit data)', () => {
      const r = validateSpec(dash());
      expect(r.valid).toBe(true);
    });

    it('requires a non-empty views array', () => {
      expect(validateSpec({ type: 'dashboard', views: [] }).valid).toBe(false);
      expect(validateSpec({ type: 'dashboard' }).valid).toBe(false);
    });

    it('flags duplicate view ids', () => {
      const r = validateSpec(
        dash({
          views: [
            { id: 'dup', spec: { type: 'dropdown', field: 'region' } },
            { id: 'dup', spec: { type: 'dropdown', field: 'region' } },
          ],
        }),
      );
      expect(r.valid).toBe(false);
      expect(r.errors.some((e) => /Duplicate view id/.test(e.message))).toBe(true);
    });

    it('path-prefixes errors from a nested view spec', () => {
      const r = validateSpec(
        dash({
          views: [{ id: 'bad', spec: { type: 'bar', encoding: { y: { field: 'sales' } } } }],
        }),
      );
      expect(r.valid).toBe(false);
      expect(r.errors.some((e) => e.path.startsWith('views[0].spec.encoding'))).toBe(true);
    });

    it('rejects explicit links that reference unknown views', () => {
      const r = validateSpec(dash({ interactions: [{ source: 'nope', target: 'bars' }] }));
      expect(r.valid).toBe(false);
      expect(r.errors.some((e) => e.path === 'interactions[0].source')).toBe(true);

      const r2 = validateSpec(dash({ interactions: [{ source: 'slicer', target: ['ghost'] }] }));
      expect(r2.valid).toBe(false);
      expect(r2.errors.some((e) => e.path.startsWith('interactions[0].target'))).toBe(true);
    });

    it('accepts "*" targets and validates link "as"', () => {
      expect(validateSpec(dash({ interactions: [{ source: 'slicer', target: '*' }] })).valid).toBe(true);
      const bad = validateSpec(dash({ interactions: [{ source: 'slicer', target: 'bars', as: 'glow' }] }));
      expect(bad.valid).toBe(false);
    });

    it('validates layout and grid placement', () => {
      expect(validateSpec(dash({ layout: { cols: -1 } })).valid).toBe(false);
      const badPlace = validateSpec(
        dash({
          views: [{ id: 'v', x: 0, spec: { type: 'dropdown', field: 'region' } }],
        }),
      );
      expect(badPlace.valid).toBe(false);
      expect(badPlace.errors.some((e) => e.path === 'views[0].x')).toBe(true);
    });

    it('accepts interactions: "none"', () => {
      expect(validateSpec(dash({ interactions: 'none' })).valid).toBe(true);
    });

    it('validates responsive layout fields (breakpoints, navigators, subtitle)', () => {
      expect(
        validateSpec(
          dash({
            subtitle: 'Quarterly performance',
            layout: {
              cols: 12,
              navigators: 'top',
              breakpoints: [
                { maxWidth: 600, cols: 1 },
                { maxWidth: 960, cols: 6 },
              ],
            },
          }),
        ).valid,
      ).toBe(true);

      expect(validateSpec(dash({ subtitle: 42 })).valid).toBe(false);
      expect(validateSpec(dash({ layout: { navigators: 'sideways' } })).valid).toBe(false);

      const badBp = validateSpec(dash({ layout: { breakpoints: [{ maxWidth: 600 }] } }));
      expect(badBp.valid).toBe(false);
      expect(badBp.errors.some((e) => e.path === 'layout.breakpoints[0].cols')).toBe(true);
    });
  });
});
