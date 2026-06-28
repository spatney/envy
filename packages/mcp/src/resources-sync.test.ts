import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { RESOURCES } from './resources.js';

/**
 * Drift guard: the resources the MCP server serves are committed copies of the
 * repo's `docs/`. If a doc changes, `npm run sync:resources` must be re-run so the
 * published server ships the current API knowledge. This fails until it is.
 */
const docsDir = new URL('../../../docs/', import.meta.url);
const resourcesDir = new URL('../resources/', import.meta.url);
const read = (base: URL, file: string) => readFileSync(fileURLToPath(new URL(file, base)), 'utf8');

describe('bundled resources stay in sync with docs/', () => {
  for (const r of RESOURCES) {
    it(`resources/${r.file} matches docs/${r.file}`, () => {
      expect(read(resourcesDir, r.file)).toBe(read(docsDir, r.file));
    });
  }
});
