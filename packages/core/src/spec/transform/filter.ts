/** The `filter` transform: keep rows satisfying a declarative JSON predicate. */

import type { Datum } from '../../types';
import type { FilterPredicate, FilterTransform } from './types';
import { accessor, toDate, toKey, toNumber } from '../../util/data';

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
 * Compile a {@link FilterPredicate} into a fast `row → boolean` tester, hoisting
 * accessors and lookup sets out of the per-row path. An unrecognized leaf shape
 * compiles to "match nothing" (validation flags it as an error first).
 */
export function compilePredicate(pred: FilterPredicate): (row: Datum) => boolean {
  if ('and' in pred) {
    const parts = pred.and.map(compilePredicate);
    return (row) => parts.every((p) => p(row));
  }
  if ('or' in pred) {
    const parts = pred.or.map(compilePredicate);
    return (row) => parts.some((p) => p(row));
  }
  if ('not' in pred) {
    const inner = compilePredicate(pred.not);
    return (row) => !inner(row);
  }

  const read = accessor(pred.field);
  if ('equals' in pred) {
    const want = toKey(pred.equals);
    return (row) => toKey(read(row)) === want;
  }
  if ('ne' in pred) {
    const want = toKey(pred.ne);
    return (row) => toKey(read(row)) !== want;
  }
  if ('oneOf' in pred) {
    const want = new Set(pred.oneOf.map((x) => toKey(x)));
    return (row) => want.has(toKey(read(row)));
  }
  if ('contains' in pred) {
    const q = String(pred.contains).toLowerCase();
    return (row) => {
      const raw = read(row);
      return raw != null && String(raw).toLowerCase().includes(q);
    };
  }
  if ('valid' in pred) {
    const wantValid = pred.valid !== false;
    return (row) => {
      const raw = read(row);
      const ok = raw != null && !(typeof raw === 'number' && Number.isNaN(raw));
      return ok === wantValid;
    };
  }
  if ('range' in pred) {
    const a = toComparable(pred.range[0]);
    const b = toComparable(pred.range[1]);
    const min = Math.min(a, b);
    const max = Math.max(a, b);
    return (row) => {
      const c = toComparable(read(row));
      return !Number.isNaN(c) && c >= min && c <= max;
    };
  }
  if ('gt' in pred) {
    const t = toComparable(pred.gt);
    return (row) => {
      const c = toComparable(read(row));
      return !Number.isNaN(c) && c > t;
    };
  }
  if ('gte' in pred) {
    const t = toComparable(pred.gte);
    return (row) => {
      const c = toComparable(read(row));
      return !Number.isNaN(c) && c >= t;
    };
  }
  if ('lt' in pred) {
    const t = toComparable(pred.lt);
    return (row) => {
      const c = toComparable(read(row));
      return !Number.isNaN(c) && c < t;
    };
  }
  if ('lte' in pred) {
    const t = toComparable(pred.lte);
    return (row) => {
      const c = toComparable(read(row));
      return !Number.isNaN(c) && c <= t;
    };
  }
  return () => false;
}

/** Apply a {@link FilterTransform}, returning a new array of matching rows. */
export function applyFilter(transform: FilterTransform, data: Datum[]): Datum[] {
  const test = compilePredicate(transform.filter);
  return data.filter(test);
}
