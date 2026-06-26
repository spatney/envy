/**
 * @envy/react — a thin React wrapper around the `@envy/core` runtime.
 *
 * `<Chart spec={…} />` for the common case, or the `useChart` hook for headless
 * control over your own container. Core spec/instance types are re-exported for
 * convenience so consumers need only import from `@envy/react`.
 */
export { Chart, type ChartProps } from './Chart';
export { useChart, type UseChartOptions } from './useChart';
export type { ChartSpec, ChartInstance } from '@envy/core';

export const VERSION = '0.0.0';
