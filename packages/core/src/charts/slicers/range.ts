/**
 * Range slicer — a numeric min/max filter over a quantitative field.
 *
 * Emits a `range` selection (`{ field, min, max }`). Bounds default to the data
 * extent of `field`; a value spanning the full extent publishes nothing (i.e.
 * "no constraint"). Uses the dependency-free dual-thumb slider.
 */

import type { Surface } from '../../render/surface';
import type { Size } from '../../types';
import type { ChartSpec, RangeSlicerSpec } from '../../spec/types';
import type { ThemeTokens } from '../../theme';
import type { RangeSelection } from '../../spec/selection';
import type { RenderContext } from '../index';
import { drawTitleBlock } from '../chrome';
import { makeDualSlider, mountSlicerShell } from '../../render/controls';
import { extent, toNumber } from '../../util/data';
import { formatValue } from '../../format';
import { paintCanvasText } from '../../render/overlayText';
import { fontString } from '../../render/text';
import { roundedRect } from '../../shape';
import { currentValue, emptyNotice, publish, slicerLabel, slicerSource } from './common';

export function drawRange(
  surface: Surface,
  spec: ChartSpec,
  tokens: ThemeTokens,
  size: Size,
  context?: RenderContext,
): void {
  const s = spec as RangeSlicerSpec;
  if (surface.headless) {
    drawRangeCanvas(surface, s, tokens, size, context);
    return;
  }
  const shell = mountSlicerShell(surface, tokens, size, {
    title: s.title,
    label: slicerLabel(s),
  });

  const dataExtent = extent(slicerSource(s, context), s.field);
  const min = s.min ?? dataExtent?.[0] ?? 0;
  const max = s.max ?? dataExtent?.[1] ?? 1;
  if (!(max > min)) {
    emptyNotice(shell.body, `No numeric range for "${s.field}".`, tokens.color.textMuted);
    return;
  }

  const current = currentValue(s, context) as RangeSelection | null;
  const low = current?.kind === 'range' && current.min != null ? toNumber(current.min) : min;
  const high = current?.kind === 'range' && current.max != null ? toNumber(current.max) : max;
  const fmt = (v: number): string => formatValue(v, s.format);

  const slider = makeDualSlider(tokens, {
    min,
    max,
    step: s.step,
    low: Number.isNaN(low) ? min : low,
    high: Number.isNaN(high) ? max : high,
    format: fmt,
    onChange: (lo, hi) => emit(lo, hi),
  });
  shell.body.appendChild(slider.el);

  const emit = (lo: number, hi: number): void => {
    // A range covering the full extent is "no constraint".
    const constrained = lo > min || hi < max;
    publish(
      s,
      context,
      constrained ? { kind: 'range', field: s.field, min: lo, max: hi } : null,
    );
    shell.setClear(constrained ? clear : null);
  };

  const clear = (): void => {
    slider.set(min, max);
    emit(min, max);
  };

  const active = (current?.kind === 'range') && (low > min || high < max);
  shell.setClear(active ? clear : null);
}

function drawRangeCanvas(
  surface: Surface,
  s: RangeSlicerSpec,
  tokens: ThemeTokens,
  size: Size,
  context?: RenderContext,
): void {
  const ctx = surface.marks.ctx;
  const rect = drawTitleBlock(surface, tokens, size, s.title ?? slicerLabel(s));
  const dataExtent = extent(slicerSource(s, context), s.field);
  const min = s.min ?? dataExtent?.[0] ?? 0;
  const max = s.max ?? dataExtent?.[1] ?? 1;
  const font = fontString(tokens.font.size.small, tokens.font.family, tokens.font.weight.medium);
  if (!(max > min)) {
    paintCanvasText(ctx, {
      x: rect.x,
      y: rect.y,
      text: `No numeric range for "${s.field}".`,
      font,
      color: tokens.color.textMuted,
      size: tokens.font.size.small,
      baseline: 'top',
    });
    return;
  }

  const current = currentValue(s, context) as RangeSelection | null;
  const rawLow = current?.kind === 'range' && current.min != null ? toNumber(current.min) : min;
  const rawHigh = current?.kind === 'range' && current.max != null ? toNumber(current.max) : max;
  const low = Number.isNaN(rawLow) ? min : Math.max(min, Math.min(max, rawLow));
  const high = Number.isNaN(rawHigh) ? max : Math.max(low, Math.min(max, rawHigh));
  const fmt = (v: number): string => formatValue(v, s.format);
  paintSliderSnapshot(ctx, tokens, rect, min, max, low, high, fmt);
}

function paintSliderSnapshot(
  ctx: CanvasRenderingContext2D,
  tokens: ThemeTokens,
  rect: { x: number; y: number; width: number; height: number },
  min: number,
  max: number,
  low: number,
  high: number,
  format: (v: number) => string,
): void {
  const span = Math.max(1e-9, max - min);
  const trackX = rect.x + 8;
  const trackW = Math.max(0, rect.width - 16);
  const midY = rect.y + Math.min(Math.max(rect.height * 0.58, 34), Math.max(34, rect.height - 14));
  const lowX = trackX + ((low - min) / span) * trackW;
  const highX = trackX + ((high - min) / span) * trackW;
  const font = fontString(tokens.font.size.small, tokens.font.family, tokens.font.weight.medium);

  paintCanvasText(ctx, {
    x: rect.x,
    y: rect.y,
    text: format(low),
    font,
    color: tokens.color.textMuted,
    size: tokens.font.size.small,
    baseline: 'top',
  });
  paintCanvasText(ctx, {
    x: rect.x + rect.width,
    y: rect.y,
    text: format(high),
    font,
    color: tokens.color.textMuted,
    size: tokens.font.size.small,
    align: 'right',
    baseline: 'top',
  });

  ctx.save();
  ctx.beginPath();
  roundedRect(ctx, trackX, midY - 2, trackW, 4, 2);
  ctx.fillStyle = tokens.color.border;
  ctx.fill();
  ctx.beginPath();
  roundedRect(ctx, lowX, midY - 2, Math.max(0, highX - lowX), 4, 2);
  ctx.fillStyle = tokens.color.accent;
  ctx.fill();
  for (const x of [lowX, highX]) {
    ctx.beginPath();
    ctx.arc(x, midY, 8, 0, Math.PI * 2);
    ctx.fillStyle = tokens.color.surface;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = tokens.color.accent;
    ctx.stroke();
  }
  ctx.restore();
}
