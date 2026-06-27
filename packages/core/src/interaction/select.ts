/**
 * Selection wiring — turn a single "pick" into a published selection value, and
 * resolve a spec's `highlight`/`filter` against the store.
 *
 * The interaction models describe *what* a click picks (a {@link SelectionValue}
 * for one mark); this module applies the param's toggle/accumulate semantics and
 * publishes the result. It also resolves the consuming side: the emphasis a chart
 * draws (from `highlight`) and the row predicates it filters by (from `filter`).
 */

import type { Datum } from '../types';
import type {
  FilterClause,
  PointSelection,
  SelectionDef,
  SelectionValue,
} from '../spec/selection';
import type { HighlightConfig } from '../spec/selection';
import { toKey } from '../util/data';
import type { SelectionStore } from './store';
import type { Emphasis } from './types';
import { isEmptyValue, isParamClause, literalToValue, makeMatcher } from './predicate';

/** Default dim alpha applied to non-matching marks during highlight. */
export const DIM_ALPHA = 0.22;

/** What a selectable visual needs to publish picks to the store. */
export interface SelectConfig {
  store: SelectionStore;
  param: string;
  def: SelectionDef;
}

function tupleKey(tuple: readonly unknown[]): string {
  return tuple.map((x) => toKey(x)).join('\u0000');
}

function sameFields(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((f, i) => f === b[i]);
}

/** Merge a fresh point pick into the current value (toggle + accumulate). */
function togglePoint(
  current: SelectionValue | null,
  pick: PointSelection,
): SelectionValue | null {
  if (!current || current.kind !== 'point' || !sameFields(current.fields, pick.fields)) {
    return pick.tuples.length ? pick : null;
  }
  const byKey = new Map(current.tuples.map((t) => [tupleKey(t), t]));
  for (const t of pick.tuples) {
    const k = tupleKey(t);
    if (byKey.has(k)) byKey.delete(k);
    else byKey.set(k, t);
  }
  const tuples = [...byKey.values()];
  return tuples.length ? { kind: 'point', fields: current.fields, tuples } : null;
}

/**
 * Publish a pick to the store, applying the param's semantics:
 * - a `null` pick (clicked empty space) clears the selection;
 * - `point` params with `toggle` (the default) accumulate / deselect;
 * - everything else replaces the value (single-select, brush, slicer).
 */
export function applyPick(cfg: SelectConfig, pick: SelectionValue | null): void {
  const { store, param, def } = cfg;
  if (pick == null) {
    store.set(param, null);
    return;
  }
  if (def.type === 'point' && def.toggle !== false && pick.kind === 'point') {
    store.set(param, togglePoint(store.get(param), pick));
    return;
  }
  store.set(param, pick);
}

/** Resolve a `highlight` reference (one param or a union of several) into the
 * emphasis to draw this frame. With multiple params a row is emphasized if it
 * matches *any* active selection; emphasis is null when none are active. */
export function resolveEmphasis(
  highlight: HighlightConfig | HighlightConfig[] | undefined,
  store: SelectionStore | undefined,
  dim: number = DIM_ALPHA,
): Emphasis | null {
  if (!highlight || !store) return null;
  const configs = Array.isArray(highlight) ? highlight : [highlight];
  const matchers: Array<(row: Datum) => boolean> = [];
  for (const cfg of configs) {
    const value = store.get(cfg.param);
    if (isEmptyValue(value)) continue;
    matchers.push(makeMatcher(value));
  }
  if (matchers.length === 0) return null;
  return { match: (row: Datum) => matchers.some((m) => m(row)), dim };
}

/** Resolve a `filter` list into concrete selection values (params + literals). */
export function resolveFilterValues(
  filter: FilterClause[] | undefined,
  store: SelectionStore | undefined,
): SelectionValue[] {
  if (!filter || filter.length === 0) return [];
  const out: SelectionValue[] = [];
  for (const clause of filter) {
    if (isParamClause(clause)) {
      const v = store?.get(clause.param) ?? null;
      if (!isEmptyValue(v)) out.push(v as SelectionValue);
    } else {
      out.push(literalToValue(clause));
    }
  }
  return out;
}

/** The set of param names a spec reacts to (for change-driven redraws). */
export function dependentParams(
  highlight: HighlightConfig | HighlightConfig[] | undefined,
  filter: FilterClause[] | undefined,
  ownParams: readonly string[] = [],
): Set<string> {
  const names = new Set<string>(ownParams);
  for (const cfg of highlight ? (Array.isArray(highlight) ? highlight : [highlight]) : []) {
    names.add(cfg.param);
  }
  for (const clause of filter ?? []) {
    if (isParamClause(clause)) names.add(clause.param);
  }
  return names;
}
