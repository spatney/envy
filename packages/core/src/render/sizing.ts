/**
 * Pure sizing math for hi-DPI canvases (no DOM — unit testable).
 */

export interface BackingSize {
  /** Logical CSS pixel width. */
  cssWidth: number;
  /** Logical CSS pixel height. */
  cssHeight: number;
  /** Backing-store (device) pixel width. */
  pixelWidth: number;
  /** Backing-store (device) pixel height. */
  pixelHeight: number;
  /** Effective device pixel ratio used. */
  dpr: number;
}

/**
 * Compute the backing-store pixel size for a canvas of the given CSS size at a
 * device pixel ratio. Backing dimensions are at least 1px so the canvas stays valid.
 */
export function computeBackingSize(width: number, height: number, dpr: number): BackingSize {
  const d = dpr > 0 ? dpr : 1;
  const cssWidth = Math.max(0, width);
  const cssHeight = Math.max(0, height);
  return {
    cssWidth,
    cssHeight,
    pixelWidth: Math.max(1, Math.round(cssWidth * d)),
    pixelHeight: Math.max(1, Math.round(cssHeight * d)),
    dpr: d,
  };
}
