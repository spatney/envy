/**
 * Area chart. Two modes:
 *   - overlapping (default): each series filled from the zero baseline with a
 *     translucent fill + opaque top stroke, so overlaps stay legible.
 *   - stacked (`stack: true`): series are accumulated per x value; each band
 *     spans from the running total below it to the new total, with mostly-opaque
 *     fills for a clean stacked look.
 *
 * Consumes the prebuilt `CartesianModel` (x/y scales, resolved series, baseline).
 */

import type { Surface } from '../render/surface';
import type { AreaSpec } from '../spec/types';
import { accessor, toKey, toNumber } from '../util/data';
import { area, line, type AreaPoint } from '../shape';
import { decimate } from '../decimate';
import { resolveCurve, type CartesianModel, type ResolvedSeries } from '../runtime/cartesian';
import { RoughPen } from '../rough';
import type { Point } from '../types';
import { maxFinite, minFinite, verticalFill } from './fill';

interface BandPoints {
  series: ResolvedSeries;
  points: AreaPoint[];
}

/** Build per-series area bands, stacking cumulatively in value-space when asked. */
function buildBands(model: CartesianModel, stacked: boolean): BandPoints[] {
  const readX = accessor(model.x.field);
  const readY = accessor(model.y.field ?? '');
  const cumulative = new Map<string, number>();
  // Stacked bands must share x samples to stay aligned, so only the
  // independent (overlapping) mode is downsampled.
  const threshold = stacked ? Infinity : Math.max(2, Math.round(model.plot.width));

  return model.series.map((series) => {
    const points: Array<AreaPoint & { sortKey: number }> = [];
    for (const row of series.rows) {
      const xv = readX(row);
      const px = model.x.pixel(xv);
      const raw = readY(row);
      const value = toNumber(raw);
      const missing = raw == null || raw === '' || Number.isNaN(value);

      if (stacked) {
        const key = toKey(xv);
        const base = cumulative.get(key) ?? 0;
        const top = base + (missing ? 0 : value);
        cumulative.set(key, top);
        points.push({
          x: px == null ? NaN : px,
          y0: model.y.pixel(base),
          y1: missing ? NaN : model.y.pixel(top),
          sortKey: px == null ? Number.POSITIVE_INFINITY : px,
        });
      } else {
        points.push({
          x: px == null ? NaN : px,
          y0: model.y.baseline,
          y1: missing ? NaN : model.y.pixel(value),
          sortKey: px == null ? Number.POSITIVE_INFINITY : px,
        });
      }
    }
    points.sort((a, b) => a.sortKey - b.sortKey);
    const band: AreaPoint[] = points.map(({ x, y0, y1 }) => ({ x, y0, y1 }));
    const reduced = Number.isFinite(threshold)
      ? decimate(band, threshold, {
          getX: (p) => p.x,
          getY: (p) => p.y1,
          gap: () => ({ x: NaN, y0: NaN, y1: NaN }),
        })
      : band;
    return { series, points: reduced };
  });
}

/** Hand-drawn path: hachure-filled bands with wobbly top edges (gap-aware). */
function drawAreaSketch(model: CartesianModel, bands: BandPoints[], pen: RoughPen, stacked: boolean): void {
  for (const { series, points } of bands) {
    let run: AreaPoint[] = [];
    const flush = (): void => {
      if (run.length >= 2) {
        const top: Point[] = run.map((p) => ({ x: p.x, y: p.y1 }));
        const bottom: Point[] = run.map((p) => ({ x: p.x, y: p.y0 })).reverse();
        pen.polygon([...top, ...bottom], {
          fill: series.color,
          fillAlpha: stacked ? 0.85 : 0.5,
        });
      }
      run = [];
    };
    for (const p of points) {
      if (Number.isNaN(p.x) || Number.isNaN(p.y1)) flush();
      else run.push(p);
    }
    flush();
  }

  for (const { series, points } of bands) {
    pen.polyline(
      points.map((p) => ({ x: p.x, y: p.y1 })),
      { stroke: series.color },
    );
  }
}

export function drawArea(surface: Surface, model: CartesianModel): void {
  const ctx = surface.marks.ctx;
  const spec = model.spec as AreaSpec;
  const { plot, tokens } = model;
  const curve = resolveCurve(spec.curve);
  const areaGen = area({ curve });
  const lineGen = line({ curve });
  const stacked = model.stacked;

  // Painter's order: for stacked charts the topmost band must paint last so its
  // edge sits above neighbours; bottom-up matches the resolved series order.
  const bands = buildBands(model, stacked);

  ctx.save();
  ctx.beginPath();
  ctx.rect(plot.x, plot.y, plot.width, plot.height);
  ctx.clip();

  if (model.sketch) {
    drawAreaSketch(model, bands, new RoughPen(ctx, model.sketch), stacked);
    ctx.restore();
    return;
  }

  // Gradient fills: overlapping bands fade to near-transparent at the baseline;
  // stacked bands stay mostly opaque with a subtle vertical sheen for depth.
  for (const { series, points } of bands) {
    const top = minFinite(
      points.map((p) => p.y1),
      plot.y,
    );
    const bottom = stacked
      ? maxFinite(
          points.map((p) => p.y0),
          model.y.baseline,
        )
      : model.y.baseline;
    ctx.beginPath();
    areaGen(points, ctx);
    ctx.fillStyle = stacked
      ? verticalFill(ctx, series.color, top, bottom, 0.96, 0.74)
      : verticalFill(ctx, series.color, top, bottom, 0.3, 0.02);
    ctx.fill();
  }

  // Top edge strokes for crisp band separation.
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(1.5, tokens.stroke.base);
  for (const { series, points } of bands) {
    ctx.beginPath();
    lineGen(
      points.map((p) => ({ x: p.x, y: p.y1 })),
      ctx,
    );
    ctx.strokeStyle = series.color;
    ctx.globalAlpha = stacked ? 1 : 0.95;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  ctx.restore();
}
