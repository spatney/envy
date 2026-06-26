// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';

// Mock the core runtime so we exercise the wrapper's lifecycle without needing
// a real canvas / ResizeObserver (those are verified in the browser harness).
vi.mock('@envy/core', () => ({
  render: vi.fn((el: HTMLElement, spec: unknown) => ({
    surface: { root: el },
    spec,
    update: vi.fn(),
    resize: vi.fn(),
    destroy: vi.fn(),
  })),
}));

import { render as coreRender } from '@envy/core';
import type { ChartSpec } from '@envy/core';
import { Chart } from './Chart';
import { useChart } from './useChart';

// React 19 expects an explicit act environment flag.
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const mockRender = vi.mocked(coreRender);

function specOf(title: string): ChartSpec {
  return {
    type: 'bar',
    data: [{ a: 'x', b: 1 }],
    encoding: { x: { field: 'a' }, y: { field: 'b' } },
    title,
  };
}

function lastInstance() {
  const results = mockRender.mock.results;
  return results[results.length - 1].value as {
    update: ReturnType<typeof vi.fn>;
    resize: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
    spec: ChartSpec;
  };
}

describe('@envy/react <Chart>', () => {
  beforeEach(() => {
    mockRender.mockClear();
  });

  it('renders into a container div on mount', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const spec = specOf('A');

    act(() => root.render(createElement(Chart, { spec })));

    expect(mockRender).toHaveBeenCalledTimes(1);
    const [el, passedSpec] = mockRender.mock.calls[0];
    expect(el).toBeInstanceOf(HTMLElement);
    expect(passedSpec).toBe(spec);
    // The wrapper renders a fill-by-default div.
    const div = container.querySelector('div') as HTMLDivElement;
    expect(div).toBeTruthy();
    expect(div.style.width).toBe('100%');

    act(() => root.unmount());
  });

  it('updates (not re-creates) the chart when the spec changes', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    const specA = specOf('A');
    act(() => root.render(createElement(Chart, { spec: specA })));
    const instance = lastInstance();
    expect(instance.update).not.toHaveBeenCalled();

    const specB = specOf('B');
    act(() => root.render(createElement(Chart, { spec: specB })));

    // Still only one render() — the chart was updated in place.
    expect(mockRender).toHaveBeenCalledTimes(1);
    expect(instance.update).toHaveBeenCalledTimes(1);
    expect(instance.update).toHaveBeenCalledWith(specB);

    act(() => root.unmount());
  });

  it('destroys the chart on unmount', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => root.render(createElement(Chart, { spec: specOf('A') })));
    const instance = lastInstance();

    act(() => root.unmount());
    expect(instance.destroy).toHaveBeenCalledTimes(1);
  });

  it('invokes onReady on mount and on each update', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const onReady = vi.fn();

    act(() => root.render(createElement(Chart, { spec: specOf('A'), onReady })));
    expect(onReady).toHaveBeenCalledTimes(1);

    act(() => root.render(createElement(Chart, { spec: specOf('B'), onReady })));
    expect(onReady).toHaveBeenCalledTimes(2);

    act(() => root.unmount());
  });
});

describe('@envy/react useChart', () => {
  beforeEach(() => {
    mockRender.mockClear();
  });

  it('mounts a chart on the attached ref and tears it down on unmount', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    function Host({ spec }: { spec: ChartSpec }) {
      const ref = useChart<HTMLDivElement>(spec);
      return createElement('div', { ref, style: { height: 320 } });
    }

    act(() => root.render(createElement(Host, { spec: specOf('A') })));
    expect(mockRender).toHaveBeenCalledTimes(1);
    const instance = lastInstance();

    act(() => root.unmount());
    expect(instance.destroy).toHaveBeenCalledTimes(1);
  });
});
