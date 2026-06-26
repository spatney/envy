/**
 * Line chart (also handles `line` specs with `area: true` and point markers).
 * Multi-series, gap-aware (missing values break the line), curve-configurable.
 */

import type { Surface } from '../render/surface';
import type { LineSpec } from '../spec/types';
import type { Point } from '../types';
import { accessor, toNumber } from '../util/data';
import { line, area } from '../shape';
import { decimate } from '../decimate';
import { resolveCurve, type CartesianModel, type ResolvedSeries } from '../runtime/cartesian';
import { RoughPen } from '../rough';
import { minFinite, verticalFill } from './fill';

interface SeriesPoints {
  series: ResolvedSeries;
  points: Point[];
}

function buildSeriesPoints(model: CartesianModel, s: ResolvedSeries): Point[] {
  const readX = accessor(model.x.field);
  const readY = accessor(model.y.field ?? '');
  const pts: Array<Point & { sortKey: number }> = [];
  for (const d of s.rows) {
    const xv = readX(d);
    const px = model.x.pixel(xv);
    const yRaw = readY(d);
    const py = yRaw == null || yRaw === '' ? NaN : model.y.pixel(yRaw);
    pts.push({
      x: px == null ? NaN : px,
      y: Number.isNaN(toNumber(yRaw)) ? NaN : py,
      sortKey: px == null ? Number.POSITIVE_INFINITY : px,
    });
  }
  pts.sort((a, b) => a.sortKey - b.sortKey);
  const points: Point[] = pts.map(({ x, y }) => ({ x, y }));
  const threshold = Math.max(2, Math.round(model.plot.width));
  return decimate(points, threshold, {
    getX: (p) => p.x,
    getY: (p) => p.y,
    gap: () => ({ x: NaN, y: NaN }),
  });
}

/** Split a point list into contiguous runs of finite points (gap-aware). */
function finiteRuns(points: readonly Point[]): Point[][] {
  const runs: Point[][] = [];
  let run: Point[] = [];
  for (const p of points) {
    if (Number.isNaN(p.x) || Number.isNaN(p.y)) {
      if (run.length) runs.push(run);
      run = [];
    } else {
      run.push(p);
    }
  }
  if (run.length) runs.push(run);
  return runs;
}

/** Hand-drawn path: hachure area fills, wobbly multi-pass strokes, circle markers. */
function drawLineSketch(
  model: CartesianModel,
  allSeries: SeriesPoints[],
  pen: RoughPen,
  filled: boolean,
  showPoints: boolean,
): void {
  if (filled) {
    for (const { series, points } of allSeries) {
      for (const run of finiteRuns(points)) {
        if (run.length < 2) continue;
        const poly: Point[] = [
          ...run,
          ...run.map((p) => ({ x: p.x, y: model.y.baseline })).reverse(),
        ];
        pen.polygon(poly, { fill: series.color, fillAlpha: 0.5 });
      }
    }
  }

  for (const { series, points } of allSeries) {
    pen.polyline(points, { stroke: series.color });
  }

  if (showPoints) {
    for (const { series, points } of allSeries) {
      for (const p of points) {
        if (Number.isNaN(p.x) || Number.isNaN(p.y)) continue;
        pen.circle(p.x, p.y, 3.4, {
          fill: series.color,
          stroke: model.tokens.color.background,
          strokeWidth: 1.5,
        });
      }
    }
  }
}

export function drawLine(surface: Surface, model: CartesianModel): void {
  const ctx = surface.marks.ctx;
  const spec = model.spec as LineSpec;
  const { plot, tokens } = model;
  const curve = resolveCurve(spec.curve);
  const lineGen = line({ curve });
  const areaGen = spec.area ? area({ curve }) : null;

  const allSeries: SeriesPoints[] = model.series.map((s) => ({
    series: s,
    points: buildSeriesPoints(model, s),
  }));

  const showPoints = spec.points || allSeries.some((s) => s.points.filter((p) => !Number.isNaN(p.x)).length === 1);

  ctx.save();
  ctx.beginPath();
  ctx.rect(plot.x, plot.y, plot.width, plot.height);
  ctx.clip();

  if (model.sketch) {
    drawLineSketch(model, allSeries, new RoughPen(ctx, model.sketch), Boolean(areaGen), showPoints);
    ctx.restore();
    return;
  }

  // Area fills first (behind the strokes) — a vertical gradient that's richest
  // just under the line and fades to transparent at the baseline.
  if (areaGen) {
    for (const { series, points } of allSeries) {
      const top = minFinite(
        points.map((p) => p.y),
        plot.y,
      );
      ctx.beginPath();
      areaGen(
        points.map((p) => ({ x: p.x, y0: model.y.baseline, y1: p.y })),
        ctx,
      );
      ctx.fillStyle = verticalFill(ctx, series.color, top, model.y.baseline, 0.26, 0.0);
      ctx.fill();
    }
  }

  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(1.75, tokens.stroke.thick);

  for (const { series, points } of allSeries) {
    ctx.beginPath();
    lineGen(points, ctx);
    ctx.strokeStyle = series.color;
    ctx.stroke();
  }

  // Point markers.
  if (showPoints) {
    for (const { series, points } of allSeries) {
      ctx.fillStyle = series.color;
      ctx.strokeStyle = tokens.color.background;
      ctx.lineWidth = 1.5;
      for (const p of points) {
        if (Number.isNaN(p.x) || Number.isNaN(p.y)) continue;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }
  }

  ctx.restore();
}
