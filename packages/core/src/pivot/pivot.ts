import type { Datum } from '../types';

export type AggOp = 'sum' | 'mean' | 'avg' | 'min' | 'max' | 'count' | 'countDistinct' | 'median' | 'first' | 'last';

export interface PivotValueDef {
  field: string;
  op: AggOp;
  label?: string;
}

export interface PivotOptions {
  rows?: string[];
  columns?: string[];
  values: PivotValueDef[];
  includeRowSubtotals?: boolean;
  includeColumnSubtotals?: boolean;
  includeGrandTotals?: boolean;
  sort?: 'asc' | 'desc' | 'none';
}

export interface PivotHeaderNode {
  key: string;
  path: string[];
  depth: number;
  children: PivotHeaderNode[];
  isSubtotal?: boolean;
  isGrandTotal?: boolean;
  span: number;
}

export interface PivotCell {
  values: (number | null)[];
}

export interface PivotFlatRow {
  path: string[];
  depth: number;
  isSubtotal?: boolean;
  isGrandTotal?: boolean;
  label: string;
  cellsByColumnKey: Map<string, PivotCell>;
}

export interface PivotResult {
  rowTree: PivotHeaderNode[];
  columnTree: PivotHeaderNode[];
  columnLeaves: PivotHeaderNode[];
  rows: PivotFlatRow[];
  values: PivotValueDef[];
  valueAt(rowPath: string[], colPath: string[], valueIndex: number): number | null;
}

export type GroupedMap<T> = Map<string, GroupedMap<T> | T[]>;

const GRAND_TOTAL_LABEL = 'Grand Total';
const SUBTOTAL_LABEL = 'Total';
const PATH_SEPARATOR = '\u0000';

export function aggregateValues(values: unknown[], op: AggOp): number | null {
  if (op === 'count') {
    return values.filter((value) => value !== null && value !== undefined).length;
  }

  if (values.length === 0) {
    return null;
  }

  if (op === 'countDistinct') {
    return new Set(values).size;
  }

  if (op === 'first') {
    return coerceFinite(values.find((value) => value !== null && value !== undefined));
  }

  if (op === 'last') {
    for (let index = values.length - 1; index >= 0; index -= 1) {
      const value = values[index];
      if (value !== null && value !== undefined) {
        return coerceFinite(value);
      }
    }
    return null;
  }

  const numbers = values.map(coerceFinite).filter((value): value is number => value !== null);
  if (numbers.length === 0) {
    return null;
  }

  switch (op) {
    case 'sum':
      return numbers.reduce((sum, value) => sum + value, 0);
    case 'mean':
    case 'avg':
      return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
    case 'min':
      return Math.min(...numbers);
    case 'max':
      return Math.max(...numbers);
    case 'median': {
      const sorted = [...numbers].sort((left, right) => left - right);
      const middle = Math.floor(sorted.length / 2);
      return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
    }
  }

  return null;
}

export function groupBy<T extends Record<string, unknown>>(rows: T[], keyFields: string[]): GroupedMap<T> {
  const grouped: GroupedMap<T> = new Map();

  for (const row of rows) {
    let current = grouped;
    for (let depth = 0; depth < keyFields.length; depth += 1) {
      const key = stringifyGroupKey(row[keyFields[depth]]);
      const isLeaf = depth === keyFields.length - 1;
      const existing = current.get(key);

      if (isLeaf) {
        if (Array.isArray(existing)) {
          existing.push(row);
        } else {
          current.set(key, [row]);
        }
      } else {
        if (existing instanceof Map) {
          current = existing;
        } else {
          const next: GroupedMap<T> = new Map();
          current.set(key, next);
          current = next;
        }
      }
    }
  }

  return grouped;
}

export function pivot(data: Datum[], options: PivotOptions): PivotResult {
  const rowFields = options.rows ?? [];
  const columnFields = options.columns ?? [];
  const sort = options.sort ?? 'asc';

  const rowTree = buildHeaderTree(data, rowFields, {
    includeSubtotals: options.includeRowSubtotals === true,
    includeGrandTotal: options.includeGrandTotals === true,
    sort,
  });
  const columnTree = buildHeaderTree(data, columnFields, {
    includeSubtotals: options.includeColumnSubtotals === true,
    includeGrandTotal: columnFields.length === 0 || options.includeGrandTotals === true,
    sort,
  });
  const columnLeaves = flattenColumnLeaves(columnTree);
  const flatRows = buildFlatRows(data, rowFields, columnLeaves, options, sort);

  const valueAt = (rowPath: string[], colPath: string[], valueIndex: number): number | null => {
    const valueDef = options.values[valueIndex];
    if (valueDef === undefined) {
      return null;
    }
    return aggregateMatching(data, rowFields, rowPath, columnFields, colPath, valueDef);
  };

  return {
    rowTree,
    columnTree,
    columnLeaves,
    rows: flatRows,
    values: options.values,
    valueAt,
  };
}

function buildFlatRows(
  data: Datum[],
  rowFields: string[],
  columnLeaves: PivotHeaderNode[],
  options: PivotOptions,
  sort: 'asc' | 'desc' | 'none',
): PivotFlatRow[] {
  if (rowFields.length === 0) {
    return [makeFlatRow(data, [], 0, true, false, columnLeaves, options)];
  }

  const rows: PivotFlatRow[] = [];
  appendFlatRows(rows, data, rowFields, [], 0, columnLeaves, options, sort);

  if (options.includeGrandTotals === true) {
    rows.push(makeFlatRow(data, [], 0, true, false, columnLeaves, options));
  }

  return rows;
}

function appendFlatRows(
  out: PivotFlatRow[],
  data: Datum[],
  fields: string[],
  path: string[],
  depth: number,
  columnLeaves: PivotHeaderNode[],
  options: PivotOptions,
  sort: 'asc' | 'desc' | 'none',
): void {
  const field = fields[depth];
  const groups = groupRowsAtDepth(data, field, sort);

  for (const [key, groupRows] of groups) {
    const nextPath = [...path, key];
    if (depth === fields.length - 1) {
      out.push(makeFlatRow(groupRows, nextPath, depth, false, false, columnLeaves, options));
    } else {
      appendFlatRows(out, groupRows, fields, nextPath, depth + 1, columnLeaves, options, sort);
      if (options.includeRowSubtotals === true) {
        out.push(makeFlatRow(groupRows, nextPath, depth, false, true, columnLeaves, options));
      }
    }
  }
}

function makeFlatRow(
  rowData: Datum[],
  path: string[],
  depth: number,
  isGrandTotal: boolean,
  isSubtotal: boolean,
  columnLeaves: PivotHeaderNode[],
  options: PivotOptions,
): PivotFlatRow {
  const cellsByColumnKey = new Map<string, PivotCell>();
  const columnFields = options.columns ?? [];

  for (const columnLeaf of columnLeaves) {
    const columnKey = makePathKey(columnLeaf.path);
    cellsByColumnKey.set(columnKey, {
      values: options.values.map((valueDef) => aggregateMatching(rowData, [], [], columnFields, columnLeaf.path, valueDef)),
    });
  }

  return {
    path,
    depth,
    isGrandTotal: isGrandTotal || undefined,
    isSubtotal: isSubtotal || undefined,
    label: isGrandTotal ? GRAND_TOTAL_LABEL : isSubtotal ? SUBTOTAL_LABEL : path[path.length - 1] ?? GRAND_TOTAL_LABEL,
    cellsByColumnKey,
  };
}

function buildHeaderTree(
  data: Datum[],
  fields: string[],
  options: {
    includeSubtotals: boolean;
    includeGrandTotal: boolean;
    sort: 'asc' | 'desc' | 'none';
  },
): PivotHeaderNode[] {
  const roots = fields.length === 0 ? [] : buildHeaderLevel(data, fields, [], 0, options);

  if (fields.length === 0 || options.includeGrandTotal) {
    roots.push({
      key: GRAND_TOTAL_LABEL,
      path: [],
      depth: 0,
      children: [],
      isGrandTotal: true,
      span: 1,
    });
  }

  return roots;
}

function buildHeaderLevel(
  data: Datum[],
  fields: string[],
  path: string[],
  depth: number,
  options: {
    includeSubtotals: boolean;
    includeGrandTotal: boolean;
    sort: 'asc' | 'desc' | 'none';
  },
): PivotHeaderNode[] {
  const field = fields[depth];
  const groups = groupRowsAtDepth(data, field, options.sort);
  const nodes: PivotHeaderNode[] = [];

  for (const [key, groupRows] of groups) {
    const nextPath = [...path, key];
    const children = depth === fields.length - 1 ? [] : buildHeaderLevel(groupRows, fields, nextPath, depth + 1, options);

    if (children.length > 0 && options.includeSubtotals) {
      children.push({
        key: SUBTOTAL_LABEL,
        path: nextPath,
        depth: depth + 1,
        children: [],
        isSubtotal: true,
        span: 1,
      });
    }

    const span = children.length === 0 ? 1 : children.reduce((sum, child) => sum + child.span, 0);
    nodes.push({
      key,
      path: nextPath,
      depth,
      children,
      span,
    });
  }

  return nodes;
}

function flattenColumnLeaves(nodes: PivotHeaderNode[]): PivotHeaderNode[] {
  const leaves: PivotHeaderNode[] = [];
  for (const node of nodes) {
    if (node.children.length === 0) {
      leaves.push(node);
    } else {
      leaves.push(...flattenColumnLeaves(node.children));
    }
  }
  return leaves;
}

function aggregateMatching(
  data: Datum[],
  rowFields: string[],
  rowPath: string[],
  columnFields: string[],
  columnPath: string[],
  valueDef: PivotValueDef,
): number | null {
  const matching = data.filter(
    (row) => pathMatches(row, rowFields, rowPath) && pathMatches(row, columnFields, columnPath),
  );
  return aggregateValues(
    matching.map((row) => row[valueDef.field]),
    valueDef.op,
  );
}

function pathMatches(row: Datum, fields: string[], path: string[]): boolean {
  if (path.length === 0) {
    return true;
  }

  return path.every((key, index) => stringifyGroupKey(row[fields[index]]) === key);
}

function groupRowsAtDepth(data: Datum[], field: string, sort: 'asc' | 'desc' | 'none'): Map<string, Datum[]> {
  const grouped = new Map<string, Datum[]>();

  for (const row of data) {
    const key = stringifyGroupKey(row[field]);
    const rows = grouped.get(key);
    if (rows === undefined) {
      grouped.set(key, [row]);
    } else {
      rows.push(row);
    }
  }

  if (sort === 'none') {
    return grouped;
  }

  return new Map(
    [...grouped.entries()].sort(([left], [right]) => {
      if (left === right) {
        return 0;
      }
      const direction = sort === 'asc' ? 1 : -1;
      return left < right ? -direction : direction;
    }),
  );
}

function stringifyGroupKey(value: unknown): string {
  if (value instanceof Date) {
    const time = value.getTime();
    return Number.isFinite(time) ? value.toISOString() : 'Invalid Date';
  }

  if (value === null) {
    return 'null';
  }

  if (value === undefined) {
    return 'undefined';
  }

  if (typeof value === 'number') {
    return Object.is(value, -0) ? '0' : String(value);
  }

  if (typeof value === 'string' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }

  return stableStringify(value);
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }

  if (typeof value === 'object' && value !== null) {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`)
      .join(',')}}`;
  }

  return String(value);
}

function coerceFinite(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function makePathKey(path: string[]): string {
  return path.join(PATH_SEPARATOR);
}
