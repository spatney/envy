import { drawTitleBlock } from './chrome';
import { buildTable, paintTableCanvas, resolveConditionalDomain, type ViewColumn } from './tableView';
import { resolveSketch } from '../spec/sketch';
import type { Surface } from '../render/surface';
import type { ChartSpec, TableSpec } from '../spec/types';
import type { ThemeTokens } from '../theme';
import type { Datum, FieldType, Size } from '../types';
import { accessor, inferType, toNumber } from '../util/data';
import { aggregateValues } from '../pivot';

const ROW_HEIGHT = 30;
const BUFFER_ROWS = 8;

export function drawTable(surface: Surface, spec: ChartSpec, tokens: ThemeTokens, size: Size): void {
  if (spec.type !== 'table') return;
  if (surface.headless) {
    drawTableCanvas(surface, spec, tokens, size);
    return;
  }
  renderTable(surface, spec, tokens, size);
}

function drawTableCanvas(surface: Surface, spec: TableSpec, tokens: ThemeTokens, size: Size): void {
  const rect = drawTitleBlock(surface, tokens, size, spec.title);
  const data = spec.data ?? [];
  const columns = resolveColumns(data, spec);
  const read = columns.map((column) => accessor(column.key));
  const sortState = initialSortState(spec, columns);
  const sortedRows = sortRows(data, columns, read, sortState);
  const domains = columns.map((column, colIndex) =>
    resolveConditionalDomain(
      column.conditionalFormat,
      data.map((row) => numericRaw(read[colIndex](row))),
    ),
  );

  paintTableCanvas({
    ctx: surface.marks.ctx,
    tokens,
    rect,
    columns,
    rowCount: sortedRows.length,
    getCell(rowIndex, colIndex) {
      const value = read[colIndex](sortedRows[rowIndex]);
      return { value, raw: numericRaw(value) };
    },
    striped: spec.striped === true,
    conditionalDomains: domains,
    headerRows: buildTableHeaderRows(columns),
    footerRow: buildTotalsRow(sortedRows, columns, read, spec),
    density: spec.density,
    sketch: resolveSketch(spec) != null,
  });
}

function renderTable(surface: Surface, spec: TableSpec, tokens: ThemeTokens, size: Size): void {
  const rect = drawTitleBlock(surface, tokens, size, spec.title);
  const data = spec.data ?? [];
  const columns = resolveColumns(data, spec);
  const read = columns.map((column) => accessor(column.key));
  const sketch = resolveSketch(spec) != null;
  let sortState = initialSortState(spec, columns);
  let sortedRows = sortRows(data, columns, read, sortState);
  const domains = columns.map((column, colIndex) =>
    resolveConditionalDomain(
      column.conditionalFormat,
      data.map((row) => numericRaw(read[colIndex](row))),
    ),
  );

  const host = document.createElement('div');
  surface.overlay.appendChild(host);

  let frame = 0;
  const renderWindow = (): void => {
    const scrollTop = host.scrollTop || 0;
    const rowHeight = densityRowHeight(spec.density);
    const start = Math.max(0, Math.floor(scrollTop / rowHeight) - BUFFER_ROWS);
    const visible = Math.ceil(Math.max(rect.height, host.clientHeight || rect.height) / rowHeight) + BUFFER_ROWS * 2;
    const end = Math.min(sortedRows.length, start + visible);
    buildTable({
      container: host,
      tokens,
      rect,
      columns,
      rowCount: sortedRows.length,
      getCell(rowIndex, colIndex) {
        const value = read[colIndex](sortedRows[rowIndex]);
        return { value, raw: numericRaw(value) };
      },
      striped: spec.striped === true,
      stickyHeader: spec.stickyHeader !== false,
      onSort(colIndex) {
        sortState =
          sortState?.col === colIndex
            ? { col: colIndex, dir: sortState.dir === 'asc' ? 'desc' : 'asc' }
            : { col: colIndex, dir: 'asc' };
        sortedRows = sortRows(data, columns, read, sortState);
        host.scrollTop = 0;
        renderWindow();
      },
      sortState: sortState ?? undefined,
      conditionalDomains: domains,
      headerRows: buildTableHeaderRows(columns),
      footerRow: buildTotalsRow(sortedRows, columns, read, spec),
      density: spec.density,
      visibleRange: { start, end, rowHeight },
      sketch,
    });
  };

  host.addEventListener('scroll', () => {
    if (frame !== 0) return;
    frame = requestFrame(() => {
      frame = 0;
      renderWindow();
    });
  });

  renderWindow();
}

function resolveColumns(data: readonly Datum[], spec: TableSpec): ViewColumn[] {
  const declared = spec.columns;
  const declaredVisible = declared?.filter((column) => column.hidden !== true);
  const fields = declaredVisible ? declaredVisible.map((column) => column.field) : Object.keys(data[0] ?? {});
  return fields.map((field, index) => {
    const declaredColumn = declaredVisible?.[index];
    const type = declaredColumn?.type ?? inferColumnType(data, field);
    const align = declaredColumn?.align ?? (type === 'quantitative' ? 'right' : 'left');
    return {
      key: field,
      title: declaredColumn?.title ?? field,
      type,
      align,
      format: declaredColumn?.format,
      width: declaredColumn?.width,
      conditionalFormat: declaredColumn?.conditionalFormat,
      isMeasure: type === 'quantitative',
      prefix: declaredColumn?.prefix,
      suffix: declaredColumn?.suffix,
      negativeStyle: declaredColumn?.negativeStyle,
      sortable: declaredColumn?.sortable,
      wrap: declaredColumn?.wrap,
      group: declaredColumn?.group,
    };
  });
}

function buildTableHeaderRows(columns: readonly ViewColumn[]) {
  if (!columns.some((column) => column.group)) return undefined;
  const groups = [];
  let index = 0;
  while (index < columns.length) {
    const group = columns[index].group ?? '';
    let span = 1;
    while (index + span < columns.length && (columns[index + span].group ?? '') === group) span += 1;
    groups.push({ title: group, colSpan: span, align: 'center' as const });
    index += span;
  }
  return [
    groups,
    columns.map((column, colIndex) => ({
      title: column.title,
      align: column.align,
      colIndex,
    })),
  ];
}

function buildTotalsRow(
  rows: readonly Datum[],
  columns: readonly ViewColumn[],
  read: readonly ((row: Datum) => unknown)[],
  spec: TableSpec,
) {
  if (!spec.totals) return undefined;
  const label = typeof spec.totals === 'object' ? spec.totals.label ?? 'Total' : 'Total';
  const labelIndex = Math.max(0, columns.findIndex((column) => !column.isMeasure));
  const declaredVisible = spec.columns?.filter((column) => column.hidden !== true);
  return {
    cells: columns.map((column, colIndex) => {
      if (colIndex === labelIndex) return { value: label, raw: null, label: true };
      const declared = declaredVisible?.find((entry) => entry.field === column.key);
      const op = declared?.total === false ? false : declared?.total ?? (column.isMeasure ? 'sum' : false);
      if (!op) return { value: null, raw: null };
      const value = aggregateValues(rows.map((row) => read[colIndex](row)), op);
      return { value, raw: value };
    }),
  };
}

function inferColumnType(data: readonly Datum[], field: string): FieldType {
  return data.length === 0 ? 'nominal' : inferType(data, field);
}

function initialSortState(spec: TableSpec, columns: readonly ViewColumn[]): { col: number; dir: 'asc' | 'desc' } | null {
  if (!spec.sort) return null;
  const col = columns.findIndex((column) => column.key === spec.sort?.field);
  return col === -1 ? null : { col, dir: spec.sort.order ?? 'asc' };
}

function sortRows(
  data: readonly Datum[],
  columns: readonly ViewColumn[],
  read: readonly ((row: Datum) => unknown)[],
  sortState: { col: number; dir: 'asc' | 'desc' } | null,
): Datum[] {
  if (!sortState) return [...data];
  const dir = sortState.dir === 'asc' ? 1 : -1;
  const column = columns[sortState.col];
  const get = read[sortState.col];
  return data
    .map((row, index) => ({ row, index }))
    .sort((left, right) => {
      const cmp = compareValues(get(left.row), get(right.row), column.type);
      return cmp === 0 ? left.index - right.index : cmp * dir;
    })
    .map((entry) => entry.row);
}

function compareValues(left: unknown, right: unknown, type?: FieldType): number {
  if (left == null && right == null) return 0;
  if (left == null) return 1;
  if (right == null) return -1;
  const ln = toNumber(left);
  const rn = toNumber(right);
  if (Number.isFinite(ln) && Number.isFinite(rn)) return ln === rn ? 0 : ln < rn ? -1 : 1;
  if (type === 'temporal' || left instanceof Date || right instanceof Date) {
    const lt = left instanceof Date ? left.getTime() : Date.parse(String(left));
    const rt = right instanceof Date ? right.getTime() : Date.parse(String(right));
    if (Number.isFinite(lt) && Number.isFinite(rt)) return lt === rt ? 0 : lt < rt ? -1 : 1;
  }
  return String(left).localeCompare(String(right), undefined, { numeric: true, sensitivity: 'base' });
}

function numericRaw(value: unknown): number | null {
  const n = toNumber(value);
  return Number.isFinite(n) ? n : null;
}

function densityRowHeight(density: TableSpec['density']): number {
  if (density === 'comfortable') return 36;
  if (density === 'compact') return 24;
  return ROW_HEIGHT;
}

function requestFrame(callback: () => void): number {
  return typeof requestAnimationFrame === 'function' ? requestAnimationFrame(callback) : window.setTimeout(callback, 16);
}
