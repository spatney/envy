/**
 * Shared primitive types used across Graphein core.
 *
 * These are intentionally tiny and dependency-free so every module
 * (scales, shapes, layout, charts, tables) can share a common vocabulary.
 */

/** A 2D point in pixel space. */
export interface Point {
  x: number;
  y: number;
}

/** Width/height in pixels. */
export interface Size {
  width: number;
  height: number;
}

/** An axis-aligned rectangle in pixel space (top-left origin). */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Padding/margins around a box. */
export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** A single data record (row). Agent-supplied data is an array of these. */
export type Datum = Record<string, unknown>;

/** Primitive field value types Graphein understands. */
export type FieldValue = number | string | boolean | Date | null | undefined;

/**
 * Encoding channel data types (Vega-Lite-like):
 * - quantitative: continuous numbers (linear/log scales)
 * - temporal: dates/times (time scale)
 * - ordinal: ordered categories
 * - nominal: unordered categories
 */
export type FieldType = 'quantitative' | 'temporal' | 'ordinal' | 'nominal';

/** Normalized RGBA color, channels in [0,255], alpha in [0,1]. */
export interface RGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

/** A [min, max] numeric interval. */
export type Extent = [number, number];

/** Anything with a numeric-or-categorical comparable value. */
export type Comparable = number | string | Date;
