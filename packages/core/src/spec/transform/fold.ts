/** The `fold` transform: gather several columns into key/value rows (wide → long). */

import type { Datum } from '../../types';
import type { FoldTransform } from './types';

/**
 * Apply a {@link FoldTransform}. Each input row is repeated once per folded
 * column, carrying all original fields plus the `[key, value]` pair (default
 * names `key` / `value`).
 */
export function applyFold(transform: FoldTransform, data: Datum[]): Datum[] {
  const [keyName, valueName] = transform.as ?? ['key', 'value'];
  const out: Datum[] = [];
  for (const row of data) {
    for (const column of transform.fold) {
      out.push({ ...row, [keyName]: column, [valueName]: row[column] });
    }
  }
  return out;
}
