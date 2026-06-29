/**
 * Date-range slicer — a temporal min/max filter with relative presets.
 *
 * Emits a `range` selection whose bounds are ISO date strings (`YYYY-MM-DD`), so
 * the value stays JSON-friendly and round-trips through the predicate engine
 * (which parses date strings). Presets ("Last 7 / 30 / 90 days") set the range
 * relative to the data's latest date.
 */

import type { Surface } from '../../render/surface';
import type { Size } from '../../types';
import type { ChartSpec, DateRangeSlicerSpec } from '../../spec/types';
import type { ThemeTokens } from '../../theme';
import type { RangeSelection } from '../../spec/selection';
import type { RenderContext } from '../index';
import { drawTitleBlock } from '../chrome';
import { makeChip, makeDualSlider, mountSlicerShell } from '../../render/controls';
import { toDate } from '../../util/data';
import { formatValue } from '../../format';
import { paintCanvasText } from '../../render/overlayText';
import { fontString } from '../../render/text';
import { roundedRect } from '../../shape';
import { currentValue, emptyNotice, publish, slicerLabel, slicerSource } from './common';

const DAY_MS = 86_400_000;

function dateExtent(rows: readonly Record<string, unknown>[], field: string): [number, number] | null {
  let min = Infinity;
  let max = -Infinity;
  for (const row of rows) {
    const d = toDate(row[field]);
    if (!d) continue;
    const t = d.getTime();
    if (t < min) min = t;
    if (t > max) max = t;
  }
  return min === Infinity ? null : [min, max];
}

/** Epoch ms → local `YYYY-MM-DD` (matches `toDate`'s local parsing of bare ISO). */
function toISODate(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function drawDateRange(
  surface: Surface,
  spec: ChartSpec,
  tokens: ThemeTokens,
  size: Size,
  context?: RenderContext,
): void {
  const s = spec as DateRangeSlicerSpec;
  if (surface.headless) {
    drawDateRangeCanvas(surface, s, tokens, size, context);
    return;
  }
  const shell = mountSlicerShell(surface, tokens, size, {
    title: s.title,
    label: slicerLabel(s),
  });

  const ext = dateExtent(slicerSource(s, context) as Record<string, unknown>[], s.field);
  if (!ext || !(ext[1] > ext[0])) {
    emptyNotice(shell.body, `No date range for "${s.field}".`, tokens.color.textMuted);
    return;
  }
  const [min, max] = ext;

  const current = currentValue(s, context) as RangeSelection | null;
  const toMs = (v: number | string | undefined, fallback: number): number => {
    if (v == null) return fallback;
    const d = toDate(v);
    return d ? d.getTime() : fallback;
  };
  let low = current?.kind === 'range' ? toMs(current.min, min) : min;
  let high = current?.kind === 'range' ? toMs(current.max, max) : max;

  const fmt = (v: number): string => {
    // Snap to local midnight before formatting: stepping in epoch-ms can land a
    // day on 01:00 after the spring DST shift, which would otherwise render a
    // spurious time component. The emitted value (toISODate) is already local
    // Y-M-D, so this keeps the label consistent with what gets published.
    const d = new Date(v);
    return formatValue(new Date(d.getFullYear(), d.getMonth(), d.getDate()), s.format);
  };

  const slider = makeDualSlider(tokens, {
    min,
    max,
    step: DAY_MS,
    low,
    high,
    format: fmt,
    onChange: (lo, hi) => emit(lo, hi),
  });

  const emit = (lo: number, hi: number): void => {
    low = lo;
    high = hi;
    const constrained = lo > min || hi < max;
    publish(
      s,
      context,
      constrained ? { kind: 'range', field: s.field, min: toISODate(lo), max: toISODate(hi) } : null,
    );
    shell.setClear(constrained ? clear : null);
  };

  const clear = (): void => {
    slider.set(min, max);
    emit(min, max);
  };

  if (s.presets !== false) {
    const presets = document.createElement('div');
    Object.assign(presets.style, {
      display: 'flex',
      flexWrap: 'wrap',
      gap: `${tokens.spacing.xs}px`,
      flex: '0 0 auto',
    } as Partial<CSSStyleDeclaration>);
    const setRange = (lo: number, hi: number): void => {
      slider.set(lo, hi);
      emit(lo, hi);
    };
    for (const days of [7, 30, 90]) {
      const chip = makeChip(tokens, `Last ${days}d`);
      chip.addEventListener('click', () => setRange(Math.max(min, max - days * DAY_MS), max));
      presets.appendChild(chip);
    }
    const all = makeChip(tokens, 'All');
    all.addEventListener('click', () => setRange(min, max));
    presets.appendChild(all);
    shell.body.appendChild(presets);
  }

  shell.body.appendChild(slider.el);

  const active = current?.kind === 'range' && (low > min || high < max);
  shell.setClear(active ? clear : null);
}

function drawDateRangeCanvas(
  surface: Surface,
  s: DateRangeSlicerSpec,
  tokens: ThemeTokens,
  size: Size,
  context?: RenderContext,
): void {
  const ctx = surface.marks.ctx;
  const rect = drawTitleBlock(surface, tokens, size, s.title ?? slicerLabel(s));
  const ext = dateExtent(slicerSource(s, context) as Record<string, unknown>[], s.field);
  const font = fontString(tokens.font.size.small, tokens.font.family, tokens.font.weight.medium);
  if (!ext || !(ext[1] > ext[0])) {
    paintCanvasText(ctx, {
      x: rect.x,
      y: rect.y,
      text: `No date range for "${s.field}".`,
      font,
      color: tokens.color.textMuted,
      size: tokens.font.size.small,
      baseline: 'top',
    });
    return;
  }

  const [min, max] = ext;
  const current = currentValue(s, context) as RangeSelection | null;
  const toMs = (v: number | string | undefined, fallback: number): number => {
    if (v == null) return fallback;
    const d = toDate(v);
    return d ? d.getTime() : fallback;
  };
  const low = current?.kind === 'range' ? toMs(current.min, min) : min;
  const high = current?.kind === 'range' ? toMs(current.max, max) : max;
  paintDateFields(ctx, tokens, rect, toISODate(low), toISODate(high));
}

function paintDateFields(
  ctx: CanvasRenderingContext2D,
  tokens: ThemeTokens,
  rect: { x: number; y: number; width: number; height: number },
  low: string,
  high: string,
): void {
  const labelFont = fontString(tokens.font.size.small, tokens.font.family, tokens.font.weight.medium);
  const valueFont = fontString(tokens.font.size.base, tokens.font.family, tokens.font.weight.normal);
  const gap = tokens.spacing.sm;
  const fieldH = 36;
  const labelH = tokens.font.size.small + 4;
  const y = rect.y + Math.max(0, (rect.height - (labelH + fieldH)) * 0.12);
  const arrowW = 18;
  const fieldW = Math.max(44, (rect.width - gap * 2 - arrowW) / 2);

  const paintField = (x: number, label: string, value: string): void => {
    paintCanvasText(ctx, {
      x,
      y,
      text: label,
      font: labelFont,
      color: tokens.color.textMuted,
      size: tokens.font.size.small,
      baseline: 'top',
    });
    const fy = y + labelH;
    ctx.save();
    ctx.beginPath();
    roundedRect(ctx, x, fy, fieldW, fieldH, tokens.radius.md);
    ctx.fillStyle = tokens.color.surface;
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = tokens.color.border;
    ctx.stroke();
    ctx.beginPath();
    ctx.rect(x + tokens.spacing.sm, fy, Math.max(0, fieldW - tokens.spacing.sm * 2), fieldH);
    ctx.clip();
    paintCanvasText(ctx, {
      x: x + tokens.spacing.sm,
      y: fy + fieldH / 2,
      text: value,
      font: valueFont,
      color: tokens.color.text,
      size: tokens.font.size.base,
      baseline: 'middle',
    });
    ctx.restore();
  };

  paintField(rect.x, 'From', low);
  paintCanvasText(ctx, {
    x: rect.x + fieldW + gap + arrowW / 2,
    y: y + labelH + fieldH / 2,
    text: '→',
    font: valueFont,
    color: tokens.color.accent,
    size: tokens.font.size.base,
    align: 'center',
    baseline: 'middle',
  });
  paintField(rect.x + fieldW + gap * 2 + arrowW, 'To', high);
}
