/**
 * Interactive demos for the gallery — the five slicer visuals and a fully
 * auto-wired dashboard (slicer cross-filters every chart; clicking a bar
 * cross-highlights). Data is generated deterministically and baked inline so the
 * specs stay self-contained and copy-pasteable.
 */

import type { ChartSpec, DashboardSpec } from '@envy/core';
import { rng, type Datum } from './data';

const REGIONS = ['West', 'East', 'North', 'South'];
const PRODUCTS = ['Widgets', 'Gadgets', 'Gizmos'];

/** A tidy sales table: one row per region × month, with a couple of measures. */
export function interactiveData(): Datum[] {
  const r = rng(11);
  const rows: Datum[] = [];
  for (let m = 0; m < 12; m++) {
    const month = `2024-${String(m + 1).padStart(2, '0')}`;
    for (const region of REGIONS) {
      const base = 40 + REGIONS.indexOf(region) * 18;
      const season = 14 * Math.sin((m / 12) * Math.PI * 2);
      rows.push({
        region,
        month,
        product: PRODUCTS[(m + REGIONS.indexOf(region)) % PRODUCTS.length],
        sales: Math.round(base + season + r() * 22),
        units: Math.round(8 + r() * 40),
      });
    }
  }
  return rows;
}

/** Pre-aggregated region × product totals (one tidy row per pair). */
export function salesByRegionProduct(): Datum[] {
  const totals = new Map<string, { region: string; product: string; sales: number }>();
  for (const row of interactiveData()) {
    const region = row.region as string;
    const product = row.product as string;
    const key = `${region}\u0000${product}`;
    const cur = totals.get(key) ?? { region, product, sales: 0 };
    cur.sales += row.sales as number;
    totals.set(key, cur);
  }
  return [...totals.values()];
}
export function slicerSpecs(): { id: string; title: string; spec: () => ChartSpec }[] {
  return [
    {
      id: 'slicer-dropdown',
      title: 'Slicer — dropdown',
      spec: () => ({ type: 'dropdown', data: interactiveData(), field: 'region', title: 'Region', multiple: true }),
    },
    {
      id: 'slicer-search',
      title: 'Slicer — search',
      spec: () => ({ type: 'search', data: interactiveData(), field: 'product', title: 'Find product', placeholder: 'Search products…' }),
    },
    {
      id: 'slicer-list',
      title: 'Slicer — checkbox list',
      spec: () => ({ type: 'list', data: interactiveData(), field: 'region', title: 'Regions' }),
    },
    {
      id: 'slicer-range',
      title: 'Slicer — numeric range',
      spec: () => ({ type: 'range', data: interactiveData(), field: 'sales', title: 'Sales range' }),
    },
    {
      id: 'slicer-daterange',
      title: 'Slicer — date range',
      spec: () => ({ type: 'dateRange', data: interactiveData(), field: 'month', title: 'Month range' }),
    },
  ];
}

/**
 * A complete, BI-grade interactive dashboard: a navigator strip of slicers that
 * cross-filter the whole page, a KPI band, and a coordinated set of charts
 * (clicking a mark cross-highlights the others). `interactions: 'auto'` wires it
 * all with no manual links.
 */
export function dashboardDemo(): DashboardSpec {
  const data = interactiveData();
  return {
    type: 'dashboard',
    title: 'Regional revenue cockpit',
    subtitle: 'Banded BI layout · filter from the top, click a mark to cross-highlight',
    data,
    layout: {
      cols: 12,
      density: 'comfortable',
      maxWidth: 1280,
      padding: 18,
      preset: 'kpi-first',
      sections: [
        {
          id: 'overview',
          title: 'Overview',
          subtitle: 'Headline health across the selected slice',
          views: ['total', 'avg', 'units', 'regions'],
          background: 'rgba(20, 184, 166, 0.08)',
          rowHeight: 92,
        },
        {
          id: 'sales',
          title: 'Sales performance',
          subtitle: 'Regional mix, product share, and monthly trend',
          views: ['by-region', 'share', 'trend'],
        },
      ],
    },
    views: [
      // ---- Navigator strip (compact slicers reflow to the top) -------------
      {
        id: 'region',
        title: 'Region',
        accent: '#14b8a6',
        spec: { type: 'dropdown', field: 'region', title: 'Region', multiple: true },
      },
      {
        id: 'product',
        title: 'Product',
        spec: { type: 'dropdown', field: 'product', title: 'Product', multiple: true },
      },
      {
        id: 'month',
        title: 'Month',
        spec: { type: 'dateRange', field: 'month', title: 'Month' },
      },

      // ---- KPI band --------------------------------------------------------
      {
        id: 'total',
        title: 'Total sales',
        subtitle: 'Sum of revenue',
        accent: '#14b8a6',
        spec: {
          type: 'kpi',
          value: { field: 'sales', aggregate: 'sum' },
          format: ',.0f',
          delta: 0.082,
          sparkline: { field: 'sales' },
        },
        w: 3,
        h: 2,
      },
      {
        id: 'avg',
        title: 'Avg / order',
        subtitle: 'Mean order value',
        accent: '#0ea5e9',
        spec: {
          type: 'kpi',
          value: { field: 'sales', aggregate: 'mean' },
          format: ',.1f',
          delta: -0.014,
        },
        w: 3,
        h: 2,
      },
      {
        id: 'units',
        title: 'Units sold',
        subtitle: 'All products',
        accent: '#8b5cf6',
        spec: {
          type: 'kpi',
          value: { field: 'units', aggregate: 'sum' },
          format: ',.0f',
          delta: 0.045,
          sparkline: { field: 'units' },
        },
        w: 3,
        h: 2,
      },
      {
        id: 'regions',
        title: 'Active regions',
        subtitle: 'Distinct markets',
        accent: '#f59e0b',
        spec: {
          type: 'kpi',
          value: { field: 'region', aggregate: 'countDistinct' },
          format: ',.0f',
        },
        w: 3,
        h: 2,
      },

      // ---- Charts ----------------------------------------------------------
      {
        id: 'by-region',
        title: 'Sales by region',
        subtitle: 'Stacked by product',
        accent: '#14b8a6',
        spec: {
          type: 'bar',
          data: salesByRegionProduct(),
          encoding: {
            x: { field: 'region' },
            y: { field: 'sales', title: 'Sales' },
            series: { field: 'product' },
          },
          stack: true,
        },
        w: 7,
        h: 4,
        responsive: [{ maxWidth: 720, w: 12, h: 4 }],
      },
      {
        id: 'share',
        title: 'Share by product',
        subtitle: 'Donut contribution',
        accent: '#0ea5e9',
        spec: {
          type: 'pie',
          donut: true,
          encoding: {
            theta: { field: 'sales', aggregate: 'sum' },
            color: { field: 'product' },
          },
        },
        w: 5,
        h: 4,
        responsive: [{ maxWidth: 720, w: 12, h: 4 }],
      },
      {
        id: 'trend',
        title: 'Monthly trend by region',
        subtitle: 'Cross-highlight by region',
        accent: '#14b8a6',
        spec: {
          type: 'line',
          encoding: {
            x: { field: 'month', type: 'temporal' },
            y: { field: 'sales', title: 'Sales' },
            series: { field: 'region' },
          },
        },
        w: 12,
        h: 3,
        responsive: [{ maxWidth: 720, h: 4 }],
      },
    ],
    interactions: 'auto',
  };
}

/** A classic conversion funnel: tidy stage → count rows. */
export function funnelData(): Datum[] {
  return [
    { stage: 'Visited', users: 12480 },
    { stage: 'Signed up', users: 5210 },
    { stage: 'Activated', users: 3120 },
    { stage: 'Subscribed', users: 1430 },
    { stage: 'Renewed', users: 820 },
  ];
}
