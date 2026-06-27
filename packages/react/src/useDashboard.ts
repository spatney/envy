import { useEffect, useRef, type RefObject } from 'react';
import {
  renderDashboard,
  type DashboardInstance,
  type DashboardSpec,
  type SelectionChangeListener,
  type SelectionStore,
} from '@envy/core';

export interface UseDashboardOptions {
  /** Called with the live instance after each mount and update. */
  onReady?: (instance: DashboardInstance) => void;
  /**
   * A shared selection bus. Omit to let the dashboard own one internally; pass
   * one (stable across renders) to drive it from React via {@link useSelection}
   * or to link it with standalone charts. Changing its identity remounts.
   */
  store?: SelectionStore;
  /** Called whenever any selection in the dashboard changes. */
  onSelectionChange?: SelectionChangeListener;
}

/**
 * Mount an Envy dashboard into a DOM node and keep it in sync with `spec`.
 *
 * Mirrors {@link useChart}: created on mount, updated in place when `spec`
 * changes identity, torn down on unmount, StrictMode-safe.
 *
 * ```tsx
 * const ref = useDashboard(dashboardSpec);
 * return <div ref={ref} style={{ width: '100%' }} />;
 * ```
 */
export function useDashboard<T extends HTMLElement = HTMLDivElement>(
  spec: DashboardSpec,
  options: UseDashboardOptions = {},
): RefObject<T | null> {
  const ref = useRef<T | null>(null);
  const instanceRef = useRef<DashboardInstance | null>(null);
  const specRef = useRef(spec);
  specRef.current = spec;
  const onReadyRef = useRef(options.onReady);
  onReadyRef.current = options.onReady;
  const onSelectionChangeRef = useRef(options.onSelectionChange);
  onSelectionChangeRef.current = options.onSelectionChange;
  const storeRef = useRef(options.store);
  storeRef.current = options.store;
  const skipNextUpdate = useRef(true);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const instance = renderDashboard(
      el,
      specRef.current,
      storeRef.current ? { store: storeRef.current } : undefined,
    );
    instanceRef.current = instance;
    const offSelection = instance.on('selectionchange', (name, value) =>
      onSelectionChangeRef.current?.(name, value),
    );
    skipNextUpdate.current = true;
    onReadyRef.current?.(instance);
    return () => {
      offSelection();
      instance.destroy();
      instanceRef.current = null;
    };
  }, [options.store]);

  useEffect(() => {
    if (skipNextUpdate.current) {
      skipNextUpdate.current = false;
      return;
    }
    const instance = instanceRef.current;
    if (!instance) return;
    instance.update(spec);
    onReadyRef.current?.(instance);
  }, [spec]);

  return ref;
}
