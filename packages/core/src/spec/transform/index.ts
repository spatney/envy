/**
 * Declarative transforms — public surface.
 *
 * `applyTransforms(spec.transform, data)` reshapes rows before charting. The
 * per-op helpers and `compilePredicate` / `computeBins` are exported for reuse
 * (e.g. the histogram chart shares `computeBins`).
 */

export * from './types';
export { applyTransform, applyTransforms } from './apply';
export { applyFilter, compilePredicate } from './filter';
export { applyAggregate } from './aggregate';
export { applyBin, computeBins, type BinLayout } from './bin';
export { applyFold } from './fold';
export { applyTimeUnit, truncateTo } from './timeUnit';
export { applyCalculate } from './calculate';
export { compileExpression, checkExpression, FUNCTION_NAMES, ExpressionError } from './expr';
