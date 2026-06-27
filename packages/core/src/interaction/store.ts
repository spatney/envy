/**
 * SelectionStore — the dependency-free bus that links interactive visuals.
 *
 * It holds the current {@link SelectionValue} for every named param and notifies
 * subscribers when one changes. Visuals **publish** to params they define (click,
 * brush, slicer change) and **subscribe** to params they consume (re-resolve
 * highlight/filter, redraw). A single store shared across `render()` calls links
 * independently-mounted charts; a `DashboardSpec` owns one internally.
 *
 * The store is deliberately "dumb": toggle/accumulate logic lives in the visual
 * that computes the next value. Change detection uses a structural compare so a
 * no-op `set` doesn't trigger redundant redraws.
 */

import type { SelectionValue } from '../spec/selection';

/** Notified after a param's value changes. */
export type SelectionListener = (name: string, value: SelectionValue | null) => void;

export interface SelectionStore {
  /** Current value for `name`, or `null` if unset/empty. */
  get(name: string): SelectionValue | null;
  /** Replace `name`'s value; no-ops (and skips notifying) if unchanged. */
  set(name: string, value: SelectionValue | null): void;
  /** Clear one param, or all params when `name` is omitted. */
  clear(name?: string): void;
  /** A snapshot of every param's current value. */
  all(): Record<string, SelectionValue | null>;
  /** Subscribe to changes; returns an unsubscribe function. */
  subscribe(listener: SelectionListener): () => void;
}

function sameValue(a: SelectionValue | null, b: SelectionValue | null): boolean {
  if (a === b) return true;
  if (a == null || b == null) return a == null && b == null;
  return JSON.stringify(a) === JSON.stringify(b);
}

export function createSelectionStore(
  initial?: Record<string, SelectionValue | null>,
): SelectionStore {
  const values = new Map<string, SelectionValue | null>();
  if (initial) {
    for (const [k, v] of Object.entries(initial)) values.set(k, v ?? null);
  }
  const listeners = new Set<SelectionListener>();

  const emit = (name: string, value: SelectionValue | null): void => {
    for (const listener of [...listeners]) listener(name, value);
  };

  return {
    get(name) {
      return values.get(name) ?? null;
    },
    set(name, value) {
      const next = value ?? null;
      if (sameValue(values.get(name) ?? null, next)) return;
      values.set(name, next);
      emit(name, next);
    },
    clear(name) {
      if (name === undefined) {
        for (const key of [...values.keys()]) {
          if ((values.get(key) ?? null) === null) continue;
          values.set(key, null);
          emit(key, null);
        }
        return;
      }
      if ((values.get(name) ?? null) === null) return;
      values.set(name, null);
      emit(name, null);
    },
    all() {
      return Object.fromEntries(values);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
