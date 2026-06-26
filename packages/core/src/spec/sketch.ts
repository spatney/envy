/**
 * Resolve a spec's `sketch` option into concrete, fully-defaulted knobs for the
 * rough engine. Returns `null` when sketching is off, which lets every chart
 * keep its pixel-identical clean path with a single early check.
 *
 * The seed is derived deterministically from the spec's identity when the author
 * doesn't pass one, so the same chart always wobbles the same way (required for
 * the screenshot harness).
 */

import { DEFAULT_ROUGH_STYLE, hashString, type RoughStyle } from '../rough';
import type { BaseSpec, ChartSpec, SketchConfig } from './types';

/** Fully-resolved sketch settings handed to charts / the rough pen. */
export interface ResolvedSketch extends RoughStyle {
  /** Whether text should use the hand-drawn font. */
  font: boolean;
}

function deriveSeed(spec: ChartSpec): number {
  const title =
    typeof spec.title === 'string' ? spec.title : (spec.title?.text ?? spec.title?.subtitle ?? '');
  const dataLen = Array.isArray(spec.data) ? spec.data.length : 0;
  const firstRow = Array.isArray(spec.data) && spec.data[0] ? Object.keys(spec.data[0]).join(',') : '';
  return hashString(`${spec.type}|${title}|${dataLen}|${firstRow}`) || 1;
}

/**
 * Map `spec.sketch` to a `ResolvedSketch`, or `null` when disabled.
 * `sketch: true` uses all defaults; an object overrides individual knobs.
 */
export function resolveSketch(spec: ChartSpec): ResolvedSketch | null {
  const sketch = (spec as BaseSpec).sketch;
  if (!sketch) return null;
  const cfg: SketchConfig = sketch === true ? {} : sketch;

  return {
    roughness: cfg.roughness ?? DEFAULT_ROUGH_STYLE.roughness,
    bowing: cfg.bowing ?? DEFAULT_ROUGH_STYLE.bowing,
    fillStyle: cfg.fillStyle ?? DEFAULT_ROUGH_STYLE.fillStyle,
    hachureGap: cfg.hachureGap ?? DEFAULT_ROUGH_STYLE.hachureGap,
    hachureAngle: cfg.hachureAngle ?? DEFAULT_ROUGH_STYLE.hachureAngle,
    strokeWidth: cfg.strokeWidth ?? DEFAULT_ROUGH_STYLE.strokeWidth,
    seed: (cfg.seed ?? deriveSeed(spec)) >>> 0,
    font: cfg.font ?? true,
  };
}
