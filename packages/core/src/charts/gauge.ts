import { parseColor, rgbaToCss } from '../color';
import { formatValue } from '../format';
import type { InteractionModel, TooltipRow } from '../interaction/types';
import { aggregateValues } from '../pivot';
import type { Surface } from '../render/surface';
import { RoughPen } from '../rough';
import { resolveSketch } from '../spec/sketch';
import type { ChartSpec, GaugeSpec, ValueRef } from '../spec/types';
import type { ThemeTokens } from '../theme';
import type { Datum, Point, Rect, Size } from '../types';
import { accessor } from '../util/data';
import { addOverlayText, CHROME_PAD, drawTitleBlock, resolveTitle } from './chrome';
import type { RenderContext } from './index';

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function resolveValue(ref: ValueRef | undefined, data: readonly Datum[]): number | null {
  if (ref == null) return null;
  if (typeof ref === 'number') return Number.isFinite(ref) ? ref : null;
  return aggregateValues((data ?? []).map(accessor(ref.field)), ref.aggregate ?? 'sum');
}

function valueField(ref: ValueRef): string | null {
  return typeof ref === 'number' ? null : ref.field;
}

function titleText(title: unknown): string | undefined {
  return resolveTitle(title).text;
}

function withAlpha(color: string, alpha: number): string {
  const rgba = parseColor(color);
  return rgba ? rgbaToCss({ ...rgba, a: alpha }) : color;
}

function pointOnArc(cx: number, cy: number, radius: number, angle: number): Point {
  return { x: cx + Math.cos(angle) * radius, y: cy - Math.sin(angle) * radius };
}

function arcPoints(cx: number, cy: number, radius: number, startAngle: number, endAngle: number): Point[] {
  const span = Math.abs(startAngle - endAngle);
  const steps = Math.max(6, Math.ceil(span / (Math.PI / 36)));
  const points: Point[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    points.push(pointOnArc(cx, cy, radius, startAngle + (endAngle - startAngle) * t));
  }
  return points;
}

function strokePoints(
  ctx: CanvasRenderingContext2D,
  pen: RoughPen | null,
  points: readonly Point[],
  color: string,
  width: number,
): void {
  if (points.length < 2) return;
  if (pen) {
    pen.polyline(points, { stroke: color, strokeWidth: width });
    return;
  }
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = color;
  ctx.stroke();
  ctx.restore();
}

function drawCircle(
  ctx: CanvasRenderingContext2D,
  pen: RoughPen | null,
  cx: number,
  cy: number,
  radius: number,
  fill: string,
  stroke?: string,
): void {
  if (pen) {
    pen.circle(cx, cy, radius, { fill, stroke: stroke ?? fill, strokeWidth: 1 });
    return;
  }
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  ctx.restore();
}

function drawCenteredMessage(surface: Surface, tokens: ThemeTokens, rect: Rect, text: string): void {
  addOverlayText(surface, tokens, {
    left: rect.x,
    top: rect.y + Math.max(CHROME_PAD.top, rect.height / 2 - tokens.font.size.small / 2),
    width: rect.width,
    text,
    color: tokens.color.textMuted,
    size: tokens.font.size.small,
    align: 'center',
  });
}

export function drawGauge(
  surface: Surface,
  spec: ChartSpec,
  tokens: ThemeTokens,
  size: Size,
  context?: RenderContext,
): InteractionModel | void {
  void context;
  const gauge = spec as GaugeSpec;
  const ctx = surface.marks.ctx;
  const content = drawTitleBlock(surface, tokens, size, gauge.title);
  const data = gauge.data ?? [];
  const value = resolveValue(gauge.value, data);
  const target = resolveValue(gauge.target, data);
  const min = gauge.min ?? 0;
  const max = gauge.max;

  if (value == null || !Number.isFinite(min) || !Number.isFinite(max) || max <= min || content.width <= 0 || content.height <= 0) {
    drawCenteredMessage(surface, tokens, content, 'No value');
    return;
  }

  const valueText = formatValue(value, gauge.format);
  const caption = gauge.label ?? titleText(gauge.title) ?? valueField(gauge.value) ?? 'Value';
  const valueSize = clamp(Math.min(content.width / Math.max(6, valueText.length * 0.55), tokens.font.size.title * 2.4), 24, 42);
  const captionSize = tokens.font.size.small;
  const readoutReserve = valueSize + captionSize + 24;
  const radius = Math.max(18, Math.min((content.width - 48) / 2, content.height - readoutReserve - 18));
  const cx = content.x + content.width / 2;
  const cy = content.y + Math.max(radius + 8, (content.height - readoutReserve + radius) / 2);
  const trackWidth = clamp(radius * 0.17, 10, 22);
  const accent = tokens.color.palette[0] ?? tokens.color.accent;
  const track = withAlpha(tokens.color.border || tokens.color.textMuted, tokens.dark ? 0.75 : 0.9);
  const needleColor = tokens.color.text;
  const toAngle = (v: number): number => Math.PI - clamp((v - min) / (max - min), 0, 1) * Math.PI;
  const valueAngle = toAngle(value);
  const sketch = resolveSketch(spec);
  const pen = sketch ? new RoughPen(ctx, sketch) : null;

  strokePoints(ctx, pen, arcPoints(cx, cy, radius, Math.PI, 0), track, trackWidth);

  if (gauge.bands?.length) {
    let prev = min;
    gauge.bands.forEach((band, i) => {
      const to = clamp(band.to, min, max);
      if (to <= prev) return;
      const color = band.color ?? tokens.color.palette[i % tokens.color.palette.length] ?? accent;
      strokePoints(ctx, pen, arcPoints(cx, cy, radius, toAngle(prev), toAngle(to)), color, trackWidth);
      prev = to;
    });
    if (prev < max) {
      strokePoints(ctx, pen, arcPoints(cx, cy, radius, toAngle(prev), 0), withAlpha(tokens.color.border, 0.6), trackWidth);
    }
  } else {
    strokePoints(ctx, pen, arcPoints(cx, cy, radius, Math.PI, valueAngle), accent, trackWidth);
  }

  const needleEnd = pointOnArc(cx, cy, radius - trackWidth * 0.45, valueAngle);
  strokePoints(ctx, pen, [{ x: cx, y: cy }, needleEnd], needleColor, Math.max(1.5, tokens.stroke.thick));
  drawCircle(ctx, pen, cx, cy, Math.max(3, trackWidth * 0.22), tokens.color.surface, needleColor);

  if (target != null) {
    const a = toAngle(target);
    const outer = pointOnArc(cx, cy, radius + trackWidth * 0.55, a);
    const inner = pointOnArc(cx, cy, radius - trackWidth * 0.7, a);
    strokePoints(ctx, pen, [outer, inner], tokens.color.negative ?? tokens.color.text, Math.max(2, tokens.stroke.thick));
  }

  const leftTick = pointOnArc(cx, cy, radius, Math.PI);
  const rightTick = pointOnArc(cx, cy, radius, 0);
  addOverlayText(surface, tokens, {
    left: leftTick.x - 32,
    top: leftTick.y + 6,
    width: 64,
    text: formatValue(min, gauge.format),
    color: tokens.color.textMuted,
    size: tokens.font.size.tiny,
    align: 'center',
  });
  addOverlayText(surface, tokens, {
    left: rightTick.x - 32,
    top: rightTick.y + 6,
    width: 64,
    text: formatValue(max, gauge.format),
    color: tokens.color.textMuted,
    size: tokens.font.size.tiny,
    align: 'center',
  });

  const readoutTop = Math.min(content.y + content.height - valueSize - captionSize - 8, cy + 14);
  addOverlayText(surface, tokens, {
    left: content.x,
    top: readoutTop,
    width: content.width,
    text: valueText,
    color: tokens.color.text,
    size: valueSize,
    weight: tokens.font.weight.bold,
    align: 'center',
  });
  addOverlayText(surface, tokens, {
    left: content.x,
    top: readoutTop + valueSize + 4,
    width: content.width,
    text: caption,
    color: tokens.color.textMuted,
    size: captionSize,
    align: 'center',
  });

  const hitTest = (px: number, py: number) => {
    const dx = px - cx;
    const dy = py - cy;
    const distance = Math.hypot(dx, dy);
    const withinDial = distance <= radius + trackWidth * 2 && py >= cy - radius - trackWidth * 2 && py <= cy + readoutReserve;
    if (!withinDial) return null;
    const rows: TooltipRow[] = [{ label: 'value', value: valueText }];
    if (target != null) rows.push({ label: 'target', value: formatValue(target, gauge.format), muted: true });
    return {
      key: 'value',
      anchorX: px,
      anchorY: py,
      content: { title: caption, rows },
    };
  };

  return {
    region: { x: content.x, y: content.y, width: content.width, height: content.height },
    hitTest,
    pick: () => null,
  };
}
