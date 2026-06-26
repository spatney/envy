type FixedUnit = 'second' | 'minute' | 'hour' | 'day' | 'week';
type CalendarUnit = 'month' | 'year';

interface TimeInterval {
  unit: FixedUnit | CalendarUnit;
  step: number;
  duration: number;
}

const SECOND = 1_000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

const INTERVALS: TimeInterval[] = [
  { unit: 'second', step: 1, duration: SECOND },
  { unit: 'second', step: 5, duration: 5 * SECOND },
  { unit: 'second', step: 10, duration: 10 * SECOND },
  { unit: 'second', step: 15, duration: 15 * SECOND },
  { unit: 'second', step: 30, duration: 30 * SECOND },
  { unit: 'minute', step: 1, duration: MINUTE },
  { unit: 'minute', step: 5, duration: 5 * MINUTE },
  { unit: 'minute', step: 15, duration: 15 * MINUTE },
  { unit: 'minute', step: 30, duration: 30 * MINUTE },
  { unit: 'hour', step: 1, duration: HOUR },
  { unit: 'hour', step: 3, duration: 3 * HOUR },
  { unit: 'hour', step: 6, duration: 6 * HOUR },
  { unit: 'hour', step: 12, duration: 12 * HOUR },
  { unit: 'day', step: 1, duration: DAY },
  { unit: 'week', step: 1, duration: WEEK },
  { unit: 'month', step: 1, duration: MONTH },
  { unit: 'month', step: 3, duration: 3 * MONTH },
  { unit: 'year', step: 1, duration: YEAR },
];

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function chooseInterval(span: number, count: number): TimeInterval {
  const desired = Math.max(1, Math.floor(count));
  let best = INTERVALS[0];
  let bestScore = Number.POSITIVE_INFINITY;

  for (const interval of INTERVALS) {
    const produced = span / interval.duration;
    const score = Math.abs(produced - desired);
    if (score < bestScore) {
      best = interval;
      bestScore = score;
    }
  }

  return best;
}

function fixedDuration(interval: TimeInterval): number {
  switch (interval.unit) {
    case 'second':
      return interval.step * SECOND;
    case 'minute':
      return interval.step * MINUTE;
    case 'hour':
      return interval.step * HOUR;
    case 'day':
      return interval.step * DAY;
    case 'week':
      return interval.step * WEEK;
    default:
      return 0;
  }
}

function floorFixed(value: number, interval: TimeInterval): number {
  const duration = fixedDuration(interval);
  if (interval.unit !== 'week') {
    return Math.floor(value / duration) * duration;
  }

  const date = new Date(value);
  const midnight = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const day = new Date(midnight).getUTCDay();
  const weekStart = midnight - day * DAY;
  return weekStart - Math.floor((weekStart % duration + duration) % duration);
}

function addFixed(value: number, interval: TimeInterval): number {
  return value + fixedDuration(interval);
}

function floorMonth(value: number, step: number): number {
  const date = new Date(value);
  const month = Math.floor(date.getUTCMonth() / step) * step;
  return Date.UTC(date.getUTCFullYear(), month, 1);
}

function floorYear(value: number, step: number): number {
  const date = new Date(value);
  const year = Math.floor(date.getUTCFullYear() / step) * step;
  return Date.UTC(year, 0, 1);
}

function addCalendar(value: number, interval: TimeInterval): number {
  const date = new Date(value);
  if (interval.unit === 'month') {
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + interval.step, 1);
  }

  return Date.UTC(date.getUTCFullYear() + interval.step, 0, 1);
}

function floorTime(value: number, interval: TimeInterval): number {
  if (interval.unit === 'month') {
    return floorMonth(value, interval.step);
  }

  if (interval.unit === 'year') {
    return floorYear(value, interval.step);
  }

  return floorFixed(value, interval);
}

function ceilTime(value: number, interval: TimeInterval): number {
  const floored = floorTime(value, interval);
  if (floored === value) {
    return floored;
  }

  return addTime(floored, interval);
}

function addTime(value: number, interval: TimeInterval): number {
  return interval.unit === 'month' || interval.unit === 'year'
    ? addCalendar(value, interval)
    : addFixed(value, interval);
}

export function timeTicks(start: number, stop: number, count: number): number[] {
  if (!Number.isFinite(start) || !Number.isFinite(stop)) {
    return [];
  }

  if (start === stop) {
    return [start];
  }

  const reverse = stop < start;
  const min = reverse ? stop : start;
  const max = reverse ? start : stop;
  const interval = chooseInterval(max - min, count);
  const first = floorTime(min, interval);
  const last = ceilTime(max, interval);
  const result: number[] = [];

  for (let value = first; value <= last; value = addTime(value, interval)) {
    result.push(value);
    if (result.length > 100_000) {
      break;
    }
  }

  return reverse ? result.reverse() : result;
}

export function timeTickFormat(values: number[]): (t: number) => string {
  const ordered = [...values].sort((a, b) => a - b);
  const span = ordered.length > 1 ? Math.abs(ordered[1] - ordered[0]) : 0;

  return (time: number): string => {
    const date = new Date(time);
    const year = date.getUTCFullYear();
    const month = MONTH_NAMES[date.getUTCMonth()];
    const day = date.getUTCDate();
    const hours = pad2(date.getUTCHours());
    const minutes = pad2(date.getUTCMinutes());
    const seconds = pad2(date.getUTCSeconds());

    if (span >= YEAR * 0.8) {
      return String(year);
    }

    if (span >= MONTH * 0.8) {
      return ordered.some((tick) => new Date(tick).getUTCFullYear() !== year) ? `${month} ${year}` : month;
    }

    if (span >= DAY * 0.8) {
      return `${month} ${day}`;
    }

    if (span > 0 && span < MINUTE) {
      return `${hours}:${minutes}:${seconds}`;
    }

    return `${hours}:${minutes}`;
  };
}
