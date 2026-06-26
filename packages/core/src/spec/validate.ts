import type { ChartSpec, ChartType } from './types';
import { CHART_TYPES } from './types';

export interface ValidationError {
  /** JSON-path-ish location, e.g. "encoding.x.field". */
  path: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
}

const REQUIRED_CHANNELS: Record<ChartType, string[]> = {
  line: ['x', 'y'],
  area: ['x', 'y'],
  bar: ['x', 'y'],
  scatter: ['x', 'y'],
  pie: ['theta', 'color'],
  heatmap: ['x', 'y', 'color'],
  kpi: [],
  table: [],
  matrix: [],
};

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Validate a chart spec, returning friendly, path-pointed errors and warnings.
 * Designed so an agent can read the messages and fix its spec without guessing.
 */
export function validateSpec(spec: unknown): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];
  const err = (path: string, message: string) => errors.push({ path, message });
  const warn = (path: string, message: string) => warnings.push({ path, message });

  if (!isObject(spec)) {
    return {
      valid: false,
      errors: [{ path: '', message: 'Spec must be an object.' }],
      warnings: [],
    };
  }

  const type = spec.type as ChartType | undefined;
  if (!type) {
    err('type', 'Missing required "type". Expected one of: ' + CHART_TYPES.join(', ') + '.');
    return { valid: false, errors, warnings };
  }
  if (!CHART_TYPES.includes(type)) {
    err('type', `Unknown chart type "${String(type)}". Expected one of: ${CHART_TYPES.join(', ')}.`);
    return { valid: false, errors, warnings };
  }

  // Data presence (KPI may use a literal value instead).
  const data = spec.data as unknown;
  const hasData = Array.isArray(data) && data.length > 0;
  if (type !== 'kpi') {
    if (data === undefined) {
      err('data', `"${type}" requires a "data" array of records.`);
    } else if (!Array.isArray(data)) {
      err('data', '"data" must be an array of records.');
    } else if (data.length === 0) {
      warn('data', '"data" is empty — the chart will render with no marks.');
    }
  }

  const firstRow = hasData ? (data as unknown[])[0] : undefined;
  const fieldsInData = isObject(firstRow) ? new Set(Object.keys(firstRow)) : null;

  const checkField = (path: string, field: unknown) => {
    if (typeof field !== 'string' || field === '') {
      err(path, 'Field reference must be a non-empty string.');
      return;
    }
    if (fieldsInData && !fieldsInData.has(field)) {
      warn(path, `Field "${field}" was not found in the first data row.`);
    }
  };

  // Encoding-based charts.
  if (type !== 'kpi' && type !== 'table' && type !== 'matrix') {
    const encoding = spec.encoding;
    if (!isObject(encoding)) {
      err('encoding', `"${type}" requires an "encoding" object.`);
    } else {
      for (const ch of REQUIRED_CHANNELS[type]) {
        const channel = encoding[ch];
        if (!isObject(channel)) {
          err(`encoding.${ch}`, `"${type}" requires the "${ch}" channel.`);
        } else {
          checkField(`encoding.${ch}.field`, channel.field);
        }
      }
    }
  }

  if (type === 'kpi') {
    const value = spec.value;
    if (value === undefined) {
      err('value', '"kpi" requires a "value" (a number or { field, aggregate? }).');
    } else if (isObject(value)) {
      checkField('value.field', value.field);
    } else if (typeof value !== 'number') {
      err('value', '"value" must be a number or an object with a "field".');
    }
  }

  if (type === 'matrix') {
    const rows = spec.rows;
    if (!Array.isArray(rows) || rows.length === 0) {
      err('rows', '"matrix" requires a non-empty "rows" array of field names.');
    } else {
      rows.forEach((f, i) => checkField(`rows[${i}]`, f));
    }
    const values = spec.values;
    if (!Array.isArray(values) || values.length === 0) {
      err('values', '"matrix" requires a non-empty "values" array of { field, op }.');
    } else {
      values.forEach((v, i) => {
        if (!isObject(v)) {
          err(`values[${i}]`, 'Each value must be an object { field, op }.');
          return;
        }
        checkField(`values[${i}].field`, v.field);
        if (typeof v.op !== 'string') err(`values[${i}].op`, 'Missing aggregation "op".');
      });
    }
    const columns = spec.columns;
    if (columns !== undefined && !Array.isArray(columns)) {
      err('columns', '"columns" must be an array of field names.');
    }
  }

  if (type === 'table') {
    const columns = spec.columns;
    if (columns !== undefined) {
      if (!Array.isArray(columns)) {
        err('columns', '"columns" must be an array of column definitions.');
      } else {
        columns.forEach((c, i) => {
          if (!isObject(c)) err(`columns[${i}]`, 'Each column must be an object.');
          else checkField(`columns[${i}].field`, c.field);
        });
      }
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

/** Throw if invalid; returns the spec typed as ChartSpec otherwise. */
export function assertValidSpec(spec: unknown): ChartSpec {
  const { valid, errors } = validateSpec(spec);
  if (!valid) {
    const detail = errors.map((e) => `  - ${e.path || '(root)'}: ${e.message}`).join('\n');
    throw new Error(`Invalid Envy chart spec:\n${detail}`);
  }
  return spec as ChartSpec;
}
