/**
 * Date formatting — strftime-style tokens, plus a "smart" formatter that picks
 * a sensible representation from the time span being shown (used by time axes).
 */

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function pad(n: number, width = 2): string {
  return String(n).padStart(width, '0');
}

const TOKENS: Record<string, (d: Date) => string> = {
  Y: (d) => String(d.getFullYear()),
  y: (d) => pad(d.getFullYear() % 100),
  m: (d) => pad(d.getMonth() + 1),
  d: (d) => pad(d.getDate()),
  e: (d) => String(d.getDate()),
  H: (d) => pad(d.getHours()),
  I: (d) => pad(((d.getHours() + 11) % 12) + 1),
  M: (d) => pad(d.getMinutes()),
  S: (d) => pad(d.getSeconds()),
  L: (d) => pad(d.getMilliseconds(), 3),
  p: (d) => (d.getHours() < 12 ? 'AM' : 'PM'),
  b: (d) => MONTHS[d.getMonth()].slice(0, 3),
  B: (d) => MONTHS[d.getMonth()],
  a: (d) => DAYS[d.getDay()].slice(0, 3),
  A: (d) => DAYS[d.getDay()],
  j: (d) => {
    const start = new Date(d.getFullYear(), 0, 0);
    const diff = d.getTime() - start.getTime();
    return pad(Math.floor(diff / 86_400_000), 3);
  },
};

/** Format a date with a strftime-like pattern, e.g. `%b %Y` → "Jan 2024". */
export function formatDate(value: Date | number, pattern: string): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  let out = '';
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === '%' && i + 1 < pattern.length) {
      const tok = pattern[++i];
      if (tok === '%') out += '%';
      else out += TOKENS[tok] ? TOKENS[tok](d) : '%' + tok;
    } else {
      out += ch;
    }
  }
  return out;
}

/**
 * Smart, span-aware label for a tick on a time axis. Picks granularity from the
 * distance between adjacent ticks so labels stay compact and legible.
 */
export function smartDate(value: Date | number, stepMs: number): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const SECOND = 1000;
  const MINUTE = 60 * SECOND;
  const HOUR = 60 * MINUTE;
  const DAY = 24 * HOUR;
  const MONTH = 30 * DAY;
  const YEAR = 365 * DAY;

  if (stepMs < SECOND) return formatDate(d, '%H:%M:%S.%L');
  if (stepMs < MINUTE) return formatDate(d, '%H:%M:%S');
  if (stepMs < DAY) return formatDate(d, '%H:%M');
  if (stepMs < MONTH) return formatDate(d, '%b %e');
  if (stepMs < YEAR) return formatDate(d, '%b %Y');
  return formatDate(d, '%Y');
}

/** A standalone, context-free pretty date used by tooltips. */
export function prettyDate(value: Date | number): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const hasTime = d.getHours() !== 0 || d.getMinutes() !== 0 || d.getSeconds() !== 0;
  return hasTime ? formatDate(d, '%b %e, %Y %H:%M') : formatDate(d, '%b %e, %Y');
}
