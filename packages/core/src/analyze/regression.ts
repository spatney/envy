/**
 * Pure linear-regression helpers — the analytical core behind the `trendline`
 * overlay. Dependency-free and deterministic so the same fit is computed in the
 * browser and headless. Mirrors the covariance math used by `pearson()` in
 * `./insights`, exposed here as a reusable line-of-best-fit.
 */

export interface RegressionFit {
  /** Slope (dy/dx) of the fitted line. */
  slope: number;
  /** Y-intercept of the fitted line. */
  intercept: number;
  /** Coefficient of determination (R²), in [0, 1]. */
  r2: number;
  /** Number of finite (x, y) pairs the fit used. */
  n: number;
  /** Predict y for a given x along the fitted line. */
  predict(x: number): number;
}

/**
 * Ordinary-least-squares linear fit over paired numeric samples.
 *
 * Returns `null` when there are fewer than two points or the x values have no
 * spread (a vertical fit has an undefined slope). Non-finite pairs are ignored.
 */
export function linearRegression(
  xs: readonly number[],
  ys: readonly number[],
): RegressionFit | null {
  const len = Math.min(xs.length, ys.length);
  let n = 0;
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < len; i++) {
    const x = xs[i];
    const y = ys[i];
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    n++;
    sx += x;
    sy += y;
  }
  if (n < 2) return null;

  const mx = sx / n;
  const my = sy / n;
  let cov = 0;
  let vx = 0;
  let vy = 0;
  for (let i = 0; i < len; i++) {
    const x = xs[i];
    const y = ys[i];
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    const dx = x - mx;
    const dy = y - my;
    cov += dx * dy;
    vx += dx * dx;
    vy += dy * dy;
  }
  if (vx <= 0) return null;

  const slope = cov / vx;
  const intercept = my - slope * mx;
  // r² = (cov² / (vx·vy)); when y is constant (vy === 0) the line fits exactly.
  const r2 = vy <= 0 ? 1 : Math.min(1, (cov * cov) / (vx * vy));

  return {
    slope,
    intercept,
    r2,
    n,
    predict: (x: number) => slope * x + intercept,
  };
}
