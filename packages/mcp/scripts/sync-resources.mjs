/**
 * Copy Graphein's agent-facing docs into this package so the *published*
 * `graphein-mcp` server can serve them as MCP resources at runtime — a published
 * npm package can't reach the repo's `../../docs`. Run `npm run sync:resources`
 * after editing any of these docs; `resources-sync.test.ts` guards against drift.
 *
 * The JSON Schema itself is generated (`npm run gen:schema`); this only copies the
 * already-generated artifact alongside the two prose guides.
 */
import { copyFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

/** The repo-root `docs/` files mirrored into `packages/mcp/resources/`. */
export const RESOURCE_FILES = ['chart-spec.schema.json', 'agent-guide.md', 'spec-reference.md'];

export const DOCS_DIR = join(here, '..', '..', '..', 'docs');
export const RESOURCES_DIR = join(here, '..', 'resources');

/** Copy every resource file from `docs/` into `resources/`. Returns the list. */
export function syncResources() {
  mkdirSync(RESOURCES_DIR, { recursive: true });
  for (const f of RESOURCE_FILES) copyFileSync(join(DOCS_DIR, f), join(RESOURCES_DIR, f));
  return RESOURCE_FILES;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const files = syncResources();
  console.log(`Synced ${files.length} resource(s) into packages/mcp/resources/: ${files.join(', ')}`);
}
