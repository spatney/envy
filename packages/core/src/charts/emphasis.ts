/**
 * Emphasis helpers — small, shared utilities renderers use to honor an active
 * highlight. Matching marks draw at full strength; non-matching marks fade to
 * `emphasis.dim`. Discrete marks (bars, points, cells, wedges) test per-row;
 * continuous marks (lines, areas) test the series as a whole.
 */

import type { Datum } from '../types';
import type { Emphasis } from '../interaction/types';
import type { ResolvedSeries } from '../runtime/cartesian';

/** Alpha multiplier for a single discrete mark backing `row`. */
export function rowAlpha(emphasis: Emphasis | null | undefined, row: Datum): number {
  if (!emphasis) return 1;
  return emphasis.match(row) ? 1 : emphasis.dim;
}

/** True when *any* row of a series is part of the selection. */
export function seriesMatches(
  emphasis: Emphasis | null | undefined,
  series: Pick<ResolvedSeries, 'rows'>,
): boolean {
  if (!emphasis) return true;
  return series.rows.some((row) => emphasis.match(row));
}

/** Alpha multiplier for a continuous series (line/area): full if any row matches. */
export function seriesAlpha(
  emphasis: Emphasis | null | undefined,
  series: Pick<ResolvedSeries, 'rows'>,
): number {
  if (!emphasis) return 1;
  return seriesMatches(emphasis, series) ? 1 : emphasis.dim;
}
