/**
 * Declarative data transforms.
 *
 * A `transform` is an ordered pipeline that reshapes the `data` array *inside*
 * the spec — so an agent fixes data shape by editing validatable JSON instead of
 * pre-massaging rows in code. Every transform is plain JSON (no functions) and
 * pure: `applyTransforms` never mutates its input.
 *
 * The pipeline is applied before the chart model is built (and before any
 * cross-filter selection), so encodings can reference fields the transforms
 * produce (e.g. an `aggregate` output column).
 */

import type { AggOp } from '../../pivot';

/** One aggregation within an {@link AggregateTransform}. */
export interface AggregateOp {
  /** Aggregation operation. `count` needs no `field`. */
  op: AggOp;
  /** Source column to aggregate (omit only for `count`). */
  field?: string;
  /** Output column receiving the aggregated value. */
  as: string;
}

/**
 * Group rows by `groupby` and summarize each group into a single output row.
 * Omitting `groupby` collapses the whole dataset into one row.
 */
export interface AggregateTransform {
  aggregate: AggregateOp[];
  groupby?: string[];
}

/**
 * Bucket a quantitative `bin` field into evenly sized bins. Drives the histogram
 * chart and any "distribution" view without pre-binning in user code.
 */
export interface BinTransform {
  /** Numeric column to bin. */
  bin: string;
  /**
   * Output column(s). A single name receives the bin **start**; a `[start, end]`
   * pair receives both edges (handy for histogram bars and range labels).
   */
  as: string | [string, string];
  /** Target bin count; a "nice" step approximates it. Default 10. */
  maxbins?: number;
  /** Explicit bin width. Overrides `maxbins` when set. */
  step?: number;
  /** Restrict binning to this `[min, max]`; values outside get a `null` bin. */
  extent?: [number, number];
  /** Snap the bin domain to round numbers (default true). */
  nice?: boolean;
}

/**
 * A declarative, JSON predicate for {@link FilterTransform}. Leaf predicates test
 * one `field`; `and` / `or` / `not` compose them. Comparisons coerce numerically
 * (numbers first, then dates), so temporal bounds work as ISO strings.
 */
export type FilterPredicate =
  | { field: string; equals: unknown }
  | { field: string; ne: unknown }
  | { field: string; oneOf: unknown[] }
  | { field: string; range: [number | string, number | string] }
  | { field: string; contains: string }
  | { field: string; gt: number | string }
  | { field: string; gte: number | string }
  | { field: string; lt: number | string }
  | { field: string; lte: number | string }
  | { field: string; valid: boolean }
  | { and: FilterPredicate[] }
  | { or: FilterPredicate[] }
  | { not: FilterPredicate };

/** Keep only rows matching `filter`. */
export interface FilterTransform {
  filter: FilterPredicate;
}

/**
 * Gather several columns into key/value rows (wide → long). Each input row is
 * repeated once per folded column. Use it to turn a wide table into a tidy one a
 * `series` channel can split.
 */
export interface FoldTransform {
  fold: string[];
  /** Output `[key, value]` column names. Default `['key', 'value']`. */
  as?: [string, string];
}

/** Calendar unit a {@link TimeUnitTransform} truncates a timestamp to. */
export type TimeUnit =
  | 'year'
  | 'quarter'
  | 'month'
  | 'week'
  | 'day'
  | 'hour'
  | 'minute'
  | 'second';

/**
 * Truncate a temporal `field` to the start of a calendar unit (e.g. month),
 * writing a `Date` to `as`. Lets agents aggregate by period without date math.
 */
export interface TimeUnitTransform {
  timeUnit: TimeUnit;
  field: string;
  as: string;
}

/**
 * Derive a new column from a **safe expression** evaluated per row, writing the
 * result to `as`. The expression language supports arithmetic, comparison,
 * logical and ternary operators, string concatenation, member access
 * (`datum['my field']`), and a whitelist of functions (e.g. `round`, `lower`,
 * `if`, `coalesce`). Bare identifiers reference row columns. It is parsed to an
 * AST and evaluated with **no `eval`/`Function`** and no access to globals.
 */
export interface CalculateTransform {
  calculate: string;
  as: string;
}

/**
 * A single declarative transform step. Distinguished by its operator key
 * (`aggregate` / `bin` / `filter` / `fold` / `timeUnit` / `calculate`); a step
 * carries exactly one. Applied in array order by {@link applyTransforms}.
 */
export type Transform =
  | AggregateTransform
  | BinTransform
  | FilterTransform
  | FoldTransform
  | TimeUnitTransform
  | CalculateTransform;

/** Operator keys that identify a transform step (one per step). */
export const TRANSFORM_KINDS = ['aggregate', 'bin', 'filter', 'fold', 'timeUnit', 'calculate'] as const;

/** Supported {@link TimeUnit} values, for validation/UX. */
export const TIME_UNITS: readonly TimeUnit[] = [
  'year',
  'quarter',
  'month',
  'week',
  'day',
  'hour',
  'minute',
  'second',
];
