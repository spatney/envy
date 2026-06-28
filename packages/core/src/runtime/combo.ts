/**
 * Combo / dual-axis model builder.
 *
 * A `combo` spec composes several cartesian layers (bar, line, area, scatter) over
 * a shared x axis, optionally split across a primary (left) and secondary (right)
 * y axis. This builder resolves one shared frame / plot / x-scale and, for every
 * layer, a fully-formed {@link CartesianModel} that the existing mark renderers
 * (`drawLine`, `drawBar`, …) consume unchanged. Two independent y-scales back the
 * left and right axes; bar layers are offset side-by-side so multiple bars group.
 *
 * The builder is deliberately self-contained (it reuses only the public scale /
 * tick / frame / color primitives) so the single-chart `buildCartesianModel` path
 * stays untouched.
 */

import type { Datum, FieldType, Rect } from '../types';
import type { ThemeTokens } from '../theme';
import type { ComboLayer, ComboMark, ComboSpec, FieldDef } from '../spec/types';
import { accessor, extent, inferType, toDate, toKey, toNumber, uniqueStrings } from '../util/data';
import { ticks as numericTicks, timeTicks } from '../ticks';
import { bandScale, linearScale, pointScale, timeScale } from '../scales';
import { ordinalColorScale, rgbaToCss } from '../color';
import { formatNumber, formatValue, smartDate } from '../format';
import { computeFrame, type Frame, type LegendItem } from '../layout';
import { resolveSketch, type ResolvedSketch } from '../spec/sketch';
import type { Emphasis } from '../interaction/types';
import type { CartesianChartSpec, CartesianModel, Tick, XKind, XModel } from './cartesian';
import type { BuildOptions } from './cartesian';

export type ComboSide = 'left' | 'right';

export interface ComboLayerModel {
  mark: ComboMark;
  side: ComboSide;
  color: string;
  name: string;
  /** A ready-to-draw cartesian model for this layer's mark renderer. */
  model: CartesianModel;
}

export interface ComboAxisModel {
  show: boolean;
  ticks: Tick[];
  title?: string;
}

export interface ComboModel {
  spec: ComboSpec;
  tokens: ThemeTokens;
  frame: Frame;
  plot: Rect;
  x: XModel;
  xTicks: Tick[];
  left: ComboAxisModel;
  right?: ComboAxisModel;
  layers: ComboLayerModel[];
  legendItems: LegendItem[];
  /** Primary-axis cartesian model reused for the axis underlay / overlay chrome. */
  base: CartesianModel;
  sketch: ResolvedSketch | null;
  emphasis?: Emphasis | null;
}

const DEFAULT_PADDING = { top: 12, right: 16, bottom: 12, left: 12 };

function fmtTick(v: number, f?: string): string {
  return f ? formatValue(v, f) : formatNumber(v, ',');
}

function symbolFor(mark: ComboMark): LegendItem['symbol'] {
  if (mark === 'line') return 'line';
  if (mark === 'scatter') return 'circle';
  return 'square';
}

function layerName(layer: ComboLayer): string {
  return layer.name ?? layer.encoding.y.title ?? layer.encoding.y.field;
}

function comboXKind(spec: ComboSpec, xType: FieldType): XKind {
  if (spec.layers.some((l) => l.mark === 'bar')) return 'band';
  if (xType === 'quantitative') return 'linear';
  if (xType === 'temporal') return 'time';
  return 'point';
}

/** Union [min,max] of a measure across rows; null when nothing is numeric. */
function unionExtent(layers: ComboLayer[], data: Datum[]): [number, number] | null {
  let lo = Infinity;
  let hi = -Infinity;
  for (const layer of layers) {
    const ext = extent(data, layer.encoding.y.field);
    if (!ext) continue;
    if (ext[0] < lo) lo = ext[0];
    if (ext[1] > hi) hi = ext[1];
  }
  return lo === Infinity ? null : [lo, hi];
}

interface AxisResolution {
  domain: [number, number];
  tickValues: number[];
  labels: string[];
}

function resolveYAxis(
  layers: ComboLayer[],
  data: Datum[],
  format: string | undefined,
  tickCount: number,
): AxisResolution {
  let [d0, d1] = unionExtent(layers, data) ?? [0, 1];
  // Bars and filled areas read against a zero baseline.
  if (layers.some((l) => l.mark === 'bar' || l.mark === 'area' || (l.mark === 'line' && l.area))) {
    d0 = Math.min(0, d0);
    d1 = Math.max(0, d1);
  }
  let domain: [number, number] = [d0, d1];
  const tickValues = numericTicks(domain[0], domain[1], tickCount);
  if (tickValues.length >= 2) {
    domain = [
      Math.min(tickValues[0], domain[0]),
      Math.max(tickValues[tickValues.length - 1], domain[1]),
    ];
  }
  if (domain[0] === domain[1]) domain = [domain[0], domain[0] + 1];
  const labels = tickValues.map((v) => fmtTick(v, format));
  return { domain, tickValues, labels };
}

function buildXModel(
  kind: XKind,
  field: string,
  type: FieldType,
  categories: string[] | undefined,
  domainNum: [number, number] | null,
  range: [number, number],
  paddingInner: number,
  scaleCfg: FieldDef['scale'],
): XModel {
  if (kind === 'band') {
    const band = bandScale({
      domain: categories ?? [],
      range,
      paddingInner: scaleCfg?.padding ?? paddingInner,
      paddingOuter: (scaleCfg?.padding ?? paddingInner) / 2,
    });
    return {
      kind,
      field,
      type,
      categories,
      band,
      bandwidth: band.bandwidth,
      pixel: (value) => {
        const p = band.map(toKey(value));
        return p == null ? undefined : p + band.bandwidth / 2;
      },
    };
  }
  if (kind === 'point') {
    const point = pointScale({ domain: categories ?? [], range, padding: scaleCfg?.padding ?? 0.5 });
    return {
      kind,
      field,
      type,
      categories,
      point,
      bandwidth: 0,
      pixel: (value) => point.map(toKey(value)),
    };
  }
  const domain = domainNum ?? [0, 1];
  const continuous =
    kind === 'time' ? timeScale({ domain, range }) : linearScale({ domain, range });
  return {
    kind,
    field,
    type,
    continuous,
    bandwidth: 0,
    pixel: (value) => {
      const n = kind === 'time' ? toDate(value)?.getTime() : toNumber(value);
      return n == null || Number.isNaN(n) ? undefined : continuous.map(n);
    },
  };
}

/** A per-layer x-model that offsets/narrows a bar so multiple bar layers group. */
function groupedBarX(shared: XModel, barIndex: number, barCount: number): XModel {
  if (barCount <= 1) return shared;
  const bw = shared.bandwidth / barCount;
  const offset = (barIndex - (barCount - 1) / 2) * bw;
  return {
    ...shared,
    bandwidth: bw,
    pixel: (value) => {
      const c = shared.pixel(value);
      return c == null ? undefined : c + offset;
    },
  };
}

function syntheticLayerSpec(spec: ComboSpec, layer: ComboLayer): CartesianChartSpec {
  const enc = { x: spec.encoding.x, y: layer.encoding.y };
  const common = { data: spec.data, axes: spec.axes, sketch: spec.sketch };
  switch (layer.mark) {
    case 'bar':
      return { type: 'bar', encoding: enc, cornerRadius: layer.cornerRadius, ...common };
    case 'area':
      return { type: 'area', encoding: enc, curve: layer.curve, ...common };
    case 'scatter':
      return { type: 'scatter', encoding: enc, ...common };
    case 'line':
    default:
      return {
        type: 'line',
        encoding: enc,
        curve: layer.curve,
        points: layer.points,
        area: layer.area,
        ...common,
      };
  }
}

export function buildComboModel(spec: ComboSpec, tokens: ThemeTokens, opts: BuildOptions): ComboModel {
  const data = spec.data ?? [];
  const xField = spec.encoding.x.field;
  const xType: FieldType =
    spec.encoding.x.type ?? (data.length ? inferType(data, xField) : 'nominal');
  const xKind = comboXKind(spec, xType);
  const sketch = resolveSketch(spec);

  // --- Split layers across axes (everything defaults to the left axis) ---
  let leftLayers = spec.layers.filter((l) => l.axis !== 'right');
  let rightLayers = spec.layers.filter((l) => l.axis === 'right');
  if (leftLayers.length === 0) {
    leftLayers = spec.layers;
    rightLayers = [];
  }

  // --- Per-layer colors (palette unless overridden) ---
  const keys = spec.layers.map((_, i) => String(i));
  const colorScale = ordinalColorScale({ domain: keys, palette: tokens.color.palette });
  const layerColor = (i: number): string => spec.layers[i].color ?? rgbaToCss(colorScale.map(String(i)));

  // --- Y axes (pixel-independent domains + tick labels) ---
  const leftFormat = spec.axes?.y?.format ?? leftLayers[0]?.encoding.y.format;
  const rightFormat = rightLayers[0]?.encoding.y.format;
  const leftAxisCount = spec.axes?.y?.ticks ?? 6;
  const leftRes = resolveYAxis(leftLayers, data, leftFormat, leftAxisCount);
  const rightRes = rightLayers.length ? resolveYAxis(rightLayers, data, rightFormat, leftAxisCount) : null;

  const leftTitle = spec.axes?.y?.title ?? (leftLayers.length === 1 ? layerName(leftLayers[0]) : undefined);
  const rightTitle = rightLayers.length === 1 ? layerName(rightLayers[0]) : undefined;

  // --- X domain / categories + tick labels ---
  let categories: string[] | undefined;
  let xDomainNum: [number, number] | null = null;
  const xAxisCfg = spec.axes?.x ?? {};
  if (xKind === 'band' || xKind === 'point') {
    categories = uniqueStrings(data, xField);
  } else if (xKind === 'time') {
    const ms = data
      .map((d) => toDate(accessor(xField)(d))?.getTime())
      .filter((v): v is number => v != null);
    xDomainNum = ms.length ? [Math.min(...ms), Math.max(...ms)] : [0, 1];
  } else {
    xDomainNum = extent(data, xField) ?? [0, 1];
  }

  let xTickValues: Array<number | string>;
  let xLabels: string[];
  if (categories) {
    xTickValues = categories;
    xLabels = categories.slice();
  } else if (xKind === 'time') {
    const xt = timeTicks(xDomainNum![0], xDomainNum![1], xAxisCfg.ticks ?? 7);
    const stepMs = xt.length > 1 ? xt[1] - xt[0] : 0;
    xTickValues = xt;
    xLabels = xt.map((v) => (spec.encoding.x.format ? formatValue(v, spec.encoding.x.format) : smartDate(v, stepMs)));
  } else {
    const xt = numericTicks(xDomainNum![0], xDomainNum![1], xAxisCfg.ticks ?? 8);
    xTickValues = xt;
    xLabels = xt.map((v) => fmtTick(v, spec.encoding.x.format ?? xAxisCfg.format));
  }

  // --- Legend (one entry per layer) ---
  const legendItems: LegendItem[] = spec.layers.map((l, i) => ({
    label: layerName(l),
    color: layerColor(i),
    symbol: symbolFor(l.mark),
  }));
  const legendShow =
    spec.legend === false
      ? false
      : typeof spec.legend === 'object' && spec.legend.show !== undefined
        ? spec.legend.show
        : spec.layers.length > 1;
  const legendPosition =
    (typeof spec.legend === 'object' && spec.legend.position) || (legendItems.length > 8 ? 'right' : 'top');

  // --- Frame (reserve title / legend / both y gutters / x axis) ---
  const xShow = xAxisCfg.show !== false;
  const yShow = spec.axes?.y?.show !== false;
  const padding = { ...DEFAULT_PADDING, ...spec.padding };
  const titleInput =
    typeof spec.title === 'string'
      ? { text: spec.title }
      : spec.title
        ? { text: spec.title.text, subtitle: spec.title.subtitle }
        : undefined;

  const frame = computeFrame({
    width: opts.width,
    height: opts.height,
    padding,
    font: tokens.font,
    title: titleInput,
    legend: legendShow && legendItems.length > 1 ? { items: legendItems, position: legendPosition } : undefined,
    xAxis: { show: xShow, labels: xLabels, title: xAxisCfg.title ?? spec.encoding.x.title, edgeAnchored: !categories },
    yAxis: { show: yShow, labels: leftRes.labels, title: leftTitle },
    y2Axis: rightRes ? { show: true, labels: rightRes.labels, title: rightTitle } : undefined,
  });
  const plot = frame.plot;

  // --- Scales with final pixel ranges ---
  const yRange: [number, number] = [plot.y + plot.height, plot.y];
  const leftScale = linearScale({ domain: leftRes.domain, range: yRange });
  const rightScale = rightRes ? linearScale({ domain: rightRes.domain, range: yRange }) : null;
  const clampPx = (v: number): number =>
    v < plot.y ? plot.y : v > plot.y + plot.height ? plot.y + plot.height : v;
  const leftBaseline = clampPx(leftScale.map(0));
  const rightBaseline = rightScale ? clampPx(rightScale.map(0)) : leftBaseline;

  const xModel = buildXModel(
    xKind,
    xField,
    xType,
    categories,
    xDomainNum,
    [plot.x, plot.x + plot.width],
    0.2,
    spec.encoding.x.scale,
  );

  const xTicks: Tick[] = xTickValues
    .map((v, i) => {
      const pos = categories ? xModel.pixel(v) : xModel.pixel(typeof v === 'number' ? v : Number(v));
      return pos == null ? null : { value: v, pos, label: xLabels[i] };
    })
    .filter((t): t is Tick => t !== null);

  const leftTicks: Tick[] = leftRes.tickValues.map((v, i) => ({
    value: v,
    pos: leftScale.map(v),
    label: leftRes.labels[i],
  }));
  const rightTicks: Tick[] = rightRes
    ? rightRes.tickValues.map((v, i) => ({ value: v, pos: rightScale!.map(v), label: rightRes.labels[i] }))
    : [];

  // --- Per-layer cartesian models (consumed by the existing mark renderers) ---
  const barLayers = spec.layers.filter((l) => l.mark === 'bar');
  const barCount = barLayers.length;
  const layers: ComboLayerModel[] = spec.layers.map((layer, i) => {
    const side: ComboSide = layer.axis === 'right' && rightScale ? 'right' : 'left';
    const scale = side === 'right' ? rightScale! : leftScale;
    const baseline = side === 'right' ? rightBaseline : leftBaseline;
    const yField = layer.encoding.y.field;
    const color = layerColor(i);
    const name = layerName(layer);
    const layerX =
      layer.mark === 'bar' ? groupedBarX(xModel, barLayers.indexOf(layer), barCount) : xModel;
    const sideTicks = side === 'right' ? rightTicks : leftTicks;
    const model: CartesianModel = {
      spec: syntheticLayerSpec(spec, layer),
      tokens,
      frame,
      plot,
      x: layerX,
      y: { field: yField, scale, baseline, pixel: (v) => scale.map(toNumber(v)) },
      series: [{ key: '', label: name, color, value: name, rows: data }],
      seriesField: undefined,
      stacked: false,
      xTicks,
      yTicks: sideTicks,
      colorOf: () => color,
      sketch,
    };
    return { mark: layer.mark, side, color, name, model };
  });

  // --- Base model: drives the shared axis underlay / overlay chrome (left axis) ---
  const baseY: FieldDef = { ...(leftLayers[0]?.encoding.y ?? { field: '' }), title: leftTitle, format: leftFormat };
  const baseSpec: CartesianChartSpec = {
    type: 'line',
    data,
    encoding: { x: spec.encoding.x, y: baseY },
    axes: spec.axes,
    title: spec.title,
    legend: spec.legend,
    padding: spec.padding,
  };
  const base: CartesianModel = {
    spec: baseSpec,
    tokens,
    frame,
    plot,
    x: xModel,
    y: { field: baseY.field, scale: leftScale, baseline: leftBaseline, pixel: (v) => leftScale.map(toNumber(v)) },
    series: [],
    seriesField: undefined,
    stacked: false,
    xTicks,
    yTicks: leftTicks,
    colorOf: () => '',
    sketch,
  };

  return {
    spec,
    tokens,
    frame,
    plot,
    x: xModel,
    xTicks,
    left: { show: yShow, ticks: leftTicks, title: leftTitle },
    right: rightRes ? { show: true, ticks: rightTicks, title: rightTitle } : undefined,
    layers,
    legendItems,
    base,
    sketch,
  };
}
