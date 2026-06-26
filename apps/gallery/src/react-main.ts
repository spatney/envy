/**
 * Real-browser smoke test page for @envy/react.
 *
 * Mounts several `<Chart>` components (via createElement so the page needs no JSX
 * transform) to prove the React wrapper drives the real @envy/core runtime —
 * canvas marks, DOM overlay, and the virtualized table — in an actual browser.
 * Signals `data-shot-ready` once mounted for the Playwright harness.
 */
import { createElement as h } from 'react';
import { createRoot } from 'react-dom/client';
import { Chart } from '@envy/react';
import type { ChartSpec } from '@envy/core';

const lineSpec: ChartSpec = {
  type: 'line',
  title: 'Monthly active users',
  data: [
    { month: '2024-01', users: 4200 },
    { month: '2024-02', users: 4650 },
    { month: '2024-03', users: 5010 },
    { month: '2024-04', users: 4880 },
    { month: '2024-05', users: 5430 },
    { month: '2024-06', users: 6120 },
  ],
  encoding: {
    x: { field: 'month', type: 'temporal' },
    y: { field: 'users', type: 'quantitative', format: ',d' },
  },
};

const barSpec: ChartSpec = {
  type: 'bar',
  title: 'Revenue by quarter & region',
  data: [
    { quarter: 'Q1', region: 'West', revenue: 210 },
    { quarter: 'Q1', region: 'East', revenue: 180 },
    { quarter: 'Q2', region: 'West', revenue: 245 },
    { quarter: 'Q2', region: 'East', revenue: 205 },
    { quarter: 'Q3', region: 'West', revenue: 268 },
    { quarter: 'Q3', region: 'East', revenue: 230 },
    { quarter: 'Q4', region: 'West', revenue: 290 },
    { quarter: 'Q4', region: 'East', revenue: 250 },
  ],
  encoding: {
    x: { field: 'quarter' },
    y: { field: 'revenue', title: 'Revenue', format: '$,d' },
    series: { field: 'region' },
  },
};

const tableSpec: ChartSpec = {
  type: 'table',
  title: 'Orders',
  sort: { field: 'sales', order: 'desc' },
  data: [
    { order: 'ORD-1002', date: '2024-05-03', region: 'East', sales: 9600, margin: 0.62 },
    { order: 'ORD-1004', date: '2024-05-07', region: 'West', sales: 7400, margin: 0.55 },
    { order: 'ORD-1005', date: '2024-05-09', region: 'South', sales: 5230, margin: 0.27 },
    { order: 'ORD-1001', date: '2024-05-02', region: 'West', sales: 4820, margin: 0.31 },
    { order: 'ORD-1003', date: '2024-05-05', region: 'North', sales: 3120, margin: 0.18 },
    { order: 'ORD-1006', date: '2024-05-11', region: 'East', sales: 2480, margin: 0.15 },
  ],
  columns: [
    { field: 'order', title: 'Order' },
    { field: 'date', title: 'Date', format: '%b %e, %Y' },
    { field: 'region', title: 'Region' },
    {
      field: 'sales',
      title: 'Sales',
      format: '$,.0f',
      align: 'right',
      conditionalFormat: { type: 'bar' },
    },
    {
      field: 'margin',
      title: 'Margin',
      format: '.1%',
      align: 'right',
      conditionalFormat: { type: 'colorScale' },
    },
  ],
};

function card(title: string, spec: ChartSpec, w: number, h2: number) {
  return h(
    'div',
    { className: 'card', style: { width: `${w}px` } },
    h('p', { className: 'cap' }, title),
    h('div', { style: { width: '100%', height: `${h2}px` } }, h(Chart, { spec })),
  );
}

function App() {
  return h(
    'div',
    { style: { display: 'flex', gap: '18px', padding: '16px 24px 28px', flexWrap: 'wrap' } },
    card('line', lineSpec, 420, 280),
    card('bar (grouped)', barSpec, 420, 280),
    card('table', tableSpec, 480, 280),
  );
}

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(h(App));
}

// Signal readiness after two frames so the charts have painted.
requestAnimationFrame(() =>
  requestAnimationFrame(() => document.documentElement.setAttribute('data-shot-ready', 'true')),
);
