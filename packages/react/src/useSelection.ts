import { useCallback, useEffect, useState } from 'react';
import type { SelectionStore, SelectionValue } from '@envy/core';

/** Anything that exposes a selection bus: a store, or a chart/dashboard instance. */
export type SelectionSource =
  | SelectionStore
  | { store: SelectionStore }
  | null
  | undefined;

function resolveStore(source: SelectionSource): SelectionStore | null {
  if (!source) return null;
  return 'store' in source ? source.store : source;
}

/**
 * Read and write a named selection as React state.
 *
 * Pass a shared {@link SelectionStore} (or a chart/dashboard instance, which
 * exposes one as `.store`) plus the param name. Returns the current value and a
 * setter that publishes to the bus — driving cross-highlight / cross-filter
 * across every visual bound to that store.
 *
 * ```tsx
 * const store = useMemo(() => createSelectionStore(), []);
 * const [region, setRegion] = useSelection(store, 'region');
 * // …
 * <Dashboard spec={spec} store={store} />
 * <button onClick={() => setRegion({ kind: 'set', field: 'region', values: ['West'] })}>
 *   West
 * </button>
 * ```
 */
export function useSelection(
  source: SelectionSource,
  name: string,
): [SelectionValue | null, (value: SelectionValue | null) => void] {
  const store = resolveStore(source);
  const [value, setValue] = useState<SelectionValue | null>(() => store?.get(name) ?? null);

  useEffect(() => {
    if (!store) {
      setValue(null);
      return;
    }
    setValue(store.get(name) ?? null);
    const unsubscribe = store.subscribe((changed, next) => {
      if (changed === name) setValue(next);
    });
    return unsubscribe;
  }, [store, name]);

  const set = useCallback(
    (next: SelectionValue | null) => {
      store?.set(name, next ?? null);
    },
    [store, name],
  );

  return [value, set];
}
