/**
 * Minimal, apply-only JSON Patch (RFC 6902) used by `repairSpec` to apply the
 * safe `fix` operations that `validateSpec` attaches to errors. Pure: returns a
 * new document, never mutates the input. Preserves `Date` values (specs may hold
 * `Date` objects for temporal fields), unlike a JSON round-trip clone.
 */

export type JsonPatchOp =
  | { op: 'add'; path: string; value: unknown }
  | { op: 'replace'; path: string; value: unknown }
  | { op: 'remove'; path: string };

/** Structured deep clone that keeps Date instances and plain arrays/objects. */
function clone<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  if (value instanceof Date) return new Date(value.getTime()) as unknown as T;
  if (Array.isArray(value)) return value.map((v) => clone(v)) as unknown as T;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>)) {
    out[key] = clone((value as Record<string, unknown>)[key]);
  }
  return out as T;
}

/** Decode a single JSON Pointer reference token (~1 → /, ~0 → ~). */
function decode(token: string): string {
  return token.replace(/~1/g, '/').replace(/~0/g, '~');
}

/** Parse a JSON Pointer ("/a/b/0") into its decoded segments. */
function parsePointer(pointer: string): string[] {
  if (pointer === '') return [];
  if (pointer[0] !== '/') throw new Error(`Invalid JSON Pointer: ${pointer}`);
  return pointer.slice(1).split('/').map(decode);
}

/**
 * Convert a dotted/bracketed validation path (`encoding.x.type`,
 * `transform[0].calculate`, `values[2].op`) into a JSON Pointer
 * (`/encoding/x/type`, `/transform/0/calculate`, `/values/2/op`). Authoring
 * fixes from the same `path` an error already reports keeps the two in sync.
 */
export function toPointer(path: string): string {
  if (path === '') return '';
  const parts: string[] = [];
  for (const seg of path.replace(/\[(\d+)\]/g, '.$1').split('.')) {
    if (seg === '') continue;
    parts.push(seg.replace(/~/g, '~0').replace(/\//g, '~1'));
  }
  return '/' + parts.join('/');
}

function isObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date);
}

function applyOne(doc: unknown, op: JsonPatchOp): unknown {
  const segments = parsePointer(op.path);
  if (segments.length === 0) {
    // Whole-document replace/add; remove of root is a no-op we ignore.
    return op.op === 'remove' ? doc : (op as { value: unknown }).value;
  }

  // Navigate to the parent container of the target.
  let parent: unknown = doc;
  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i];
    if (Array.isArray(parent)) {
      parent = parent[Number(seg)];
    } else if (isObject(parent)) {
      parent = parent[seg];
    } else {
      // Path does not resolve; skip this op rather than throw — repair is best-effort.
      return doc;
    }
    if (parent === undefined || parent === null) return doc;
  }

  const key = segments[segments.length - 1];

  if (Array.isArray(parent)) {
    const idx = key === '-' ? parent.length : Number(key);
    if (Number.isNaN(idx)) return doc;
    if (op.op === 'remove') {
      if (idx >= 0 && idx < parent.length) parent.splice(idx, 1);
    } else if (op.op === 'add') {
      parent.splice(Math.min(idx, parent.length), 0, op.value);
    } else {
      if (idx >= 0 && idx < parent.length) parent[idx] = op.value;
    }
  } else if (isObject(parent)) {
    if (op.op === 'remove') {
      delete parent[key];
    } else {
      parent[key] = (op as { value: unknown }).value;
    }
  }
  return doc;
}

/** Apply an ordered list of patch ops to a deep clone of `doc`. */
export function applyPatch<T>(doc: T, ops: readonly JsonPatchOp[]): T {
  let out: unknown = clone(doc);
  for (const op of ops) out = applyOne(out, op);
  return out as T;
}
