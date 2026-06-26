import type { Datum, FieldType, Insets } from '../types';
import type { AggOp } from '../pivot';
import type { ThemeInput } from '../theme';

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

/** Fields shared by all spec types. */
export interface BaseSpec {
  /** Row-oriented (tidy) data. Required for all charts/tables. */
  data?: Datum[];
  /** Theme name ('light' | 'dark') or a partial override object. */
  theme?: ThemeInput;
  dimensions?: Dimensions;
  title?: string | TitleConfig;
  legend?: LegendConfig | boolean;
  tooltip?: TooltipConfig | boolean;
  axes?: AxesConfig;
  animation?: AnimationConfig | boolean;
  /** Extra padding around the plot area. */
  padding?: Partial<Insets>;
  /** Background override (defaults to the theme background). */
  background?: string;
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
  /** Show value/percent labels. */
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

export type ChartSpec =
  | LineSpec
  | AreaSpec
  | BarSpec
  | ScatterSpec
  | PieSpec
  | HeatmapSpec
  | KpiSpec
  | TableSpec
  | MatrixSpec;

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
];
