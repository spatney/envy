import type { Surface } from '../render/surface';
import type { CartesianModel } from '../runtime/cartesian';
import type { BarSpec } from '../spec/types';
import { roundedRect } from '../shape';
import { RoughPen } from '../rough';
import { accessor, toKey, toNumber } from '../util/data';

type CornerSide = 'top' | 'bottom' | 'none';

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
}

function finite(value: number): boolean {
  return Number.isFinite(value);
}

function defaultRadius(model: CartesianModel, spec: BarSpec): number {
  return Math.max(0, spec.cornerRadius ?? Math.min(4, model.tokens.radius.sm));
}

function cornerSideFor(baseY: number, valueY: number): CornerSide {
  if (valueY < baseY) return 'top';
  if (valueY > baseY) return 'bottom';
  return 'none';
}

function makeRadii(side: CornerSide, radius: number): number | [number, number, number, number] {
  if (side === 'top') return [radius, radius, 0, 0];
  if (side === 'bottom') return [0, 0, radius, radius];
  return 0;
}

function drawRect(ctx: CanvasRenderingContext2D, rect: BarRect, radius: number, pen?: RoughPen | null): void {
  if (!finite(rect.x) || !finite(rect.y) || !finite(rect.width) || !finite(rect.height)) return;
  if (rect.width <= 0 || rect.height <= 0) return;

  if (pen) {
    pen.rect(rect.x, rect.y, rect.width, rect.height, { stroke: rect.color, fill: rect.color });
    return;
  }

  const r = Math.min(radius, rect.width / 2, rect.height / 2);
  ctx.beginPath();
  roundedRect(ctx, rect.x, rect.y, rect.width, rect.height, makeRadii(rect.cornerSide, r));
  ctx.fillStyle = rect.color;
  ctx.fill();
}

function barRect(x: number, width: number, baseY: number, valueY: number, color: string): BarRect | null {
  if (!finite(x) || !finite(width) || !finite(baseY) || !finite(valueY)) return null;
  const y = Math.min(baseY, valueY);
  const height = Math.abs(valueY - baseY);
  if (width <= 0 || height <= 0) return null;
  return {
    x,
    y,
    width,
    height,
    color,
    cornerSide: cornerSideFor(baseY, valueY),
  };
}

function drawGroupedBars(ctx: CanvasRenderingContext2D, model: CartesianModel, radius: number, pen?: RoughPen | null): void {
  const readX = accessor(model.x.field);
  const readY = accessor(model.y.field ?? '');
  const seriesCount = model.series.length;
  const bandWidth = model.x.bandwidth;
  const subWidth = seriesCount > 1 ? bandWidth / seriesCount : bandWidth;
  const gap = seriesCount > 1 && subWidth > 3 ? Math.min(1, subWidth * 0.15) : 0;
  const barWidth = Math.max(0, subWidth - gap);

  model.series.forEach((series, seriesIndex) => {
    ctx.fillStyle = series.color;
    for (const row of series.rows) {
      const raw = readY(row);
      const value = toNumber(raw);
      if (raw == null || raw === '' || !finite(value)) continue;

      const center = model.x.pixel(readX(row));
      if (center == null) continue;

      const left = center - bandWidth / 2 + seriesIndex * subWidth + gap / 2;
      const rect = barRect(left, barWidth, model.y.baseline, model.y.pixel(value), series.color);
      if (rect) drawRect(ctx, rect, radius, pen);
    }
  });
}

function drawStackedBars(ctx: CanvasRenderingContext2D, model: CartesianModel, radius: number, pen?: RoughPen | null): void {
  const readX = accessor(model.x.field);
  const readY = accessor(model.y.field ?? '');
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

      const rect = barRect(center - bandWidth / 2, bandWidth, model.y.pixel(base), model.y.pixel(top), series.color);
      if (!rect) continue;

      segments.push({ ...rect, stackEndKey });
      roundedEnds.set(stackEndKey, segments.length - 1);
    }
  }

  segments.forEach((segment, index) => {
    const isOuterSegment = roundedEnds.get(segment.stackEndKey) === index;
    drawRect(ctx, { ...segment, cornerSide: isOuterSegment ? segment.cornerSide : 'none' }, radius, pen);
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
