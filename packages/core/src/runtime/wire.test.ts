import { describe, it, expect } from 'vitest';
import { wireViews, specFields, keyFields, isSlicerType } from './wire';
import type { DashboardView, InteractionLink } from '../spec/dashboard';
import type { ChartSpec } from '../spec/types';

const barByRegion: ChartSpec = {
  type: 'bar',
  data: [],
  encoding: { x: { field: 'region' }, y: { field: 'sales' } },
};
const lineByRegion: ChartSpec = {
  type: 'line',
  data: [],
  encoding: { x: { field: 'region' }, y: { field: 'sales' } },
};
const scatterByCategory: ChartSpec = {
  type: 'scatter',
  data: [],
  encoding: { x: { field: 'price' }, y: { field: 'sales' }, series: { field: 'category' } },
};
const regionSlicer: ChartSpec = { type: 'dropdown', data: [], field: 'region' };

function views(...specs: ChartSpec[]): DashboardView[] {
  return specs.map((spec, i) => ({ id: `v${i}`, spec }));
}

describe('specFields', () => {
  it('collects every encoded field of a chart', () => {
    expect([...specFields(scatterByCategory)].sort()).toEqual(['category', 'price', 'sales']);
  });
  it('returns a slicer field', () => {
    expect([...specFields(regionSlicer)]).toEqual(['region']);
  });
});

describe('keyFields', () => {
  it('uses x for bar/line/area/box', () => {
    expect(keyFields(barByRegion)).toEqual(['region']);
    expect(keyFields(lineByRegion)).toEqual(['region']);
  });
  it('prefers a scatter series/color field over x+y', () => {
    expect(keyFields(scatterByCategory)).toEqual(['category']);
    expect(
      keyFields({ type: 'scatter', data: [], encoding: { x: { field: 'a' }, y: { field: 'b' } } }),
    ).toEqual(['a', 'b']);
  });
  it('uses color for pie and x+y for heatmap', () => {
    expect(
      keyFields({ type: 'pie', data: [], encoding: { theta: { field: 't' }, color: { field: 'c' } } }),
    ).toEqual(['c']);
    expect(
      keyFields({
        type: 'heatmap',
        data: [],
        encoding: { x: { field: 'x' }, y: { field: 'y' }, color: { field: 'c' } },
      }),
    ).toEqual(['x', 'y']);
  });
});

describe('isSlicerType', () => {
  it('recognizes slicer types', () => {
    expect(isSlicerType('dropdown')).toBe(true);
    expect(isSlicerType('bar')).toBe(false);
  });
});

describe('wireViews — auto', () => {
  it('makes a slicer cross-filter the whole page, but not itself or other slicers', () => {
    const wired = wireViews(views(regionSlicer, barByRegion, scatterByCategory), 'auto');
    const [slicer, bar, scatter] = wired.map((v) => v.spec);
    // Slicer is untouched as a target.
    expect(slicer.filter).toBeUndefined();
    expect(slicer.highlight).toBeUndefined();
    // Every non-slicer view gets the slicer's filter (page-level filtering),
    // even the scatter that doesn't encode "region".
    expect(bar.filter).toEqual([{ param: 'region' }]);
    expect(scatter.filter).toEqual([{ param: 'region' }]);
  });

  it('injects a publish param on a pickable chart and cross-highlights views sharing its key field', () => {
    const wired = wireViews(views(barByRegion, lineByRegion, scatterByCategory), 'auto');
    const [bar, line, scatter] = wired.map((v) => v.spec);
    // Bar source param injected.
    expect(bar.params?.[0].name).toBe('__sel__v0');
    expect(bar.params?.[0].select).toMatchObject({ type: 'point', on: 'click', fields: ['region'] });
    // Bar highlights itself and the line (both use "region").
    expect(bar.highlight).toContainEqual({ param: '__sel__v0' });
    expect(line.highlight).toContainEqual({ param: '__sel__v0' });
    // Line also publishes its own param, which highlights bar + line.
    expect(line.params?.[0].name).toBe('__sel__v1');
    expect(bar.highlight).toContainEqual({ param: '__sel__v1' });
    // Scatter keys on "category"; it self-highlights but neither bar nor line
    // uses "category", so they don't cross-link to it (and it not to them).
    expect(scatter.highlight).toEqual([{ param: '__sel__v2' }]);
    expect(scatter.highlight).not.toContainEqual({ param: '__sel__v0' });
  });

  it('does not mutate the input specs', () => {
    const input = views(regionSlicer, barByRegion);
    const snapshot = JSON.stringify(input);
    wireViews(input, 'auto');
    expect(JSON.stringify(input)).toBe(snapshot);
  });
});

describe('wireViews — none', () => {
  it('lays out views without linking them', () => {
    const wired = wireViews(views(regionSlicer, barByRegion), 'none');
    for (const v of wired) {
      expect(v.spec.params).toBeUndefined();
      expect(v.spec.highlight).toBeUndefined();
      expect(v.spec.filter).toBeUndefined();
    }
  });
});

describe('wireViews — explicit links', () => {
  it('wires a source to named targets with the requested mode', () => {
    const links: InteractionLink[] = [{ source: 'v0', target: 'v1', as: 'filter' }];
    const wired = wireViews(views(barByRegion, lineByRegion), links);
    const [bar, line] = wired.map((v) => v.spec);
    expect(bar.params?.[0].name).toBe('__sel__v0');
    expect(line.filter).toEqual([{ param: '__sel__v0' }]);
    // Without an auto pass, bar shouldn't be highlighted by itself.
    expect(bar.highlight).toBeUndefined();
  });

  it('supports "*" targets and skips as:"none"', () => {
    const all: InteractionLink[] = [{ source: 'v0', target: '*' }];
    const wired = wireViews(views(barByRegion, lineByRegion, scatterByCategory), all);
    expect(wired[1].spec.highlight).toContainEqual({ param: '__sel__v0' });
    expect(wired[2].spec.highlight).toContainEqual({ param: '__sel__v0' });

    const none: InteractionLink[] = [{ source: 'v0', target: 'v1', as: 'none' }];
    const wired2 = wireViews(views(barByRegion, lineByRegion), none);
    expect(wired2[1].spec.highlight).toBeUndefined();
    expect(wired2[1].spec.filter).toBeUndefined();
  });

  it('honors a slicer source with a custom field set', () => {
    const links: InteractionLink[] = [{ source: 'v0', target: 'v1', fields: ['region'] }];
    const wired = wireViews(views(regionSlicer, barByRegion), links);
    // Slicer default consumption is 'filter'.
    expect(wired[1].spec.filter).toEqual([{ param: 'region' }]);
  });
});
