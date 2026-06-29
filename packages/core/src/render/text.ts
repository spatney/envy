/**
 * Text measurement using a shared offscreen canvas context. Falls back to a
 * rough heuristic when no canvas is available (SSR/test). In a non-DOM
 * environment (e.g. `@graphein/node`) a real 2D context can be injected via
 * {@link setMeasureContext} so layout uses true font metrics.
 */

let measureCtx: CanvasRenderingContext2D | null | undefined;
let injectedCtx: CanvasRenderingContext2D | null = null;

/**
 * Provide a 2D context used to measure text advance widths when no DOM is
 * available (headless rendering). Pass `null` to clear and fall back to the
 * DOM canvas / heuristic. The context's `font` is overwritten on each measure,
 * so use a dedicated measurement context rather than your drawing context.
 */
export function setMeasureContext(ctx: CanvasRenderingContext2D | null): void {
  injectedCtx = ctx;
}

function getMeasureCtx(): CanvasRenderingContext2D | null {
  if (injectedCtx) return injectedCtx;
  if (measureCtx !== undefined) return measureCtx;
  try {
    measureCtx = document.createElement('canvas').getContext('2d');
  } catch {
    measureCtx = null;
  }
  return measureCtx;
}

export interface TextMetricsLite {
  width: number;
}

/** Measure the advance width of `text` rendered with the given CSS `font`. */
export function measureText(text: string, font: string): TextMetricsLite {
  const ctx = getMeasureCtx();
  if (!ctx) {
    // Heuristic: ~0.55em per character at the parsed pixel size.
    const sizeMatch = /(\d+(?:\.\d+)?)px/.exec(font);
    const size = sizeMatch ? parseFloat(sizeMatch[1]) : 12;
    return { width: text.length * size * 0.55 };
  }
  ctx.font = font;
  return { width: ctx.measureText(text).width };
}

/** Build a CSS font shorthand string. */
export function fontString(
  size: number,
  family: string,
  weight: number | string = 400,
  style = 'normal',
): string {
  return `${style} ${weight} ${size}px ${family}`;
}

/**
 * Truncate `text` with a trailing ellipsis so it fits within `maxWidth` px when
 * drawn in the given CSS `font`. Returns the original string if it already fits,
 * or an empty string if not even the ellipsis fits.
 */
export function ellipsize(text: string, maxWidth: number, font: string): string {
  if (maxWidth <= 0 || text.length === 0) return '';
  if (measureText(text, font).width <= maxWidth) return text;
  const ellipsis = '…';
  const ellipsisW = measureText(ellipsis, font).width;
  if (ellipsisW > maxWidth) return '';
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (measureText(text.slice(0, mid) + ellipsis, font).width <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return text.slice(0, lo) + ellipsis;
}
