// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from 'vitest';
import { render } from '../runtime/render';
import { validateSpec } from '../spec/validate';
import type { MatrixSpec } from '../spec/types';
import { computeShowAsValue } from './matrix';

beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = (() =>
    fakeContext()) as typeof HTMLCanvasElement.prototype.getContext;
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

const salesRows = [
  { region: 'East', segment: 'Consumer', year: '2024', quarter: 'Q1', sales: 100, profit: 25 },
  { region: 'East', segment: 'Consumer', year: '2024', quarter: 'Q2', sales: 50, profit: 5 },
  { region: 'East', segment: 'Corporate', year: '2024', quarter: 'Q1', sales: 75, profit: -10 },
  { region: 'West', segment: 'Consumer', year: '2024', quarter: 'Q1', sales: 25, profit: 8 },
  { region: 'West', segment: 'Corporate', year: '2025', quarter: 'Q1', sales: 40, profit: 12 },
];

const matrixSpec = (over: Partial<MatrixSpec> = {}): MatrixSpec => ({
  type: 'matrix',
  data: salesRows,
  rows: ['region', 'segment'],
  columns: ['year', 'quarter'],
  values: [{ field: 'sales', op: 'sum', label: 'Sales', format: ',.0f' }],
  dimensions: { width: 760, height: 360 },
  ...over,
});

describe('matrix showAs values', () => {
  it('keeps raw values for value mode', () => {
    expect(computeShowAsValue(42, 'value', 100)).toBe(42);
    expect(computeShowAsValue(42, undefined, 100)).toBe(42);
  });

  it('computes percentages against supplied denominators', () => {
    expect(computeShowAsValue(25, 'percentOfRow', 100)).toBe(0.25);
    expect(computeShowAsValue(3, 'percentOfColumn', 12)).toBe(0.25);
    expect(computeShowAsValue(9, 'percentOfTotal', 36)).toBe(0.25);
  });

  it('returns null for null values or zero denominators', () => {
    expect(computeShowAsValue(null, 'percentOfTotal', 10)).toBeNull();
    expect(computeShowAsValue(10, 'percentOfTotal', 0)).toBeNull();
  });
});

describe('render — matrix DOM', () => {
  function mount(spec: MatrixSpec) {
    expect(validateSpec(spec).errors).toEqual([]);
    const container = document.createElement('div');
    document.body.appendChild(container);
    const inst = render(container, spec);
    return { container, inst };
  }

  it('renders nested row and column headers with row subtotals and grand totals', () => {
    const { container, inst } = mount(matrixSpec({ subtotals: true, grandTotals: true }));

    const text = container.textContent ?? '';
    expect(text).toContain('region / segment');
    expect(text).toContain('2024');
    expect(text).toContain('Q1');
    expect(text).toContain('East');
    expect(text).toContain('Consumer');
    expect(text).toContain('East Total');
    expect(text).toContain('Grand Total');
    expect(text).toContain('175');
    expect(text).toContain('290');
    expect(inst.report().ok).toBe(true);
  });

  it('renders multiple value aggregations and conditional formatting spans', () => {
    const { container } = mount(
      matrixSpec({
        values: [
          { field: 'sales', op: 'sum', label: 'Sales', prefix: '$', format: ',.0f' },
          {
            field: 'profit',
            op: 'sum',
            label: 'Profit',
            format: ',.0f',
            negativeStyle: 'parens-red',
            conditionalFormat: { type: 'icon', set: 'triangles', position: 'right' },
          },
        ],
      }),
    );

    expect([...container.querySelectorAll('th')].map((th) => th.textContent)).toEqual(
      expect.arrayContaining(['Sales', 'Profit']),
    );
    expect(container.textContent).toContain('$100');
    expect(container.textContent).toContain('(10)');
    expect(container.querySelector('td span[aria-hidden="true"]')).not.toBeNull();
  });

  it('computes showAs percentages for row, column, and total denominators', () => {
    const { container } = mount(
      matrixSpec({
        rows: ['region'],
        columns: ['quarter'],
        values: [
          { field: 'sales', op: 'sum', label: 'Row %', showAs: 'percentOfRow' },
          { field: 'sales', op: 'sum', label: 'Column %', showAs: 'percentOfColumn' },
          { field: 'sales', op: 'sum', label: 'Total %', showAs: 'percentOfTotal' },
        ],
      }),
    );

    const text = container.textContent ?? '';
    expect(text).toContain('77.8%');
    expect(text).toContain('72.9%');
    expect(text).toContain('60.3%');
  });

  it('sorts columns by label or by aggregate value and uses flat headers after sorting', () => {
    const { container } = mount(
      matrixSpec({
        rows: ['region'],
        columns: ['quarter'],
        values: [{ field: 'sales', op: 'sum', label: 'Sales' }],
        columnSort: { by: 'value', order: 'asc' },
      }),
    );

    const headers = [...container.querySelectorAll('th')].map((th) => th.textContent ?? '');
    expect(headers.indexOf('Q2')).toBeLessThan(headers.indexOf('Q1'));
  });

  it('renders a viewport grid overlay in sketch mode', () => {
    const { container } = mount(matrixSpec({ sketch: true, subtotals: true }));

    expect(container.querySelector('.graphein-layer-overlay > canvas')).not.toBeNull();
  });
});
