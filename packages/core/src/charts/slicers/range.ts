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
import { makeDualSlider, mountSlicerShell } from '../../render/controls';
import { extent, toNumber } from '../../util/data';
import { formatValue } from '../../format';
import { currentValue, emptyNotice, publish, slicerLabel, slicerSource } from './common';

export function drawRange(
  surface: Surface,
  spec: ChartSpec,
  tokens: ThemeTokens,
  size: Size,
  context?: RenderContext,
): void {
  const s = spec as RangeSlicerSpec;
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
