// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { act, createElement, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import type { SelectionStore, SelectionValue } from 'graphein';
import { useSelection } from './useSelection';

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

/** A minimal in-memory store (useSelection only imports SelectionStore as a type). */
function fakeStore(): SelectionStore {
  const values = new Map<string, SelectionValue | null>();
  const listeners = new Set<(n: string, v: SelectionValue | null) => void>();
  const emit = (n: string, v: SelectionValue | null) => listeners.forEach((l) => l(n, v));
  return {
    get: (n) => values.get(n) ?? null,
    set: (n, v) => {
      values.set(n, v ?? null);
      emit(n, v ?? null);
    },
    clear: (n) => {
      if (n === undefined) for (const k of values.keys()) { values.set(k, null); emit(k, null); }
      else { values.set(n, null); emit(n, null); }
    },
    all: () => Object.fromEntries(values),
    subscribe: (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
}

describe('@graphein/react useSelection', () => {
  it('reflects store changes and publishes via the setter', () => {
    const store = fakeStore();
    let api: ReturnType<typeof useSelection> | undefined;

    function Host() {
      api = useSelection(store, 'region');
      return createElement('div', null, JSON.stringify(api[0]));
    }

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => root.render(createElement(Host)));

    // Initial: nothing selected.
    expect(container.textContent).toBe('null');

    // External store change flows into React state.
    const west: SelectionValue = { kind: 'set', field: 'region', values: ['West'] };
    act(() => store.set('region', west));
    expect(JSON.parse(container.textContent || '{}')).toEqual(west);

    // The setter publishes back to the store.
    const east: SelectionValue = { kind: 'set', field: 'region', values: ['East'] };
    act(() => api?.[1](east));
    expect(store.get('region')).toEqual(east);
    expect(JSON.parse(container.textContent || '{}')).toEqual(east);

    act(() => root.unmount());
  });

  it('accepts an instance-like source exposing a .store', () => {
    const store = fakeStore();
    const instanceLike = { store };
    let value: SelectionValue | null = null;

    function Host() {
      const [v] = useSelection(instanceLike, 'q');
      useEffect(() => {
        value = v;
      }, [v]);
      return null;
    }

    const container = document.createElement('div');
    const root = createRoot(container);
    act(() => root.render(createElement(Host)));

    const q: SelectionValue = { kind: 'text', field: 'q', query: 'hi' };
    act(() => store.set('q', q));
    expect(value).toEqual(q);

    act(() => root.unmount());
  });

  it('is inert when given no source', () => {
    let setter: ((v: SelectionValue | null) => void) | undefined;
    function Host() {
      const [v, set] = useSelection(null, 'x');
      setter = set;
      return createElement('div', null, String(v));
    }
    const container = document.createElement('div');
    const root = createRoot(container);
    act(() => root.render(createElement(Host)));
    expect(container.textContent).toBe('null');
    // Calling the setter with no store is a no-op (doesn't throw).
    act(() => setter?.({ kind: 'text', field: 'x', query: 'a' }));
    expect(container.textContent).toBe('null');
    act(() => root.unmount());
  });
});
