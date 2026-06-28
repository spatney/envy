import { describe, it, expect } from 'vitest';
import { applyCalculate } from './calculate';
import { applyTransforms } from './apply';
import { compileExpression, checkExpression, parse, FUNCTION_NAMES } from './expr';
import { ExpressionError } from './expr/error';
import { evaluate } from './expr/evaluate';
import type { CalculateTransform } from './types';

const ev = (src: string, row: Record<string, unknown> = {}) => evaluate(parse(src), row);

describe('calculate · expression operators', () => {
  it('honors arithmetic precedence and grouping', () => {
    expect(ev('1 + 2 * 3')).toBe(7);
    expect(ev('(1 + 2) * 3')).toBe(9);
    expect(ev('10 - 2 - 3')).toBe(5); // left-assoc
    expect(() => ev('2 ** 0')).toThrow(); // ** is not an operator (use pow())
  });

  it('does numeric arithmetic, division and modulo', () => {
    expect(ev('7 / 2')).toBe(3.5);
    expect(ev('7 % 3')).toBe(1);
    expect(ev('-5 + 3')).toBe(-2);
  });

  it('coerces numeric strings in arithmetic but concatenates with +', () => {
    expect(ev("'2' * '3'")).toBe(6);
    expect(ev("'a' + 'b'")).toBe('ab');
    expect(ev("'n=' + 5")).toBe('n=5');
    expect(ev('1 + 2 + "x"')).toBe('3x');
  });

  it('evaluates comparisons numerically then lexically', () => {
    expect(ev('3 > 2')).toBe(true);
    expect(ev('2 >= 2')).toBe(true);
    expect(ev("'apple' < 'banana'")).toBe(true);
    expect(ev("'10' > '9'")).toBe(true); // numeric, not lexical
  });

  it('distinguishes loose and strict equality', () => {
    expect(ev("'1' == 1")).toBe(true);
    expect(ev("'1' === 1")).toBe(false);
    expect(ev('1 != 2')).toBe(true);
    expect(ev("'1' !== 1")).toBe(true);
  });

  it('short-circuits logical operators and returns operand values', () => {
    expect(ev('true && false')).toBe(false);
    expect(ev('false || 7')).toBe(7);
    expect(ev('0 || "fallback"')).toBe('fallback');
    expect(ev('!0')).toBe(true);
    expect(ev('!""')).toBe(true);
  });

  it('evaluates ternary expressions', () => {
    expect(ev("5 > 0 ? 'pos' : 'neg'")).toBe('pos');
    expect(ev("x > 0 ? 'pos' : 'neg'", { x: -3 })).toBe('neg');
  });
});

describe('calculate · field references', () => {
  it('resolves bare identifiers to row columns', () => {
    expect(ev('price * qty', { price: 4, qty: 3 })).toBe(12);
  });

  it('resolves datum and bracket access for awkward field names', () => {
    expect(ev("datum['my field'] + 1", { 'my field': 41 })).toBe(42);
    expect(ev('datum.amount', { amount: 9 })).toBe(9);
  });

  it('returns undefined for a missing field', () => {
    expect(ev('nope', {})).toBeUndefined();
  });
});

describe('calculate · function whitelist', () => {
  it('exposes the expected functions', () => {
    expect(FUNCTION_NAMES).toContain('round');
    expect(FUNCTION_NAMES).toContain('coalesce');
    expect(FUNCTION_NAMES).not.toContain('now');
    expect(FUNCTION_NAMES).not.toContain('random');
  });

  it('math functions', () => {
    expect(ev('abs(-4)')).toBe(4);
    expect(ev('round(3.14159, 2)')).toBe(3.14);
    expect(ev('round(2.5)')).toBe(3);
    expect(ev('min(3, 1, 2)')).toBe(1);
    expect(ev('max(3, 1, 2)')).toBe(3);
    expect(ev('pow(2, 10)')).toBe(1024);
    expect(ev('floor(2.9)')).toBe(2);
    expect(ev('ceil(2.1)')).toBe(3);
  });

  it('string functions', () => {
    expect(ev("lower('HELLO')")).toBe('hello');
    expect(ev("upper('hi')")).toBe('HI');
    expect(ev("length('abc')")).toBe(3);
    expect(ev("substring('hello', 1, 3)")).toBe('el');
    expect(ev("replace('a-b-c', '-', '_')")).toBe('a_b_c');
    expect(ev("contains('hello', 'ell')")).toBe(true);
    expect(ev("concat('a', 1, 'b')")).toBe('a1b');
  });

  it('logic / null-handling functions', () => {
    expect(ev("if(true, 'y', 'n')")).toBe('y');
    expect(ev('coalesce(missing, fallback, 3)', { fallback: null })).toBe(3);
    expect(ev('coalesce(a, b)', { a: 0, b: 9 })).toBe(0); // 0 is non-null
  });

  it('date extraction functions are deterministic', () => {
    expect(ev("year('2024-03-15')")).toBe(2024);
    expect(ev("month('2024-03-15')")).toBe(3);
    expect(ev("day('2024-03-15')")).toBe(15);
  });
});

describe('calculate · safety', () => {
  it('never reaches prototype/constructor keys', () => {
    expect(ev("datum['__proto__']", {})).toBeUndefined();
    expect(ev('datum.constructor', {})).toBeUndefined();
    expect(ev("datum['prototype']", {})).toBeUndefined();
  });

  it('rejects unknown function names', () => {
    expect(() => ev('alert(1)')).toThrow(ExpressionError);
    expect(() => ev('eval("1")')).toThrow(ExpressionError);
  });

  it('reports syntax errors with an offset', () => {
    const a = checkExpression('1 +');
    expect(a).not.toBeNull();
    expect(checkExpression('1 + 2')).toBeNull();
    expect(() => parse("'unterminated")).toThrow(ExpressionError);
    expect(() => parse('1 @ 2')).toThrow(ExpressionError);
    expect(() => parse('')).toThrow(ExpressionError);
  });

  it('member access on non-objects yields undefined, not a throw', () => {
    expect(ev("(5).foo")).toBeUndefined();
    expect(ev("'s'['length']")).toBeUndefined(); // strings are not indexed as objects
  });
});

describe('calculate · transform', () => {
  it('adds a derived column without mutating input rows', () => {
    const rows = [{ price: 4, qty: 3 }];
    const t: CalculateTransform = { calculate: 'price * qty', as: 'total' };
    const out = applyCalculate(t, rows);
    expect(out).toEqual([{ price: 4, qty: 3, total: 12 }]);
    expect(rows[0]).not.toHaveProperty('total'); // pure
  });

  it('compiles once and reuses across rows', () => {
    const f = compileExpression('a + b');
    expect(f({ a: 1, b: 2 })).toBe(3);
    expect(f({ a: 10, b: 20 })).toBe(30);
  });

  it('composes in a pipeline: calculate → filter → aggregate', () => {
    const data = [
      { unit: 'A', price: 10, qty: 2 },
      { unit: 'A', price: 5, qty: 0 },
      { unit: 'B', price: 7, qty: 3 },
    ];
    const out = applyTransforms(
      [
        { calculate: 'price * qty', as: 'rev' },
        { filter: { field: 'rev', gt: 0 } },
        { aggregate: [{ op: 'sum', field: 'rev', as: 'rev' }], groupby: ['unit'] },
      ],
      data,
    );
    expect(out).toEqual([
      { unit: 'A', rev: 20 },
      { unit: 'B', rev: 21 },
    ]);
  });
});
