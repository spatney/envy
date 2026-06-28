// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from 'vitest';
import { render } from '../runtime/render';
import { validateSpec } from '../spec/validate';
import type { ChartSpec, PieSpec } from '../spec/types';
import type { Surface } from '../render/surface';
import { resolveTheme } from '../theme';
import { drawPie } from './pie';

beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = (() =>
    fakeContext().ctx) as typeof HTMLCanvasElement.prototype.getContext;
});

type Call = { name: string; args: unknown[] };

function fakeContext(): { ctx: CanvasRenderingContext2D; calls: Call[]; alphaSets: unknown[]; fillStyles: unknown[] } {
  const calls: Call[] = [];
  const alphaSets: unknown[] = [];
  const fillStyles: unknown[] = [];
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
        calls.push({ name: prop, args });
        return undefined;
      };
    },
    set(t, prop: string, value) {
      t[prop] = value;
      if (prop === 'globalAlpha') alphaSets.push(value);
      if (prop === 'fillStyle') fillStyles.push(value);
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, calls, alphaSets, fillStyles };
}

const rows = [
  { category: 'A', value: 40 },
  { category: 'B', value: 30 },
  { category: 'C', value: 20 },
  { category: 'D', value: 10 },
];

const pieSpec = (over: Partial<PieSpec> = {}): PieSpec => ({
  type: 'pie',
  data: rows,
  encoding: {
    theta: { field: 'value', format: ',.0f', title: 'Sales' },
    color: { field: 'category' },
  },
  dimensions: { width: 640, height: 420 },
  animation: false,
  ...over,
});

function makeSurface(ctx: CanvasRenderingContext2D): Surface {
  return {
    marks: { ctx },
    overlay: document.createElement('div'),
    width: 640,
    height: 420,
  } as unknown as Surface;
}

describe('validateSpec — pie', () => {
  it('accepts a basic pie and rejects missing required channels', () => {
    expect(validateSpec(pieSpec()).errors).toEqual([]);
    const bad = { type: 'pie', data: rows, encoding: { theta: { field: 'value' } } } as unknown as ChartSpec;
    expect(validateSpec(bad).errors.map((e) => e.path)).toContain('encoding.color');
  });
});

describe('drawPie', () => {
  it('draws one positive slice per category, aggregates repeated rows, and exposes hit testing', () => {
    const { ctx, calls } = fakeContext();
    const surface = makeSurface(ctx);
    const interaction = drawPie(
      surface,
      pieSpec({ data: [...rows, { category: 'A', value: 5 }, { category: 'Z', value: 0 }, { category: 'N', value: -3 }] }),
      resolveTheme('light'),
      { width: 640, height: 420 },
    );

    expect(calls.filter((c) => c.name === 'fill')).toHaveLength(4);
    expect(surface.overlay.textContent).toContain('A');
    expect(surface.overlay.textContent).toContain('B');
    expect(surface.overlay.textContent).not.toContain('Z');
    const hover = interaction?.hitTest(320, 70);
    expect(hover?.content.title).toBe('A');
    expect(hover?.content.rows[0]?.value).toBe('45');
    expect(interaction?.pick?.(320, 70)).toEqual({ kind: 'point', fields: ['category'], tuples: [['A']] });
  });

  it('renders a donut center total and respects explicit labels=false', () => {
    const { ctx } = fakeContext();
    const surface = makeSurface(ctx);

    drawPie(surface, pieSpec({ donut: 0.5, labels: false }), resolveTheme('light'), { width: 640, height: 420 });

    const text = surface.overlay.textContent ?? '';
    expect(text).toContain('Sales');
    expect(text).toContain('100');
    expect(text).not.toContain('40%');
  });

  it('creates outside callout labels for many small slices with muted connectors', () => {
    const many = Array.from({ length: 16 }, (_, i) => ({ category: `Slice ${i + 1}`, value: i === 0 ? 50 : 1 }));
    const { ctx, calls } = fakeContext();
    const surface = makeSurface(ctx);

    drawPie(
      surface,
      pieSpec({
        data: many,
        labels: { placement: 'auto', content: 'category-percent', minShare: 0, connector: 'muted' },
        legend: false,
      }),
      resolveTheme('light'),
      { width: 640, height: 420 },
    );

    expect(surface.overlay.textContent).toContain('Slice 16');
    expect(calls.filter((c) => c.name === 'lineTo').length).toBeGreaterThan(0);
  });

  it('applies dimming from emphasis and handles a single-slice pie', () => {
    const { ctx, alphaSets } = fakeContext();
    const surface = makeSurface(ctx);

    const interaction = drawPie(
      surface,
      pieSpec({ data: [{ category: 'Only', value: 5 }], labels: { placement: 'inside', content: 'category-value' } }),
      resolveTheme('light'),
      { width: 640, height: 420 },
      { emphasis: { dim: 0.2, match: (row) => row.category === 'Other' } },
    );

    expect(alphaSets).toContain(0.2);
    expect(surface.overlay.textContent).toContain('Only');
    expect(interaction?.hitTest(320, 70)?.content.rows[1]?.value).toBe('100.0%');
  });

  it('shows a no-data message when all values are zero, negative, or invalid', () => {
    const { ctx } = fakeContext();
    const surface = makeSurface(ctx);

    drawPie(
      surface,
      pieSpec({ data: [{ category: 'A', value: 0 }, { category: 'B', value: -5 }, { category: 'C', value: 'n/a' }] }),
      resolveTheme('light'),
      { width: 640, height: 420 },
    );

    expect(surface.overlay.textContent).toContain('No positive values');
  });
});

describe('render — pie end to end', () => {
  it('mounts, reports, updates, and destroys a pie chart', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const inst = render(container, pieSpec({ title: 'Share', labels: { placement: 'outside', content: 'category-value' } }));

    expect(container.textContent).toContain('Share');
    expect(container.textContent).toContain('A');
    expect(inst.report().ok).toBe(true);

    inst.update(pieSpec({ data: [{ category: 'New', value: 1 }], legend: false }));
    expect(container.textContent).toContain('New');
    inst.destroy();
    expect(container.querySelector('.graphein-root')).toBeNull();
  });
});
