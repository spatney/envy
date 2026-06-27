// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';

// Mock the core runtime so we exercise the wrapper's lifecycle without a real
// canvas / ResizeObserver (verified in the browser harness).
vi.mock('graphein', () => ({
  renderDashboard: vi.fn((el: HTMLElement, spec: unknown) => ({
    spec,
    store: { subscribe: vi.fn(() => () => {}) },
    views: [],
    update: vi.fn(),
    resize: vi.fn(),
    destroy: vi.fn(),
    on: vi.fn(() => () => {}),
    off: vi.fn(),
    getSelection: vi.fn(),
    setSelection: vi.fn(),
    clearSelection: vi.fn(),
  })),
}));

import { renderDashboard as coreRenderDashboard } from 'graphein';
import type { DashboardSpec } from 'graphein';
import { Dashboard } from './Dashboard';

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
const mockRender = vi.mocked(coreRenderDashboard);

function dashOf(title: string): DashboardSpec {
  return {
    type: 'dashboard',
    data: [{ region: 'West', sales: 1 }],
    title,
    views: [{ id: 'bars', spec: { type: 'bar', encoding: { x: { field: 'region' }, y: { field: 'sales' } } } }],
  };
}

function lastInstance() {
  const results = mockRender.mock.results;
  return results[results.length - 1].value as {
    update: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
    on: ReturnType<typeof vi.fn>;
  };
}

describe('@graphein/react <Dashboard>', () => {
  beforeEach(() => mockRender.mockClear());

  it('renders into a full-width container on mount', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const spec = dashOf('A');

    act(() => root.render(createElement(Dashboard, { spec })));

    expect(mockRender).toHaveBeenCalledTimes(1);
    const [el, passedSpec] = mockRender.mock.calls[0];
    expect(el).toBeInstanceOf(HTMLElement);
    expect(passedSpec).toBe(spec);
    const div = container.querySelector('div') as HTMLDivElement;
    expect(div.style.width).toBe('100%');

    act(() => root.unmount());
  });

  it('updates in place when the spec changes, and destroys on unmount', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => root.render(createElement(Dashboard, { spec: dashOf('A') })));
    const instance = lastInstance();
    expect(instance.update).not.toHaveBeenCalled();

    act(() => root.render(createElement(Dashboard, { spec: dashOf('B') })));
    expect(mockRender).toHaveBeenCalledTimes(1);
    expect(instance.update).toHaveBeenCalledTimes(1);

    act(() => root.unmount());
    expect(instance.destroy).toHaveBeenCalledTimes(1);
  });
});
