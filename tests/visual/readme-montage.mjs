// Generates the single hero "showcase" montage for the repo README: many chart
// types rendered small, cycling light / dark / sketch so one image shows breadth
// and theming at a glance. Output: docs/images/showcase.png (committed asset).
// Usage: node tests/visual/readme-montage.mjs   (no gallery server needed)

import { renderChart } from '@graphein/node';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import usFc from '../../apps/gallery/src/content/us-states.albers.json' with { type: 'json' };

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(ROOT, 'docs', 'images');
mkdirSync(OUT, { recursive: true });

const months = (vals) => vals.map((y, i) => ({ m: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'][i], y, g: i % 2 ? 'B' : 'A' }));

// Compact, representative specs across families.
const TILES = [
  { type: 'line', title: 'Active users', data: months([42, 47, 51, 49, 58, 64]), encoding: { x: { field: 'm' }, y: { field: 'y' } }, insights: true },
  { type: 'bar', title: 'Revenue by region', data: [{ r: 'NA', y: 38 }, { r: 'EU', y: 31 }, { r: 'APAC', y: 24 }, { r: 'LATAM', y: 12 }], encoding: { x: { field: 'r' }, y: { field: 'y' } } },
  { type: 'area', title: 'Demand', data: months([20, 24, 30, 28, 36, 44]), encoding: { x: { field: 'm' }, y: { field: 'y' }, series: { field: 'g' } }, stack: true },
  { type: 'scatter', title: 'Spend vs. return', data: Array.from({ length: 28 }, (_, i) => ({ x: i + (i % 5), y: i * 1.3 + (i % 7) * 2, s: 4 + (i % 6) })), encoding: { x: { field: 'x' }, y: { field: 'y' }, size: { field: 's' } }, trendline: true },
  { type: 'pie', donut: true, title: 'Budget', data: [{ k: 'R&D', v: 40 }, { k: 'Sales', v: 28 }, { k: 'Ops', v: 18 }, { k: 'G&A', v: 14 }], encoding: { theta: { field: 'v' }, color: { field: 'k' } } },
  { type: 'heatmap', title: 'Traffic', data: Array.from({ length: 35 }, (_, i) => ({ d: i % 7, h: (i / 7) | 0, v: Math.round(Math.abs(Math.sin(i)) * 9) })), encoding: { x: { field: 'd' }, y: { field: 'h' }, color: { field: 'v' } } },
  { type: 'histogram', title: 'Latency', data: Array.from({ length: 120 }, (_, i) => ({ x: 40 + ((i * 53) % 80) + (i % 9) })), encoding: { x: { field: 'x' } } },
  { type: 'gauge', title: 'SLA', value: 87, max: 100, target: 95, bands: [{ to: 80, color: '#ef4444' }, { to: 95, color: '#f59e0b' }, { to: 100, color: '#10b981' }] },
  { type: 'waterfall', title: 'Bridge', data: [{ s: 'Q1', v: 120 }, { s: 'Wins', v: 40 }, { s: 'Churn', v: -25 }, { s: 'Exp', v: 18 }], encoding: { stage: { field: 's' }, value: { field: 'v' } } },
  { type: 'treemap', title: 'Catalog', data: [{ c: 'Apps', v: 50 }, { c: 'Games', v: 30 }, { c: 'Tools', v: 20 }, { c: 'Media', v: 14 }, { c: 'Books', v: 9 }], encoding: { category: { field: 'c' }, value: { field: 'v' } } },
  { type: 'slope', title: 'Before / after', data: [{ x: '2023', y: 30, g: 'A' }, { x: '2024', y: 52, g: 'A' }, { x: '2023', y: 44, g: 'B' }, { x: '2024', y: 36, g: 'B' }], encoding: { x: { field: 'x' }, y: { field: 'y' }, series: { field: 'g' } } },
  { type: 'box', title: 'Latency cohorts', data: Array.from({ length: 90 }, (_, i) => ({ g: ['A', 'B', 'C'][i % 3], y: 20 + (i % 30) + (i % 3) * 12 })), encoding: { x: { field: 'g' }, y: { field: 'y' } } },
  { type: 'combo', title: 'Revenue vs. rate', data: months([60, 72, 68, 81, 90, 104]).map((d, i) => ({ ...d, rate: 0.03 + i * 0.004 })), encoding: { x: { field: 'm' } }, layers: [{ mark: 'bar', encoding: { y: { field: 'y' } } }, { mark: 'line', axis: 'right', encoding: { y: { field: 'rate', format: '.0%' } } }] },
  { type: 'funnel', title: 'Conversion', data: [{ s: 'Visit', v: 1000 }, { s: 'Signup', v: 620 }, { s: 'Trial', v: 380 }, { s: 'Paid', v: 145 }], encoding: { stage: { field: 's' }, value: { field: 'v' } } },
  { type: 'sankey', title: 'Flows', data: [{ s: 'Search', t: 'Home', v: 8 }, { s: 'Ads', t: 'Home', v: 5 }, { s: 'Home', t: 'Cart', v: 7 }, { s: 'Home', t: 'Exit', v: 6 }, { s: 'Cart', t: 'Buy', v: 5 }], encoding: { source: { field: 's' }, target: { field: 't' }, value: { field: 'v' } } },
  { type: 'bullet', title: 'Quota', value: 78, target: 90, ranges: [50, 75, 100] },
  { type: 'calendarHeatmap', title: 'Activity', data: Array.from({ length: 120 }, (_, i) => ({ d: new Date(2024, 0, i + 1).toISOString().slice(0, 10), v: Math.round(Math.abs(Math.sin(i / 4)) * 9) })), encoding: { date: { field: 'd' }, color: { field: 'v' } } },
  { type: 'dumbbell', title: 'Gap by team', data: [{ c: 'A', v: 30, g: '2023' }, { c: 'A', v: 52, g: '2024' }, { c: 'B', v: 22, g: '2023' }, { c: 'B', v: 40, g: '2024' }, { c: 'C', v: 35, g: '2023' }, { c: 'C', v: 48, g: '2024' }], encoding: { category: { field: 'c' }, value: { field: 'v' }, group: { field: 'g' } } },
  { type: 'kpi', title: 'ARR', value: { field: 's', aggregate: 'sum' }, data: [3, 5, 4, 6, 8, 7, 9, 11].map((s) => ({ s: s * 140000 })), delta: 0.124, sparkline: { field: 's' } },
  { type: 'choropleth', title: 'Density', geo: usFc, featureId: 'name', projection: 'identity', scheme: 'teal', data: usFc.features.map((f) => ({ k: f.properties.name, v: f.properties.density })), encoding: { key: { field: 'k' }, color: { field: 'v' } } },
  { type: 'table', title: 'Orders', data: [{ region: 'NA', sales: 38, growth: 0.12 }, { region: 'EU', sales: 31, growth: 0.05 }, { region: 'APAC', sales: 24, growth: 0.18 }, { region: 'LATAM', sales: 12, growth: -0.03 }], columns: [{ field: 'region', title: 'Region' }, { field: 'sales', title: 'Sales', align: 'right', conditionalFormat: { type: 'bar', color: '#0d9488', showValue: true } }, { field: 'growth', title: 'Growth', format: '.0%', align: 'right' }] },
  { type: 'matrix', title: 'Pivot', data: Array.from({ length: 9 }, (_, i) => ({ r: ['NA', 'EU', 'APAC'][i % 3], c: ['Q1', 'Q2', 'Q3'][(i / 3) | 0], v: 10 + i })), rows: ['r'], columns: ['c'], values: [{ field: 'v', op: 'sum', label: 'Sum' }] },
  { type: 'bar', title: 'Quarterly', data: [{ q: 'Q1', y: 22, g: 'A' }, { q: 'Q2', y: 30, g: 'A' }, { q: 'Q1', y: 14, g: 'B' }, { q: 'Q2', y: 19, g: 'B' }], encoding: { x: { field: 'q' }, y: { field: 'y' }, series: { field: 'g' } }, stack: true },
  { type: 'dropdown', title: 'Region filter', field: 'region', multiple: true, data: ['NA', 'EU', 'APAC', 'LATAM'].map((region) => ({ region })) },
];

// Light, dark, sketch — cycled so every row carries all three looks.
const LOOKS = [
  { theme: 'light', sketch: false, bg: '#ffffff' },
  { theme: 'dark', sketch: false, bg: '#0b1120' },
  { theme: 'light', sketch: true, bg: '#fbfaf6' },
];

const COLS = 6;
const TW = 380, TH = 240, GAP = 14, PAD = 22, DPR = 2;
const rows = Math.ceil(TILES.length / COLS);
const W = PAD * 2 + COLS * TW + (COLS - 1) * GAP;
const H = PAD * 2 + rows * TH + (rows - 1) * GAP;

const canvas = createCanvas(W * DPR, H * DPR);
const ctx = canvas.getContext('2d');
ctx.scale(DPR, DPR);
ctx.fillStyle = '#eef1f5';
ctx.fillRect(0, 0, W, H);

for (let i = 0; i < TILES.length; i++) {
  const look = LOOKS[i % LOOKS.length];
  const { png } = renderChart({ ...TILES[i], theme: look.theme, sketch: look.sketch }, { width: TW, height: TH, dpr: DPR });
  const img = await loadImage(png);
  const cx = PAD + (i % COLS) * (TW + GAP);
  const cy = PAD + Math.floor(i / COLS) * (TH + GAP);
  ctx.fillStyle = look.bg;
  ctx.beginPath();
  ctx.roundRect(cx, cy, TW, TH, 12);
  ctx.fill();
  ctx.drawImage(img, cx, cy, TW, TH);
}

const file = join(OUT, 'showcase.png');
writeFileSync(file, canvas.toBuffer('image/png'));
console.log(`\u2713 ${file}  (${W}x${H}, ${TILES.length} charts)`);
