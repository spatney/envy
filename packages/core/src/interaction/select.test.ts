import { describe, expect, it } from 'vitest';
import { createSelectionStore } from './store';
import {
  applyPick,
  resolveEmphasis,
  resolveFilterValues,
  dependentParams,
  type SelectConfig,
} from './select';
import type { PointSelection, SelectionDef } from '../spec/selection';

const pointDef: SelectionDef = { type: 'point' };

function cfg(def: SelectionDef = pointDef): SelectConfig {
  return { store: createSelectionStore(), param: 'sel', def };
}

function pt(...values: unknown[]): PointSelection {
  return { kind: 'point', fields: ['cat'], tuples: values.map((v) => [v]) };
}

describe('applyPick — point toggle semantics', () => {
  it('sets a selection on first pick', () => {
    const c = cfg();
    applyPick(c, pt('A'));
    expect(c.store.get('sel')).toEqual(pt('A'));
  });

  it('toggles the same pick off (clears to null)', () => {
    const c = cfg();
    applyPick(c, pt('A'));
    applyPick(c, pt('A'));
    expect(c.store.get('sel')).toBeNull();
  });

  it('accumulates distinct picks', () => {
    const c = cfg();
    applyPick(c, pt('A'));
    applyPick(c, pt('B'));
    expect(c.store.get('sel')).toEqual(pt('A', 'B'));
  });

  it('removes one tuple of a multi-selection on re-pick', () => {
    const c = cfg();
    applyPick(c, pt('A'));
    applyPick(c, pt('B'));
    applyPick(c, pt('A'));
    expect(c.store.get('sel')).toEqual(pt('B'));
  });

  it('replaces (no toggle) when toggle is false', () => {
    const c = cfg({ type: 'point', toggle: false });
    applyPick(c, pt('A'));
    applyPick(c, pt('B'));
    expect(c.store.get('sel')).toEqual(pt('B'));
  });

  it('a null pick clears the selection', () => {
    const c = cfg();
    applyPick(c, pt('A'));
    applyPick(c, null);
    expect(c.store.get('sel')).toBeNull();
  });
});

describe('applyPick — non-point replaces', () => {
  it('replaces a range value', () => {
    const c = cfg({ type: 'interval' });
    applyPick(c, { kind: 'range', field: 'x', min: 0, max: 5 });
    applyPick(c, { kind: 'range', field: 'x', min: 2, max: 9 });
    expect(c.store.get('sel')).toEqual({ kind: 'range', field: 'x', min: 2, max: 9 });
  });
});

describe('resolveEmphasis', () => {
  it('returns null when there is no highlight or store', () => {
    const store = createSelectionStore();
    expect(resolveEmphasis(undefined, store)).toBeNull();
    expect(resolveEmphasis({ param: 'sel' }, undefined)).toBeNull();
  });

  it('returns null when the referenced param is empty', () => {
    const store = createSelectionStore();
    expect(resolveEmphasis({ param: 'sel' }, store)).toBeNull();
  });

  it('matches rows in the selection and dims the rest', () => {
    const store = createSelectionStore();
    store.set('sel', pt('A'));
    const e = resolveEmphasis({ param: 'sel' }, store, 0.2);
    expect(e).not.toBeNull();
    expect(e!.match({ cat: 'A' })).toBe(true);
    expect(e!.match({ cat: 'B' })).toBe(false);
    expect(e!.dim).toBe(0.2);
  });
});

describe('resolveFilterValues', () => {
  it('reads param clauses from the store and skips empty ones', () => {
    const store = createSelectionStore();
    store.set('a', pt('X'));
    const values = resolveFilterValues([{ param: 'a' }, { param: 'missing' }], store);
    expect(values).toEqual([pt('X')]);
  });

  it('converts literal predicates to selection values', () => {
    const values = resolveFilterValues([{ field: 'n', range: [1, 10] }], undefined);
    expect(values).toEqual([{ kind: 'range', field: 'n', min: 1, max: 10 }]);
  });
});

describe('dependentParams', () => {
  it('collects own params, the highlight param, and filter params', () => {
    const deps = dependentParams({ param: 'h' }, [{ param: 'f' }, { field: 'x', equals: 1 }], ['own']);
    expect([...deps].sort()).toEqual(['f', 'h', 'own']);
  });
});
