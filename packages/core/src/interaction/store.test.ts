import { describe, expect, it, vi } from 'vitest';
import type { SelectionValue } from '../spec/selection';
import { createSelectionStore } from './store';

const east: SelectionValue = { kind: 'set', field: 'region', values: ['East'] };
const west: SelectionValue = { kind: 'set', field: 'region', values: ['West'] };

describe('createSelectionStore', () => {
  it('stores and reads values by name', () => {
    const store = createSelectionStore();
    expect(store.get('sel')).toBeNull();
    store.set('sel', east);
    expect(store.get('sel')).toEqual(east);
  });

  it('seeds from initial values', () => {
    const store = createSelectionStore({ sel: east });
    expect(store.get('sel')).toEqual(east);
  });

  it('notifies subscribers on change', () => {
    const store = createSelectionStore();
    const listener = vi.fn();
    store.subscribe(listener);
    store.set('sel', east);
    expect(listener).toHaveBeenCalledWith('sel', east);
  });

  it('skips notifying when the value is structurally unchanged', () => {
    const store = createSelectionStore();
    const listener = vi.fn();
    store.subscribe(listener);
    store.set('sel', east);
    store.set('sel', { kind: 'set', field: 'region', values: ['East'] });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('clears a single param and notifies', () => {
    const store = createSelectionStore({ sel: east });
    const listener = vi.fn();
    store.subscribe(listener);
    store.clear('sel');
    expect(store.get('sel')).toBeNull();
    expect(listener).toHaveBeenCalledWith('sel', null);
    listener.mockClear();
    store.clear('sel'); // already null → no-op
    expect(listener).not.toHaveBeenCalled();
  });

  it('clears all params', () => {
    const store = createSelectionStore({ a: east, b: west });
    const listener = vi.fn();
    store.subscribe(listener);
    store.clear();
    expect(store.all()).toEqual({ a: null, b: null });
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('unsubscribes', () => {
    const store = createSelectionStore();
    const listener = vi.fn();
    const off = store.subscribe(listener);
    off();
    store.set('sel', east);
    expect(listener).not.toHaveBeenCalled();
  });
});
