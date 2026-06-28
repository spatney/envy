import { describe, it, expect } from 'vitest';
import { levenshtein, closest, suggestions } from './suggest';

describe('levenshtein', () => {
  it('is zero for identical strings', () => {
    expect(levenshtein('bar', 'bar')).toBe(0);
  });
  it('counts single edits', () => {
    expect(levenshtein('bart', 'bar')).toBe(1); // deletion
    expect(levenshtein('ber', 'bar')).toBe(1); // substitution
    expect(levenshtein('bars', 'bar')).toBe(1); // insertion
  });
  it('handles empty strings', () => {
    expect(levenshtein('', 'bar')).toBe(3);
    expect(levenshtein('bar', '')).toBe(3);
  });
});

describe('suggestions', () => {
  const types = ['line', 'area', 'bar', 'scatter', 'pie'];

  it('ranks the nearest candidates first', () => {
    expect(suggestions('bart', types)[0]).toBe('bar');
    expect(suggestions('scatterplot', types)[0]).toBe('scatter');
  });
  it('is case-insensitive', () => {
    expect(suggestions('BAR', types)).toContain('bar');
  });
  it('returns nothing when far from every candidate', () => {
    expect(suggestions('xyzzy', types)).toEqual([]);
  });
  it('caps the number of returned candidates', () => {
    expect(suggestions('lin', types, 2).length).toBeLessThanOrEqual(2);
  });
});

describe('closest', () => {
  const ops = ['sum', 'mean', 'avg', 'min', 'max', 'count'];

  it('returns a confident, unambiguous match', () => {
    expect(closest('sume', ops)).toBe('sum');
    expect(closest('coutn', ops)).toBe('count');
  });
  it('returns undefined when too far to be safe', () => {
    expect(closest('frobnicate', ops)).toBeUndefined();
  });
  it('returns undefined on an ambiguous tie', () => {
    // "cat" is edit-distance 1 from both "bat" and "car" → ambiguous, no auto-fix.
    expect(closest('cat', ['bat', 'car'])).toBeUndefined();
  });
  it('returns undefined for empty input', () => {
    expect(closest('', ops)).toBeUndefined();
  });
});
