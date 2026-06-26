/**
 * Entrance-animation resolution.
 *
 * Pure policy that turns a spec's `animation` field (plus environment signals:
 * `prefers-reduced-motion` and a global screenshot kill-switch) into concrete
 * `{ enabled, duration, easing }`. Kept DOM-free so it's trivially unit-tested;
 * the runtime drives the actual frames.
 */

import { cubicOut, easings, type EasingFunction } from './easing';
import type { AnimationConfig } from '../spec/types';

export interface ResolvedEntrance {
  enabled: boolean;
  /** Milliseconds. */
  duration: number;
  easing: EasingFunction;
}

/** Default entrance duration (ms) when a spec enables animation without one. */
export const DEFAULT_ENTRANCE_DURATION = 480;

const DISABLED: ResolvedEntrance = { enabled: false, duration: 0, easing: cubicOut };

export interface EntranceContext {
  /** Honor the OS "reduce motion" setting (disables animation). */
  reducedMotion?: boolean;
  /** Global kill-switch (e.g. screenshot/automation harnesses). */
  disabled?: boolean;
}

/**
 * Resolve the effective entrance animation. Motion is suppressed when reduced
 * motion is requested, when globally disabled, or when the spec opts out
 * (`animation: false` / `{ enabled: false }` / non-positive duration).
 */
export function resolveEntrance(
  animation: AnimationConfig | boolean | undefined,
  ctx: EntranceContext = {},
): ResolvedEntrance {
  if (ctx.disabled || ctx.reducedMotion) return DISABLED;
  if (animation === false) return DISABLED;

  const cfg: AnimationConfig = animation && typeof animation === 'object' ? animation : {};
  if (cfg.enabled === false) return DISABLED;

  const duration = cfg.duration ?? DEFAULT_ENTRANCE_DURATION;
  if (!(duration > 0)) return DISABLED;

  const easing = (cfg.easing ? easings[cfg.easing] : undefined) ?? cubicOut;
  return { enabled: true, duration, easing };
}
