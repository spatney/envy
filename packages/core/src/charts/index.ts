/**
 * Chart registry.
 *
 * Cartesian charts (line/area/bar/scatter) consume a prebuilt `CartesianModel`
 * and only draw marks. Custom charts (heatmap/pie/kpi/table/matrix) own their
 * full layout and draw directly onto the surface. The runtime dispatches here.
 */

import type { Surface } from '../render/surface';
import type { Datum, Size } from '../types';
import type { ChartSpec, ChartType } from '../spec/types';
import type { ThemeTokens } from '../theme';
import type { CartesianModel } from '../runtime/cartesian';
import type { Emphasis, InteractionModel } from '../interaction/types';
import type { SelectionStore } from '../interaction/store';
import type { SelectionDef } from '../spec/selection';
import { drawLine } from './line';
import { drawArea } from './area';
import { drawBar } from './bar';
import { drawScatter } from './scatter';
import { drawBox, buildBoxInteraction } from './box';
import { drawHeatmap } from './heatmap';
import { drawPie } from './pie';
import { drawFunnel } from './funnel';
import { drawKpi } from './kpi';
import { drawSankey } from './sankey';
import { drawChoropleth } from './choropleth';
import { drawTable } from './table';
import { drawMatrix } from './matrix';
import { drawDropdown, drawSearch, drawList, drawRange, drawDateRange } from './slicers';
import { drawCombo } from './combo';
import { drawHistogram } from './histogram';
import { drawTreemap } from './treemap';
import { drawGauge } from './gauge';
import { drawBullet } from './bullet';
import { drawCalendarHeatmap } from './calendarHeatmap';

export { drawAnnotations, drawAnnotationLabels } from './annotations';

export type CartesianRenderer = (surface: Surface, model: CartesianModel) => void;
export type CartesianInteractionBuilder = (model: CartesianModel) => InteractionModel | void;

/**
 * Optional per-frame interactivity context handed to custom renderers. Lets a
 * chart dim non-selected marks (`emphasis`), publish its own selection to the
 * shared bus (`store` + `param`/`def`), and request a redraw when its internal
 * state changes (slicers). All fields are optional — a renderer that ignores the
 * context behaves exactly as before.
 */
export interface RenderContext {
  /** Active highlight for this frame, or null when nothing is selected. */
  emphasis?: Emphasis | null;
  /** Shared selection bus when this chart is linked to others. */
  store?: SelectionStore;
  /** The param this chart publishes selections to (usually `spec.params[0]`). */
  param?: string;
  /** The selection definition backing `param`. */
  def?: SelectionDef;
  /**
   * The visual's *unfiltered* source rows. Slicers derive their option lists from
   * this (so a slicer never hides its own choices by filtering itself), while the
   * `spec.data` handed to the renderer may already be cross-filtered.
   */
  sourceData?: Datum[];
  /**
   * The host already provides card chrome (e.g. a dashboard cell), so renderers
   * that normally draw their own card (KPI) should render flat to avoid doubling
   * the border/background.
   */
  framed?: boolean;
  /** Ask the runtime to redraw the marks layer (used by DOM slicers). */
  requestRedraw?: () => void;
}

export type CustomRenderer = (
  surface: Surface,
  spec: ChartSpec,
  tokens: ThemeTokens,
  size: Size,
  context?: RenderContext,
) => InteractionModel | void;

export const CARTESIAN_TYPES: ReadonlySet<ChartType> = new Set<ChartType>([
  'line',
  'area',
  'bar',
  'scatter',
  'box',
]);

export const cartesianRenderers: Partial<Record<ChartType, CartesianRenderer>> = {
  line: drawLine,
  area: drawArea,
  bar: drawBar,
  scatter: drawScatter,
  box: drawBox,
};

/**
 * Cartesian charts whose hover semantics differ from the generic nearest-point
 * model (e.g. box plots surface quartile stats). When present, the runtime uses
 * this builder instead of `buildCartesianInteraction`.
 */
export const cartesianInteractionBuilders: Partial<Record<ChartType, CartesianInteractionBuilder>> = {
  box: buildBoxInteraction,
};

export const customRenderers: Partial<Record<ChartType, CustomRenderer>> = {
  heatmap: drawHeatmap,
  pie: drawPie,
  funnel: drawFunnel,
  kpi: drawKpi,
  treemap: drawTreemap,
  gauge: drawGauge,
  bullet: drawBullet,
  calendarHeatmap: drawCalendarHeatmap,
  combo: drawCombo,
  histogram: drawHistogram,
  sankey: drawSankey,
  choropleth: drawChoropleth,
  table: drawTable,
  matrix: drawMatrix,
  dropdown: drawDropdown,
  search: drawSearch,
  list: drawList,
  range: drawRange,
  dateRange: drawDateRange,
};
