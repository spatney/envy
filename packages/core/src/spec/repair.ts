/**
 * Self-repairing validation. {@link repairSpec} applies the safe, unambiguous
 * JSON Patch fixes that {@link validateSpec} attaches to its findings, then
 * re-validates — turning common agent mistakes (a misspelled chart type or enum,
 * a temporal field typed as a category) into a one-step correction instead of a
 * full regenerate. Only fixes the validator deems unambiguous are applied; when
 * the right correction is unclear, the error is left for the agent to resolve.
 */

import type { ValidationError } from './validate';
import { validateSpec } from './validate';
import { applyPatch, type JsonPatchOp } from './jsonpatch';

export interface RepairResult {
  /** The (possibly) corrected spec — a new object; the input is never mutated. */
  spec: unknown;
  /** Patch operations that were applied, in order. Empty when nothing changed. */
  applied: JsonPatchOp[];
  /**
   * Structural errors that remain after repair. `remaining.length === 0` means
   * the repaired spec is valid. Advisory lint warnings are not counted here.
   */
  remaining: ValidationError[];
}

const MAX_PASSES = 8;

/**
 * Apply every safe auto-fix `validateSpec` proposes, iterating until the spec is
 * valid or no further progress can be made (a fix may unlock another — e.g.
 * correcting the chart `type` changes which channels are required). Pure: the
 * input spec is deep-cloned before any patch is applied.
 */
export function repairSpec(spec: unknown): RepairResult {
  let current: unknown = spec;
  const applied: JsonPatchOp[] = [];
  let prevSignature = '';

  for (let pass = 0; pass < MAX_PASSES; pass++) {
    const { errors, warnings } = validateSpec(current);
    const fixes: JsonPatchOp[] = [];
    for (const finding of [...errors, ...warnings]) {
      if (finding.fix && finding.fix.length > 0) fixes.push(...finding.fix);
    }
    if (fixes.length === 0) break;

    // Guard against a non-converging fix set repeating forever.
    const signature = JSON.stringify(fixes);
    if (signature === prevSignature) break;
    prevSignature = signature;

    current = applyPatch(current, fixes);
    applied.push(...fixes);
  }

  return { spec: current, applied, remaining: validateSpec(current).errors };
}
