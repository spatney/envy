import type { Surface } from '../render/surface';
import type { CartesianModel } from '../runtime/cartesian';
import type { BarSpec } from '../spec/types';
import { roundedRect } from '../shape';
import { RoughPen } from '../rough';
import { accessor, toKey, toNumber } from '../util/data';
import { rowAlpha } from './emphasis';

type CornerSide = 'top' | 'bottom' | 'left' | 'right' | 'none';

interface BarRect {
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  cornerSide: CornerSide;
}

interface StackSegment extends BarRect {
  stackEndKey: string;
  alpha: number;
}

function finite(value: number): boolean {
  return Number.isFinite(value);
}

function defaultRadius(model: CartesianModel, spec: BarSpec): number {
  return Math.max(0, spec.cornerRadius ?? Math.min(4, model.tokens.radius.sm));
}

function makeRadii(side: CornerSide, radius: number): number | [number, number, number, number] {
  if (side === 'top') return [radius, radius, 0, 0];
  if (side === 'bottom') return [0, 0, radius, radius];
  if (side === 'right') return [0, radius, radius, 0];
  if (side === 'left') return [radius, 0, 0, radius];
  return 0;
}

function drawRect(
  ctx: CanvasRenderingContext2D,
  rect: BarRect,
  radius: number,
  pen?: RoughPen | null,
  alpha = 1,
): void {
  if (!finite(rect.x) || !finite(rect.y) || !finite(rect.width) || !finite(rect.height)) return;
  if (rect.width <= 0 || rect.height <= 0) return;

  const prevAlpha = ctx.globalAlpha;
  if (alpha !== 1) ctx.globalAlpha = prevAlpha * alpha;

  if (pen) {
    pen.rect(rect.x, rect.y, rect.width, rect.height, { stroke: rect.color, fill: rect.color });
    if (alpha !== 1) ctx.globalAlpha = prevAlpha;
    return;
  }

  const r = Math.min(radius, rect.width / 2, rect.height / 2);
  ctx.beginPath();
  roundedRect(ctx, rect.x, rect.y, rect.width, rect.height, makeRadii(rect.cornerSide, r));
  ctx.fillStyle = rect.color;
  ctx.fill();
  if (alpha !== 1) ctx.globalAlpha = prevAlpha;
}

/**
 * Build a screen-space rect from category-axis and value-axis pixels. `catStart`
 * and `catThick` are the bar's position and thickness along the category (band)
 * axis; `base` and `value` are pixels along the value axis. For vertical bars the
 * category axis is horizontal (screen x) and the value axis vertical; for
 * horizontal bars they swap. Corners round on the growing value end.
 */
function orientedRect(
  horizontal: boolean,
  catStart: number,
  catThick: number,
  base: number,
  value: number,
  color: string,
): BarRect | null {
  if (!finite(catStart) || !finite(catThick) || !finite(base) || !finite(value)) return null;
  const lo = Math.min(base, value);
  const len = Math.abs(value - base);
  if (catThick <= 0 || len <= 0) return null;
  if (horizontal) {
    return {
      x: lo,
      y: catStart,
      width: len,
      height: catThick,
      color,
      cornerSide: value > base ? 'right' : value < base ? 'left' : 'none',
    };
  }
  return {
    x: catStart,
    y: lo,
    width: catThick,
    height: len,
    color,
    cornerSide: value < base ? 'top' : value > base ? 'bottom' : 'none',
  };
}

function drawGroupedBars(ctx: CanvasRenderingContext2D, model: CartesianModel, radius: number, pen?: RoughPen | null): void {
  const readX = accessor(model.x.field);
  const readY = accessor(model.y.field ?? '');
  const horizontal = model.orientation === 'horizontal';
  const seriesCount = model.series.length;
  const bandWidth = model.x.bandwidth;
  const subWidth = seriesCount > 1 ? bandWidth / seriesCount : bandWidth;
  const gap = seriesCount > 1 && subWidth > 3 ? Math.min(1, subWidth * 0.15) : 0;
  const barThick = Math.max(0, subWidth - gap);

  model.series.forEach((series, seriesIndex) => {
    ctx.fillStyle = series.color;
    for (const row of series.rows) {
      const raw = readY(row);
      const value = toNumber(raw);
      if (raw == null || raw === '' || !finite(value)) continue;

      const center = model.x.pixel(readX(row));
      if (center == null) continue;

      const catStart = center - bandWidth / 2 + seriesIndex * subWidth + gap / 2;
      const rect = orientedRect(horizontal, catStart, barThick, model.y.baseline, model.y.pixel(value), series.color);
      if (rect) drawRect(ctx, rect, radius, pen, rowAlpha(model.emphasis, row));
    }
  });
}

function drawStackedBars(ctx: CanvasRenderingContext2D, model: CartesianModel, radius: number, pen?: RoughPen | null): void {
  const readX = accessor(model.x.field);
  const readY = accessor(model.y.field ?? '');
  const horizontal = model.orientation === 'horizontal';
  const positiveTotals = new Map<string, number>();
  const negativeTotals = new Map<string, number>();
  const segments: StackSegment[] = [];
  const roundedEnds = new Map<string, number>();
  const bandWidth = model.x.bandwidth;

  for (const series of model.series) {
    for (const row of series.rows) {
      const xValue = readX(row);
      const center = model.x.pixel(xValue);
      if (center == null) continue;

      const raw = readY(row);
      const value = toNumber(raw);
      if (raw == null || raw === '' || !finite(value) || value === 0) continue;

      const categoryKey = toKey(xValue);
      const totals = value >= 0 ? positiveTotals : negativeTotals;
      const stackEndKey = `${value >= 0 ? 'pos' : 'neg'}:${categoryKey}`;
      const base = totals.get(categoryKey) ?? 0;
      const top = base + value;
      totals.set(categoryKey, top);

      const rect = orientedRect(horizontal, center - bandWidth / 2, bandWidth, model.y.pixel(base), model.y.pixel(top), series.color);
      if (!rect) continue;

      segments.push({ ...rect, stackEndKey, alpha: rowAlpha(model.emphasis, row) });
      roundedEnds.set(stackEndKey, segments.length - 1);
    }
  }

  segments.forEach((segment, index) => {
    const isOuterSegment = roundedEnds.get(segment.stackEndKey) === index;
    drawRect(ctx, { ...segment, cornerSide: isOuterSegment ? segment.cornerSide : 'none' }, radius, pen, segment.alpha);
  });
}

export function drawBar(surface: Surface, model: CartesianModel): void {
  const ctx = surface.marks.ctx;
  const spec = model.spec as BarSpec;
  const { plot } = model;
  const radius = defaultRadius(model, spec);
  const pen = model.sketch ? new RoughPen(ctx, model.sketch) : null;

  if (model.x.kind !== 'band' || model.x.bandwidth <= 0 || model.series.length === 0) return;

  ctx.save();
  ctx.beginPath();
  ctx.rect(plot.x, plot.y, plot.width, plot.height);
  ctx.clip();

  if (model.stacked) {
    drawStackedBars(ctx, model, radius, pen);
  } else {
    drawGroupedBars(ctx, model, radius, pen);
  }

  ctx.restore();
}
