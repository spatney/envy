/**
 * Tiny dependency-free closest-match helper powering "did you mean" suggestions
 * and safe auto-repairs. Used by `validateSpec` (to annotate unknown
 * types/enums/fields) and `repairSpec` (to pick an unambiguous correction).
 */

/** Classic Levenshtein edit distance (insert/delete/substitute = 1). */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  // Two-row DP; O(min(m,n)) memory.
  let prev = new Array<number>(n + 1);
  let curr = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    const ca = a.charCodeAt(i - 1);
    for (let j = 1; j <= n; j++) {
      const cost = ca === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

/** Default tolerance: scales with input length, but always allows small typos. */
function tolerance(input: string): number {
  return Math.max(2, Math.ceil(input.length * 0.5));
}

interface Ranked {
  value: string;
  distance: number;
}

function rank(input: string, candidates: readonly string[]): Ranked[] {
  const lower = input.toLowerCase();
  return candidates
    .map((value) => {
      const lc = value.toLowerCase();
      // Case-insensitive exact / prefix matches rank first.
      const distance = lc === lower ? 0 : levenshtein(lower, lc);
      return { value, distance };
    })
    .sort((a, b) => a.distance - b.distance || a.value.localeCompare(b.value));
}

/**
 * Up to `limit` plausible corrections for `input`, nearest first, filtered to a
 * length-relative edit-distance tolerance. Generous — good for "did you mean".
 */
export function suggestions(
  input: string,
  candidates: readonly string[],
  limit = 3,
  maxDistance = tolerance(input),
): string[] {
  if (!input) return [];
  return rank(input, candidates)
    .filter((r) => r.distance <= maxDistance)
    .slice(0, limit)
    .map((r) => r.value);
}

/**
 * The single best correction for `input`, but only when it is **unambiguous and
 * close** — a strict distance bound and a clear margin over the runner-up — so it
 * is safe to apply automatically. Returns `undefined` when no safe pick exists.
 */
export function closest(input: string, candidates: readonly string[]): string | undefined {
  if (!input) return undefined;
  const ranked = rank(input, candidates);
  if (ranked.length === 0) return undefined;
  const best = ranked[0];
  // Conservative bound for auto-fix (tighter than `suggestions`).
  const bound = Math.max(2, Math.floor(input.length * 0.34));
  if (best.distance > bound) return undefined;
  const runnerUp = ranked[1];
  // Require a clear winner so we never "fix" toward an equally likely option.
  if (runnerUp && runnerUp.distance === best.distance) return undefined;
  return best.value;
}
