import type { ChartSpec, GeoFeatureCollection } from 'graphein';
import {
  boxDistributions,
  categorical,
  choroplethMetric,
  heatmapGrid,
  salesTable,
  sankeyFlows,
  scatter,
  timeSeries,
  type Datum,
} from './data';
import usStatesRaw from './us-states.albers.json';
import { funnelData, slicerSpecs } from './interactive';

const usStates = usStatesRaw as unknown as GeoFeatureCollection;
const usStateNames = usStates.features
  .map((f) => (f.properties?.name as string | undefined) ?? '')
  .filter(Boolean);

export interface Scenario {
  id: string;
  title: string;
  group: string;
  spec: () => ChartSpec;
  /** One-line description shown on gallery cards. */
  blurb?: string;
  /** Extra search terms (title + group are always searched). */
  keywords?: string;
  /** Surface on the Home featured grid. */
  featured?: boolean;
  /** Span two columns in the gallery grid (wide charts: flows, maps, tables). */
  wide?: boolean;
}

const REGIONS = ['West', 'East', 'North', 'South'];

const baseScenarios: Scenario[] = [
  // --- Line ---
  {
    id: 'line-single',
    title: 'Line — single series',
    group: 'Line',
    spec: () => ({
      type: 'line',
      data: timeSeries({ points: 52, seed: 3 }),
      encoding: { x: { field: 'date', type: 'temporal' }, y: { field: 'value', title: 'Value' } },
      title: { text: 'Weekly active users', subtitle: 'Trailing 12 months' },
    }),
  },
  {
    id: 'line-multi',
    title: 'Line — multi series',
    group: 'Line',
    spec: () => ({
      type: 'line',
      data: timeSeries({ series: REGIONS, points: 48, seed: 5 }),
      encoding: {
        x: { field: 'date', type: 'temporal' },
        y: { field: 'value', title: 'Revenue ($k)' },
        series: { field: 'series' },
      },
      title: 'Revenue by region',
    }),
  },
  {
    id: 'line-smooth',
    title: 'Line — smooth curve + points',
    group: 'Line',
    spec: () => ({
      type: 'line',
      data: timeSeries({ series: ['North', 'South'], points: 16, seed: 8 }),
      encoding: {
        x: { field: 'date', type: 'temporal' },
        y: { field: 'value' },
        series: { field: 'series' },
      },
      curve: 'monotone',
      points: true,
      title: 'Smooth interpolation',
    }),
  },
  {
    id: 'line-dense',
    title: 'Line — 50k points (LTTB)',
    group: 'Line',
    spec: () => ({
      type: 'line',
      data: timeSeries({ points: 50000, stepDays: 1, noise: 8, seasonAmp: 30, trend: 0.4, seed: 12 }),
      encoding: { x: { field: 'date', type: 'temporal' }, y: { field: 'value', title: 'Signal' } },
      title: { text: 'High-frequency signal', subtitle: '50,000 points, downsampled for drawing' },
    }),
  },
  // --- Area ---
  {
    id: 'area-single',
    title: 'Area — single series',
    group: 'Area',
    spec: () => ({
      type: 'line',
      data: timeSeries({ points: 40, seed: 4, base: 60 }),
      encoding: { x: { field: 'date', type: 'temporal' }, y: { field: 'value' } },
      area: true,
      title: 'Filled area',
    }),
  },
  {
    id: 'area-stacked',
    title: 'Area — stacked',
    group: 'Area',
    spec: () => ({
      type: 'area',
      data: timeSeries({ series: REGIONS, points: 36, seed: 6 }),
      encoding: {
        x: { field: 'date', type: 'temporal' },
        y: { field: 'value' },
        series: { field: 'series' },
      },
      stack: true,
      title: 'Stacked area by region',
    }),
  },
  // --- Bar ---
  {
    id: 'bar-simple',
    title: 'Bar — single series',
    group: 'Bar',
    spec: () => ({
      type: 'bar',
      data: categorical({ categories: ['Q1', 'Q2', 'Q3', 'Q4'] }),
      encoding: { x: { field: 'category' }, y: { field: 'value', title: 'Revenue' } },
      title: 'Quarterly revenue',
    }),
  },
  {
    id: 'bar-grouped',
    title: 'Bar — grouped',
    group: 'Bar',
    spec: () => ({
      type: 'bar',
      data: categorical({ categories: ['Q1', 'Q2', 'Q3', 'Q4'], series: REGIONS }),
      encoding: {
        x: { field: 'category' },
        y: { field: 'value' },
        series: { field: 'series' },
      },
      title: 'Revenue by quarter & region',
    }),
  },
  {
    id: 'bar-stacked',
    title: 'Bar — stacked',
    group: 'Bar',
    spec: () => ({
      type: 'bar',
      data: categorical({ categories: ['Q1', 'Q2', 'Q3', 'Q4'], series: REGIONS }),
      encoding: {
        x: { field: 'category' },
        y: { field: 'value' },
        series: { field: 'series' },
      },
      stack: true,
      title: 'Stacked revenue',
    }),
  },
  // --- Scatter ---
  {
    id: 'scatter-groups',
    title: 'Scatter — grouped',
    group: 'Scatter',
    spec: () => ({
      type: 'scatter',
      data: scatter({ n: 90, groups: ['Alpha', 'Beta', 'Gamma'] }),
      encoding: {
        x: { field: 'x', title: 'Spend' },
        y: { field: 'y', title: 'Return' },
        color: { field: 'group' },
        size: { field: 'size' },
      },
      title: 'Spend vs. return',
    }),
  },
  // --- Pie ---
  {
    id: 'pie-basic',
    title: 'Pie — share',
    group: 'Pie',
    spec: () => ({
      type: 'pie',
      data: categorical({ categories: REGIONS, series: ['Share'] }),
      encoding: { theta: { field: 'value' }, color: { field: 'category' } },
      title: 'Market share',
    }),
  },
  {
    id: 'donut-basic',
    title: 'Donut',
    group: 'Pie',
    spec: () => ({
      type: 'pie',
      data: categorical({ categories: ['Furniture', 'Office', 'Tech'], series: ['Sales'] }),
      encoding: { theta: { field: 'value' }, color: { field: 'category' } },
      donut: true,
      labels: true,
      title: 'Sales by category',
    }),
  },
  {
    id: 'donut-callouts',
    title: 'Donut — callout labels',
    group: 'Pie',
    spec: () => ({
      type: 'pie',
      data: [
        { browser: 'Chrome', share: 53.02 },
        { browser: 'Safari', share: 18.61 },
        { browser: 'Edge', share: 11.4 },
        { browser: 'Firefox', share: 7.07 },
        { browser: 'Samsung Internet', share: 4.12 },
        { browser: 'Opera', share: 2.43 },
        { browser: 'UC Browser', share: 1.74 },
        { browser: 'Other', share: 1.61 },
      ],
      encoding: {
        theta: { field: 'share', title: 'Share', format: '.1f' },
        color: { field: 'browser' },
      },
      donut: 0.55,
      labels: { placement: 'auto', content: 'category-percent', connector: 'slice', minShare: 0.01 },
      legend: false,
      title: 'Browser share',
    }),
  },
  // --- Funnel ---
  {
    id: 'funnel-conversion',
    title: 'Funnel — conversion',
    group: 'Funnel',
    spec: () => ({
      type: 'funnel',
      data: funnelData(),
      encoding: { stage: { field: 'stage' }, value: { field: 'users', title: 'Users' } },
      title: { text: 'Signup funnel', subtitle: 'Users retained at each stage' },
      percent: 'first',
    }),
  },
  // --- Heatmap ---
  {
    id: 'heatmap-week',
    title: 'Heatmap — week × hour',
    group: 'Heatmap',
    spec: () => ({
      type: 'heatmap',
      data: heatmapGrid(),
      encoding: {
        x: { field: 'hour' },
        y: { field: 'day' },
        color: { field: 'value', type: 'quantitative' },
      },
      scheme: 'teal',
      title: 'Traffic by day & hour',
    }),
  },
  // --- KPI ---
  {
    id: 'kpi-basic',
    title: 'KPI — metric + delta',
    group: 'KPI',
    spec: () => ({
      type: 'kpi',
      value: { field: 'sales', aggregate: 'sum' },
      data: timeSeries({
        points: 14,
        stepDays: 30,
        base: 5200,
        trend: 70,
        seasonAmp: 520,
        noise: 180,
        seed: 5,
        valueField: 'sales',
      }),
      label: 'Total sales',
      delta: 0.124,
      format: '$,.0f',
      sparkline: true,
    }),
  },
  // --- Table ---
  {
    id: 'table-sales',
    title: 'Data table — sales',
    group: 'Table',
    spec: () => ({
      type: 'table',
      data: salesTable({ n: 200 }),
      columns: [
        { field: 'order', title: 'Order', group: 'Order', sortable: false },
        { field: 'date', title: 'Date', format: '%b %e, %Y', group: 'Order' },
        { field: 'region', title: 'Region', group: 'Customer' },
        { field: 'category', title: 'Category', group: 'Customer' },
        { field: 'units', title: 'Units', align: 'right', group: 'Performance', total: 'sum' },
        { field: 'sales', title: 'Sales', format: ',.0f', prefix: '$', align: 'right', group: 'Performance', conditionalFormat: { type: 'bar', color: '#0d9488', showValue: true } },
        { field: 'margin', title: 'Margin', format: '.1%', align: 'right', group: 'Performance', conditionalFormat: { type: 'icon', set: 'trafficLights' } },
      ],
      density: 'compact',
      totals: { label: 'Total' },
      sort: { field: 'sales', order: 'desc' },
      title: 'Orders',
    }),
  },
  // --- Box & whisker ---
  {
    id: 'box-basic',
    title: 'Box — distribution by group',
    group: 'Box',
    spec: () => ({
      type: 'box',
      data: boxDistributions({
        categories: ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo'],
        n: 90,
        seed: 41,
        base: 64,
        spread: 13,
      }),
      encoding: { x: { field: 'category' }, y: { field: 'value', title: 'Latency (ms)' } },
      title: { text: 'Response time by cohort', subtitle: 'Tukey whiskers · 1.5×IQR' },
    }),
  },
  {
    id: 'box-grouped',
    title: 'Box — grouped series',
    group: 'Box',
    spec: () => ({
      type: 'box',
      data: boxDistributions({
        categories: ['Q1', 'Q2', 'Q3', 'Q4'],
        series: ['2023', '2024'],
        n: 70,
        seed: 7,
        base: 52,
        spread: 12,
      }),
      encoding: {
        x: { field: 'category' },
        y: { field: 'value', title: 'Score' },
        series: { field: 'series' },
      },
      title: 'Scores by quarter & year',
    }),
  },
  {
    id: 'box-long',
    title: 'Box — many groups, long labels',
    group: 'Box',
    spec: () => ({
      type: 'box',
      data: boxDistributions({
        categories: [
          'North America',
          'South America',
          'Western Europe',
          'Eastern Europe',
          'Middle East',
          'Sub-Saharan Africa',
          'South Asia',
          'East Asia & Pacific',
        ],
        n: 60,
        seed: 19,
        base: 70,
        spread: 16,
      }),
      encoding: { x: { field: 'category' }, y: { field: 'value', title: 'Delivery (hrs)' } },
      title: 'Fulfilment time by region',
    }),
  },
  // --- Sankey ---
  {
    id: 'sankey-energy',
    title: 'Sankey — energy flow',
    group: 'Sankey',
    spec: () => ({
      type: 'sankey',
      data: sankeyFlows('energy'),
      encoding: {
        source: { field: 'source' },
        target: { field: 'target' },
        value: { field: 'value', title: 'TWh' },
      },
      title: { text: 'Energy supply → demand', subtitle: 'Generation mix to end use' },
    }),
  },
  {
    id: 'sankey-budget',
    title: 'Sankey — P&L breakdown',
    group: 'Sankey',
    spec: () => ({
      type: 'sankey',
      data: sankeyFlows('budget'),
      encoding: {
        source: { field: 'source' },
        target: { field: 'target' },
        value: { field: 'value', title: '$M', format: '$,.0f' },
      },
      title: 'Revenue to net income',
    }),
  },
  // --- Choropleth ---
  {
    id: 'choropleth-states',
    title: 'Choropleth — US states',
    group: 'Choropleth',
    spec: () => ({
      type: 'choropleth',
      geo: usStates,
      data: choroplethMetric(usStateNames, { seed: 51, base: 40 }),
      encoding: {
        key: { field: 'name' },
        color: { field: 'value', title: 'Index', type: 'quantitative' },
      },
      featureId: 'name',
      projection: 'identity',
      scheme: 'teal',
      title: { text: 'Adoption index by state', subtitle: 'Higher is stronger' },
    }),
  },
  {
    id: 'choropleth-blues',
    title: 'Choropleth — sequential blues',
    group: 'Choropleth',
    spec: () => ({
      type: 'choropleth',
      geo: usStates,
      data: choroplethMetric(usStateNames, { seed: 88, base: 30 }),
      encoding: {
        key: { field: 'name' },
        color: { field: 'value', title: 'Population (M)', type: 'quantitative' },
      },
      featureId: 'name',
      projection: 'identity',
      scheme: 'blues',
      title: 'Population by state',
    }),
  },
  // --- Matrix (pivot table) ---
  {
    id: 'matrix-region',
    title: 'Matrix — pivot table',
    group: 'Matrix',
    spec: () => ({
      type: 'matrix',
      data: salesTable({ n: 120 }),
      rows: ['region', 'segment'],
      columns: ['category'],
      values: [
        { field: 'sales', op: 'sum', label: 'Sales', format: '$,.0f', conditionalFormat: { type: 'colorScale', scheme: 'teal' } },
        { field: 'sales', op: 'sum', label: '% total', showAs: 'percentOfTotal', conditionalFormat: { type: 'bar', color: '#14b8a6' } },
      ],
      subtotals: true,
      grandTotals: true,
      density: 'compact',
      columnSort: { by: 'value', valueIndex: 0, order: 'desc' },
      title: { text: 'Sales pivot', subtitle: 'Region × segment × category' },
    }),
  },
  // --- Slicer (interactive controls) ---
  ...slicerSpecs().map((s) => ({ ...s, group: 'Slicer' })),
];

/**
 * Per-scenario presentation metadata for the gallery shell: a one-line `blurb`,
 * extra `keywords` for search, whether to `feature` it on the Home grid, and
 * whether it should span two columns (`wide`) because the mark needs the room.
 */
const META: Record<string, Omit<Partial<Scenario>, 'id' | 'title' | 'group' | 'spec'>> = {
  'line-single': { blurb: 'A single metric over time — the everyday trend line.', keywords: 'trend time temporal' },
  'line-multi': { blurb: 'Compare several series at once with an auto legend.', keywords: 'compare series legend', featured: true },
  'line-smooth': { blurb: 'Monotone-curve interpolation with emphasized points.', keywords: 'curve interpolation smooth' },
  'line-dense': { blurb: '50k points downsampled with LTTB — still crisp.', keywords: 'big data lttb downsample performance', wide: true },
  'area-single': { blurb: 'A filled line for a single cumulative quantity.', keywords: 'fill cumulative' },
  'area-stacked': { blurb: 'Part-to-whole over time, stacked by series.', keywords: 'stack part-to-whole composition', featured: true },
  'bar-simple': { blurb: 'Compare values across a handful of categories.', keywords: 'category compare column' },
  'bar-grouped': { blurb: 'Side-by-side bars for two-way category breakdowns.', keywords: 'grouped clustered category', wide: true },
  'bar-stacked': { blurb: 'Stacked bars for composition within each category.', keywords: 'stack composition', featured: true },
  'scatter-groups': { blurb: 'Correlation across groups with size + color.', keywords: 'correlation bubble size color', featured: true },
  'pie-basic': { blurb: 'The classic part-to-whole — best for a few slices.', keywords: 'share proportion slice', featured: true },
  'donut-basic': { blurb: 'A pie with a hole — room for a center label.', keywords: 'share proportion ring' },
  'donut-callouts': { blurb: 'Many small slices stay readable with outside leader-line callouts.', keywords: 'donut pie labels callout leader line share percent', featured: true },
  'funnel-conversion': { blurb: 'Stage-by-stage drop-off with retained %.', keywords: 'funnel conversion stages drop-off pipeline retention', featured: true },
  'heatmap-week': { blurb: 'Density across two categories as a color grid.', keywords: 'grid density calendar color', featured: true, wide: true },
  'kpi-basic': { blurb: 'A headline number with delta and sparkline.', keywords: 'metric number delta sparkline scorecard', featured: true },
  'table-sales': { blurb: 'Sortable, formatted tabular detail.', keywords: 'grid rows columns detail', wide: true },
  'matrix-region': { blurb: 'A cross-tab pivot with subtotals and grand totals.', keywords: 'pivot cross-tab crosstab subtotal aggregate', wide: true },
  'box-basic': { blurb: 'Spread and outliers by group, Tukey-style.', keywords: 'distribution quartile whisker outlier' },
  'box-grouped': { blurb: 'Box plots split into grouped series.', keywords: 'distribution grouped quartile' },
  'box-long': { blurb: 'Many groups with long, rotated labels.', keywords: 'distribution many labels', wide: true },
  'sankey-energy': { blurb: 'Flows between nodes sized by value.', keywords: 'flow nodes links energy alluvial', featured: true, wide: true },
  'sankey-budget': { blurb: 'A P&L walk from revenue to net income.', keywords: 'flow finance budget waterfall', wide: true },
  'choropleth-states': { blurb: 'Values shaded across US state regions.', keywords: 'map geo region states', featured: true, wide: true },
  'choropleth-blues': { blurb: 'A sequential color ramp over the same map.', keywords: 'map geo sequential scheme', wide: true },
  'slicer-dropdown': { blurb: 'Pick one or many values from a menu.', keywords: 'filter control select menu interactive' },
  'slicer-search': { blurb: 'Type to filter on a text field.', keywords: 'filter control search text interactive' },
  'slicer-list': { blurb: 'A checkbox list with select-all.', keywords: 'filter control checkbox list interactive' },
  'slicer-range': { blurb: 'A dual-handle numeric min/max slider.', keywords: 'filter control range slider numeric interactive' },
  'slicer-daterange': { blurb: 'A temporal range with relative presets.', keywords: 'filter control date time range interactive' },
};

/** The public catalog — base scenarios enriched with gallery presentation metadata. */
export const scenarios: Scenario[] = baseScenarios.map((s) => ({ ...s, ...META[s.id] }));

export function scenarioById(id: string): Scenario | undefined {
  return scenarios.find((s) => s.id === id);
}

export type { Datum };
