/**
 * Search slicer — a debounced, case-insensitive substring filter over a field.
 *
 * Emits a `text` selection (`{ field, query }`). Typing is debounced before
 * publishing so consumers aren't re-filtered on every keystroke; the input keeps
 * focus because the runtime does not redraw a slicer on its own param change.
 */

import type { Surface } from '../../render/surface';
import type { Size } from '../../types';
import type { ChartSpec, SearchSlicerSpec } from '../../spec/types';
import type { ThemeTokens } from '../../theme';
import type { TextSelection } from '../../spec/selection';
import type { RenderContext } from '../index';
import { drawTitleBlock } from '../chrome';
import { makeTextInput, mountSlicerShell } from '../../render/controls';
import { paintCanvasText } from '../../render/overlayText';
import { fontString } from '../../render/text';
import { roundedRect } from '../../shape';
import { currentValue, publish, slicerLabel } from './common';

export function drawSearch(
  surface: Surface,
  spec: ChartSpec,
  tokens: ThemeTokens,
  size: Size,
  context?: RenderContext,
): void {
  const s = spec as SearchSlicerSpec;
  if (surface.headless) {
    drawSearchCanvas(surface, s, tokens, size, context);
    return;
  }
  const shell = mountSlicerShell(surface, tokens, size, {
    title: s.title,
    label: slicerLabel(s),
  });

  const current = currentValue(s, context) as TextSelection | null;
  const initial = current?.kind === 'text' ? current.query : '';
  const input = makeTextInput(tokens, {
    type: 'search',
    placeholder: s.placeholder ?? `Search ${s.field}…`,
    value: initial,
  });
  input.setAttribute('aria-label', slicerLabel(s));
  shell.body.appendChild(input);

  const debounceMs = typeof s.debounce === 'number' && s.debounce >= 0 ? s.debounce : 200;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const emit = (query: string): void => {
    const trimmed = query.trim();
    publish(s, context, trimmed ? { kind: 'text', field: s.field, query: trimmed } : null);
    shell.setClear(trimmed ? clear : null);
  };

  const clear = (): void => {
    input.value = '';
    if (timer) clearTimeout(timer);
    emit('');
    input.focus();
  };

  input.addEventListener('input', () => {
    if (timer) clearTimeout(timer);
    const value = input.value;
    timer = setTimeout(() => emit(value), debounceMs);
  });
  // Enter publishes immediately (skip the debounce).
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      if (timer) clearTimeout(timer);
      emit(input.value);
    }
  });

  shell.setClear(initial ? clear : null);
}

function drawSearchCanvas(
  surface: Surface,
  s: SearchSlicerSpec,
  tokens: ThemeTokens,
  size: Size,
  context?: RenderContext,
): void {
  const ctx = surface.marks.ctx;
  const rect = drawTitleBlock(surface, tokens, size, s.title ?? slicerLabel(s));
  const current = currentValue(s, context) as TextSelection | null;
  const value = current?.kind === 'text' ? current.query : '';
  const text = value || (s.placeholder ?? `Search ${s.field}…`);
  const h = Math.min(42, Math.max(32, rect.height));
  const y = rect.y + Math.max(0, (rect.height - h) * 0.12);

  ctx.save();
  ctx.beginPath();
  roundedRect(ctx, rect.x, y, rect.width, h, tokens.radius.md);
  ctx.fillStyle = tokens.color.surface;
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = value ? tokens.color.accent : tokens.color.border;
  ctx.stroke();
  ctx.restore();

  const font = fontString(tokens.font.size.base, tokens.font.family, tokens.font.weight.normal);
  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x + tokens.spacing.sm, y, Math.max(0, rect.width - tokens.spacing.sm * 2), h);
  ctx.clip();
  paintCanvasText(ctx, {
    x: rect.x + tokens.spacing.sm,
    y: y + h / 2,
    text,
    font,
    color: value ? tokens.color.text : tokens.color.textMuted,
    size: tokens.font.size.base,
    baseline: 'middle',
  });
  ctx.restore();
}
