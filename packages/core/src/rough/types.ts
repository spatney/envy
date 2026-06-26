/**
 * Type vocabulary for the rough (hand-drawn) drawing engine.
 *
 * `RoughStyle` is the resolved set of knobs that controls how sketchy a chart
 * looks; it is produced once per chart (see `resolveSketch`) and handed to a
 * `RoughPen`. `MarkOptions` carries the per-mark colors plus any local overrides.
 */

/** How closed shapes are filled. */
export type FillStyle = 'hachure' | 'solid' | 'cross-hatch';

/** Resolved, fully-defaulted sketch knobs shared by every mark in a chart. */
export interface RoughStyle {
  /** Magnitude of the random wobble. 0 ≈ clean, 1 = default, >1 = wilder. */
  roughness: number;
  /** How much straight lines bow/curve between endpoints. */
  bowing: number;
  /** Fill treatment for closed shapes. */
  fillStyle: FillStyle;
  /** Spacing (px) between hachure lines. <= 0 derives from stroke width. */
  hachureGap: number;
  /** Hachure line angle in degrees. */
  hachureAngle: number;
  /** Outline width in px. */
  strokeWidth: number;
  /** PRNG seed — the source of all deterministic jitter. */
  seed: number;
}

/** Per-mark drawing options (colors + optional local style overrides). */
export interface MarkOptions extends Partial<RoughStyle> {
  /** Outline color. Omit to skip the outline. */
  stroke?: string;
  /** Fill color. Omit to skip the fill. */
  fill?: string;
  /** Hachure line width (defaults to a thin fraction of strokeWidth). */
  fillWeight?: number;
  /** Opacity applied to the fill only (0..1). */
  fillAlpha?: number;
  /** Opacity applied to the outline only (0..1). */
  strokeAlpha?: number;
}

export const DEFAULT_ROUGH_STYLE: RoughStyle = {
  roughness: 1,
  bowing: 1,
  fillStyle: 'hachure',
  hachureGap: 0,
  hachureAngle: -41,
  strokeWidth: 1.4,
  seed: 1,
};
