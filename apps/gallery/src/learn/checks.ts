import type { AnySpec, CheckFn, CheckResult } from './types';

type Rec = Record<string, unknown>;

function rec(spec: AnySpec): Rec {
  return (spec ?? {}) as unknown as Rec;
}

function encoding(spec: AnySpec): Rec {
  const e = rec(spec).encoding;
  return (e && typeof e === 'object' ? e : {}) as Rec;
}

function channel(spec: AnySpec, name: string): Rec | undefined {
  const c = encoding(spec)[name];
  return c && typeof c === 'object' ? (c as Rec) : undefined;
}

/** Build a single predicate check with a failure hint. */
export function rule(predicate: (spec: AnySpec) => boolean, hint: string): CheckFn {
  return (spec) => (predicate(spec) ? { pass: true, hints: [] } : { pass: false, hints: [hint] });
}

/** Run several checks; pass only if all pass, collecting every failing hint. */
export function all(...checks: CheckFn[]): CheckFn {
  return (spec) => {
    const hints: string[] = [];
    for (const c of checks) {
      const r = c(spec);
      if (!r.pass) hints.push(...r.hints);
    }
    return { pass: hints.length === 0, hints };
  };
}

/** The spec's `type` must equal one of `types`. */
export function isType(...types: string[]): CheckFn {
  return rule(
    (s) => types.includes(String(rec(s).type)),
    `Set "type" to ${types.map((t) => `"${t}"`).join(' or ')}.`,
  );
}

/** An encoding channel must be present (optionally bound to a specific field). */
export function hasChannel(name: string, field?: string): CheckFn {
  return rule((s) => {
    const ch = channel(s, name);
    if (!ch) return false;
    return field ? ch.field === field : Boolean(ch.field);
  }, field ? `Map the "${name}" channel to the "${field}" field.` : `Add an encoding for the "${name}" channel.`);
}

/** A `series` channel must split the data into groups. */
export function hasSeries(field?: string): CheckFn {
  return rule((s) => {
    const ch = channel(s, 'series');
    if (!ch) return false;
    return field ? ch.field === field : Boolean(ch.field);
  }, field ? `Add a "series" channel mapped to "${field}" to split the groups.` : `Add a "series" channel to split the data into groups.`);
}

/** A field def on `channel` must declare `type: 'temporal'`. */
export function channelType(name: string, t: string): CheckFn {
  return rule((s) => channel(s, name)?.type === t, `Set the "${name}" channel's "type" to "${t}".`);
}

/** A top-level boolean-ish flag must be truthy (e.g. stack, area, trendline). */
export function flagOn(key: string): CheckFn {
  return rule((s) => Boolean(rec(s)[key]), `Set "${key}" to enable it.`);
}

/** The spec must include a transform step using `op` (e.g. aggregate, filter, bin). */
export function hasTransform(op: string): CheckFn {
  return rule((s) => {
    const t = rec(s).transform;
    if (!Array.isArray(t)) return false;
    return t.some((step) => step && typeof step === 'object' && op in (step as Rec));
  }, `Add a transform step with an "${op}" operator.`);
}

/** A nested key (dot path) must be present and truthy. */
export function pathTruthy(path: string, hint: string): CheckFn {
  return rule((s) => {
    let cur: unknown = s;
    for (const key of path.split('.')) {
      if (!cur || typeof cur !== 'object') return false;
      cur = (cur as Rec)[key];
    }
    return Boolean(cur);
  }, hint);
}

/** A formatting string on a channel must match (e.g. y.format includes "$"). */
export function channelFormatIncludes(name: string, token: string): CheckFn {
  return rule(
    (s) => String(channel(s, name)?.format ?? '').includes(token),
    `Give the "${name}" channel a "format" containing "${token}".`,
  );
}

export const PASS: CheckResult = { pass: true, hints: [] };
