import { describe, it, expect } from 'vitest';
import type { ChartSpec } from 'graphein';
import { renderChart, renderToPNG } from './index';

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function isPng(buf: Buffer): boolean {
  return PNG_SIGNATURE.every((b, i) => buf[i] === b);
}

/** One compact, valid spec per canvas-backed chart type. */
const SPECS: Record<string, ChartSpec> = {
  line: {
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
  },
  bar: {
    type: 'bar',
    data: [
      { cat: 'A', v: 5 },
      { cat: 'B', v: 9 },
      { cat: 'C', v: 3 },
    ],
    encoding: { x: { field: 'cat' }, y: { field: 'v' } },
    title: 'Counts',
  },
  area: {
    type: 'area',
    data: [
      { m: '2024-01', g: 'x', v: 3 },
      { m: '2024-02', g: 'x', v: 5 },
      { m: '2024-01', g: 'y', v: 2 },
      { m: '2024-02', g: 'y', v: 4 },
    ],
    stack: true,
    encoding: {
      x: { field: 'm', type: 'temporal' },
      y: { field: 'v' },
      series: { field: 'g' },
    },
  },
  scatter: {
    type: 'scatter',
    data: [
      { x: 12, y: 30, w: 4 },
      { x: 35, y: 58, w: 6 },
      { x: 79, y: 102, w: 18 },
    ],
    encoding: {
      x: { field: 'x', type: 'quantitative' },
      y: { field: 'y', type: 'quantitative' },
      size: { field: 'w' },
    },
  },
  pie: {
    type: 'pie',
    data: [
      { k: 'A', v: 5 },
      { k: 'B', v: 3 },
      { k: 'C', v: 2 },
    ],
    encoding: { theta: { field: 'v' }, color: { field: 'k' } },
    title: 'Share',
  },
  heatmap: {
    type: 'heatmap',
    data: [
      { d: 'Mon', s: 'AM', n: 32 },
      { d: 'Mon', s: 'PM', n: 54 },
      { d: 'Tue', s: 'AM', n: 28 },
      { d: 'Tue', s: 'PM', n: 61 },
    ],
    encoding: {
      x: { field: 's' },
      y: { field: 'd' },
      color: { field: 'n', type: 'quantitative' },
    },
  },
  box: {
    type: 'box',
    data: [
      { c: 'A', v: 62 },
      { c: 'A', v: 65 },
      { c: 'A', v: 59 },
      { c: 'A', v: 71 },
      { c: 'B', v: 78 },
      { c: 'B', v: 82 },
      { c: 'B', v: 75 },
      { c: 'B', v: 88 },
    ],
    encoding: { x: { field: 'c' }, y: { field: 'v', title: 'ms' } },
  },
  funnel: {
    type: 'funnel',
    data: [
      { stage: 'Visited', users: 12480 },
      { stage: 'Signed up', users: 5210 },
      { stage: 'Activated', users: 3120 },
      { stage: 'Subscribed', users: 1430 },
    ],
    encoding: { stage: { field: 'stage' }, value: { field: 'users' } },
  },
  combo: {
    type: 'combo',
    data: [
      { month: 'Jan', revenue: 120, conversion: 0.041 },
      { month: 'Feb', revenue: 145, conversion: 0.046 },
      { month: 'Mar', revenue: 138, conversion: 0.044 },
    ],
    encoding: { x: { field: 'month' } },
    layers: [
      { mark: 'bar', encoding: { y: { field: 'revenue', title: 'Revenue' } } },
      { mark: 'line', axis: 'right', encoding: { y: { field: 'conversion', title: 'Conv' } } },
    ],
  },
  histogram: {
    type: 'histogram',
    data: [20, 21, 22, 24, 25, 25, 26, 28, 30, 33, 34, 35, 38, 40, 44, 48, 55, 61, 70, 92].map(
      (latency_ms) => ({ latency_ms }),
    ),
    encoding: { x: { field: 'latency_ms', title: 'Latency (ms)' } },
    bin: { maxbins: 8 },
  },
  sankey: {
    type: 'sankey',
    data: [
      { source: 'Coal', target: 'Electricity', value: 120 },
      { source: 'Gas', target: 'Electricity', value: 90 },
      { source: 'Electricity', target: 'Residential', value: 130 },
      { source: 'Electricity', target: 'Industry', value: 80 },
    ],
    encoding: {
      source: { field: 'source' },
      target: { field: 'target' },
      value: { field: 'value' },
    },
  },
  choropleth: {
    type: 'choropleth',
    geo: {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { name: 'NW' },
          geometry: { type: 'Polygon', coordinates: [[[0, 10], [10, 10], [10, 20], [0, 20], [0, 10]]] },
        },
        {
          type: 'Feature',
          properties: { name: 'NE' },
          geometry: { type: 'Polygon', coordinates: [[[10, 10], [20, 10], [20, 20], [10, 20], [10, 10]]] },
        },
      ],
    },
    data: [
      { region: 'NW', index: 42 },
      { region: 'NE', index: 88 },
    ],
    encoding: { key: { field: 'region' }, color: { field: 'index' } },
    featureId: 'name',
  } as ChartSpec,
};

describe('@graphein/node — renderChart', () => {
  for (const [name, spec] of Object.entries(SPECS)) {
    it(`renders ${name} to a valid PNG with a report`, () => {
      const { png, report, width, height } = renderChart(spec, { width: 640, height: 400, dpr: 2 });
      expect(isPng(png)).toBe(true);
      expect(png.length).toBeGreaterThan(1000);
      expect(width).toBe(1280);
      expect(height).toBe(800);
      expect(report.type).toBe(spec.type);
      expect(report.markCount).toBeGreaterThan(0);
    });
  }

  it('honors width/height/dpr in the output pixel size', () => {
    const { width, height } = renderChart(SPECS.bar, { width: 400, height: 300, dpr: 3 });
    expect(width).toBe(1200);
    expect(height).toBe(900);
  });

  it('defaults to 800×500 @2x when no size is given', () => {
    const { width, height } = renderChart(SPECS.line);
    expect(width).toBe(1600);
    expect(height).toBe(1000);
  });

  it('surfaces the render report so an agent can critique without vision', () => {
    const { report } = renderChart(SPECS.line, { width: 640, height: 400 });
    expect(report.ok).toBe(true);
    expect(report.seriesCount).toBe(2);
    expect(Array.isArray(report.diagnostics)).toBe(true);
  });
});

describe('@graphein/node — renderToPNG', () => {
  it('returns just the PNG buffer', () => {
    const png = renderToPNG(SPECS.pie, { width: 500, height: 400 });
    expect(Buffer.isBuffer(png)).toBe(true);
    expect(isPng(png)).toBe(true);
  });
});

describe('@graphein/node — unsupported kinds', () => {
  it('throws a clear error for DOM-only visuals', () => {
    const kpi = { type: 'kpi', data: [{ v: 42 }], value: { field: 'v', aggregate: 'sum' } } as ChartSpec;
    expect(() => renderToPNG(kpi)).toThrow(/DOM-only/);
  });
});
