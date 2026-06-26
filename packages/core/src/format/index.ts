import { formatNumber } from './number';
import { formatDate, prettyDate } from './date';

/**
 * Format any field value for display. Routes by value type and an optional
 * format hint:
 *   - a hint containing `%` → strftime date pattern
 *   - otherwise → number format mini-language (when the value is numeric)
 *   - Dates without a hint use a friendly default; everything else stringifies.
 *
 * Because JSON has no Date type, agent-authored specs pass dates as ISO-ish
 * strings. When a `%` (date) hint is supplied for such a string we parse it and
 * format as a date, so e.g. a table column `{ format: '%b %e, %Y' }` over
 * `"2024-05-02"` renders `May 2, 2024` rather than the raw string.
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
  if (typeof value === 'string') {
    if (hint && hint.indexOf('%') !== -1) {
      const ms = Date.parse(value);
      if (!Number.isNaN(ms)) return formatDate(new Date(ms), hint);
    }
    return value;
  }
  return String(value);
}

export * from './number';
export * from './date';
