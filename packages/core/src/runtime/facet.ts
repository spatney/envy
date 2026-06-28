/**
 * Faceting / small multiples.
 *
 * A faceted chart splits into a trellis grid of panels — one per distinct value
 * of a field — all sharing identical x/y/color scales so the panels are directly
 * comparable. Each panel is a full {@link CartesianModel} laid out into its grid
 * cell (via the frame's origin offset), drawn with the very same cartesian
 * pipeline (underlay → marks → trendline → annotations → overlay) on a single
 * canvas. That means faceting works identically headless, preserving the
 * critique-loop moat.
 *
 * The shared scales are derived from a *reference model* built over the full
 * dataset: its domains and color map ARE the shared state every panel reuses, so
 * a series keeps its color and position in every panel even when a panel's subset
 * is missing some categories or series.
 */

import type { Datum, Size } from '../types';
import type { ChartSpec, FacetConfig } from '../spec/types';
import type { ThemeTokens } from '../theme';
import type { Surface } from '../render/surface';
import {
  computeFrame,
  type Frame,
  type LegendItem,
  type PositionedLegendItem,
  type TitleInput,
} from '../layout';
import {
  buildCartesianModel,
  type CartesianChartSpec,
  type CartesianModel,
  type SharedScales,
} from './cartesian';
import { buildRenderReport, type RenderDiagnostic, type RenderReport, type ReportSeverity } from './report';
import { drawAxesUnderlay, drawOverlay, drawTitle, drawLegend } from '../axes';
import {
  cartesianRenderers,
  drawAnnotations,
  drawAnnotationLabels,
  drawTrendlines,
  drawTrendlineLabels,
} from '../charts';

/** Cartesian chart kinds that can be split into a facet grid. */
export const FACETABLE_TYPES: ReadonlySet<string> = new Set<string>(['line', 'area', 'bar', 'scatter']);

const FACET_GAP = 16;
const FACET_PADDING = { top: 12, right: 16, bottom: 12, left: 12 };
const SEVERITY_RANK: Record<ReportSeverity, number> = { error: 0, warning: 1, info: 2 };

/** One panel of a facet grid: its facet value plus the resolved model. */
export interface FacetPanel {
  value: string;
  model: CartesianModel;
}

/** The resolved layout of a faceted chart — the header frame plus panel models. */
export interface FacetLayout {
  field: string;
  columns: number;
  rows: number;
  /** Outer frame: reserves the overall title + shared legend; its plot is the grid region. */
  outerFrame: Frame;
  panels: FacetPanel[];
  /** Positioned shared legend items (multi-series only). */
  legendItems?: PositionedLegendItem[];
  /** A representative panel model (panels[0]) for token/legend draw. */
  repModel: CartesianModel;
}

/** True when `spec` declares a usable facet on a facet-eligible cartesian type. */
export function isFaceted(spec: ChartSpec): boolean {
  const facet = (spec as { facet?: FacetConfig }).facet;
  return (
    !!facet &&
    typeof facet.field === 'string' &&
    facet.field !== '' &&
    FACETABLE_TYPES.has(spec.type)
  );
}

function facetKey(v: unknown): string {
  return v == null ? '' : String(v);
}

/** Distinct facet values in render order. */
function facetValues(data: Datum[], field: string, sort: 'ascending' | 'descending' | 'none'): string[] {
  const seen = new Set<string>();
  const order: string[] = [];
  for (const row of data) {
    const key = facetKey((row as Record<string, unknown>)[field]);
    if (!seen.has(key)) {
      seen.add(key);
      order.push(key);
    }
  }
  if (sort === 'none') return order;
  const numeric = order.length > 0 && order.every((s) => s !== '' && Number.isFinite(Number(s)));
  const sorted = [...order].sort((a, b) => (numeric ? Number(a) - Number(b) : a < b ? -1 : a > b ? 1 : 0));
  if (sort === 'descending') sorted.reverse();
  return sorted;
}

/** Default column count ≈ √n, capped so columns never get unreadably thin. */
function autoColumns(n: number): number {
  return Math.min(6, Math.max(1, Math.ceil(Math.sqrt(n))));
}

function legendSymbol(type: string): 'square' | 'line' | 'circle' {
  return type === 'scatter' ? 'circle' : type === 'line' ? 'line' : 'square';
}

function titleInput(title: ChartSpec['title']): TitleInput | undefined {
  if (!title) return undefined;
  return typeof title === 'string' ? { text: title } : (title as TitleInput);
}

/** Build a panel sub-spec: the facet value as the panel title, no legend, no axis titles. */
function panelSpec(spec: ChartSpec, data: Datum[], value: string): CartesianChartSpec {
  const base = spec as unknown as Record<string, unknown>;
  const enc = (base.encoding ?? {}) as Record<string, { title?: string } | undefined>;
  const sub: Record<string, unknown> = {
    ...base,
    facet: undefined,
    transform: undefined,
    data,
    title: value,
    legend: false,
    encoding: {
      ...enc,
      x: enc.x ? { ...enc.x, title: undefined } : enc.x,
      y: enc.y ? { ...enc.y, title: undefined } : enc.y,
    },
  };
  const axes = base.axes as { x?: object; y?: object } | undefined;
  if (axes) {
    sub.axes = {
      ...axes,
      x: axes.x ? { ...axes.x, title: undefined } : axes.x,
      y: axes.y ? { ...axes.y, title: undefined } : axes.y,
    };
  }
  return sub as unknown as CartesianChartSpec;
}

/**
 * Resolve a faceted spec into a grid of panel models sharing one set of scales.
 * Returns `null` when there is nothing to facet (no rows / no distinct values),
 * so the caller can fall back to the normal single-chart path.
 */
export function buildFacetModels(spec: ChartSpec, tokens: ThemeTokens, size: Size): FacetLayout | null {
  const facet = (spec as { facet?: FacetConfig }).facet;
  if (!facet) return null;
  const field = facet.field;
  const data: Datum[] = spec.data ?? [];
  const values = facetValues(data, field, facet.sort ?? 'ascending');
  if (values.length === 0) return null;

  // Group rows by facet value.
  const subsets = new Map<string, Datum[]>();
  for (const v of values) subsets.set(v, []);
  for (const row of data) {
    subsets.get(facetKey((row as Record<string, unknown>)[field]))?.push(row);
  }

  // Reference model over the FULL dataset → its scales/colors are the shared
  // state every panel reuses, so the panels stay directly comparable.
  const refSpec = { ...(spec as object), facet: undefined } as CartesianChartSpec;
  const refModel = buildCartesianModel(refSpec, tokens, size);
  const shared: SharedScales = {
    categories: refModel.x.categories ? [...refModel.x.categories] : undefined,
    xDomain: refModel.x.continuous
      ? [refModel.x.continuous.domain[0], refModel.x.continuous.domain[1]]
      : undefined,
    yDomain: [refModel.y.scale.domain[0], refModel.y.scale.domain[1]],
    colorOf: (k) => refModel.colorOf(k),
  };

  const multiSeries = !!refModel.seriesField || refModel.series.length > 1;
  const headerLegend: LegendItem[] | undefined = multiSeries
    ? refModel.series.map((s) => ({ label: s.label, color: s.color, symbol: legendSymbol(spec.type) }))
    : undefined;

  // Outer frame reserves the overall title + shared legend; its plot is the grid region.
  const outerFrame = computeFrame({
    width: size.width,
    height: size.height,
    padding: FACET_PADDING,
    font: tokens.font,
    title: titleInput(spec.title),
    legend: headerLegend ? { items: headerLegend, position: 'top' } : undefined,
  });

  const region = outerFrame.plot;
  const n = values.length;
  const columns = Math.max(1, Math.min(facet.columns ?? autoColumns(n), n));
  const rows = Math.ceil(n / columns);
  const cellW = Math.max(1, (region.width - FACET_GAP * (columns - 1)) / columns);
  const cellH = Math.max(1, (region.height - FACET_GAP * (rows - 1)) / rows);

  const panels: FacetPanel[] = values.map((value, i) => {
    const col = i % columns;
    const row = Math.floor(i / columns);
    const cx = region.x + col * (cellW + FACET_GAP);
    const cy = region.y + row * (cellH + FACET_GAP);
    const model = buildCartesianModel(panelSpec(spec, subsets.get(value) ?? [], value), tokens, {
      width: cellW,
      height: cellH,
      originX: cx,
      originY: cy,
      shared,
    });
    return { value, model };
  });

  return {
    field,
    columns,
    rows,
    outerFrame,
    panels,
    legendItems: outerFrame.legendItems,
    repModel: panels[0].model,
  };
}

/**
 * Draw a faceted chart onto `surface`: the shared header (overall title + legend)
 * then every panel through the full cartesian pipeline. Static — no interaction
 * in v1. The background is assumed already painted by the caller.
 */
export function drawFacet(surface: Surface, spec: ChartSpec, layout: FacetLayout, tokens: ThemeTokens): void {
  drawTitle(surface, layout.outerFrame, spec as CartesianModel['spec'], tokens);
  if (layout.legendItems) drawLegend(surface, layout.legendItems, layout.repModel);
  for (const { model } of layout.panels) {
    drawAxesUnderlay(surface, model);
    const renderer = cartesianRenderers[model.spec.type];
    if (renderer) renderer(surface, model);
    drawTrendlines(surface, model);
    drawAnnotations(surface, model);
    drawOverlay(surface, model);
    drawAnnotationLabels(surface, model);
    drawTrendlineLabels(surface, model);
  }
}

/**
 * Merge per-panel render reports into one report for the faceted chart: mark
 * counts sum, series/color counts take the panel maximum, diagnostics union by
 * code (most-severe first), and `ok` holds only if every panel is ok.
 */
export function facetReport(spec: ChartSpec, layout: FacetLayout, tokens: ThemeTokens, size: Size): RenderReport {
  let markCount = 0;
  let seriesCount = 0;
  let colorCount = 0;
  let ok = true;
  const byCode = new Map<string, RenderDiagnostic>();
  for (const { model } of layout.panels) {
    const r = buildRenderReport({
      type: model.spec.type,
      spec: model.spec as ChartSpec,
      data: model.spec.data ?? [],
      tokens,
      size,
      model,
    });
    markCount += r.markCount;
    seriesCount = Math.max(seriesCount, r.seriesCount);
    colorCount = Math.max(colorCount, r.colorCount);
    ok = ok && r.ok;
    for (const d of r.diagnostics) if (!byCode.has(d.code)) byCode.set(d.code, d);
  }
  const diagnostics = [...byCode.values()].sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
  return {
    type: spec.type,
    size,
    plot: layout.outerFrame.plot,
    markCount,
    seriesCount,
    colorCount,
    ok,
    diagnostics,
    summary: `${layout.panels.length} panels faceted by ${layout.field}`,
  };
}
