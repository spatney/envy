/**
 * Largest-Triangle-Three-Buckets (LTTB) downsampling.
 *
 * LTTB reduces a dense series to a target point count while preserving the
 * visual shape far better than naive every-Nth sampling — it keeps peaks,
 * troughs, and the first/last points. We run it draw-side on pixel-projected
 * points so a 100k-point line still strokes in ~plot-width segments.
 *
 * The decimator is generic over the point type (line uses {x,y}; area uses
 * {x,y0,y1}) via x/y accessors, and is gap-aware: runs separated by a
 * non-finite point are decimated independently and rejoined with a gap, so
 * missing-value breaks survive downsampling.
 */

function finite(n: number): boolean {
  return Number.isFinite(n);
}

/** Core LTTB over a fully-finite run. Returns at most `threshold` points. */
export function lttbRun<T>(
  run: readonly T[],
  threshold: number,
  getX: (p: T) => number,
  getY: (p: T) => number,
): T[] {
  const n = run.length;
  if (threshold >= n || threshold < 3) return run.slice();

  const sampled: T[] = [run[0]];
  const bucketSize = (n - 2) / (threshold - 2);
  let a = 0; // index of the last sampled point

  for (let i = 0; i < threshold - 2; i++) {
    // Average point of the *next* bucket (the triangle's far vertex).
    let rangeStart = Math.floor((i + 1) * bucketSize) + 1;
    let rangeEnd = Math.floor((i + 2) * bucketSize) + 1;
    rangeEnd = Math.min(rangeEnd, n);
    rangeStart = Math.min(rangeStart, rangeEnd);
    let avgX = 0;
    let avgY = 0;
    const avgCount = Math.max(1, rangeEnd - rangeStart);
    for (let j = rangeStart; j < rangeEnd; j++) {
      avgX += getX(run[j]);
      avgY += getY(run[j]);
    }
    avgX /= avgCount;
    avgY /= avgCount;

    // Pick the point in the *current* bucket with the largest triangle area.
    const curStart = Math.floor(i * bucketSize) + 1;
    const curEnd = Math.min(Math.floor((i + 1) * bucketSize) + 1, n - 1);
    const ax = getX(run[a]);
    const ay = getY(run[a]);
    let best = curStart;
    let bestArea = -1;
    for (let j = curStart; j < curEnd; j++) {
      const area = Math.abs(
        (ax - avgX) * (getY(run[j]) - ay) - (ax - getX(run[j])) * (avgY - ay),
      );
      if (area > bestArea) {
        bestArea = area;
        best = j;
      }
    }
    sampled.push(run[best]);
    a = best;
  }

  sampled.push(run[n - 1]);
  return sampled;
}

export interface DecimateOptions<T> {
  getX: (p: T) => number;
  getY: (p: T) => number;
  /** Produce a gap marker placed between decimated runs. */
  gap: () => T;
}

/**
 * Gap-aware LTTB. Splits `points` on non-finite (x or y) markers, decimates each
 * finite run to a share of `threshold` proportional to its length, and rejoins
 * the runs with a single gap marker. When the finite total already fits within
 * `threshold`, the input is returned unchanged (gaps preserved).
 */
export function decimate<T>(
  points: readonly T[],
  threshold: number,
  opts: DecimateOptions<T>,
): T[] {
  const { getX, getY, gap } = opts;
  if (points.length === 0) return [];

  const runs: T[][] = [];
  let cur: T[] = [];
  let finiteCount = 0;
  for (const p of points) {
    if (finite(getX(p)) && finite(getY(p))) {
      cur.push(p);
      finiteCount++;
    } else if (cur.length) {
      runs.push(cur);
      cur = [];
    }
  }
  if (cur.length) runs.push(cur);

  if (threshold < 3 || finiteCount <= threshold || runs.length === 0) {
    return points.slice();
  }

  const out: T[] = [];
  for (let r = 0; r < runs.length; r++) {
    if (r > 0) out.push(gap());
    const run = runs[r];
    const budget = Math.max(2, Math.round((threshold * run.length) / finiteCount));
    const sampled = budget >= run.length ? run : lttbRun(run, budget, getX, getY);
    for (const p of sampled) out.push(p);
  }
  return out;
}
