import type { Surface } from '../render/surface';
import type { CartesianModel } from '../runtime/cartesian';
import type { ScatterSpec } from '../spec/types';
import type { Datum } from '../types';
import { accessor, extent, toNumber } from '../util/data';
import { RoughPen } from '../rough';
import { clamp } from '../util/math';

interface ScatterPoint {
  x: number;
  y: number;
  r: number;
  color: string;
}

function isMissing(value: unknown): boolean {
  return value == null || value === '';
}

function isInvalidPositionValue(value: unknown): boolean {
  return (
    isMissing(value) ||
    (typeof value === 'number' && Number.isNaN(value)) ||
    (value instanceof Date && Number.isNaN(value.getTime()))
  );
}

function fixedRadius(): number {
  return 3.75;
}

function radiusScale(rows: readonly Datum[], field: string, plotSize: number): (value?: unknown) => number {
  const rMin = 3;
  const rMax = clamp(plotSize * 0.05, 10, 26);
  const mid = (rMin + rMax) / 2;
  const domain = extent(rows, field);

  if (!domain) return () => mid;

  const [min, max] = domain;
  if (min === max) return () => mid;

  return (value: unknown) => {
    const n = toNumber(value);
    if (Number.isNaN(n)) return rMin;
    const norm = clamp((n - min) / (max - min), 0, 1);
    return rMin + (rMax - rMin) * Math.sqrt(norm);
  };
}

export function drawScatter(surface: Surface, model: CartesianModel): void {
  const ctx = surface.marks.ctx;
  const spec = model.spec as ScatterSpec;
  const { plot, tokens } = model;
  const readX = accessor(model.x.field);
  const readY = accessor(model.y.field ?? '');
  const sizeField = spec.encoding.size?.field;
  const allRows = model.series.flatMap((series) => series.rows);
  const readSize = sizeField ? accessor(sizeField) : null;
  const radius = sizeField ? radiusScale(allRows, sizeField, Math.min(plot.width, plot.height)) : fixedRadius;
  const points: ScatterPoint[] = [];

  for (const series of model.series) {
    for (const row of series.rows) {
      const xValue = readX(row);
      const yValue = readY(row);
      const yNumber = toNumber(yValue);
      const px = model.x.pixel(xValue);

      if (
        px == null ||
        isInvalidPositionValue(xValue) ||
        isMissing(yValue) ||
        Number.isNaN(yNumber)
      ) {
        continue;
      }

      const py = model.y.pixel(yValue);
      if (!Number.isFinite(px) || !Number.isFinite(py)) continue;

      points.push({
        x: px,
        y: py,
        r: readSize ? radius(readSize(row)) : radius(),
        color: series.color,
      });
    }
  }

  if (sizeField) points.sort((a, b) => b.r - a.r);

  ctx.save();
  ctx.beginPath();
  ctx.rect(plot.x, plot.y, plot.width, plot.height);
  ctx.clip();

  if (model.sketch) {
    const pen = new RoughPen(ctx, model.sketch);
    for (const point of points) {
      pen.circle(point.x, point.y, point.r, {
        fill: point.color,
        fillAlpha: 0.7,
        stroke: tokens.color.background,
        strokeWidth: 1,
      });
    }
    ctx.restore();
    return;
  }

  ctx.lineWidth = 1;
  ctx.strokeStyle = tokens.color.background;

  for (const point of points) {
    ctx.beginPath();
    ctx.arc(point.x, point.y, point.r, 0, Math.PI * 2);
    ctx.fillStyle = point.color;
    ctx.globalAlpha = 0.7;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.stroke();
  }

  ctx.restore();
}
