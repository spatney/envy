/**
 * Interaction layer: hover tooltips, crosshair, and focus highlighting.
 *
 * The runtime owns one `InteractionController` per chart and feeds it a fresh
 * `InteractionModel` each frame. Cartesian charts get a model for free via
 * `buildCartesianInteraction`; custom charts may return their own model from
 * their renderer.
 */

export type {
  Hover,
  InteractionModel,
  TooltipContent,
  TooltipRow,
} from './types';
export { InteractionController } from './controller';
export { Tooltip } from './tooltip';
export { buildCartesianInteraction, tooltipEnabled } from './cartesian';
