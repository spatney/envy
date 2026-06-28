/**
 * Safe `calculate` expression engine — public surface.
 *
 * `compileExpression(src)` parses once and returns a pure `(row) => value`
 * function used by the calculate transform. No `eval`/`Function` is ever used;
 * see {@link evaluate} for the sandbox guarantees.
 */

import type { Datum } from '../../../types';
import { ExpressionError } from './error';
import { parse } from './parse';
import { evaluate } from './evaluate';

export { ExpressionError } from './error';
export { parse, type Node } from './parse';
export { evaluate, FUNCTION_NAMES } from './evaluate';

/** Parse `src` once; returns a reusable, pure evaluator over a row. */
export function compileExpression(src: string): (row: Datum) => unknown {
  const ast = parse(src);
  return (row: Datum) => evaluate(ast, row);
}

/**
 * Validate an expression's syntax without evaluating it. Returns an error message
 * (and source offset) when the expression cannot be parsed, else `null`.
 */
export function checkExpression(src: string): { message: string; pos: number | undefined } | null {
  try {
    parse(src);
    return null;
  } catch (e) {
    if (e instanceof ExpressionError) return { message: e.message, pos: e.pos };
    throw e;
  }
}
