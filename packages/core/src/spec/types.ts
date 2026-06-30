import type { Datum, FieldType, Insets } from '../types';
import type { AggOp } from '../pivot';
import type { ThemeInput } from '../theme';
import type { FillStyle } from '../rough';
import type { FilterClause, HighlightConfig, SelectionParam } from './selection';
import type { Transform } from './transform';

/**
 * Graphein declarative chart specs.
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
  /** Funnel stage (ordered category, one bar per stage). */
  stage?: FieldDef;
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
  /**
   * Rotation of x-axis tick labels in degrees: `0` horizontal, `45` diagonal,
   * `90` vertical. Omit for **auto** — categorical (bar/column) labels rotate to
   * 45° when there isn't room to show them all horizontally, so every category
   * stays visible instead of being thinned out. (X axis only.)
   */
  labelAngle?: number;
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
  /** Allow clicking legend items to toggle/isolate series; publishes a selection. */
  interactive?: boolean;
  /** Selection param to publish legend visibility to; defaults to the series field name. */
  param?: string;
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
  /**
   * Declarative data transforms applied to `data` (in order) before the chart is
   * built — aggregate, bin, filter, fold, timeUnit. Reshape data *inside* the
   * spec instead of pre-massaging the array, so encodings can reference fields
   * the pipeline produces. Pure JSON; see {@link Transform}.
   */
  transform?: Transform[];
  /** Theme name ('light' | 'dark') or a partial override object. */
  theme?: ThemeInput;
  /** Named categorical palette ('graphein'|'colorblind'|'bright'|'muted') or an explicit array of series colors. */
  palette?: string | string[];
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
  /**
   * Named selections this visual publishes. Clicking marks, brushing, or
   * changing a slicer updates the param's value on the shared selection store,
   * which other visuals can consume via {@link BaseSpec.highlight} or
   * {@link BaseSpec.filter}. Pure data — no callbacks.
   */
  params?: SelectionParam[];
  /**
   * Emphasize rows matching a selection and dim the rest. References a param by
   * name (typically published by another visual for cross-highlighting). An array
   * unions several sources: a row is emphasized if it matches *any* active one.
   */
  highlight?: HighlightConfig | HighlightConfig[];
  /**
   * Subset this visual's rows to those matching every clause (logical AND).
   * Each clause is a named param (cross-filter) or a literal predicate.
   */
  filter?: FilterClause[];
}

export type CurveType =
  | 'linear'
  | 'monotone'
  | 'step'
  | 'stepBefore'
  | 'stepAfter'
  | 'catmullRom';

/**
 * A reference annotation overlaid on a cartesian chart: a single reference
 * **line** at a value, or a filled **band** / threshold **zone** between two
 * values. Useful for targets, goals, averages, control limits, and "danger"
 * ranges. Drawn over the gridlines and data marks; labels render in the overlay.
 */
export interface Annotation {
  /**
   * What to draw. Omit to infer: a `line` when `value` is set, a `band` when
   * `from`/`to` are set. `zone` is a band — a semantic alias for a threshold band.
   * A `point` marks a single (`x`, `y`) data coordinate with a labeled dot.
   */
  type?: 'line' | 'band' | 'zone' | 'point';
  /**
   * Which axis the value(s) are measured against. `y` (default) draws a
   * horizontal line / full-width band; `x` draws a vertical line / full-height band.
   */
  axis?: 'x' | 'y';
  /** Reference value for a `line` (number, category, or date — matching the axis). */
  value?: number | string | Date;
  /** Start of the span for a `band`/`zone`. */
  from?: number | string | Date;
  /** End of the span for a `band`/`zone`. */
  to?: number | string | Date;
  /** X coordinate of a `point` callout (a data value on the x-axis). */
  x?: number | string | Date;
  /** Y coordinate of a `point` callout (a data value on the y-axis). */
  y?: number | string | Date;
  /** Marker radius in pixels for a `point` (default 3.5). */
  markerRadius?: number;
  /** Short text label drawn beside the annotation. */
  label?: string;
  /** Stroke (line) / fill (band) color. Defaults to a muted theme color. */
  color?: string;
  /** Line width in pixels for a `line` (default 1.5). */
  strokeWidth?: number;
  /** Dash pattern for the stroke; `[]` is solid. Lines/bands default to dashed. */
  strokeDash?: number[];
  /** Fill opacity for a `band`/`zone` (0..1, default 0.12). */
  fillOpacity?: number;
  /** Where the label anchors along the annotation (default `end`). */
  labelPosition?: 'start' | 'middle' | 'end';
}

/**
 * Which automatic data insights to mark on a cartesian plot. Enable via a
 * chart's `insights` field — `true` marks the max and min; an object opts into
 * specific callouts. The library derives the points and draws labeled markers,
 * so an agent never has to reason out (or hardcode) where the peak is.
 */
export interface InsightOptions {
  /** Mark the maximum point (default true). */
  max?: boolean;
  /** Mark the minimum point (default true). */
  min?: boolean;
  /** Mark statistical outliers beyond the 1.5×IQR fences (default false). */
  outliers?: boolean;
}

/**
 * A derived **trendline** (line of best fit) overlaid on a cartesian plot.
 * Enable via a chart's `trendline` field — `true` fits a single linear
 * regression; an object configures the fit and its styling. The library
 * computes the regression from the plotted rows, so an agent never has to
 * derive slope/intercept coordinates by hand. Requires a continuous or temporal
 * x-axis (scatter, line, area) — it is meaningless on a categorical/band axis.
 */
export interface TrendlineConfig {
  /** Fit method. Currently `'linear'` (ordinary least squares). */
  method?: 'linear';
  /**
   * Fit a separate line per color/series group. Defaults to `true` when the
   * chart splits into multiple series, `false` (one overall fit) otherwise.
   */
  groupBy?: boolean;
  /** Draw an `R²=…` label at the end of each fitted line (default false). */
  label?: boolean;
  /** Line color. Defaults to the series color (grouped) or a muted ink. */
  color?: string;
  /** Line width in px (default 2). */
  strokeWidth?: number;
  /** Dash pattern; `[]` is solid (the default). */
  strokeDash?: number[];
}

/**
 * **Faceting** (small multiples): split a chart into a trellis grid of panels,
 * one per distinct value of a field, all sharing identical x/y/color scales so
 * the panels are directly comparable. Enable via a chart's `facet` field — a
 * single field reference yields a whole comparison grid, which is why it is so
 * agent-friendly. Supported on `line`, `area`, `bar`, and `scatter`.
 */
export interface FacetConfig {
  /** The field whose distinct values become one panel each. */
  field: string;
  /** Number of grid columns. Defaults to roughly √n, capped for readability. */
  columns?: number;
  /** Order the panels by their facet value (default `ascending`). */
  sort?: 'ascending' | 'descending' | 'none';
}

export interface LineSpec extends BaseSpec {
  type: 'line';
  encoding: Encoding & { x: FieldDef; y: FieldDef };
  curve?: CurveType;
  /** Show point markers on the line. */
  points?: boolean;
  /** Fill the area under the line. */
  area?: boolean;
  /** Reference lines, bands, and threshold zones overlaid on the plot. */
  annotations?: Annotation[];
  /** Auto-mark notable data points (`true` = max + min). See {@link InsightOptions}. */
  insights?: boolean | InsightOptions;
  /** Overlay a linear line of best fit. See {@link TrendlineConfig}. */
  trendline?: boolean | TrendlineConfig;
  /** Split into a trellis grid of small multiples. See {@link FacetConfig}. */
  facet?: FacetConfig;
}

export interface AreaSpec extends BaseSpec {
  type: 'area';
  encoding: Encoding & { x: FieldDef; y: FieldDef };
  curve?: CurveType;
  /** Stack multiple series. */
  stack?: boolean;
  /** Reference lines, bands, and threshold zones overlaid on the plot. */
  annotations?: Annotation[];
  /** Auto-mark notable data points (`true` = max + min). See {@link InsightOptions}. */
  insights?: boolean | InsightOptions;
  /** Overlay a linear line of best fit. See {@link TrendlineConfig}. */
  trendline?: boolean | TrendlineConfig;
  /** Split into a trellis grid of small multiples. See {@link FacetConfig}. */
  facet?: FacetConfig;
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
  /** Reference lines, bands, and threshold zones overlaid on the plot. */
  annotations?: Annotation[];
  /** Auto-mark notable data points (`true` = top + bottom category). See {@link InsightOptions}. */
  insights?: boolean | InsightOptions;
  /** Split into a trellis grid of small multiples. See {@link FacetConfig}. */
  facet?: FacetConfig;
}

export interface ScatterSpec extends BaseSpec {
  type: 'scatter';
  encoding: Encoding & { x: FieldDef; y: FieldDef };
  /** Reference lines, bands, and threshold zones overlaid on the plot. */
  annotations?: Annotation[];
  /** Overlay a linear line of best fit. See {@link TrendlineConfig}. */
  trendline?: boolean | TrendlineConfig;
  /** Split into a trellis grid of small multiples. See {@link FacetConfig}. */
  facet?: FacetConfig;
}

/** The mark a single combo layer draws. */
export type ComboMark = 'line' | 'bar' | 'area' | 'scatter';

/**
 * One layer of a {@link ComboSpec}: a mark plus the measure it plots on `y`. All
 * layers share the combo's `x`. A layer can be measured against the primary
 * (`left`) y-axis or an independent secondary (`right`) axis — the basis of a
 * dual-axis bar+line chart.
 */
export interface ComboLayer {
  /** Which mark to draw for this layer. */
  mark: ComboMark;
  /** The measure (and optional per-layer formatting) plotted on `y`. */
  encoding: { y: FieldDef };
  /** Which y-axis this layer is measured against. Defaults to `left`. */
  axis?: 'left' | 'right';
  /** Curve interpolation for `line`/`area` layers. */
  curve?: CurveType;
  /** Show point markers (line/area layers). */
  points?: boolean;
  /** Fill under the line (line layers — equivalent to an `area` mark). */
  area?: boolean;
  /** Bar corner radius (bar layers). */
  cornerRadius?: number;
  /** Legend label for the layer. Defaults to the y field's title or name. */
  name?: string;
  /** Override the layer's color (otherwise drawn from the theme palette). */
  color?: string;
}

/**
 * Combo / dual-axis chart: composes multiple cartesian {@link ComboLayer}s over a
 * shared `x` axis — the canonical BI "bar + line" view. Layers may target a primary
 * (`left`) or secondary (`right`) y-axis, each with its own independent scale.
 * Bars require a categorical `x`; lines/areas/points align to category centers.
 */
export interface ComboSpec extends BaseSpec {
  type: 'combo';
  encoding: { x: FieldDef };
  layers: ComboLayer[];
}

/** Binning controls for a {@link HistogramSpec} (mirror the `bin` transform). */
export interface HistogramBin {
  /** Target bin count (approximate — a "nice" step is chosen). Default 10. */
  maxbins?: number;
  /** Explicit bin width (overrides `maxbins`). */
  step?: number;
  /** Restrict binning to `[min, max]`; values outside are dropped. */
  extent?: [number, number];
  /** Snap bin edges to nice round numbers (default true). */
  nice?: boolean;
}

/**
 * Histogram: bins a single quantitative field and draws the per-bin frequency as
 * gapless bars. Binning happens inside the chart (reusing the `bin` transform), so
 * an agent passes raw observations — no manual pre-binning. Bar height is the bin
 * count by default, or a probability density (area sums to 1) when `density:true`.
 */
export interface HistogramSpec extends BaseSpec {
  type: 'histogram';
  /** `x` is the quantitative field to bin (also carries the axis title/format). */
  encoding: { x: FieldDef };
  /** Binning controls (default ~10 nice bins, or an explicit `step`/`extent`). */
  bin?: HistogramBin;
  /** Normalize bar heights to a probability density (area sums to 1). */
  density?: boolean;
  /** Bar colour (defaults to the first theme palette colour). */
  color?: string;
  /** Bar corner radius. */
  cornerRadius?: number;
}

export interface PieSpec extends BaseSpec {
  type: 'pie';
  encoding: Encoding & { theta: FieldDef; color: FieldDef };
  /** true for a default donut, or a 0..1 inner-radius ratio. */
  donut?: boolean | number;
  /**
   * Value/percent labels. `true` (default) / `false` toggles them; pass a
   * {@link PieLabels} object to control placement (inside vs. outside callouts),
   * what each label says, and the connector style.
   */
  labels?: boolean | PieLabels;
}

/** Fine-grained control over pie/donut slice labels. */
export interface PieLabels {
  /** Master toggle (default true). */
  show?: boolean;
  /**
   * Where labels sit:
   * - 'auto' (default): inside the slice when the text fits, otherwise an
   *   outside callout with a leader line.
   * - 'inside': always inside (small slices are dropped if they don't fit).
   * - 'outside': always an outside callout with a leader line.
   */
  placement?: 'inside' | 'outside' | 'auto';
  /**
   * What each label says (default: 'percent' inside, 'category-percent' for
   * outside callouts).
   */
  content?: 'percent' | 'value' | 'category' | 'category-percent' | 'category-value';
  /** Hide labels for slices below this share of the total (0..1, default 0.01). */
  minShare?: number;
  /** Leader-line colour for outside callouts: the slice colour or a muted grey. */
  connector?: 'slice' | 'muted';
}

export interface HeatmapSpec extends BaseSpec {
  type: 'heatmap';
  encoding: Encoding & { x: FieldDef; y: FieldDef; color: FieldDef };
  /** Sequential/diverging ramp name. */
  scheme?: string;
}

/**
 * A funnel chart: ordered `stage`s drawn as stacked, centered trapezoids whose
 * width encodes `value`. Ideal for conversion / drop-off across a pipeline. Each
 * stage shows its value and the share retained relative to the first (or the
 * previous) stage.
 */
export interface FunnelSpec extends BaseSpec {
  type: 'funnel';
  encoding: Encoding & { stage: FieldDef; value: FieldDef };
  /** Show stage labels + value/percent inside the funnel (default true). */
  labels?: boolean;
  /**
   * What the per-stage percentage is measured against:
   * - 'first' (default): share retained vs. the top of the funnel.
   * - 'previous': step conversion vs. the stage above.
   */
  percent?: 'first' | 'previous';
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

/**
 * Treemap — part-to-whole as nested rectangles sized by a measure. Pass tidy
 * rows (one per leaf); the area of each tile is proportional to `value`. An
 * optional `group` field nests leaves under parent tiles (one level), and
 * `color` overrides the default per-group/leaf fill (numeric → sequential scale,
 * categorical → palette).
 */
export interface TreemapSpec extends BaseSpec {
  type: 'treemap';
  encoding: Encoding & {
    /** Leaf tile label + identity. */
    category: FieldDef;
    /** Numeric field sizing each tile's area (summed per leaf). */
    value: FieldDef;
    /** Optional parent grouping → nested parent tiles (one level deep). */
    group?: FieldDef;
    /** Optional field driving tile color (numeric → sequential, else palette). */
    color?: FieldDef;
  };
  /** Sequential color scheme name when `color` is numeric (default 'teal'). */
  scheme?: string;
  /** Show the value beneath the label inside each tile (default true). */
  labels?: boolean;
}

/**
 * Gauge — a radial dial showing a single value against a `[min, max]` scale,
 * with an optional `target` needle and qualitative background `bands`. The
 * value is a literal or a field (optionally aggregated, like {@link KpiSpec}).
 */
export interface GaugeSpec extends BaseSpec {
  type: 'gauge';
  /** The measured value (literal or a field, optionally aggregated over data). */
  value: ValueRef;
  /** Scale start (default 0). */
  min?: number;
  /** Scale end — the gauge's full-scale (required). */
  max: number;
  /** Optional target/threshold marker drawn as a needle/tick. */
  target?: ValueRef;
  /** Caption under the value (defaults to the spec title or value field). */
  label?: string;
  /** Number format for the value + scale ticks (e.g. ',.0f', '.0%'). */
  format?: string;
  /** Qualitative arc bands, each filling the scale up to `to`. */
  bands?: { to: number; color?: string }[];
}

/**
 * Bullet graph — a compact linear KPI-vs-target: a measure bar over qualitative
 * `ranges` (poor/ok/good background bands) with a `target` comparative marker.
 * The featured value/target are literals or fields (optionally aggregated).
 */
export interface BulletSpec extends BaseSpec {
  type: 'bullet';
  /** The featured measure (literal or a field, optionally aggregated). */
  value: ValueRef;
  /** Target/comparative marker (literal or field) drawn as a vertical tick. */
  target?: ValueRef;
  /** Scale start (default 0). */
  min?: number;
  /** Scale end (default: derived from value/target/ranges). */
  max?: number;
  /** Qualitative range boundaries on the scale (e.g. [50, 75, 100]). */
  ranges?: number[];
  /** Caption to the left of the bar (defaults to the spec title or value field). */
  label?: string;
  /** Number format for the value + axis ticks. */
  format?: string;
}

/**
 * Calendar heatmap — a GitHub-contributions-style grid of one cell per day,
 * colored by a value via a sequential scale, with weekday rows and month
 * labels. Pass tidy rows of `{ date, value }`; dates may be `Date` objects or
 * ISO strings.
 */
export interface CalendarHeatmapSpec extends BaseSpec {
  type: 'calendarHeatmap';
  encoding: Encoding & {
    /** Date field (Date or ISO string) → one cell per day. */
    date: FieldDef;
    /** Numeric value field → cell color via a sequential scale. */
    color: FieldDef;
  };
  /** Sequential color scheme name for the value scale (default 'teal'). */
  scheme?: string;
}

/**
 * Waterfall — a column chart of signed steps where each bar floats from the
 * running total to its new level, showing how sequential increases and decreases
 * build to a final value. Each `value` is the **signed change** at that stage
 * (positive rises, negative falls). Stages named in `totals` (and an optional
 * appended grand total) draw as absolute bars from the baseline. Increases,
 * decreases, and totals are colored distinctly and joined by connector lines.
 */
export interface WaterfallSpec extends BaseSpec {
  type: 'waterfall';
  encoding: Encoding & {
    /** Stage label along the x-axis (one bar per row, in data order). */
    stage: FieldDef;
    /** Signed change at each stage (positive rises, negative falls). */
    value: FieldDef;
  };
  /** Stage labels to draw as absolute running-total bars from the baseline. */
  totals?: string[];
  /** Append a final bar summing every step (default false). */
  showTotal?: boolean;
  /** Label for the appended total bar (default 'Total'). */
  totalLabel?: string;
  /** Show the per-bar value labels (default true). */
  labels?: boolean;
  /** Bar corner radius in pixels (default 2). */
  cornerRadius?: number;
  /** Color for upward steps (default theme positive/green). */
  increaseColor?: string;
  /** Color for downward steps (default theme negative/red). */
  decreaseColor?: string;
  /** Color for total/subtotal bars (default theme accent). */
  totalColor?: string;
}

/**
 * Slope graph — a minimal "before/after" chart: each `series` is a line joining
 * its `y` value across two (or a few) ordinal `x` positions, with direct end
 * labels instead of a legend. Reads change-in-rank and rise/fall at a glance.
 * Pass tidy rows of `{ x, y, series }` (one row per series per x position).
 */
export interface SlopeSpec extends BaseSpec {
  type: 'slope';
  encoding: Encoding & {
    /** The ordinal positions along the x-axis (typically two: e.g. start/end). */
    x: FieldDef;
    /** Numeric value plotted on the y-axis. */
    y: FieldDef;
    /** One line per series (the entity whose change is traced). */
    series: FieldDef;
  };
  /** Direct labels (series name + value) at each line's ends (default true). */
  labels?: boolean;
  /** Color each line green/red by its net rise/fall instead of by series. */
  colorByChange?: boolean;
  /** Number format for value labels and the y-axis. */
  format?: string;
}

/**
 * Dumbbell / connected dot plot — for each `category`, a dot per `group` placed
 * on a shared horizontal value axis and joined by a connector, so the gap between
 * groups (e.g. before vs. after, male vs. female) reads directly. Categories run
 * down the y-axis. Pass tidy rows of `{ category, value, group }`.
 */
export interface DumbbellSpec extends BaseSpec {
  type: 'dumbbell';
  encoding: Encoding & {
    /** The category for each row (one band down the y-axis). */
    category: FieldDef;
    /** Numeric value → dot position on the horizontal axis. */
    value: FieldDef;
    /** The group each dot belongs to (2+ levels → one dot each, connected). */
    group: FieldDef;
  };
  /** Value labels beside the dots (default false). */
  labels?: boolean;
  /** Number format for value labels and the x-axis. */
  format?: string;
  /** Order the category rows (default: data order). `gap` sorts by dot spread. */
  sort?: 'ascending' | 'descending' | 'gap';
}

export type ConditionalFormat =
  | {
      type: 'colorScale';
      scheme?: string;
      domain?: [number, number];
      midpoint?: number;
      diverging?: boolean;
      target?: 'background' | 'text';
    }
  | {
      type: 'bar';
      color?: string;
      negativeColor?: string;
      domain?: [number, number];
      baseline?: 'zero' | 'min';
      showValue?: boolean;
    }
  | {
      type: 'icon';
      set?: 'arrows' | 'triangles' | 'dots' | 'trafficLights';
      rules?: IconRule[];
      position?: 'left' | 'right';
    }
  | { type: 'rules'; rules: ValueRule[] };

export interface ValueRule {
  when: 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'ne' | 'between';
  value: number | string;
  to?: number;
  background?: string;
  color?: string;
  weight?: 'bold' | 'normal';
  icon?: string;
}

export interface IconRule {
  when: ValueRule['when'];
  value: number;
  to?: number;
  icon?: string;
  color?: string;
}

export interface TableColumn {
  field: string;
  title?: string;
  type?: FieldType;
  format?: string;
  align?: 'left' | 'center' | 'right';
  width?: number;
  conditionalFormat?: ConditionalFormat;
  prefix?: string;
  suffix?: string;
  negativeStyle?: 'sign' | 'parens' | 'red' | 'parens-red';
  hidden?: boolean;
  sortable?: boolean;
  wrap?: boolean;
  group?: string;
  total?: AggOp | false;
}

export interface TableSpec extends BaseSpec {
  type: 'table';
  /** Explicit columns; inferred from data keys when omitted. */
  columns?: TableColumn[];
  sort?: { field: string; order?: 'asc' | 'desc' };
  density?: 'comfortable' | 'standard' | 'compact';
  totals?: boolean | { label?: string };
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
  prefix?: string;
  suffix?: string;
  negativeStyle?: TableColumn['negativeStyle'];
  showAs?: 'value' | 'percentOfRow' | 'percentOfColumn' | 'percentOfTotal';
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
  density?: 'comfortable' | 'standard' | 'compact';
  columnSort?: { by: 'value' | 'label'; valueIndex?: number; order?: 'asc' | 'desc' };
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
  /** Reference lines, bands, and threshold zones overlaid on the plot. */
  annotations?: Annotation[];
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

/**
 * Slicer visuals — interactive controls that *publish* a selection (rather than
 * plotting marks). A slicer cross-filters (or cross-highlights) every visual that
 * consumes its param. They are ordinary DOM widgets, so they validate and render
 * standalone, and slot into a dashboard like any other view.
 *
 * Every slicer reads a single `field` and writes to a named param (defaulting to
 * the field name, so a chart's `filter: [{ param: 'region' }]` auto-connects to a
 * `field: 'region'` slicer). Options/bounds are derived from the *unfiltered*
 * data so a slicer never hides its own choices.
 */
export interface BaseSlicerSpec extends BaseSpec {
  /** The data field this slicer reads its options/bounds from and filters on. */
  field: string;
  /**
   * The param name this slicer publishes to. Defaults to `field`, which makes a
   * slicer auto-wire to any visual filtering/highlighting on that param name.
   */
  param?: string;
  /** Label shown above the control. Defaults to `title` or the field name. */
  label?: string;
  /** How consumers should react: emphasize matches or subset rows. Default 'filter'. */
  as?: 'filter' | 'highlight';
}

/** Choose one (single) or several (multi) of a field's distinct values. */
export interface DropdownSlicerSpec extends BaseSlicerSpec {
  type: 'dropdown';
  /** Allow choosing multiple values (emits a set). Default false (single-select). */
  multiple?: boolean;
  /** Placeholder shown when nothing is selected. */
  placeholder?: string;
}

/** A debounced case-insensitive substring filter over a text field. */
export interface SearchSlicerSpec extends BaseSlicerSpec {
  type: 'search';
  placeholder?: string;
  /** Debounce in ms before publishing the query (default 200). */
  debounce?: number;
}

/** A scrollable checkbox list of a field's distinct values (multi-select). */
export interface ListSlicerSpec extends BaseSlicerSpec {
  type: 'list';
  /** Show a search-within box once options exceed this count (default 8). */
  searchThreshold?: number;
  /** Show the "Select all" / "Clear" row (default true). */
  selectAll?: boolean;
}

/** A numeric min/max range over a quantitative field (dual-thumb slider). */
export interface RangeSlicerSpec extends BaseSlicerSpec {
  type: 'range';
  /** Lower bound; defaults to the data minimum of `field`. */
  min?: number;
  /** Upper bound; defaults to the data maximum of `field`. */
  max?: number;
  /** Thumb step; defaults to a sensible fraction of the range. */
  step?: number;
  /** Number format hint for the value labels (e.g. ',.0f'). */
  format?: string;
}

/** A temporal min/max range over a date field, with relative presets. */
export interface DateRangeSlicerSpec extends BaseSlicerSpec {
  type: 'dateRange';
  /** Show relative presets (last 7 / 30 / 90 days, all). Default true. */
  presets?: boolean;
  /** Date format hint for the value labels (e.g. '%b %e, %Y'). */
  format?: string;
}

export type SlicerSpec =
  | DropdownSlicerSpec
  | SearchSlicerSpec
  | ListSlicerSpec
  | RangeSlicerSpec
  | DateRangeSlicerSpec;

export type SlicerType = SlicerSpec['type'];

export const SLICER_TYPES: readonly SlicerType[] = [
  'dropdown',
  'search',
  'list',
  'range',
  'dateRange',
];

export type ChartSpec =
  | LineSpec
  | AreaSpec
  | BarSpec
  | ScatterSpec
  | ComboSpec
  | HistogramSpec
  | PieSpec
  | HeatmapSpec
  | FunnelSpec
  | KpiSpec
  | TreemapSpec
  | GaugeSpec
  | BulletSpec
  | CalendarHeatmapSpec
  | WaterfallSpec
  | SlopeSpec
  | DumbbellSpec
  | TableSpec
  | MatrixSpec
  | BoxSpec
  | SankeySpec
  | ChoroplethSpec
  | DropdownSlicerSpec
  | SearchSlicerSpec
  | ListSlicerSpec
  | RangeSlicerSpec
  | DateRangeSlicerSpec;

export type ChartType = ChartSpec['type'];

export const CHART_TYPES: readonly ChartType[] = [
  'line',
  'area',
  'bar',
  'scatter',
  'combo',
  'histogram',
  'pie',
  'heatmap',
  'funnel',
  'kpi',
  'treemap',
  'gauge',
  'bullet',
  'calendarHeatmap',
  'waterfall',
  'slope',
  'dumbbell',
  'table',
  'matrix',
  'box',
  'sankey',
  'choropleth',
  'dropdown',
  'search',
  'list',
  'range',
  'dateRange',
];
