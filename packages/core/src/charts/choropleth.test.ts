// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from 'vitest';
import { withAlpha } from '../color';
import type { Surface } from '../render/surface';
import type { ChoroplethSpec, GeoFeatureCollection } from '../spec/types';
import { validateSpec } from '../spec/validate';
import { resolveTheme } from '../theme';
import { drawChoropleth } from './choropleth';

beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = (() =>
    null) as typeof HTMLCanvasElement.prototype.getContext;
});

function fakeContext(): { ctx: CanvasRenderingContext2D; calls: () => number } {
  let count = 0;
  const grad = { addColorStop() {} };
  const data: Record<string, unknown> = {
    canvas: { width: 640, height: 400 },
    createLinearGradient: () => grad,
    createRadialGradient: () => grad,
    measureText: (t: string) => ({ width: String(t).length * 6 }),
    setLineDash() {},
  };
  const ctx = new Proxy(data, {
    get(t, prop: string) {
      if (prop in t) return t[prop];
      return (...args: unknown[]) => {
        void args;
        count++;
        return undefined;
      };
    },
    set() {
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, calls: () => count };
}

const geo: GeoFeatureCollection = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      id: 'matched-id',
      properties: { name: 'Matched', fips: '001' },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 1],
            [0, 0],
          ],
        ],
      },
    },
    {
      type: 'Feature',
      id: 'fallback-id',
      properties: { name: 'Fallback' },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [2, 0],
            [3, 0],
            [3, 1],
            [2, 1],
            [2, 0],
          ],
        ],
      },
    },
  ],
};

const choroSpec = (): ChoroplethSpec => ({
  type: 'choropleth',
  data: [
    { code: '001', metric: 10 },
    { code: 'fallback-id', metric: 99 },
  ],
  geo,
  featureId: 'fips',
  projection: 'identity',
  encoding: {
    key: { field: 'code' },
    color: { field: 'metric' },
  },
});

function draw(spec: ChoroplethSpec) {
  const { ctx, calls } = fakeContext();
  const surface = {
    marks: { ctx },
    overlay: document.createElement('div'),
    width: 640,
    height: 400,
  } as unknown as Surface;
  const interaction = drawChoropleth(surface, spec, resolveTheme('light'), { width: 640, height: 400 });
  return { interaction, calls };
}

function findFeature(
  interaction: NonNullable<ReturnType<typeof drawChoropleth>>,
  title: string,
) {
  for (let x = interaction.region.x; x <= interaction.region.x + interaction.region.width; x += 8) {
    for (let y = interaction.region.y; y <= interaction.region.y + interaction.region.height; y += 8) {
      const hit = interaction.hitTest(x, y);
      if (hit?.content.title === title) return hit;
    }
  }
  return null;
}

describe('choropleth explicit featureId joins', () => {
  it('validates and draws a tiny identity-projected choropleth', () => {
    const spec = choroSpec();
    expect(validateSpec(spec).errors).toEqual([]);
    const { interaction, calls } = draw(spec);
    expect(calls()).toBeGreaterThan(0);
    expect(interaction).toBeTruthy();
  });

  it('does not fall back to feature id/name when an explicit featureId property is missing', () => {
    const { interaction } = draw(choroSpec());
    const matched = findFeature(interaction!, 'Matched');
    const missingFips = findFeature(interaction!, 'Fallback');
    const noDataFill = withAlpha(resolveTheme('light').color.textMuted, 0.14);

    expect(matched?.content.rows[0].value).toBe('10');
    expect(matched?.content.rows[0].swatch).not.toBe(noDataFill);
    expect(missingFips?.content.rows[0].value).toBe('no data');
    expect(missingFips?.content.rows[0].swatch).toBe(noDataFill);
    expect(missingFips?.content.rows[0].value).not.toBe('99');
  });
});
