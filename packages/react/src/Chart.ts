import { createElement, type CSSProperties, type ReactElement } from 'react';
import type { ChartSpec } from '@envy/core';
import { useChart, type UseChartOptions } from './useChart';

export interface ChartProps extends UseChartOptions {
  /** The Envy chart spec to render. */
  spec: ChartSpec;
  className?: string;
  style?: CSSProperties;
}

const FILL: CSSProperties = { width: '100%', height: '100%' };

/**
 * Declarative React wrapper around the Envy core runtime.
 *
 * Renders a container `<div>` that fills its parent (override via `style`) and
 * draws `spec` into it. Pass a new `spec` to update; unmounting tears the chart
 * down. Give the parent an explicit size for best results.
 *
 * ```tsx
 * <div style={{ height: 360 }}>
 *   <Chart spec={{ type: 'line', data, encoding: { x, y } }} />
 * </div>
 * ```
 */
export function Chart({ spec, className, style, ...options }: ChartProps): ReactElement {
  const ref = useChart<HTMLDivElement>(spec, options);
  return createElement('div', {
    ref,
    className,
    style: style ? { ...FILL, ...style } : FILL,
  });
}
