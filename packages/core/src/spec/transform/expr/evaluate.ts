/**
 * Evaluator for the `calculate` AST. Pure and sandboxed: the only callable names
 * are the {@link FUNCTIONS} whitelist, member access is guarded against prototype
 * keys, and there is no access to `eval`, `Function`, globals, or row mutation.
 * All functions are deterministic (no `now()`/`random()`), per the transform
 * determinism convention.
 */

import type { Datum } from '../../../types';
import { toDate, toNumber } from '../../../util/data';
import { ExpressionError } from './error';
import type { Node } from './parse';

const BLOCKED_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function truthy(v: unknown): boolean {
  if (typeof v === 'number') return v !== 0 && !Number.isNaN(v);
  return Boolean(v);
}

function toStr(v: unknown): string {
  if (v == null) return '';
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

/** Loose equality: numeric when both coerce to finite numbers, else string. */
function looseEquals(a: unknown, b: unknown): boolean {
  if (a == null || b == null) return a == null && b == null;
  const na = toNumber(a);
  const nb = toNumber(b);
  if (Number.isFinite(na) && Number.isFinite(nb)) return na === nb;
  return toStr(a) === toStr(b);
}

function compare(a: unknown, b: unknown): number {
  const na = toNumber(a);
  const nb = toNumber(b);
  if (Number.isFinite(na) && Number.isFinite(nb)) return na < nb ? -1 : na > nb ? 1 : 0;
  const sa = toStr(a);
  const sb = toStr(b);
  return sa < sb ? -1 : sa > sb ? 1 : 0;
}

type Fn = (args: unknown[]) => unknown;

const nums = (args: unknown[]): number[] => args.map(toNumber);

/** The complete set of callable names. Everything else is a reference error. */
const FUNCTIONS: Record<string, Fn> = {
  abs: (a) => Math.abs(toNumber(a[0])),
  round: (a) => {
    const d = a.length > 1 ? Math.trunc(toNumber(a[1])) : 0;
    const f = 10 ** d;
    return Math.round(toNumber(a[0]) * f) / f;
  },
  floor: (a) => Math.floor(toNumber(a[0])),
  ceil: (a) => Math.ceil(toNumber(a[0])),
  trunc: (a) => Math.trunc(toNumber(a[0])),
  sign: (a) => Math.sign(toNumber(a[0])),
  sqrt: (a) => Math.sqrt(toNumber(a[0])),
  exp: (a) => Math.exp(toNumber(a[0])),
  log: (a) => Math.log(toNumber(a[0])),
  log10: (a) => Math.log10(toNumber(a[0])),
  log2: (a) => Math.log2(toNumber(a[0])),
  pow: (a) => toNumber(a[0]) ** toNumber(a[1]),
  min: (a) => Math.min(...nums(a)),
  max: (a) => Math.max(...nums(a)),
  number: (a) => toNumber(a[0]),
  isFinite: (a) => Number.isFinite(toNumber(a[0])),
  isNaN: (a) => Number.isNaN(toNumber(a[0])),
  str: (a) => toStr(a[0]),
  lower: (a) => toStr(a[0]).toLowerCase(),
  upper: (a) => toStr(a[0]).toUpperCase(),
  trim: (a) => toStr(a[0]).trim(),
  length: (a) => (Array.isArray(a[0]) ? a[0].length : toStr(a[0]).length),
  substring: (a) => {
    const s = toStr(a[0]);
    const start = Math.trunc(toNumber(a[1]));
    return a.length > 2 ? s.substring(start, Math.trunc(toNumber(a[2]))) : s.substring(start);
  },
  replace: (a) => toStr(a[0]).split(toStr(a[1])).join(toStr(a[2])),
  contains: (a) => toStr(a[0]).includes(toStr(a[1])),
  startsWith: (a) => toStr(a[0]).startsWith(toStr(a[1])),
  endsWith: (a) => toStr(a[0]).endsWith(toStr(a[1])),
  concat: (a) => a.map(toStr).join(''),
  coalesce: (a) => a.find((v) => v != null),
  if: (a) => (truthy(a[0]) ? a[1] : a[2]),
  year: (a) => toDate(a[0])?.getFullYear() ?? NaN,
  month: (a) => {
    const d = toDate(a[0]);
    return d ? d.getMonth() + 1 : NaN;
  },
  day: (a) => toDate(a[0])?.getDate() ?? NaN,
  hours: (a) => toDate(a[0])?.getHours() ?? NaN,
  minutes: (a) => toDate(a[0])?.getMinutes() ?? NaN,
};

/** Names the parser may treat as callable — exposed for validation. */
export const FUNCTION_NAMES: readonly string[] = Object.keys(FUNCTIONS);

function evalNode(node: Node, row: Datum): unknown {
  switch (node.type) {
    case 'num':
    case 'str':
    case 'lit':
      return node.value;
    case 'datum':
      return row;
    case 'field':
      return row[node.name];
    case 'unary': {
      const v = evalNode(node.arg, row);
      if (node.op === '!') return !truthy(v);
      if (node.op === '-') return -toNumber(v);
      return toNumber(v); // '+'
    }
    case 'logical': {
      const left = evalNode(node.left, row);
      if (node.op === '&&') return truthy(left) ? evalNode(node.right, row) : left;
      return truthy(left) ? left : evalNode(node.right, row);
    }
    case 'ternary':
      return truthy(evalNode(node.test, row)) ? evalNode(node.then, row) : evalNode(node.alt, row);
    case 'binary':
      return evalBinary(node.op, evalNode(node.left, row), evalNode(node.right, row));
    case 'member': {
      const obj = evalNode(node.obj, row);
      if (obj == null || typeof obj !== 'object') return undefined;
      const key = node.computed ? toStr(evalNode(node.prop, row)) : (node.prop as { value: string }).value;
      if (BLOCKED_KEYS.has(key)) return undefined;
      return (obj as Record<string, unknown>)[key];
    }
    case 'call': {
      const fn = Object.prototype.hasOwnProperty.call(FUNCTIONS, node.callee) ? FUNCTIONS[node.callee] : undefined;
      if (!fn) throw new ExpressionError(`Unknown function "${node.callee}".`);
      return fn(node.args.map((a) => evalNode(a, row)));
    }
  }
}

function evalBinary(op: string, a: unknown, b: unknown): unknown {
  switch (op) {
    case '+':
      return typeof a === 'string' || typeof b === 'string' ? toStr(a) + toStr(b) : toNumber(a) + toNumber(b);
    case '-':
      return toNumber(a) - toNumber(b);
    case '*':
      return toNumber(a) * toNumber(b);
    case '/':
      return toNumber(a) / toNumber(b);
    case '%':
      return toNumber(a) % toNumber(b);
    case '<':
      return compare(a, b) < 0;
    case '<=':
      return compare(a, b) <= 0;
    case '>':
      return compare(a, b) > 0;
    case '>=':
      return compare(a, b) >= 0;
    case '==':
      return looseEquals(a, b);
    case '!=':
      return !looseEquals(a, b);
    case '===':
      return a === b;
    case '!==':
      return a !== b;
    default:
      throw new ExpressionError(`Unknown operator "${op}".`);
  }
}

/** Evaluate a parsed expression against a single row. */
export function evaluate(node: Node, row: Datum): unknown {
  return evalNode(node, row);
}
