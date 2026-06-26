/**
 * Text measurement using a shared offscreen canvas context. Falls back to a
 * rough heuristic when no canvas is available (SSR/test).
 */

let measureCtx: CanvasRenderingContext2D | null | undefined;

function getMeasureCtx(): CanvasRenderingContext2D | null {
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
