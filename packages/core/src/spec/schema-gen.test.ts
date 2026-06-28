import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { buildSchema, SCHEMA_PATH } from '../../scripts/gen-schema.mjs';
import { CHART_TYPES } from './types';

/**
 * Drift guard: `docs/chart-spec.schema.json` is generated from the TypeScript
 * spec types (the single source of truth). These tests fail if the committed
 * schema is stale or the generator regresses — run `npm run gen:schema`.
 */

const generated = buildSchema() as {
  oneOf: Array<{ $ref: string }>;
  $defs: Record<string, any>;
};
const committed = JSON.parse(readFileSync(SCHEMA_PATH, 'utf8'));

const constOf = (ref: string): string | undefined =>
  generated.$defs[ref.replace('#/$defs/', '')]?.properties?.type?.const;

describe('chart-spec.schema.json', () => {
  it('is in sync with the TypeScript types (run `npm run gen:schema` if this fails)', () => {
    expect(committed).toEqual(generated);
  });

  it('lists every chart, slicer, and dashboard type in the root oneOf', () => {
    const types = generated.oneOf.map((m) => constOf(m.$ref)).filter(Boolean) as string[];
    expect(types.slice().sort()).toEqual([...CHART_TYPES, 'dashboard'].slice().sort());
  });

  it('preserves per-chart required encoding channels (from the TS types)', () => {
    expect(generated.$defs.LineSpec.properties.encoding.required).toEqual(
      expect.arrayContaining(['x', 'y']),
    );
    expect(generated.$defs.HeatmapSpec.properties.encoding.required).toEqual(
      expect.arrayContaining(['x', 'y', 'color']),
    );
    expect(generated.$defs.FunnelSpec.properties.encoding.required).toEqual(
      expect.arrayContaining(['stage', 'value']),
    );
  });

  it('has no dangling $ref pointers', () => {
    const refs = [...JSON.stringify(generated).matchAll(/"#\/\$defs\/([^"]+)"/g)].map((m) => m[1]);
    const missing = [...new Set(refs)].filter((r) => !(r in generated.$defs));
    expect(missing).toEqual([]);
  });

  it('emits a clean schema (no leftover JSDoc links or anonymous type names)', () => {
    const text = JSON.stringify(generated);
    expect(text).not.toContain('{@link');
    expect(text).not.toContain('#/definitions/');
    expect(text).not.toContain('Record<');
    expect(text).not.toContain('Partial<');
  });
});
