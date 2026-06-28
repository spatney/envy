/**
 * Data insight analysis — the pure analytical core behind self-explaining charts.
 *
 * Given a {@link ChartSpec} (spec + its `data`), {@link analyzeChart} derives a
 * structured, dependency-free set of facts about what the numbers *say*: the
 * trend and net change of a series, the largest/smallest category and its share,
 * outliers, scatter correlation, a value vs. its target. Two consumers build on
 * it without re-deriving anything:
 *   - {@link summarize} turns insights into a deterministic plain-English summary
 *     (doubles as alt-text — no LLM).
 *   - auto-insight annotations turn the same `PointRef`s into on-chart callouts.
 *
 * The analysis is a pure function of the spec; it reads rows as-is (charts plot
 * rows in data order, so first/last reflect data order) and never mutates input.
 */

import type { ChartSpec, ChartType, Encoding, FieldDef, ValueRef } from '../spec/types';
import type { Datum, FieldType } from '../types';
import { accessor, toNumber, toKey, inferType } from '../util/data';
import { prettyDate } from '../format';
import { aggregateValues } from '../pivot';

/** A single salient point in a series: its value, its x-label, and row index. */
export interface PointRef {
  /** The x-axis label for this point (formatted as a string). */
  label: string;
  /** The numeric value at this point. */
  value: number;
  /** Index of the originating row within its series. */
  index: number;
  /**
   * The raw x-axis domain value (a `Date`, string, or number) for this point,
   * suitable for mapping back to a pixel via a chart's x-scale. Undefined when
   * the analysis had no x channel (e.g. a raw distribution).
   */
  raw?: unknown;
}

/** Trend + spread facts for one ordered numeric series. */
export interface SeriesInsights {
  /** Series name (`''` for a single, unsplit series). */
  key: string;
  /** Number of points. */
  count: number;
  first: PointRef;
  last: PointRef;
  min: PointRef;
  max: PointRef;
  /** Arithmetic mean of the values. */
  mean: number;
  /** Sum of the values. */
  sum: number;
  /** `last - first`. */
  netChange: number;
  /** `(last - first) / |first|`, or `null` when `first` is 0. */
  pctChange: number | null;
  /** Overall direction of travel from first to last. */
  direction: 'up' | 'down' | 'flat';
  /** The largest single step between consecutive points (by absolute delta). */
  biggestJump: { from: PointRef; to: PointRef; delta: number } | null;
  /** Points beyond the 1.5×IQR Tukey fences (empty when none). */
  outliers: PointRef[];
}

/** Part-to-whole facts for a categorical measure. */
export interface CategoryInsights {
  /** Number of categories. */
  count: number;
  /** Sum of the measure across all categories. */
  total: number;
  /** The largest category. */
  top: PointRef;
  /** The smallest category. */
  bottom: PointRef;
  /** `top.value / total` (0..1), or 0 when the total is not positive. */
  topShare: number;
}

/** Relationship facts for an x/y point cloud. */
export interface ScatterInsights {
  count: number;
  xExtent: [number, number];
  yExtent: [number, number];
  /** Pearson correlation coefficient (−1..1), or `null` when undefined. */
  correlation: number | null;
}

/** A single value measured against an optional target. */
export interface ValueInsights {
  value: number;
  target: number | null;
  /** `value - target`, or `null` when there is no target. */
  toTarget: number | null;
  /** `value / target`, or `null` when there is no (non-zero) target. */
  pctOfTarget: number | null;
}

export type InsightFamily = 'series' | 'category' | 'scatter' | 'value' | 'distribution';

/** The structured insight payload for a chart (see {@link analyzeChart}). */
export interface ChartInsights {
  type: ChartType;
  family: InsightFamily;
  /** Rows backing the chart. */
  rowCount: number;
  /** The measure field name (y / value / theta), when there is one. */
  measureField?: string;
  /** The measure's number-format hint (for downstream formatting). */
  measureFormat?: string;
  /** Display title for the measure (field title or field name). */
  measureLabel?: string;
  /** The category / x field name, when there is one. */
  categoryField?: string;
  /** Inferred type of the x / category field. */
  categoryType?: FieldType;
  /** Per-series trend facts (family `series`). */
  series?: SeriesInsights[];
  /** Highest-ending series (multi-series only). */
  leader?: { key: string; value: number };
  /** The series that moved most from first→last (multi-series only). */
  biggestMover?: { key: string; delta: number };
  /** Part-to-whole facts (family `category`). */
  category?: CategoryInsights;
  /** Point-cloud facts (family `scatter`). */
  scatter?: ScatterInsights;
  /** Single value vs. target (family `value`). */
  value?: ValueInsights;
  /** Distribution of one measure (family `distribution`, e.g. histogram). */
  distribution?: SeriesInsights;
}

const FLAT_EPSILON = 1e-9;

function num(v: unknown): number | null {
  const n = toNumber(v);
  return Number.isFinite(n) ? n : null;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return NaN;
  if (sorted.length === 1) return sorted[0];
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

/**
 * Compute trend + spread insights for a parallel `values`/`labels` series.
 * Returns `null` when there are no finite values.
 */
export function computeSeriesInsights(
  values: readonly number[],
  labels: readonly string[],
  key = '',
  raws?: readonly unknown[],
): SeriesInsights | null {
  const pts: PointRef[] = [];
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (Number.isFinite(v)) pts.push({ label: labels[i] ?? String(i), value: v, index: i, raw: raws?.[i] });
  }
  if (pts.length === 0) return null;

  let min = pts[0];
  let max = pts[0];
  let sum = 0;
  for (const p of pts) {
    if (p.value < min.value) min = p;
    if (p.value > max.value) max = p;
    sum += p.value;
  }
  const first = pts[0];
  const last = pts[pts.length - 1];
  const mean = sum / pts.length;
  const netChange = last.value - first.value;
  const pctChange = first.value !== 0 ? netChange / Math.abs(first.value) : null;

  const range = max.value - min.value;
  const flatBand = Math.max(Math.abs(range) * 1e-6, FLAT_EPSILON);
  const direction: SeriesInsights['direction'] =
    netChange > flatBand ? 'up' : netChange < -flatBand ? 'down' : 'flat';

  let biggestJump: SeriesInsights['biggestJump'] = null;
  for (let i = 1; i < pts.length; i++) {
    const delta = pts[i].value - pts[i - 1].value;
    if (biggestJump === null || Math.abs(delta) > Math.abs(biggestJump.delta)) {
      biggestJump = { from: pts[i - 1], to: pts[i], delta };
    }
  }

  let outliers: PointRef[] = [];
  if (pts.length >= 4) {
    const sortedVals = pts.map((p) => p.value).sort((a, b) => a - b);
    const q1 = percentile(sortedVals, 0.25);
    const q3 = percentile(sortedVals, 0.75);
    const iqr = q3 - q1;
    if (iqr > 0) {
      const lo = q1 - 1.5 * iqr;
      const hi = q3 + 1.5 * iqr;
      outliers = pts.filter((p) => p.value < lo || p.value > hi);
    }
  }

  return { key, count: pts.length, first, last, min, max, mean, sum, netChange, pctChange, direction, biggestJump, outliers };
}

function fieldTitle(f: FieldDef | undefined): string | undefined {
  if (!f) return undefined;
  return f.title ?? f.field;
}

/** Resolve a literal-or-aggregated ValueRef over the data (kpi/gauge/bullet). */
function resolveValueRef(ref: ValueRef | undefined, data: readonly Datum[]): number | null {
  if (ref == null) return null;
  if (typeof ref === 'number') return Number.isFinite(ref) ? ref : null;
  return aggregateValues(data.map(accessor(ref.field)), ref.aggregate ?? 'sum');
}

const SERIES_TYPES = new Set<ChartType>(['line', 'area', 'slope', 'waterfall']);
const CATEGORY_TYPES = new Set<ChartType>(['pie', 'funnel', 'treemap']);
const VALUE_TYPES = new Set<ChartType>(['kpi', 'gauge', 'bullet']);

/** Read the rows of a spec as a typed array (empty when absent). */
function rowsOf(spec: ChartSpec): Datum[] {
  return Array.isArray(spec.data) ? (spec.data as Datum[]) : [];
}

function encodingOf(spec: ChartSpec): Encoding | undefined {
  return (spec as { encoding?: Encoding }).encoding;
}

/** Build a categorical (top/bottom/total) insight by summing `measure` per `category`. */
function analyzeCategory(
  rows: readonly Datum[],
  categoryField: string,
  measureField: string,
): CategoryInsights | null {
  const readCat = accessor(categoryField);
  const readVal = accessor(measureField);
  const totals = new Map<string, number>();
  const order: string[] = [];
  for (const d of rows) {
    const v = num(readVal(d));
    if (v === null) continue;
    const k = toKey(readCat(d));
    if (!totals.has(k)) order.push(k);
    totals.set(k, (totals.get(k) ?? 0) + v);
  }
  if (order.length === 0) return null;
  let total = 0;
  let top: PointRef = { label: order[0], value: totals.get(order[0]) ?? 0, index: 0, raw: order[0] };
  let bottom: PointRef = { ...top };
  order.forEach((k, i) => {
    const value = totals.get(k) ?? 0;
    total += value;
    if (value > top.value) top = { label: k, value, index: i, raw: k };
    if (value < bottom.value) bottom = { label: k, value, index: i, raw: k };
  });
  return { count: order.length, total, top, bottom, topShare: total > 0 ? top.value / total : 0 };
}

/** A human-facing x label for a series point. `Date`s become a readable date
 *  (not the raw epoch `toKey` would yield); strings/numbers pass through `toKey`
 *  so categorical and string-temporal (`"2024-01"`) axes are unchanged. */
function xLabel(x: unknown): string {
  return x instanceof Date ? prettyDate(x) : toKey(x);
}

/** Group rows into ordered numeric series for the `series` families. */
function analyzeSeriesFamily(
  rows: readonly Datum[],
  xField: string,
  yField: string,
  seriesField: string | undefined,
): SeriesInsights[] {
  const readX = accessor(xField);
  const readY = accessor(yField);
  const readS = seriesField ? accessor(seriesField) : null;
  const groups = new Map<string, { values: number[]; labels: string[]; raws: unknown[] }>();
  const order: string[] = [];
  for (const d of rows) {
    const y = num(readY(d));
    if (y === null) continue;
    const key = readS ? toKey(readS(d)) : '';
    let g = groups.get(key);
    if (!g) {
      g = { values: [], labels: [], raws: [] };
      groups.set(key, g);
      order.push(key);
    }
    const x = readX(d);
    g.values.push(y);
    g.labels.push(xLabel(x));
    g.raws.push(x);
  }
  const out: SeriesInsights[] = [];
  for (const key of order) {
    const g = groups.get(key)!;
    const si = computeSeriesInsights(g.values, g.labels, key, g.raws);
    if (si) out.push(si);
  }
  return out;
}

function pearson(xs: number[], ys: number[]): number | null {
  const n = xs.length;
  if (n < 2) return null;
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < n; i++) {
    sx += xs[i];
    sy += ys[i];
  }
  const mx = sx / n;
  const my = sy / n;
  let cov = 0;
  let vx = 0;
  let vy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    cov += dx * dy;
    vx += dx * dx;
    vy += dy * dy;
  }
  if (vx <= 0 || vy <= 0) return null;
  return cov / Math.sqrt(vx * vy);
}

/**
 * Derive structured insights from a chart spec, or `null` when the chart type
 * carries no summarizable trend (e.g. table, matrix, sankey, maps).
 */
export function analyzeChart(spec: ChartSpec): ChartInsights | null {
  const rows = rowsOf(spec);
  const type = spec.type;
  const base: Pick<ChartInsights, 'type' | 'rowCount'> = { type, rowCount: rows.length };
  if (rows.length === 0 && !VALUE_TYPES.has(type)) return null;

  // --- value family: kpi / gauge / bullet ---
  if (VALUE_TYPES.has(type)) {
    const s = spec as { value: ValueRef; target?: ValueRef; format?: string; label?: string };
    const value = resolveValueRef(s.value, rows);
    if (value === null) return null;
    const target = resolveValueRef(s.target, rows);
    const toTarget = target === null ? null : value - target;
    const pctOfTarget = target ? value / target : null;
    return {
      ...base,
      family: 'value',
      measureFormat: s.format,
      measureLabel: s.label,
      value: { value, target, toTarget, pctOfTarget },
    };
  }

  const enc = encodingOf(spec);

  // --- distribution: histogram (raw values binned by the chart) ---
  if (type === 'histogram') {
    const xf = enc?.x;
    if (!xf) return null;
    const values: number[] = [];
    const read = accessor(xf.field);
    for (const d of rows) {
      const v = num(read(d));
      if (v !== null) values.push(v);
    }
    const dist = computeSeriesInsights(values, values.map(String), xf.field);
    if (!dist) return null;
    return {
      ...base,
      family: 'distribution',
      measureField: xf.field,
      measureFormat: xf.format,
      measureLabel: fieldTitle(xf),
      distribution: dist,
    };
  }

  // --- scatter ---
  if (type === 'scatter') {
    const xf = enc?.x;
    const yf = enc?.y;
    if (!xf || !yf) return null;
    const readX = accessor(xf.field);
    const readY = accessor(yf.field);
    const xs: number[] = [];
    const ys: number[] = [];
    for (const d of rows) {
      const x = num(readX(d));
      const y = num(readY(d));
      if (x !== null && y !== null) {
        xs.push(x);
        ys.push(y);
      }
    }
    if (xs.length === 0) return null;
    const xExtent: [number, number] = [Math.min(...xs), Math.max(...xs)];
    const yExtent: [number, number] = [Math.min(...ys), Math.max(...ys)];
    return {
      ...base,
      family: 'scatter',
      measureField: yf.field,
      measureFormat: yf.format,
      measureLabel: fieldTitle(yf),
      categoryField: xf.field,
      scatter: { count: xs.length, xExtent, yExtent, correlation: pearson(xs, ys) },
    };
  }

  // --- category family: pie / funnel / treemap, or bar without a series split ---
  const categoryConfig: Partial<Record<ChartType, { cat?: FieldDef; measure?: FieldDef }>> = {
    pie: { cat: enc?.color, measure: enc?.theta },
    funnel: { cat: enc?.stage, measure: enc?.value },
    treemap: { cat: (enc as { category?: FieldDef })?.category, measure: enc?.value },
  };
  const barIsCategory = type === 'bar' && !enc?.series;
  if (CATEGORY_TYPES.has(type) || barIsCategory) {
    const cfg = categoryConfig[type] ?? { cat: enc?.x, measure: enc?.y };
    if (!cfg.cat || !cfg.measure) return null;
    const category = analyzeCategory(rows, cfg.cat.field, cfg.measure.field);
    if (!category) return null;
    return {
      ...base,
      family: 'category',
      categoryField: cfg.cat.field,
      categoryType: inferType(rows, cfg.cat.field),
      measureField: cfg.measure.field,
      measureFormat: cfg.measure.format,
      measureLabel: fieldTitle(cfg.measure),
      category,
    };
  }

  // --- series family: line / area / slope / waterfall, and grouped bar ---
  if (SERIES_TYPES.has(type) || type === 'bar') {
    const xf = type === 'waterfall' ? enc?.stage : enc?.x;
    const yf = type === 'waterfall' ? enc?.value : enc?.y;
    if (!xf || !yf) return null;
    const series = analyzeSeriesFamily(rows, xf.field, yf.field, enc?.series?.field);
    if (series.length === 0) return null;
    const result: ChartInsights = {
      ...base,
      family: 'series',
      categoryField: xf.field,
      categoryType: inferType(rows, xf.field),
      measureField: yf.field,
      measureFormat: yf.format,
      measureLabel: fieldTitle(yf),
      series,
    };
    if (series.length > 1) {
      let leader = series[0];
      let mover = series[0];
      for (const s of series) {
        if (s.last.value > leader.last.value) leader = s;
        if (Math.abs(s.netChange) > Math.abs(mover.netChange)) mover = s;
      }
      result.leader = { key: leader.key, value: leader.last.value };
      result.biggestMover = { key: mover.key, delta: mover.netChange };
    }
    return result;
  }

  return null;
}
