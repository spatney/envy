// @ts-check
/**
 * Generate `docs/chart-spec.schema.json` from the TypeScript spec types.
 *
 * The TypeScript types in `packages/core/src/spec` are the single source of
 * truth for the Graphein spec surface. This script projects them into a
 * machine-readable JSON Schema (the agent-facing contract) so the two can never
 * drift. The `schema-gen` test re-runs `buildSchema()` and fails if the
 * committed file is stale — run `npm run gen:schema` to refresh it.
 *
 * Do NOT hand-edit `docs/chart-spec.schema.json`; edit the types and regenerate.
 */
import { createGenerator } from 'ts-json-schema-generator';
import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const coreRoot = resolve(here, '..');
const repoRoot = resolve(coreRoot, '..', '..');

/** Absolute path to the generated schema artifact. */
export const SCHEMA_PATH = resolve(repoRoot, 'docs', 'chart-spec.schema.json');

const DIALECT = 'https://json-schema.org/draft/2020-12/schema';
const ID = 'https://graphein.dev/chart-spec.schema.json';
const TITLE = 'Graphein ChartSpec';
const DESCRIPTION =
  'A single JSON-serializable Graphein chart, slicer, or dashboard specification, discriminated on `type`. ' +
  'Generated from the TypeScript types in packages/core/src/spec — edit the types and run `npm run gen:schema`.';

// Anonymous structural types ts-json-schema-generator names after their TS
// expression. We give them clean names / inline them in the final schema.
const RECORD_DEF = 'Record<string,unknown>';
const PARTIAL_INSETS_DEF = 'Partial<Insets>';

const isRecordRef = (ref) => decodeURIComponent(ref).endsWith(`/${RECORD_DEF}`);
const isPartialInsetsRef = (ref) => decodeURIComponent(ref).endsWith(`/${PARTIAL_INSETS_DEF}`);

/** A free-form record (`Record<string, unknown>`) inlined where referenced. */
const recordSchema = (description) => ({
  type: 'object',
  additionalProperties: true,
  ...(description ? { description } : {}),
});

/** Strip JSDoc `{@link X}` tags and tidy the whitespace they leave behind. */
function cleanDescription(text) {
  return text
    .replace(/\{@link\s+([^}]+?)\s*\}/g, (_, inner) => {
      const ref = String(inner).trim();
      if (ref.includes('|')) return ref.slice(ref.indexOf('|') + 1).trim();
      const sp = ref.indexOf(' ');
      return sp === -1 ? ref : ref.slice(sp + 1).trim();
    })
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([.,;:])/g, '$1')
    .trim();
}

/** Rewrite a `#/definitions/...` pointer to the `#/$defs/...` idiom + clean names. */
function rewriteRef(ref) {
  if (isPartialInsetsRef(ref)) return '#/$defs/Insets';
  return ref.replace('#/definitions/', '#/$defs/');
}

/**
 * Recursively normalize a generated schema node: rewrite `$ref` pointers, inline
 * the anonymous `Record<string,unknown>` type, and clean `description` strings.
 */
function normalize(node) {
  if (Array.isArray(node)) return node.map(normalize);
  if (node && typeof node === 'object') {
    if (typeof node.$ref === 'string' && isRecordRef(node.$ref)) {
      const desc = typeof node.description === 'string' ? cleanDescription(node.description) : undefined;
      return recordSchema(desc);
    }
    const out = {};
    for (const [key, value] of Object.entries(node)) {
      if (key === '$ref' && typeof value === 'string') out[key] = rewriteRef(value);
      else if (key === 'description' && typeof value === 'string') out[key] = cleanDescription(value);
      else out[key] = normalize(value);
    }
    return out;
  }
  return node;
}

/** Return a new object with keys sorted, for deterministic, diff-friendly output. */
function sortKeys(obj) {
  /** @type {Record<string, unknown>} */
  const sorted = {};
  for (const key of Object.keys(obj).sort()) sorted[key] = obj[key];
  return sorted;
}

/**
 * Build the Graphein JSON Schema from the TypeScript spec types. Pure: returns a
 * fresh schema object and writes nothing. The CLI below and the drift-guard test
 * both call this, so the committed artifact is always exactly this output.
 */
export function buildSchema() {
  const generator = createGenerator({
    tsconfig: resolve(coreRoot, 'tsconfig.json'),
    type: 'AnySpec',
    expose: 'all',
    topRef: false,
    jsDoc: 'extended',
    additionalProperties: false,
    sortProps: true,
    schemaId: ID,
  });

  const raw = generator.createSchema('AnySpec');
  const cleanedDefs = normalize(raw.definitions ?? {});

  // Promote definitions to `$defs`, dropping/renaming the anonymous structural
  // types; `Record<string,unknown>` was inlined by `normalize`.
  /** @type {Record<string, unknown>} */
  const defs = {};
  for (const [name, def] of Object.entries(cleanedDefs)) {
    if (name === RECORD_DEF) continue;
    defs[name === PARTIAL_INSETS_DEF ? 'Insets' : name] = def;
  }

  // Flatten the root into a single discriminated `oneOf` of every concrete spec
  // (every chart/slicer member of `ChartSpec`, plus `DashboardSpec`) so an agent
  // reading the schema sees the whole menu of types at the top level.
  const chartMembers = (cleanedDefs.ChartSpec?.anyOf ?? []).slice();
  const oneOf = [...chartMembers, { $ref: '#/$defs/DashboardSpec' }];

  return {
    $schema: DIALECT,
    $id: ID,
    title: TITLE,
    description: DESCRIPTION,
    type: 'object',
    required: ['type'],
    oneOf,
    $defs: sortKeys(defs),
  };
}

const isMain = import.meta.url === pathToFileURL(process.argv[1] ?? '').href;
if (isMain) {
  const json = JSON.stringify(buildSchema(), null, 2) + '\n';
  writeFileSync(SCHEMA_PATH, json);
  const defCount = Object.keys(buildSchema().$defs).length;
  console.log(`Wrote ${SCHEMA_PATH} (${defCount} $defs).`);
}
