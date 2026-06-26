import { useEffect, useRef, type RefObject } from 'react';
import { render, type ChartInstance, type ChartSpec } from '@envy/core';

export interface UseChartOptions {
  /** Called with the live instance after each mount and update. */
  onReady?: (instance: ChartInstance) => void;
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
  const skipNextUpdate = useRef(true);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const instance = render(el, specRef.current);
    instanceRef.current = instance;
    // The update effect runs once right after this on mount; skip that pass so
    // we don't redundantly re-render the freshly created chart.
    skipNextUpdate.current = true;
    onReadyRef.current?.(instance);
    return () => {
      instance.destroy();
      instanceRef.current = null;
    };
  }, []);

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
