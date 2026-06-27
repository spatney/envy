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
import {
  makeOptionRow,
  makePopover,
  makeSelectButton,
  mountSlicerShell,
  positionPopover,
} from '../../render/controls';
import { formatValue } from '../../format';
import { toKey } from '../../util/data';
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
