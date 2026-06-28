import type { ChartSpec, ChartType, SlicerType } from './types';
import { CHART_TYPES, SLICER_TYPES } from './types';
import { TIME_UNITS, TRANSFORM_KINDS, checkExpression } from './transform';
import { lintSpec } from './lint';
import { closest, suggestions } from './suggest';
import { toPointer, type JsonPatchOp } from './jsonpatch';

export interface ValidationError {
  /** JSON-path-ish location, e.g. "encoding.x.field". */
  path: string;
  message: string;
  /**
   * Stable rule id for lint findings (e.g. "pie-too-many-slices"), so agents can
   * recognize, suppress, or learn from a specific best-practice warning. Absent
   * on structural validation errors.
   */
  rule?: string;
  /**
   * Severity of a lint finding. Structural problems are reported via `errors`
   * (implicitly 'error'); lint findings in `warnings` are 'warning' or 'info'.
   */
  severity?: 'error' | 'warning' | 'info';
  /**
   * Safe, unambiguous JSON Patch (RFC 6902) operations that resolve this problem
   * — present only when a correction is clear (e.g. a misspelled enum or chart
   * type, or a temporal-looking field typed as a category). An agent can apply
   * these directly instead of regenerating; {@link repairSpec} applies them for
   * you. Absent when the right fix is ambiguous.
   */
  fix?: JsonPatchOp[];
  /**
   * "Did you mean" candidates, nearest first, for an unrecognized value. `kind`
   * names what is being suggested so an agent can react appropriately.
   */
  suggestion?: { kind: 'chartType' | 'enum' | 'field' | 'channel'; candidates: string[] };
}

/**
 * Build "did you mean" candidates plus, when the best match is unambiguous, an
 * auto-fix patch for an invalid enum-like value. `path` is the dotted validation
 * path (converted to a JSON Pointer for the patch).
 */
function enumRepair(path: string, value: unknown, candidates: readonly string[]): Partial<ValidationError> {
  if (typeof value !== 'string' || value === '') return {};
  const out: Partial<ValidationError> = {};
  const cands = suggestions(value, candidates);
  if (cands.length) out.suggestion = { kind: 'enum', candidates: cands };
  const best = closest(value, candidates);
  if (best) out.fix = [{ op: 'replace', path: toPointer(path), value: best }];
  return out;
}

/** Build a field "did you mean" (suggestion only — never auto-fixed). */
function fieldRepair(value: unknown, fields: Set<string> | null): Partial<ValidationError> {
  if (typeof value !== 'string' || value === '' || !fields || fields.size === 0) return {};
  const cands = suggestions(value, [...fields]);
  return cands.length ? { suggestion: { kind: 'field', candidates: cands } } : {};
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
  combo: ['x'],
  histogram: ['x'],
  pie: ['theta', 'color'],
  heatmap: ['x', 'y', 'color'],
  funnel: ['stage', 'value'],
  box: ['x', 'y'],
  sankey: ['source', 'target', 'value'],
  choropleth: ['key', 'color'],
  treemap: ['category', 'value'],
  calendarHeatmap: ['date', 'color'],
  waterfall: ['stage', 'value'],
  slope: ['x', 'y', 'series'],
  dumbbell: ['category', 'value', 'group'],
  gauge: [],
  bullet: [],
  kpi: [],
  table: [],
  matrix: [],
  dropdown: [],
  search: [],
  list: [],
  range: [],
  dateRange: [],
};

const AGG_OPS = ['sum', 'mean', 'avg', 'min', 'max', 'count', 'countDistinct', 'median', 'first', 'last'];
const DENSITIES = ['comfortable', 'standard', 'compact'];
const COMBO_MARKS = ['line', 'bar', 'area', 'scatter'];
const COMBO_AXES = ['left', 'right'];
const NEGATIVE_STYLES = ['sign', 'parens', 'red', 'parens-red'];
const SHOW_AS = ['value', 'percentOfRow', 'percentOfColumn', 'percentOfTotal'];

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
  const err = (path: string, message: string, extra?: Partial<ValidationError>) =>
    errors.push({ path, message, ...extra });
  const warn = (path: string, message: string, extra?: Partial<ValidationError>) =>
    warnings.push({ path, message, ...extra });

  if (!isObject(spec)) {
    return {
      valid: false,
      errors: [{ path: '', message: 'Spec must be an object.' }],
      warnings: [],
    };
  }

  if (spec.type === 'dashboard') {
    return validateDashboard(spec);
  }

  const type = spec.type as ChartType | undefined;
  if (!type) {
    err('type', 'Missing required "type". Expected one of: ' + CHART_TYPES.join(', ') + '.');
    return { valid: false, errors, warnings };
  }
  if (!CHART_TYPES.includes(type)) {
    const cands = suggestions(String(type), CHART_TYPES);
    const best = closest(String(type), CHART_TYPES);
    const extra: Partial<ValidationError> = {};
    if (cands.length) extra.suggestion = { kind: 'chartType', candidates: cands };
    if (best) extra.fix = [{ op: 'replace', path: '/type', value: best }];
    err('type', `Unknown chart type "${String(type)}". Expected one of: ${CHART_TYPES.join(', ')}.`, extra);
    return { valid: false, errors, warnings };
  }

  // Data presence (KPI/gauge/bullet may use a literal value instead).
  const data = spec.data as unknown;
  const hasData = Array.isArray(data) && data.length > 0;
  if (type !== 'kpi' && type !== 'gauge' && type !== 'bullet') {
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

  // Validate declarative transforms, then treat the columns they produce as
  // available downstream so an encoding referencing a transform output (e.g. an
  // aggregate's `as`) doesn't warn "field not found in data".
  const transformOutputs = validateTransform(spec.transform, fieldsInData, err, warn);
  const knownFields =
    fieldsInData && transformOutputs.size > 0
      ? new Set([...fieldsInData, ...transformOutputs])
      : fieldsInData;

  const checkField = (path: string, field: unknown) => {
    if (typeof field !== 'string' || field === '') {
      err(path, 'Field reference must be a non-empty string.');
      return;
    }
    if (knownFields && !knownFields.has(field)) {
      warn(path, `Field "${field}" was not found in the first data row.`, fieldRepair(field, knownFields));
    }
  };

  // A ValueRef is a literal number or { field, aggregate? } (kpi/gauge/bullet).
  const checkValueRef = (path: string, ref: unknown, label: string, required: boolean) => {
    if (ref === undefined) {
      if (required) err(path, `"${label}" requires a "${path}" (a number or { field, aggregate? }).`);
      return;
    }
    if (isObject(ref)) {
      checkField(`${path}.field`, ref.field);
    } else if (typeof ref !== 'number') {
      err(path, `"${path}" must be a number or an object with a "field".`);
    }
  };

  // Encoding-based charts (those with required channels).
  if (REQUIRED_CHANNELS[type].length > 0) {
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

  if (type === 'gauge') {
    checkValueRef('value', spec.value, 'gauge', true);
    checkValueRef('target', spec.target, 'target', false);
    const max = spec.max;
    if (max === undefined) {
      err('max', '"gauge" requires a numeric "max" (the scale\'s full-scale value).');
    } else if (typeof max !== 'number' || !Number.isFinite(max)) {
      err('max', '"max" must be a finite number.');
    }
    if (spec.min !== undefined && (typeof spec.min !== 'number' || !Number.isFinite(spec.min))) {
      err('min', '"min" must be a finite number.');
    }
    if (typeof spec.min === 'number' && typeof max === 'number' && spec.min >= max) {
      err('max', '"max" must be greater than "min".');
    }
    if (spec.bands !== undefined) {
      if (!Array.isArray(spec.bands)) {
        err('bands', '"bands" must be an array of { to, color? }.');
      } else {
        spec.bands.forEach((b, i) => {
          if (!isObject(b) || typeof b.to !== 'number' || !Number.isFinite(b.to)) {
            err(`bands[${i}].to`, 'Each band needs a finite numeric "to".');
          }
        });
      }
    }
  }

  if (type === 'bullet') {
    checkValueRef('value', spec.value, 'bullet', true);
    checkValueRef('target', spec.target, 'target', false);
    if (spec.min !== undefined && (typeof spec.min !== 'number' || !Number.isFinite(spec.min))) {
      err('min', '"min" must be a finite number.');
    }
    if (spec.max !== undefined && (typeof spec.max !== 'number' || !Number.isFinite(spec.max))) {
      err('max', '"max" must be a finite number.');
    }
    if (spec.ranges !== undefined) {
      if (!Array.isArray(spec.ranges)) {
        err('ranges', '"ranges" must be an array of numbers (ascending range boundaries).');
      } else {
        spec.ranges.forEach((r, i) => {
          if (typeof r !== 'number' || !Number.isFinite(r)) {
            err(`ranges[${i}]`, 'Each range boundary must be a finite number.');
          }
        });
      }
    }
  }

  if (type === 'waterfall') {
    if (spec.totals !== undefined) {
      if (!Array.isArray(spec.totals)) {
        err('totals', '"totals" must be an array of stage labels to draw as absolute bars.');
      } else if (spec.totals.some((t) => typeof t !== 'string')) {
        err('totals', 'Each entry in "totals" must be a stage label string.');
      }
    }
    if (spec.showTotal !== undefined && typeof spec.showTotal !== 'boolean') {
      err('showTotal', '"showTotal" must be a boolean.');
    }
    if (spec.labels !== undefined && typeof spec.labels !== 'boolean') {
      err('labels', '"labels" must be a boolean.');
    }
    if (
      spec.cornerRadius !== undefined &&
      (typeof spec.cornerRadius !== 'number' || !Number.isFinite(spec.cornerRadius) || spec.cornerRadius < 0)
    ) {
      err('cornerRadius', '"cornerRadius" must be a non-negative number.');
    }
  }

  if (type === 'slope') {
    if (spec.labels !== undefined && typeof spec.labels !== 'boolean') {
      err('labels', '"labels" must be a boolean.');
    }
    if (spec.colorByChange !== undefined && typeof spec.colorByChange !== 'boolean') {
      err('colorByChange', '"colorByChange" must be a boolean.');
    }
  }

  if (type === 'dumbbell') {
    if (spec.labels !== undefined && typeof spec.labels !== 'boolean') {
      err('labels', '"labels" must be a boolean.');
    }
    const SORTS = ['ascending', 'descending', 'gap'];
    if (spec.sort !== undefined && !SORTS.includes(spec.sort as string)) {
      err('sort', 'Expected "ascending", "descending", or "gap".', enumRepair('sort', spec.sort, SORTS));
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
        else if (!AGG_OPS.includes(v.op)) err(`values[${i}].op`, `Expected one of: ${AGG_OPS.join(', ')}.`, enumRepair(`values[${i}].op`, v.op, AGG_OPS));
        if (v.conditionalFormat !== undefined) validateConditionalFormat(`values[${i}].conditionalFormat`, v.conditionalFormat, err);
        if (v.negativeStyle !== undefined && !NEGATIVE_STYLES.includes(v.negativeStyle as string)) {
          err(`values[${i}].negativeStyle`, 'Expected "sign", "parens", "red", or "parens-red".', enumRepair(`values[${i}].negativeStyle`, v.negativeStyle, NEGATIVE_STYLES));
        }
        if (v.showAs !== undefined && !SHOW_AS.includes(v.showAs as string)) {
          err(`values[${i}].showAs`, 'Expected "value", "percentOfRow", "percentOfColumn", or "percentOfTotal".', enumRepair(`values[${i}].showAs`, v.showAs, SHOW_AS));
        }
        for (const key of ['prefix', 'suffix'] as const) {
          if (v[key] !== undefined && typeof v[key] !== 'string') err(`values[${i}].${key}`, `"${key}" must be a string.`);
        }
      });
    }
    const columns = spec.columns;
    if (columns !== undefined && !Array.isArray(columns)) {
      err('columns', '"columns" must be an array of field names.');
    }
    if (spec.density !== undefined && !DENSITIES.includes(spec.density as string)) {
      err('density', 'Expected "comfortable", "standard", or "compact".', enumRepair('density', spec.density, DENSITIES));
    }
    if (spec.columnSort !== undefined) {
      if (!isObject(spec.columnSort)) {
        err('columnSort', '"columnSort" must be an object { by, valueIndex?, order? }.');
      } else {
        if (spec.columnSort.by !== 'value' && spec.columnSort.by !== 'label') {
          err('columnSort.by', 'Expected "value" or "label".');
        }
        if (
          spec.columnSort.valueIndex !== undefined &&
          (typeof spec.columnSort.valueIndex !== 'number' || !Number.isInteger(spec.columnSort.valueIndex) || spec.columnSort.valueIndex < 0)
        ) {
          err('columnSort.valueIndex', '"valueIndex" must be a non-negative integer.');
        }
        if (spec.columnSort.order !== undefined && spec.columnSort.order !== 'asc' && spec.columnSort.order !== 'desc') {
          err('columnSort.order', 'Expected "asc" or "desc".');
        }
      }
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
          else {
            checkField(`columns[${i}].field`, c.field);
            if (c.conditionalFormat !== undefined) validateConditionalFormat(`columns[${i}].conditionalFormat`, c.conditionalFormat, err);
            if (c.negativeStyle !== undefined && !NEGATIVE_STYLES.includes(c.negativeStyle as string)) {
              err(`columns[${i}].negativeStyle`, 'Expected "sign", "parens", "red", or "parens-red".', enumRepair(`columns[${i}].negativeStyle`, c.negativeStyle, NEGATIVE_STYLES));
            }
            for (const key of ['prefix', 'suffix', 'group'] as const) {
              if (c[key] !== undefined && typeof c[key] !== 'string') err(`columns[${i}].${key}`, `"${key}" must be a string.`);
            }
            for (const key of ['hidden', 'sortable', 'wrap'] as const) {
              if (c[key] !== undefined && typeof c[key] !== 'boolean') err(`columns[${i}].${key}`, `"${key}" must be a boolean.`);
            }
            if (c.total !== undefined && c.total !== false && (typeof c.total !== 'string' || !AGG_OPS.includes(c.total))) {
              err(`columns[${i}].total`, `Expected false or one of: ${AGG_OPS.join(', ')}.`);
            }
          }
        });
      }
    }
    if (spec.density !== undefined && !DENSITIES.includes(spec.density as string)) {
      err('density', 'Expected "comfortable", "standard", or "compact".', enumRepair('density', spec.density, DENSITIES));
    }
    if (spec.totals !== undefined && typeof spec.totals !== 'boolean') {
      if (!isObject(spec.totals)) {
        err('totals', '"totals" must be a boolean or an object { label? }.');
      } else if (spec.totals.label !== undefined && typeof spec.totals.label !== 'string') {
        err('totals.label', '"label" must be a string.');
      }
    }
  }

  if (type === 'pie') {
    const labels = spec.labels;
    if (labels !== undefined && typeof labels !== 'boolean') {
      if (!isObject(labels)) {
        err('labels', '"labels" must be a boolean or a { show?, placement?, content?, minShare?, connector? } object.');
      } else {
        if (labels.show !== undefined && typeof labels.show !== 'boolean') {
          err('labels.show', '"show" must be a boolean.');
        }
        if (labels.placement !== undefined && !['inside', 'outside', 'auto'].includes(labels.placement as string)) {
          err('labels.placement', 'Expected "inside", "outside", or "auto".');
        }
        if (
          labels.content !== undefined &&
          !['percent', 'value', 'category', 'category-percent', 'category-value'].includes(labels.content as string)
        ) {
          err('labels.content', 'Expected "percent", "value", "category", "category-percent", or "category-value".');
        }
        if (
          labels.minShare !== undefined &&
          (typeof labels.minShare !== 'number' || labels.minShare < 0 || labels.minShare > 1)
        ) {
          err('labels.minShare', '"minShare" must be a number between 0 and 1.');
        }
        if (labels.connector !== undefined && !['slice', 'muted'].includes(labels.connector as string)) {
          err('labels.connector', 'Expected "slice" or "muted".');
        }
      }
    }
  }

  if (type === 'choropleth') {
    const geo = spec.geo as { type?: unknown; features?: unknown } | undefined;
    if (!isObject(geo)) {
      err('geo', '"choropleth" requires a "geo" GeoJSON FeatureCollection.');
    } else if (geo.type !== 'FeatureCollection' || !Array.isArray(geo.features)) {
      err('geo', '"geo" must be a GeoJSON FeatureCollection with a "features" array.');
    } else if (geo.features.length === 0) {
      warn('geo', '"geo.features" is empty — the map will render nothing.');
    }
  }

  if (type === 'combo') {
    const layers = spec.layers;
    if (!Array.isArray(layers) || layers.length === 0) {
      err('layers', '"combo" requires a non-empty "layers" array (each with a "mark" and a "y" encoding).');
    } else {
      let hasBar = false;
      layers.forEach((layer, i) => {
        const base = `layers[${i}]`;
        if (!isObject(layer)) {
          err(base, 'Each combo layer must be an object { mark, encoding: { y }, axis? }.');
          return;
        }
        if (typeof layer.mark !== 'string' || !COMBO_MARKS.includes(layer.mark)) {
          err(`${base}.mark`, `Expected "mark" to be one of: ${COMBO_MARKS.join(', ')}.`, enumRepair(`${base}.mark`, layer.mark, COMBO_MARKS));
        } else if (layer.mark === 'bar') {
          hasBar = true;
        }
        const enc = layer.encoding;
        if (!isObject(enc) || !isObject(enc.y)) {
          err(`${base}.encoding.y`, 'Each combo layer requires an "encoding.y" field definition.');
        } else {
          checkField(`${base}.encoding.y.field`, enc.y.field);
        }
        if (layer.axis !== undefined && !COMBO_AXES.includes(layer.axis as string)) {
          err(`${base}.axis`, 'Expected "left" or "right".', enumRepair(`${base}.axis`, layer.axis, COMBO_AXES));
        }
      });
      // Bars need a categorical x — warn when paired with a quantitative axis.
      const xType = isObject(spec.encoding) && isObject(spec.encoding.x) ? spec.encoding.x.type : undefined;
      if (hasBar && xType === 'quantitative') {
        warn('encoding.x', 'Combo bar layers read against a categorical x; a quantitative x will be treated as categories.');
      }
    }
  }

  if (type === 'histogram') {
    const bin = spec.bin;
    if (bin !== undefined) {
      if (!isObject(bin)) {
        err('bin', '"bin" must be an object { maxbins?, step?, extent?, nice? }.');
      } else {
        if (bin.maxbins !== undefined && (typeof bin.maxbins !== 'number' || bin.maxbins < 1)) {
          err('bin.maxbins', '"maxbins" must be a positive number.');
        }
        if (bin.step !== undefined && (typeof bin.step !== 'number' || bin.step <= 0)) {
          err('bin.step', '"step" must be a positive number.');
        }
        if (bin.extent !== undefined) {
          const e = bin.extent as unknown;
          if (!Array.isArray(e) || e.length !== 2 || typeof e[0] !== 'number' || typeof e[1] !== 'number') {
            err('bin.extent', '"extent" must be a [min, max] pair of numbers.');
          } else if (e[0] >= e[1]) {
            err('bin.extent', '"extent" min must be less than max.');
          }
        }
        if (bin.nice !== undefined && typeof bin.nice !== 'boolean') {
          err('bin.nice', '"nice" must be a boolean.');
        }
      }
    }
    if (spec.density !== undefined && typeof spec.density !== 'boolean') {
      err('density', '"density" must be a boolean.');
    }
    if (spec.cornerRadius !== undefined && (typeof spec.cornerRadius !== 'number' || spec.cornerRadius < 0)) {
      err('cornerRadius', '"cornerRadius" must be a non-negative number.');
    }
  }

  if (SLICER_TYPES.includes(type as SlicerType)) {
    checkField('field', spec.field);
    if (spec.param !== undefined && (typeof spec.param !== 'string' || spec.param === '')) {
      err('param', '"param" must be a non-empty string (defaults to the field name).');
    }
    if (spec.as !== undefined && spec.as !== 'filter' && spec.as !== 'highlight') {
      err('as', 'Expected "filter" or "highlight".');
    }
    const numberField = (key: string, min?: number) => {
      const v = spec[key];
      if (v !== undefined && (typeof v !== 'number' || !Number.isFinite(v) || (min != null && v < min))) {
        err(key, `"${key}" must be a finite number${min != null ? ` ≥ ${min}` : ''}.`);
      }
    };
    const boolField = (key: string) => {
      if (spec[key] !== undefined && typeof spec[key] !== 'boolean') {
        err(key, `"${key}" must be a boolean.`);
      }
    };
    if (type === 'dropdown') boolField('multiple');
    if (type === 'search') numberField('debounce', 0);
    if (type === 'list') {
      numberField('searchThreshold', 0);
      boolField('selectAll');
    }
    if (type === 'range') {
      numberField('min');
      numberField('max');
      numberField('step', 0);
      const lo = spec.min;
      const hi = spec.max;
      if (typeof lo === 'number' && typeof hi === 'number' && lo >= hi) {
        err('max', '"max" must be greater than "min".');
      }
    }
    if (type === 'dateRange') boolField('presets');
  }

  validateInteraction(spec, err, warn);

  if (spec.annotations !== undefined) validateAnnotations(spec.annotations, type, err, warn);

  const sketch = spec.sketch;
  if (sketch !== undefined && typeof sketch !== 'boolean') {
    if (!isObject(sketch)) {
      err('sketch', '"sketch" must be a boolean or a SketchConfig object.');
    } else {
      const fillStyle = sketch.fillStyle;
      if (fillStyle !== undefined && !['hachure', 'solid', 'cross-hatch'].includes(fillStyle as string)) {
        err('sketch.fillStyle', 'Expected "hachure", "solid", or "cross-hatch".');
      }
      for (const key of ['roughness', 'bowing', 'hachureGap', 'hachureAngle', 'strokeWidth', 'seed'] as const) {
        const v = sketch[key];
        if (v !== undefined && (typeof v !== 'number' || !Number.isFinite(v))) {
          err(`sketch.${key}`, `"${key}" must be a finite number.`);
        }
      }
    }
  }

  // Best-practice lint pass (advisory). Never blocks rendering; appended to
  // `warnings` with a stable rule id + severity so agents can act on each.
  try {
    for (const finding of lintSpec(spec as unknown as ChartSpec)) warnings.push(finding);
  } catch {
    // Linting is best-effort; a rule bug must never break validation.
  }

  return { valid: errors.length === 0, errors, warnings };
}

type Reporter = (path: string, message: string, extra?: Partial<ValidationError>) => void;

function validateConditionalFormat(path: string, cf: unknown, err: Reporter): void {
  if (!isObject(cf)) {
    err(path, '"conditionalFormat" must be an object with a "type".');
    return;
  }
  if (!['colorScale', 'bar', 'icon', 'rules'].includes(cf.type as string)) {
    err(`${path}.type`, 'Expected "colorScale", "bar", "icon", or "rules".', enumRepair(`${path}.type`, cf.type, ['colorScale', 'bar', 'icon', 'rules']));
    return;
  }
  validateDomain(`${path}.domain`, cf.domain, err);
  if (cf.type === 'colorScale') {
    if (cf.midpoint !== undefined && (typeof cf.midpoint !== 'number' || !Number.isFinite(cf.midpoint))) {
      err(`${path}.midpoint`, '"midpoint" must be a finite number.');
    }
    if (cf.diverging !== undefined && typeof cf.diverging !== 'boolean') err(`${path}.diverging`, '"diverging" must be a boolean.');
    if (cf.target !== undefined && cf.target !== 'background' && cf.target !== 'text') {
      err(`${path}.target`, 'Expected "background" or "text".');
    }
  } else if (cf.type === 'bar') {
    if (cf.baseline !== undefined && cf.baseline !== 'zero' && cf.baseline !== 'min') {
      err(`${path}.baseline`, 'Expected "zero" or "min".');
    }
    if (cf.showValue !== undefined && typeof cf.showValue !== 'boolean') err(`${path}.showValue`, '"showValue" must be a boolean.');
    for (const key of ['color', 'negativeColor'] as const) {
      if (cf[key] !== undefined && typeof cf[key] !== 'string') err(`${path}.${key}`, `"${key}" must be a color string.`);
    }
  } else if (cf.type === 'icon') {
    if (cf.set !== undefined && !['arrows', 'triangles', 'dots', 'trafficLights'].includes(cf.set as string)) {
      err(`${path}.set`, 'Expected "arrows", "triangles", "dots", or "trafficLights".', enumRepair(`${path}.set`, cf.set, ['arrows', 'triangles', 'dots', 'trafficLights']));
    }
    if (cf.position !== undefined && cf.position !== 'left' && cf.position !== 'right') {
      err(`${path}.position`, 'Expected "left" or "right".');
    }
    if (cf.rules !== undefined) validateRules(`${path}.rules`, cf.rules, err, true);
  } else if (!Array.isArray(cf.rules) || cf.rules.length === 0) {
    err(`${path}.rules`, '"rules" conditional formatting requires a non-empty "rules" array.');
  } else {
    validateRules(`${path}.rules`, cf.rules, err, false);
  }
}

function validateDomain(path: string, domain: unknown, err: Reporter): void {
  if (domain === undefined) return;
  if (!Array.isArray(domain) || domain.length !== 2 || domain.some((value) => typeof value !== 'number' || !Number.isFinite(value))) {
    err(path, '"domain" must be a [min, max] pair of finite numbers.');
  }
}

function validateRules(path: string, rules: unknown, err: Reporter, iconRules: boolean): void {
  if (!Array.isArray(rules)) {
    err(path, '"rules" must be an array.');
    return;
  }
  rules.forEach((rule, index) => {
    const rulePath = `${path}[${index}]`;
    if (!isObject(rule)) {
      err(rulePath, 'Each rule must be an object.');
      return;
    }
    if (!['gt', 'gte', 'lt', 'lte', 'eq', 'ne', 'between'].includes(rule.when as string)) {
      err(`${rulePath}.when`, 'Expected one of: gt, gte, lt, lte, eq, ne, between.', enumRepair(`${rulePath}.when`, rule.when, ['gt', 'gte', 'lt', 'lte', 'eq', 'ne', 'between']));
    }
    if (iconRules || !['eq', 'ne'].includes(rule.when as string)) {
      if (typeof rule.value !== 'number' || !Number.isFinite(rule.value)) err(`${rulePath}.value`, '"value" must be a finite number.');
    } else if (typeof rule.value !== 'number' && typeof rule.value !== 'string') {
      err(`${rulePath}.value`, '"value" must be a number or string.');
    }
    if (rule.when === 'between' && (typeof rule.to !== 'number' || !Number.isFinite(rule.to))) {
      err(`${rulePath}.to`, '"between" rules require a finite numeric "to".');
    }
    if (rule.to !== undefined && (typeof rule.to !== 'number' || !Number.isFinite(rule.to))) {
      err(`${rulePath}.to`, '"to" must be a finite number.');
    }
    if (!iconRules) {
      if (rule.weight !== undefined && rule.weight !== 'bold' && rule.weight !== 'normal') {
        err(`${rulePath}.weight`, 'Expected "bold" or "normal".');
      }
      for (const key of ['background', 'color', 'icon'] as const) {
        if (rule[key] !== undefined && typeof rule[key] !== 'string') err(`${rulePath}.${key}`, `"${key}" must be a string.`);
      }
    } else {
      for (const key of ['icon', 'color'] as const) {
        if (rule[key] !== undefined && typeof rule[key] !== 'string') err(`${rulePath}.${key}`, `"${key}" must be a string.`);
      }
    }
  });
}

/**
 * Validate a declarative `transform` pipeline. Returns the set of output column
 * names the pipeline produces, so the caller can treat them as available fields
 * downstream. Input fields are checked against a running set (original columns +
 * prior steps' outputs); unknown inputs warn rather than error, mirroring the
 * lenient field-existence checks elsewhere.
 */
function validateTransform(
  transform: unknown,
  baseFields: Set<string> | null,
  err: Reporter,
  warn: Reporter,
): Set<string> {
  const outputs = new Set<string>();
  if (transform === undefined) return outputs;
  if (!Array.isArray(transform)) {
    err('transform', '"transform" must be an array of transform steps.');
    return outputs;
  }

  const available = baseFields ? new Set(baseFields) : null;
  const checkInput = (path: string, field: unknown) => {
    if (typeof field !== 'string' || field === '') {
      err(path, 'Field reference must be a non-empty string.');
      return;
    }
    if (available && !available.has(field)) {
      warn(path, `Field "${field}" was not found in the data at this step.`, fieldRepair(field, available));
    }
  };
  const addOutput = (name: unknown) => {
    if (typeof name === 'string' && name !== '') {
      outputs.add(name);
      available?.add(name);
    }
  };

  transform.forEach((step, index) => {
    const p = `transform[${index}]`;
    if (!isObject(step)) {
      err(p, 'Each transform step must be an object.');
      return;
    }
    const present = TRANSFORM_KINDS.filter((kind) => kind in step);
    if (present.length === 0) {
      err(p, `Unknown transform. Expected one of: ${TRANSFORM_KINDS.join(', ')}.`);
      return;
    }
    if (present.length > 1) {
      err(p, `A transform step must have exactly one operator; found: ${present.join(', ')}.`);
      return;
    }

    if (present[0] === 'aggregate') {
      const aggs = step.aggregate;
      if (!Array.isArray(aggs) || aggs.length === 0) {
        err(`${p}.aggregate`, '"aggregate" must be a non-empty array of { op, field?, as }.');
      } else {
        aggs.forEach((agg, j) => {
          const ap = `${p}.aggregate[${j}]`;
          if (!isObject(agg)) {
            err(ap, 'Each aggregate must be an object { op, field?, as }.');
            return;
          }
          if (typeof agg.op !== 'string' || !AGG_OPS.includes(agg.op)) {
            err(`${ap}.op`, `Expected "op" to be one of: ${AGG_OPS.join(', ')}.`, enumRepair(`${ap}.op`, agg.op, AGG_OPS));
          }
          if (agg.op !== 'count' && agg.field === undefined) {
            err(`${ap}.field`, `"${String(agg.op)}" requires a "field".`);
          }
          if (agg.field !== undefined) checkInput(`${ap}.field`, agg.field);
          if (typeof agg.as !== 'string' || agg.as === '') {
            err(`${ap}.as`, '"as" must be a non-empty output field name.');
          } else {
            addOutput(agg.as);
          }
        });
      }
      if (step.groupby !== undefined) {
        if (!Array.isArray(step.groupby)) {
          err(`${p}.groupby`, '"groupby" must be an array of field names.');
        } else {
          step.groupby.forEach((field, j) => {
            checkInput(`${p}.groupby[${j}]`, field);
            addOutput(field);
          });
        }
      }
    } else if (present[0] === 'bin') {
      checkInput(`${p}.bin`, step.bin);
      const as = step.as;
      if (typeof as === 'string' && as !== '') {
        addOutput(as);
      } else if (
        Array.isArray(as) &&
        as.length === 2 &&
        as.every((x) => typeof x === 'string' && x !== '')
      ) {
        addOutput(as[0]);
        addOutput(as[1]);
      } else {
        err(`${p}.as`, '"as" must be an output field name or a [start, end] pair of names.');
      }
      for (const key of ['maxbins', 'step'] as const) {
        if (step[key] !== undefined && (typeof step[key] !== 'number' || !Number.isFinite(step[key]))) {
          err(`${p}.${key}`, `"${key}" must be a finite number.`);
        }
      }
      if (
        step.extent !== undefined &&
        (!Array.isArray(step.extent) || step.extent.length !== 2 || step.extent.some((x) => typeof x !== 'number'))
      ) {
        err(`${p}.extent`, '"extent" must be a [min, max] pair of numbers.');
      }
    } else if (present[0] === 'filter') {
      validateFilterPredicate(`${p}.filter`, step.filter, err);
    } else if (present[0] === 'fold') {
      if (
        !Array.isArray(step.fold) ||
        step.fold.length === 0 ||
        step.fold.some((x) => typeof x !== 'string' || x === '')
      ) {
        err(`${p}.fold`, '"fold" must be a non-empty array of field names.');
      } else {
        step.fold.forEach((field, j) => checkInput(`${p}.fold[${j}]`, field));
      }
      const as = step.as;
      if (as === undefined) {
        addOutput('key');
        addOutput('value');
      } else if (
        Array.isArray(as) &&
        as.length === 2 &&
        as.every((x) => typeof x === 'string' && x !== '')
      ) {
        addOutput(as[0]);
        addOutput(as[1]);
      } else {
        err(`${p}.as`, '"as" must be a [key, value] pair of names.');
      }
    } else if (present[0] === 'timeUnit') {
      if (typeof step.timeUnit !== 'string' || !(TIME_UNITS as readonly string[]).includes(step.timeUnit)) {
        err(`${p}.timeUnit`, `Expected "timeUnit" to be one of: ${TIME_UNITS.join(', ')}.`, enumRepair(`${p}.timeUnit`, step.timeUnit, TIME_UNITS));
      }
      checkInput(`${p}.field`, step.field);
      if (typeof step.as !== 'string' || step.as === '') {
        err(`${p}.as`, '"as" must be a non-empty output field name.');
      } else {
        addOutput(step.as);
      }
    } else if (present[0] === 'calculate') {
      if (typeof step.calculate !== 'string' || step.calculate.trim() === '') {
        err(`${p}.calculate`, '"calculate" must be a non-empty expression string.');
      } else {
        const syntax = checkExpression(step.calculate);
        if (syntax) {
          const at = syntax.pos === undefined ? '' : ` (at offset ${syntax.pos})`;
          err(`${p}.calculate`, `Invalid expression${at}: ${syntax.message}`);
        }
      }
      if (typeof step.as !== 'string' || step.as === '') {
        err(`${p}.as`, '"as" must be a non-empty output field name.');
      } else {
        addOutput(step.as);
      }
    }
  });

  return outputs;
}

const ANNOTATION_TYPES = ['line', 'band', 'zone'];
const LABEL_POSITIONS = ['start', 'middle', 'end'];
/** Chart types that draw `annotations` (cartesian); others ignore them. */
const ANNOTATABLE_TYPES = ['line', 'area', 'bar', 'scatter', 'box'];

/** A reference value usable on an axis: number, category string, or date. */
function isScalarValue(v: unknown): boolean {
  return typeof v === 'number' || typeof v === 'string' || v instanceof Date;
}

/**
 * Validate `annotations` — reference lines, bands, and threshold zones. A `line`
 * needs a `value`; a `band`/`zone` needs `from` and `to`. Annotations only draw
 * on cartesian charts, so a non-cartesian host gets an advisory warning.
 */
function validateAnnotations(annotations: unknown, chartType: ChartType, err: Reporter, warn: Reporter): void {
  if (!Array.isArray(annotations)) {
    err('annotations', '"annotations" must be an array of reference lines/bands.');
    return;
  }
  if (!ANNOTATABLE_TYPES.includes(chartType)) {
    warn(
      'annotations',
      `Annotations are only drawn on cartesian charts (line/area/bar/scatter/box); ignored for "${chartType}".`,
    );
    return;
  }
  annotations.forEach((ann, i) => {
    const p = `annotations[${i}]`;
    if (!isObject(ann)) {
      err(p, 'Each annotation must be an object.');
      return;
    }
    if (ann.type !== undefined && !ANNOTATION_TYPES.includes(ann.type as string)) {
      err(`${p}.type`, 'Expected "line", "band", or "zone".', enumRepair(`${p}.type`, ann.type, ANNOTATION_TYPES));
    }
    if (ann.axis !== undefined && ann.axis !== 'x' && ann.axis !== 'y') {
      err(`${p}.axis`, 'Expected "x" or "y".', enumRepair(`${p}.axis`, ann.axis, ['x', 'y']));
    }

    const isLine = ann.type === 'line' || (ann.type === undefined && ann.value !== undefined);
    if (isLine) {
      if (!isScalarValue(ann.value)) {
        err(`${p}.value`, 'A reference line needs a "value" (number, category, or date).');
      }
    } else {
      if (!isScalarValue(ann.from) || !isScalarValue(ann.to)) {
        err(p, 'A band/zone needs both "from" and "to" (number, category, or date).');
      }
    }
    if (ann.value !== undefined && (ann.from !== undefined || ann.to !== undefined)) {
      warn(p, 'Provide either "value" (a line) or "from"/"to" (a band) — not both.');
    }

    if (ann.label !== undefined && typeof ann.label !== 'string') err(`${p}.label`, '"label" must be a string.');
    if (ann.color !== undefined && typeof ann.color !== 'string') err(`${p}.color`, '"color" must be a color string.');
    for (const key of ['strokeWidth', 'fillOpacity'] as const) {
      if (ann[key] !== undefined && (typeof ann[key] !== 'number' || !Number.isFinite(ann[key]))) {
        err(`${p}.${key}`, `"${key}" must be a finite number.`);
      }
    }
    if (
      ann.strokeDash !== undefined &&
      (!Array.isArray(ann.strokeDash) || ann.strokeDash.some((n) => typeof n !== 'number' || !Number.isFinite(n)))
    ) {
      err(`${p}.strokeDash`, '"strokeDash" must be an array of numbers.');
    }
    if (ann.labelPosition !== undefined && !LABEL_POSITIONS.includes(ann.labelPosition as string)) {
      err(`${p}.labelPosition`, 'Expected "start", "middle", or "end".', enumRepair(`${p}.labelPosition`, ann.labelPosition, LABEL_POSITIONS));
    }
  });
}

/** Validate a {@link FilterPredicate} tree (and/or/not + leaf comparisons). */
function validateFilterPredicate(path: string, pred: unknown, err: Reporter): void {
  if (!isObject(pred)) {
    err(path, 'A filter predicate must be an object.');
    return;
  }
  if ('and' in pred || 'or' in pred) {
    const key = 'and' in pred ? 'and' : 'or';
    const arr = pred[key];
    if (!Array.isArray(arr) || arr.length === 0) {
      err(`${path}.${key}`, `"${key}" must be a non-empty array of predicates.`);
    } else {
      arr.forEach((clause, i) => validateFilterPredicate(`${path}.${key}[${i}]`, clause, err));
    }
    return;
  }
  if ('not' in pred) {
    validateFilterPredicate(`${path}.not`, pred.not, err);
    return;
  }
  if (typeof pred.field !== 'string' || pred.field === '') {
    err(`${path}.field`, 'A filter predicate needs a non-empty "field" (or use and/or/not).');
    return;
  }
  const ops = ['equals', 'ne', 'oneOf', 'range', 'contains', 'gt', 'gte', 'lt', 'lte', 'valid'];
  const present = ops.filter((op) => op in pred);
  if (present.length === 0) {
    err(path, `A filter on "${pred.field}" needs one of: ${ops.join(', ')}.`);
    return;
  }
  if ('oneOf' in pred && !Array.isArray(pred.oneOf)) {
    err(`${path}.oneOf`, '"oneOf" must be an array of values.');
  }
  if ('range' in pred && (!Array.isArray(pred.range) || pred.range.length !== 2)) {
    err(`${path}.range`, '"range" must be a [min, max] pair.');
  }
}

const SELECTION_KINDS = ['point', 'set', 'range', 'text'];

/**
 * Validate the cross-visual interaction surface shared by every spec: the
 * `params` a visual publishes, and the `highlight` / `filter` it consumes. Shape
 * checks only — `highlight`/`filter` often reference params defined on *other*
 * visuals (cross-highlight/cross-filter), so an unknown param name is not an
 * error here.
 */
function validateInteraction(
  spec: Record<string, unknown>,
  err: Reporter,
  warn: Reporter,
): void {
  const { params, highlight, filter } = spec;

  if (params !== undefined) {
    if (!Array.isArray(params)) {
      err('params', '"params" must be an array of selection definitions.');
    } else {
      const seen = new Set<string>();
      params.forEach((p, i) => {
        if (!isObject(p)) {
          err(`params[${i}]`, 'Each param must be an object { name, select }.');
          return;
        }
        if (typeof p.name !== 'string' || p.name === '') {
          err(`params[${i}].name`, 'A param needs a non-empty "name".');
        } else if (seen.has(p.name)) {
          err(`params[${i}].name`, `Duplicate param name "${p.name}".`);
        } else {
          seen.add(p.name);
        }
        const select = p.select;
        if (!isObject(select)) {
          err(`params[${i}].select`, 'A param needs a "select" with a "type".');
        } else if (select.type !== 'point' && select.type !== 'interval') {
          err(`params[${i}].select.type`, 'Expected "point" or "interval".', enumRepair(`params[${i}].select.type`, select.type, ['point', 'interval']));
        }
        if (p.value !== undefined && p.value !== null) {
          validateSelectionValue(`params[${i}].value`, p.value, err);
        }
      });
    }
  }

  if (highlight !== undefined) {
    const configs = Array.isArray(highlight) ? highlight : [highlight];
    if (Array.isArray(highlight) && highlight.length === 0) {
      warn('highlight', '"highlight" is an empty array — nothing will be emphasized.');
    }
    configs.forEach((cfg, i) => {
      const path = Array.isArray(highlight) ? `highlight[${i}]` : 'highlight';
      if (!isObject(cfg) || typeof cfg.param !== 'string' || cfg.param === '') {
        err(path, '"highlight" must be an object { param } (or an array of them).');
      }
    });
  }

  if (filter !== undefined) {
    if (!Array.isArray(filter)) {
      err('filter', '"filter" must be an array of clauses (a { param } or a predicate).');
    } else {
      filter.forEach((clause, i) => {
        if (!isObject(clause)) {
          err(`filter[${i}]`, 'Each filter clause must be an object.');
          return;
        }
        if (typeof clause.param === 'string') {
          if (clause.param === '') err(`filter[${i}].param`, 'Param reference must be non-empty.');
          return;
        }
        if (typeof clause.field !== 'string' || clause.field === '') {
          err(`filter[${i}].field`, 'A literal filter clause needs a "field".');
        }
        const forms = ['equals', 'oneOf', 'range', 'contains'].filter((k) => k in clause);
        if (forms.length === 0) {
          err(`filter[${i}]`, 'A literal clause needs one of: equals, oneOf, range, contains.');
        } else if (forms.length > 1) {
          warn(`filter[${i}]`, `Multiple predicate forms (${forms.join(', ')}); the first is used.`);
        }
        if ('oneOf' in clause && !Array.isArray(clause.oneOf)) {
          err(`filter[${i}].oneOf`, '"oneOf" must be an array of values.');
        }
        if ('range' in clause && (!Array.isArray(clause.range) || clause.range.length !== 2)) {
          err(`filter[${i}].range`, '"range" must be a [min, max] pair.');
        }
        if ('contains' in clause && typeof clause.contains !== 'string') {
          err(`filter[${i}].contains`, '"contains" must be a string.');
        }
      });
    }
  }
}

/** Validate a resolved selection value object (initial param values). */
function validateSelectionValue(path: string, value: unknown, err: Reporter): void {
  if (!isObject(value) || typeof value.kind !== 'string' || !SELECTION_KINDS.includes(value.kind)) {
    err(path, `Selection value "kind" must be one of: ${SELECTION_KINDS.join(', ')}.`);
    return;
  }
  if (value.kind === 'point') {
    if (!Array.isArray(value.fields)) err(`${path}.fields`, '"point" needs a "fields" array.');
    if (!Array.isArray(value.tuples)) err(`${path}.tuples`, '"point" needs a "tuples" array.');
  } else if (value.kind === 'set') {
    if (typeof value.field !== 'string') err(`${path}.field`, '"set" needs a "field".');
    if (!Array.isArray(value.values)) err(`${path}.values`, '"set" needs a "values" array.');
  } else if (value.kind === 'range') {
    if (typeof value.field !== 'string') err(`${path}.field`, '"range" needs a "field".');
  } else if (value.kind === 'text') {
    if (typeof value.field !== 'string') err(`${path}.field`, '"text" needs a "field".');
    if (typeof value.query !== 'string') err(`${path}.query`, '"text" needs a "query" string.');
  }
}

/**
 * Validate a {@link DashboardSpec}: view-id uniqueness, grid placement, each
 * view's nested spec (recursively, inheriting the dashboard's data so a view
 * doesn't error on "missing data"), the cross-interaction surface, and explicit
 * link references. Messages are path-pointed (e.g. `views[2].spec.encoding.x`).
 */
export function validateDashboard(spec: Record<string, unknown>): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];
  const err = (path: string, message: string, extra?: Partial<ValidationError>) =>
    errors.push({ path, message, ...extra });
  const warn = (path: string, message: string, extra?: Partial<ValidationError>) =>
    warnings.push({ path, message, ...extra });

  if (spec.data !== undefined && !Array.isArray(spec.data)) {
    err('data', '"data" must be an array of records.');
  }

  const ids = new Set<string>();
  const views = spec.views;

  if (!Array.isArray(views) || views.length === 0) {
    err('views', '"dashboard" requires a non-empty "views" array.');
  } else {
    views.forEach((v, i) => {
      if (!isObject(v)) {
        err(`views[${i}]`, 'Each view must be an object { id, spec }.');
        return;
      }
      if (typeof v.id !== 'string' || v.id === '') {
        err(`views[${i}].id`, 'A view needs a non-empty "id".');
      } else if (ids.has(v.id)) {
        err(`views[${i}].id`, `Duplicate view id "${v.id}".`);
      } else {
        ids.add(v.id);
      }
      for (const k of ['x', 'y', 'w', 'h'] as const) {
        const n = v[k];
        if (n !== undefined && (typeof n !== 'number' || !Number.isFinite(n) || n < 1)) {
          err(`views[${i}].${k}`, `"${k}" must be a positive number.`);
        }
      }
      for (const k of ['title', 'subtitle', 'background', 'accent'] as const) {
        if (v[k] !== undefined && typeof v[k] !== 'string') {
          err(`views[${i}].${k}`, `"${k}" must be a string.`);
        }
      }
      if (v.frame !== undefined && typeof v.frame !== 'boolean') {
        err(`views[${i}].frame`, '"frame" must be a boolean.');
      }
      if (v.padding !== undefined && v.padding !== 'none' && v.padding !== 'standard') {
        err(`views[${i}].padding`, 'Expected "none" or "standard".');
      }
      if (v.responsive !== undefined) {
        if (!Array.isArray(v.responsive)) {
          err(`views[${i}].responsive`, '"responsive" must be an array of { maxWidth, w?, h?, hidden? }.');
        } else {
          v.responsive.forEach((rule, j) => {
            if (!isObject(rule)) {
              err(`views[${i}].responsive[${j}]`, 'Each responsive rule must be an object { maxWidth, w?, h?, hidden? }.');
              return;
            }
            const maxWidth = rule.maxWidth;
            if (typeof maxWidth !== 'number' || !Number.isFinite(maxWidth) || maxWidth < 1) {
              err(`views[${i}].responsive[${j}].maxWidth`, '"maxWidth" must be a positive number.');
            }
            for (const k of ['w', 'h'] as const) {
              const n = rule[k];
              if (n !== undefined && (typeof n !== 'number' || !Number.isFinite(n) || n < 1)) {
                err(`views[${i}].responsive[${j}].${k}`, `"${k}" must be a positive number.`);
              }
            }
            if (rule.hidden !== undefined && typeof rule.hidden !== 'boolean') {
              err(`views[${i}].responsive[${j}].hidden`, '"hidden" must be a boolean.');
            }
          });
        }
      }
      if (!isObject(v.spec)) {
        err(`views[${i}].spec`, 'A view needs a "spec" (a chart or slicer).');
        return;
      }
      const childSpec =
        v.spec.data === undefined && Array.isArray(spec.data)
          ? { ...v.spec, data: spec.data }
          : v.spec;
      const res = validateSpec(childSpec);
      const prefix = (p: string) => (p ? `views[${i}].spec.${p}` : `views[${i}].spec`);
      for (const e of res.errors) err(prefix(e.path), e.message);
      for (const w of res.warnings) warn(prefix(w.path), w.message);
    });
  }

  // Dashboard-level params / highlight / filter (shape only).
  validateInteraction(spec, err, warn);

  const interactions = spec.interactions;
  if (interactions !== undefined && interactions !== 'auto' && interactions !== 'none') {
    if (!Array.isArray(interactions)) {
      err('interactions', '"interactions" must be "auto", "none", or an array of links.');
    } else {
      interactions.forEach((link, i) => {
        if (!isObject(link)) {
          err(`interactions[${i}]`, 'Each link must be an object { source, target }.');
          return;
        }
        if (typeof link.source !== 'string' || !ids.has(link.source)) {
          err(`interactions[${i}].source`, 'Link "source" must reference a view id.');
        }
        if (link.target === undefined) {
          err(`interactions[${i}].target`, 'Link needs a "target" (a view id, an array, or "*").');
        } else if (link.target !== '*') {
          const targets = Array.isArray(link.target) ? link.target : [link.target];
          targets.forEach((t, j) => {
            if (typeof t !== 'string' || !ids.has(t)) {
              const suffix = Array.isArray(link.target) ? `[${j}]` : '';
              err(`interactions[${i}].target${suffix}`, 'Link "target" must reference a view id.');
            }
          });
        }
        if (link.as !== undefined && !['highlight', 'filter', 'none'].includes(link.as as string)) {
          err(`interactions[${i}].as`, 'Expected "highlight", "filter", or "none".');
        }
      });
    }
  }

  if (spec.subtitle !== undefined && typeof spec.subtitle !== 'string') {
    err('subtitle', '"subtitle" must be a string.');
  }

  const layout = spec.layout;
  if (layout !== undefined) {
    if (!isObject(layout)) {
      err('layout', '"layout" must be an object { cols?, rowHeight?, gap?, breakpoints?, navigators?, sections? }.');
    } else {
      for (const k of ['cols', 'rowHeight', 'gap', 'maxWidth', 'padding'] as const) {
        const n = layout[k];
        if (n !== undefined && (typeof n !== 'number' || !Number.isFinite(n) || n < 0)) {
          err(`layout.${k}`, `"${k}" must be a non-negative number.`);
        }
      }
      if (layout.navigators !== undefined && layout.navigators !== 'top' && layout.navigators !== 'inline') {
        err('layout.navigators', 'Expected "top" or "inline".');
      }
      if (layout.preset !== undefined && !['auto', 'kpi-first', 'sidebar'].includes(layout.preset as string)) {
        err('layout.preset', 'Expected "auto", "kpi-first", or "sidebar".');
      }
      if (layout.density !== undefined && !['compact', 'standard', 'comfortable'].includes(layout.density as string)) {
        err('layout.density', 'Expected "compact", "standard", or "comfortable".');
      }
      if (layout.breakpoints !== undefined) {
        if (!Array.isArray(layout.breakpoints)) {
          err('layout.breakpoints', '"breakpoints" must be an array of { maxWidth, cols }.');
        } else {
          layout.breakpoints.forEach((bp, i) => {
            if (!isObject(bp)) {
              err(`layout.breakpoints[${i}]`, 'Each breakpoint must be an object { maxWidth, cols }.');
              return;
            }
            for (const k of ['maxWidth', 'cols'] as const) {
              const n = bp[k];
              if (typeof n !== 'number' || !Number.isFinite(n) || n < 1) {
                err(`layout.breakpoints[${i}].${k}`, `"${k}" must be a positive number.`);
              }
            }
          });
        }
      }
      if (layout.sections !== undefined) {
        if (!Array.isArray(layout.sections)) {
          err('layout.sections', '"sections" must be an array of dashboard sections.');
        } else {
          const sectionViewIds = new Set<string>();
          layout.sections.forEach((section, i) => {
            if (!isObject(section)) {
              err(`layout.sections[${i}]`, 'Each section must be an object { views }.');
              return;
            }
            for (const k of ['id', 'title', 'subtitle', 'background'] as const) {
              if (section[k] !== undefined && typeof section[k] !== 'string') {
                err(`layout.sections[${i}].${k}`, `"${k}" must be a string.`);
              }
            }
            for (const k of ['cols', 'rowHeight'] as const) {
              const n = section[k];
              if (n !== undefined && (typeof n !== 'number' || !Number.isFinite(n) || n < 1)) {
                err(`layout.sections[${i}].${k}`, `"${k}" must be a positive number.`);
              }
            }
            if (section.collapsed !== undefined && typeof section.collapsed !== 'boolean') {
              err(`layout.sections[${i}].collapsed`, '"collapsed" must be a boolean.');
            }
            if (!Array.isArray(section.views)) {
              err(`layout.sections[${i}].views`, '"views" must be an array of view ids.');
            } else {
              section.views.forEach((id, j) => {
                const path = `layout.sections[${i}].views[${j}]`;
                if (typeof id !== 'string' || id === '') {
                  err(path, 'Section view references must be non-empty strings.');
                } else if (!ids.has(id)) {
                  err(path, `Section view "${id}" must reference an existing view id.`);
                } else if (sectionViewIds.has(id)) {
                  err(path, `View "${id}" is already assigned to another section.`);
                } else {
                  sectionViewIds.add(id);
                }
              });
            }
          });
        }
      }
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

export function assertValidSpec(spec: unknown): ChartSpec {
  const { valid, errors } = validateSpec(spec);
  if (!valid) {
    const detail = errors.map((e) => `  - ${e.path || '(root)'}: ${e.message}`).join('\n');
    throw new Error(`Invalid Graphein chart spec:\n${detail}`);
  }
  return spec as ChartSpec;
}