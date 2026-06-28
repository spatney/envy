/**
 * `@graphein/node` — headless Graphein rendering for Node.
 *
 * Render any canvas-backed {@link ChartSpec} to a PNG buffer **and** its
 * {@link RenderReport} with no browser and no JSDOM, so the whole
 * generate → validate → render → critique loop can run server-side (CI, agents,
 * email/PDF report assets). It wires `graphein`'s dependency-free
 * `renderToContext` to `@napi-rs/canvas`; the core engine stays zero-dependency.
 *
 * ```ts
 * import { renderChart } from '@graphein/node';
 * const { png, report } = renderChart(spec, { width: 900, height: 480, dpr: 2 });
 * if (!report.ok) console.warn(report.diagnostics);
 * await fs.writeFile('chart.png', png);
 * ```
 */

import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import { renderToContext, setMeasureContext, type ChartSpec, type RenderReport } from 'graphein';

/** A font file to register before rendering, improving text fidelity. */
export interface FontFace {
  /** Absolute path to a `.ttf` / `.otf` / `.woff` file. */
  path: string;
  /**
   * The family name to register the font under. Match this to the family your
   * theme uses (Graphein's default is `Inter`) so text renders in that face.
   */
  family: string;
}

/** Options for {@link renderChart} / {@link renderToPNG}. */
export interface RenderImageOptions {
  /** Logical width in CSS pixels. Default `800`. */
  width?: number;
  /** Logical height in CSS pixels. Default `500`. */
  height?: number;
  /**
   * Device pixel ratio. The PNG is rasterized at `width * dpr × height * dpr`
   * for crisp output. Default `2`.
   */
  dpr?: number;
  /** Extra fonts to register before rendering. */
  fonts?: FontFace[];
}

/** The result of a headless render: the PNG bytes plus the render report. */
export interface NodeRenderResult {
  /** PNG-encoded image bytes. */
  png: Buffer;
  /**
   * The same machine-readable diagnostics as `instance.report()` in the
   * browser — `ok`, mark/series/color counts, and any clipping / overlap /
   * contrast warnings. Lets an agent critique the chart with no vision model.
   */
  report: RenderReport;
  /** Pixel width of the PNG (`width * dpr`, rounded). */
  width: number;
  /** Pixel height of the PNG (`height * dpr`, rounded). */
  height: number;
}

const DEFAULT_WIDTH = 800;
const DEFAULT_HEIGHT = 500;
const DEFAULT_DPR = 2;

function registerFonts(fonts: FontFace[] | undefined): void {
  if (!fonts) return;
  for (const f of fonts) {
    try {
      GlobalFonts.registerFromPath(f.path, f.family);
    } catch {
      // An unreadable font path is non-fatal — napi falls back to a system sans.
    }
  }
}

/**
 * Render `spec` to a PNG buffer and its {@link RenderReport}, entirely in Node.
 *
 * Supports every canvas-backed chart (line, area, bar, scatter, box, pie,
 * heatmap, sankey, choropleth, combo, histogram, funnel). DOM-only kinds
 * (`kpi`, `table`, `matrix`, slicers, `dashboard`) have no canvas form and throw.
 */
export function renderChart(spec: ChartSpec, options: RenderImageOptions = {}): NodeRenderResult {
  const width = options.width ?? DEFAULT_WIDTH;
  const height = options.height ?? DEFAULT_HEIGHT;
  const dpr = options.dpr ?? DEFAULT_DPR;

  registerFonts(options.fonts);

  const pxW = Math.max(1, Math.round(width * dpr));
  const pxH = Math.max(1, Math.round(height * dpr));

  const canvas = createCanvas(pxW, pxH);
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  // A dedicated 1×1 context for text measurement so layout uses real font
  // metrics (not the SSR heuristic) without mutating the drawing context.
  const measureCtx = createCanvas(1, 1).getContext('2d');

  // The interaction layer is unused on the static path; give it its own canvas
  // so a stray hover-layer paint can never land on the marks canvas.
  const interactionCtx = createCanvas(pxW, pxH).getContext('2d');
  interactionCtx.scale(dpr, dpr);

  setMeasureContext(measureCtx as unknown as CanvasRenderingContext2D);
  let report: RenderReport;
  try {
    report = renderToContext(
      {
        marks: ctx as unknown as CanvasRenderingContext2D,
        interaction: interactionCtx as unknown as CanvasRenderingContext2D,
        width,
        height,
      },
      spec,
    );
  } finally {
    setMeasureContext(null);
  }

  return { png: canvas.toBuffer('image/png'), report, width: pxW, height: pxH };
}

/**
 * Convenience wrapper around {@link renderChart} that returns only the PNG bytes.
 */
export function renderToPNG(spec: ChartSpec, options?: RenderImageOptions): Buffer {
  return renderChart(spec, options).png;
}

/** Re-exported so callers can register fonts globally without a second dep. */
export { GlobalFonts };
export type { ChartSpec, RenderReport } from 'graphein';

export const VERSION = '0.3.0';
