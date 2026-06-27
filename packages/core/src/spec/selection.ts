/**
 * Selection model — the declarative vocabulary for interactivity.
 *
 * A *selection* is the unit of interactivity: a named, JSON-serializable value
 * that a visual publishes (by clicking marks, brushing, or changing a slicer)
 * and that other visuals consume as either a **highlight** (emphasize matches,
 * dim the rest) or a **filter** (subset the rows). Selections are plain data —
 * no functions — so specs still round-trip through `JSON.stringify`.
 *
 * Inspired by Vega-Lite params/selections, but pared down to what coding agents
 * need to wire dashboards: a `point`/`interval` definition, and four concrete
 * resolved value shapes (point, set, range, text).
 */

/** How a selection is captured from user interaction. */
export interface SelectionDef {
  /**
   * - `point`: discrete picks (click marks, choose categories). Toggling builds
   *   a set of selected tuples.
   * - `interval`: a continuous range (brush on an axis, a min/max slider, a date
   *   range).
   */
  type: 'point' | 'interval';
  /** Pointer event that updates the selection. Default `'click'`. */
  on?: 'click' | 'hover';
  /**
   * Data fields that identify the selection. Defaults to the chart's key channel
   * (e.g. the `x`/`series` field for cartesian charts, the `field` of a slicer).
   */
  fields?: string[];
  /**
   * Click an already-selected mark to deselect, and accumulate multiple picks.
   * Default `true` for `on:'click'`.
   */
  toggle?: boolean;
  /**
   * What an *empty* selection means for consumers: `'all'` (the default) treats
   * "nothing selected" as "match everything" (no dimming / no filtering);
   * `'none'` treats it as "match nothing".
   */
  empty?: 'all' | 'none';
}

/** A named selection a visual defines. */
export interface SelectionParam {
  /** Unique name within a chart or dashboard. */
  name: string;
  select: SelectionDef;
  /** Optional initial value. */
  value?: SelectionValue;
}

/** Discrete picks: rows whose `fields` equal one of the selected `tuples`. */
export interface PointSelection {
  kind: 'point';
  fields: string[];
  /** Each tuple is one selected combination, aligned to `fields`. */
  tuples: unknown[][];
}

/** Membership: rows whose `field` value is one of `values` (dropdown / list). */
export interface SetSelection {
  kind: 'set';
  field: string;
  values: unknown[];
}

/** A continuous span over `field` (numeric or temporal). Bounds are inclusive. */
export interface RangeSelection {
  kind: 'range';
  field: string;
  min?: number | string;
  max?: number | string;
}

/** A case-insensitive substring match over `field` (search box). */
export interface TextSelection {
  kind: 'text';
  field: string;
  query: string;
}

/** The resolved value of a selection — what lives in the store. */
export type SelectionValue = PointSelection | SetSelection | RangeSelection | TextSelection;

/** Reference a named selection for highlighting. */
export interface HighlightConfig {
  /** The param whose current value drives the emphasis. */
  param: string;
}

/**
 * A literal, param-free predicate usable directly in `filter`. Each form maps to
 * a {@link SelectionValue}, so the same matcher handles params and literals.
 */
export type LiteralPredicate =
  | { field: string; equals: unknown }
  | { field: string; oneOf: unknown[] }
  | { field: string; range: [number | string, number | string] }
  | { field: string; contains: string };

/** One clause of a `filter`: a named param or a literal predicate. */
export type FilterClause = { param: string } | LiteralPredicate;
