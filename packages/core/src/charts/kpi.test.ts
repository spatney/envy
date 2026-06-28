// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from 'vitest';
import { validateSpec } from '../spec/validate';
import type { ChartSpec, KpiSpec } from '../spec/types';
import { render } from '../runtime/render';
import type { Surface } from '../render/surface';
import { resolveTheme } from '../theme';
import { drawKpi, formatDelta } from './kpi';

beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = (() =>
    fakeContext()) as typeof HTMLCanvasElement.prototype.getContext;
});

const kpiSpec = (over: Partial<KpiSpec> = {}): KpiSpec => ({
  type: 'kpi',
  value: 10,
  delta: 0.5,
  ...over,
});

function fakeContext(): CanvasRenderingContext2D {
  const grad = { addColorStop() {} };
  const data: Record<string, unknown> = {
    canvas: { width: 640, height: 400 },
    createLinearGradient: () => grad,
    createRadialGradient: () => grad,
    measureText: (t: string) => ({ width: String(t).length * 6 }),
    setLineDash() {},
  };
  return new Proxy(data, {
    get(t, prop: string) {
      if (prop in t) return t[prop];
      return (...args: unknown[]) => {
        void args;
        return undefined;
      };
    },
    set() {
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
}

function makeSurface(): Surface {
  return {
    marks: { ctx: fakeContext() },
    overlay: document.createElement('div'),
    width: 640,
    height: 400,
  } as unknown as Surface;
}

describe('validateSpec — kpi', () => {
  it('accepts a basic kpi', () => {
    expect(validateSpec(kpiSpec()).errors).toEqual([]);
  });

  it('requires a value', () => {
    expect(validateSpec({ type: 'kpi' } as unknown as ChartSpec).errors.map((e) => e.path)).toContain('value');
  });
});

describe('formatDelta', () => {
  it('honors an explicit currency format for small deltas', () => {
    expect(formatDelta(0.5, '$,.2f')).toBe('+$0.50');
    expect(formatDelta(-0.5, '$,.2f')).toBe('-$0.50');
  });

  it('preserves automatic percent formatting when no format is supplied', () => {
    expect(formatDelta(0.5)).toBe('+50.0%');
    expect(formatDelta(-0.5)).toBe('-50.0%');
    expect(formatDelta(5)).toBe('+5');
  });
});

describe('drawKpi — smoke', () => {
  it('renders a formatted positive delta with the up arrow', () => {
    const surface = makeSurface();

    drawKpi(surface, kpiSpec({ format: '$,.2f' }), resolveTheme('light'), { width: 640, height: 400 });

    const text = surface.overlay.textContent ?? '';
    expect(text).toContain('$10.00');
    expect(text).toContain('▲ +$0.50');
    expect(text).not.toContain('%');
  });

  it('renders an auto-percent negative delta with the down arrow', () => {
    const surface = makeSurface();

    drawKpi(surface, kpiSpec({ delta: -0.5 }), resolveTheme('light'), { width: 640, height: 400 });

    expect(surface.overlay.textContent ?? '').toContain('▼ -50.0%');
  });
});

describe('render — kpi DOM', () => {
  function mount(spec: KpiSpec) {
    expect(validateSpec(spec).errors).toEqual([]);
    const container = document.createElement('div');
    document.body.appendChild(container);
    const inst = render(container, spec);
    return { container, inst };
  }

  it('renders a literal value, label, target delta, and updates/destroys cleanly', () => {
    const { container, inst } = mount(kpiSpec({ value: 1234.5, label: 'Revenue', delta: 0.125, format: '$,.1f' }));

    expect(container.textContent).toContain('Revenue');
    expect(container.textContent).toContain('$1,234.5');
    expect(container.textContent).toContain('▲ +$0.1');

    inst.update(kpiSpec({ value: 98, label: 'Churn', delta: -0.08 }));
    expect(container.textContent).toContain('Churn');
    expect(container.textContent).toContain('98');
    expect(container.textContent).toContain('▼ -8.0%');

    inst.destroy();
    expect(container.querySelector('.graphein-root')).toBeNull();
  });

  it('aggregates value and delta fields and renders an SVG sparkline', () => {
    const spec = kpiSpec({
      data: [
        { month: 'Jan', sales: 10, delta: 0.1 },
        { month: 'Feb', sales: 15, delta: 0.2 },
        { month: 'Mar', sales: 25, delta: -0.1 },
      ],
      value: { field: 'sales', aggregate: 'sum' },
      delta: { field: 'delta', aggregate: 'mean' },
      sparkline: { field: 'sales' },
      label: 'Bookings',
      dimensions: { width: 420, height: 260 },
    });

    const { container, inst } = mount(spec);

    expect(container.textContent).toContain('Bookings');
    expect(container.textContent).toContain('50');
    expect(container.textContent).toContain('▲ +6.7%');
    expect(container.querySelector('svg path[stroke]')).not.toBeNull();
    expect(inst.report().ok).toBe(true);
  });

  it('shows an em dash for non-finite aggregate results and supports implicit sparkline fields', () => {
    const { container } = mount(
      kpiSpec({
        data: [{ v: 'n/a' }, { v: null }],
        value: { field: 'v', aggregate: 'sum' },
        delta: { field: 'missing', aggregate: 'sum' },
        sparkline: true,
      }),
    );

    expect(container.textContent).toContain('—');
    expect(container.querySelector('svg')).toBeNull();
  });
});
