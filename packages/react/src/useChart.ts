import { useEffect, useRef, type RefObject } from 'react';
import {
  render,
  type ChartInstance,
  type ChartSpec,
  type SelectionChangeListener,
  type SelectionStore,
} from '@envy/core';

export interface UseChartOptions {
  /** Called with the live instance after each mount and update. */
  onReady?: (instance: ChartInstance) => void;
  /**
   * A shared selection bus. Pass the same store to several charts (or a
   * dashboard) to link them — cross-highlight / cross-filter. Should be stable
   * across renders (e.g. `useMemo(() => createSelectionStore(), [])`); changing
   * its identity remounts the chart.
   */
  store?: SelectionStore;
  /** Called whenever any selection this chart is bound to changes. */
  onSelectionChange?: SelectionChangeListener;
}

/**
 * Mount an Envy chart into a DOM node and keep it in sync with `spec`.
 *
 * Returns a ref to attach to the container element. The chart is created on
 * mount, re-rendered via `instance.update()` whenever `spec` changes identity,
 * and torn down on unmount. The effect lifecycle is StrictMode-safe (double
 * mount → destroy → mount produces no leaked instances or duplicate renders).
 *
 * ```tsx
 * const ref = useChart(spec);
 * return <div ref={ref} style={{ width: '100%', height: 360 }} />;
 * ```
 */
export function useChart<T extends HTMLElement = HTMLDivElement>(
  spec: ChartSpec,
  options: UseChartOptions = {},
): RefObject<T | null> {
  const ref = useRef<T | null>(null);
  const instanceRef = useRef<ChartInstance | null>(null);
  // Hold the latest spec / callback in refs so the mount effect (which runs
  // once) always reads current values without re-subscribing.
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
    const instance = render(
      el,
      specRef.current,
      storeRef.current ? { store: storeRef.current } : undefined,
    );
    instanceRef.current = instance;
    const offSelection = instance.on('selectionchange', (name, value) =>
      onSelectionChangeRef.current?.(name, value),
    );
    // The update effect runs once right after this on mount; skip that pass so
    // we don't redundantly re-render the freshly created chart.
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
