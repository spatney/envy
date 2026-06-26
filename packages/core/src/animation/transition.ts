/**
 * Update-transition resolution.
 *
 * Pure policy (mirrors {@link resolveEntrance}) that turns a spec's `animation`
 * field — plus environment signals (`prefers-reduced-motion` and the global
 * screenshot kill-switch) — into concrete `{ enabled, duration, easing }` for the
 * cross-fade played when a chart's data/config changes via `update()`. Kept
 * DOM-free so it's trivially unit-tested; the runtime drives the actual frames.
 */

import { cubicInOut, easings, type EasingFunction } from './easing';
import type { ResolvedEntrance } from './entrance';
import type { AnimationConfig } from '../spec/types';

/** Default update cross-fade duration (ms). Snappier than the entrance. */
export const DEFAULT_UPDATE_DURATION = 360;

const DISABLED: ResolvedEntrance = { enabled: false, duration: 0, easing: cubicInOut };

export interface UpdateContext {
  /** Honor the OS "reduce motion" setting (disables animation). */
  reducedMotion?: boolean;
  /** Global kill-switch (e.g. screenshot/automation harnesses). */
  disabled?: boolean;
}

/**
 * Resolve the effective update transition. Motion is suppressed when reduced
 * motion is requested, when globally disabled, or when the spec opts out
 * (`animation: false` / `{ enabled: false }` / non-positive duration). A custom
 * `easing` defaults to `cubicInOut` (symmetric — reads well for a cross-fade).
 */
export function resolveUpdate(
  animation: AnimationConfig | boolean | undefined,
  ctx: UpdateContext = {},
): ResolvedEntrance {
  if (ctx.disabled || ctx.reducedMotion) return { ...DISABLED };
  if (animation === false) return { ...DISABLED };

  const cfg: AnimationConfig = animation && typeof animation === 'object' ? animation : {};
  if (cfg.enabled === false) return { ...DISABLED };

  const duration = cfg.duration ?? DEFAULT_UPDATE_DURATION;
  if (!(duration > 0)) return { ...DISABLED };

  const easing: EasingFunction = (cfg.easing ? easings[cfg.easing] : undefined) ?? cubicInOut;
  return { enabled: true, duration, easing };
}
