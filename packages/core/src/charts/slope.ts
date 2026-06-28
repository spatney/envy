/**
 * Slope chart renderer.
 *
 * Draws one line per series across ordinal x positions, then adds direct labels
 * at the ends. Axis chrome is delegated to a synthetic cartesian base model.
 */

import type { Surface } from '../render/surface';
import type { Size } from '../types';
import type { ChartSpec, SlopeSpec } from '../spec/types';
import type { ThemeTokens } from '../theme';
import type { InteractionModel } from '../interaction/types';
import { RoughPen } from '../rough';
import { drawAxesUnderlay, drawOverlay } from '../axes';
import { addOverlayText } from './chrome';
import { formatValue, formatNumber } from '../format';
import { buildSlopeModel, type SlopeModel, type SlopePoint, type SlopeSeries } from '../runtime/slope';
import type { RenderContext } from './index';

const HIT_RADIUS = 8;
const LABEL_WIDTH = 68;

function fmtValue(v: number, format?: string): string {
  return format ? formatValue(v, format) : formatNumber(v, ',');
}

function drawLines(surface: Surface, model: SlopeModel): void {
  const ctx = surface.marks.ctx;
  const pen = model.sketch ? new RoughPen(ctx, model.sketch) : null;

  ctx.save();
  ctx.beginPath();
  ctx.rect(model.plot.x, model.plot.y, model.plot.width, model.plot.height);
  ctx.clip();

  for (const series of model.series) {
    const points = series.points;
    if (points.length === 0) continue;
    if (pen && points.length >= 2) {
      pen.polyline(points, { stroke: series.color });
    } else if (points.length >= 2) {
      ctx.beginPath();
      ctx.strokeStyle = series.color;
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.moveTo(points[0].x, points[0].y);
      for (const p of points.slice(1)) ctx.lineTo(p.x, p.y);
      ctx.stroke();
    }

    for (const p of points) {
      if (pen) {
        pen.circle(p.x, p.y, 3.5, { fill: series.color, stroke: series.color });
      } else {
        ctx.beginPath();
        ctx.fillStyle = series.color;
        ctx.strokeStyle = model.tokens.color.background;
        ctx.lineWidth = 1.5;
        ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }
  }
  ctx.restore();
}

function drawEndLabels(surface: Surface, model: SlopeModel): void {
  if (!model.showLabels) return;
  const { tokens } = model;
  const labelSize = tokens.font.size.tiny;
  const valueSize = tokens.font.size.tiny;

  for (const series of model.series) {
    if (series.points.length === 0) continue;
    const first = series.points[0];
    const last = series.points[series.points.length - 1];

    addOverlayText(surface, tokens, {
      left: first.x - 8 - LABEL_WIDTH,
      top: first.y - labelSize - 2,
      width: LABEL_WIDTH,
      text: series.label,
      color: series.color,
      size: labelSize,
      weight: tokens.font.weight.bold,
      align: 'right',
    });
    addOverlayText(surface, tokens, {
      left: first.x - 8 - LABEL_WIDTH,
      top: first.y + 1,
      width: LABEL_WIDTH,
      text: fmtValue(first.value, model.format),
      color: tokens.color.textMuted,
      size: valueSize,
      align: 'right',
    });

    if (last !== first) {
      addOverlayText(surface, tokens, {
        left: last.x + 8,
        top: last.y - valueSize / 2,
        width: LABEL_WIDTH,
        text: fmtValue(last.value, model.format),
        color: series.color,
        size: valueSize,
        weight: tokens.font.weight.medium,
        align: 'left',
      });
    }
  }
}

function nearestPoint(model: SlopeModel, px: number, py: number): { series: SlopeSeries; point: SlopePoint } | null {
  let best: { series: SlopeSeries; point: SlopePoint; d2: number } | null = null;
  const maxD2 = HIT_RADIUS * HIT_RADIUS;
  for (const series of model.series) {
    for (const point of series.points) {
      const dx = px - point.x;
      const dy = py - point.y;
      const d2 = dx * dx + dy * dy;
      if (d2 <= maxD2 && (!best || d2 < best.d2)) best = { series, point, d2 };
    }
  }
  return best ? { series: best.series, point: best.point } : null;
}

export function drawSlope(
  surface: Surface,
  spec: ChartSpec,
  tokens: ThemeTokens,
  size: Size,
  _context?: RenderContext,
): InteractionModel | void {
  const slope = spec as SlopeSpec;
  const model = buildSlopeModel(slope, tokens, size);

  drawAxesUnderlay(surface, model.base);
  drawLines(surface, model);
  drawOverlay(surface, model.base);
  drawEndLabels(surface, model);

  if (model.series.length === 0) return;

  const { plot } = model;
  const seriesField = slope.encoding.series.field;

  return {
    region: { x: plot.x, y: plot.y, width: plot.width, height: plot.height },
    hitTest: (px, py) => {
      const hit = nearestPoint(model, px, py);
      if (!hit) return null;
      return {
        key: `${hit.series.key}:${hit.point.catKey}`,
        anchorX: hit.point.x,
        anchorY: hit.point.y,
        content: {
          title: hit.series.label,
          rows: [{ swatch: hit.series.color, label: hit.point.label, value: fmtValue(hit.point.value, model.format) }],
        },
      };
    },
    pick: (px, py) => {
      const hit = nearestPoint(model, px, py);
      if (!hit) return null;
      return { kind: 'point', fields: [seriesField], tuples: [[hit.series.value]] };
    },
  };
}
