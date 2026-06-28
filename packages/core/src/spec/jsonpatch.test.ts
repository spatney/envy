import { describe, it, expect } from 'vitest';
import { applyPatch, toPointer } from './jsonpatch';

describe('toPointer', () => {
  it('converts dotted paths', () => {
    expect(toPointer('encoding.x.type')).toBe('/encoding/x/type');
  });
  it('converts bracketed array indices', () => {
    expect(toPointer('transform[0].calculate')).toBe('/transform/0/calculate');
    expect(toPointer('values[2].op')).toBe('/values/2/op');
  });
  it('returns empty pointer for empty path', () => {
    expect(toPointer('')).toBe('');
  });
  it('escapes reference tokens', () => {
    expect(toPointer('a/b')).toBe('/a~1b');
  });
});

describe('applyPatch', () => {
  it('replaces a nested value without mutating the input', () => {
    const doc = { type: 'bart', encoding: { x: { field: 'm' } } };
    const out = applyPatch(doc, [{ op: 'replace', path: '/type', value: 'bar' }]);
    expect(out.type).toBe('bar');
    expect(doc.type).toBe('bart'); // original untouched
  });

  it('replaces into nested objects', () => {
    const doc = { encoding: { x: { type: 'nominal' } } };
    const out = applyPatch(doc, [{ op: 'replace', path: '/encoding/x/type', value: 'temporal' }]);
    expect(out.encoding.x.type).toBe('temporal');
  });

  it('adds and removes object properties', () => {
    const doc: Record<string, unknown> = { a: 1 };
    expect(applyPatch(doc, [{ op: 'add', path: '/b', value: 2 }])).toEqual({ a: 1, b: 2 });
    expect(applyPatch(doc, [{ op: 'remove', path: '/a' }])).toEqual({});
  });

  it('supports array index replace, insert, append, and remove', () => {
    const doc = { xs: [10, 20, 30] };
    expect(applyPatch(doc, [{ op: 'replace', path: '/xs/1', value: 99 }]).xs).toEqual([10, 99, 30]);
    expect(applyPatch(doc, [{ op: 'add', path: '/xs/1', value: 15 }]).xs).toEqual([10, 15, 20, 30]);
    expect(applyPatch(doc, [{ op: 'add', path: '/xs/-', value: 40 }]).xs).toEqual([10, 20, 30, 40]);
    expect(applyPatch(doc, [{ op: 'remove', path: '/xs/0' }]).xs).toEqual([20, 30]);
  });

  it('preserves Date values through a patch (no JSON round-trip)', () => {
    const when = new Date('2024-03-01T00:00:00Z');
    const doc = { data: [{ t: when, v: 1 }], type: 'lin' };
    const out = applyPatch(doc, [{ op: 'replace', path: '/type', value: 'line' }]);
    expect(out.data[0].t).toBeInstanceOf(Date);
    expect((out.data[0].t as Date).getTime()).toBe(when.getTime());
  });

  it('is a no-op when the path does not resolve', () => {
    const doc = { a: 1 };
    expect(applyPatch(doc, [{ op: 'replace', path: '/x/y/z', value: 9 }])).toEqual({ a: 1 });
  });

  it('applies multiple ops in order', () => {
    const doc = { type: 'pi', density: 'comfy' };
    const out = applyPatch(doc, [
      { op: 'replace', path: '/type', value: 'pie' },
      { op: 'replace', path: '/density', value: 'comfortable' },
    ]);
    expect(out).toEqual({ type: 'pie', density: 'comfortable' });
  });
});
