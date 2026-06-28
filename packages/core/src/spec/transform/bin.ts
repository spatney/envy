/** The `bin` transform: bucket a quantitative field into evenly sized bins. */

import type { Datum } from '../../types';
import type { BinTransform } from './types';
import { accessor, toNumber } from '../../util/data';
import { tickStep } from '../../ticks';

export interface BinLayout {
  /** Lower edge of the first bin. */
  start: number;
  /** Bin width. */
  step: number;
  /** Number of bins. */
  count: number;
}

/** Round to the precision implied by `step`, killing float artifacts. */
function roundNice(value: number, step: number): number {
  if (!Number.isFinite(step) || step === 0) return value;
  const places = Math.max(0, -Math.floor(Math.log10(Math.abs(step))) + 1);
  const rounded = Number(value.toFixed(Math.min(places, 15)));
  return Object.is(rounded, -0) ? 0 : rounded;
}

/**
 * Choose a bin layout for `values`. Honors an explicit `step`, otherwise picks a
 * "nice" step approximating `maxbins` (default 10). Returns `null` when there is
 * no finite data to bin.
 */
export function computeBins(
  values: readonly number[],
  opts: { maxbins?: number; step?: number; extent?: [number, number]; nice?: boolean } = {},
): BinLayout | null {
  let min = Infinity;
  let max = -Infinity;
  if (opts.extent) {
    [min, max] = opts.extent;
  } else {
    for (const v of values) {
      if (!Number.isFinite(v)) continue;
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;

  const explicit = opts.step !== undefined && opts.step > 0;
  if (min === max) {
    const step = explicit ? (opts.step as number) : 1;
    return { start: min, step, count: 1 };
  }

  const nice = opts.nice !== false;
  let step = explicit ? (opts.step as number) : tickStep(min, max, opts.maxbins ?? 10);
  if (!Number.isFinite(step) || step <= 0) step = max - min || 1;

  const start = nice ? Math.floor(min / step) * step : min;
  const end = nice ? Math.ceil(max / step) * step : max;
  const count = Math.max(1, Math.ceil((end - start) / step - 1e-9));
  return { start: roundNice(start, step), step, count };
}

/**
 * Apply a {@link BinTransform}, writing the bin start (and optional end) onto each
 * row. Rows whose value is non-numeric or outside an explicit `extent` get `null`.
 */
export function applyBin(transform: BinTransform, data: Datum[]): Datum[] {
  const read = accessor(transform.bin);
  const finite: number[] = [];
  for (const row of data) {
    const n = toNumber(read(row));
    if (Number.isFinite(n)) finite.push(n);
  }
  const layout = computeBins(finite, {
    maxbins: transform.maxbins,
    step: transform.step,
    extent: transform.extent,
    nice: transform.nice,
  });
  const startField = Array.isArray(transform.as) ? transform.as[0] : transform.as;
  const endField = Array.isArray(transform.as) ? transform.as[1] : undefined;

  return data.map((row) => {
    const out: Datum = { ...row };
    const v = toNumber(read(row));
    const outside =
      transform.extent != null && (v < transform.extent[0] || v > transform.extent[1]);
    if (layout == null || !Number.isFinite(v) || outside) {
      out[startField] = null;
      if (endField) out[endField] = null;
      return out;
    }
    let index = Math.floor((v - layout.start) / layout.step + 1e-9);
    if (index < 0) index = 0;
    if (index > layout.count - 1) index = layout.count - 1;
    out[startField] = roundNice(layout.start + index * layout.step, layout.step);
    if (endField) out[endField] = roundNice(layout.start + (index + 1) * layout.step, layout.step);
    return out;
  });
}
