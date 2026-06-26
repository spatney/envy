import { describe, it, expect } from 'vitest';
import { validateSpec, assertValidSpec } from './validate';

describe('validateSpec', () => {
  it('rejects non-objects', () => {
    expect(validateSpec(null).valid).toBe(false);
    expect(validateSpec(42).valid).toBe(false);
  });

  it('requires a known type', () => {
    expect(validateSpec({}).valid).toBe(false);
    const r = validateSpec({ type: 'bogus', data: [{ a: 1 }] });
    expect(r.valid).toBe(false);
    expect(r.errors[0].path).toBe('type');
  });

  it('accepts a valid line spec', () => {
    const r = validateSpec({
      type: 'line',
      data: [
        { d: '2024-01', v: 1 },
        { d: '2024-02', v: 2 },
      ],
      encoding: { x: { field: 'd' }, y: { field: 'v' } },
    });
    expect(r.valid).toBe(true);
    expect(r.errors).toHaveLength(0);
  });

  it('requires encoding channels for charts', () => {
    const r = validateSpec({ type: 'line', data: [{ d: 1, v: 2 }], encoding: { x: { field: 'd' } } });
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.path === 'encoding.y')).toBe(true);
  });

  it('warns about unknown fields but stays valid', () => {
    const r = validateSpec({
      type: 'scatter',
      data: [{ a: 1, b: 2 }],
      encoding: { x: { field: 'a' }, y: { field: 'missing' } },
    });
    expect(r.valid).toBe(true);
    expect(r.warnings.some((w) => w.path === 'encoding.y.field')).toBe(true);
  });

  it('validates kpi value', () => {
    expect(validateSpec({ type: 'kpi', value: 42 }).valid).toBe(true);
    expect(validateSpec({ type: 'kpi' }).valid).toBe(false);
    expect(validateSpec({ type: 'kpi', value: { field: 'sales', aggregate: 'sum' }, data: [{ sales: 1 }] }).valid).toBe(
      true,
    );
  });

  it('validates matrix requirements', () => {
    const bad = validateSpec({ type: 'matrix', data: [{ r: 'a', v: 1 }] });
    expect(bad.valid).toBe(false);
    const good = validateSpec({
      type: 'matrix',
      data: [{ r: 'a', v: 1 }],
      rows: ['r'],
      values: [{ field: 'v', op: 'sum' }],
    });
    expect(good.valid).toBe(true);
  });

  it('validates box requirements', () => {
    const good = validateSpec({
      type: 'box',
      data: [
        { g: 'A', v: 1 },
        { g: 'A', v: 3 },
      ],
      encoding: { x: { field: 'g' }, y: { field: 'v' } },
    });
    expect(good.valid).toBe(true);
    const bad = validateSpec({ type: 'box', data: [{ g: 'A', v: 1 }], encoding: { x: { field: 'g' } } });
    expect(bad.valid).toBe(false);
    expect(bad.errors.some((e) => e.path === 'encoding.y')).toBe(true);
  });

  it('validates sankey requirements', () => {
    const good = validateSpec({
      type: 'sankey',
      data: [{ s: 'A', t: 'B', v: 5 }],
      encoding: { source: { field: 's' }, target: { field: 't' }, value: { field: 'v' } },
    });
    expect(good.valid).toBe(true);
    const bad = validateSpec({
      type: 'sankey',
      data: [{ s: 'A', t: 'B', v: 5 }],
      encoding: { source: { field: 's' }, target: { field: 't' } },
    });
    expect(bad.valid).toBe(false);
    expect(bad.errors.some((e) => e.path === 'encoding.value')).toBe(true);
  });

  it('validates choropleth requirements', () => {
    const geo = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { name: 'X' },
          geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] },
        },
      ],
    };
    const good = validateSpec({
      type: 'choropleth',
      geo,
      data: [{ k: 'X', c: 3 }],
      encoding: { key: { field: 'k' }, color: { field: 'c' } },
      featureId: 'name',
    });
    expect(good.valid).toBe(true);
    const noGeo = validateSpec({
      type: 'choropleth',
      data: [{ k: 'X', c: 3 }],
      encoding: { key: { field: 'k' }, color: { field: 'c' } },
    });
    expect(noGeo.valid).toBe(false);
    expect(noGeo.errors.some((e) => e.path === 'geo')).toBe(true);
  });

  it('assertValidSpec throws with a readable message', () => {
    expect(() => assertValidSpec({ type: 'line' })).toThrow(/Invalid Envy chart spec/);
  });
});
