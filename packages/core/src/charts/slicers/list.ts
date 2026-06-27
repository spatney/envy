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
import { makeOptionRow, makeTextInput, mountSlicerShell } from '../../render/controls';
import { fontString } from '../../render/text';
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
