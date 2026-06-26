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
import { resolveCurve, type CartesianModel, type ResolvedSeries } from '../runtime/cartesian';

interface BandPoints {
  series: ResolvedSeries;
  points: AreaPoint[];
}

/** Build per-series area bands, stacking cumulatively in value-space when asked. */
function buildBands(model: CartesianModel, stacked: boolean): BandPoints[] {
  const readX = accessor(model.x.field);
  const readY = accessor(model.y.field ?? '');
  const cumulative = new Map<string, number>();

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
    return { series, points: points.map(({ x, y0, y1 }) => ({ x, y0, y1 })) };
  });
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
  const fillAlpha = stacked ? 0.9 : 0.25;

  ctx.save();
  ctx.beginPath();
  ctx.rect(plot.x, plot.y, plot.width, plot.height);
  ctx.clip();

  for (const { series, points } of bands) {
    ctx.beginPath();
    areaGen(points, ctx);
    ctx.globalAlpha = fillAlpha;
    ctx.fillStyle = series.color;
    ctx.fill();
    ctx.globalAlpha = 1;
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
