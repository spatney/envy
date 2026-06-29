import type { ConditionalFormat } from '../spec/types';
import type { ThemeTokens } from '../theme';
import type { FieldType, Rect } from '../types';
import {
  diverging as divergingInterpolator,
  divergingColorScale,
  parseColor,
  readableTextColor,
  rgbaToCss,
  sequential,
  sequentialColorScale,
} from '../color';
import { formatValue } from '../format';
import { paintCanvasText } from '../render/overlayText';
import { fontString, measureText } from '../render/text';
import { roundedRect } from '../shape';
import { evalRules, iconForValue, toneColor } from './condFormat';

const HEADER_ROW_HEIGHT = 32;
const MIN_COL_WIDTH = 72;
const DEFAULT_BODY_ROW_HEIGHT = 30;
/** A wobbly, asymmetric border-radius that reads as a hand-drawn frame. */
const SKETCH_BORDER_RADIUS = '14px 6px 16px 7px / 7px 15px 6px 14px';

export interface ViewColumn {
  key: string;
  title: string;
  align: 'left' | 'center' | 'right';
  format?: string;
  type?: FieldType;
  width?: number;
  conditionalFormat?: ConditionalFormat;
  isMeasure?: boolean;
  prefix?: string;
  suffix?: string;
  negativeStyle?: 'sign' | 'parens' | 'red' | 'parens-red';
  sortable?: boolean;
  wrap?: boolean;
  group?: string;
}

export interface HeaderCell {
  title: string;
  colSpan?: number;
  rowSpan?: number;
  align?: 'left' | 'center' | 'right';
  colIndex?: number;
}

export interface VisibleRange {
  start: number;
  end: number;
  rowHeight: number;
}

export interface BuildTableOptions {
  container: HTMLElement;
  tokens: ThemeTokens;
  rect: Rect;
  columns: ViewColumn[];
  rowCount: number;
  getCell(rowIndex: number, colIndex: number): { value: unknown; raw: number | null };
  rowClass?(rowIndex: number): 'normal' | 'subtotal' | 'grandtotal';
  cellIndent?(rowIndex: number, colIndex: number): number;
  rowHeaderSpan?: number;
  striped?: boolean;
  stickyHeader?: boolean;
  onSort?(colIndex: number): void;
  sortState?: { col: number; dir: 'asc' | 'desc' };
  conditionalDomains?: Array<[number, number] | null>;
  headerRows?: HeaderCell[][];
  footerRow?: { cells: Array<{ value: unknown; raw: number | null; label?: boolean }> };
  density?: 'comfortable' | 'standard' | 'compact';
  visibleRange?: VisibleRange;
  /** Render hand-drawn chrome (a wobbly container frame) for sketch mode. */
  sketch?: boolean;
  /** Computed internally by buildTable; column pixel widths fitted to the container. */
  widths?: number[];
}

export type CanvasTableOptions = Omit<BuildTableOptions, 'container' | 'onSort'> & {
  ctx: CanvasRenderingContext2D;
  clippedCue?: boolean;
};

export function formatCellValue(value: unknown, column: Pick<ViewColumn, 'format'>): string {
  return formatValue(value, column.format);
}

export function formatDisplayValue(
  value: unknown,
  column: Pick<ViewColumn, 'format' | 'prefix' | 'suffix' | 'negativeStyle'>,
): string {
  const raw = typeof value === 'number' ? value : Number(value);
  const negative = Number.isFinite(raw) && raw < 0;
  const baseValue =
    negative && (column.negativeStyle === 'parens' || column.negativeStyle === 'parens-red') ? Math.abs(raw) : value;
  const formatted = formatCellValue(baseValue, column);
  const wrapped = negative && (column.negativeStyle === 'parens' || column.negativeStyle === 'parens-red')
    ? `(${formatted})`
    : formatted;
  return `${column.prefix ?? ''}${wrapped}${column.suffix ?? ''}`;
}

export function resolveConditionalDomain(
  conditionalFormat: ConditionalFormat | undefined,
  values: readonly (number | null | undefined)[],
): [number, number] | null {
  if (!conditionalFormat) return null;
  if ('domain' in conditionalFormat && conditionalFormat.domain) return conditionalFormat.domain;
  let min = Infinity;
  let max = -Infinity;
  for (const value of values) {
    if (value == null || !Number.isFinite(value)) continue;
    if (value < min) min = value;
    if (value > max) max = value;
  }
  return min === Infinity ? null : [min, max];
}

export function buildTable(opts: BuildTableOptions): void {
  const { container, rect, tokens } = opts;
  // When the body is taller than the container a vertical scrollbar appears and
  // eats horizontal space; reserve its (platform-specific) width so the last
  // column isn't clipped behind a spurious horizontal scrollbar.
  const reserve = willScrollVertically(opts) ? scrollbarWidth() : 0;
  const available = Math.max(0, rect.width - 2 - reserve);
  opts.widths = computeFittedWidths(opts.columns, available);
  const tableWidth = Math.max(available, sumWidths(opts.widths));
  setStyles(container, {
    position: 'absolute',
    left: `${rect.x}px`,
    top: `${rect.y}px`,
    width: `${Math.max(0, rect.width)}px`,
    height: `${Math.max(0, rect.height)}px`,
    overflow: 'auto',
    pointerEvents: 'auto',
    boxSizing: 'border-box',
    border: `1px solid ${tokens.color.border}`,
    borderRadius: opts.sketch ? SKETCH_BORDER_RADIUS : `${tokens.radius.sm}px`,
    background: tokens.color.background,
  });

  container.replaceChildren();

  const table = document.createElement('table');
  table.setAttribute('role', 'table');
  setStyles(table, {
    width: `${tableWidth}px`,
    minWidth: '100%',
    borderCollapse: 'separate',
    borderSpacing: '0',
    tableLayout: 'fixed',
    fontFamily: tokens.font.family,
    fontSize: `${tokens.font.size.small}px`,
    lineHeight: '1.35',
    color: tokens.color.text,
  });

  table.appendChild(buildColGroup(opts.widths));
  table.appendChild(buildHeader(opts));
  table.appendChild(buildBody(opts));
  const footer = buildFooter(opts);
  if (footer) table.appendChild(footer);
  container.appendChild(table);
}

export function paintTableCanvas(opts: CanvasTableOptions): void {
  const { ctx, rect, tokens } = opts;
  const metrics = densityMetrics(opts.density);
  const available = Math.max(0, rect.width - 2);
  const widths = computeFittedWidths(opts.columns, available);
  opts.widths = widths;

  ctx.save();
  ctx.beginPath();
  roundedRect(ctx, rect.x, rect.y, Math.max(0, rect.width), Math.max(0, rect.height), tokens.radius.sm);
  ctx.fillStyle = tokens.color.background;
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = tokens.color.border;
  ctx.stroke();
  ctx.clip();

  const headerRows = normalizedHeaderRows(opts);
  const headerHeight = headerRows.length * metrics.headerHeight;
  const footerHeight = opts.footerRow ? metrics.rowHeight : 0;
  const bodyTop = rect.y + headerHeight;
  const bodyBottom = rect.y + rect.height - footerHeight;
  const bodyHeight = Math.max(0, bodyBottom - bodyTop);
  const visibleRows = Math.max(0, Math.min(opts.rowCount, Math.floor(bodyHeight / metrics.rowHeight)));
  const clipped = visibleRows < opts.rowCount;
  const cueReserve = clipped && opts.clippedCue !== false && visibleRows > 0 ? metrics.rowHeight : 0;
  const rowsToDraw = Math.max(0, visibleRows - (cueReserve > 0 ? 1 : 0));

  paintHeaderCanvas(opts, widths, headerRows, metrics);
  for (let rowIndex = 0; rowIndex < rowsToDraw; rowIndex += 1) {
    paintBodyRowCanvas(opts, widths, rowIndex, bodyTop + rowIndex * metrics.rowHeight, metrics);
  }
  if (cueReserve > 0) {
    paintClippedCueCanvas(opts, bodyTop + rowsToDraw * metrics.rowHeight, metrics, opts.rowCount - rowsToDraw);
  }
  if (opts.footerRow) {
    paintFooterCanvas(opts, widths, rect.y + rect.height - metrics.rowHeight, metrics);
  }

  ctx.restore();
}

const FILL_EPS = 0.5;

let cachedScrollbarWidth: number | null = null;

/** Measure the browser's vertical scrollbar width (0 for overlay scrollbars). */
function scrollbarWidth(): number {
  if (cachedScrollbarWidth != null) return cachedScrollbarWidth;
  if (typeof document === 'undefined' || !document.body) return 0;
  const probe = document.createElement('div');
  probe.style.cssText =
    'position:absolute;top:-9999px;width:100px;height:100px;overflow:scroll;visibility:hidden';
  document.body.appendChild(probe);
  cachedScrollbarWidth = probe.offsetWidth - probe.clientWidth;
  probe.remove();
  return cachedScrollbarWidth;
}

/** Predicted total content height, used to decide whether the body will scroll. */
function contentHeight(opts: BuildTableOptions): number {
  const headerRows = opts.headerRows?.length ?? 1;
  const metrics = densityMetrics(opts.density);
  const rowHeight = opts.visibleRange?.rowHeight ?? metrics.rowHeight;
  return headerRows * metrics.headerHeight + opts.rowCount * rowHeight + (opts.footerRow ? metrics.rowHeight : 0);
}

function willScrollVertically(opts: BuildTableOptions): boolean {
  return contentHeight(opts) > opts.rect.height + 1;
}

export function computeFittedWidths(columns: readonly ViewColumn[], available: number): number[] {
  const natural = columns.map((column) => column.width ?? defaultColumnWidth(column));
  const naturalTotal = natural.reduce((sum, w) => sum + w, 0) || 1;
  if (available <= FILL_EPS) return natural;
  if (naturalTotal <= available) {
    const extra = available - naturalTotal;
    return natural.map((w) => w + extra * (w / naturalTotal));
  }
  // Shrink to fit: iteratively scale columns above MIN_COL_WIDTH, letting any
  // column clamped at the minimum push its deficit onto the still-flexible ones,
  // so the total lands exactly on `available` whenever the minimums allow it.
  const widths = natural.slice();
  for (let pass = 0; pass < columns.length; pass += 1) {
    const total = widths.reduce((sum, w) => sum + w, 0);
    if (total <= available + FILL_EPS) break;
    let flexTotal = 0;
    let fixedTotal = 0;
    for (const w of widths) {
      if (w > MIN_COL_WIDTH + FILL_EPS) flexTotal += w;
      else fixedTotal += w;
    }
    if (flexTotal <= 0) break;
    const targetFlex = available - fixedTotal;
    const factor = targetFlex <= 0 ? 0 : targetFlex / flexTotal;
    for (let i = 0; i < widths.length; i += 1) {
      if (widths[i] > MIN_COL_WIDTH + FILL_EPS) {
        widths[i] = Math.max(MIN_COL_WIDTH, widths[i] * factor);
      }
    }
  }
  return widths;
}

function sumWidths(widths: readonly number[]): number {
  return widths.reduce((sum, w) => sum + w, 0);
}

function buildColGroup(widths: readonly number[]): HTMLTableColElement {
  const colgroup = document.createElement('colgroup');
  for (const width of widths) {
    const col = document.createElement('col');
    col.style.width = `${width}px`;
    colgroup.appendChild(col);
  }
  return colgroup;
}

function buildHeader(opts: BuildTableOptions): HTMLTableSectionElement {
  const thead = document.createElement('thead');
  if (opts.headerRows) {
    opts.headerRows.forEach((row, rowIndex) => {
      const tr = document.createElement('tr');
      for (const cell of row) {
        const th = makeHeaderCell(opts, cell.title, cell.colIndex, cell.align, rowIndex);
        if (cell.colSpan && cell.colSpan > 1) th.colSpan = cell.colSpan;
        if (cell.rowSpan && cell.rowSpan > 1) th.rowSpan = cell.rowSpan;
        tr.appendChild(th);
      }
      thead.appendChild(tr);
    });
    return thead;
  }

  const tr = document.createElement('tr');
  opts.columns.forEach((column, colIndex) => {
    tr.appendChild(makeHeaderCell(opts, column.title, colIndex, column.align));
  });
  thead.appendChild(tr);
  return thead;
}

function makeHeaderCell(
  opts: BuildTableOptions,
  title: string,
  colIndex: number | undefined,
  align: 'left' | 'center' | 'right' | undefined,
  rowIndex = 0,
): HTMLTableCellElement {
  const th = document.createElement('th');
  const metrics = densityMetrics(opts.density);
  th.scope = 'col';
  th.textContent = title;
  const isSorted = colIndex != null && opts.sortState?.col === colIndex;
  if (isSorted) th.setAttribute('aria-sort', opts.sortState?.dir === 'desc' ? 'descending' : 'ascending');
  setCellBaseStyles(th, opts.tokens, align ?? 'left', opts.stickyHeader !== false, metrics.padding);
  setStyles(th, {
    top: `${rowIndex * metrics.headerHeight}px`,
    zIndex: '4',
    background: opts.tokens.color.surface,
    color: opts.tokens.color.text,
    fontWeight: String(opts.tokens.font.weight.bold),
    borderBottom: `1px solid ${opts.tokens.color.border}`,
    userSelect: 'none',
    height: `${metrics.headerHeight}px`,
  });

  if (colIndex != null && opts.onSort && opts.columns[colIndex]?.sortable !== false) {
    th.textContent = '';
    const button = document.createElement('button');
    button.type = 'button';
    button.addEventListener('click', () => opts.onSort?.(colIndex));
    setStyles(button, {
      all: 'unset',
      boxSizing: 'border-box',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: align === 'right' ? 'flex-end' : align === 'center' ? 'center' : 'flex-start',
      gap: '5px',
      width: '100%',
      cursor: 'pointer',
      color: 'inherit',
      font: 'inherit',
    });
    const label = document.createElement('span');
    label.textContent = title;
    label.style.overflow = 'hidden';
    label.style.textOverflow = 'ellipsis';
    const glyph = document.createElement('span');
    glyph.textContent = isSorted ? (opts.sortState?.dir === 'desc' ? '↓' : '↑') : '';
    glyph.setAttribute('aria-hidden', 'true');
    glyph.style.color = opts.tokens.color.textMuted;
    button.append(label, glyph);
    th.appendChild(button);
  }

  applyStickyColumn(th, opts, colIndex, true);
  return th;
}

function buildBody(opts: BuildTableOptions): HTMLTableSectionElement {
  const tbody = document.createElement('tbody');
  const range = opts.visibleRange;
  const start = range ? clampInt(range.start, 0, opts.rowCount) : 0;
  const end = range ? clampInt(range.end, start, opts.rowCount) : opts.rowCount;
  if (range && start > 0) tbody.appendChild(makeSpacerRow(opts, start * range.rowHeight));
  for (let rowIndex = start; rowIndex < end; rowIndex += 1) {
    tbody.appendChild(makeBodyRow(opts, rowIndex, range?.rowHeight));
  }
  if (range && end < opts.rowCount) {
    tbody.appendChild(makeSpacerRow(opts, (opts.rowCount - end) * range.rowHeight));
  }
  return tbody;
}

function makeBodyRow(opts: BuildTableOptions, rowIndex: number, rowHeight?: number): HTMLTableRowElement {
  const tr = document.createElement('tr');
  const cls = opts.rowClass?.(rowIndex) ?? 'normal';
  const metrics = densityMetrics(opts.density);
  if (rowHeight) tr.style.height = `${rowHeight}px`;
  opts.columns.forEach((column, colIndex) => {
    const td = document.createElement('td');
    const cell = opts.getCell(rowIndex, colIndex);
    const rowBg = rowBackground(opts, rowIndex, cls);
    setCellBaseStyles(td, opts.tokens, column.align, false, metrics.padding);
    setStyles(td, {
      position: colIndex < (opts.rowHeaderSpan ?? 0) ? 'sticky' : 'relative',
      background: rowBg,
      fontWeight: cls === 'normal' ? String(opts.tokens.font.weight.normal) : String(opts.tokens.font.weight.bold),
      color: opts.tokens.color.text,
      borderBottom: `1px solid ${opts.tokens.color.border}`,
      height: rowHeight ? `${rowHeight}px` : `${metrics.rowHeight}px`,
      whiteSpace: column.wrap === true ? 'normal' : 'nowrap',
    });
    const indent = opts.cellIndent?.(rowIndex, colIndex) ?? 0;
    if (indent > 0) td.style.paddingLeft = `${metrics.paddingX + indent}px`;
    applyConditionalFormatting(td, opts, column, colIndex, cell, rowBg);
    if (td.childNodes.length === 0) {
      td.textContent = formatDisplayValue(cell.value, column);
      applyNegativeStyle(td, cell.value, column);
    }
    applyStickyColumn(td, opts, colIndex, false);
    tr.appendChild(td);
  });
  return tr;
}

function buildFooter(opts: BuildTableOptions): HTMLTableSectionElement | null {
  if (!opts.footerRow) return null;
  const tfoot = document.createElement('tfoot');
  const tr = document.createElement('tr');
  const metrics = densityMetrics(opts.density);
  opts.columns.forEach((column, colIndex) => {
    const td = document.createElement('td');
    const cell = opts.footerRow?.cells[colIndex] ?? { value: null, raw: null };
    setCellBaseStyles(td, opts.tokens, column.align, false, metrics.padding);
    setStyles(td, {
      position: colIndex < (opts.rowHeaderSpan ?? 0) ? 'sticky' : 'sticky',
      bottom: '0',
      zIndex: colIndex < (opts.rowHeaderSpan ?? 0) ? '5' : '4',
      background: opts.tokens.color.surface,
      color: opts.tokens.color.text,
      fontWeight: String(opts.tokens.font.weight.bold),
      borderTop: `1px solid ${opts.tokens.color.border}`,
      borderBottom: `1px solid ${opts.tokens.color.border}`,
      height: `${metrics.rowHeight}px`,
      whiteSpace: column.wrap === true ? 'normal' : 'nowrap',
    });
    td.textContent = cell.label ? String(cell.value ?? '') : formatDisplayValue(cell.value, column);
    applyNegativeStyle(td, cell.value, column);
    applyStickyColumn(td, opts, colIndex, false);
    tr.appendChild(td);
  });
  tfoot.appendChild(tr);
  return tfoot;
}

function makeSpacerRow(opts: BuildTableOptions, height: number): HTMLTableRowElement {
  const tr = document.createElement('tr');
  tr.setAttribute('aria-hidden', 'true');
  const td = document.createElement('td');
  td.colSpan = Math.max(1, opts.columns.length);
  setStyles(td, {
    height: `${Math.max(0, height)}px`,
    padding: '0',
    border: '0',
    background: opts.tokens.color.background,
  });
  tr.appendChild(td);
  return tr;
}

function applyConditionalFormatting(
  td: HTMLTableCellElement,
  opts: BuildTableOptions,
  column: ViewColumn,
  colIndex: number,
  cell: { value: unknown; raw: number | null },
  rowBg: string,
): void {
  const cf = column.conditionalFormat;
  const raw = cell.raw;
  const domain = opts.conditionalDomains?.[colIndex] ?? null;
  if (!cf) return;
  if ((cf.type === 'colorScale' || cf.type === 'bar' || cf.type === 'icon') && (raw == null || !Number.isFinite(raw))) {
    return;
  }
  const numeric = raw as number;

  if (cf.type === 'colorScale') {
    if (!domain) return;
    const midpoint = cf.midpoint ?? (domain[0] + domain[1]) / 2;
    const scale =
      cf.diverging === true || cf.midpoint !== undefined
        ? divergingColorScale({ domain: [domain[0], midpoint, domain[1]], interpolator: divergingInterpolator(cf.scheme ?? 'redblue') })
        : sequentialColorScale({ domain, interpolator: sequential(cf.scheme ?? 'blues') });
    const color = scale.map(numeric);
    if (cf.target === 'text') {
      td.style.color = rgbaToCss(color);
    } else {
      td.style.background = rgbaToCss(color);
      td.style.color = rgbaToCss(readableTextColor(color));
    }
    return;
  }

  if (cf.type === 'rules') {
    const style = evalRules((raw ?? String(cell.value ?? '')) as number | null, cf.rules);
    if (style.background) td.style.background = style.background;
    if (style.color) td.style.color = style.color;
    if (style.weight) td.style.fontWeight = style.weight === 'bold' ? String(opts.tokens.font.weight.bold) : String(opts.tokens.font.weight.normal);
    if (style.icon) renderIconValue(td, style.icon, style.color ?? td.style.color, formatDisplayValue(cell.value, column), 'left');
    return;
  }

  if (cf.type === 'icon') {
    const semantic = iconForValue(cf.set, numeric, domain, cf.rules);
    if (!semantic) return;
    renderIconValue(
      td,
      semantic.icon,
      toneColor(semantic.tone, { up: opts.tokens.color.positive, mid: '#d97706', down: opts.tokens.color.negative }),
      formatDisplayValue(cell.value, column),
      cf.position ?? 'left',
    );
    applyNegativeStyle(td, cell.value, column);
    return;
  }

  if (!domain) return;
  const ratio = normalized(numeric, domain);
  const bar = document.createElement('div');
  const diverging = cf.negativeColor !== undefined || cf.baseline === 'zero';
  const positive = numeric >= 0;
  const barColor = alphaColor(positive ? cf.color ?? opts.tokens.color.accent : cf.negativeColor ?? opts.tokens.color.negative, 0.85);
  const baseline = diverging ? normalized(0, domain) : 0;
  const left = diverging ? Math.min(baseline, normalized(numeric, domain)) : 0;
  const width = diverging ? Math.abs(normalized(numeric, domain) - baseline) : ratio;
  setStyles(bar, {
    position: 'absolute',
    left: `calc(${Math.round(left * 1000) / 10}% + 4px)`,
    top: '5px',
    bottom: '5px',
    width: `${Math.round(width * 1000) / 10}%`,
    borderRadius: `${Math.max(2, opts.tokens.radius.sm - 1)}px`,
    background: barColor,
    opacity: '0.9',
    pointerEvents: 'none',
  });
  const text = document.createElement('span');
  text.textContent = cf.showValue === false ? '' : formatDisplayValue(cell.value, column);
  setStyles(text, overlayTextStyles(opts.tokens.color.text));
  td.style.background = rowBg;
  td.append(bar, text);
  applyNegativeStyle(text, cell.value, column);
}

function setCellBaseStyles(
  cell: HTMLTableCellElement,
  tokens: ThemeTokens,
  align: 'left' | 'center' | 'right',
  sticky: boolean,
  padding = '6px 10px',
): void {
  setStyles(cell, {
    boxSizing: 'border-box',
    padding,
    textAlign: align,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    borderRight: `1px solid ${tokens.color.border}`,
    verticalAlign: 'middle',
  });
  if (sticky) cell.style.position = 'sticky';
}

function renderIconValue(
  td: HTMLTableCellElement,
  icon: string,
  color: string,
  value: string,
  position: 'left' | 'right',
): void {
  const iconSpan = document.createElement('span');
  iconSpan.textContent = icon;
  iconSpan.setAttribute('aria-hidden', 'true');
  setStyles(iconSpan, { color, fontWeight: '700', flex: '0 0 auto' });

  const valueSpan = document.createElement('span');
  valueSpan.textContent = value;
  setStyles(valueSpan, { overflow: 'hidden', textOverflow: 'ellipsis' });

  const wrap = document.createElement('span');
  setStyles(wrap, {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: td.style.textAlign === 'right' ? 'flex-end' : td.style.textAlign === 'center' ? 'center' : 'flex-start',
    gap: '6px',
    maxWidth: '100%',
    width: '100%',
  });
  if (position === 'right') wrap.append(valueSpan, iconSpan);
  else wrap.append(iconSpan, valueSpan);
  td.appendChild(wrap);
}

function overlayTextStyles(color: string): Record<string, string> {
  return {
    position: 'relative',
    zIndex: '1',
    display: 'block',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    color,
  };
}

function applyNegativeStyle(
  el: HTMLElement,
  value: unknown,
  column: Pick<ViewColumn, 'negativeStyle'>,
): void {
  const raw = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(raw) || raw >= 0) return;
  if (column.negativeStyle === 'red' || column.negativeStyle === 'parens-red') {
    el.style.color = '#dc2626';
  }
}

export function densityMetrics(density: BuildTableOptions['density']): {
  rowHeight: number;
  headerHeight: number;
  padding: string;
  paddingX: number;
} {
  if (density === 'comfortable') return { rowHeight: 36, headerHeight: 36, padding: '8px 12px', paddingX: 12 };
  if (density === 'compact') return { rowHeight: 24, headerHeight: 28, padding: '3px 8px', paddingX: 8 };
  return { rowHeight: DEFAULT_BODY_ROW_HEIGHT, headerHeight: HEADER_ROW_HEIGHT, padding: '6px 10px', paddingX: 10 };
}

function normalizedHeaderRows(opts: CanvasTableOptions): HeaderCell[][] {
  if (opts.headerRows) return opts.headerRows;
  return [
    opts.columns.map((column, colIndex) => ({
      title: column.title,
      align: column.align,
      colIndex,
    })),
  ];
}

function paintHeaderCanvas(
  opts: CanvasTableOptions,
  widths: readonly number[],
  rows: HeaderCell[][],
  metrics: ReturnType<typeof densityMetrics>,
): void {
  rows.forEach((row, rowIndex) => {
    let cursor = 0;
    for (const cell of row) {
      const start = cell.colIndex ?? cursor;
      const colSpan = Math.max(1, cell.colSpan ?? 1);
      const rowSpan = Math.max(1, cell.rowSpan ?? 1);
      const x = opts.rect.x + sumWidths(widths.slice(0, start));
      const y = opts.rect.y + rowIndex * metrics.headerHeight;
      const w = sumWidths(widths.slice(start, start + colSpan));
      const h = metrics.headerHeight * rowSpan;
      paintCellBox(opts.ctx, x, y, w, h, opts.tokens.color.surface, opts.tokens.color.border);
      paintCellText(opts, {
        x,
        y,
        width: w,
        height: h,
        text: cell.title,
        align: cell.align ?? 'left',
        color: opts.tokens.color.text,
        weight: opts.tokens.font.weight.bold,
        paddingX: metrics.paddingX,
      });
      cursor = start + colSpan;
    }
  });
}

function paintBodyRowCanvas(
  opts: CanvasTableOptions,
  widths: readonly number[],
  rowIndex: number,
  y: number,
  metrics: ReturnType<typeof densityMetrics>,
): void {
  const cls = opts.rowClass?.(rowIndex) ?? 'normal';
  let x = opts.rect.x;
  for (let colIndex = 0; colIndex < opts.columns.length; colIndex += 1) {
    const column = opts.columns[colIndex] as ViewColumn;
    const width = widths[colIndex] ?? 0;
    const cell = opts.getCell(rowIndex, colIndex);
    const baseBg = canvasRowBackground(opts, rowIndex, cls);
    const conditional = resolveCanvasConditional(opts, column, colIndex, cell, baseBg);
    const bg = conditional.background ?? baseBg;
    paintCellBox(opts.ctx, x, y, width, metrics.rowHeight, bg, opts.tokens.color.border);
    if (conditional.bar) paintDataBar(opts, x, y, width, metrics.rowHeight, conditional.bar);
    const indent = opts.cellIndent?.(rowIndex, colIndex) ?? 0;
    const text = conditional.showValue === false ? '' : formatDisplayValue(cell.value, column);
    const color = negativeTextColor(cell.value, column, conditional.color ?? opts.tokens.color.text);
    const weight = conditional.weight ?? (cls === 'normal' ? opts.tokens.font.weight.normal : opts.tokens.font.weight.bold);
    paintCellValueWithIcon(opts, {
      x,
      y,
      width,
      height: metrics.rowHeight,
      text,
      align: column.align,
      color,
      weight,
      paddingX: metrics.paddingX + indent,
      icon: conditional.icon,
      iconColor: conditional.iconColor,
      iconPosition: conditional.iconPosition,
    });
    x += width;
  }
}

function paintFooterCanvas(
  opts: CanvasTableOptions,
  widths: readonly number[],
  y: number,
  metrics: ReturnType<typeof densityMetrics>,
): void {
  let x = opts.rect.x;
  for (let colIndex = 0; colIndex < opts.columns.length; colIndex += 1) {
    const column = opts.columns[colIndex] as ViewColumn;
    const width = widths[colIndex] ?? 0;
    const cell = opts.footerRow?.cells[colIndex] ?? { value: null, raw: null };
    paintCellBox(opts.ctx, x, y, width, metrics.rowHeight, opts.tokens.color.surface, opts.tokens.color.border, true);
    paintCellText(opts, {
      x,
      y,
      width,
      height: metrics.rowHeight,
      text: cell.label ? String(cell.value ?? '') : formatDisplayValue(cell.value, column),
      align: column.align,
      color: negativeTextColor(cell.value, column, opts.tokens.color.text),
      weight: opts.tokens.font.weight.bold,
      paddingX: metrics.paddingX,
    });
    x += width;
  }
}

function paintClippedCueCanvas(
  opts: CanvasTableOptions,
  y: number,
  metrics: ReturnType<typeof densityMetrics>,
  remaining: number,
): void {
  paintCellBox(opts.ctx, opts.rect.x, y, opts.rect.width, metrics.rowHeight, opts.tokens.color.background, opts.tokens.color.border);
  paintCellText(opts, {
    x: opts.rect.x,
    y,
    width: opts.rect.width,
    height: metrics.rowHeight,
    text: `…${remaining} more`,
    align: 'center',
    color: opts.tokens.color.textMuted,
    weight: opts.tokens.font.weight.medium,
    paddingX: metrics.paddingX,
  });
}

function paintCellBox(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  background: string,
  border: string,
  topBorder = false,
): void {
  ctx.save();
  ctx.fillStyle = background;
  ctx.fillRect(x, y, width, height);
  ctx.strokeStyle = border;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x + width, y);
  ctx.lineTo(x + width, y + height);
  ctx.moveTo(x, y + height);
  ctx.lineTo(x + width, y + height);
  if (topBorder) {
    ctx.moveTo(x, y);
    ctx.lineTo(x + width, y);
  }
  ctx.stroke();
  ctx.restore();
}

function paintCellValueWithIcon(
  opts: CanvasTableOptions,
  input: {
    x: number;
    y: number;
    width: number;
    height: number;
    text: string;
    align: 'left' | 'center' | 'right';
    color: string;
    weight: number | string;
    paddingX: number;
    icon?: string;
    iconColor?: string;
    iconPosition?: 'left' | 'right';
  },
): void {
  const font = fontString(opts.tokens.font.size.small, opts.tokens.font.family, input.weight);
  const gap = input.icon ? 6 : 0;
  const iconFont = fontString(opts.tokens.font.size.small, opts.tokens.font.family, opts.tokens.font.weight.bold);
  const iconW = input.icon ? measureText(input.icon, iconFont).width : 0;
  const textMax = Math.max(0, input.width - input.paddingX * 2 - iconW - gap);
  const text = ellipsize(input.text, textMax, font);
  const textW = measureText(text, font).width;
  const groupW = textW + iconW + gap;
  let start = input.x + input.paddingX;
  if (input.align === 'right') start = input.x + input.width - input.paddingX - groupW;
  else if (input.align === 'center') start = input.x + (input.width - groupW) / 2;
  const midY = input.y + input.height / 2;
  const iconFirst = input.icon && input.iconPosition !== 'right';
  const iconX = iconFirst ? start : start + textW + gap;
  const textX = iconFirst ? start + iconW + gap : start;

  if (input.icon) {
    paintCanvasText(opts.ctx, {
      x: iconX,
      y: midY,
      text: input.icon,
      font: iconFont,
      color: input.iconColor ?? input.color,
      size: opts.tokens.font.size.small,
      baseline: 'middle',
    });
  }
  paintRawCellText(opts, textX, midY, text, font, input.color, opts.tokens.font.size.small);
}

function paintCellText(
  opts: CanvasTableOptions,
  input: {
    x: number;
    y: number;
    width: number;
    height: number;
    text: string;
    align: 'left' | 'center' | 'right';
    color: string;
    weight: number | string;
    paddingX: number;
  },
): void {
  const font = fontString(opts.tokens.font.size.small, opts.tokens.font.family, input.weight);
  const maxWidth = Math.max(0, input.width - input.paddingX * 2);
  const text = ellipsize(input.text, maxWidth, font);
  const x =
    input.align === 'right'
      ? input.x + input.width - input.paddingX
      : input.align === 'center'
        ? input.x + input.width / 2
        : input.x + input.paddingX;
  paintRawCellText(opts, x, input.y + input.height / 2, text, font, input.color, opts.tokens.font.size.small, input.align);
}

function paintRawCellText(
  opts: CanvasTableOptions,
  x: number,
  y: number,
  text: string,
  font: string,
  color: string,
  size: number,
  align: CanvasTextAlign = 'left',
): void {
  if (!text) return;
  paintCanvasText(opts.ctx, {
    x,
    y,
    text,
    font,
    color,
    size,
    align,
    baseline: 'middle',
  });
}

function ellipsize(text: string, maxWidth: number, font: string): string {
  if (maxWidth <= 0 || text.length === 0) return '';
  if (measureText(text, font).width <= maxWidth) return text;
  const ellipsis = '…';
  const ellipsisW = measureText(ellipsis, font).width;
  if (ellipsisW > maxWidth) return '';
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (measureText(text.slice(0, mid) + ellipsis, font).width <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return text.slice(0, lo) + ellipsis;
}

interface CanvasConditional {
  background?: string;
  color?: string;
  weight?: number | string;
  icon?: string;
  iconColor?: string;
  iconPosition?: 'left' | 'right';
  showValue?: boolean;
  bar?: { leftRatio: number; widthRatio: number; color: string };
}

function resolveCanvasConditional(
  opts: CanvasTableOptions,
  column: ViewColumn,
  colIndex: number,
  cell: { value: unknown; raw: number | null },
  rowBg: string,
): CanvasConditional {
  const cf = column.conditionalFormat;
  const raw = cell.raw;
  const domain = opts.conditionalDomains?.[colIndex] ?? null;
  if (!cf) return {};
  if ((cf.type === 'colorScale' || cf.type === 'bar' || cf.type === 'icon') && (raw == null || !Number.isFinite(raw))) {
    return {};
  }
  const numeric = raw as number;

  if (cf.type === 'colorScale') {
    if (!domain) return {};
    const midpoint = cf.midpoint ?? (domain[0] + domain[1]) / 2;
    const scale =
      cf.diverging === true || cf.midpoint !== undefined
        ? divergingColorScale({ domain: [domain[0], midpoint, domain[1]], interpolator: divergingInterpolator(cf.scheme ?? 'redblue') })
        : sequentialColorScale({ domain, interpolator: sequential(cf.scheme ?? 'blues') });
    const color = scale.map(numeric);
    if (cf.target === 'text') return { color: rgbaToCss(color) };
    return { background: rgbaToCss(color), color: rgbaToCss(readableTextColor(color)) };
  }

  if (cf.type === 'rules') {
    const style = evalRules(raw, cf.rules);
    return {
      background: style.background,
      color: style.color,
      weight: style.weight === 'bold' ? opts.tokens.font.weight.bold : style.weight === 'normal' ? opts.tokens.font.weight.normal : undefined,
      icon: style.icon,
      iconColor: style.color,
      iconPosition: 'left',
    };
  }

  if (cf.type === 'icon') {
    const semantic = iconForValue(cf.set, numeric, domain, cf.rules);
    if (!semantic) return {};
    return {
      icon: semantic.icon,
      iconColor: toneColor(semantic.tone, { up: opts.tokens.color.positive, mid: '#d97706', down: opts.tokens.color.negative }),
      iconPosition: cf.position ?? 'left',
    };
  }

  if (!domain) return {};
  const diverging = cf.negativeColor !== undefined || cf.baseline === 'zero';
  const baseline = diverging ? normalized(0, domain) : 0;
  const value = normalized(numeric, domain);
  const leftRatio = diverging ? Math.min(baseline, value) : 0;
  const widthRatio = diverging ? Math.abs(value - baseline) : value;
  const positive = numeric >= 0;
  const color = alphaColor(positive ? cf.color ?? opts.tokens.color.accent : cf.negativeColor ?? opts.tokens.color.negative, 0.85);
  return { background: rowBg, showValue: cf.showValue !== false, bar: { leftRatio, widthRatio, color } };
}

function paintDataBar(
  opts: CanvasTableOptions,
  x: number,
  y: number,
  width: number,
  height: number,
  bar: { leftRatio: number; widthRatio: number; color: string },
): void {
  const left = x + 4 + bar.leftRatio * Math.max(0, width - 8);
  const barW = bar.widthRatio * Math.max(0, width - 8);
  opts.ctx.save();
  opts.ctx.globalAlpha *= 0.9;
  opts.ctx.beginPath();
  roundedRect(opts.ctx, left, y + 5, barW, Math.max(0, height - 10), Math.max(2, opts.tokens.radius.sm - 1));
  opts.ctx.fillStyle = bar.color;
  opts.ctx.fill();
  opts.ctx.restore();
}

function canvasRowBackground(opts: CanvasTableOptions, rowIndex: number, cls: 'normal' | 'subtotal' | 'grandtotal'): string {
  if (cls !== 'normal') return opts.tokens.color.surface;
  if (opts.striped === true && rowIndex % 2 === 1) return subtleStripe(opts.tokens);
  return opts.tokens.color.background;
}

function negativeTextColor(value: unknown, column: Pick<ViewColumn, 'negativeStyle'>, fallback: string): string {
  const raw = typeof value === 'number' ? value : Number(value);
  if (Number.isFinite(raw) && raw < 0 && (column.negativeStyle === 'red' || column.negativeStyle === 'parens-red')) {
    return '#dc2626';
  }
  return fallback;
}

function applyStickyColumn(
  cell: HTMLTableCellElement,
  opts: BuildTableOptions,
  colIndex: number | undefined,
  isHeader: boolean,
): void {
  if (colIndex == null || colIndex >= (opts.rowHeaderSpan ?? 0)) return;
  cell.style.position = 'sticky';
  cell.style.left = `${leftOffset(opts, colIndex)}px`;
  cell.style.zIndex = isHeader ? '6' : '3';
}

function rowBackground(opts: BuildTableOptions, rowIndex: number, cls: 'normal' | 'subtotal' | 'grandtotal'): string {
  if (cls !== 'normal') return opts.tokens.color.surface;
  if (opts.striped === true && rowIndex % 2 === 1) return subtleStripe(opts.tokens);
  return opts.tokens.color.background;
}

function subtleStripe(tokens: ThemeTokens): string {
  const c = parseColor(tokens.color.surface);
  if (!c) return tokens.color.surface;
  return rgbaToCss({ ...c, a: tokens.dark ? 0.34 : 0.55 });
}

function alphaColor(input: string, alpha: number): string {
  const c = parseColor(input);
  if (!c) return input;
  return rgbaToCss({ ...c, a: Math.min(c.a, alpha) });
}

function normalized(value: number, domain: [number, number]): number {
  const [min, max] = domain;
  if (max === min) return 1;
  const t = (value - min) / (max - min);
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

function defaultColumnWidth(column: ViewColumn): number {
  if (column.width) return column.width;
  if (column.isMeasure || column.align === 'right') return 112;
  if (column.type === 'temporal') return 132;
  return 148;
}

function leftOffset(opts: BuildTableOptions, colIndex: number): number {
  const widths = opts.widths ?? opts.columns.map((column) => column.width ?? defaultColumnWidth(column));
  let left = 0;
  for (let i = 0; i < colIndex; i += 1) left += widths[i] ?? 0;
  return left;
}

function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.floor(value)));
}

function setStyles(styleable: HTMLElement, styles: Record<string, string>): void {
  for (const [key, value] of Object.entries(styles)) {
    styleable.style.setProperty(kebab(key), value);
  }
}

function kebab(key: string): string {
  return key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
}
