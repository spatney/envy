import { drawTitleBlock } from './chrome';
import {
  buildTable,
  resolveConditionalDomain,
  type HeaderCell,
  type ViewColumn,
} from './tableView';
import { pivot, type PivotFlatRow, type PivotHeaderNode } from '../pivot';
import type { Surface } from '../render/surface';
import type { ChartSpec, MatrixSpec } from '../spec/types';
import type { ThemeTokens } from '../theme';
import type { Size } from '../types';

const PATH_SEPARATOR = '\u0000';

export function drawMatrix(surface: Surface, spec: ChartSpec, tokens: ThemeTokens, size: Size): void {
  if (spec.type !== 'matrix') return;
  renderMatrix(surface, spec, tokens, size);
}

function renderMatrix(surface: Surface, spec: MatrixSpec, tokens: ThemeTokens, size: Size): void {
  const rect = drawTitleBlock(surface, tokens, size, spec.title);
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

  const leafValueColumns = flattenLeafValueColumns(result.columnLeaves, spec);
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
        format: valueDef.format,
        width: 118,
        conditionalFormat: valueDef.conditionalFormat,
        isMeasure: true,
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
        .filter((row) => row.isSubtotal !== true && row.isGrandTotal !== true)
        .map((row) => row.cellsByColumnKey.get(colKey)?.values[valueIndex] ?? null),
    );
  });

  const host = document.createElement('div');
  surface.overlay.appendChild(host);
  buildTable({
    container: host,
    tokens,
    rect,
    columns,
    rowCount: result.rows.length,
    getCell(rowIndex, colIndex) {
      const row = result.rows[rowIndex];
      if (colIndex === 0) return { value: rowLabel(row), raw: null };
      const { leaf, valueIndex } = leafValueColumns[colIndex - 1];
      const value = row.cellsByColumnKey.get(leaf.path.join(PATH_SEPARATOR))?.values[valueIndex] ?? null;
      return { value, raw: value };
    },
    rowClass(rowIndex) {
      const row = result.rows[rowIndex];
      return row.isGrandTotal === true ? 'grandtotal' : row.isSubtotal === true ? 'subtotal' : 'normal';
    },
    cellIndent(rowIndex, colIndex) {
      return colIndex === 0 ? result.rows[rowIndex].depth * 16 : 0;
    },
    rowHeaderSpan: 1,
    stickyHeader: true,
    striped: false,
    conditionalDomains: bodyDomains,
    headerRows: buildMatrixHeaderRows(result.columnTree, result.columnLeaves, spec),
  });
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

function buildMatrixHeaderRows(
  columnTree: readonly PivotHeaderNode[],
  columnLeaves: readonly PivotHeaderNode[],
  spec: MatrixSpec,
): HeaderCell[][] {
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

