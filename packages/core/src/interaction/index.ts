/**
 * Interaction layer: hover tooltips, crosshair, and focus highlighting.
 *
 * The runtime owns one `InteractionController` per chart and feeds it a fresh
 * `InteractionModel` each frame. Cartesian charts get a model for free via
 * `buildCartesianInteraction`; custom charts may return their own model from
 * their renderer.
 */

export type {
  Emphasis,
  Hover,
  InteractionModel,
  LegendHitRegion,
  TooltipContent,
  TooltipRow,
} from './types';
export { InteractionController, type ControllerSelect } from './controller';
export { Tooltip } from './tooltip';
export { buildCartesianInteraction, tooltipEnabled } from './cartesian';
export {
  createSelectionStore,
  type SelectionStore,
  type SelectionListener,
} from './store';
export {
  matchesValue,
  makeMatcher,
  filterRows,
  isEmptyValue,
  literalToValue,
  isParamClause,
} from './predicate';
export {
  applyPick,
  resolveEmphasis,
  resolveFilterValues,
  dependentParams,
  DIM_ALPHA,
  type SelectConfig,
} from './select';
