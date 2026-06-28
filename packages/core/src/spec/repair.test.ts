import { describe, it, expect } from 'vitest';
import { validateSpec } from './validate';
import { repairSpec } from './repair';

describe('validateSpec — repair annotations', () => {
  it('annotates an unknown chart type with a chartType suggestion and a fix', () => {
    const res = validateSpec({
      type: 'bart',
      data: [{ x: 1, y: 2 }],
      encoding: { x: { field: 'x' }, y: { field: 'y' } },
    });
    const typeErr = res.errors.find((e) => e.path === 'type');
    expect(typeErr?.suggestion).toEqual({ kind: 'chartType', candidates: expect.arrayContaining(['bar']) });
    expect(typeErr?.fix).toEqual([{ op: 'replace', path: '/type', value: 'bar' }]);
  });

  it('annotates an unknown aggregate op (enum) with a suggestion and a fix', () => {
    const res = validateSpec({
      type: 'matrix',
      data: [{ region: 'W', sales: 1 }],
      rows: ['region'],
      values: [{ field: 'sales', op: 'sume' }],
    });
    const opErr = res.errors.find((e) => e.path === 'values[0].op');
    expect(opErr?.suggestion?.candidates).toContain('sum');
    expect(opErr?.fix).toEqual([{ op: 'replace', path: '/values/0/op', value: 'sum' }]);
  });

  it('annotates an unknown timeUnit on a transform with a fix', () => {
    const res = validateSpec({
      type: 'line',
      data: [{ t: '2024-01-01', v: 1 }],
      transform: [{ timeUnit: 'mont', field: 't', as: 'm' }],
      encoding: { x: { field: 'm' }, y: { field: 'v' } },
    });
    const tuErr = res.errors.find((e) => e.path === 'transform[0].timeUnit');
    expect(tuErr?.suggestion?.candidates).toContain('month');
    expect(tuErr?.fix).toEqual([{ op: 'replace', path: '/transform/0/timeUnit', value: 'month' }]);
  });

  it('suggests a near field name but never auto-fixes it (ambiguous)', () => {
    const res = validateSpec({
      type: 'line',
      data: [{ month: '2024-01', users: 1 }],
      encoding: { x: { field: 'mnth' }, y: { field: 'users' } },
    });
    const fieldWarn = res.warnings.find((w) => w.path === 'encoding.x.field');
    expect(fieldWarn?.suggestion).toEqual({ kind: 'field', candidates: expect.arrayContaining(['month']) });
    expect(fieldWarn?.fix).toBeUndefined();
  });
});

describe('repairSpec', () => {
  it('repairs a misspelled chart type to a valid spec', () => {
    const { spec, applied, remaining } = repairSpec({
      type: 'bart',
      data: [{ x: 1, y: 2 }],
      encoding: { x: { field: 'x' }, y: { field: 'y' } },
    });
    expect((spec as { type: string }).type).toBe('bar');
    expect(applied).toContainEqual({ op: 'replace', path: '/type', value: 'bar' });
    expect(remaining).toEqual([]);
  });

  it('retypes a temporal-looking field declared as a category (lint fix)', () => {
    const { spec, applied } = repairSpec({
      type: 'line',
      data: [
        { month: '2024-01', users: 10 },
        { month: '2024-02', users: 12 },
      ],
      encoding: { x: { field: 'month', type: 'nominal' }, y: { field: 'users' } },
    });
    expect((spec as { encoding: { x: { type: string } } }).encoding.x.type).toBe('temporal');
    expect(applied).toContainEqual({ op: 'replace', path: '/encoding/x/type', value: 'temporal' });
  });

  it('applies several independent fixes in one pass', () => {
    const { spec, remaining } = repairSpec({
      type: 'matrix',
      data: [{ r: 'a', s: 1 }],
      rows: ['r'],
      values: [{ field: 's', op: 'avgg' }],
      density: 'standrd',
    });
    expect((spec as { values: { op: string }[] }).values[0].op).toBe('avg');
    expect((spec as { density: string }).density).toBe('standard');
    expect(remaining).toEqual([]);
  });

  it('chains fixes across passes (type fix unlocks channel checks)', () => {
    // 'scater' → 'scatter', which then requires x & y (both present) → valid.
    const { spec, remaining } = repairSpec({
      type: 'scater',
      data: [{ x: 1, y: 2 }],
      encoding: { x: { field: 'x' }, y: { field: 'y' } },
    });
    expect((spec as { type: string }).type).toBe('scatter');
    expect(remaining).toEqual([]);
  });

  it('leaves genuinely ambiguous errors in `remaining` and applies nothing', () => {
    const { applied, remaining } = repairSpec({
      type: 'bar',
      data: [{ x: 1 }],
      encoding: { x: { field: 'x' } }, // missing required y — no safe auto-fix
    });
    expect(applied).toEqual([]);
    expect(remaining.some((e) => e.path === 'encoding.y')).toBe(true);
  });

  it('does not mutate the input spec', () => {
    const input = {
      type: 'bart',
      data: [{ x: 1, y: 2 }],
      encoding: { x: { field: 'x' }, y: { field: 'y' } },
    };
    const snapshot = JSON.parse(JSON.stringify(input));
    repairSpec(input);
    expect(input).toEqual(snapshot);
  });

  it('is a no-op for an already valid spec', () => {
    const valid = {
      type: 'bar',
      data: [{ x: 'a', y: 2 }],
      encoding: { x: { field: 'x' }, y: { field: 'y' } },
    };
    const { applied, remaining } = repairSpec(valid);
    expect(applied).toEqual([]);
    expect(remaining).toEqual([]);
  });
});
