import { createElement, type CSSProperties, type ReactElement } from 'react';
import type { DashboardSpec } from '@envy/core';
import { useDashboard, type UseDashboardOptions } from './useDashboard';

export interface DashboardProps extends UseDashboardOptions {
  /** The Envy dashboard spec to render. */
  spec: DashboardSpec;
  className?: string;
  style?: CSSProperties;
}

const FILL: CSSProperties = { width: '100%' };

/**
 * Declarative React wrapper around the Envy dashboard runtime.
 *
 * Renders a container `<div>` (full width by default; height comes from the
 * dashboard's grid rows) and draws `spec` into it. Pass a new `spec` to update;
 * unmounting tears it down. Auto-wires cross-interaction unless `spec` opts out.
 *
 * ```tsx
 * <Dashboard spec={{ type: 'dashboard', data, views, interactions: 'auto' }} />
 * ```
 */
export function Dashboard({ spec, className, style, ...options }: DashboardProps): ReactElement {
  const ref = useDashboard<HTMLDivElement>(spec, options);
  return createElement('div', {
    ref,
    className,
    style: style ? { ...FILL, ...style } : FILL,
  });
}
