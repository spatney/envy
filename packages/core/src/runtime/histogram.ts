/**
 * Histogram model builder.
 *
 * A `histogram` bins a single quantitative field (reusing the shared `bin`
 * transform's {@link computeBins}) and draws the per-bin frequency as gapless
 * bars on a continuous x-axis. Like the combo builder, it resolves a synthetic
 * `base` {@link CartesianModel} so the existing axis chrome (`drawAxesUnderlay` /
 * `drawOverlay`) renders the gridlines, ticks, labels and titles unchanged — the
 * bars themselves are painted by {@link drawHistogram}.
 */

import type { Rect } from '../types';
import type { ThemeTokens } from '../theme';
import type { HistogramSpec } from '../spec/types';
import { accessor, toNumber } from '../util/data';
import { computeBins, type BinLayout } from '../spec/transform';
import { ticks as numericTicks } from '../ticks';
import { linearScale } from '../scales';
import { ordinalColorScale, rgbaToCss } from '../color';
import { formatNumber, formatValue } from '../format';
import { computeFrame, type Frame } from '../layout';
import { resolveSketch, type ResolvedSketch } from '../spec/sketch';
import type { CartesianChartSpec, CartesianModel, Tick, XModel } from './cartesian';
import type { BuildOptions } from './cartesian';

/** One resolved histogram bin (closed-open `[start, end)`). */
export interface HistogramBinDatum {
  start: number;
  end: number;
  mid: number;
  /** Raw observation count in the bin. */
  count: number;
  /** Plotted height: `count`, or a probability density when `density:true`. */
  value: number;
}

export interface HistogramModel {
  spec: HistogramSpec;
  tokens: ThemeTokens;
  frame: Frame;
  plot: Rect;
  bins: HistogramBinDatum[];
  layout: BinLayout | null;
  color: string;
  /** Map a quantitative x value to a pixel. */
  xPixel: (v: number) => number;
  /** Map a bar height (count/density) to a pixel. */
  yPixel: (v: number) => number;
  /** Pixel of the y=0 baseline. */
  yBaseline: number;
  cornerRadius: number;
  /** Drives the shared axis underlay / overlay chrome. */
  base: CartesianModel;
  sketch: ResolvedSketch | null;
}

const DEFAULT_PADDING = { top: 12, right: 16, bottom: 12, left: 12 };

function firstPaletteColor(tokens: ThemeTokens): string {
  return rgbaToCss(ordinalColorScale({ domain: ['0'], palette: tokens.color.palette }).map('0'));
}

export function buildHistogramModel(
  spec: HistogramSpec,
  tokens: ThemeTokens,
  opts: BuildOptions,
): HistogramModel {
  const data = spec.data ?? [];
  const field = spec.encoding.x.field;
  const read = accessor(field);
  const sketch = resolveSketch(spec);

  const binOpts = spec.bin ?? {};
  const values: number[] = [];
  for (const row of data) {
    const n = toNumber(read(row));
    if (!Number.isNaN(n)) values.push(n);
  }
  const layout = computeBins(values, {
    maxbins: binOpts.maxbins,
    step: binOpts.step,
    extent: binOpts.extent,
    nice: binOpts.nice,
  });

  // --- Tally each observation into its bin ---
  const bins: HistogramBinDatum[] = [];
  if (layout) {
    const counts = new Array<number>(layout.count).fill(0);
    let total = 0;
    for (const v of values) {
      if (binOpts.extent && (v < binOpts.extent[0] || v > binOpts.extent[1])) continue;
      let idx = Math.floor((v - layout.start) / layout.step + 1e-9);
      if (idx < 0) idx = 0;
      if (idx > layout.count - 1) idx = layout.count - 1;
      counts[idx]++;
      total++;
    }
    const denom = total || 1;
    for (let i = 0; i < layout.count; i++) {
      const start = layout.start + i * layout.step;
      const end = start + layout.step;
      const count = counts[i];
      const value = spec.density ? count / (denom * layout.step) : count;
      bins.push({ start, end, mid: (start + end) / 2, count, value });
    }
  }

  // --- Domains ---
  const xDomain: [number, number] = layout
    ? [layout.start, layout.start + layout.count * layout.step]
    : [0, 1];
  const yMax = bins.reduce((m, b) => Math.max(m, b.value), 0);
  const yTickValues = numericTicks(0, yMax || 1, spec.axes?.y?.ticks ?? 5);
  const yTop = Math.max(yMax, yTickValues[yTickValues.length - 1] ?? yMax) || 1;
  const yDomain: [number, number] = [0, yTop];

  // --- Tick labels ---
  const xFmt = spec.encoding.x.format ?? spec.axes?.x?.format;
  const xTickValues = numericTicks(xDomain[0], xDomain[1], spec.axes?.x?.ticks ?? 8);
  const xLabels = xTickValues.map((v) => (xFmt ? formatValue(v, xFmt) : formatNumber(v, ',')));
  const yFmt = spec.axes?.y?.format ?? (spec.density ? '.3~f' : undefined);
  const yLabels = yTickValues.map((v) => (yFmt ? formatValue(v, yFmt) : formatNumber(v, ',')));

  // --- Frame (no legend; single series) ---
  const padding = { ...DEFAULT_PADDING, ...spec.padding };
  const titleInput =
    typeof spec.title === 'string'
      ? { text: spec.title }
      : spec.title
        ? { text: spec.title.text, subtitle: spec.title.subtitle }
        : undefined;
  const xShow = spec.axes?.x?.show !== false;
  const yShow = spec.axes?.y?.show !== false;
  const yTitle = spec.axes?.y?.title ?? (spec.density ? 'Density' : 'Count');
  const xTitle = spec.axes?.x?.title ?? spec.encoding.x.title;

  const frame = computeFrame({
    width: opts.width,
    height: opts.height,
    padding,
    font: tokens.font,
    title: titleInput,
    xAxis: { show: xShow, labels: xLabels, title: xTitle, edgeAnchored: true },
    yAxis: { show: yShow, labels: yLabels, title: yTitle },
  });
  const plot = frame.plot;

  // --- Scales ---
  const xScale = linearScale({ domain: xDomain, range: [plot.x, plot.x + plot.width] });
  const yScale = linearScale({ domain: yDomain, range: [plot.y + plot.height, plot.y] });
  const xPixel = (v: number): number => xScale.map(v);
  const yPixel = (v: number): number => yScale.map(v);
  const yBaseline = yScale.map(0);
  const color = spec.color ?? firstPaletteColor(tokens);
  const cornerRadius = Math.max(0, spec.cornerRadius ?? Math.min(3, tokens.radius.sm));

  const xTicks: Tick[] = xTickValues.map((v, i) => ({ value: v, pos: xScale.map(v), label: xLabels[i] }));
  const yTicks: Tick[] = yTickValues.map((v, i) => ({ value: v, pos: yScale.map(v), label: yLabels[i] }));

  const xModel: XModel = {
    kind: 'linear',
    field,
    type: 'quantitative',
    continuous: xScale,
    bandwidth: 0,
    pixel: (value) => {
      const n = toNumber(value);
      return Number.isNaN(n) ? undefined : xScale.map(n);
    },
  };

  // Default the vertical (x) gridlines off — histograms read on horizontal grid.
  const baseAxes = { ...spec.axes, x: { grid: false, ...spec.axes?.x } };
  const baseSpec: CartesianChartSpec = {
    type: 'bar',
    data,
    encoding: { x: spec.encoding.x, y: { field: '__count', title: yTitle, format: yFmt } },
    axes: baseAxes,
    title: spec.title,
    padding: spec.padding,
  };
  const base: CartesianModel = {
    spec: baseSpec,
    tokens,
    frame,
    plot,
    x: xModel,
    y: { field: '__count', scale: yScale, baseline: yBaseline, pixel: (v) => yScale.map(toNumber(v)) },
    series: [],
    seriesField: undefined,
    stacked: false,
    xTicks,
    yTicks,
    colorOf: () => color,
    sketch,
  };

  return {
    spec,
    tokens,
    frame,
    plot,
    bins,
    layout,
    color,
    xPixel,
    yPixel,
    yBaseline,
    cornerRadius,
    base,
    sketch,
  };
}
