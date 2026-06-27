/**
 * Data access helpers shared by charts, tables, and the pivot engine.
 *
 * All chart input is a tidy array of records (`Datum`). These helpers read
 * fields, coerce values, and compute the summaries (extent, unique values,
 * series groups) that scales and layout need. Kept pure and dependency-free so
 * they unit-test in node.
 */

import type { Datum, FieldType } from '../types';

/** Read a (possibly nested, dot-separated) field from a record. */
export function getField(datum: Datum, field: string): unknown {
  if (field in datum) return datum[field];
  if (field.indexOf('.') === -1) return undefined;
  let cur: unknown = datum;
  for (const part of field.split('.')) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

/** True when a record carries `field` as a (possibly nested) column key. */
export function hasField(datum: Datum, field: string): boolean {
  if (field in datum) return true;
  if (field.indexOf('.') === -1) return false;
  let cur: unknown = datum;
  for (const part of field.split('.')) {
    if (cur == null || typeof cur !== 'object' || !(part in (cur as object))) return false;
    cur = (cur as Record<string, unknown>)[part];
  }
  return true;
}

/** Build a fast accessor for a field. */
export function accessor(field: string): (d: Datum) => unknown {
  if (field.indexOf('.') === -1) return (d) => d[field];
  return (d) => getField(d, field);
}

/** Coerce a value to a finite number, or NaN when it cannot be represented. */
export function toNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') return NaN;
    const n = Number(trimmed);
    return Number.isNaN(n) ? NaN : n;
  }
  return NaN;
}

/** Coerce a value to a Date, or null when it cannot be parsed. */
const ISO_DATE_RE = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/;

export function toDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'number') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === 'string') {
    // Bare ISO dates (YYYY-MM / YYYY-MM-DD) have no zone; the JS spec parses
    // them as UTC, which then renders as the previous day in any timezone west
    // of UTC. Parse them in LOCAL time so the calendar day matches the input.
    // Date-time (with a clock) and slash forms are already local via Date.parse.
    const m = ISO_DATE_RE.exec(value);
    if (m) return new Date(+m[1], +m[2] - 1, m[3] ? +m[3] : 1);
    const ms = Date.parse(value);
    return Number.isNaN(ms) ? null : new Date(ms);
  }
  return null;
}

/** Stable string key for grouping (dates by epoch, null as ""). */
export function toKey(value: unknown): string {
  if (value == null) return '';
  if (value instanceof Date) return String(value.getTime());
  return String(value);
}

/** Numeric [min, max] over the finite numeric values of a field. */
export function extent(data: readonly Datum[], field: string): [number, number] | null {
  const read = accessor(field);
  let min = Infinity;
  let max = -Infinity;
  for (const d of data) {
    const n = toNumber(read(d));
    if (Number.isNaN(n)) continue;
    if (n < min) min = n;
    if (n > max) max = n;
  }
  return min === Infinity ? null : [min, max];
}

/** Numeric [min, max] over a raw numeric array. */
export function extentOf(values: readonly number[]): [number, number] | null {
  let min = Infinity;
  let max = -Infinity;
  for (const n of values) {
    if (Number.isNaN(n)) continue;
    if (n < min) min = n;
    if (n > max) max = n;
  }
  return min === Infinity ? null : [min, max];
}

/** Distinct values of a field, in first-seen order. */
export function uniqueValues(data: readonly Datum[], field: string): unknown[] {
  const read = accessor(field);
  const seen = new Set<string>();
  const out: unknown[] = [];
  for (const d of data) {
    const v = read(d);
    const k = toKey(v);
    if (!seen.has(k)) {
      seen.add(k);
      out.push(v);
    }
  }
  return out;
}

/** Distinct values coerced to display strings, in first-seen order. */
export function uniqueStrings(data: readonly Datum[], field: string): string[] {
  return uniqueValues(data, field).map((v) => (v == null ? '' : String(v)));
}

export interface Series {
  /** Group key (series name). */
  key: string;
  /** Raw value of the series field (Date/number/string). */
  value: unknown;
  rows: Datum[];
}

/**
 * Split rows into series by a field, preserving first-seen order. When `field`
 * is undefined the whole dataset is one unnamed series.
 */
export function groupBySeries(data: readonly Datum[], field?: string): Series[] {
  if (!field) return [{ key: '', value: undefined, rows: data as Datum[] }];
  const read = accessor(field);
  const index = new Map<string, Series>();
  const order: Series[] = [];
  for (const d of data) {
    const v = read(d);
    const k = toKey(v);
    let s = index.get(k);
    if (!s) {
      s = { key: k, value: v, rows: [] };
      index.set(k, s);
      order.push(s);
    }
    s.rows.push(d);
  }
  return order;
}

/**
 * Infer a field's encoding type by sampling its values.
 * Numbers → quantitative, Dates / ISO-ish strings → temporal, else nominal.
 */
export function inferType(data: readonly Datum[], field: string): FieldType {
  const read = accessor(field);
  let numbers = 0;
  let dates = 0;
  let total = 0;
  for (const d of data) {
    const v = read(d);
    if (v == null || v === '') continue;
    total++;
    if (typeof v === 'number') {
      numbers++;
    } else if (v instanceof Date) {
      dates++;
    } else if (typeof v === 'string') {
      if (!Number.isNaN(Number(v)) && v.trim() !== '') numbers++;
      else if (looksTemporal(v)) dates++;
    }
    if (total >= 200) break;
  }
  if (total === 0) return 'nominal';
  if (dates > 0 && dates >= numbers) return 'temporal';
  if (numbers / total >= 0.8) return 'quantitative';
  return 'nominal';
}

const TEMPORAL_RE =
  /^\d{4}-\d{2}(-\d{2})?([ T]\d{2}:\d{2})?|^\d{4}\/\d{1,2}\/\d{1,2}|^\d{1,2}\/\d{1,2}\/\d{2,4}/;

function looksTemporal(s: string): boolean {
  if (!TEMPORAL_RE.test(s)) return false;
  return !Number.isNaN(Date.parse(s));
}

/** Sum a numeric field across rows (ignoring non-numeric). */
export function sumField(rows: readonly Datum[], field: string): number {
  const read = accessor(field);
  let total = 0;
  for (const d of rows) {
    const n = toNumber(read(d));
    if (!Number.isNaN(n)) total += n;
  }
  return total;
}
