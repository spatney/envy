/**
 * Slope chart model builder.
 *
 * A `slope` reads tidy rows of `{ x, y, series }` and resolves one line per
 * series across ordinal x positions. Like waterfall/combo, it builds a synthetic
 * cartesian `base` model so the shared axis chrome can draw the frame, ticks and
 * titles while `drawSlope` owns the connecting lines, points and direct labels.
 */

import type { Datum, Rect } from '../types';
import type { ThemeTokens } from '../theme';
import type { SlopeSpec } from '../spec/types';
import { accessor, toKey, toNumber, uniqueStrings, extent } from '../util/data';
import { ticks as numericTicks } from '../ticks';
import { pointScale, linearScale } from '../scales';
import { ordinalColorScale, rgbaToCss } from '../color';
import { formatNumber, formatValue } from '../format';
import { computeFrame, type Frame } from '../layout';
import { resolveSketch, type ResolvedSketch } from '../spec/sketch';
import type { CartesianChartSpec, CartesianModel, Tick, XModel } from './cartesian';
import type { BuildOptions } from './cartesian';

const DEFAULT_PADDING = { top: 16, right: 76, bottom: 26, left: 76 };

export interface SlopePoint {
  catKey: string;
  label: string;
  value: number;
  x: number;
  y: number;
}

export interface SlopeSeries {
  key: string;
  label: string;
  value: unknown;
  color: string;
  points: SlopePoint[];
}

export interface SlopeModel {
  spec: SlopeSpec;
  tokens: ThemeTokens;
  frame: Frame;
  plot: Rect;
  series: SlopeSeries[];
  categories: string[];
  format?: string;
  showLabels: boolean;
  base: CartesianModel;
  sketch: ResolvedSketch | null;
}

function labelFor(value: unknown): string {
  if (value == null) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value);
}

function titleInput(spec: SlopeSpec): { text?: string; subtitle?: string } | undefined {
  if (typeof spec.title === 'string') return { text: spec.title };
  if (spec.title) return { text: spec.title.text, subtitle: spec.title.subtitle };
  return undefined;
}

function fmtTick(v: number, f?: string): string {
  return f ? formatValue(v, f) : formatNumber(v, ',');
}

export function buildSlopeModel(spec: SlopeSpec, tokens: ThemeTokens, opts: BuildOptions): SlopeModel {
  const data = (spec.data ?? []) as Datum[];
  const xField = spec.encoding.x.field;
  const yField = spec.encoding.y.field;
  const seriesField = spec.encoding.series.field;
  const readX = accessor(xField);
  const readY = accessor(yField);
  const readSeries = accessor(seriesField);
  const sketch = resolveSketch(spec);

  const categories = uniqueStrings(data, xField);
  let [d0, d1] = extent(data, yField) ?? [0, 1];
  if (d0 === d1) {
    d0 -= 1;
    d1 += 1;
  }
  const yTickValues = numericTicks(d0, d1, spec.axes?.y?.ticks ?? 5);
  const yDomain: [number, number] = [
    Math.min(yTickValues[0] ?? d0, d0),
    Math.max(yTickValues[yTickValues.length - 1] ?? d1, d1),
  ];
  const fmt = spec.format ?? spec.encoding.y.format ?? spec.axes?.y?.format;
  const yLabels = yTickValues.map((v) => fmtTick(v, fmt));

  const padding = { ...DEFAULT_PADDING, ...spec.padding };
  const xShow = spec.axes?.x?.show !== false;
  const yShow = spec.axes?.y?.show === true;
  const xTitle = spec.axes?.x?.title ?? spec.encoding.x.title;
  const yTitle = spec.axes?.y?.title ?? spec.encoding.y.title;
  const frame = computeFrame({
    width: opts.width,
    height: opts.height,
    padding,
    font: tokens.font,
    title: titleInput(spec),
    xAxis: { show: xShow, labels: categories, title: xTitle, edgeAnchored: false },
    yAxis: { show: yShow, labels: yLabels, title: yTitle },
  });
  const plot = frame.plot;

  const point = pointScale({ domain: categories, range: [plot.x, plot.x + plot.width], padding: 0.5 });
  const yScale = linearScale({ domain: yDomain, range: [plot.y + plot.height, plot.y] });

  const grouped = new Map<string, { key: string; label: string; value: unknown; values: Map<string, number> }>();
  for (const row of data) {
    const rawSeries = readSeries(row);
    const key = toKey(rawSeries);
    let group = grouped.get(key);
    if (!group) {
      group = { key, label: labelFor(rawSeries), value: rawSeries, values: new Map() };
      grouped.set(key, group);
    }
    const rawX = readX(row);
    const catKey = labelFor(rawX);
    const value = toNumber(readY(row));
    if (!Number.isNaN(value) && !group.values.has(catKey)) group.values.set(catKey, value);
  }

  const palette = ordinalColorScale({ domain: [...grouped.keys()], palette: tokens.color.palette });
  const series: SlopeSeries[] = [...grouped.values()].map((group) => {
    const points = categories
      .map((catKey) => {
        const value = group.values.get(catKey);
        const x = point.map(catKey);
        if (value == null || x == null) return null;
        return { catKey, label: catKey, value, x, y: yScale.map(value) };
      })
      .filter((p): p is SlopePoint => p !== null);

    let color = rgbaToCss(palette.map(group.key));
    if (spec.colorByChange && points.length >= 2) {
      const delta = points[points.length - 1].value - points[0].value;
      color = delta > 0 ? tokens.color.positive : delta < 0 ? tokens.color.negative : tokens.color.textMuted;
    } else if (spec.colorByChange) {
      color = tokens.color.textMuted;
    }

    return { key: group.key, label: group.label, value: group.value, color, points };
  });

  const baseAxes = { ...spec.axes, y: { grid: false, show: false, ...spec.axes?.y } };
  const baseSpec: CartesianChartSpec = {
    type: 'line',
    data,
    encoding: {
      x: spec.encoding.x,
      y: { field: yField, title: yTitle, format: fmt },
    },
    axes: baseAxes,
    title: spec.title,
    padding: spec.padding,
  };

  const xModel: XModel = {
    kind: 'point',
    field: xField,
    type: 'ordinal',
    categories,
    point,
    bandwidth: 0,
    pixel: (v) => point.map(toKey(v)),
  };
  const xTicks: Tick[] = categories
    .map((label): Tick | null => {
      const pos = point.map(label);
      return pos == null ? null : { value: label, pos, label };
    })
    .filter((t): t is Tick => t !== null);
  const yTicks: Tick[] = yTickValues.map((v, i) => ({ value: v, pos: yScale.map(v), label: yLabels[i] }));

  const base: CartesianModel = {
    spec: baseSpec,
    tokens,
    frame,
    plot,
    x: xModel,
    y: { field: yField, scale: yScale, baseline: yScale.map(0), pixel: (v) => yScale.map(toNumber(v)) },
    series: [],
    seriesField: undefined,
    stacked: false,
    xTicks,
    yTicks,
    colorOf: () => tokens.color.text,
    sketch,
  };

  return {
    spec,
    tokens,
    frame,
    plot,
    series,
    categories,
    format: fmt,
    showLabels: spec.labels !== false,
    base,
    sketch,
  };
}
