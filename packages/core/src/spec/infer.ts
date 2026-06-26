import type { Datum, FieldType } from '../types';

/** Detect whether a string looks like a date Envy can parse. */
function looksTemporal(value: string): boolean {
  if (value.length < 4) return false;
  // ISO-ish dates / datetimes, or YYYY, YYYY-MM, YYYY-MM-DD
  if (/^\d{4}(-\d{2}(-\d{2})?)?([T\s]\d{2}:\d{2})?/.test(value)) {
    const t = Date.parse(value);
    return !Number.isNaN(t);
  }
  return false;
}

/** Infer the channel type of a single value. */
export function inferValueType(value: unknown): FieldType | undefined {
  if (value == null) return undefined;
  if (typeof value === 'number') return Number.isFinite(value) ? 'quantitative' : undefined;
  if (value instanceof Date) return 'temporal';
  if (typeof value === 'boolean') return 'nominal';
  if (typeof value === 'string') {
    if (value.trim() === '') return undefined;
    if (looksTemporal(value)) return 'temporal';
    // numeric strings -> quantitative
    if (/^-?\d*\.?\d+(e[-+]?\d+)?$/i.test(value.trim())) return 'quantitative';
    return 'nominal';
  }
  return 'nominal';
}

/**
 * Infer the type of a field across a dataset by sampling non-null values.
 * Falls back to 'nominal' when ambiguous.
 */
export function inferFieldType(data: Datum[], field: string, sample = 50): FieldType {
  let seen = 0;
  const counts: Record<FieldType, number> = {
    quantitative: 0,
    temporal: 0,
    ordinal: 0,
    nominal: 0,
  };
  for (let i = 0; i < data.length && seen < sample; i++) {
    const t = inferValueType(data[i]?.[field]);
    if (!t) continue;
    counts[t]++;
    seen++;
  }
  if (seen === 0) return 'nominal';
  // Prefer the strongest signal: temporal > quantitative > nominal.
  if (counts.temporal >= seen * 0.6) return 'temporal';
  if (counts.quantitative >= seen * 0.6) return 'quantitative';
  return 'nominal';
}

/** Infer types for every field present in the first rows of the dataset. */
export function inferFieldTypes(data: Datum[]): Record<string, FieldType> {
  const fields = new Set<string>();
  for (let i = 0; i < Math.min(data.length, 20); i++) {
    const row = data[i];
    if (row) for (const k of Object.keys(row)) fields.add(k);
  }
  const out: Record<string, FieldType> = {};
  for (const f of fields) out[f] = inferFieldType(data, f);
  return out;
}
