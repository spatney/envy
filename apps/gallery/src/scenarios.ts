import type { ChartSpec, GeoFeatureCollection } from '@envy/core';
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

const usStates = usStatesRaw as unknown as GeoFeatureCollection;
const usStateNames = usStates.features
  .map((f) => (f.properties?.name as string | undefined) ?? '')
  .filter(Boolean);

export interface Scenario {
  id: string;
  title: string;
  group: string;
  spec: () => ChartSpec;
}

const REGIONS = ['West', 'East', 'North', 'South'];

export const scenarios: Scenario[] = [
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
        { field: 'order', title: 'Order' },
        { field: 'date', title: 'Date', format: '%b %e, %Y' },
        { field: 'region', title: 'Region' },
        { field: 'category', title: 'Category' },
        { field: 'units', title: 'Units', align: 'right' },
        { field: 'sales', title: 'Sales', format: '$,.0f', align: 'right', conditionalFormat: { type: 'bar' } },
        { field: 'margin', title: 'Margin', format: '.1%', align: 'right', conditionalFormat: { type: 'colorScale' } },
      ],
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
];

export function scenarioById(id: string): Scenario | undefined {
  return scenarios.find((s) => s.id === id);
}

export type { Datum };
