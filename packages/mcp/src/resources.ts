/**
 * The agent-facing knowledge Graphein serves as MCP **resources** — the schema
 * and the prose guides — so a model that has never seen Graphein's API can read
 * the contract at runtime instead of relying on training data. This is the core
 * of the MCP server's "neutralize the training-data gap" purpose.
 *
 * The files live in `../resources/` (committed copies of the repo's `docs/`, kept
 * in sync by `scripts/sync-resources.mjs`). They are read lazily and cached so the
 * server pays nothing until an agent actually asks for one.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** Metadata describing one served resource. */
export interface GrapheinResource {
  /** Short registration name. */
  name: string;
  /** Stable `graphein://…` URI an agent reads. */
  uri: string;
  /** Human title. */
  title: string;
  /** What the resource is and when to read it. */
  description: string;
  /** IANA media type. */
  mimeType: string;
  /** File under `resources/`. */
  file: string;
}

/** Every resource the server exposes, in the order they should be advertised. */
export const RESOURCES: GrapheinResource[] = [
  {
    name: 'schema',
    uri: 'graphein://schema',
    title: 'Graphein ChartSpec JSON Schema',
    description:
      'The machine-readable JSON Schema for every Graphein ChartSpec and DashboardSpec field — chart types, channels, transforms, annotations, and required properties. Generate or check a spec against this.',
    mimeType: 'application/json',
    file: 'chart-spec.schema.json',
  },
  {
    name: 'agent-guide',
    uri: 'graphein://agent-guide',
    title: 'Graphein Agent Guide',
    description:
      'A task-oriented guide for producing correct Graphein charts: the one-rule workflow, choosing a chart type, encodings, transforms, the validate → repair → render → critique loop, and worked recipes. Read this first.',
    mimeType: 'text/markdown',
    file: 'agent-guide.md',
  },
  {
    name: 'spec-reference',
    uri: 'graphein://spec-reference',
    title: 'Graphein Spec Reference',
    description:
      'The exhaustive field-by-field reference for every chart type, channel, transform, annotation, and modifier. Consult this for the precise shape of a specific field.',
    mimeType: 'text/markdown',
    file: 'spec-reference.md',
  },
];

const cache = new Map<string, string>();

/**
 * Read a bundled resource file's text, cached. Resolved relative to this module
 * so it works both from `dist/` (published) and `src/` (tests) — the committed
 * `resources/` dir always sits one level up from either.
 */
export function readResourceFile(file: string): string {
  const hit = cache.get(file);
  if (hit !== undefined) return hit;
  const url = new URL(`../resources/${file}`, import.meta.url);
  const text = readFileSync(fileURLToPath(url), 'utf8');
  cache.set(file, text);
  return text;
}

/** Look up a resource by its `graphein://…` URI. */
export function resourceByUri(uri: string): GrapheinResource | undefined {
  return RESOURCES.find((r) => r.uri === uri);
}
