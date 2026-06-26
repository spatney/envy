/**
 * Chart registry.
 *
 * Cartesian charts (line/area/bar/scatter) consume a prebuilt `CartesianModel`
 * and only draw marks. Custom charts (heatmap/pie/kpi/table/matrix) own their
 * full layout and draw directly onto the surface. The runtime dispatches here.
 */

import type { Surface } from '../render/surface';
import type { Size } from '../types';
import type { ChartSpec, ChartType } from '../spec/types';
import type { ThemeTokens } from '../theme';
import type { CartesianModel } from '../runtime/cartesian';
import { drawLine } from './line';

export type CartesianRenderer = (surface: Surface, model: CartesianModel) => void;
export type CustomRenderer = (
  surface: Surface,
  spec: ChartSpec,
  tokens: ThemeTokens,
  size: Size,
) => void;

export const CARTESIAN_TYPES: ReadonlySet<ChartType> = new Set<ChartType>([
  'line',
  'area',
  'bar',
  'scatter',
]);

export const cartesianRenderers: Partial<Record<ChartType, CartesianRenderer>> = {
  line: drawLine,
  area: drawLine, // area specs fall back to a filled line until the dedicated renderer lands
};

export const customRenderers: Partial<Record<ChartType, CustomRenderer>> = {};
