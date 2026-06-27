/**
 * @envy/react — a thin React wrapper around the `@envy/core` runtime.
 *
 * `<Chart spec={…} />` for a single chart or `<Dashboard spec={…} />` for a
 * cross-interacting page; the `useChart` / `useDashboard` hooks give headless
 * control over your own container, and `useSelection` reads/writes a selection
 * as React state. Core spec/instance types are re-exported for convenience.
 */
export { Chart, type ChartProps } from './Chart';
export { useChart, type UseChartOptions } from './useChart';
export { Dashboard, type DashboardProps } from './Dashboard';
export { useDashboard, type UseDashboardOptions } from './useDashboard';
export { useSelection, type SelectionSource } from './useSelection';
export { createSelectionStore } from '@envy/core';
export type {
  ChartSpec,
  ChartInstance,
  DashboardSpec,
  DashboardInstance,
  SelectionStore,
  SelectionValue,
  SelectionChangeListener,
} from '@envy/core';

export const VERSION = '0.0.0';
