import { formatNumber } from './number';
import { formatDate, prettyDate } from './date';

/**
 * Format any field value for display. Routes by value type and an optional
 * format hint:
 *   - a hint containing `%` → strftime date pattern
 *   - otherwise → number format mini-language (when the value is numeric)
 *   - Dates without a hint use a friendly default; everything else stringifies.
 */
export function formatValue(value: unknown, hint?: string): string {
  if (value == null) return '';
  if (value instanceof Date) {
    return hint && hint.indexOf('%') !== -1 ? formatDate(value, hint) : prettyDate(value);
  }
  if (typeof value === 'number') {
    if (hint && hint.indexOf('%') !== -1 && !/^[$,.\d]*[f%sdeg]?$/.test(hint)) {
      return formatDate(value, hint);
    }
    return formatNumber(value, hint);
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return String(value);
}

export * from './number';
export * from './date';
