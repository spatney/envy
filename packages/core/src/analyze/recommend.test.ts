import { describe, expect, it } from 'vitest';
import { validateSpec } from '../spec/validate';
import type { ChartType } from '../spec/types';
import type { Datum } from '../types';
import { recommendChart } from './recommend';

function expectAllValid(data: Datum[]) {
  const results = recommendChart(data, { maxResults: 10 });
  expect(results.length).toBeGreaterThan(0);
  for (const rec of results) {
    const validation = validateSpec(rec.spec);
    expect(validation.valid, JSON.stringify(validation.errors)).toBe(true);
  }
  return results;
}

function typesOf(data: Datum[]): ChartType[] {
  return expectAllValid(data).map((rec) => rec.spec.type);
}

describe('recommendChart', () => {
  it('ranks temporal + measure data as a line chart first', () => {
    const results = expectAllValid([
      { month: '2024-01', users: 120 },
      { month: '2024-02', users: 160 },
      { month: '2024-03', users: 190 },
    ]);
    expect(results[0].spec.type).toBe('line');
  });

  it('includes a bar for category + measure data', () => {
    expect(typesOf([
      { region: 'West', sales: 420 },
      { region: 'East', sales: 310 },
      { region: 'South', sales: 180 },
    ])).toContain('bar');
  });

  it('includes a scatter for two measures', () => {
    expect(typesOf([
      { spend: 10, revenue: 24 },
      { spend: 12, revenue: 28 },
      { spend: 18, revenue: 42 },
    ])).toContain('scatter');
  });

  it('includes histogram and kpi for one measure', () => {
    const types = typesOf([{ latency: 42 }, { latency: 55 }, { latency: 71 }, { latency: 38 }]);
    expect(types).toContain('histogram');
    expect(types).toContain('kpi');
  });

  it('includes heatmap and matrix for two categories plus a measure', () => {
    const types = typesOf([
      { region: 'West', channel: 'Organic', sales: 120 },
      { region: 'West', channel: 'Paid', sales: 90 },
      { region: 'East', channel: 'Organic', sales: 140 },
      { region: 'East', channel: 'Paid', sales: 110 },
    ]);
    expect(types).toContain('heatmap');
    expect(types).toContain('matrix');
  });
});
