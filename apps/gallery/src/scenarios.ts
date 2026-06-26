import type { ChartSpec } from '@envy/core';
import {
  categorical,
  heatmapGrid,
  salesTable,
  scatter,
  timeSeries,
  type Datum,
} from './data';

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
      data: salesTable({ n: 120 }),
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
  // --- Matrix ---
  {
    id: 'matrix-region',
    title: 'Matrix — region × category',
    group: 'Matrix',
    spec: () => ({
      type: 'matrix',
      data: salesTable({ n: 400 }),
      rows: ['region', 'segment'],
      columns: ['category'],
      values: [{ field: 'sales', op: 'sum', format: '$,.0f' }],
      subtotals: true,
      grandTotals: true,
      title: 'Sales pivot',
    }),
  },
];

export function scenarioById(id: string): Scenario | undefined {
  return scenarios.find((s) => s.id === id);
}

export type { Datum };
