/**
 * Interaction model contracts.
 *
 * A chart (cartesian or custom) can expose an `InteractionModel` describing how
 * to hit-test the cursor and what to show. The shared `InteractionController`
 * owns the DOM listeners, the rAF throttle, the interaction-canvas highlight,
 * and the HTML tooltip — so individual charts only describe *what* to surface,
 * never *how* to wire events.
 */

import type { Rect, Datum } from '../types';
import type { SelectionValue } from '../spec/selection';

/** One line in a tooltip card. */
export interface TooltipRow {
  /** CSS color for the leading swatch chip. Omit for no chip. */
  swatch?: string;
  /** Left-aligned label (e.g. a series name). */
  label: string;
  /** Right-aligned, pre-formatted value. */
  value: string;
  /** Render muted (secondary measure / metadata). */
  muted?: boolean;
  /** Emphasise (e.g. the focused series under the cursor). */
  strong?: boolean;
}

/** Structured tooltip content; the controller renders it as a flat card. */
export interface TooltipContent {
  /** Bold header line (typically the shared x value or the category). */
  title?: string;
  rows: TooltipRow[];
}

/** The resolved hover under the cursor. */
export interface Hover {
  /**
   * Stable identity for the focused datum. While this is unchanged between
   * pointer moves the controller skips re-rendering — keeping hover cheap.
   */
  key: string;
  /** Tooltip anchor in CSS px (where the crosshair/marker focuses). */
  anchorX: number;
  anchorY: number;
  content: TooltipContent;
  /**
   * Draw the highlight (crosshair, focus markers, cell outline…) onto the
   * already-cleared interaction context. Coordinates are CSS px.
   */
  draw?(ctx: CanvasRenderingContext2D): void;
}

/** A click target for an interactive legend item. */
export interface LegendHitRegion {
  /** Swatch rectangle in CSS px. */
  rect: Rect;
  /** Stable string key for the series. */
  key: string;
  /** Raw series value used when publishing a selection. */
  value: unknown;
  /** Human-readable legend label. */
  label: string;
}

/** A chart's hit-testable description for the current frame. */
export interface InteractionModel {
  /** Hit region in CSS px. Moves outside it clear the hover. */
  region: Rect;
  /** Resolve the datum under a CSS-px point, or `null` for none. */
  hitTest(px: number, py: number): Hover | null;
  /**
   * Resolve the *selection* under a CSS-px point (for click/tap), or `null` when
   * the point hits no mark (which clears the selection). Optional: charts without
   * a `pick` are hover-only.
   */
  pick?(px: number, py: number): SelectionValue | null;
  /** Optional interactive legend click targets for this frame. */
  legendHits?: LegendHitRegion[];
}

/**
 * Resolved emphasis for the current frame: which rows are "in" the active
 * selection, and how strongly to fade the rest. Renderers dim non-matching marks
 * to `dim` (a 0..1 alpha multiplier) and keep matching marks at full strength.
 */
export interface Emphasis {
  /** True when a row is part of the active selection (drawn at full strength). */
  match(row: Datum): boolean;
  /** Alpha multiplier applied to non-matching marks (e.g. 0.22). */
  dim: number;
}
