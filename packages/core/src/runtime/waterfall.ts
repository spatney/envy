/**
 * Waterfall model builder.
 *
 * A `waterfall` reads tidy rows of `{ stage, value }` where each `value` is the
 * **signed change** at that stage, and draws one floating bar per stage that
 * spans from the running total to its new level. Stages named in `spec.totals`
 * (and an optional appended grand total) draw as absolute bars from the baseline.
 * Like the combo / histogram builders, it resolves a synthetic `base`
 * {@link CartesianModel} so the shared axis chrome (`drawAxesUnderlay` /
 * `drawOverlay`) renders gridlines, ticks, labels and titles unchanged — the bars
 * and connector lines themselves are painted by `drawWaterfall`.
 */

import type { Rect } from '../types';
import type { ThemeTokens } from '../theme';
import type { WaterfallSpec } from '../spec/types';
import { accessor, toKey, toNumber } from '../util/data';
import { ticks as numericTicks } from '../ticks';
import { bandScale, linearScale } from '../scales';
import { formatNumber, formatValue } from '../format';
import { computeFrame, type Frame } from '../layout';
import { resolveSketch, type ResolvedSketch } from '../spec/sketch';
import type { CartesianChartSpec, CartesianModel, Tick, XModel } from './cartesian';
import type { BuildOptions } from './cartesian';

const DEFAULT_PADDING = { top: 12, right: 16, bottom: 12, left: 12 };

/** Whether a bar is an upward step, a downward step, or an absolute total. */
export type WaterfallKind = 'increase' | 'decrease' | 'total';

/** One resolved waterfall bar (a step or an absolute total). */
export interface WaterfallBar {
  /** Stable key for the stage (used for hit-testing / band lookup). */
  key: string;
  /** Display label for the stage. */
  label: string;
  /** Signed step delta (0 for total bars). */
  delta: number;
  /** Running total after this bar. */
  cumulative: number;
  kind: WaterfallKind;
  /** Data-space lower edge of the bar. */
  base: number;
  /** Data-space upper edge of the bar. */
  top: number;
  /** The value shown in the bar's label (delta for steps, cumulative for totals). */
  displayValue: number;
  /** Raw stage value for click-selection (undefined for the synthetic total). */
  stageValue?: unknown;
  /** Fill color resolved from kind. */
  color: string;
  /** Pixel rect (filled after scales are built). */
  rect: Rect;
}

/** A connector line joining the top of one bar to the start of the next. */
export interface WaterfallConnector {
  x1: number;
  x2: number;
  y: number;
}

export interface WaterfallModel {
  spec: WaterfallSpec;
  tokens: ThemeTokens;
  frame: Frame;
  plot: Rect;
  bars: WaterfallBar[];
  connectors: WaterfallConnector[];
  /** Number format for value labels and the y-axis. */
  format?: string;
  cornerRadius: number;
  showLabels: boolean;
  /** Synthetic cartesian model that drives the axis chrome. */
  base: CartesianModel;
  sketch: ResolvedSketch | null;
}

function labelFor(value: unknown): string {
  if (value == null) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value);
}

function titleInput(spec: WaterfallSpec): { text?: string; subtitle?: string } | undefined {
  if (typeof spec.title === 'string') return { text: spec.title };
  if (spec.title) return { text: spec.title.text, subtitle: spec.title.subtitle };
  return undefined;
}

/**
 * Build a {@link WaterfallModel} from a {@link WaterfallSpec}. Pure: depends only on
 * the spec, theme tokens, and target size.
 */
export function buildWaterfallModel(
  spec: WaterfallSpec,
  tokens: ThemeTokens,
  opts: BuildOptions,
): WaterfallModel {
  const data = (spec.data ?? []) as Record<string, unknown>[];
  const readStage = accessor(spec.encoding.stage.field);
  const readValue = accessor(spec.encoding.value.field);
  const sketch = resolveSketch(spec);

  const incColor = spec.increaseColor ?? tokens.color.positive;
  const decColor = spec.decreaseColor ?? tokens.color.negative;
  const totColor = spec.totalColor ?? tokens.color.accent;
  const totalsSet = new Set((spec.totals ?? []).map((s) => toKey(s)));

  // --- Walk the steps in data order, tracking the running total ---
  const bars: WaterfallBar[] = [];
  let running = 0;
  let minLevel = 0;
  let maxLevel = 0;
  const note = (lo: number, hi: number) => {
    minLevel = Math.min(minLevel, lo);
    maxLevel = Math.max(maxLevel, hi);
  };

  for (const row of data) {
    const raw = readStage(row);
    const key = toKey(raw);
    const label = labelFor(raw);
    const num = toNumber(readValue(row));
    const delta = Number.isFinite(num) ? num : 0;
    const isTotal = totalsSet.has(key);

    let base: number;
    let top: number;
    let cumulative: number;
    let kind: WaterfallKind;
    let displayValue: number;

    if (isTotal) {
      // Absolute bar from the baseline to the current running total.
      base = 0;
      top = running;
      cumulative = running;
      kind = 'total';
      displayValue = running;
      bars.push({
        key,
        label,
        delta: 0,
        cumulative,
        kind,
        base,
        top,
        displayValue,
        stageValue: raw,
        color: totColor,
        rect: { x: 0, y: 0, width: 0, height: 0 },
      });
    } else {
      base = running;
      cumulative = running + delta;
      top = cumulative;
      kind = delta < 0 ? 'decrease' : 'increase';
      displayValue = delta;
      running = cumulative;
      bars.push({
        key,
        label,
        delta,
        cumulative,
        kind,
        base,
        top,
        displayValue,
        stageValue: raw,
        color: kind === 'decrease' ? decColor : incColor,
        rect: { x: 0, y: 0, width: 0, height: 0 },
      });
    }
    note(Math.min(base, top), Math.max(base, top));
  }

  // --- Optional appended grand total ---
  if (spec.showTotal) {
    bars.push({
      key: '__total__',
      label: spec.totalLabel ?? 'Total',
      delta: 0,
      cumulative: running,
      kind: 'total',
      base: 0,
      top: running,
      displayValue: running,
      color: totColor,
      rect: { x: 0, y: 0, width: 0, height: 0 },
    });
    note(Math.min(0, running), Math.max(0, running));
  }

  // --- Y domain: cover every bar level AND the zero baseline, snapped to ticks ---
  const d0 = Math.min(0, minLevel);
  const d1 = Math.max(0, maxLevel);
  const yTickValues = numericTicks(d0, d1, spec.axes?.y?.ticks ?? 6);
  let yDomain: [number, number] = [
    Math.min(yTickValues[0] ?? d0, d0),
    Math.max(yTickValues[yTickValues.length - 1] ?? d1, d1),
  ];
  if (yDomain[0] === yDomain[1]) yDomain = [yDomain[0], yDomain[0] + 1];

  // --- Tick labels ---
  const fmt = spec.encoding.value.format ?? spec.axes?.y?.format;
  const yLabels = yTickValues.map((v) => (fmt ? formatValue(v, fmt) : formatNumber(v, ',')));
  const categories = bars.map((b) => b.label);

  // --- Frame ---
  const padding = { ...DEFAULT_PADDING, ...spec.padding };
  const xShow = spec.axes?.x?.show !== false;
  const yShow = spec.axes?.y?.show !== false;
  const xTitle = spec.axes?.x?.title ?? spec.encoding.stage.title;
  const yTitle = spec.axes?.y?.title ?? spec.encoding.value.title;

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

  // --- Scales ---
  const band = bandScale({
    domain: categories,
    range: [plot.x, plot.x + plot.width],
    paddingInner: spec.encoding.stage.scale?.padding ?? 0.3,
    paddingOuter: (spec.encoding.stage.scale?.padding ?? 0.3) / 2,
  });
  const yScale = linearScale({ domain: yDomain, range: [plot.y + plot.height, plot.y] });
  const yPixel = (v: number): number => yScale.map(v);

  // --- Place bar rects ---
  for (const bar of bars) {
    const left = band.map(bar.label);
    if (left == null) continue;
    const topPx = yPixel(Math.max(bar.base, bar.top));
    const botPx = yPixel(Math.min(bar.base, bar.top));
    bar.rect = {
      x: left,
      y: topPx,
      width: band.bandwidth,
      height: Math.max(1, botPx - topPx),
    };
  }

  // --- Connectors: from the right edge of bar i to the left edge of bar i+1,
  //     at the running level where one bar ends and the next begins. ---
  const connectors: WaterfallConnector[] = [];
  for (let i = 0; i < bars.length - 1; i++) {
    const a = bars[i];
    const b = bars[i + 1];
    if (a.rect.width === 0 || b.rect.width === 0) continue;
    connectors.push({
      x1: a.rect.x + a.rect.width,
      x2: b.rect.x,
      y: yPixel(a.cumulative),
    });
  }

  // --- Synthetic base cartesian model for the axis chrome ---
  const baseAxes = { ...spec.axes, x: { grid: false, ...spec.axes?.x } };
  const baseSpec: CartesianChartSpec = {
    type: 'bar',
    data,
    encoding: {
      x: spec.encoding.stage,
      y: { field: spec.encoding.value.field, title: yTitle, format: fmt },
    },
    axes: baseAxes,
    title: spec.title,
    padding: spec.padding,
  };

  const xModel: XModel = {
    kind: 'band',
    field: spec.encoding.stage.field,
    type: 'nominal',
    categories,
    band,
    bandwidth: band.bandwidth,
    pixel: (value) => {
      const p = band.map(toKey(value));
      return p == null ? undefined : p + band.bandwidth / 2;
    },
  };

  const xTicks: Tick[] = categories.map((label) => ({
    value: label,
    pos: (band.map(label) ?? plot.x) + band.bandwidth / 2,
    label,
  }));
  const yTicks: Tick[] = yTickValues.map((v, i) => ({ value: v, pos: yScale.map(v), label: yLabels[i] }));
  const yBaseline = yScale.map(0);

  const base: CartesianModel = {
    spec: baseSpec,
    tokens,
    frame,
    plot,
    x: xModel,
    y: { field: spec.encoding.value.field, scale: yScale, baseline: yBaseline, pixel: (v) => yScale.map(toNumber(v)) },
    series: [],
    seriesField: undefined,
    stacked: false,
    orientation: 'vertical',
    project: (c, v) => ({ x: c, y: v }),
    xTicks,
    yTicks,
    colorOf: () => incColor,
    sketch,
  };

  return {
    spec,
    tokens,
    frame,
    plot,
    bars,
    connectors,
    format: fmt,
    cornerRadius: Math.max(0, spec.cornerRadius ?? Math.min(2, tokens.radius.sm)),
    showLabels: spec.labels !== false,
    base,
    sketch,
  };
}
