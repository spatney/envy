/**
 * Line chart (also handles `line` specs with `area: true` and point markers).
 * Multi-series, gap-aware (missing values break the line), curve-configurable.
 */

import type { Surface } from '../render/surface';
import type { LineSpec } from '../spec/types';
import type { Point } from '../types';
import { accessor, toNumber } from '../util/data';
import { line, area } from '../shape';
import { resolveCurve, type CartesianModel, type ResolvedSeries } from '../runtime/cartesian';

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
  return pts.map(({ x, y }) => ({ x, y }));
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

  ctx.save();
  ctx.beginPath();
  ctx.rect(plot.x, plot.y, plot.width, plot.height);
  ctx.clip();

  // Area fills first (behind the strokes).
  if (areaGen) {
    for (const { series, points } of allSeries) {
      ctx.beginPath();
      areaGen(
        points.map((p) => ({ x: p.x, y0: model.y.baseline, y1: p.y })),
        ctx,
      );
      ctx.globalAlpha = 0.14;
      ctx.fillStyle = series.color;
      ctx.fill();
      ctx.globalAlpha = 1;
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
  const showPoints = spec.points || allSeries.some((s) => s.points.filter((p) => !Number.isNaN(p.x)).length === 1);
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
