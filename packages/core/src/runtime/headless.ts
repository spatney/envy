/**
 * Headless rendering — paint a chart onto any caller-supplied 2D context
 * (e.g. `@napi-rs/canvas`, `node-canvas`, an `OffscreenCanvas`) with **no DOM**.
 *
 * This is the server-side half of the critique loop: it reuses the exact same
 * model build + mark renderers as the browser, but routes overlay text through
 * the canvas text path (see `render/overlayText.ts`) instead of the HTML overlay.
 * It is dependency-free — the caller owns canvas creation and PNG/SVG encoding,
 * so `graphein` itself stays zero-dependency. The companion `@graphein/node`
 * package wires this to `@napi-rs/canvas`.
 *
 * Returns the same {@link RenderReport} as `instance.report()`, so an agent can
 * generate → validate → render → critique entirely on the server.
 */

import type { Datum, Size } from '../types';
import type { ChartSpec } from '../spec/types';
import { resolveSketch } from '../spec/sketch';
import { applyTransforms } from '../spec/transform';
import { resolveTheme, withSketchFont } from '../theme';
import type { Surface } from '../render/surface';
import { buildCartesianModel, type CartesianChartSpec } from './cartesian';
import { buildRenderReport, type RenderReport } from './report';
import { drawAxesUnderlay, drawOverlay } from '../axes';
import {
  CARTESIAN_TYPES,
  cartesianRenderers,
  customRenderers,
  drawAnnotations,
  drawAnnotationLabels,
  drawTrendlines,
  drawTrendlineLabels,
  type RenderContext,
} from '../charts';
import { createSelectionStore } from '../interaction/store';

/** A minimal 2D-context target. Pass `interaction` if any renderer needs it. */
export interface HeadlessTarget {
  /** The primary 2D context chart marks + text are painted onto. */
  marks: CanvasRenderingContext2D;
  /** Optional secondary context for hover layers (unused on the static path). */
  interaction?: CanvasRenderingContext2D;
  /** Logical (CSS-pixel) width to draw at. */
  width: number;
  /** Logical (CSS-pixel) height to draw at. */
  height: number;
}

/**
 * Chart kinds whose presentation is pure DOM (HTML cards/tables/inputs) and so
 * have no canvas form. Rendering one headlessly throws a clear error.
 */
const DOM_ONLY_TYPES: ReadonlySet<string> = new Set<string>([
  'kpi',
  'table',
  'matrix',
  'dropdown',
  'list',
  'search',
  'range',
  'dateRange',
  'dashboard',
]);

function headlessTokens(spec: ChartSpec) {
  const tokens = resolveTheme(spec.theme);
  const sketch = resolveSketch(spec);
  return sketch?.font ? withSketchFont(tokens) : tokens;
}

/**
 * Paint `spec` onto `target.marks` (in CSS pixels — the caller sets up any
 * device-pixel-ratio scaling on the context beforehand) and return the render
 * report. No animation, no interactivity, no DOM.
 *
 * Supports every canvas-backed chart: line, area, bar, scatter, box, pie,
 * heatmap, sankey, choropleth, combo, histogram, funnel. DOM-only kinds
 * (kpi/table/matrix/slicers/dashboard) are unsupported headlessly.
 */
export function renderToContext(target: HeadlessTarget, spec: ChartSpec): RenderReport {
  const type = spec.type;
  if (DOM_ONLY_TYPES.has(type)) {
    throw new Error(
      `Graphein: "${type}" is a DOM-only visual and cannot be rendered to a canvas headlessly. ` +
        `Headless rendering supports the canvas charts (line, area, bar, scatter, box, pie, ` +
        `heatmap, sankey, choropleth, combo, histogram, funnel).`,
    );
  }

  const ctx = target.marks;
  const size: Size = { width: target.width, height: target.height };
  const tokens = headlessTokens(spec);

  const surface = {
    headless: true,
    width: size.width,
    height: size.height,
    dpr: 1,
    marks: { ctx },
    interaction: { ctx: target.interaction ?? ctx },
  } as unknown as Surface;

  // Background.
  const bg = spec.background ?? tokens.color.background;
  ctx.save();
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, size.width, size.height);
  ctx.restore();

  // Apply declarative transforms (same as the browser data-prep step).
  const src: Datum[] = spec.data ?? [];
  const data: Datum[] = spec.transform?.length ? applyTransforms(spec.transform, src) : src;
  const effectiveSpec = data === src ? spec : ({ ...spec, data } as ChartSpec);

  let reportModel;
  if (CARTESIAN_TYPES.has(type)) {
    const renderer = cartesianRenderers[type];
    const model = buildCartesianModel(effectiveSpec as CartesianChartSpec, tokens, size);
    reportModel = model;
    drawAxesUnderlay(surface, model);
    if (renderer) renderer(surface, model);
    drawTrendlines(surface, model);
    drawAnnotations(surface, model);
    drawOverlay(surface, model);
    drawAnnotationLabels(surface, model);
    drawTrendlineLabels(surface, model);
  } else {
    const renderer = customRenderers[type];
    if (!renderer) {
      throw new Error(`Graphein: no renderer registered for chart type "${type}".`);
    }
    const rctx: RenderContext = {
      emphasis: null,
      store: createSelectionStore(),
      param: undefined,
      def: undefined,
      sourceData: src,
      framed: false,
      requestRedraw: () => {},
    };
    renderer(surface, effectiveSpec, tokens, size, rctx);
  }

  return buildRenderReport({ type, spec, data, tokens, size, model: reportModel });
}
