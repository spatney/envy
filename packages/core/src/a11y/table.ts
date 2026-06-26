/**
 * Visually-hidden data-table fallback.
 *
 * For canvas-drawn charts (line/area/bar/scatter/pie/heatmap) the values live
 * only in pixels, so we mirror the chart's `data` into an off-screen semantic
 * `<table>`. Screen-reader users get the real numbers; sighted users see
 * nothing. Charts that already render real DOM text (table/matrix/kpi) don't
 * need this.
 */

import type { ChartSpec } from '../spec/types';
import type { Datum } from '../types';
import { summarizeChart } from './describe';

/** Canonical "visually hidden" style — present to AT, invisible on screen. */
export const SR_ONLY_STYLE =
  'position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;' +
  'clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;border:0;';

/** Cap rows so assistive tech isn't flooded by huge datasets. */
const MAX_ROWS = 100;

/** Stable union of keys across (possibly heterogeneous) rows, in first-seen order. */
function columnsOf(data: readonly Datum[]): string[] {
  const seen = new Set<string>();
  const columns: string[] = [];
  for (const row of data) {
    if (row && typeof row === 'object') {
      for (const key of Object.keys(row)) {
        if (!seen.has(key)) {
          seen.add(key);
          columns.push(key);
        }
      }
    }
  }
  return columns;
}

function cellText(value: unknown): string {
  if (value == null) return '';
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

/**
 * Build a visually-hidden `<table>` mirroring the chart's data. Returns `null`
 * when there is nothing useful to tabulate (no rows or no columns).
 */
export function buildDataTableFallback(spec: ChartSpec): HTMLTableElement | null {
  const data = Array.isArray(spec.data) ? spec.data : [];
  if (data.length === 0) return null;
  const columns = columnsOf(data);
  if (columns.length === 0) return null;

  const table = document.createElement('table');
  table.setAttribute('style', SR_ONLY_STYLE);

  const caption = document.createElement('caption');
  caption.textContent = summarizeChart(spec).label;
  table.appendChild(caption);

  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  for (const column of columns) {
    const th = document.createElement('th');
    th.scope = 'col';
    th.textContent = column;
    headRow.appendChild(th);
  }
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  const limit = Math.min(data.length, MAX_ROWS);
  for (let i = 0; i < limit; i++) {
    const row = data[i] as Record<string, unknown>;
    const tr = document.createElement('tr');
    for (const column of columns) {
      const td = document.createElement('td');
      td.textContent = cellText(row?.[column]);
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);

  const hidden = data.length - limit;
  if (hidden > 0) {
    const footRow = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = columns.length;
    td.textContent = `…and ${hidden} more row${hidden === 1 ? '' : 's'}`;
    footRow.appendChild(td);
    tbody.appendChild(footRow);
  }

  return table;
}
