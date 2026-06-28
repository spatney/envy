/**
 * Dumbbell / connected-dot model builder.
 *
 * The renderer owns chrome and pixel layout because dumbbells use a horizontal
 * quantitative axis plus vertical category bands. This builder stays pure: it
 * resolves tidy rows into category rows, group metadata, value extents, sorting,
 * formatting, and sketch settings.
 */

import type { ThemeTokens } from '../theme';
import type { DumbbellSpec } from '../spec/types';
import { accessor, toKey, toNumber, uniqueStrings, extent } from '../util/data';
import { ticks as numericTicks } from '../ticks';
import { formatNumber, formatValue } from '../format';
import { ordinalColorScale, rgbaToCss } from '../color';
import { resolveSketch, type ResolvedSketch } from '../spec/sketch';
import type { BuildOptions } from '../runtime/cartesian';

export interface DumbbellGroup {
  key: string;
  label: string;
  color: string;
  rawValue: unknown;
}

export interface DumbbellDot {
  groupKey: string;
  value: number;
  rawGroupValue: unknown;
  rawRow: Record<string, unknown>;
}

export interface DumbbellRow {
  catKey: string;
  catLabel: string;
  catRawValue: unknown;
  dots: DumbbellDot[];
  min: number;
  max: number;
  mean: number;
}

export interface DumbbellModel {
  spec: DumbbellSpec;
  tokens: ThemeTokens;
  categories: string[];
  groups: DumbbellGroup[];
  rows: DumbbellRow[];
  valueDomain: [number, number];
  format?: string;
  sketch: ResolvedSketch | null;
}

function labelFor(value: unknown): string {
  if (value == null) return '(blank)';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const label = String(value);
  return label === '' ? '(blank)' : label;
}

function formatTick(value: number, format?: string): string {
  return format ? formatValue(value, format) : formatNumber(value, ',');
}

export function formatDumbbellValue(value: number, format?: string): string {
  return formatTick(value, format);
}

function niceValueDomain(raw: [number, number] | null): [number, number] {
  let min = raw?.[0] ?? 0;
  let max = raw?.[1] ?? 1;
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1];
  if (min === max) {
    const pad = Math.abs(min) > 0 ? Math.abs(min) * 0.05 : 1;
    min -= pad;
    max += pad;
  }
  const tickValues = numericTicks(min, max, 6);
  return [Math.min(tickValues[0] ?? min, min), Math.max(tickValues[tickValues.length - 1] ?? max, max)];
}

function sortRows(rows: DumbbellRow[], groups: DumbbellGroup[], sort?: DumbbellSpec['sort']): DumbbellRow[] {
  const out = rows.slice();
  const primary = (row: DumbbellRow): number => {
    const firstGroup = groups[0]?.key;
    const first = firstGroup ? row.dots.find((dot) => dot.groupKey === firstGroup)?.value : undefined;
    return first ?? row.mean;
  };
  if (sort === 'ascending') out.sort((a, b) => primary(a) - primary(b));
  else if (sort === 'descending') out.sort((a, b) => primary(b) - primary(a));
  else if (sort === 'gap') out.sort((a, b) => b.max - b.min - (a.max - a.min));
  return out;
}

export function buildDumbbellModel(
  spec: DumbbellSpec,
  tokens: ThemeTokens,
  opts: BuildOptions,
): DumbbellModel {
  void opts;
  const data = (spec.data ?? []) as Record<string, unknown>[];
  const readCategory = accessor(spec.encoding.category.field);
  const readValue = accessor(spec.encoding.value.field);
  const readGroup = accessor(spec.encoding.group.field);
  const colorScale = ordinalColorScale({ palette: tokens.color.palette });

  const groupLabels = uniqueStrings(data, spec.encoding.group.field);
  const groupOrder: string[] = [];
  const groupRaw = new Map<string, unknown>();
  for (const row of data) {
    const raw = readGroup(row);
    const key = toKey(raw);
    if (!groupRaw.has(key)) {
      groupRaw.set(key, raw);
      groupOrder.push(key);
    }
  }

  const groups: DumbbellGroup[] = groupOrder.map((key, index) => ({
    key,
    label: labelFor(groupRaw.get(key) ?? groupLabels[index]),
    color: rgbaToCss(colorScale.map(key)),
    rawValue: groupRaw.get(key),
  }));

  const categoryOrder: string[] = [];
  const rowMap = new Map<string, Omit<DumbbellRow, 'min' | 'max' | 'mean'>>();
  for (const row of data) {
    const rawCat = readCategory(row);
    const catKey = toKey(rawCat);
    const rawValue = readValue(row);
    const value = toNumber(rawValue);
    if (!Number.isFinite(value)) continue;

    let item = rowMap.get(catKey);
    if (!item) {
      item = { catKey, catLabel: labelFor(rawCat), catRawValue: rawCat, dots: [] };
      rowMap.set(catKey, item);
      categoryOrder.push(catKey);
    }

    item.dots.push({
      groupKey: toKey(readGroup(row)),
      value,
      rawGroupValue: readGroup(row),
      rawRow: row,
    });
  }

  const unsortedRows: DumbbellRow[] = categoryOrder
    .map((key) => rowMap.get(key)!)
    .filter((row) => row.dots.length > 0)
    .map((row) => {
      const values = row.dots.map((dot) => dot.value);
      return {
        ...row,
        min: Math.min(...values),
        max: Math.max(...values),
        mean: values.reduce((sum, value) => sum + value, 0) / values.length,
      };
    });

  const rows = sortRows(unsortedRows, groups, spec.sort);
  const rawDomain = extent(data, spec.encoding.value.field);
  const valueDomain = niceValueDomain(rawDomain);
  const format = spec.format ?? spec.encoding.value.format;

  return {
    spec,
    tokens,
    categories: rows.map((row) => row.catKey),
    groups,
    rows,
    valueDomain,
    format,
    sketch: resolveSketch(spec),
  };
}