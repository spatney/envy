// @vitest-environment jsdom
import { describe, it, expect, beforeAll } from 'vitest';
import { validateSpec } from '../spec/validate';
import type { ChartSpec, SankeySpec } from '../spec/types';
import { resolveTheme } from '../theme';
import type { Rect } from '../types';
import type { Surface } from '../render/surface';
import { buildSankeyLayout, drawSankey } from './sankey';

beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = (() =>
    null) as typeof HTMLCanvasElement.prototype.getContext;
});

const sankeySpec = (data: Record<string, unknown>[], over: Partial<SankeySpec> = {}): SankeySpec => ({
  type: 'sankey',
  data,
  encoding: {
    source: { field: 'source' },
    target: { field: 'target' },
    value: { field: 'value' },
  },
  ...over,
});

const area: Rect = { x: 10, y: 20, width: 300, height: 120 };
const palette = resolveTheme('light').color.palette;
const errPaths = (spec: ChartSpec) => validateSpec(spec).errors.map((e) => e.path);

function expectFiniteInBounds(spec: SankeySpec, rect = area) {
  const graph = buildSankeyLayout(spec, palette, rect);
  expect(graph.nodes.length).toBeGreaterThan(0);
  for (const node of graph.nodes) {
    for (const v of [node.x0, node.x1, node.y0, node.y1]) expect(Number.isFinite(v)).toBe(true);
    expect(node.x0).toBeGreaterThanOrEqual(rect.x - 1e-6);
    expect(node.x1).toBeLessThanOrEqual(rect.x + rect.width + 1e-6);
    expect(node.y0).toBeGreaterThanOrEqual(rect.y - 1e-6);
    expect(node.y1).toBeLessThanOrEqual(rect.y + rect.height + 1e-6);
    expect(node.y1).toBeGreaterThanOrEqual(node.y0);
  }
  for (const link of graph.links) {
    expect(link.source.layer).toBeLessThan(link.target.layer);
    expect(link.source.x1).toBeLessThanOrEqual(link.target.x0 + 1e-6);
  }
  return graph;
}

describe('validateSpec — sankey', () => {
  it('accepts a basic sankey', () => {
    expect(validateSpec(sankeySpec([{ source: 'A', target: 'B', value: 1 }])).errors).toEqual([]);
  });

  it('requires source, target, and value channels', () => {
    const spec = { ...sankeySpec([]), encoding: {} } as unknown as ChartSpec;
    const paths = errPaths(spec);
    expect(paths).toContain('encoding.source');
    expect(paths).toContain('encoding.target');
    expect(paths).toContain('encoding.value');
  });
});

describe('buildSankeyLayout', () => {
  it('lays out an acyclic graph with finite in-bounds geometry', () => {
    const graph = expectFiniteInBounds(
      sankeySpec([
        { source: 'A', target: 'B', value: 8 },
        { source: 'A', target: 'C', value: 4 },
        { source: 'B', target: 'D', value: 5 },
      ]),
    );
    expect(graph.maxLayer).toBeGreaterThan(0);
  });

  it('terminates on cycles by ignoring feedback edges for layout', () => {
    const graph = expectFiniteInBounds(
      sankeySpec([
        { source: 'A', target: 'B', value: 10 },
        { source: 'B', target: 'C', value: 5 },
        { source: 'C', target: 'B', value: 1 },
      ]),
    );
    expect(graph.nodes.map((n) => [n.name, n.layer])).toEqual([
      ['A', 0],
      ['B', 1],
      ['C', 2],
    ]);
    expect(graph.links.map((l) => `${l.source.name}->${l.target.name}`)).toEqual(['A->B', 'B->C']);
  });

  it('shrinks dense columns to stay inside a small content height', () => {
    const rows = Array.from({ length: 30 }, (_, i) => ({
      source: `S${i}`,
      target: `T${i}`,
      value: 1,
    }));
    expectFiniteInBounds(sankeySpec(rows, { nodePadding: 14 }), { x: 0, y: 0, width: 180, height: 40 });
  });
});

function fakeContext(): { ctx: CanvasRenderingContext2D; calls: () => number } {
  let count = 0;
  const grad = { addColorStop() {} };
  const store: Record<string, unknown> = {
    canvas: { width: 640, height: 400 },
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

describe('drawSankey — smoke', () => {
  it('renders and hit-tests a node', () => {
    const { ctx, calls } = fakeContext();
    const surface = {
      marks: { ctx },
      overlay: document.createElement('div'),
      width: 640,
      height: 400,
    } as unknown as Surface;

    const model = drawSankey(
      surface,
      sankeySpec([
        { source: 'A', target: 'B', value: 10 },
        { source: 'B', target: 'C', value: 5 },
      ]),
      resolveTheme('light'),
      { width: 640, height: 400 },
    );

    expect(calls()).toBeGreaterThan(0);
    expect(surface.overlay.textContent ?? '').toContain('A');
    expect(model).toBeTruthy();
    expect(model!.hitTest(40, 200)?.content.title).toBe('A');
  });
});
