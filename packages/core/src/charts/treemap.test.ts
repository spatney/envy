// @vitest-environment jsdom
import { describe, it, expect, beforeAll } from 'vitest';
import { validateSpec } from '../spec/validate';
import type { ChartSpec, TreemapSpec } from '../spec/types';
import { resolveTheme } from '../theme';
import type { Surface } from '../render/surface';
import { drawTreemap, layoutTreemap } from './treemap';

beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = (() =>
    null) as typeof HTMLCanvasElement.prototype.getContext;
});

const data = [
  { group: 'Product', category: 'Platform', value: 60, score: 92 },
  { group: 'Product', category: 'Integrations', value: 25, score: 78 },
  { group: 'Services', category: 'Support', value: 15, score: 65 },
];

const treemapSpec = (over: Partial<TreemapSpec> = {}): TreemapSpec => ({
  type: 'treemap',
  data,
  encoding: {
    category: { field: 'category' },
    value: { field: 'value', format: ',.0f' },
    group: { field: 'group' },
  },
  ...over,
});

const errPaths = (spec: ChartSpec) => validateSpec(spec).errors.map((e) => e.path);

// --- Validation -----------------------------------------------------------

describe('validateSpec — treemap', () => {
  it('accepts a basic treemap', () => {
    expect(validateSpec(treemapSpec()).errors).toEqual([]);
  });

  it('requires encoding.value', () => {
    const spec = { ...treemapSpec(), encoding: { category: { field: 'category' } } } as unknown as ChartSpec;
    expect(errPaths(spec)).toContain('encoding.value');
  });

  it('requires encoding.category', () => {
    const spec = { ...treemapSpec(), encoding: { value: { field: 'value' } } } as unknown as ChartSpec;
    expect(errPaths(spec)).toContain('encoding.category');
  });
});

// --- Model geometry -------------------------------------------------------

describe('layoutTreemap', () => {
  it('keeps tiles inside the content rect with areas proportional to values', () => {
    const rect = { x: 16, y: 14, width: 568, height: 372 };
    const items = [
      { key: 'A', value: 60 },
      { key: 'B', value: 25 },
      { key: 'C', value: 15 },
    ];
    const nodes = layoutTreemap(items, rect);
    const contentArea = rect.width * rect.height;
    const area = (r: typeof rect) => r.width * r.height;

    expect(nodes).toHaveLength(3);
    for (const node of nodes) {
      expect(node.rect.x).toBeGreaterThanOrEqual(rect.x - 1e-6);
      expect(node.rect.y).toBeGreaterThanOrEqual(rect.y - 1e-6);
      expect(node.rect.x + node.rect.width).toBeLessThanOrEqual(rect.x + rect.width + 1e-6);
      expect(node.rect.y + node.rect.height).toBeLessThanOrEqual(rect.y + rect.height + 1e-6);
    }

    expect(nodes.reduce((sum, node) => sum + area(node.rect), 0)).toBeCloseTo(contentArea, 5);
    expect(area(nodes[0].rect)).toBeGreaterThan(area(nodes[1].rect));
    expect(area(nodes[1].rect)).toBeGreaterThan(area(nodes[2].rect));
    expect(area(nodes[0].rect) / contentArea).toBeCloseTo(0.6, 5);
  });

  it('squarifies into near-square tiles rather than full-width bands', () => {
    // Regression guard: a swapped row-orientation collapses every row into a
    // full-width band (aspect ratio ~= item count). Squarify must stay compact.
    const rect = { x: 0, y: 0, width: 300, height: 300 };
    const items = Array.from({ length: 9 }, (_, i) => ({ key: String(i), value: 1 }));
    const nodes = layoutTreemap(items, rect);
    const aspect = (r: typeof rect) => Math.max(r.width / r.height, r.height / r.width);
    const worstAspect = Math.max(...nodes.map((n) => aspect(n.rect)));
    expect(nodes).toHaveLength(9);
    expect(worstAspect).toBeLessThan(2.2);
  });
});

// --- End-to-end draw smoke ------------------------------------------------

function fakeContext(): { ctx: CanvasRenderingContext2D; calls: () => number } {
  let count = 0;
  const grad = { addColorStop() {} };
  const store: Record<string, unknown> = {
    canvas: { width: 600, height: 400 },
    createLinearGradient: () => grad,
    createRadialGradient: () => grad,
    measureText: (t: string) => ({ width: String(t).length * 6 }),
    setLineDash() {},
  };
  const ctx = new Proxy(store, {
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

describe('drawTreemap — smoke', () => {
  it('renders labels and exposes hover interactions', () => {
    const { ctx, calls } = fakeContext();
    const surface = {
      marks: { ctx },
      overlay: document.createElement('div'),
      width: 600,
      height: 400,
    } as unknown as Surface;

    const model = drawTreemap(surface, treemapSpec({ encoding: { category: { field: 'category' }, value: { field: 'value' } } }), resolveTheme('light'), {
      width: 600,
      height: 400,
    });

    expect(calls()).toBeGreaterThan(0);
    expect(surface.overlay.textContent ?? '').toContain('Platform');
    expect(model).toBeTruthy();
    const hover = model!.hitTest(300, 200);
    expect(hover).not.toBeNull();
    expect(hover!.content.title).toBe('Platform');
  });
});
