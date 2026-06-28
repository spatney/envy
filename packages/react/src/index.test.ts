import { describe, it, expect } from 'vitest';
import * as api from './index';

describe('@graphein/react public surface', () => {
  it('re-exports the components, hooks, and store factory', () => {
    expect(typeof api.Chart).toBe('function');
    expect(typeof api.Dashboard).toBe('function');
    expect(typeof api.useChart).toBe('function');
    expect(typeof api.useDashboard).toBe('function');
    expect(typeof api.useSelection).toBe('function');
    // Re-exported from the core engine.
    expect(typeof api.createSelectionStore).toBe('function');
  });

  it('exposes a VERSION string', () => {
    expect(typeof api.VERSION).toBe('string');
  });

  it('createSelectionStore yields a working selection bus', () => {
    const store = api.createSelectionStore();
    store.set('region', { kind: 'set', field: 'region', values: ['West'] });
    expect(store.get('region')).toEqual({ kind: 'set', field: 'region', values: ['West'] });
    store.clear('region');
    expect(store.get('region')).toBeNull();
  });
});
