/**
 * List slicer — a scrollable checkbox list of a field's distinct values.
 *
 * Emits a `set` selection. For long lists it shows a "search within" box and a
 * "Select all / Clear" row. Multi-select by nature; toggling a box republishes
 * immediately.
 */

import type { Surface } from '../../render/surface';
import type { Size } from '../../types';
import type { ChartSpec, ListSlicerSpec } from '../../spec/types';
import type { ThemeTokens } from '../../theme';
import type { SetSelection } from '../../spec/selection';
import type { RenderContext } from '../index';
import { drawTitleBlock } from '../chrome';
import { makeOptionRow, makeTextInput, mountSlicerShell } from '../../render/controls';
import { fontString } from '../../render/text';
import { paintCanvasText } from '../../render/overlayText';
import { roundedRect } from '../../shape';
import { formatValue } from '../../format';
import { toKey } from '../../util/data';
import { currentValue, publish, slicerLabel, slicerOptions } from './common';

export function drawList(
  surface: Surface,
  spec: ChartSpec,
  tokens: ThemeTokens,
  size: Size,
  context?: RenderContext,
): void {
  const s = spec as ListSlicerSpec;
  if (surface.headless) {
    drawListCanvas(surface, s, tokens, size, context);
    return;
  }
  const shell = mountSlicerShell(surface, tokens, size, {
    title: s.title,
    label: slicerLabel(s),
  });

  const options = slicerOptions(s, context);
  const display = (v: unknown): string => formatValue(v, undefined) || '—';
  const current = currentValue(s, context) as SetSelection | null;
  const selected = new Set((current?.kind === 'set' ? current.values : []).map((v) => toKey(v)));

  const emit = (): void => {
    const values = options.filter((o) => selected.has(toKey(o)));
    publish(s, context, values.length ? { kind: 'set', field: s.field, values } : null);
    shell.setClear(selected.size ? clearAll : null);
  };

  const clearAll = (): void => {
    selected.clear();
    emit();
    rebuild();
  };

  const threshold = typeof s.searchThreshold === 'number' ? s.searchThreshold : 8;
  let query = '';
  if (options.length > threshold) {
    const search = makeTextInput(tokens, { type: 'search', placeholder: 'Filter…' });
    search.setAttribute('aria-label', `Filter ${slicerLabel(s)} options`);
    search.style.flex = '0 0 auto';
    search.addEventListener('input', () => {
      query = search.value.trim().toLowerCase();
      rebuild();
    });
    shell.body.appendChild(search);
  }

  let toolbar: HTMLDivElement | null = null;
  if (s.selectAll !== false) {
    toolbar = document.createElement('div');
    Object.assign(toolbar.style, {
      display: 'flex',
      gap: `${tokens.spacing.md}px`,
      flex: '0 0 auto',
      font: fontString(tokens.font.size.small, tokens.font.family, tokens.font.weight.medium),
    } as Partial<CSSStyleDeclaration>);
    shell.body.appendChild(toolbar);
  }

  const listEl = document.createElement('div');
  Object.assign(listEl.style, {
    flex: '1 1 auto',
    minHeight: '0',
    overflowY: 'auto',
    border: `1px solid ${tokens.color.border}`,
    borderRadius: `${tokens.radius.md}px`,
    padding: `${tokens.spacing.xs}px`,
  } as Partial<CSSStyleDeclaration>);
  shell.body.appendChild(listEl);

  const visible = (): unknown[] =>
    query ? options.filter((o) => display(o).toLowerCase().includes(query)) : options;

  const linkButton = (label: string, onClick: () => void): HTMLButtonElement => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    Object.assign(b.style, {
      appearance: 'none',
      border: 'none',
      background: 'transparent',
      color: tokens.color.accent,
      cursor: 'pointer',
      padding: '0',
      font: 'inherit',
    } as Partial<CSSStyleDeclaration>);
    b.addEventListener('click', onClick);
    return b;
  };

  const rebuild = (): void => {
    const items = visible();
    if (toolbar) {
      toolbar.replaceChildren();
      toolbar.appendChild(
        linkButton('Select all', () => {
          for (const o of items) selected.add(toKey(o));
          emit();
          rebuild();
        }),
      );
      toolbar.appendChild(
        linkButton('Clear', () => {
          for (const o of items) selected.delete(toKey(o));
          emit();
          rebuild();
        }),
      );
      const count = document.createElement('span');
      count.style.marginLeft = 'auto';
      count.style.color = tokens.color.textMuted;
      count.textContent = selected.size ? `${selected.size} selected` : '';
      toolbar.appendChild(count);
    }

    listEl.replaceChildren();
    if (items.length === 0) {
      const none = document.createElement('div');
      none.textContent = 'No matches';
      none.style.color = tokens.color.textMuted;
      none.style.padding = `${tokens.spacing.xs}px ${tokens.spacing.sm}px`;
      listEl.appendChild(none);
      return;
    }
    for (const opt of items) {
      const key = toKey(opt);
      const row = makeOptionRow(tokens, {
        label: display(opt),
        selected: selected.has(key),
        checkbox: true,
        onToggle: () => {
          if (selected.has(key)) selected.delete(key);
          else selected.add(key);
          emit();
          if (toolbar) {
            const count = toolbar.lastChild as HTMLElement;
            count.textContent = selected.size ? `${selected.size} selected` : '';
          }
        },
      });
      listEl.appendChild(row);
    }
  };

  // Subtle hover is handled by makeOptionRow.
  rebuild();
  shell.setClear(selected.size ? clearAll : null);
}

function drawListCanvas(
  surface: Surface,
  s: ListSlicerSpec,
  tokens: ThemeTokens,
  size: Size,
  context?: RenderContext,
): void {
  const ctx = surface.marks.ctx;
  const rect = drawTitleBlock(surface, tokens, size, s.title ?? slicerLabel(s));
  const options = slicerOptions(s, context);
  const display = (v: unknown): string => formatValue(v, undefined) || '—';
  const current = currentValue(s, context) as SetSelection | null;
  const selected = new Set((current?.kind === 'set' ? current.values : []).map((v) => toKey(v)));
  const rowH = Math.max(24, tokens.font.size.base + tokens.spacing.sm + 2);
  const pad = tokens.spacing.xs;
  const visibleRows = Math.max(1, Math.floor((rect.height - pad * 2) / rowH));

  ctx.save();
  ctx.beginPath();
  roundedRect(ctx, rect.x, rect.y, rect.width, rect.height, tokens.radius.md);
  ctx.fillStyle = tokens.color.surface;
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = tokens.color.border;
  ctx.stroke();
  ctx.clip();

  const font = fontString(tokens.font.size.base, tokens.font.family, tokens.font.weight.normal);
  const checkSize = 12;
  options.slice(0, visibleRows).forEach((opt, i) => {
    const y = rect.y + pad + i * rowH;
    const key = toKey(opt);
    const active = selected.has(key);
    if (active) {
      ctx.beginPath();
      roundedRect(ctx, rect.x + pad, y + 1, rect.width - pad * 2, rowH - 2, tokens.radius.sm);
      ctx.fillStyle = tokens.color.background;
      ctx.fill();
    }
    const bx = rect.x + tokens.spacing.sm;
    const by = y + rowH / 2 - checkSize / 2;
    ctx.beginPath();
    roundedRect(ctx, bx, by, checkSize, checkSize, 3);
    ctx.fillStyle = active ? tokens.color.accent : tokens.color.background;
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = active ? tokens.color.accent : tokens.color.border;
    ctx.stroke();
    if (active) {
      paintCanvasText(ctx, {
        x: bx + checkSize / 2,
        y: y + rowH / 2,
        text: '✓',
        font: fontString(tokens.font.size.small, tokens.font.family, tokens.font.weight.bold),
        color: tokens.color.surface,
        size: tokens.font.size.small,
        align: 'center',
        baseline: 'middle',
      });
    }
    ctx.save();
    ctx.beginPath();
    ctx.rect(bx + checkSize + tokens.spacing.sm, y, Math.max(0, rect.width - checkSize - tokens.spacing.sm * 4), rowH);
    ctx.clip();
    paintCanvasText(ctx, {
      x: bx + checkSize + tokens.spacing.sm,
      y: y + rowH / 2,
      text: display(opt),
      font,
      color: tokens.color.text,
      size: tokens.font.size.base,
      baseline: 'middle',
    });
    ctx.restore();
  });
  if (options.length > visibleRows) {
    paintCanvasText(ctx, {
      x: rect.x + rect.width - tokens.spacing.sm,
      y: rect.y + rect.height - tokens.spacing.xs,
      text: `+${options.length - visibleRows} more`,
      font: fontString(tokens.font.size.small, tokens.font.family, tokens.font.weight.medium),
      color: tokens.color.textMuted,
      size: tokens.font.size.small,
      align: 'right',
      baseline: 'alphabetic',
    });
  }
  ctx.restore();
}
