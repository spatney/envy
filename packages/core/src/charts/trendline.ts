/**
 * Derived trendlines for cartesian charts — a linear line of best fit overlaid
 * on a scatter, line, or area plot via `spec.trendline`.
 *
 * The regression is computed from the already-resolved `CartesianModel` series
 * (one fit per group, or a single overall fit), and the fitted line is stroked
 * across each group's x-extent. Marks land on the marks canvas; optional `R²`
 * labels live in the HTML overlay (or are painted to canvas when headless),
 * mirroring how `annotations` render. Pure presentation — no data reshaping.
 */

import type { Surface } from '../render/surface';
import type { CartesianModel } from '../runtime/cartesian';
import type { TrendlineConfig } from '../spec/types';
import { linearRegression, type RegressionFit } from '../analyze/regression';
import { fontString } from '../render/text';
import { overlayTextToCanvasCmd, paintCanvasText } from '../render/overlayText';
import { accessor, toDate, toNumber } from '../util/data';
import { crisp } from '../util/math';

const DEFAULT_STROKE_WIDTH = 2;

interface ResolvedTrendline {
  method: 'linear';
  /** undefined = auto (per-group when the chart splits into series). */
  groupBy: boolean | undefined;
  label: boolean;
  color: string | undefined;
  strokeWidth: number;
  strokeDash: number[];
}

interface TrendGroup {
  color: string;
  fit: RegressionFit;
  xMin: number;
  xMax: number;
}

/** Resolve a `trendline` field (boolean | config) to a settled config, or null. */
function resolveTrendline(value: unknown): ResolvedTrendline | null {
  if (!value) return null;
  const cfg = (typeof value === 'object' ? value : {}) as TrendlineConfig;
  return {
    method: 'linear',
    groupBy: cfg.groupBy,
    label: cfg.label ?? false,
    color: cfg.color,
    strokeWidth: cfg.strokeWidth ?? DEFAULT_STROKE_WIDTH,
    strokeDash: cfg.strokeDash ?? [],
  };
}

/** Coerce an x value to its numeric domain position (epoch ms for time scales). */
function xToNum(model: CartesianModel, value: unknown): number {
  if (model.x.kind === 'time') {
    const d = toDate(value);
    return d ? d.getTime() : NaN;
  }
  return toNumber(value);
}

/** Fit one regression per group (or a single overall fit) from the model rows. */
function trendGroups(model: CartesianModel, cfg: ResolvedTrendline): TrendGroup[] {
  const readX = accessor(model.x.field);
  const readY = accessor(model.y.field ?? '');
  const grouped = cfg.groupBy ?? model.series.length > 1;
  const muted = cfg.color ?? model.tokens.color.textMuted;

  const buckets = grouped
    ? model.series.map((s) => ({ color: cfg.color ?? s.color, rows: s.rows }))
    : [{ color: muted, rows: model.series.flatMap((s) => s.rows) }];

  const out: TrendGroup[] = [];
  for (const bucket of buckets) {
    const xs: number[] = [];
    const ys: number[] = [];
    for (const row of bucket.rows) {
      const xn = xToNum(model, readX(row));
      const yn = toNumber(readY(row));
      if (!Number.isFinite(xn) || !Number.isFinite(yn)) continue;
      xs.push(xn);
      ys.push(yn);
    }
    const fit = linearRegression(xs, ys);
    if (!fit) continue;
    out.push({ color: bucket.color, fit, xMin: Math.min(...xs), xMax: Math.max(...xs) });
  }
  return out;
}

/**
 * Stroke the fitted line(s) on the marks canvas, clipped to the plot. Call after
 * the chart's data marks so the trendline sits on top. No-op unless the spec
 * opts in via `trendline` and the x-axis is continuous/temporal.
 */
export function drawTrendlines(surface: Surface, model: CartesianModel): void {
  const cfg = resolveTrendline((model.spec as { trendline?: unknown }).trendline);
  if (!cfg || model.x.kind === 'band' || model.x.kind === 'point') return;

  const groups = trendGroups(model, cfg);
  if (groups.length === 0) return;

  const ctx = surface.marks.ctx;
  const { plot } = model;

  ctx.save();
  ctx.beginPath();
  ctx.rect(plot.x, plot.y, plot.width, plot.height);
  ctx.clip();
  ctx.lineWidth = cfg.strokeWidth;
  ctx.setLineDash(cfg.strokeDash);
  ctx.lineCap = 'round';

  for (const g of groups) {
    const x0 = model.x.pixel(g.xMin);
    const x1 = model.x.pixel(g.xMax);
    const y0 = model.y.pixel(g.fit.predict(g.xMin));
    const y1 = model.y.pixel(g.fit.predict(g.xMax));
    if (
      x0 == null ||
      x1 == null ||
      !Number.isFinite(x0) ||
      !Number.isFinite(x1) ||
      !Number.isFinite(y0) ||
      !Number.isFinite(y1)
    ) {
      continue;
    }
    ctx.strokeStyle = g.color;
    ctx.beginPath();
    ctx.moveTo(x0, crisp(y0));
    ctx.lineTo(x1, crisp(y1));
    ctx.stroke();
  }

  ctx.restore();
}

/**
 * Append `R²` labels for each fitted line to the HTML overlay (or paint them to
 * canvas when headless). Call after `drawAnnotationLabels`. No-op unless
 * `trendline.label` is set.
 */
export function drawTrendlineLabels(surface: Surface, model: CartesianModel): void {
  const cfg = resolveTrendline((model.spec as { trendline?: unknown }).trendline);
  if (!cfg || !cfg.label || model.x.kind === 'band' || model.x.kind === 'point') return;

  const groups = trendGroups(model, cfg);
  if (groups.length === 0) return;

  const { tokens, plot } = model;
  const f = tokens.font;
  const font = fontString(f.size.small, f.family, f.weight.medium);

  for (const g of groups) {
    const x1 = model.x.pixel(g.xMax);
    const y1 = model.y.pixel(g.fit.predict(g.xMax));
    if (x1 == null || !Number.isFinite(x1) || !Number.isFinite(y1)) continue;

    const text = `R\u00B2=${g.fit.r2.toFixed(2)}`;
    // Anchor just past the line end; nudge left if it would overflow the plot.
    const nearRight = x1 > plot.x + plot.width - 44;
    const left = nearRight ? x1 - 6 : x1 + 6;
    const align: 'left' | 'right' = nearRight ? 'right' : 'left';
    const transform = nearRight ? 'translateX(-100%) translateY(-50%)' : 'translateY(-50%)';
    const top = Math.min(Math.max(y1, plot.y + f.size.small), plot.y + plot.height - 2);
    const color = g.color;

    if (surface.headless) {
      paintCanvasText(
        surface.marks.ctx,
        overlayTextToCanvasCmd({ left, top, text, color, size: f.size.small, align, transform }, font),
      );
      continue;
    }

    const el = document.createElement('div');
    el.textContent = text;
    el.style.position = 'absolute';
    el.style.font = font;
    el.style.fontSize = `${f.size.small}px`;
    el.style.fontWeight = String(f.weight.medium);
    el.style.color = color;
    el.style.whiteSpace = 'nowrap';
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    el.style.transform = transform;
    el.style.pointerEvents = 'none';
    surface.overlay.appendChild(el);
  }
}
