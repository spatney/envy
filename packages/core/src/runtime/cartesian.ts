/**
 * Cartesian model builder.
 *
 * Turns a line / area / bar / scatter spec + resolved theme + pixel size into a
 * fully-resolved drawing model: x/y scales, the plot rect, series split, color
 * mapping, and positioned axis ticks. Charts consume this model and only worry
 * about drawing marks. Heatmap, pie, kpi, table, and matrix are non-cartesian
 * and build their own models.
 */

import type { Datum, FieldType, Rect } from '../types';
import type { ThemeTokens } from '../theme';
import type {
  AreaSpec,
  AxisConfig,
  BarSpec,
  BoxSpec,
  CurveType,
  FieldDef,
  LegendConfig,
  LineSpec,
  ScatterSpec,
} from '../spec/types';
import {
  accessor,
  extent,
  groupBySeries,
  inferType,
  toDate,
  toKey,
  toNumber,
  uniqueStrings,
  type Series,
} from '../util/data';
import { ticks as numericTicks } from '../ticks';
import { timeTicks } from '../ticks';
import { niceDomain } from '../ticks';
import {
  bandScale,
  linearScale,
  logScale,
  pointScale,
  timeScale,
  type BandScale,
  type ContinuousScale,
  type PointScale,
} from '../scales';
import {
  curveCatmullRom,
  curveLinear,
  curveMonotoneX,
  curveStep,
  curveStepAfter,
  curveStepBefore,
  type Curve,
} from '../shape';
import { ordinalColorScale } from '../color';
import { rgbaToCss } from '../color';
import { formatNumber, formatValue, smartDate } from '../format';
import { computeFrame, type Frame, type LegendItem } from '../layout';
import { resolveSketch, type ResolvedSketch } from '../spec/sketch';
import type { Emphasis } from '../interaction/types';

export type CartesianChartSpec = LineSpec | AreaSpec | BarSpec | ScatterSpec | BoxSpec;

export type XKind = 'linear' | 'time' | 'band' | 'point';

export interface Tick {
  value: number | string;
  /** Pixel position along the axis. */
  pos: number;
  label: string;
}

export interface XModel {
  kind: XKind;
  field: string;
  type: FieldType;
  /** Band/point category domain. */
  categories?: string[];
  band?: BandScale;
  point?: PointScale;
  /** Continuous (linear/time) scale; domain in numbers or epoch ms. */
  continuous?: ContinuousScale;
  /** Category width for band scales (0 otherwise). */
  bandwidth: number;
  /** Project a data value to its center pixel, or undefined if unmappable. */
  pixel(value: unknown): number | undefined;
}

export interface YModel {
  field?: string;
  scale: ContinuousScale;
  /** Pixel of the zero baseline, clamped into the plot. */
  baseline: number;
  pixel(value: unknown): number;
}

export interface ResolvedSeries {
  key: string;
  label: string;
  color: string;
  value: unknown;
  rows: Datum[];
}

export interface CartesianModel {
  spec: CartesianChartSpec;
  tokens: ThemeTokens;
  frame: Frame;
  plot: Rect;
  x: XModel;
  y: YModel;
  series: ResolvedSeries[];
  seriesField?: string;
  stacked: boolean;
  xTicks: Tick[];
  yTicks: Tick[];
  colorOf(key: string): string;
  /** Hand-drawn render settings, or null for the default clean rendering. */
  sketch: ResolvedSketch | null;
  /**
   * Active highlight for this frame (matching rows full strength, the rest dimmed),
   * or null when nothing is selected. Set externally by the runtime from the spec's
   * `highlight` param + the shared store; `buildCartesianModel` leaves it null.
   */
  emphasis?: Emphasis | null;
}

const CURVES: Record<CurveType, Curve> = {
  linear: curveLinear,
  monotone: curveMonotoneX,
  step: curveStep,
  stepBefore: curveStepBefore,
  stepAfter: curveStepAfter,
  catmullRom: curveCatmullRom,
};

export function resolveCurve(curve?: CurveType): Curve {
  return curve ? (CURVES[curve] ?? curveLinear) : curveLinear;
}

function fieldType(spec: CartesianChartSpec, def: FieldDef | undefined, fallback: FieldType): FieldType {
  if (def?.type) return def.type;
  if (def && spec.data?.length) return inferType(spec.data, def.field);
  return fallback;
}

/** Decide the x scale kind from the chart type and field type. */
function xKindFor(spec: CartesianChartSpec, xType: FieldType): XKind {
  if (spec.type === 'bar' || spec.type === 'box') return 'band';
  if (xType === 'quantitative') return 'linear';
  if (xType === 'temporal') return 'time';
  return 'point';
}

function wantsZeroBaseline(spec: CartesianChartSpec): boolean {
  return spec.type === 'bar' || spec.type === 'area';
}

function isStacked(spec: CartesianChartSpec, seriesCount: number): boolean {
  if (seriesCount < 2) return false;
  if (spec.type === 'area') return spec.stack === true;
  if (spec.type === 'bar') return spec.stack === true;
  return false;
}

/** Stacked y extent: max of per-category cumulative sums (and min with 0). */
function stackedYExtent(
  rows: readonly Datum[],
  xField: string,
  yField: string,
): [number, number] {
  const readX = accessor(xField);
  const readY = accessor(yField);
  const pos = new Map<string, number>();
  const neg = new Map<string, number>();
  for (const d of rows) {
    const k = toKey(readX(d));
    const v = toNumber(readY(d));
    if (Number.isNaN(v)) continue;
    if (v >= 0) pos.set(k, (pos.get(k) ?? 0) + v);
    else neg.set(k, (neg.get(k) ?? 0) + v);
  }
  let max = 0;
  let min = 0;
  for (const v of pos.values()) if (v > max) max = v;
  for (const v of neg.values()) if (v < min) min = v;
  return [min, max];
}

/**
 * Coerce a domain to be strictly positive for a log scale, deriving sane bounds
 * from the data's positive values when the requested domain is missing or
 * invalid (log has no image at or below zero). Keeps charts robust instead of
 * silently emitting NaN geometry; `validateSpec` warns on a non-positive domain.
 */
function positiveLogDomain(
  requested: [number, number],
  data: readonly Datum[],
  field: string,
  base: number,
): [number, number] {
  let lo = requested[0];
  let hi = requested[1];
  if (!(lo > 0) || !(hi > 0)) {
    const read = accessor(field);
    const positives = data
      .map((d) => toNumber(read(d)))
      .filter((v) => Number.isFinite(v) && v > 0);
    const pmin = positives.length ? Math.min(...positives) : 1;
    const pmax = positives.length ? Math.max(...positives) : base;
    if (!(lo > 0)) lo = pmin;
    if (!(hi > 0)) hi = pmax;
  }
  if (hi < lo) [lo, hi] = [hi, lo];
  if (lo === hi) hi = lo * base;
  return [lo, hi];
}

function resolveSeriesField(spec: CartesianChartSpec): string | undefined {
  const enc = spec.encoding;
  if (enc.series?.field) return enc.series.field;
  if (enc.color?.field) {
    const t = fieldType(spec, enc.color, 'nominal');
    if (t !== 'quantitative') return enc.color.field;
  }
  return undefined;
}

function legendDefaults(
  spec: CartesianChartSpec,
  seriesCount: number,
): { show: boolean; position: 'top' | 'right' | 'bottom' | 'left' } {
  const cfg = spec.legend;
  const show =
    cfg === true
      ? true
      : cfg === false
        ? false
        : typeof cfg === 'object' && cfg.show !== undefined
          ? cfg.show
          : seriesCount > 1;
  const position =
    (typeof cfg === 'object' && (cfg as LegendConfig).position) ||
    (seriesCount > 8 ? 'right' : 'top');
  return { show, position };
}

function axisCfg(spec: CartesianChartSpec, axis: 'x' | 'y'): AxisConfig {
  return spec.axes?.[axis] ?? {};
}

function numericTickValues(d0: number, d1: number, count: number): number[] {
  return numericTicks(d0, d1, count);
}

function formatNumericTick(value: number, userFormat: string | undefined): string {
  if (userFormat) return formatValue(value, userFormat);
  return formatNumber(value, ',');
}

const DEFAULT_PADDING = { top: 12, right: 16, bottom: 12, left: 12 };

export interface BuildOptions {
  width: number;
  height: number;
  /** Origin offset, so the model lays out within a sub-region (a facet cell). */
  originX?: number;
  originY?: number;
  /** Shared scale domains/colors, so faceted panels stay directly comparable. */
  shared?: SharedScales;
}

/** Scale state shared across a facet grid so every panel is comparable. */
export interface SharedScales {
  /** Band/point category domain (the full ordered category list). */
  categories?: string[];
  /** Continuous (linear) or temporal (epoch ms) x-domain. */
  xDomain?: [number, number];
  /** Linear y-domain (already accounting for any zero baseline). */
  yDomain?: [number, number];
  /** Series-key → color, so the same series keeps its color in every panel. */
  colorOf?: (key: string) => string;
}

export function buildCartesianModel(
  spec: CartesianChartSpec,
  tokens: ThemeTokens,
  opts: BuildOptions,
): CartesianModel {
  const data = spec.data ?? [];
  const enc = spec.encoding;
  const xField = enc.x.field;
  const yField = enc.y.field;
  const xType = fieldType(spec, enc.x, 'nominal');
  const xKind = xKindFor(spec, xType);

  // --- Series split + colors ---
  const seriesField = resolveSeriesField(spec);
  const rawSeries: Series[] = groupBySeries(data, seriesField);
  const seriesKeys = rawSeries.map((s) => s.key);
  const palette = tokens.color.palette;
  const colorScale = ordinalColorScale({ domain: seriesKeys, palette });
  const colorCache = new Map<string, string>();
  const sharedColor = opts.shared?.colorOf;
  const colorOf = (key: string): string => {
    if (sharedColor) return sharedColor(key);
    let c = colorCache.get(key);
    if (!c) {
      c = rgbaToCss(colorScale.map(key));
      colorCache.set(key, c);
    }
    return c;
  };
  const singleSeries = rawSeries.length <= 1 && !seriesField;
  const series: ResolvedSeries[] = rawSeries.map((s) => ({
    key: s.key,
    label: s.key === '' ? (enc.y.title ?? yField) : s.key,
    color: sharedColor ? sharedColor(s.key) : singleSeries ? rgbaToCss(colorScale.map(s.key)) : colorOf(s.key),
    value: s.value,
    rows: s.rows,
  }));

  const stacked = isStacked(spec, series.length);

  // --- Domains (pixel-independent) ---
  let categories: string[] | undefined;
  let xDomainNum: [number, number] | null = null;
  if (xKind === 'band' || xKind === 'point') {
    const cfgDomain = enc.x.scale?.domain;
    categories =
      opts.shared?.categories ??
      (Array.isArray(cfgDomain) && typeof cfgDomain[0] === 'string'
        ? (cfgDomain as string[])
        : uniqueStrings(data, xField));
  } else if (xKind === 'time') {
    if (opts.shared?.xDomain) {
      xDomainNum = opts.shared.xDomain;
    } else {
      const ms = data
        .map((d) => toDate(accessor(xField)(d))?.getTime())
        .filter((v): v is number => v != null);
      xDomainNum = ms.length ? [Math.min(...ms), Math.max(...ms)] : [0, 1];
    }
  } else if (opts.shared?.xDomain) {
    xDomainNum = opts.shared.xDomain;
  } else {
    xDomainNum = extent(data, xField) ?? [0, 1];
    const xScaleCfg = enc.x.scale;
    if (xScaleCfg?.type === 'log') {
      xDomainNum = positiveLogDomain(
        xScaleCfg.domain && typeof xScaleCfg.domain[0] === 'number'
          ? [xScaleCfg.domain[0], xScaleCfg.domain[1] as number]
          : xDomainNum,
        data,
        xField,
        xScaleCfg.base ?? 10,
      );
    } else if (xScaleCfg?.domain && typeof xScaleCfg.domain[0] === 'number') {
      xDomainNum = [xScaleCfg.domain[0], xScaleCfg.domain[1] as number];
    } else if (xScaleCfg?.nice !== false) {
      xDomainNum = niceDomain(xDomainNum[0], xDomainNum[1], 10);
    }
  }

  const yScaleCfg = enc.y.scale;
  const yIsLog = yScaleCfg?.type === 'log';
  const yBase = yScaleCfg?.base ?? 10;
  const yClamp = yScaleCfg?.clamp === true;
  const sharedY = opts.shared?.yDomain;
  let yDomain: [number, number];
  if (sharedY) {
    yDomain = sharedY;
  } else if (stacked) {
    yDomain = stackedYExtent(data, xField, yField);
  } else {
    const ext = extent(data, yField) ?? [0, 1];
    yDomain = [ext[0], ext[1]];
  }
  // An explicit `scale.zero` overrides the per-chart-type default; a log scale
  // never includes zero (zero has no logarithm).
  const forceZero = yIsLog ? false : (yScaleCfg?.zero ?? wantsZeroBaseline(spec));
  if (forceZero && !sharedY) {
    yDomain = [Math.min(0, yDomain[0]), Math.max(0, yDomain[1])];
  }
  const xAxisCfg = axisCfg(spec, 'x');
  const yAxisCfg = axisCfg(spec, 'y');
  const yTickCount = yAxisCfg.ticks ?? 6;

  // Tick values and the y-domain must be derived together so that the first and
  // last tick sit exactly on the plot edges (otherwise labels spill past the axis).
  // A shared (facet) domain is treated like an explicit domain — never re-expanded,
  // so every panel keeps identical scales.
  const yExplicitTicks =
    yAxisCfg.tickValues && yAxisCfg.tickValues.length ? yAxisCfg.tickValues.slice() : null;
  const yExplicit = (yScaleCfg?.domain && typeof yScaleCfg.domain[0] === 'number') || !!sharedY;
  let yTickValues: number[];
  if (yIsLog) {
    if (yScaleCfg?.domain && typeof yScaleCfg.domain[0] === 'number') {
      yDomain = positiveLogDomain([yScaleCfg.domain[0], yScaleCfg.domain[1] as number], data, yField, yBase);
    } else if (!sharedY) {
      yDomain = positiveLogDomain(yDomain, data, yField, yBase);
    }
    const lo = Math.min(yDomain[0], yDomain[1]);
    const hi = Math.max(yDomain[0], yDomain[1]);
    yTickValues = (yExplicitTicks ?? logScale({ domain: yDomain, range: [0, 1], base: yBase }).ticks()).filter(
      (v) => v > 0 && v >= lo - 1e-9 && v <= hi + 1e-9,
    );
  } else if (yExplicit) {
    if (yScaleCfg?.domain && typeof yScaleCfg.domain[0] === 'number') {
      yDomain = [yScaleCfg.domain[0], yScaleCfg.domain[1] as number];
    }
    const lo = Math.min(yDomain[0], yDomain[1]);
    const hi = Math.max(yDomain[0], yDomain[1]);
    yTickValues = (yExplicitTicks ?? numericTickValues(yDomain[0], yDomain[1], yTickCount)).filter(
      (v) => v >= lo - 1e-9 && v <= hi + 1e-9,
    );
  } else if (yExplicitTicks) {
    yTickValues = yExplicitTicks;
    yDomain = [Math.min(yDomain[0], ...yExplicitTicks), Math.max(yDomain[1], ...yExplicitTicks)];
  } else if (yScaleCfg?.nice !== false) {
    yTickValues = numericTickValues(yDomain[0], yDomain[1], yTickCount);
    if (yTickValues.length >= 2) {
      yDomain = [
        Math.min(yTickValues[0], yDomain[0]),
        Math.max(yTickValues[yTickValues.length - 1], yDomain[1]),
      ];
    }
  } else {
    yTickValues = numericTickValues(yDomain[0], yDomain[1], yTickCount).filter(
      (v) => v >= yDomain[0] - 1e-9 && v <= yDomain[1] + 1e-9,
    );
  }
  if (yDomain[0] === yDomain[1]) yDomain = [yDomain[0], yDomain[0] + 1];

  // --- Tick labels (pixel-independent) ---
  const yLabels = yTickValues.map((v) => formatNumericTick(v, enc.y.format ?? yAxisCfg.format));

  let xTickValues: Array<number | string>;
  let xLabels: string[];
  let xStepMs = 0;
  if (categories) {
    xTickValues = categories;
    xLabels = categories.map((c) => c);
  } else if (xKind === 'time') {
    const xt = timeTicks(xDomainNum![0], xDomainNum![1], xAxisCfg.ticks ?? 7);
    xTickValues = xt;
    xStepMs = xt.length > 1 ? xt[1] - xt[0] : 0;
    xLabels = xt.map((v) => (enc.x.format ? formatValue(v, enc.x.format) : smartDate(v, xStepMs)));
  } else {
    const xLo = Math.min(xDomainNum![0], xDomainNum![1]);
    const xHi = Math.max(xDomainNum![0], xDomainNum![1]);
    const xExplicitTicks =
      xAxisCfg.tickValues && xAxisCfg.tickValues.length ? xAxisCfg.tickValues.slice() : null;
    let xt: number[];
    if (xExplicitTicks) {
      xt = xExplicitTicks.filter((v) => v >= xLo - 1e-9 && v <= xHi + 1e-9);
    } else if (enc.x.scale?.type === 'log') {
      xt = logScale({ domain: xDomainNum!, range: [0, 1], base: enc.x.scale.base ?? 10 })
        .ticks()
        .filter((v) => v > 0 && v >= xLo - 1e-9 && v <= xHi + 1e-9);
    } else {
      xt = numericTickValues(xDomainNum![0], xDomainNum![1], xAxisCfg.ticks ?? 8).filter(
        (v) => v >= xLo - 1e-9 && v <= xHi + 1e-9,
      );
    }
    xTickValues = xt;
    xLabels = xt.map((v) => formatNumericTick(v, enc.x.format ?? xAxisCfg.format));
  }

  // --- Frame (reserve title/legend/axis space) ---
  const xShow = xAxisCfg.show !== false;
  const yShow = yAxisCfg.show !== false;
  const legend = legendDefaults(spec, series.length);
  const legendItems: LegendItem[] = series.map((s) => ({
    label: s.label,
    color: s.color,
    symbol: spec.type === 'scatter' ? 'circle' : spec.type === 'line' ? 'line' : 'square',
  }));
  const padding = { ...DEFAULT_PADDING, ...spec.padding };
  const titleInput = resolveTitle(spec);

  const frame = computeFrame({
    width: opts.width,
    height: opts.height,
    originX: opts.originX,
    originY: opts.originY,
    padding,
    font: tokens.font,
    title: titleInput,
    legend: legend.show && legendItems.length > 1 ? { items: legendItems, position: legend.position } : undefined,
    xAxis: { show: xShow, labels: xLabels, title: resolveAxisTitle(enc.x, xAxisCfg), edgeAnchored: !categories },
    yAxis: { show: yShow, labels: yLabels, title: resolveAxisTitle(enc.y, yAxisCfg) },
  });
  const plot = frame.plot;

  // --- Build scales with final ranges ---
  const yRange: [number, number] = [plot.y + plot.height, plot.y];
  const yScale = yIsLog
    ? logScale({ domain: yDomain, range: yRange, base: yBase, clamp: yClamp })
    : linearScale({ domain: yDomain, range: yRange, clamp: yClamp });
  const yPixel = (value: unknown): number => yScale.map(toNumber(value));
  const baseline = yIsLog
    ? plot.y + plot.height
    : clampPx(yScale.map(0), plot.y, plot.y + plot.height);

  const xModel = buildXModel(xKind, {
    field: xField,
    type: xType,
    categories,
    domainNum: xDomainNum,
    range: [plot.x, plot.x + plot.width],
    paddingInner: spec.type === 'bar' ? 0.2 : spec.type === 'box' ? 0.32 : 0.5,
    scaleCfg: enc.x.scale,
  });

  // --- Positioned ticks ---
  const yTicks: Tick[] = yTickValues.map((v, i) => ({
    value: v,
    pos: yScale.map(v),
    label: yLabels[i],
  }));
  const xTicks: Tick[] = xTickValues
    .map((v, i) => {
      const pos = categories ? xModel.pixel(v) : xModel.pixel(toTickNumber(v));
      return pos == null ? null : { value: v, pos, label: xLabels[i] };
    })
    .filter((t): t is Tick => t !== null);

  return {
    spec,
    tokens,
    frame,
    plot,
    x: xModel,
    y: { field: yField, scale: yScale, baseline, pixel: yPixel },
    series,
    seriesField,
    stacked,
    xTicks,
    yTicks,
    colorOf,
    sketch: resolveSketch(spec),
  };
}

function toTickNumber(v: number | string): number {
  return typeof v === 'number' ? v : Number(v);
}

interface XBuildArgs {
  field: string;
  type: FieldType;
  categories?: string[];
  domainNum: [number, number] | null;
  range: [number, number];
  paddingInner: number;
  scaleCfg?: FieldDef['scale'];
}

function buildXModel(kind: XKind, args: XBuildArgs): XModel {
  if (kind === 'band') {
    const band = bandScale({
      domain: args.categories ?? [],
      range: args.range,
      paddingInner: args.scaleCfg?.padding ?? args.paddingInner,
      paddingOuter: (args.scaleCfg?.padding ?? args.paddingInner) / 2,
    });
    return {
      kind,
      field: args.field,
      type: args.type,
      categories: args.categories,
      band,
      bandwidth: band.bandwidth,
      pixel: (value) => {
        const p = band.map(toKey(value));
        return p == null ? undefined : p + band.bandwidth / 2;
      },
    };
  }
  if (kind === 'point') {
    const point = pointScale({
      domain: args.categories ?? [],
      range: args.range,
      padding: args.scaleCfg?.padding ?? 0.5,
    });
    return {
      kind,
      field: args.field,
      type: args.type,
      categories: args.categories,
      point,
      bandwidth: 0,
      pixel: (value) => point.map(toKey(value)),
    };
  }
  const domain = args.domainNum ?? [0, 1];
  const clamp = args.scaleCfg?.clamp === true;
  const continuous =
    kind === 'time'
      ? timeScale({ domain, range: args.range })
      : args.scaleCfg?.type === 'log'
        ? logScale({ domain, range: args.range, base: args.scaleCfg.base ?? 10, clamp })
        : linearScale({ domain, range: args.range, clamp });
  return {
    kind,
    field: args.field,
    type: args.type,
    continuous,
    bandwidth: 0,
    pixel: (value) => {
      const n = kind === 'time' ? toDate(value)?.getTime() : toNumber(value);
      return n == null || Number.isNaN(n) ? undefined : continuous.map(n);
    },
  };
}

function resolveTitle(spec: CartesianChartSpec): { text?: string; subtitle?: string } | undefined {
  if (!spec.title) return undefined;
  if (typeof spec.title === 'string') return { text: spec.title };
  return { text: spec.title.text, subtitle: spec.title.subtitle };
}

function resolveAxisTitle(def: FieldDef, cfg: AxisConfig): string | undefined {
  if (cfg.title !== undefined) return cfg.title;
  return def.title;
}

function clampPx(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}
