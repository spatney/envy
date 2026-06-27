/**
 * Predicate engine — pure, dependency-free matching of data rows against a
 * resolved {@link SelectionValue}.
 *
 * Used by both consumers of a selection: **filter** (keep matching rows) and
 * **highlight** (test each mark to decide emphasis vs. dim). Kept side-effect
 * free so it unit-tests in node and runs cheaply per mark.
 */

import type { Datum } from '../types';
import type {
  FilterClause,
  LiteralPredicate,
  SelectionValue,
} from '../spec/selection';
import { accessor, hasField, toDate, toKey, toNumber } from '../util/data';

/** A selection with no constraint (null, empty set/point/text) matches all. */
export function isEmptyValue(value: SelectionValue | null | undefined): boolean {
  if (value == null) return true;
  switch (value.kind) {
    case 'point':
      return value.tuples.length === 0 || value.fields.length === 0;
    case 'set':
      return value.values.length === 0;
    case 'text':
      return value.query.trim() === '';
    case 'range':
      return value.min == null && value.max == null;
  }
}

/** Coerce a value to a comparable number (numeric first, then temporal). */
function toComparable(value: unknown): number {
  if (typeof value === 'number') return value;
  if (value instanceof Date) return value.getTime();
  const n = toNumber(value);
  if (!Number.isNaN(n)) return n;
  const d = toDate(value);
  return d ? d.getTime() : NaN;
}

/**
 * Compile a row → boolean tester for a selection value, hoisting accessors and
 * lookup sets out of the per-row path so it's cheap to call across many marks.
 * An empty/null constraint compiles to a constant `true`.
 */
export function makeMatcher(
  value: SelectionValue | null | undefined,
): (row: Datum) => boolean {
  if (isEmptyValue(value)) return () => true;
  const v = value as SelectionValue;
  switch (v.kind) {
    case 'point': {
      const reads = v.fields.map((f) => accessor(f));
      const keys = v.tuples
        .filter((t) => t.length === v.fields.length)
        .map((t) => t.map((x) => toKey(x)).join('\u0000'));
      const want = new Set(keys);
      return (row) => want.has(reads.map((read) => toKey(read(row))).join('\u0000'));
    }
    case 'set': {
      const read = accessor(v.field);
      const want = new Set(v.values.map((x) => toKey(x)));
      return (row) => want.has(toKey(read(row)));
    }
    case 'range': {
      const read = accessor(v.field);
      const min = v.min != null ? toComparable(v.min) : -Infinity;
      const max = v.max != null ? toComparable(v.max) : Infinity;
      return (row) => {
        const c = toComparable(read(row));
        return !Number.isNaN(c) && c >= min && c <= max;
      };
    }
    case 'text': {
      const read = accessor(v.field);
      const q = v.query.trim().toLowerCase();
      return (row) => {
        const raw = read(row);
        return raw != null && String(raw).toLowerCase().includes(q);
      };
    }
  }
}

/** Does `row` satisfy `value`? An empty/null constraint always matches. */
export function matchesValue(row: Datum, value: SelectionValue | null | undefined): boolean {
  return makeMatcher(value)(row);
}

/** The data field(s) a selection value constrains. */
function valueFields(value: SelectionValue): string[] {
  return value.kind === 'point' ? value.fields : [value.field];
}

/** True when at least one row carries `field` as a column. */
function columnPresent(rows: readonly Datum[], field: string): boolean {
  for (const row of rows) if (hasField(row, field)) return true;
  return false;
}

/** Keep only the rows matching *every* provided selection (logical AND). */
export function filterRows(
  rows: readonly Datum[],
  values: ReadonlyArray<SelectionValue | null | undefined>,
): Datum[] {
  const active = values.filter((v): v is SelectionValue => !isEmptyValue(v));
  if (active.length === 0) return rows as Datum[];
  // Skip a clause whose field(s) this dataset doesn't contain: a cross-filter on
  // a column the data lacks is "not applicable" (Power-BI style — a slicer only
  // affects visuals built on a field), not "match nothing". Otherwise fanning a
  // page-wide filter onto a pre-aggregated view would blank it entirely.
  const matchers = active
    .filter((v) => valueFields(v).every((f) => columnPresent(rows, f)))
    .map((v) => makeMatcher(v));
  if (matchers.length === 0) return rows as Datum[];
  return rows.filter((row) => matchers.every((m) => m(row)));
}

/** Convert a literal `filter` predicate into a {@link SelectionValue}. */
export function literalToValue(pred: LiteralPredicate): SelectionValue {
  if ('equals' in pred) return { kind: 'set', field: pred.field, values: [pred.equals] };
  if ('oneOf' in pred) return { kind: 'set', field: pred.field, values: pred.oneOf };
  if ('contains' in pred) return { kind: 'text', field: pred.field, query: pred.contains };
  return { kind: 'range', field: pred.field, min: pred.range[0], max: pred.range[1] };
}

/** True when a filter clause is a named-param reference (vs. a literal). */
export function isParamClause(clause: FilterClause): clause is { param: string } {
  return typeof (clause as { param?: unknown }).param === 'string';
}
