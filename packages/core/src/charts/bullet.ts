import { parseColor, rgbaToCss, readableTextColor } from '../color';
import { formatValue } from '../format';
import { aggregateValues } from '../pivot';
import type { Surface } from '../render/surface';
import { fontString, measureText } from '../render/text';
import { RoughPen } from '../rough';
import { resolveSketch } from '../spec/sketch';
import type { BulletSpec, ChartSpec, ValueRef } from '../spec/types';
import type { ThemeTokens } from '../theme';
import type { Datum, Rect, Size } from '../types';
import { accessor } from '../util/data';
import type { InteractionModel, TooltipRow } from '../interaction/types';
import type { RenderContext } from './index';
import { addOverlayText, CHROME_PAD, drawTitleBlock } from './chrome';

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function titleText(title: BulletSpec['title']): string | undefined {
  if (typeof title === 'string') return title;
  if (title && typeof title === 'object') return title.text;
  return undefined;
}

function valueField(ref: ValueRef): string | null {
  return typeof ref === 'number' ? null : ref.field;
}

function resolveValue(ref: ValueRef | undefined, data: readonly Datum[]): number | null {
  if (ref == null) return null;
  if (typeof ref === 'number') return Number.isFinite(ref) ? ref : null;
  return aggregateValues((data ?? []).map(accessor(ref.field)), ref.aggregate ?? 'sum');
}

export function bulletValueToX(value: number, min: number, max: number, track: Rect): number {
  if (max <= min) return track.x;
  return track.x + ((value - min) / (max - min)) * track.width;
}

function fillRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, fill: string): void {
  if (w <= 0 || h <= 0) return;
  ctx.fillStyle = fill;
  ctx.fillRect(x, y, w, h);
}

function drawLine(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  stroke: string,
  width: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.strokeStyle = stroke;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.stroke();
}

function niceTicks(min: number, max: number): number[] {
  const mid = min + (max - min) / 2;
  return [min, mid, max];
}

export function drawBullet(
  surface: Surface,
  spec: ChartSpec,
  tokens: ThemeTokens,
  size: Size,
  context?: RenderContext,
): InteractionModel | void {
  void context;
  const bullet = spec as BulletSpec;
  const ctx = surface.marks.ctx;
  const content = drawTitleBlock(surface, tokens, size, bullet.title);
  const data = bullet.data ?? [];
  const value = resolveValue(bullet.value, data);
  const target = resolveValue(bullet.target, data);
  const caption = bullet.label ?? titleText(bullet.title) ?? valueField(bullet.value) ?? 'Value';
  const fmt = bullet.format;
  const finiteRanges = (bullet.ranges ?? []).filter((r) => Number.isFinite(r)).sort((a, b) => a - b);
  const min = bullet.min ?? 0;
  const derivedMax = Math.max(value ?? Number.NEGATIVE_INFINITY, target ?? Number.NEGATIVE_INFINITY, ...finiteRanges);
  const max = bullet.max ?? derivedMax;

  if (value == null || !Number.isFinite(min) || !Number.isFinite(max) || max <= min || content.width <= 0 || content.height <= 0) {
    addOverlayText(surface, tokens, {
      left: content.x,
      top: content.y + Math.max(CHROME_PAD.top, content.height / 2 - tokens.font.size.small / 2),
      width: content.width,
      text: 'No value',
      color: tokens.color.textMuted,
      size: tokens.font.size.small,
      align: 'center',
    });
    return;
  }

  const labelFont = fontString(tokens.font.size.small, tokens.font.family, tokens.font.weight.bold);
  const valueFont = fontString(tokens.font.size.small, tokens.font.family, tokens.font.weight.normal);
  const labelW = Math.min(
    Math.max(72, content.width * 0.18, measureText(caption, labelFont).width + 18),
    Math.max(72, content.width * 0.38),
  );
  const axisReserve = Math.max(24, tokens.font.size.tiny * 2);
  const availableTrackW = Math.max(0, content.width - labelW);
  const trackW = Math.max(0, availableTrackW - 4);
  const trackH = clamp(content.height * 0.22, 28, 40);
  const trackX = content.x + labelW + 4;
  const trackY = content.y + Math.max(0, (content.height - axisReserve - trackH) / 2);
  const track: Rect = { x: trackX, y: trackY, width: trackW, height: trackH };
  const barH = Math.max(6, trackH / 3);
  const barY = track.y + (track.height - barH) / 2;
  const accent = tokens.color.palette[0] ?? tokens.color.text;
  const accentRgba = parseColor(accent) ?? parseColor(tokens.color.text);
  const accentCss = accentRgba ? rgbaToCss(accentRgba) : accent;
  const valueTextColor = accentRgba ? rgbaToCss(readableTextColor(accentRgba)) : tokens.color.surface;
  const sketch = resolveSketch(spec);
  const pen = sketch ? new RoughPen(ctx, sketch) : null;
  const greyStart = parseColor(tokens.color.surface) ?? { r: 245, g: 245, b: 245, a: 1 };
  const greyEnd = parseColor(tokens.color.border) ?? { r: 180, g: 180, b: 180, a: 1 };
  const mixGrey = (t: number): string =>
    rgbaToCss({
      r: greyStart.r + (greyEnd.r - greyStart.r) * t,
      g: greyStart.g + (greyEnd.g - greyStart.g) * t,
      b: greyStart.b + (greyEnd.b - greyStart.b) * t,
      a: 1,
    });
  const xOf = (v: number): number => clamp(bulletValueToX(v, min, max, track), track.x, track.x + track.width);

  addOverlayText(surface, tokens, {
    left: content.x,
    top: track.y + track.height / 2 - tokens.font.size.small / 2,
    width: Math.max(0, labelW - 8),
    text: caption,
    color: tokens.color.text,
    size: tokens.font.size.small,
    weight: tokens.font.weight.bold,
  });

  ctx.save();
  const bounds = [min, ...finiteRanges.filter((r) => r > min && r < max), max];
  if (bounds.length <= 2 && finiteRanges.length === 0) {
    if (pen) pen.rect(track.x, track.y, track.width, track.height, { fill: mixGrey(0.15), stroke: tokens.color.border });
    else fillRect(ctx, track.x, track.y, track.width, track.height, mixGrey(0.15));
  } else {
    for (let i = 0; i < bounds.length - 1; i++) {
      const x0 = xOf(bounds[i]);
      const x1 = xOf(bounds[i + 1]);
      const fill = mixGrey(bounds.length === 2 ? 0.15 : 0.15 + (i / Math.max(1, bounds.length - 2)) * 0.65);
      if (pen) pen.rect(x0, track.y, x1 - x0, track.height, { fill, stroke: fill });
      else fillRect(ctx, x0, track.y, x1 - x0, track.height, fill);
    }
  }

  const barX = Math.min(xOf(min), xOf(value));
  const barW = Math.max(0, Math.abs(xOf(value) - xOf(min)));
  if (pen) pen.rect(barX, barY, barW, barH, { fill: accentCss, stroke: accentCss });
  else fillRect(ctx, barX, barY, barW, barH, accentCss);

  if (target != null && Number.isFinite(target)) {
    const tx = xOf(target);
    if (pen) pen.polyline([{ x: tx, y: track.y - 1 }, { x: tx, y: track.y + track.height + 1 }], { stroke: tokens.color.text, strokeWidth: 3 });
    else drawLine(ctx, tx, track.y - 1, tx, track.y + track.height + 1, tokens.color.text, 3);
  }

  if (!pen) {
    ctx.strokeStyle = tokens.color.border;
    ctx.lineWidth = 1;
    ctx.strokeRect(track.x, track.y, track.width, track.height);
  }
  ctx.restore();

  const valueText = formatValue(value, fmt);
  const valueLabelW = measureText(valueText, valueFont).width + 14;
  const valueLeft = clamp(xOf(value) - valueLabelW / 2, content.x, content.x + content.width - valueLabelW);
  addOverlayText(surface, tokens, {
    left: valueLeft,
    top: Math.max(content.y, barY - tokens.font.size.small - 6),
    text: valueText,
    color: valueTextColor,
    size: tokens.font.size.small,
    weight: tokens.font.weight.bold,
    pill: { background: accentCss, padX: 6, padY: 2 },
  });

  for (const tick of niceTicks(min, max)) {
    const tickText = formatValue(tick, fmt);
    const tickW = measureText(tickText, fontString(tokens.font.size.tiny, tokens.font.family)).width;
    const tx = xOf(tick);
    drawLine(ctx, tx, track.y + track.height, tx, track.y + track.height + 4, tokens.color.textMuted, 1);
    addOverlayText(surface, tokens, {
      left: clamp(tx - tickW / 2, track.x, track.x + track.width - tickW),
      top: track.y + track.height + 6,
      text: tickText,
      color: tokens.color.textMuted,
      size: tokens.font.size.tiny,
    });
  }

  const measureLabel = valueField(bullet.value) ?? caption;
  const inTrack = (px: number, py: number): boolean =>
    px >= track.x && px <= track.x + track.width && py >= track.y && py <= track.y + track.height;

  const tooltipRows = (): TooltipRow[] => {
    const rows: TooltipRow[] = [{ swatch: accentCss, label: measureLabel, value: valueText }];
    if (target != null && Number.isFinite(target)) {
      rows.push({ label: 'target', value: formatValue(target, fmt), muted: true });
    }
    return rows;
  };

  return {
    region: { x: content.x, y: content.y, width: content.width, height: content.height },
    hitTest: (px, py) => {
      if (!inTrack(px, py)) return null;
      return {
        key: 'value',
        anchorX: px,
        anchorY: py,
        content: {
          title: caption,
          rows: tooltipRows(),
        },
      };
    },
    pick: () => null,
  };
}
