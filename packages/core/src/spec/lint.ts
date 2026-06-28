/**
 * Dataviz linter — best-practice rules that encode the visualization expertise an
 * agent may lack. Each rule is pure and returns findings with a stable `rule` id
 * and a `severity` ('warning' | 'info'), so an agent can recognize, suppress, or
 * learn from a specific issue. Findings are surfaced through `validateSpec`'s
 * `warnings`, and directly via {@link lintSpec}.
 *
 * Rules lint the *effective* data (after `transform`), so cardinality reflects
 * what actually renders (e.g. pie slices after an `aggregate`). The linter never
 * throws and never blocks rendering — it is advisory only.
 */

import type { Datum, FieldType } from '../types';
import type { ChartSpec, ComboSpec, Encoding, FieldDef, ScaleType } from './types';
import { accessor, inferType, toNumber, uniqueValues } from '../util/data';
import { applyTransforms } from './transform';
import type { ValidationError } from './validate';

/** A lint finding always carries a `rule` id and a non-error `severity`. */
export interface LintFinding extends ValidationError {
  rule: string;
  severity: 'warning' | 'info';
}

/** Thresholds, named so they are easy to tune and reference in messages. */
const MAX_PIE_SLICES = 7;
const MAX_SERIES = 12;
const MAX_DISCRETE_AXIS = 50;

/** Channels that map to a positional/categorical axis on cartesian charts. */
const POSITIONAL_AXES: (keyof Encoding)[] = ['x', 'y'];

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Read a channel as a {@link FieldDef} when it has a string `field`. */
function fieldDef(encoding: Encoding | undefined, channel: keyof Encoding): FieldDef | undefined {
  const def = encoding?.[channel];
  if (isObject(def) && typeof def.field === 'string' && def.field !== '') return def as FieldDef;
  return undefined;
}

/** Apply transforms defensively so a malformed pipeline never breaks linting. */
function effectiveData(spec: ChartSpec): Datum[] {
  const data = Array.isArray(spec.data) ? (spec.data as Datum[]) : [];
  if (!('transform' in spec) || !Array.isArray(spec.transform) || spec.transform.length === 0) return data;
  try {
    return applyTransforms(spec.transform, data);
  } catch {
    return data;
  }
}

/**
 * Lint a (structurally valid) chart spec for best-practice issues. Returns an
 * empty array for slicers/dashboards or when no rule fires. Pure and total.
 */
export function lintSpec(spec: ChartSpec): LintFinding[] {
  const findings: LintFinding[] = [];
  const add = (rule: string, path: string, message: string, severity: 'warning' | 'info' = 'warning') =>
    findings.push({ rule, path, message, severity });

  const encoding = (isObject(spec) ? (spec as { encoding?: unknown }).encoding : undefined) as
    | Encoding
    | undefined;
  const data = effectiveData(spec);
  if (data.length === 0) return findings; // nothing to measure against

  // --- Rule: temporal field typed as a category ---------------------------
  // A field that looks like dates but is declared nominal/ordinal will render on
  // a categorical axis (no time spacing), a very common agent mistake.
  if (encoding) {
    for (const channel of ['x', 'y', 'color', 'series'] as (keyof Encoding)[]) {
      const def = fieldDef(encoding, channel);
      if (!def) continue;
      const declared = def.type as FieldType | undefined;
      if ((declared === 'nominal' || declared === 'ordinal') && inferType(data, def.field) === 'temporal') {
        findings.push({
          rule: 'temporal-typed-as-categorical',
          path: `encoding.${channel}.type`,
          message: `Field "${def.field}" looks temporal but is typed "${declared}". Set type:"temporal" so it scales as time.`,
          severity: 'warning',
          fix: [{ op: 'replace', path: `/encoding/${channel}/type`, value: 'temporal' }],
        });
      }
    }
  }

  // --- Rule: pie / donut with too many slices -----------------------------
  if (spec.type === 'pie') {
    const def = fieldDef(encoding, 'color') ?? fieldDef(encoding, 'theta');
    const slices = def ? uniqueValues(data, def.field).length : data.length;
    if (slices > MAX_PIE_SLICES) {
      add(
        'pie-too-many-slices',
        'encoding.color',
        `Pie has ${slices} slices (> ${MAX_PIE_SLICES}); proportions get hard to compare. Use a bar chart, or group small slices into "Other".`,
      );
    }
  }

  // --- Rule: too many series / legend colors ------------------------------
  for (const channel of ['series', 'color'] as (keyof Encoding)[]) {
    const def = fieldDef(encoding, channel);
    if (!def) continue;
    if (inferType(data, def.field) === 'quantitative' && channel === 'color') continue; // continuous color is fine
    const count = uniqueValues(data, def.field).length;
    if (count > MAX_SERIES) {
      add(
        'too-many-series',
        `encoding.${channel}`,
        `"${def.field}" has ${count} distinct values (> ${MAX_SERIES}); the legend/colors become hard to tell apart. Filter, group, or facet instead.`,
      );
      break; // one finding is enough
    }
  }

  // --- Rule: bar baseline not at zero -------------------------------------
  if (spec.type === 'bar') {
    const y = fieldDef(encoding, 'y');
    const scale = y?.scale;
    if (scale?.zero === false) {
      add(
        'bar-nonzero-baseline',
        'encoding.y.scale.zero',
        'Bar lengths encode magnitude, so a non-zero baseline exaggerates differences. Remove scale.zero:false (bars should start at 0).',
      );
    } else if (Array.isArray(scale?.domain) && typeof scale.domain[0] === 'number' && scale.domain[0] > 0) {
      add(
        'bar-nonzero-baseline',
        'encoding.y.scale.domain',
        `Bar y-domain starts at ${scale.domain[0]} (> 0); a truncated baseline exaggerates differences. Start the domain at 0.`,
      );
    }
  }

  // --- Rule: log scale with non-positive data -----------------------------
  if (encoding) {
    for (const channel of ['x', 'y'] as (keyof Encoding)[]) {
      const def = fieldDef(encoding, channel);
      if ((def?.scale?.type as ScaleType | undefined) !== 'log') continue;
      const read = accessor(def!.field);
      const hasNonPositive = data.some((d) => {
        const n = toNumber(read(d));
        return Number.isFinite(n) && n <= 0;
      });
      if (hasNonPositive) {
        add(
          'log-nonpositive-data',
          `encoding.${channel}.scale`,
          `"${def!.field}" has values ≤ 0, which a log scale cannot plot. Use a linear scale or filter non-positive values.`,
        );
      }
    }
  }

  // --- Rule: high-cardinality categorical axis ----------------------------
  if (spec.type === 'bar' || spec.type === 'line' || spec.type === 'area') {
    for (const channel of POSITIONAL_AXES) {
      const def = fieldDef(encoding, channel);
      if (!def) continue;
      const t = (def.type as FieldType | undefined) ?? inferType(data, def.field);
      const discrete = t === 'nominal' || t === 'ordinal' || def.scale?.type === 'band' || def.scale?.type === 'point';
      if (!discrete) continue;
      const count = uniqueValues(data, def.field).length;
      if (count > MAX_DISCRETE_AXIS) {
        add(
          'high-cardinality-axis',
          `encoding.${channel}`,
          `"${def.field}" has ${count} categories on the ${channel}-axis (> ${MAX_DISCRETE_AXIS}); labels will be unreadable. Aggregate, filter to a top-N, or use a different chart.`,
        );
      }
    }
  }

  // --- Rule: histogram on a non-numeric field ----------------------------
  // A histogram bins a quantitative measure; a nominal/temporal field can't be
  // binned meaningfully. Warn so the agent picks a numeric field (or a bar chart).
  if (spec.type === 'histogram') {
    const def = fieldDef(encoding, 'x');
    if (def) {
      const t = (def.type as FieldType | undefined) ?? inferType(data, def.field);
      if (t !== 'quantitative') {
        add(
          'histogram-nonnumeric-field',
          'encoding.x',
          `Histogram field "${def.field}" is ${t}, not quantitative — binning needs numbers. Use a numeric field, or a bar chart for categories.`,
        );
      }
    }
  }

  // --- Rule: dual-axis combo advisory -------------------------------------
  // A secondary y-axis can imply a correlation that isn't there; only use it for
  // genuinely different units. Advisory (info), fires only when both axes are used.
  if (spec.type === 'combo' && Array.isArray((spec as ComboSpec).layers)) {
    const layers = (spec as ComboSpec).layers;
    const hasRight = layers.some((l) => isObject(l) && l.axis === 'right');
    const hasLeft = layers.some((l) => isObject(l) && l.axis !== 'right');
    if (hasRight && hasLeft) {
      add(
        'combo-dual-axis',
        'layers',
        'Dual-axis combo: a secondary y-axis can suggest correlations that are not real. Use it only for genuinely different units/scales, and label both axes clearly.',
        'info',
      );
    }
  }

  return findings;
}
