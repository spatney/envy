/**
 * Number formatting — a pragmatic subset of the d3-format mini-language, enough
 * for agent-authored specs without a runtime dependency.
 *
 * Grammar:  [$][,][.precision][type]
 *   $            prefix a currency symbol
 *   ,            group thousands
 *   .N           precision (digits after the decimal, or significant digits)
 *   type:
 *     f  fixed-point            (.2f  → 3.14)
 *     %  percent (×100)         (.0%  → 42%)
 *     s  SI suffix              (.1s  → 1.2k, 3.4M)
 *     d  integer (rounded)      (,d   → 1,234)
 *     e  exponential            (.2e  → 1.23e+4)
 *     g  significant digits     (.3g  → 12300)
 *     (none) → smart default: trims trailing zeros, optional grouping
 */

export interface NumberFormatSpec {
  currency?: string;
  group?: boolean;
  precision?: number;
  type?: 'f' | '%' | 's' | 'd' | 'e' | 'g' | '';
}

const FORMAT_RE = /^(\$)?(,)?(?:\.(\d+))?([f%sdeg])?$/;

const cache = new Map<string, NumberFormatSpec>();

export function parseNumberFormat(spec: string): NumberFormatSpec {
  const cached = cache.get(spec);
  if (cached) return cached;
  const m = FORMAT_RE.exec(spec.trim());
  const parsed: NumberFormatSpec = m
    ? {
        currency: m[1] ? '$' : undefined,
        group: Boolean(m[2]),
        precision: m[3] != null ? Number(m[3]) : undefined,
        type: (m[4] as NumberFormatSpec['type']) ?? '',
      }
    : {};
  cache.set(spec, parsed);
  return parsed;
}

const SI_SYMBOLS: Array<[number, string]> = [
  [1e12, 'T'],
  [1e9, 'B'],
  [1e6, 'M'],
  [1e3, 'k'],
];

function groupThousands(intDigits: string): string {
  return intDigits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// `Number.prototype.toFixed`/`toExponential` accept 0..100 digits and
// `toPrecision` accepts 1..100; anything outside throws a RangeError. A spec may
// legitimately *look* valid (e.g. ".0g" or ".101f") yet land out of range, so we
// clamp the requested digits into the engine's supported window instead of
// crashing the whole render.
function clampDigits(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

function applyGroup(numStr: string, group: boolean): string {
  if (!group) return numStr;
  const neg = numStr.startsWith('-');
  const body = neg ? numStr.slice(1) : numStr;
  const dot = body.indexOf('.');
  const intPart = dot === -1 ? body : body.slice(0, dot);
  const rest = dot === -1 ? '' : body.slice(dot);
  return (neg ? '-' : '') + groupThousands(intPart) + rest;
}

function trimZeros(s: string): string {
  if (s.indexOf('.') === -1) return s;
  return s.replace(/\.?0+$/, '');
}

function formatSI(value: number, precision?: number): string {
  const abs = Math.abs(value);
  for (const [factor, symbol] of SI_SYMBOLS) {
    if (abs >= factor) {
      const scaled = value / factor;
      const digits = precision ?? (Math.abs(scaled) >= 100 ? 0 : Math.abs(scaled) >= 10 ? 1 : 2);
      return trimZeros(scaled.toFixed(clampDigits(digits, 0, 100))) + symbol;
    }
  }
  const digits = precision ?? (abs >= 100 || abs === 0 ? 0 : abs >= 1 ? 1 : 2);
  return trimZeros(value.toFixed(clampDigits(digits, 0, 100)));
}

/** Format a number according to a parsed or string spec. */
export function formatNumber(value: number, spec?: string | NumberFormatSpec): string {
  if (value == null || Number.isNaN(value)) return '';
  if (!Number.isFinite(value)) return value > 0 ? '∞' : '-∞';
  const f: NumberFormatSpec = typeof spec === 'string' ? parseNumberFormat(spec) : spec ?? {};
  const { currency, group = false, precision, type = '' } = f;

  let body: string;
  switch (type) {
    case 'f':
      body = applyGroup(value.toFixed(clampDigits(precision ?? 2, 0, 100)), group);
      break;
    case '%':
      body = applyGroup((value * 100).toFixed(clampDigits(precision ?? 0, 0, 100)), group) + '%';
      break;
    case 's':
      body = formatSI(value, precision);
      break;
    case 'd':
      body = applyGroup(Math.round(value).toString(), group);
      break;
    case 'e':
      body = value.toExponential(clampDigits(precision ?? 2, 0, 100));
      break;
    case 'g':
      body = trimZeros(Number(value.toPrecision(clampDigits(precision ?? 6, 1, 100))).toString());
      body = applyGroup(body, group);
      break;
    default: {
      // Smart default: integers stay integers; floats trim to `precision` (or 6).
      if (Number.isInteger(value)) {
        body = applyGroup(value.toString(), group);
      } else {
        const digits = clampDigits(precision ?? 6, 0, 100);
        body = applyGroup(trimZeros(value.toFixed(digits)), group);
      }
    }
  }

  if (currency) {
    const neg = body.startsWith('-');
    return (neg ? '-' : '') + currency + (neg ? body.slice(1) : body);
  }
  return body;
}
