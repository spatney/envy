import { describe, it, expect } from 'vitest';
import { createSelectionStore } from '../../interaction/store';
import type { RenderContext } from '../index';
import type { BaseSlicerSpec } from '../../spec/types';
import {
  slicerParam,
  slicerLabel,
  slicerSource,
  slicerOptions,
  currentValue,
  publish,
} from './common';

const base = (over: Partial<BaseSlicerSpec> = {}): BaseSlicerSpec =>
  ({ type: 'dropdown', field: 'region', ...over } as BaseSlicerSpec);

describe('slicer common helpers', () => {
  it('slicerParam defaults to field, prefers explicit param', () => {
    expect(slicerParam(base())).toBe('region');
    expect(slicerParam(base({ param: 'r' }))).toBe('r');
  });

  it('slicerLabel resolves label > title > field', () => {
    expect(slicerLabel(base())).toBe('region');
    expect(slicerLabel(base({ title: 'By region' }))).toBe('By region');
    expect(slicerLabel(base({ title: { text: 'Region' } }))).toBe('Region');
    expect(slicerLabel(base({ label: 'Pick', title: 'X' }))).toBe('Pick');
  });

  it('slicerSource prefers context.sourceData over spec.data', () => {
    const spec = base({ data: [{ region: 'A' }] });
    const ctx = { sourceData: [{ region: 'B' }, { region: 'C' }] } as RenderContext;
    expect(slicerSource(spec, ctx)).toHaveLength(2);
    expect(slicerSource(spec)).toEqual([{ region: 'A' }]);
    expect(slicerSource(base())).toEqual([]);
  });

  it('slicerOptions returns distinct field values from the source', () => {
    const spec = base();
    const ctx = {
      sourceData: [{ region: 'West' }, { region: 'East' }, { region: 'West' }],
    } as RenderContext;
    expect(slicerOptions(spec, ctx)).toEqual(['West', 'East']);
  });

  it('currentValue / publish round-trip through the store', () => {
    const store = createSelectionStore();
    const ctx = { store } as RenderContext;
    const spec = base({ param: 'region' });
    expect(currentValue(spec, ctx)).toBeNull();

    publish(spec, ctx, { kind: 'set', field: 'region', values: ['West'] });
    expect(currentValue(spec, ctx)).toEqual({ kind: 'set', field: 'region', values: ['West'] });
    expect(store.get('region')).not.toBeNull();

    publish(spec, ctx, null);
    expect(currentValue(spec, ctx)).toBeNull();
  });

  it('publish is a no-op without a store', () => {
    expect(() => publish(base(), undefined, null)).not.toThrow();
    expect(() => publish(base(), {} as RenderContext, null)).not.toThrow();
  });
});
