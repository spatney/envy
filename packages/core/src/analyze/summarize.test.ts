import { describe, it, expect } from 'vitest';
import type { ChartSpec } from '../spec/types';
import { summarize } from './summarize';

describe('summarize — series', () => {
  it('narrates a single temporal series with percent change and an interior peak', () => {
    const spec: ChartSpec = {
      type: 'line',
      data: [
        { month: '2024-01', users: 4200 },
        { month: '2024-02', users: 4650 },
        { month: '2024-03', users: 6400 },
        { month: '2024-04', users: 5800 },
        { month: '2024-05', users: 6000 },
        { month: '2024-06', users: 6150 },
      ],
      encoding: { x: { field: 'month', type: 'temporal' }, y: { field: 'users', format: ',.0f' } },
    } as ChartSpec;
    expect(summarize(spec)).toBe(
      'Users rose 46% from 4,200 to 6,150 between 2024-01 and 2024-06, peaking at 6,400 in 2024-03.',
    );
  });

  it('uses an absolute change when the first value is zero', () => {
    const spec: ChartSpec = {
      type: 'area',
      data: [
        { q: 'Q1', signups: 0 },
        { q: 'Q2', signups: 120 },
      ],
      encoding: { x: { field: 'q' }, y: { field: 'signups' } },
    } as ChartSpec;
    expect(summarize(spec)).toBe('Signups rose 120 from 0 to 120 between Q1 and Q2.');
  });

  it('reports a flat series', () => {
    const spec: ChartSpec = {
      type: 'line',
      data: [
        { t: 1, v: 50 },
        { t: 2, v: 50 },
        { t: 3, v: 50 },
      ],
      encoding: { x: { field: 't' }, y: { field: 'v' } },
    } as ChartSpec;
    expect(summarize(spec)).toBe('V held steady around 50 between 1 and 3.');
  });

  it('summarizes a multi-series chart by leader and biggest mover', () => {
    const spec: ChartSpec = {
      type: 'slope',
      data: [
        { yr: '2019', brand: 'Aurora', share: 34 },
        { yr: '2024', brand: 'Aurora', share: 22 },
        { yr: '2019', brand: 'Borealis', share: 18 },
        { yr: '2024', brand: 'Borealis', share: 29 },
        { yr: '2019', brand: 'Cirrus', share: 27 },
        { yr: '2024', brand: 'Cirrus', share: 31 },
      ],
      encoding: { x: { field: 'yr' }, y: { field: 'share' }, series: { field: 'brand' } },
    } as ChartSpec;
    expect(summarize(spec)).toBe('Across 3 series, Cirrus leads at 31; Aurora fell the most (-12).');
  });
});

describe('summarize — category / scatter / value / distribution', () => {
  it('narrates a categorical bar with the largest and smallest share', () => {
    const spec: ChartSpec = {
      type: 'bar',
      data: [
        { region: 'West', sales: 420 },
        { region: 'East', sales: 310 },
        { region: 'South', sales: 90 },
      ],
      encoding: { x: { field: 'region' }, y: { field: 'sales', format: '$,.0f' } },
    } as ChartSpec;
    expect(summarize(spec)).toBe('West is the largest at $420 (51% of the $820 total), South the smallest at $90.');
  });

  it('narrates a scatter with a correlation', () => {
    const spec: ChartSpec = {
      type: 'scatter',
      data: [
        { x: 1, y: 2 },
        { x: 2, y: 4 },
        { x: 3, y: 5 },
        { x: 4, y: 9 },
      ],
      encoding: { x: { field: 'x' }, y: { field: 'y' } },
    } as ChartSpec;
    expect(summarize(spec)).toBe('4 points; x ranges 1\u20134 and y 2\u20139, a strong positive correlation.');
  });

  it('narrates a value vs. its target', () => {
    const spec: ChartSpec = {
      type: 'gauge',
      data: [{ uptime: 99.2 }, { uptime: 98.7 }, { uptime: 99.6 }],
      value: { field: 'uptime', aggregate: 'mean' },
      max: 100,
      target: 99,
      label: 'Avg uptime',
      format: ',.1f',
    } as ChartSpec;
    expect(summarize(spec)).toBe('Avg uptime is 99.2, above the target of 99.0.');
  });

  it('narrates a distribution', () => {
    const spec: ChartSpec = {
      type: 'histogram',
      data: [{ v: 1 }, { v: 2 }, { v: 2 }, { v: 3 }, { v: 8 }],
      encoding: { x: { field: 'v' } },
    } as ChartSpec;
    expect(summarize(spec)).toBe('5 v values ranging 1\u20138, averaging 3.2.');
  });

  it('returns an empty string for non-summarizable charts', () => {
    expect(summarize({ type: 'sankey', data: [], encoding: {} } as unknown as ChartSpec)).toBe('');
  });
});
