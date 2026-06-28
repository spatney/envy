/** The transform pipeline: dispatch each step by its operator key, in order. */

import type { Datum } from '../../types';
import type { Transform } from './types';
import { applyAggregate } from './aggregate';
import { applyBin } from './bin';
import { applyCalculate } from './calculate';
import { applyFilter } from './filter';
import { applyFold } from './fold';
import { applyTimeUnit } from './timeUnit';

/** Apply a single {@link Transform} step, returning a new array (never mutating). */
export function applyTransform(transform: Transform, data: Datum[]): Datum[] {
  if ('filter' in transform) return applyFilter(transform, data);
  if ('aggregate' in transform) return applyAggregate(transform, data);
  if ('bin' in transform) return applyBin(transform, data);
  if ('fold' in transform) return applyFold(transform, data);
  if ('timeUnit' in transform) return applyTimeUnit(transform, data);
  if ('calculate' in transform) return applyCalculate(transform, data);
  // Unknown step (validation flags it): pass data through unchanged.
  return data;
}

/**
 * Apply a transform pipeline in array order. Pure — the input array and rows are
 * never mutated. Returns the original reference unchanged when there are no
 * transforms, so callers can cheaply detect a no-op.
 */
export function applyTransforms(transforms: Transform[] | undefined, data: Datum[]): Datum[] {
  if (!transforms || transforms.length === 0) return data;
  let out = data;
  for (const transform of transforms) {
    out = applyTransform(transform, out);
  }
  return out;
}
