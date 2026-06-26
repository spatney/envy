import type { Datum, FieldType, Insets } from '../types';
import type { AggOp } from '../pivot';
import type { ThemeInput } from '../theme';
import type { FillStyle } from '../rough';

/**
 * Envy declarative chart specs.
 *
 * One chart = one JSON-serializable `ChartSpec`. The shape is intentionally
 * Vega-Lite-flavored (data + encoding channels) so coding agents can generate
 * charts reliably. Every field is plain JSON (no functions) so specs round-trip
 * through `JSON.stringify`.
 */

/** How a data field maps onto a visual channel. */
export interface FieldDef {
  /** Column name in each datum. */
  field: string;
  /** Data type; inferred from the data when omitted. */
  type?: FieldType;
  /** Optional aggregation applied when grouping (e.g. sum of sales). */
  aggregate?: AggOp;
  /** Axis/legend title override. */
  title?: string;
  /** Number/date format hint (see format module), e.g. ',.0f' or '%b %Y'. */
  format?: string;
  /** Per-channel scale overrides. */
  scale?: ScaleConfig;
}

export type ScaleType = 'linear' | 'log' | 'time' | 'band' | 'point';

export interface ScaleConfig {
  type?: ScaleType;
  /** Explicit domain; numbers for continuous, strings for categorical. */
  domain?: [number, number] | string[];
  /** Round the domain to nice values (continuous only). */
  nice?: boolean;
  /** Force the domain to include zero (continuous only). */
  zero?: boolean;
  /** Clamp out-of-domain values into range. */
  clamp?: boolean;
  /** Band/point padding (0..1). */
  padding?: number;
  /** Log base. */
  base?: number;
  /** Reverse the range. */
  reverse?: boolean;
}

/** Visual encoding channels. Not every chart uses every channel. */
export interface Encoding {
  x?: FieldDef;
  y?: FieldDef;
  /** Upper bound for ranged area / band marks. */
  y2?: FieldDef;
  /** Color channel (series color or continuous color). */
  color?: FieldDef;
  /** Size channel (bubble radius). */
  size?: FieldDef;
  /** Splits data into multiple series (multi-line, grouped/stacked bars). */
  series?: FieldDef;
  /** Pie/donut angular measure. */
  theta?: FieldDef;
  /** Text/label channel. */
  label?: FieldDef;
  /** Sankey link source node. */
  source?: FieldDef;
  /** Sankey link target node. */
  target?: FieldDef;
  /** Magnitude channel (Sankey link value / generic measure). */
  value?: FieldDef;
  /** Geographic key matching a GeoJSON feature (choropleth). */
  key?: FieldDef;
}

export interface Dimensions {
  /** Fixed width in px. Omit for responsive (fills container). */
  width?: number;
  /** Fixed height in px. Omit for responsive (fills container). */
  height?: number;
  /** Re-render on container resize (default true when width/height omitted). */
  autoResize?: boolean;
}

export interface AxisConfig {
  show?: boolean;
  title?: string;
  grid?: boolean;
  /** Approximate tick count. */
  ticks?: number;
  /** Explicit tick values. */
  tickValues?: number[];
  format?: string;
  /** Show tick labels. */
  labels?: boolean;
}

export interface AxesConfig {
  x?: AxisConfig;
  y?: AxisConfig;
}

export type LegendPosition = 'top' | 'right' | 'bottom' | 'left';

export interface LegendConfig {
  show?: boolean;
  position?: LegendPosition;
  title?: string;
}

export interface TooltipConfig {
  show?: boolean;
}

export interface TitleConfig {
  text?: string;
  subtitle?: string;
  align?: 'left' | 'center' | 'right';
}

export interface AnimationConfig {
  enabled?: boolean;
  duration?: number;
  easing?: string;
}

/**
 * Hand-drawn ("sketch") rendering options. Set `sketch: true` on any spec for
 * the defaults, or pass this object to tune the look. All fields are plain JSON
 * so specs still round-trip through `JSON.stringify`.
 */
export interface SketchConfig {
  /** Wobble magnitude. 0 ≈ clean, 1 = default, >1 = wilder. */
  roughness?: number;
  /** How much straight strokes bow between their endpoints. */
  bowing?: number;
  /** Fill treatment for closed marks (bars, wedges, cells). Default 'hachure'. */
  fillStyle?: FillStyle;
  /** Spacing (px) between hachure lines. Omit to derive from stroke width. */
  hachureGap?: number;
  /** Hachure angle in degrees (default -41). */
  hachureAngle?: number;
  /** Outline width multiplier (default 1). */
  strokeWidth?: number;
  /** Explicit PRNG seed; omit to derive a stable one from the spec. */
  seed?: number;
  /** Apply the hand-drawn font to titles/labels/axes (default true). */
  font?: boolean;
}

/** Fields shared by all spec types. */
export interface BaseSpec {
  /** Row-oriented (tidy) data. Required for all charts/tables. */
  data?: Datum[];
  /** Theme name ('light' | 'dark') or a partial override object. */
  theme?: ThemeInput;
  dimensions?: Dimensions;
  title?: string | TitleConfig;
  /**
   * Accessible description (alt text) for the chart. Used verbatim as the
   * chart's `aria-label`; when omitted, a concise label is synthesized from the
   * type, title, and data. Agents should set this to convey the chart's intent.
   */
  description?: string;
  legend?: LegendConfig | boolean;
  tooltip?: TooltipConfig | boolean;
  axes?: AxesConfig;
  animation?: AnimationConfig | boolean;
  /** Extra padding around the plot area. */
  padding?: Partial<Insets>;
  /** Background override (defaults to the theme background). */
  background?: string;
  /**
   * Render the chart in a hand-drawn ("sketch") style — wobbly outlines, hachure
   * fills, and a handwriting font. `true` uses the defaults; pass a `SketchConfig`
   * to tune it. Omit (or `false`) for the default clean rendering.
   */
  sketch?: boolean | SketchConfig;
}

export type CurveType =
  | 'linear'
  | 'monotone'
  | 'step'
  | 'stepBefore'
  | 'stepAfter'
  | 'catmullRom';

export interface LineSpec extends BaseSpec {
  type: 'line';
  encoding: Encoding & { x: FieldDef; y: FieldDef };
  curve?: CurveType;
  /** Show point markers on the line. */
  points?: boolean;
  /** Fill the area under the line. */
  area?: boolean;
}

export interface AreaSpec extends BaseSpec {
  type: 'area';
  encoding: Encoding & { x: FieldDef; y: FieldDef };
  curve?: CurveType;
  /** Stack multiple series. */
  stack?: boolean;
}

export interface BarSpec extends BaseSpec {
  type: 'bar';
  encoding: Encoding & { x: FieldDef; y: FieldDef };
  orientation?: 'vertical' | 'horizontal';
  /** Stack series (default false). */
  stack?: boolean;
  /** Group series side-by-side (default when `series` present and not stacked). */
  group?: boolean;
  cornerRadius?: number;
}

export interface ScatterSpec extends BaseSpec {
  type: 'scatter';
  encoding: Encoding & { x: FieldDef; y: FieldDef };
}

export interface PieSpec extends BaseSpec {
  type: 'pie';
  encoding: Encoding & { theta: FieldDef; color: FieldDef };
  /** true for a default donut, or a 0..1 inner-radius ratio. */
  donut?: boolean | number;
  /** Show value/percent labels. Defaults to true; set false to hide. */
  labels?: boolean;
}

export interface HeatmapSpec extends BaseSpec {
  type: 'heatmap';
  encoding: Encoding & { x: FieldDef; y: FieldDef; color: FieldDef };
  /** Sequential/diverging ramp name. */
  scheme?: string;
}

export type ValueRef = number | { field: string; aggregate?: AggOp };

export interface KpiSpec extends BaseSpec {
  type: 'kpi';
  /** Literal value or a field (optionally aggregated over data). */
  value: ValueRef;
  label?: string;
  /** Delta vs. a comparison, drives the up/down indicator. */
  delta?: ValueRef;
  format?: string;
  /** Inline sparkline from a numeric field. */
  sparkline?: boolean | { field: string };
}

export type ConditionalFormat =
  | { type: 'colorScale'; scheme?: string; domain?: [number, number] }
  | { type: 'bar'; color?: string; domain?: [number, number] };

export interface TableColumn {
  field: string;
  title?: string;
  type?: FieldType;
  format?: string;
  align?: 'left' | 'center' | 'right';
  width?: number;
  conditionalFormat?: ConditionalFormat;
}

export interface TableSpec extends BaseSpec {
  type: 'table';
  /** Explicit columns; inferred from data keys when omitted. */
  columns?: TableColumn[];
  sort?: { field: string; order?: 'asc' | 'desc' };
  /** Zebra striping (off by default — flat aesthetic). */
  striped?: boolean;
  /** Sticky header (default true). */
  stickyHeader?: boolean;
}

export interface MatrixValueDef {
  field: string;
  op: AggOp;
  label?: string;
  format?: string;
  conditionalFormat?: ConditionalFormat;
}

export interface MatrixSpec extends BaseSpec {
  type: 'matrix';
  /** Row grouping fields (hierarchical). */
  rows: string[];
  /** Column grouping fields (hierarchical). */
  columns?: string[];
  values: MatrixValueDef[];
  subtotals?: boolean;
  grandTotals?: boolean;
}

export interface BoxSpec extends BaseSpec {
  type: 'box';
  /**
   * `x` is the category axis (one box per category); `y` holds the raw
   * observations that are summarized into quartiles. Add `series` to draw
   * grouped boxes side-by-side within each category.
   */
  encoding: Encoding & { x: FieldDef; y: FieldDef };
  /**
   * Whisker rule:
   * - 'tukey' (default): whiskers reach the furthest points within 1.5×IQR of
   *   the quartiles; points beyond are drawn as outliers.
   * - 'minMax': whiskers span the full data range (no outliers).
   */
  whisker?: 'tukey' | 'minMax';
  /** Draw outlier points beyond the whiskers (tukey only; default true). */
  outliers?: boolean;
}

export interface SankeySpec extends BaseSpec {
  type: 'sankey';
  /**
   * Each data row is one link. Nodes are derived from the distinct `source`
   * and `target` values; `value` is the flow magnitude (link/node thickness).
   */
  encoding: Encoding & { source: FieldDef; target: FieldDef; value: FieldDef };
  /** Node block width in px (default 16). */
  nodeWidth?: number;
  /** Vertical gap between stacked nodes in px (default 14). */
  nodePadding?: number;
  /** Show the node total alongside its label (default true). */
  nodeValues?: boolean;
}

/** A GeoJSON position: [longitude, latitude] (or projected [x, y]). */
export type GeoPosition = [number, number];

export interface GeoPolygon {
  type: 'Polygon';
  /** Rings: the first is the exterior, the rest are holes. */
  coordinates: GeoPosition[][];
}

export interface GeoMultiPolygon {
  type: 'MultiPolygon';
  coordinates: GeoPosition[][][];
}

export type GeoGeometry = GeoPolygon | GeoMultiPolygon;

export interface GeoFeature {
  type: 'Feature';
  id?: string | number;
  properties?: Record<string, unknown> | null;
  geometry: GeoGeometry | null;
}

export interface GeoFeatureCollection {
  type: 'FeatureCollection';
  features: GeoFeature[];
}

/**
 * How feature coordinates are mapped to the screen:
 * - 'mercator' / 'equirectangular': geographic [lon, lat] projections.
 * - 'identity': coordinates are already planar [x, y] in screen orientation
 *   (y increases downward), e.g. data pre-projected with Albers USA. Useful for
 *   composite projections or non-geographic polygon maps.
 */
export type MapProjection = 'mercator' | 'equirectangular' | 'identity';

export interface ChoroplethSpec extends BaseSpec {
  type: 'choropleth';
  /** Map geometry: a GeoJSON FeatureCollection of Polygon/MultiPolygon features. */
  geo: GeoFeatureCollection;
  /**
   * `key` joins each data row to a feature; `color` is the numeric value that
   * drives the fill via a sequential color scale.
   */
  encoding: Encoding & { key: FieldDef; color: FieldDef };
  /**
   * Where to read a feature's join id: a property name (e.g. 'name' for
   * `feature.properties.name'), or 'id' for the top-level `feature.id`.
   * Defaults to trying `feature.id`, then `properties.id`, then `properties.name`.
   */
  featureId?: string;
  /** Geographic projection (default 'mercator'). */
  projection?: MapProjection;
  /** Sequential color scheme name (e.g. 'teal', 'blues', 'viridis'). */
  scheme?: string;
}

export type ChartSpec =
  | LineSpec
  | AreaSpec
  | BarSpec
  | ScatterSpec
  | PieSpec
  | HeatmapSpec
  | KpiSpec
  | TableSpec
  | MatrixSpec
  | BoxSpec
  | SankeySpec
  | ChoroplethSpec;

export type ChartType = ChartSpec['type'];

export const CHART_TYPES: readonly ChartType[] = [
  'line',
  'area',
  'bar',
  'scatter',
  'pie',
  'heatmap',
  'kpi',
  'table',
  'matrix',
  'box',
  'sankey',
  'choropleth',
];
