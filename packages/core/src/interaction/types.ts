/**
 * Interaction model contracts.
 *
 * A chart (cartesian or custom) can expose an `InteractionModel` describing how
 * to hit-test the cursor and what to show. The shared `InteractionController`
 * owns the DOM listeners, the rAF throttle, the interaction-canvas highlight,
 * and the HTML tooltip — so individual charts only describe *what* to surface,
 * never *how* to wire events.
 */

import type { Rect } from '../types';

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

/** A chart's hit-testable description for the current frame. */
export interface InteractionModel {
  /** Hit region in CSS px. Moves outside it clear the hover. */
  region: Rect;
  /** Resolve the datum under a CSS-px point, or `null` for none. */
  hitTest(px: number, py: number): Hover | null;
}
