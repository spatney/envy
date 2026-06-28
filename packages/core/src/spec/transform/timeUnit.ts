/** The `timeUnit` transform: truncate a timestamp to the start of a calendar unit. */

import type { Datum } from '../../types';
import type { TimeUnit, TimeUnitTransform } from './types';
import { accessor, toDate } from '../../util/data';

/** Truncate `date` to the start of `unit` (local time). */
export function truncateTo(date: Date, unit: TimeUnit): Date {
  const year = date.getFullYear();
  const month = date.getMonth();
  const day = date.getDate();
  const hour = date.getHours();
  const minute = date.getMinutes();
  const second = date.getSeconds();
  switch (unit) {
    case 'year':
      return new Date(year, 0, 1);
    case 'quarter':
      return new Date(year, Math.floor(month / 3) * 3, 1);
    case 'month':
      return new Date(year, month, 1);
    case 'week': {
      const start = new Date(year, month, day - date.getDay());
      start.setHours(0, 0, 0, 0);
      return start;
    }
    case 'day':
      return new Date(year, month, day);
    case 'hour':
      return new Date(year, month, day, hour);
    case 'minute':
      return new Date(year, month, day, hour, minute);
    case 'second':
      return new Date(year, month, day, hour, minute, second);
    default:
      return new Date(date.getTime());
  }
}

/**
 * Apply a {@link TimeUnitTransform}, writing a truncated `Date` to `as`. Rows whose
 * field can't be parsed as a date receive `null`.
 */
export function applyTimeUnit(transform: TimeUnitTransform, data: Datum[]): Datum[] {
  const read = accessor(transform.field);
  return data.map((row) => {
    const date = toDate(read(row));
    return { ...row, [transform.as]: date ? truncateTo(date, transform.timeUnit) : null };
  });
}
