import { drawTitleBlock } from './chrome';
import {
  buildTable,
  createSketchGridCanvas,
  paintSketchGridOverlay,
  paintTableCanvas,
  resolveConditionalDomain,
  type BuildTableOptions,
  type HeaderCell,
  type ViewColumn,
} from './tableView';
import { pivot, type PivotFlatRow, type PivotHeaderNode } from '../pivot';
import { resolveSketch } from '../spec/sketch';
import type { Surface } from '../render/surface';
import type { ChartSpec, MatrixSpec } from '../spec/types';
import type { ThemeTokens } from '../theme';
import type { Size } from '../types';

const PATH_SEPARATOR = '\u0000';

export function drawMatrix(surface: Surface, spec: ChartSpec, tokens: ThemeTokens, size: Size): void {
  if (spec.type !== 'matrix') return;
  if (surface.headless) {
    drawMatrixCanvas(surface, spec, tokens, size);
    return;
  }
  renderMatrix(surface, spec, tokens, size);
}

function drawMatrixCanvas(surface: Surface, spec: MatrixSpec, tokens: ThemeTokens, size: Size): void {
  const rect = drawTitleBlock(surface, tokens, size, spec.title);
  const prepared = prepareMatrix(spec);
  paintTableCanvas({
    ctx: surface.marks.ctx,
    tokens,
    rect,
    columns: prepared.columns,
    rowCount: prepared.rows.length,
    getCell(rowIndex, colIndex) {
      const row = prepared.rows[rowIndex];
      if (colIndex === 0) return { value: rowLabel(row), raw: null };
      const { leaf, valueIndex } = prepared.leafValueColumns[colIndex - 1];
      const value = row.cellsByColumnKey.get(leaf.path.join(PATH_SEPARATOR))?.values[valueIndex] ?? null;
      const display = displayMatrixValue(value, rowIndex, colIndex - 1, prepared.denominators, spec);
      return { value: display, raw: display };
    },
    rowClass(rowIndex) {
      const row = prepared.rows[rowIndex];
      return row.isGrandTotal === true ? 'grandtotal' : row.isSubtotal === true ? 'subtotal' : 'normal';
    },
    cellIndent(rowIndex, colIndex) {
      return colIndex === 0 ? prepared.rows[rowIndex].depth * 16 : 0;
    },
    rowHeaderSpan: 1,
    striped: false,
    conditionalDomains: prepared.bodyDomains,
    headerRows: prepared.headerRows,
    density: spec.density,
    sketch: resolveSketch(spec),
  });
}

function renderMatrix(surface: Surface, spec: MatrixSpec, tokens: ThemeTokens, size: Size): void {
  const rect = drawTitleBlock(surface, tokens, size, spec.title);
  const prepared = prepareMatrix(spec);
  const sketch = resolveSketch(spec);
  const host = document.createElement('div');
  surface.overlay.appendChild(host);
  const buildOpts: BuildTableOptions = {
    container: host,
    tokens,
    rect,
    columns: prepared.columns,
    rowCount: prepared.rows.length,
    getCell(rowIndex, colIndex) {
      const row = prepared.rows[rowIndex];
      if (colIndex === 0) return { value: rowLabel(row), raw: null };
      const { leaf, valueIndex } = prepared.leafValueColumns[colIndex - 1];
      const value = row.cellsByColumnKey.get(leaf.path.join(PATH_SEPARATOR))?.values[valueIndex] ?? null;
      const display = displayMatrixValue(value, rowIndex, colIndex - 1, prepared.denominators, spec);
      return { value: display, raw: display };
    },
    rowClass(rowIndex) {
      const row = prepared.rows[rowIndex];
      return row.isGrandTotal === true ? 'grandtotal' : row.isSubtotal === true ? 'subtotal' : 'normal';
    },
    cellIndent(rowIndex, colIndex) {
      return colIndex === 0 ? prepared.rows[rowIndex].depth * 16 : 0;
    },
    rowHeaderSpan: 1,
    stickyHeader: true,
    striped: false,
    conditionalDomains: prepared.bodyDomains,
    headerRows: prepared.headerRows,
    density: spec.density,
    sketch,
  };
  buildTable(buildOpts);

  if (sketch) {
    const overlay = createSketchGridCanvas(rect);
    if (overlay.ctx) {
      surface.overlay.appendChild(overlay.canvas);
      const ctx = overlay.ctx;
      const draw = (): void => {
        paintSketchGridOverlay(ctx, {
          sketch,
          tokens,
          rect,
          dpr: overlay.dpr,
          columns: prepared.columns,
          widths: buildOpts.widths ?? [],
          rowCount: prepared.rows.length,
          headerRowCount: prepared.headerRows.length,
          hasFooter: false,
          rowHeaderSpan: 1,
          density: spec.density,
          scrollLeft: host.scrollLeft || 0,
          scrollTop: host.scrollTop || 0,
        });
      };
      draw();
      let frame = 0;
      host.addEventListener('scroll', () => {
        if (frame !== 0) return;
        frame =
          typeof requestAnimationFrame === 'function'
            ? requestAnimationFrame(() => {
                frame = 0;
                draw();
              })
            : window.setTimeout(() => {
                frame = 0;
                draw();
              }, 16);
      });
    }
  }
}

function prepareMatrix(spec: MatrixSpec): {
  rows: PivotFlatRow[];
  columns: ViewColumn[];
  leafValueColumns: Array<{ leaf: PivotHeaderNode; valueIndex: number }>;
  denominators: ShowAsDenominators;
  bodyDomains: Array<[number, number] | null>;
  headerRows: HeaderCell[][];
} {
  const data = spec.data ?? [];
  const result = pivot(data, {
    rows: spec.rows,
    columns: spec.columns ?? [],
    values: spec.values.map((value) => ({ field: value.field, op: value.op, label: value.label })),
    includeRowSubtotals: spec.subtotals === true,
    includeColumnSubtotals: spec.subtotals === true,
    includeGrandTotals: spec.grandTotals === true,
    sort: 'asc',
  });

  const sortedLeaves = sortColumnLeaves(result.columnLeaves, result.rows, spec);
  const denominators = computeShowAsDenominators(result.rows, sortedLeaves, spec);
  const leafValueColumns = flattenLeafValueColumns(sortedLeaves, spec);
  const columns: ViewColumn[] = [
    {
      key: '__row__',
      title: spec.rows.join(' / ') || 'Rows',
      align: 'left',
      type: 'nominal',
      width: Math.max(180, Math.min(280, 120 + spec.rows.length * 34)),
    },
    ...leafValueColumns.map(({ leaf, valueIndex }) => {
      const valueDef = spec.values[valueIndex];
      const title = spec.values.length > 1 ? valueDef.label ?? valueDef.field : leaf.key;
      return {
        key: `${leaf.path.join(PATH_SEPARATOR)}:${valueIndex}`,
        title,
        align: 'right' as const,
        type: 'quantitative' as const,
        format: valueDef.showAs && valueDef.showAs !== 'value' ? '.1%' : valueDef.format,
        width: 118,
        conditionalFormat: valueDef.conditionalFormat,
        isMeasure: true,
        prefix: valueDef.showAs && valueDef.showAs !== 'value' ? undefined : valueDef.prefix,
        suffix: valueDef.showAs && valueDef.showAs !== 'value' ? undefined : valueDef.suffix,
        negativeStyle: valueDef.negativeStyle,
      };
    }),
  ];

  const bodyDomains = columns.map((column, colIndex) => {
    if (colIndex === 0) return null;
    const { leaf, valueIndex } = leafValueColumns[colIndex - 1];
    const colKey = leaf.path.join(PATH_SEPARATOR);
    return resolveConditionalDomain(
      column.conditionalFormat,
      result.rows
        .map((row, rowIndex) =>
          row.isSubtotal === true || row.isGrandTotal === true
            ? null
            : displayMatrixValue(row.cellsByColumnKey.get(colKey)?.values[valueIndex] ?? null, rowIndex, colIndex - 1, denominators, spec),
        ),
    );
  });
  return {
    rows: result.rows,
    columns,
    leafValueColumns,
    denominators,
    bodyDomains,
    headerRows: buildMatrixHeaderRows(result.columnTree, sortedLeaves, spec, sortedLeaves !== result.columnLeaves),
  };
}

function rowLabel(row: PivotFlatRow): string {
  if (row.isGrandTotal === true) return row.label;
  if (row.isSubtotal === true) {
    const name = row.path[row.path.length - 1] ?? '';
    return name === '' ? row.label : `${name} ${row.label}`;
  }
  return row.label;
}

function flattenLeafValueColumns(
  columnLeaves: readonly PivotHeaderNode[],
  spec: MatrixSpec,
): Array<{ leaf: PivotHeaderNode; valueIndex: number }> {
  const out: Array<{ leaf: PivotHeaderNode; valueIndex: number }> = [];
  for (const leaf of columnLeaves) {
    spec.values.forEach((_value, valueIndex) => out.push({ leaf, valueIndex }));
  }
  return out;
}

interface ShowAsDenominators {
  rowTotals: number[][];
  columnTotals: number[][];
  grandTotals: number[];
}

export function computeShowAsValue(
  value: number | null,
  showAs: NonNullable<MatrixSpec['values'][number]['showAs']> | undefined,
  denominator: number,
): number | null {
  if (value == null) return null;
  if (!showAs || showAs === 'value') return value;
  return denominator === 0 ? null : value / denominator;
}

function computeShowAsDenominators(
  rows: readonly PivotFlatRow[],
  leaves: readonly PivotHeaderNode[],
  spec: MatrixSpec,
): ShowAsDenominators {
  const valueCount = spec.values.length;
  const rowTotals = rows.map((row) => {
    const totals = Array.from({ length: valueCount }, () => 0);
    leaves.forEach((leaf) => {
      const cell = row.cellsByColumnKey.get(leaf.path.join(PATH_SEPARATOR));
      for (let i = 0; i < valueCount; i += 1) totals[i] += cell?.values[i] ?? 0;
    });
    return totals;
  });
  const columnTotals = leaves.map((leaf) => {
    const totals = Array.from({ length: valueCount }, () => 0);
    rows.forEach((row) => {
      if (row.isSubtotal || row.isGrandTotal) return;
      const cell = row.cellsByColumnKey.get(leaf.path.join(PATH_SEPARATOR));
      for (let i = 0; i < valueCount; i += 1) totals[i] += cell?.values[i] ?? 0;
    });
    return totals;
  });
  const grandTotals = Array.from({ length: valueCount }, (_, valueIndex) =>
    columnTotals.reduce((sum, totals) => sum + totals[valueIndex], 0),
  );
  return { rowTotals, columnTotals, grandTotals };
}

function displayMatrixValue(
  value: number | null,
  rowIndex: number,
  leafValueIndex: number,
  denominators: ShowAsDenominators,
  spec: MatrixSpec,
): number | null {
  const valueIndex = leafValueIndex % spec.values.length;
  const leafIndex = Math.floor(leafValueIndex / spec.values.length);
  const showAs = spec.values[valueIndex].showAs;
  if (!showAs || showAs === 'value') return value;
  const denominator =
    showAs === 'percentOfRow'
      ? denominators.rowTotals[rowIndex]?.[valueIndex] ?? 0
      : showAs === 'percentOfColumn'
        ? denominators.columnTotals[leafIndex]?.[valueIndex] ?? 0
        : denominators.grandTotals[valueIndex] ?? 0;
  return computeShowAsValue(value, showAs, denominator);
}

function sortColumnLeaves(
  leaves: readonly PivotHeaderNode[],
  rows: readonly PivotFlatRow[],
  spec: MatrixSpec,
): readonly PivotHeaderNode[] {
  const order = spec.columnSort?.order === 'desc' ? -1 : 1;
  if (!spec.columnSort) return leaves;
  const sorted = [...leaves];
  if (spec.columnSort.by === 'label') {
    return sorted.sort((left, right) => left.key.localeCompare(right.key, undefined, { numeric: true }) * order);
  }
  const valueIndex = spec.columnSort.valueIndex ?? 0;
  return sorted.sort((left, right) => {
    const leftTotal = columnTotal(rows, left, valueIndex);
    const rightTotal = columnTotal(rows, right, valueIndex);
    return (leftTotal === rightTotal ? left.key.localeCompare(right.key) : leftTotal - rightTotal) * order;
  });
}

function columnTotal(rows: readonly PivotFlatRow[], leaf: PivotHeaderNode, valueIndex: number): number {
  const key = leaf.path.join(PATH_SEPARATOR);
  return rows.reduce((sum, row) => {
    if (row.isSubtotal || row.isGrandTotal) return sum;
    return sum + (row.cellsByColumnKey.get(key)?.values[valueIndex] ?? 0);
  }, 0);
}

function buildMatrixHeaderRows(
  columnTree: readonly PivotHeaderNode[],
  columnLeaves: readonly PivotHeaderNode[],
  spec: MatrixSpec,
  flatLeaves = false,
): HeaderCell[][] {
  if (flatLeaves) return buildFlatMatrixHeaderRows(columnLeaves, spec);
  const groupRows = Math.max(1, maxDepth(columnTree) + 1);
  const showMeasureRow = spec.values.length > 1;
  const totalRows = groupRows + (showMeasureRow ? 1 : 0);
  const rows: HeaderCell[][] = Array.from({ length: totalRows }, () => []);
  rows[0].push({
    title: spec.rows.join(' / ') || 'Rows',
    rowSpan: totalRows,
    align: 'left',
    colIndex: 0,
  });

  for (const node of columnTree) appendHeaderNode(rows, node, 0, groupRows, spec.values.length);

  if (showMeasureRow) {
    for (let leafIndex = 0; leafIndex < columnLeaves.length; leafIndex += 1) {
      for (let valueIndex = 0; valueIndex < spec.values.length; valueIndex += 1) {
        rows[totalRows - 1].push({
          title: spec.values[valueIndex].label ?? spec.values[valueIndex].field,
          align: 'right',
          colIndex: 1 + leafIndex * spec.values.length + valueIndex,
        });
      }
    }
  }

  return rows;
}


function buildFlatMatrixHeaderRows(columnLeaves: readonly PivotHeaderNode[], spec: MatrixSpec): HeaderCell[][] {
  const showMeasureRow = spec.values.length > 1;
  const rows: HeaderCell[][] = [[], ...(showMeasureRow ? [[]] : [])];
  rows[0].push({
    title: spec.rows.join(' / ') || 'Rows',
    rowSpan: showMeasureRow ? 2 : 1,
    align: 'left',
    colIndex: 0,
  });
  columnLeaves.forEach((leaf, leafIndex) => {
    rows[0].push({
      title: leaf.path.join(' / ') || leaf.key,
      colSpan: spec.values.length,
      align: 'center',
      colIndex: showMeasureRow ? undefined : 1 + leafIndex,
    });
    if (showMeasureRow) {
      spec.values.forEach((value, valueIndex) =>
        rows[1].push({
          title: value.label ?? value.field,
          align: 'right',
          colIndex: 1 + leafIndex * spec.values.length + valueIndex,
        }),
      );
    }
  });
  return rows;
}

function appendHeaderNode(
  rows: HeaderCell[][],
  node: PivotHeaderNode,
  depth: number,
  groupRows: number,
  valueCount: number,
): void {
  const isLeaf = node.children.length === 0;
  rows[depth].push({
    title: node.key,
    colSpan: node.span * valueCount,
    rowSpan: isLeaf ? groupRows - depth : 1,
    align: 'center',
  });
  for (const child of node.children) appendHeaderNode(rows, child, depth + 1, groupRows, valueCount);
}

function maxDepth(nodes: readonly PivotHeaderNode[]): number {
  let depth = 0;
  for (const node of nodes) {
    depth = Math.max(depth, node.depth, maxDepth(node.children));
  }
  return depth;
}
