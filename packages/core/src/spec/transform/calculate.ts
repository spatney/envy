/**
 * `calculate` transform: derive a new column from a safe expression evaluated
 * per row. The expression is compiled once and never uses `eval`/`Function`.
 */

import type { Datum } from '../../types';
import { compileExpression } from './expr';
import type { CalculateTransform } from './types';

/** Apply a {@link CalculateTransform}, returning new rows with the `as` column. */
export function applyCalculate(transform: CalculateTransform, data: Datum[]): Datum[] {
  const evalRow = compileExpression(transform.calculate);
  const as = transform.as;
  return data.map((row) => ({ ...row, [as]: evalRow(row) }));
}
