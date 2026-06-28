/**
 * Apply accessibility semantics to a rendered chart Surface.
 *
 * Called by the runtime after each draw. Idempotent: safe to re-run on every
 * update/resize.
 */

import type { Surface } from '../render/surface';
import type { ChartSpec, ChartType } from '../spec/types';
import { summarizeChart } from './describe';
import { summarize } from '../analyze/summarize';
import { buildDataTableFallback } from './table';

/**
 * Chart types whose overlay already exposes their data as real DOM text
 * (table/matrix render a semantic `<table>`; kpi renders its value/label as
 * text), so they don't need a hidden data-table fallback.
 */
const SELF_DESCRIBING: ReadonlySet<ChartType> = new Set<ChartType>(['table', 'matrix', 'kpi']);

export function applyA11y(surface: Surface, spec: ChartSpec): void {
  const { root } = surface;

  // Present the chart as a named figure. Unlike role="img", a figure keeps its
  // descendants (overlay text + the hidden data table) discoverable by AT.
  root.setAttribute('role', 'figure');
  root.setAttribute('aria-label', summarizeChart(spec).label);

  // The concise aria-label names the chart; a deterministic NL summary of what
  // the data *shows* serves as richer alt-text. Skip it when the author gave an
  // explicit description (already used as the label) or nothing is summarizable.
  const narrative = spec.description ? '' : summarize(spec);
  if (narrative) root.setAttribute('aria-description', narrative);
  else root.removeAttribute('aria-description');

  // Canvas layers are decorative — the data is conveyed via the overlay text
  // and/or the hidden data-table fallback.
  surface.marks.canvas.setAttribute('aria-hidden', 'true');
  surface.interaction.canvas.setAttribute('aria-hidden', 'true');

  // Rebuild the hidden data-table fallback (owns the a11y container).
  surface.a11y.replaceChildren();
  if (!SELF_DESCRIBING.has(spec.type)) {
    const table = buildDataTableFallback(spec);
    if (table) surface.a11y.appendChild(table);
  }
}
