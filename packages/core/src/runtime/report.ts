/**
 * Render report / introspection API.
 *
 * After a chart draws, `buildRenderReport` derives a machine-readable set of
 * diagnostics from the *resolved* model (scales, plot rect, ticks, legend,
 * theme colors) — no pixels are read back. This lets an agent verify a chart
 * "looks right" without vision: it can see the mark count, whether axis labels
 * collide, whether the legend was truncated, whether marks fall outside the
 * plot, and whether colors clear contrast thresholds.
 *
 * The builder is pure and dependency-free so it runs identically in the browser
 * and headless (the server-side critique loop consumes the same report).
 */

import type { Datum, RGBA, Rect, Size } from '../types';
import type { ChartSpec, ChartType } from '../spec/types';
import type { ThemeTokens } from '../theme';
import { accessor, extentOf } from '../util/data';
import { parseColor, contrastRatio } from '../color';
import { measureText, fontString } from '../render/text';
import { summarize } from '../analyze/summarize';
import type { CartesianModel } from './cartesian';

export type ReportSeverity = 'error' | 'warning' | 'info';

/** One machine-readable finding about the rendered chart. */
export interface RenderDiagnostic {
  /** Stable identifier an agent can match/suppress on (e.g. `axis-label-overlap`). */
  code: string;
  severity: ReportSeverity;
  /** Human- and agent-readable explanation. */
  message: string;
  /** The axis a layout diagnostic refers to, when applicable. */
  axis?: 'x' | 'y';
  /** Structured extras (counts, ratios) for programmatic consumers. */
  details?: Record<string, unknown>;
}

/** A post-render, vision-free description of what was drawn. */
export interface RenderReport {
  type: ChartType;
  /** Surface size in CSS pixels. */
  size: Size;
  /** Plot rectangle (cartesian-derived reports only). */
  plot?: Rect;
  /** Number of data marks the chart drew. */
  markCount: number;
  /** Number of distinct series. */
  seriesCount: number;
  /** Number of distinct colors used for series. */
  colorCount: number;
  /** True when no `error` or `warning` diagnostics were raised. */
  ok: boolean;
  /** All findings, ordered most-severe first. */
  diagnostics: RenderDiagnostic[];
  /**
   * Deterministic plain-English summary of what the data shows (alt-text without
   * an LLM). Absent for chart types that carry no summarizable trend.
   */
  summary?: string;
}

/** Inputs for {@link buildRenderReport}. */
export interface ReportInput {
  type: ChartType;
  spec: ChartSpec;
  /** Effective (post-transform, post-filter) data that was rendered. */
  data: Datum[];
  tokens: ThemeTokens;
  size: Size;
  /** The resolved cartesian model, when the chart type is cartesian. */
  model?: CartesianModel;
}

/** Below this, a filled mark is effectively invisible against its background. */
const MARK_CONTRAST_MIN = 1.5;
/** WCAG AA text contrast minimum (axis/legend labels vs background). */
const TEXT_CONTRAST_MIN = 4.5;
/** Distinct series beyond this are hard to tell apart by color alone. */
const MAX_DISTINGUISHABLE_SERIES = 8;

const SEVERITY_RANK: Record<ReportSeverity, number> = { error: 0, warning: 1, info: 2 };

/** Charts that show a single value (literal or aggregate) rather than a data series. */
const VALUE_CHART_TYPES: ReadonlySet<ChartType> = new Set<ChartType>(['kpi', 'gauge', 'bullet']);
/** Charts that color marks through a continuous (sequential) ramp, not discrete series. */
const CONTINUOUS_COLOR_TYPES: ReadonlySet<ChartType> = new Set<ChartType>([
  'heatmap',
  'choropleth',
  'calendarHeatmap',
]);

function rgba(input: string | undefined): RGBA | null {
  return input ? parseColor(input) : null;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Build the render report for a freshly-drawn chart. Pure: it reads the
 * resolved model + theme, never the canvas bitmap.
 */
export function buildRenderReport(input: ReportInput): RenderReport {
  const { type, spec, data, tokens, size, model } = input;
  const diagnostics: RenderDiagnostic[] = [];
  const add = (d: RenderDiagnostic): void => {
    diagnostics.push(d);
  };

  const bg = rgba(spec.background) ?? rgba(tokens.color.background);

  // --- Mark / series / color facts ---
  const seriesColors = model ? model.series.map((s) => s.color) : [];
  const seriesCount = model ? Math.max(model.series.length, 1) : seriesCountOf(spec, data);
  const colorCount = model ? new Set(seriesColors).size || 1 : seriesCount;
  const markCount = model
    ? model.series.reduce((n, s) => n + s.rows.length, 0)
    : data.length;

  const plot = model?.plot;

  // --- Empty data / empty plot ---
  // A value chart (kpi/gauge/bullet) with a literal numeric `value` needs no
  // data array, so an empty `data` is expected — don't flag it.
  const hasLiteralValue =
    VALUE_CHART_TYPES.has(type) && typeof (spec as { value?: unknown }).value === 'number';
  if (data.length === 0 && !hasLiteralValue) {
    add({
      code: 'empty-data',
      severity: 'warning',
      message: 'No data rows to plot — the chart renders empty.',
    });
  }
  if (plot && (plot.width <= 1 || plot.height <= 1)) {
    add({
      code: 'empty-plot',
      severity: 'error',
      message: `Plot area collapsed to ${round(plot.width)}×${round(plot.height)}px — nothing can be drawn. Increase the chart size or reduce chrome (title/legend/axis labels).`,
    });
  } else if (markCount > 0 && model && model.series.every((s) => s.rows.length === 0)) {
    add({
      code: 'empty-plot',
      severity: 'warning',
      message: 'Every series resolved to zero rows after binding — check the encoding field names against the data columns.',
    });
  }

  // --- Cartesian-model diagnostics ---
  if (model) {
    checkDegenerateAxis(model, add);
    checkClippedMarks(model, add);
    checkAxisLabelOverlap(model, tokens, add);
    checkLegendOverflow(model, add);
  }

  // --- Color contrast (works for every chart type) ---
  if (bg) {
    const specColor = (spec as { color?: string }).color;
    const usedColors = seriesColors.length ? seriesColors : specColor ? [specColor] : [];
    const seen = new Set<string>();
    for (const c of usedColors) {
      if (seen.has(c)) continue;
      seen.add(c);
      const fg = rgba(c);
      if (!fg) continue;
      const ratio = contrastRatio(fg, bg);
      if (ratio < MARK_CONTRAST_MIN) {
        add({
          code: 'low-contrast-mark',
          severity: 'warning',
          message: `Series color ${c} has only ${round(ratio)}:1 contrast against the background and is nearly invisible — pick a color that stands out.`,
          details: { color: c, ratio: round(ratio), min: MARK_CONTRAST_MIN },
        });
      }
    }
    const labelColor = rgba(tokens.color.textMuted);
    if (labelColor) {
      const ratio = contrastRatio(labelColor, bg);
      if (ratio < TEXT_CONTRAST_MIN) {
        add({
          code: 'low-contrast-text',
          severity: 'warning',
          message: `Axis/legend label color has ${round(ratio)}:1 contrast against the background — text may be illegible (aim for ≥ ${TEXT_CONTRAST_MIN}:1).`,
          details: { ratio: round(ratio), min: TEXT_CONTRAST_MIN },
        });
      }
    }
  }

  // --- Too many series to tell apart by color ---
  // Continuous-color charts (heatmap/choropleth/calendar) map values through a
  // sequential ramp, so a high distinct-value count is expected, not a problem.
  if (!CONTINUOUS_COLOR_TYPES.has(type) && colorCount > MAX_DISTINGUISHABLE_SERIES) {
    add({
      code: 'too-many-colors',
      severity: 'info',
      message: `${colorCount} series share one color scale — beyond ~${MAX_DISTINGUISHABLE_SERIES} the colors repeat or blur together. Consider faceting, filtering, or grouping the long tail.`,
      details: { colorCount, max: MAX_DISTINGUISHABLE_SERIES },
    });
  }

  diagnostics.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
  const ok = !diagnostics.some((d) => d.severity === 'error' || d.severity === 'warning');

  // Narrate the *rendered* (post-transform) data, not the raw spec data.
  const summary = summarize({ ...spec, data } as ChartSpec) || undefined;

  return { type, size, plot, markCount, seriesCount, colorCount, ok, diagnostics, summary };
}

/** Distinct series count for non-cartesian charts, from the series/color field. */
function seriesCountOf(spec: ChartSpec, data: Datum[]): number {
  const enc = (spec as { encoding?: Record<string, { field?: string } | undefined> }).encoding;
  const field = enc?.series?.field ?? enc?.color?.field;
  if (!field || data.length === 0) return 1;
  const read = accessor(field);
  const seen = new Set<string>();
  for (const d of data) seen.add(String(read(d)));
  return Math.max(seen.size, 1);
}

/** A y domain that spans (almost) nothing collapses every mark onto one line. */
function checkDegenerateAxis(model: CartesianModel, add: (d: RenderDiagnostic) => void): void {
  const dom = model.y.scale.domain;
  const [lo, hi] = [dom[0], dom[dom.length - 1]];
  if (Number.isFinite(lo) && Number.isFinite(hi) && lo === hi) {
    add({
      code: 'degenerate-axis',
      severity: 'warning',
      axis: 'y',
      message: `The y values are all equal (${lo}); every mark lands on a single flat line. A bar/area baseline or a constant series is usually the cause.`,
      details: { value: lo },
    });
  }
  if (model.yTicks.length < 2 && model.series.some((s) => s.rows.length > 0)) {
    add({
      code: 'degenerate-axis',
      severity: 'info',
      axis: 'y',
      message: 'The y-axis resolved to fewer than two ticks — the scale may be too narrow to read.',
      details: { ticks: model.yTicks.length },
    });
  }
}

/** Data whose y-extent falls outside the y scale's range is clipped at the plot edge. */
function checkClippedMarks(model: CartesianModel, add: (d: RenderDiagnostic) => void): void {
  const field = model.y.field;
  if (!field) return;
  const read = accessor(field);
  const values: number[] = [];
  for (const s of model.series) {
    for (const row of s.rows) {
      const v = read(row);
      if (typeof v === 'number' && Number.isFinite(v)) values.push(v);
    }
  }
  if (values.length === 0) return;
  const ex = extentOf(values);
  if (!ex) return;
  const [lo, hi] = ex;
  const top = model.plot.y;
  const bottom = model.plot.y + model.plot.height;
  const pHi = model.y.pixel(hi); // largest value → topmost pixel
  const pLo = model.y.pixel(lo); // smallest value → bottommost pixel
  const EPS = 0.75;
  if (pHi < top - EPS || pLo > bottom + EPS) {
    add({
      code: 'marks-clipped',
      severity: 'warning',
      axis: 'y',
      message: `Some data falls outside the y-axis range [${round(Math.min(lo, hi))}, ${round(Math.max(lo, hi))}] and is clipped at the plot edge — widen the y domain or drop the manual scale.`,
      details: { dataMin: round(lo), dataMax: round(hi) },
    });
  }
}

/** Adjacent x category labels that don't fit their slot collide / overlap. */
function checkAxisLabelOverlap(
  model: CartesianModel,
  tokens: ThemeTokens,
  add: (d: RenderDiagnostic) => void,
): void {
  const ticks = model.xTicks;
  if (ticks.length < 2) return;
  const font = fontString(tokens.font.size.small, tokens.font.family, tokens.font.weight.normal);
  const GAP = 4; // minimum breathing room between labels
  let collisions = 0;
  for (let i = 1; i < ticks.length; i++) {
    const prev = ticks[i - 1];
    const cur = ticks[i];
    const spacing = Math.abs(cur.pos - prev.pos);
    const half = (measureText(prev.label, font).width + measureText(cur.label, font).width) / 2;
    if (half + GAP > spacing) collisions++;
  }
  if (collisions > 0) {
    add({
      code: 'axis-label-overlap',
      severity: 'warning',
      axis: 'x',
      message: `${collisions} adjacent x-axis label${collisions === 1 ? '' : 's'} overlap — there isn't room to show all ${ticks.length} categories. Reduce categories, widen the chart, or aggregate the long tail.`,
      details: { collisions, ticks: ticks.length },
    });
  }
}

/** A vertical legend truncated to fit its gutter hides some series. */
function checkLegendOverflow(model: CartesianModel, add: (d: RenderDiagnostic) => void): void {
  const shown = model.frame.legendItems?.length;
  if (shown === undefined) return;
  const total = model.series.length;
  if (shown < total) {
    add({
      code: 'legend-overflow',
      severity: 'warning',
      message: `The legend shows only ${shown} of ${total} series — the rest were clipped to fit. Move the legend to the top/bottom or give the chart more height.`,
      details: { shown, total },
    });
  }
}
