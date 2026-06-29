// @vitest-environment node
import { describe, it, expect } from 'vitest';
import type { LineSpec, PieSpec, KpiSpec } from '../spec/types';
import type { ChartSpec } from '../spec/types';
import { renderToContext } from './headless';

/** A 2D-context stand-in that tallies draw ops and records text (node env, no DOM). */
function recordingCtx() {
  const texts: string[] = [];
  let ops = 0;
  const grad = { addColorStop() {} };
  const data: Record<string, unknown> = {
    canvas: { width: 800, height: 500 },
    createLinearGradient: () => grad,
    createRadialGradient: () => grad,
    measureText: (t: string) => ({ width: String(t).length * 6 }),
    setLineDash() {},
    fillText: (t: string) => {
      ops++;
      texts.push(String(t));
    },
  };
  const ctx = new Proxy(data, {
    get(t, p: string) {
      if (p in t) return t[p];
      return (...args: unknown[]) => {
        void args;
        ops++;
        return undefined;
      };
    },
    set() {
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, texts, ops: () => ops };
}

const lineSpec: LineSpec = {
  type: 'line',
  data: [
    { m: '2024-01', region: 'East', v: 3 },
    { m: '2024-02', region: 'East', v: 5 },
    { m: '2024-03', region: 'East', v: 4 },
    { m: '2024-01', region: 'West', v: 2 },
    { m: '2024-02', region: 'West', v: 6 },
    { m: '2024-03', region: 'West', v: 7 },
  ],
  encoding: {
    x: { field: 'm', type: 'temporal' },
    y: { field: 'v', title: 'Value' },
    series: { field: 'region' },
  },
  title: 'Revenue by region',
};

describe('renderToContext — headless cartesian', () => {
  it('paints marks + text and returns a clean report (no DOM)', () => {
    const { ctx, texts, ops } = recordingCtx();
    const report = renderToContext({ marks: ctx, width: 800, height: 500 }, lineSpec);

    expect(ops()).toBeGreaterThan(0); // marks painted
    expect(texts).toContain('Revenue by region'); // title
    expect(texts).toContain('Value'); // y-axis title
    expect(texts).toEqual(expect.arrayContaining(['East', 'West'])); // legend

    expect(report.type).toBe('line');
    expect(report.seriesCount).toBe(2);
    expect(report.ok).toBe(true);
  });

  it('applies declarative transforms before building the model', () => {
    const { ctx } = recordingCtx();
    const raw: LineSpec = {
      type: 'line',
      data: [
        { m: '2024-01', v: 1 },
        { m: '2024-01', v: 3 },
        { m: '2024-02', v: 10 },
      ],
      transform: [{ aggregate: [{ op: 'sum', field: 'v', as: 'v' }], groupby: ['m'] }],
      encoding: { x: { field: 'm', type: 'temporal' }, y: { field: 'v' } },
    };
    const report = renderToContext({ marks: ctx, width: 600, height: 400 }, raw);
    // 3 raw rows aggregate to 2 monthly marks.
    expect(report.markCount).toBe(2);
  });
});

describe('renderToContext — headless custom (pie)', () => {
  it('renders a pie and reports its slices', () => {
    const { ctx, texts } = recordingCtx();
    const pie: PieSpec = {
      type: 'pie',
      data: [
        { k: 'A', v: 5 },
        { k: 'B', v: 3 },
        { k: 'C', v: 2 },
      ],
      encoding: { theta: { field: 'v' }, color: { field: 'k' } },
      title: 'Share',
    };
    const report = renderToContext({ marks: ctx, width: 500, height: 400 }, pie);
    expect(report.type).toBe('pie');
    expect(texts).toContain('Share');
  });
});

describe('renderToContext — formerly DOM-only', () => {
  it('renders a kpi to canvas + ok report (no throw)', () => {
    const { ctx, texts } = recordingCtx();
    const kpi: KpiSpec = { type: 'kpi', label: 'ARR', data: [{ v: 42 }], value: { field: 'v', aggregate: 'sum' } };
    const report = renderToContext({ marks: ctx, width: 300, height: 200 }, kpi);
    expect(report.type).toBe('kpi');
    expect(report.ok).toBe(true);
    expect(texts).toContain('ARR');
  });

  it('renders table/matrix/slicer headlessly without touching the DOM', () => {
    const rows = [
      { region: 'East', sales: 120 },
      { region: 'West', sales: 90 },
    ];
    for (const spec of [
      { type: 'table', data: rows, title: 'T' },
      { type: 'matrix', data: rows, rows: ['region'], values: [{ field: 'sales', op: 'sum' }] },
      { type: 'dropdown', data: rows, field: 'region', title: 'Region' },
    ] as unknown as ChartSpec[]) {
      const { ctx } = recordingCtx();
      const report = renderToContext({ marks: ctx, width: 400, height: 240 }, spec);
      expect(report.type).toBe(spec.type);
    }
  });

  it('composes a dashboard onto one canvas', () => {
    const { ctx } = recordingCtx();
    const dash = {
      type: 'dashboard',
      data: [{ region: 'East', v: 1 }, { region: 'West', v: 2 }],
      views: [{ id: 'k', spec: { type: 'kpi', value: { field: 'v', aggregate: 'sum' } } }],
    } as unknown as ChartSpec;
    const report = renderToContext({ marks: ctx, width: 600, height: 320 }, dash);
    expect(report.type).toBe('dashboard');
    expect(report.seriesCount).toBe(1);
  });
});
