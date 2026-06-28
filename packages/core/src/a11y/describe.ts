/**
 * Accessible descriptions for charts.
 *
 * Canvas marks are invisible to assistive technology, so every chart needs a
 * concise accessible *name* (what it is) plus, for canvas-drawn charts, a
 * visually-hidden data table (the numbers behind it — see `./table`). This
 * module owns the pure, DOM-free summarization logic.
 */

import type { ChartSpec } from '../spec/types';

const TYPE_LABELS: Record<string, string> = {
  line: 'Line chart',
  area: 'Area chart',
  bar: 'Bar chart',
  scatter: 'Scatter plot',
  combo: 'Combo chart',
  histogram: 'Histogram',
  pie: 'Pie chart',
  heatmap: 'Heatmap',
  kpi: 'KPI card',
  treemap: 'Treemap',
  gauge: 'Gauge',
  bullet: 'Bullet graph',
  calendarHeatmap: 'Calendar heatmap',
  table: 'Data table',
  matrix: 'Pivot matrix',
};

/** Human-readable label for a chart type (e.g. `'bar'` → `'Bar chart'`). */
export function chartTypeLabel(type: string): string {
  return TYPE_LABELS[type] ?? 'Chart';
}

/** Extract the chart's title text from a `string | TitleConfig` title field. */
export function chartTitleText(spec: ChartSpec): string | undefined {
  const t = spec.title;
  if (typeof t === 'string') return t.trim() || undefined;
  if (t && typeof t === 'object') {
    const text = t.text;
    return typeof text === 'string' && text.trim() ? text.trim() : undefined;
  }
  return undefined;
}

export interface ChartSummary {
  /** Concise accessible name for the chart root (used as `aria-label`). */
  label: string;
  /** Number of data rows backing the chart. */
  rowCount: number;
}

/**
 * Build a concise accessible name for a chart. An explicit `spec.description`
 * always wins (agents can supply precise alt text); otherwise we synthesize
 * `"<Type>: <title>. <n> data points."` from the spec.
 */
export function summarizeChart(spec: ChartSpec): ChartSummary {
  const rowCount = Array.isArray(spec.data) ? spec.data.length : 0;

  const description = spec.description;
  if (typeof description === 'string' && description.trim()) {
    return { label: description.trim(), rowCount };
  }

  const type = chartTypeLabel(spec.type);
  const title =
    chartTitleText(spec) ?? (spec.type === 'kpi' ? (spec as { label?: string }).label : undefined);

  let label = type;
  if (title) label += `: ${title}`;
  if (rowCount > 0 && spec.type !== 'kpi') {
    label += `. ${rowCount} data point${rowCount === 1 ? '' : 's'}.`;
  }
  return { label, rowCount };
}
