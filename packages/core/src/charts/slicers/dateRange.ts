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
import { makeChip, makeDualSlider, mountSlicerShell } from '../../render/controls';
import { toDate } from '../../util/data';
import { formatValue } from '../../format';
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
