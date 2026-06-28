import { describe, expect, it } from 'vitest';
import { assertValidSpec, validateSpec } from './validate';

const rows = [
  { region: 'East', category: 'A', sales: 10, value: 2, date: '2024-01-01' },
  { region: 'West', category: 'B', sales: 20, value: 4, date: '2024-02-01' },
];

const paths = (spec: unknown) => validateSpec(spec).errors.map((e) => e.path);
const warningPaths = (spec: unknown) => validateSpec(spec).warnings.map((e) => e.path);

describe('validateSpec additional chart branches', () => {
  it('handles root, missing type, unknown type, and assertValidSpec failures', () => {
    expect(validateSpec(null).errors[0].path).toBe('');
    expect(validateSpec({}).errors[0].path).toBe('type');
    const typo = validateSpec({ type: 'baar', data: rows });
    expect(typo.errors[0].path).toBe('type');
    expect(typo.errors[0].suggestion?.kind).toBe('chartType');
    expect(typo.errors[0].fix?.[0]).toEqual({ op: 'replace', path: '/type', value: 'bar' });
    expect(() => assertValidSpec({ type: 'bar', data: rows })).toThrow('Invalid Graphein chart spec');
  });

  it('validates required encoding channels and field references for specialist charts', () => {
    expect(paths({ type: 'sankey', data: rows, encoding: { source: { field: 'region' } } })).toEqual(
      expect.arrayContaining(['encoding.target', 'encoding.value']),
    );
    expect(paths({ type: 'treemap', data: rows, encoding: { category: { field: 'category' } } })).toContain(
      'encoding.value',
    );
    expect(
      paths({ type: 'dumbbell', data: rows, encoding: { category: { field: 'category' }, value: { field: 'value' } } }),
    ).toContain('encoding.group');
    expect(
      warningPaths({
        type: 'heatmap',
        data: rows,
        encoding: { x: { field: 'regoin' }, y: { field: 'category' }, color: { field: 'sales' } },
      }),
    ).toContain('encoding.x.field');
  });

  it('validates gauge and bullet value refs, bounds, bands, and ranges', () => {
    expect(paths({ type: 'gauge', value: 'bad', max: Infinity, min: 10, bands: [{ to: 'x' }] })).toEqual(
      expect.arrayContaining(['value', 'max', 'bands[0].to']),
    );
    expect(paths({ type: 'gauge', value: 1, min: 5, max: 5 })).toContain('max');
    expect(paths({ type: 'bullet', value: { field: '' }, target: false, min: 'x', max: NaN, ranges: [1, 'bad'] })).toEqual(
      expect.arrayContaining(['value.field', 'target', 'min', 'max', 'ranges[1]']),
    );
  });

  it('validates choropleth geo, combo layers, histogram bins, and slicers', () => {
    expect(paths({ type: 'choropleth', data: rows, encoding: { key: { field: 'region' }, color: { field: 'sales' } } })).toContain(
      'geo',
    );
    expect(
      warningPaths({
        type: 'choropleth',
        data: rows,
        geo: { type: 'FeatureCollection', features: [] },
        encoding: { key: { field: 'region' }, color: { field: 'sales' } },
      }),
    ).toContain('geo');

    expect(
      paths({
        type: 'combo',
        data: rows,
        encoding: { x: { field: 'date', type: 'quantitative' } },
        layers: [{ mark: 'bars', encoding: {}, axis: 'middle' }],
      }),
    ).toEqual(expect.arrayContaining(['layers[0].mark', 'layers[0].encoding.y', 'layers[0].axis']));
    expect(
      warningPaths({
        type: 'combo',
        data: rows,
        encoding: { x: { field: 'date', type: 'quantitative' } },
        layers: [{ mark: 'bar', encoding: { y: { field: 'sales' } } }],
      }),
    ).toContain('encoding.x');

    expect(
      paths({
        type: 'histogram',
        data: rows,
        encoding: { x: { field: 'sales' } },
        bin: { maxbins: 0, step: -1, extent: [5, 1], nice: 'yes' },
        density: 'yes',
        cornerRadius: -1,
      }),
    ).toEqual(expect.arrayContaining(['bin.maxbins', 'bin.step', 'bin.extent', 'bin.nice', 'density', 'cornerRadius']));

    expect(paths({ type: 'range', data: rows, field: 'sales', param: '', as: 'other', min: 5, max: 2, step: -1 })).toEqual(
      expect.arrayContaining(['param', 'as', 'step', 'max']),
    );
    expect(paths({ type: 'dropdown', data: rows, field: 'region', multiple: 'yes' })).toContain('multiple');
    expect(paths({ type: 'search', data: rows, field: 'region', debounce: -1 })).toContain('debounce');
    expect(paths({ type: 'list', data: rows, field: 'region', searchThreshold: -1, selectAll: 'yes' })).toEqual(
      expect.arrayContaining(['searchThreshold', 'selectAll']),
    );
    expect(paths({ type: 'dateRange', data: rows, field: 'date', presets: 'yes' })).toContain('presets');
  });

  it('validates table and matrix formatting options', () => {
    const table = validateSpec({
      type: 'table',
      data: rows,
      columns: [
        {
          field: 'sales',
          conditionalFormat: { type: 'rules', rules: [{ when: 'between', value: 5, to: 'bad', weight: 'heavy', icon: 7 }] },
          negativeStyle: 'paren-red',
          prefix: 1,
          suffix: 2,
          group: 3,
          hidden: 'no',
          sortable: 'yes',
          wrap: 'sometimes',
          total: 'bogus',
        },
      ],
      density: 'tight',
      totals: { label: 3 },
    });
    expect(table.errors.map((e) => e.path)).toEqual(
      expect.arrayContaining([
        'columns[0].conditionalFormat.rules[0].to',
        'columns[0].conditionalFormat.rules[0].weight',
        'columns[0].conditionalFormat.rules[0].icon',
        'columns[0].negativeStyle',
        'columns[0].prefix',
        'columns[0].hidden',
        'columns[0].total',
        'density',
        'totals.label',
      ]),
    );

    const matrix = validateSpec({
      type: 'matrix',
      data: rows,
      rows: ['region'],
      columns: 'category',
      values: [
        {
          field: 'sales',
          op: 'summ',
          conditionalFormat: {
            type: 'icon',
            domain: [0, 'x'],
            set: 'flags',
            position: 'middle',
            rules: [{ when: 'gt', value: 'x', color: 1 }],
          },
          negativeStyle: 'bad',
          showAs: 'percent',
          prefix: 1,
        },
      ],
      columnSort: { by: 'unknown', valueIndex: -1, order: 'sideways' },
    });
    expect(matrix.errors.map((e) => e.path)).toEqual(
      expect.arrayContaining([
        'values[0].op',
        'values[0].conditionalFormat.domain',
        'values[0].conditionalFormat.set',
        'values[0].conditionalFormat.position',
        'values[0].conditionalFormat.rules[0].value',
        'values[0].conditionalFormat.rules[0].color',
        'values[0].negativeStyle',
        'values[0].showAs',
        'values[0].prefix',
        'columns',
        'columnSort.by',
        'columnSort.valueIndex',
        'columnSort.order',
      ]),
    );
  });
});

describe('validateSpec interactions and adornments', () => {
  it('validates params, highlight, filter, annotations, insights, trendline, facet, sketch, and log domains', () => {
    const result = validateSpec({
      type: 'bar',
      data: rows,
      encoding: {
        x: { field: 'region', scale: { type: 'log', domain: [0, 10] } },
        y: { field: 'sales', scale: { type: 'log', domain: [-1, 20] } },
      },
      params: [
        { name: 'sel', select: { type: 'brush' }, value: { kind: 'point' } },
        { name: 'sel', select: null },
        { name: '', select: { type: 'point' }, value: { kind: 'text', field: 7 } },
      ],
      highlight: [{}],
      filter: [{ field: '', equals: 1, oneOf: 'bad' }, { field: 'region', contains: 3 }, null],
      annotations: [
        { type: 'pont', axis: 'z', value: 1, from: 0, label: 2, strokeDash: [1, NaN], labelPosition: 'centre' },
        { type: 'point', x: {}, y: 1, markerRadius: 'big' },
        { type: 'zone', from: 1 },
      ],
      insights: { max: 'yes' },
      trendline: { method: 'quadratic', label: 'yes', color: 3, strokeWidth: -1, strokeDash: [1, 'x'] },
      facet: { field: '', columns: 0, sort: 'natural' },
      sketch: { fillStyle: 'dots', roughness: 'high', font: 'ignored-by-validator' },
    });
    expect(result.errors.map((e) => e.path)).toEqual(
      expect.arrayContaining([
        'params[0].select.type',
        'params[0].value.fields',
        'params[0].value.tuples',
        'params[1].name',
        'params[1].select',
        'params[2].name',
        'params[2].value.field',
        'params[2].value.query',
        'highlight[0]',
        'filter[0].field',
        'filter[0].oneOf',
        'filter[1].contains',
        'filter[2]',
        'annotations[0].type',
        'annotations[0].axis',
        'annotations[0].label',
        'annotations[0].strokeDash',
        'annotations[0].labelPosition',
        'annotations[1]',
        'annotations[1].markerRadius',
        'annotations[2]',
        'insights.max',
        'facet.field',
        'facet.columns',
        'facet.sort',
        'sketch.fillStyle',
        'sketch.roughness',
      ]),
    );
    expect(result.warnings.map((w) => w.path)).toEqual(
      expect.arrayContaining(['encoding.x.scale.domain', 'encoding.y.scale.domain', 'filter[0]', 'annotations[0]', 'trendline']),
    );
  });

  it('validates trendline object details on supported chart types', () => {
    const result = validateSpec({
      type: 'scatter',
      data: rows,
      encoding: { x: { field: 'sales' }, y: { field: 'value' } },
      trendline: { method: 'quadratic', label: 'yes', groupBy: 'series', color: 3, strokeWidth: -1, strokeDash: [1, 'x'] },
    });
    expect(result.errors.map((e) => e.path)).toEqual(
      expect.arrayContaining([
        'trendline.method',
        'trendline.label',
        'trendline.groupBy',
        'trendline.color',
        'trendline.strokeWidth',
        'trendline.strokeDash',
      ]),
    );
  });

  it('warns when optional cartesian helpers are attached to unsupported charts', () => {
    const result = validateSpec({
      type: 'pie',
      data: rows,
      encoding: { theta: { field: 'sales' }, color: { field: 'region' } },
      annotations: [{ type: 'line', value: 1 }],
      insights: true,
      trendline: true,
      facet: { field: 'region' },
      labels: { show: 'yes', placement: 'side', content: 'all', minShare: 2, connector: 'rope' },
    });
    expect(result.errors.map((e) => e.path)).toEqual(
      expect.arrayContaining(['labels.show', 'labels.placement', 'labels.content', 'labels.minShare', 'labels.connector']),
    );
    expect(result.warnings.map((w) => w.path)).toEqual(expect.arrayContaining(['annotations', 'insights', 'trendline', 'facet']));
  });
});

describe('validateDashboard additional branches', () => {
  it('validates view chrome, responsive rules, interactions, and layout sections', () => {
    const result = validateSpec({
      type: 'dashboard',
      data: rows,
      subtitle: 1,
      views: [
        {
          id: 'chart',
          spec: { type: 'bar', encoding: { x: { field: 'region' }, y: { field: 'sales' } } },
          x: 0,
          y: NaN,
          w: 'wide',
          h: -1,
          title: 1,
          frame: 'yes',
          padding: 'huge',
          responsive: [{ maxWidth: 0, w: 0, h: 'bad', hidden: 'no' }, null],
        },
        { id: 'chart', spec: { type: 'kpi', value: 1 } },
        { id: 'slicer', spec: null },
      ],
      interactions: [{ source: 'missing', target: ['chart', 'missing'], as: 'dim' }, null],
      layout: {
        cols: -1,
        navigators: 'side',
        preset: 'unknown',
        density: 'dense',
        breakpoints: [{ maxWidth: 0, cols: 'many' }, null],
        sections: [
          { id: 1, title: 2, cols: 0, collapsed: 'no', views: ['chart', 'missing', 'chart', ''] },
          null,
        ],
      },
    });
    expect(result.errors.map((e) => e.path)).toEqual(
      expect.arrayContaining([
        'views[0].x',
        'views[0].y',
        'views[0].w',
        'views[0].h',
        'views[0].title',
        'views[0].frame',
        'views[0].padding',
        'views[0].responsive[0].maxWidth',
        'views[0].responsive[0].w',
        'views[0].responsive[0].h',
        'views[0].responsive[0].hidden',
        'views[0].responsive[1]',
        'views[1].id',
        'views[2].spec',
        'interactions[0].source',
        'interactions[0].target[1]',
        'interactions[0].as',
        'interactions[1]',
        'subtitle',
        'layout.cols',
        'layout.navigators',
        'layout.preset',
        'layout.density',
        'layout.breakpoints[0].maxWidth',
        'layout.breakpoints[0].cols',
        'layout.breakpoints[1]',
        'layout.sections[0].id',
        'layout.sections[0].title',
        'layout.sections[0].cols',
        'layout.sections[0].collapsed',
        'layout.sections[0].views[1]',
        'layout.sections[0].views[2]',
        'layout.sections[0].views[3]',
        'layout.sections[1]',
      ]),
    );
  });
});
