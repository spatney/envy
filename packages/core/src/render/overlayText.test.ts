// @vitest-environment jsdom
import { describe, it, expect, beforeAll } from 'vitest';
import { resolveTheme } from '../theme';
import type { LineSpec } from '../spec/types';
import type { Surface } from './surface';
import { buildCartesianModel } from '../runtime/cartesian';
import { drawOverlay } from '../axes';
import { addOverlayText, drawCategoricalLegend } from '../charts/chrome';
import { fontString } from './text';
import { overlayTextToCanvasCmd, paintCanvasText, legendSwatchWidth } from './overlayText';

// Stub canvas so layout's measureText uses its deterministic heuristic.
beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = (() =>
    null) as typeof HTMLCanvasElement.prototype.getContext;
});

interface RecordedText {
  text: string;
  x: number;
  y: number;
  align: string;
  baseline: string;
  rotation: number;
}

/** A 2D-context stand-in that records `fillText` calls and the active state. */
function recordingCtx() {
  const texts: RecordedText[] = [];
  let fills = 0;
  const state = { font: '', textAlign: 'left', textBaseline: 'alphabetic', rotation: 0, alpha: 1 };
  const stack: (typeof state)[] = [];
  const api: Record<string, unknown> = {
    canvas: { width: 640, height: 400 },
    set font(v: string) {
      state.font = v;
    },
    get font() {
      return state.font;
    },
    set textAlign(v: string) {
      state.textAlign = v;
    },
    get textAlign() {
      return state.textAlign;
    },
    set textBaseline(v: string) {
      state.textBaseline = v;
    },
    get textBaseline() {
      return state.textBaseline;
    },
    save: () => {
      stack.push({ ...state });
    },
    restore: () => {
      const s = stack.pop();
      if (s) Object.assign(state, s);
    },
    translate: () => {},
    rotate: (a: number) => {
      state.rotation += a;
    },
    measureText: (t: string) => ({ width: String(t).length * 6 }),
    fillText: (text: string, x: number, y: number) => {
      fills++;
      texts.push({
        text,
        x,
        y,
        align: state.textAlign,
        baseline: state.textBaseline,
        rotation: state.rotation,
      });
    },
    beginPath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    quadraticCurveTo: () => {},
    arc: () => {},
    closePath: () => {},
    fill: () => {
      fills++;
    },
    stroke: () => {},
    setLineDash: () => {},
  };
  const ctx = new Proxy(api, {
    get(t, p: string) {
      if (p in t) return t[p];
      return () => undefined;
    },
    set(t, p: string, v) {
      t[p] = v;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, texts, fillCount: () => fills };
}

function headlessSurface(ctx: CanvasRenderingContext2D, overlay: HTMLElement): Surface {
  return { headless: true, marks: { ctx }, overlay, width: 640, height: 400 } as unknown as Surface;
}

// --- Pure mapping ---------------------------------------------------------

describe('overlayTextToCanvasCmd — transform vocabulary', () => {
  const font = fontString(12, 'Inter', 400);

  it('maps a left/top box with width+align to canvas align + top baseline', () => {
    const c = overlayTextToCanvasCmd(
      { left: 10, top: 20, width: 100, text: 'T', color: '#000', size: 12, align: 'right' },
      font,
    );
    expect(c.align).toBe('right');
    expect(c.baseline).toBe('top');
    expect(c.x).toBe(110); // left + width for right-align
    expect(c.y).toBe(20);
  });

  it('maps translateX(-50%) to centered', () => {
    const c = overlayTextToCanvasCmd(
      { left: 50, top: 5, text: 'T', color: '#000', size: 12, transform: 'translateX(-50%)' },
      font,
    );
    expect(c.align).toBe('center');
    expect(c.baseline).toBe('top');
    expect(c.x).toBe(50);
  });

  it('maps translateX(-100%) to right-anchored', () => {
    const c = overlayTextToCanvasCmd(
      { left: 80, top: 5, text: 'T', color: '#000', size: 12, transform: 'translateX(-100%)' },
      font,
    );
    expect(c.align).toBe('right');
  });

  it('maps translateY(-50%) to middle baseline', () => {
    const c = overlayTextToCanvasCmd(
      { left: 0, top: 40, width: 30, text: 'T', color: '#000', size: 12, align: 'right', transform: 'translateY(-50%)' },
      font,
    );
    expect(c.align).toBe('right');
    expect(c.baseline).toBe('middle');
  });

  it('maps translate(-50%,-50%) rotate(-90deg) to centered/middle and rotated', () => {
    const c = overlayTextToCanvasCmd(
      { left: 8, top: 100, text: 'Y', color: '#000', size: 13, transform: 'translate(-50%, -50%) rotate(-90deg)' },
      font,
    );
    expect(c.align).toBe('center');
    expect(c.baseline).toBe('middle');
    expect(c.rotate).toBeCloseTo(-Math.PI / 2);
  });

  it('maps rotate(90deg) to +90°', () => {
    const c = overlayTextToCanvasCmd(
      { left: 8, top: 100, text: 'Y', color: '#000', size: 13, transform: 'translate(-50%, -50%) rotate(90deg)' },
      font,
    );
    expect(c.rotate).toBeCloseTo(Math.PI / 2);
  });

  it('maps a right-anchored diagonal rotate(-45deg) to right align + 45° lean', () => {
    const c = overlayTextToCanvasCmd(
      { left: 120, top: 200, text: 'September', color: '#000', size: 12, transform: 'translateX(-100%) rotate(-45deg)' },
      font,
    );
    expect(c.align).toBe('right');
    expect(c.baseline).toBe('top');
    expect(c.rotate).toBeCloseTo(-Math.PI / 4);
  });

  it('sizes the line-symbol footprint wider than square/circle', () => {
    expect(legendSwatchWidth('line')).toBe(14);
    expect(legendSwatchWidth('square')).toBe(11);
    expect(legendSwatchWidth('circle')).toBe(11);
  });
});

// --- paintCanvasText ------------------------------------------------------

describe('paintCanvasText', () => {
  it('sets align/baseline/font and records the text', () => {
    const { ctx, texts } = recordingCtx();
    paintCanvasText(ctx, {
      x: 30,
      y: 40,
      text: 'Hi',
      font: fontString(12, 'Inter', 400),
      color: '#222',
      size: 12,
      align: 'center',
      baseline: 'middle',
    });
    expect(texts).toHaveLength(1);
    expect(texts[0]).toMatchObject({ text: 'Hi', x: 30, y: 40, align: 'center', baseline: 'middle' });
  });

  it('applies rotation around the anchor', () => {
    const { ctx, texts } = recordingCtx();
    paintCanvasText(ctx, {
      x: 10,
      y: 90,
      text: 'Rot',
      font: fontString(12, 'Inter', 400),
      color: '#222',
      size: 12,
      rotate: -Math.PI / 2,
    });
    expect(texts[0].rotation).toBeCloseTo(-Math.PI / 2);
  });

  it('draws a pill background before the text', () => {
    const { ctx, texts, fillCount } = recordingCtx();
    paintCanvasText(ctx, {
      x: 10,
      y: 10,
      text: 'Pill',
      font: fontString(12, 'Inter', 400),
      color: '#fff',
      size: 12,
      pill: { background: '#000' },
    });
    expect(texts).toHaveLength(1);
    // One fill for the pill path + the fillText for the glyphs.
    expect(fillCount()).toBeGreaterThanOrEqual(2);
  });
});

// --- Headless cartesian overlay ------------------------------------------

const lineSpec: LineSpec = {
  type: 'line',
  data: [
    { m: '2024-01', region: 'East', v: 3 },
    { m: '2024-02', region: 'East', v: 5 },
    { m: '2024-01', region: 'West', v: 2 },
    { m: '2024-02', region: 'West', v: 6 },
  ],
  encoding: {
    x: { field: 'm', type: 'temporal' },
    y: { field: 'v', title: 'Value' },
    series: { field: 'region' },
  },
  title: 'Revenue',
};

describe('drawOverlay — headless paints text to canvas (no DOM)', () => {
  it('paints title, axis title, and legend labels onto the marks canvas', () => {
    const model = buildCartesianModel(lineSpec, resolveTheme(), { width: 640, height: 400 });
    const { ctx, texts } = recordingCtx();
    const overlay = document.createElement('div');
    drawOverlay(headlessSurface(ctx, overlay), model);

    const all = texts.map((t) => t.text);
    expect(all).toContain('Revenue'); // chart title
    expect(all).toContain('Value'); // y-axis title
    expect(all).toContain('East'); // legend
    expect(all).toContain('West');
    // The HTML overlay stays empty in headless mode.
    expect(overlay.childElementCount).toBe(0);
  });

  it('rotates the y-axis title and right-aligns y tick labels', () => {
    const model = buildCartesianModel(lineSpec, resolveTheme(), { width: 640, height: 400 });
    const { ctx, texts } = recordingCtx();
    drawOverlay(headlessSurface(ctx, document.createElement('div')), model);

    const yTitle = texts.find((t) => t.text === 'Value');
    expect(yTitle?.rotation).toBeCloseTo(-Math.PI / 2);
    expect(yTitle?.align).toBe('center');

    // y tick labels are right-aligned + vertically centered.
    const tickLabel = model.yTicks[0]?.label;
    const tick = texts.find((t) => t.text === tickLabel);
    expect(tick?.align).toBe('right');
    expect(tick?.baseline).toBe('middle');
  });

  it('keeps using the DOM overlay when not headless', () => {
    const model = buildCartesianModel(lineSpec, resolveTheme(), { width: 640, height: 400 });
    const { ctx, texts } = recordingCtx();
    const overlay = document.createElement('div');
    const surface = { headless: false, marks: { ctx }, overlay, width: 640, height: 400 } as unknown as Surface;
    drawOverlay(surface, model);
    expect(overlay.childElementCount).toBeGreaterThan(0);
    expect(texts).toHaveLength(0); // nothing painted to canvas
  });
});

// --- Headless chrome (custom charts) -------------------------------------

describe('chrome — headless text + legend', () => {
  it('addOverlayText paints to canvas and returns no DOM node', () => {
    const { ctx, texts } = recordingCtx();
    const node = addOverlayText(headlessSurface(ctx, document.createElement('div')), resolveTheme(), {
      left: 16,
      top: 14,
      text: 'Sales by region',
      color: '#111',
      size: 16,
    });
    expect(node).toBeNull();
    expect(texts.map((t) => t.text)).toContain('Sales by region');
  });

  it('drawCategoricalLegend paints swatches + labels and reserves the same rect', () => {
    const overlay = document.createElement('div');
    const { ctx, texts } = recordingCtx();
    const area = { x: 0, y: 0, width: 400, height: 300 };
    const entries = [
      { label: 'Alpha', color: '#4f46e5', symbol: 'square' as const },
      { label: 'Beta', color: '#06b6d4', symbol: 'circle' as const },
    ];
    const headlessRect = drawCategoricalLegend(headlessSurface(ctx, overlay), resolveTheme(), area, entries, 'right');
    expect(texts.map((t) => t.text)).toEqual(expect.arrayContaining(['Alpha', 'Beta']));
    expect(overlay.childElementCount).toBe(0);

    // The reserved content rect matches the DOM path exactly.
    const domSurface = { headless: false, marks: { ctx }, overlay: document.createElement('div'), width: 640, height: 400 } as unknown as Surface;
    const domRect = drawCategoricalLegend(domSurface, resolveTheme(), area, entries, 'right');
    expect(headlessRect).toEqual(domRect);
  });
});
