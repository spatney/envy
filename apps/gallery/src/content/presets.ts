/**
 * Playground presets — a catalog of ready-to-edit ChartSpecs spanning every
 * chart type and a few data-size tiers (small / medium / large). Each preset
 * returns a fully self-contained, JSON-serializable spec (data inline) so it can
 * be dropped straight into the editor.
 */

import type { ChartSpec, DashboardSpec, GeoFeatureCollection } from 'graphein';
import {
  boxDistributions,
  categorical,
  heatmapGrid,
  rng,
  salesTable,
  sankeyFlows,
  scatter,
  timeSeries,
  type Datum,
} from './data';
import { dashboardDemo, funnelData, interactiveData } from './interactive';

export interface Preset {
  id: string;
  label: string;
  group: string;
  /** Short note about the data size/shape. */
  note: string;
  build: () => ChartSpec | DashboardSpec;
}

const REGIONS = ['West', 'East', 'North', 'South'];

/** A compact synthetic "grid map" so the choropleth preset stays editable. */
function gridChoropleth(): { geo: GeoFeatureCollection; data: Datum[] } {
  const cols = 6;
  const rows = 4;
  const r = rng(7);
  const features: GeoFeatureCollection['features'] = [];
  const data: Datum[] = [];
  let i = 0;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const name = `R${(++i).toString().padStart(2, '0')}`;
      features.push({
        type: 'Feature',
        properties: { name },
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [x, y],
              [x + 1, y],
              [x + 1, y + 1],
              [x, y + 1],
              [x, y],
            ],
          ],
        },
      });
      data.push({ region: name, value: Math.round(20 + r() * 80) });
    }
  }
  return { geo: { type: 'FeatureCollection', features }, data };
}

export const presets: Preset[] = [
  // --- Line ---
  {
    id: 'line-sm',
    label: 'Line · 12 points',
    group: 'Line',
    note: 'single series, monthly',
    build: () => ({
      type: 'line',
      title: 'Monthly active users',
      data: timeSeries({ points: 12, stepDays: 30, base: 4200, trend: 90, seasonAmp: 280, seed: 3 }),
      encoding: { x: { field: 'date', type: 'temporal' }, y: { field: 'value', title: 'Users' } },
      points: true,
    }),
  },
  {
    id: 'line-md',
    label: 'Line · multi-series',
    group: 'Line',
    note: '4 series × 48 weeks',
    build: () => ({
      type: 'line',
      title: 'Revenue by region',
      data: timeSeries({ series: REGIONS, points: 48, seed: 5 }),
      encoding: {
        x: { field: 'date', type: 'temporal' },
        y: { field: 'value', title: 'Revenue ($k)' },
        series: { field: 'series' },
      },
      curve: 'monotone',
    }),
  },
  {
    id: 'line-lg',
    label: 'Line · 800 points',
    group: 'Line',
    note: 'dense daily signal',
    build: () => ({
      type: 'line',
      title: { text: 'High-frequency signal', subtitle: '800 points' },
      data: timeSeries({ points: 800, stepDays: 1, noise: 7, seasonAmp: 28, trend: 0.5, seed: 12 }),
      encoding: { x: { field: 'date', type: 'temporal' }, y: { field: 'value', title: 'Signal' } },
      area: true,
    }),
  },
  // --- Area ---
  {
    id: 'area-stacked',
    label: 'Area · stacked',
    group: 'Area',
    note: '4 series × 36',
    build: () => ({
      type: 'area',
      title: 'Stacked area by region',
      data: timeSeries({ series: REGIONS, points: 36, seed: 6 }),
      encoding: {
        x: { field: 'date', type: 'temporal' },
        y: { field: 'value' },
        series: { field: 'series' },
      },
      stack: true,
    }),
  },
  // --- Bar ---
  {
    id: 'bar-sm',
    label: 'Bar · 4 categories',
    group: 'Bar',
    note: 'single series',
    build: () => ({
      type: 'bar',
      title: 'Quarterly revenue',
      data: categorical({ categories: ['Q1', 'Q2', 'Q3', 'Q4'] }),
      encoding: { x: { field: 'category' }, y: { field: 'value', title: 'Revenue' } },
    }),
  },
  {
    id: 'bar-grouped',
    label: 'Bar · grouped',
    group: 'Bar',
    note: '4 categories × 4 series',
    build: () => ({
      type: 'bar',
      title: 'Revenue by quarter & region',
      data: categorical({ categories: ['Q1', 'Q2', 'Q3', 'Q4'], series: REGIONS }),
      encoding: { x: { field: 'category' }, y: { field: 'value' }, series: { field: 'series' } },
    }),
  },
  {
    id: 'bar-stacked',
    label: 'Bar · stacked',
    group: 'Bar',
    note: '4 categories × 4 series',
    build: () => ({
      type: 'bar',
      title: 'Stacked revenue',
      data: categorical({ categories: ['Q1', 'Q2', 'Q3', 'Q4'], series: REGIONS }),
      encoding: { x: { field: 'category' }, y: { field: 'value' }, series: { field: 'series' } },
      stack: true,
    }),
  },
  // --- Transform (in-spec data reshaping) ---
  {
    id: 'transform-aggregate',
    label: 'Transform · aggregate raw rows',
    group: 'Transform',
    note: 'filter + group-by sum, one row per bar',
    build: () => ({
      type: 'bar',
      title: 'Revenue by region (aggregated in-spec)',
      data: [
        { ts: '2024-01-08', region: 'West', amount: 120 },
        { ts: '2024-01-22', region: 'West', amount: 95 },
        { ts: '2024-02-03', region: 'East', amount: 80 },
        { ts: '2024-02-19', region: 'East', amount: 60 },
        { ts: '2024-03-11', region: 'West', amount: 140 },
        { ts: '2024-03-27', region: 'East', amount: 75 },
        { ts: '2024-01-15', region: 'North', amount: 0 },
        { ts: '2024-02-26', region: 'North', amount: 45 },
      ],
      transform: [
        { filter: { field: 'amount', gt: 0 } },
        { aggregate: [{ op: 'sum', field: 'amount', as: 'revenue' }], groupby: ['region'] },
      ],
      encoding: { x: { field: 'region' }, y: { field: 'revenue', title: 'Revenue' } },
    }),
  },
  {
    id: 'transform-timeunit',
    label: 'Transform · group by month',
    group: 'Transform',
    note: 'timeUnit + aggregate raw timestamps',
    build: () => ({
      type: 'line',
      title: 'Monthly revenue by region',
      data: [
        { ts: '2024-01-08', region: 'West', amount: 120 },
        { ts: '2024-01-22', region: 'West', amount: 95 },
        { ts: '2024-01-12', region: 'East', amount: 70 },
        { ts: '2024-02-03', region: 'East', amount: 80 },
        { ts: '2024-02-19', region: 'West', amount: 60 },
        { ts: '2024-02-26', region: 'East', amount: 45 },
        { ts: '2024-03-11', region: 'West', amount: 140 },
        { ts: '2024-03-27', region: 'East', amount: 75 },
      ],
      transform: [
        { timeUnit: 'month', field: 'ts', as: 'month' },
        { aggregate: [{ op: 'sum', field: 'amount', as: 'amount' }], groupby: ['month', 'region'] },
      ],
      encoding: {
        x: { field: 'month', type: 'temporal' },
        y: { field: 'amount', title: 'Revenue' },
        series: { field: 'region' },
      },
    }),
  },
  {
    id: 'transform-calculate',
    label: 'Transform · calculate a column',
    group: 'Transform',
    note: 'derive margin % from raw rows',
    build: () => ({
      type: 'bar',
      title: 'Gross margin by product',
      data: [
        { product: 'Alpha', revenue: 400, cost: 250 },
        { product: 'Beta', revenue: 320, cost: 300 },
        { product: 'Gamma', revenue: 540, cost: 210 },
        { product: 'Delta', revenue: 280, cost: 260 },
      ],
      transform: [{ calculate: 'round((revenue - cost) / revenue, 3)', as: 'margin' }],
      encoding: { x: { field: 'product' }, y: { field: 'margin', title: 'Margin', format: '.0%' } },
    }),
  },
  // --- Annotations ---
  {
    id: 'annotations-target',
    label: 'Annotations · target + zone',
    group: 'Annotations',
    note: 'reference line, threshold zone, event marker',
    build: () => ({
      type: 'line',
      title: 'API latency vs. SLA',
      data: [
        { month: '2024-01', latency: 140 },
        { month: '2024-02', latency: 165 },
        { month: '2024-03', latency: 90 },
        { month: '2024-04', latency: 210 },
        { month: '2024-05', latency: 180 },
        { month: '2024-06', latency: 120 },
      ],
      encoding: {
        x: { field: 'month', type: 'temporal' },
        y: { field: 'latency', title: 'p95 (ms)' },
      },
      annotations: [
        { type: 'zone', from: 0, to: 100, label: 'Healthy', color: '#10b981' },
        { value: 200, label: 'SLA', color: '#ef4444' },
        { axis: 'x', value: '2024-04', label: 'Launch' },
      ],
    }),
  },
  {
    id: 'insights-auto',
    label: 'Auto-insights · peak + low',
    group: 'Annotations',
    note: 'insights:true marks the max & min for you',
    build: () => ({
      type: 'line',
      title: 'Monthly active users',
      data: [
        { month: '2024-01', users: 4200 },
        { month: '2024-02', users: 4650 },
        { month: '2024-03', users: 6400 },
        { month: '2024-04', users: 5100 },
        { month: '2024-05', users: 5550 },
        { month: '2024-06', users: 3000 },
      ],
      encoding: {
        x: { field: 'month', type: 'temporal' },
        y: { field: 'users', title: 'MAU' },
      },
      insights: true,
    }),
  },
  {
    id: 'trendline-fit',
    label: 'Trendline · line of best fit',
    group: 'Annotations',
    note: 'trendline:{label:true} fits a regression + R²',
    build: () => ({
      type: 'scatter',
      title: 'Ad spend vs. revenue',
      data: [
        { spend: 5, revenue: 22 },
        { spend: 8, revenue: 30 },
        { spend: 12, revenue: 34 },
        { spend: 15, revenue: 51 },
        { spend: 18, revenue: 49 },
        { spend: 22, revenue: 66 },
        { spend: 25, revenue: 61 },
        { spend: 28, revenue: 80 },
        { spend: 32, revenue: 78 },
        { spend: 36, revenue: 96 },
        { spend: 40, revenue: 92 },
        { spend: 44, revenue: 110 },
      ],
      encoding: {
        x: { field: 'spend', type: 'quantitative', title: 'Spend ($k)' },
        y: { field: 'revenue', title: 'Revenue ($k)' },
      },
      trendline: { label: true },
    }),
  },
  // --- Faceting / small multiples ---
  {
    id: 'facet-line',
    label: 'Faceting · line by region',
    group: 'Faceting',
    note: 'facet:{field} → a trellis grid sharing one set of scales',
    build: () => {
      const regions = ['West', 'East', 'South', 'North'];
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
      let seed = 7;
      const rnd = (): number => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
      const data = regions.flatMap((region) => {
        let base = 20 + rnd() * 30;
        return months.map((month) => {
          base += (rnd() - 0.4) * 12;
          return { region, month, sales: Math.max(2, Math.round(base)) };
        });
      });
      return {
        type: 'line',
        title: 'Monthly sales by region',
        data,
        encoding: { x: { field: 'month' }, y: { field: 'sales' } },
        points: true,
        facet: { field: 'region', columns: 2 },
      };
    },
  },
  {
    id: 'facet-bar',
    label: 'Faceting · grouped bars',
    group: 'Faceting',
    note: 'a shared legend + colors across every panel',
    build: () => {
      const regions = ['West', 'East', 'South', 'North'];
      const months = ['Jan', 'Feb', 'Mar', 'Apr'];
      let seed = 3;
      const rnd = (): number => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
      const data = regions.flatMap((region) =>
        ['web', 'store'].flatMap((channel) =>
          months.map((month) => ({ region, month, channel, sales: Math.round(5 + rnd() * 25) })),
        ),
      );
      return {
        type: 'bar',
        title: 'Sales by channel, per region',
        data,
        encoding: { x: { field: 'month' }, y: { field: 'sales' }, series: { field: 'channel' } },
        facet: { field: 'region' },
      };
    },
  },
  // --- Scatter ---
  {
    id: 'scatter-md',
    label: 'Scatter · 90 points',
    group: 'Scatter',
    note: '3 groups, size channel',
    build: () => ({
      type: 'scatter',
      title: 'Spend vs. return',
      data: scatter({ n: 30, groups: ['Alpha', 'Beta', 'Gamma'] }),
      encoding: {
        x: { field: 'x', title: 'Spend' },
        y: { field: 'y', title: 'Return' },
        color: { field: 'group' },
        size: { field: 'size' },
      },
    }),
  },
  {
    id: 'scatter-lg',
    label: 'Scatter · 600 points',
    group: 'Scatter',
    note: '3 groups, dense cloud',
    build: () => ({
      type: 'scatter',
      title: 'Correlation at scale',
      data: scatter({ n: 200, groups: ['Alpha', 'Beta', 'Gamma'], seed: 23 }),
      encoding: {
        x: { field: 'x', title: 'Spend' },
        y: { field: 'y', title: 'Return' },
        color: { field: 'group' },
      },
    }),
  },
  // --- Combo / dual-axis ---
  {
    id: 'combo-dual-axis',
    label: 'Combo · bars + line (dual-axis)',
    group: 'Combo',
    note: 'revenue bars (left) + conversion line (right)',
    build: () => ({
      type: 'combo',
      title: 'Revenue vs. conversion rate',
      data: [
        { month: 'Jan', revenue: 120, conversion: 0.041 },
        { month: 'Feb', revenue: 145, conversion: 0.046 },
        { month: 'Mar', revenue: 138, conversion: 0.044 },
        { month: 'Apr', revenue: 172, conversion: 0.052 },
        { month: 'May', revenue: 196, conversion: 0.058 },
        { month: 'Jun', revenue: 210, conversion: 0.061 },
      ],
      encoding: { x: { field: 'month', title: 'Month' } },
      layers: [
        { mark: 'bar', encoding: { y: { field: 'revenue', title: 'Revenue ($k)' } } },
        {
          mark: 'line',
          axis: 'right',
          points: true,
          encoding: { y: { field: 'conversion', title: 'Conversion', format: '.1%' } },
        },
      ],
    }),
  },
  {
    id: 'combo-grouped',
    label: 'Combo · grouped bars + line',
    group: 'Combo',
    note: 'two bar measures + a target line, shared axis',
    build: () => ({
      type: 'combo',
      title: 'Plan vs. actual with target',
      data: [
        { quarter: 'Q1', plan: 80, actual: 72, target: 75 },
        { quarter: 'Q2', plan: 95, actual: 101, target: 90 },
        { quarter: 'Q3', plan: 110, actual: 98, target: 105 },
        { quarter: 'Q4', plan: 130, actual: 142, target: 125 },
      ],
      encoding: { x: { field: 'quarter', title: 'Quarter' } },
      layers: [
        { mark: 'bar', encoding: { y: { field: 'plan' } } },
        { mark: 'bar', encoding: { y: { field: 'actual' } } },
        { mark: 'line', points: true, encoding: { y: { field: 'target' } } },
      ],
    }),
  },
  // --- Histogram ---
  {
    id: 'histogram-count',
    label: 'Histogram · counts',
    group: 'Histogram',
    note: '~240 raw observations, auto-binned',
    build: () => {
      const r = rng(42);
      const data: Datum[] = [];
      for (let i = 0; i < 240; i++) {
        const v = -Math.log(1 - r()) * 40 + r() * 15 + 18;
        data.push({ latency_ms: Math.round(v * 10) / 10 });
      }
      return {
        type: 'histogram',
        title: 'Request latency distribution',
        data,
        encoding: { x: { field: 'latency_ms', title: 'Latency (ms)' } },
        bin: { maxbins: 24 },
        color: '#4F46E5',
      };
    },
  },
  {
    id: 'histogram-density',
    label: 'Histogram · density',
    group: 'Histogram',
    note: 'fixed-width bins, area normalized to 1',
    build: () => {
      const r = rng(7);
      const data: Datum[] = [];
      // approx-normal via central limit (sum of uniforms)
      for (let i = 0; i < 300; i++) {
        let s = 0;
        for (let k = 0; k < 6; k++) s += r();
        data.push({ score: Math.round((50 + (s - 3) * 18) * 10) / 10 });
      }
      return {
        type: 'histogram',
        title: 'Score density',
        data,
        encoding: { x: { field: 'score', title: 'Score' } },
        bin: { step: 5 },
        density: true,
      };
    },
  },
  // --- Treemap ---
  {
    id: 'treemap-grouped',
    label: 'Treemap · grouped tiles',
    group: 'Treemap',
    note: 'revenue by product area, nested by group',
    build: () => ({
      type: 'treemap',
      title: 'Revenue by product area',
      data: [
        { group: 'Core', category: 'Platform', revenue: 420 },
        { group: 'Core', category: 'Analytics', revenue: 310 },
        { group: 'Core', category: 'Automation', revenue: 180 },
        { group: 'Growth', category: 'Marketing', revenue: 260 },
        { group: 'Growth', category: 'Sales', revenue: 230 },
        { group: 'Support', category: 'Success', revenue: 140 },
        { group: 'Support', category: 'Training', revenue: 90 },
      ],
      encoding: {
        group: { field: 'group' },
        category: { field: 'category' },
        value: { field: 'revenue', format: '$,.0f' },
      },
    }),
  },
  // --- Gauge ---
  {
    id: 'gauge-health',
    label: 'Gauge · value vs. scale',
    group: 'Gauge',
    note: 'aggregated value, qualitative bands + target',
    build: () => ({
      type: 'gauge',
      title: 'Service health',
      data: [{ uptime: 99.2 }, { uptime: 98.7 }, { uptime: 99.6 }],
      value: { field: 'uptime', aggregate: 'mean' },
      min: 0,
      max: 100,
      target: 99,
      label: 'Avg uptime',
      format: ',.1f',
      bands: [
        { to: 90, color: '#ef4444' },
        { to: 98, color: '#f59e0b' },
        { to: 100, color: '#10b981' },
      ],
    }),
  },
  // --- Bullet ---
  {
    id: 'bullet-revenue',
    label: 'Bullet · KPI vs. target',
    group: 'Bullet',
    note: 'measure bar over qualitative ranges + target',
    build: () => ({
      type: 'bullet',
      title: 'Quarterly revenue',
      label: 'Revenue',
      value: 820000,
      target: 900000,
      ranges: [600000, 800000, 1000000],
      format: '$,.0f',
    }),
  },
  // --- Calendar heatmap ---
  {
    id: 'calendar-activity',
    label: 'Calendar · daily activity',
    group: 'Calendar',
    note: '~26 weeks of generated daily commits',
    build: () => {
      const r = rng(99);
      const data: Datum[] = [];
      const start = new Date('2024-01-01');
      for (let i = 0; i < 182; i++) {
        const d = new Date(start);
        d.setDate(start.getDate() + i);
        const weekend = d.getDay() === 0 || d.getDay() === 6;
        const base = weekend ? 1.5 : 7;
        const v = Math.max(0, Math.round(base + 4 * Math.sin(i / 6) + (r() * 5 - 2)));
        data.push({ date: d.toISOString().slice(0, 10), commits: v });
      }
      return {
        type: 'calendarHeatmap',
        title: 'Daily commit activity',
        scheme: 'teal',
        data,
        encoding: {
          date: { field: 'date', type: 'temporal' },
          color: { field: 'commits', type: 'quantitative', title: 'Commits' },
        },
      };
    },
  },
  // --- Waterfall ---
  {
    id: 'waterfall-bridge',
    label: 'Waterfall · cash-flow bridge',
    group: 'Waterfall',
    note: 'signed steps + running total bar',
    build: () => ({
      type: 'waterfall',
      title: 'FY24 cash flow bridge',
      data: [
        { stage: 'Opening', delta: 1200 },
        { stage: 'Product', delta: 540 },
        { stage: 'Services', delta: 320 },
        { stage: 'Churn', delta: -180 },
        { stage: 'Refunds', delta: -90 },
        { stage: 'Opex', delta: -260 },
      ],
      showTotal: true,
      totalLabel: 'Closing',
      encoding: {
        stage: { field: 'stage', title: 'Stage' },
        value: { field: 'delta', title: 'USD (000s)', format: '$,.0f' },
      },
    }),
  },
  // --- Slope ---
  {
    id: 'slope-share',
    label: 'Slope · before / after',
    group: 'Slope',
    note: 'lines colored by rise/fall, direct end labels',
    build: () => ({
      type: 'slope',
      title: 'Market share shift, 2019 \u2192 2024',
      data: [
        { year: '2019', brand: 'Aurora', share: 34 },
        { year: '2024', brand: 'Aurora', share: 22 },
        { year: '2019', brand: 'Borealis', share: 18 },
        { year: '2024', brand: 'Borealis', share: 29 },
        { year: '2019', brand: 'Cirrus', share: 27 },
        { year: '2024', brand: 'Cirrus', share: 31 },
        { year: '2019', brand: 'Delta', share: 21 },
        { year: '2024', brand: 'Delta', share: 18 },
      ],
      encoding: {
        x: { field: 'year' },
        y: { field: 'share', title: 'Share %' },
        series: { field: 'brand' },
      },
      colorByChange: true,
      format: ',.0f',
    }),
  },
  // --- Dumbbell ---
  {
    id: 'dumbbell-gap',
    label: 'Dumbbell · gap by category',
    group: 'Dumbbell',
    note: 'two dots per row, sorted by spread',
    build: () => ({
      type: 'dumbbell',
      title: 'Life expectancy gain, 2000 vs 2020',
      data: [
        { country: 'Rwanda', year: '2000', life: 48 },
        { country: 'Rwanda', year: '2020', life: 69 },
        { country: 'India', year: '2000', life: 63 },
        { country: 'India', year: '2020', life: 70 },
        { country: 'Brazil', year: '2000', life: 70 },
        { country: 'Brazil', year: '2020', life: 76 },
        { country: 'China', year: '2000', life: 72 },
        { country: 'China', year: '2020', life: 78 },
        { country: 'USA', year: '2000', life: 76 },
        { country: 'USA', year: '2020', life: 79 },
        { country: 'Japan', year: '2000', life: 81 },
        { country: 'Japan', year: '2020', life: 84 },
      ],
      encoding: {
        category: { field: 'country' },
        value: { field: 'life', title: 'Years' },
        group: { field: 'year' },
      },
      sort: 'gap',
      labels: true,
      format: ',.0f',
    }),
  },
  // --- Pie ---
  {
    id: 'pie',
    label: 'Pie · share',
    group: 'Pie',
    note: '4 slices',
    build: () => ({
      type: 'pie',
      title: 'Market share',
      data: categorical({ categories: REGIONS, series: ['Share'] }),
      encoding: { theta: { field: 'value' }, color: { field: 'category' } },
    }),
  },
  {
    id: 'donut',
    label: 'Donut · labelled',
    group: 'Pie',
    note: '3 slices',
    build: () => ({
      type: 'pie',
      title: 'Sales by category',
      data: categorical({ categories: ['Furniture', 'Office', 'Tech'], series: ['Sales'] }),
      encoding: { theta: { field: 'value' }, color: { field: 'category' } },
      donut: true,
      labels: true,
    }),
  },
  {
    id: 'donut-callouts',
    label: 'Donut · callout labels',
    group: 'Pie',
    note: '8 slices',
    build: () => ({
      type: 'pie',
      title: 'Browser share',
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
    }),
  },
  // --- Funnel ---
  {
    id: 'funnel',
    label: 'Funnel · conversion',
    group: 'Funnel',
    note: '5 stages, retained %',
    build: () => ({
      type: 'funnel',
      title: { text: 'Signup funnel', subtitle: 'Users retained at each stage' },
      data: funnelData(),
      encoding: { stage: { field: 'stage' }, value: { field: 'users', title: 'Users' } },
      percent: 'first',
    }),
  },
  // --- Heatmap ---
  {
    id: 'heatmap',
    label: 'Heatmap · week × hour',
    group: 'Heatmap',
    note: '7 × 24 grid',
    build: () => ({
      type: 'heatmap',
      title: 'Traffic by day & hour',
      data: heatmapGrid(),
      encoding: {
        x: { field: 'hour' },
        y: { field: 'day' },
        color: { field: 'value', type: 'quantitative' },
      },
      scheme: 'teal',
    }),
  },
  // --- KPI ---
  {
    id: 'kpi',
    label: 'KPI · metric + delta',
    group: 'KPI',
    note: 'sparkline trend',
    build: () => ({
      type: 'kpi',
      label: 'Total sales',
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
      delta: 0.124,
      format: '$,.0f',
      sparkline: true,
    }),
  },
  // --- Table ---
  {
    id: 'table-sm',
    label: 'Table · 25 rows',
    group: 'Table',
    note: 'conditional formatting',
    build: () => ({
      type: 'table',
      title: 'Orders',
      data: salesTable({ n: 25 }),
      columns: [
        { field: 'order', title: 'Order', group: 'Order', sortable: false },
        { field: 'region', title: 'Region', group: 'Customer' },
        { field: 'category', title: 'Category', group: 'Customer' },
        { field: 'units', title: 'Units', align: 'right', group: 'Performance', total: 'sum' },
        { field: 'sales', title: 'Sales', format: ',.0f', prefix: '$', align: 'right', group: 'Performance', conditionalFormat: { type: 'bar', color: '#0d9488' } },
        { field: 'margin', title: 'Margin', format: '.1%', align: 'right', group: 'Performance', conditionalFormat: { type: 'icon', set: 'trafficLights' } },
      ],
      totals: true,
      density: 'compact',
      sort: { field: 'sales', order: 'desc' },
    }),
  },
  {
    id: 'table-lg',
    label: 'Table · 400 rows',
    group: 'Table',
    note: 'virtualized scroll',
    build: () => ({
      type: 'table',
      title: 'Orders',
      data: salesTable({ n: 400 }),
      columns: [
        { field: 'order', title: 'Order' },
        { field: 'date', title: 'Date', format: '%b %e, %Y' },
        { field: 'region', title: 'Region' },
        { field: 'category', title: 'Category' },
        { field: 'sales', title: 'Sales', format: ',.0f', prefix: '$', align: 'right', conditionalFormat: { type: 'bar', showValue: false } },
        { field: 'margin', title: 'Margin', format: '.1%', align: 'right', conditionalFormat: { type: 'rules', rules: [{ when: 'lt', value: 0.18, color: '#dc2626', weight: 'bold', icon: '!' }] } },
      ],
      density: 'compact',
      sort: { field: 'sales', order: 'desc' },
    }),
  },
  // --- Matrix ---
  {
    id: 'matrix',
    label: 'Matrix · pivot',
    group: 'Matrix',
    note: 'subtotals + grand totals',
    build: () => ({
      type: 'matrix',
      title: 'Sales pivot',
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
    }),
  },
  // --- Box ---
  {
    id: 'box',
    label: 'Box · distribution',
    group: 'Box',
    note: '5 groups, Tukey whiskers',
    build: () => ({
      type: 'box',
      title: { text: 'Response time by cohort', subtitle: 'Tukey whiskers · 1.5×IQR' },
      data: boxDistributions({
        categories: ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo'],
        n: 40,
        seed: 41,
        base: 64,
        spread: 13,
      }),
      encoding: { x: { field: 'category' }, y: { field: 'value', title: 'Latency (ms)' } },
    }),
  },
  {
    id: 'box-grouped',
    label: 'Box · grouped',
    group: 'Box',
    note: '4 quarters × 2 years',
    build: () => ({
      type: 'box',
      title: 'Scores by quarter & year',
      data: boxDistributions({
        categories: ['Q1', 'Q2', 'Q3', 'Q4'],
        series: ['2023', '2024'],
        n: 35,
        seed: 7,
        base: 52,
        spread: 12,
      }),
      encoding: {
        x: { field: 'category' },
        y: { field: 'value', title: 'Score' },
        series: { field: 'series' },
      },
    }),
  },
  // --- Sankey ---
  {
    id: 'sankey',
    label: 'Sankey · energy flow',
    group: 'Sankey',
    note: 'source → target links',
    build: () => ({
      type: 'sankey',
      title: { text: 'Energy supply → demand', subtitle: 'Generation mix to end use' },
      data: sankeyFlows('energy'),
      encoding: {
        source: { field: 'source' },
        target: { field: 'target' },
        value: { field: 'value', title: 'TWh' },
      },
    }),
  },
  // --- Choropleth ---
  {
    id: 'choropleth',
    label: 'Choropleth · grid map',
    group: 'Choropleth',
    note: 'inline GeoJSON, editable',
    build: () => {
      const { geo, data } = gridChoropleth();
      return {
        type: 'choropleth',
        title: 'Adoption index by region',
        geo,
        data,
        encoding: {
          key: { field: 'region' },
          color: { field: 'value', title: 'Index', type: 'quantitative' },
        },
        featureId: 'name',
        projection: 'identity',
        scheme: 'teal',
      };
    },
  },
  // --- Interactive (slicers + dashboard) ---
  {
    id: 'dropdown',
    label: 'Slicer · dropdown',
    group: 'Interactive',
    note: 'multi-select a field',
    build: () => ({
      type: 'dropdown',
      title: 'Region',
      data: interactiveData(),
      field: 'region',
      multiple: true,
    }),
  },
  {
    id: 'list',
    label: 'Slicer · checkbox list',
    group: 'Interactive',
    note: 'select-all + search',
    build: () => ({
      type: 'list',
      title: 'Regions',
      data: interactiveData(),
      field: 'region',
    }),
  },
  {
    id: 'range',
    label: 'Slicer · numeric range',
    group: 'Interactive',
    note: 'dual-handle min/max',
    build: () => ({
      type: 'range',
      title: 'Sales range',
      data: interactiveData(),
      field: 'sales',
    }),
  },
  {
    id: 'dashboard',
    label: 'Dashboard · auto-wired',
    group: 'Interactive',
    note: 'cross-filter + cross-highlight',
    build: () => dashboardDemo(),
  },
];

export const presetById = (id: string): Preset | undefined => presets.find((p) => p.id === id);

/** Presets grouped in catalog order, for an <optgroup>-style picker. */
export function presetGroups(): { group: string; items: Preset[] }[] {
  const out: { group: string; items: Preset[] }[] = [];
  for (const p of presets) {
    let g = out.find((o) => o.group === p.group);
    if (!g) {
      g = { group: p.group, items: [] };
      out.push(g);
    }
    g.items.push(p);
  }
  return out;
}
