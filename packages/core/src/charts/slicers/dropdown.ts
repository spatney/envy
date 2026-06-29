/**
 * Dropdown slicer — single or multi select of a field's distinct values.
 *
 * Emits a `set` selection (`{ field, values }`) and auto-wires to any visual
 * filtering/highlighting on its param. A closed trigger summarizes the choice;
 * clicking opens a themed popover of options.
 */

import type { Surface } from '../../render/surface';
import type { Size } from '../../types';
import type { ChartSpec, DropdownSlicerSpec } from '../../spec/types';
import type { ThemeTokens } from '../../theme';
import type { SetSelection } from '../../spec/selection';
import type { RenderContext } from '../index';
import { drawTitleBlock } from '../chrome';
import {
  makeOptionRow,
  makePopover,
  makeSelectButton,
  mountSlicerShell,
  positionPopover,
} from '../../render/controls';
import { formatValue } from '../../format';
import { toKey } from '../../util/data';
import { paintCanvasText } from '../../render/overlayText';
import { fontString } from '../../render/text';
import { roundedRect } from '../../shape';
import {
  currentValue,
  publish,
  slicerLabel,
  slicerOptions,
} from './common';

export function drawDropdown(
  surface: Surface,
  spec: ChartSpec,
  tokens: ThemeTokens,
  size: Size,
  context?: RenderContext,
): void {
  const s = spec as DropdownSlicerSpec;
  if (surface.headless) {
    drawDropdownCanvas(surface, s, tokens, size, context);
    return;
  }
  const shell = mountSlicerShell(surface, tokens, size, {
    title: s.title,
    label: slicerLabel(s),
  });

  const options = slicerOptions(s, context);
  const display = (v: unknown): string => formatValue(v, undefined) || '—';
  const placeholder = s.placeholder ?? (s.multiple ? 'Any' : 'All');

  const current = currentValue(s, context) as SetSelection | null;
  const selected = new Set((current?.kind === 'set' ? current.values : []).map((v) => toKey(v)));

  const summary = (): string => {
    if (selected.size === 0) return placeholder;
    const picks = options.filter((o) => selected.has(toKey(o)));
    if (picks.length === 1) return display(picks[0]);
    if (s.multiple) return `${picks.length} selected`;
    return display(picks[0]);
  };

  const trigger = makeSelectButton(tokens, summary());
  shell.body.appendChild(trigger);

  const refreshChrome = (): void => {
    (trigger.firstChild as HTMLElement).textContent = summary();
    shell.setClear(selected.size ? clearAll : null);
  };

  const emit = (): void => {
    const values = options.filter((o) => selected.has(toKey(o)));
    publish(s, context, values.length ? { kind: 'set', field: s.field, values } : null);
    refreshChrome();
  };

  const clearAll = (): void => {
    selected.clear();
    closeMenu();
    emit();
  };

  let pop: HTMLDivElement | null = null;
  const closeMenu = (): void => {
    if (pop) {
      pop.remove();
      pop = null;
      document.removeEventListener('pointerdown', onOutside, true);
    }
  };
  const onOutside = (e: PointerEvent): void => {
    if (pop && !pop.contains(e.target as Node) && !trigger.contains(e.target as Node)) closeMenu();
  };

  const openMenu = (): void => {
    if (pop) {
      closeMenu();
      return;
    }
    pop = makePopover(tokens);
    for (const opt of options) {
      const key = toKey(opt);
      const row = makeOptionRow(tokens, {
        label: display(opt),
        selected: selected.has(key),
        checkbox: s.multiple === true,
        onToggle: () => {
          if (s.multiple) {
            if (selected.has(key)) selected.delete(key);
            else selected.add(key);
            emit();
          } else {
            // Single-select: clicking the active option clears it.
            if (selected.has(key) && selected.size === 1) selected.clear();
            else {
              selected.clear();
              selected.add(key);
            }
            emit();
            closeMenu();
          }
        },
      });
      pop.appendChild(row);
    }
    shell.host.appendChild(pop);
    positionPopover(pop, trigger, shell.host);
    document.addEventListener('pointerdown', onOutside, true);
  };

  trigger.addEventListener('click', openMenu);
  refreshChrome();
}

function drawDropdownCanvas(
  surface: Surface,
  s: DropdownSlicerSpec,
  tokens: ThemeTokens,
  size: Size,
  context?: RenderContext,
): void {
  const ctx = surface.marks.ctx;
  const rect = drawTitleBlock(surface, tokens, size, s.title ?? slicerLabel(s));
  const options = slicerOptions(s, context);
  const display = (v: unknown): string => formatValue(v, undefined) || '—';
  const placeholder = s.placeholder ?? (s.multiple ? 'Any' : 'All');
  const current = currentValue(s, context) as SetSelection | null;
  const selected = new Set((current?.kind === 'set' ? current.values : []).map((v) => toKey(v)));
  const picks = options.filter((o) => selected.has(toKey(o)));
  const label = selected.size === 0
    ? placeholder
    : picks.length === 1
      ? display(picks[0])
      : s.multiple
        ? `${picks.length} selected`
        : display(picks[0]);

  const h = Math.min(42, Math.max(32, rect.height));
  const y = rect.y + Math.max(0, (rect.height - h) * 0.12);
  ctx.save();
  ctx.beginPath();
  roundedRect(ctx, rect.x, y, rect.width, h, tokens.radius.md);
  ctx.fillStyle = tokens.color.surface;
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = selected.size ? tokens.color.accent : tokens.color.border;
  ctx.stroke();
  ctx.restore();

  const font = fontString(tokens.font.size.base, tokens.font.family, tokens.font.weight.normal);
  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x + tokens.spacing.sm, y, Math.max(0, rect.width - tokens.spacing.sm * 4 - 14), h);
  ctx.clip();
  paintCanvasText(ctx, {
    x: rect.x + tokens.spacing.sm,
    y: y + h / 2,
    text: label,
    font,
    color: selected.size ? tokens.color.text : tokens.color.textMuted,
    size: tokens.font.size.base,
    baseline: 'middle',
  });
  ctx.restore();
  paintCanvasText(ctx, {
    x: rect.x + rect.width - tokens.spacing.sm,
    y: y + h / 2,
    text: '▾',
    font,
    color: tokens.color.textMuted,
    size: tokens.font.size.base,
    align: 'right',
    baseline: 'middle',
  });
}
