/**
 * Web-font readiness helpers.
 *
 * Charts measure text (via a canvas context) to size axis gutters, legends, and
 * titles. A chart drawn *before* its web font finishes loading is measured with
 * fallback-font metrics, so its layout is slightly off until it re-lays-out once
 * the real font arrives. The runtime uses these helpers to detect that case and
 * schedule a single corrective redraw.
 *
 * The CSS Font Loading API (`document.fonts`) only tracks fonts that have already
 * been *requested*. Fonts are requested lazily on first use, so a chart triggers
 * its font's load when it first measures/paints text — which is exactly when the
 * runtime arms `onFontsReady`. All functions are safe no-ops in environments
 * without the API (Node/SSR/older browsers).
 */

function fontFaceSet(): FontFaceSet | undefined {
  try {
    if (typeof document === 'undefined') return undefined;
    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
    return fonts && typeof fonts.ready?.then === 'function' ? fonts : undefined;
  } catch {
    return undefined;
  }
}

/** True when at least one web font is still loading. */
export function fontsLoading(): boolean {
  const fonts = fontFaceSet();
  return fonts ? fonts.status === 'loading' : false;
}

/**
 * Invoke `cb` once when the document's currently-loading web fonts have settled.
 * If the API is unavailable, `cb` is never called (there is nothing to wait for).
 */
export function onFontsReady(cb: () => void): void {
  const fonts = fontFaceSet();
  if (!fonts) return;
  fonts.ready.then(() => cb()).catch(() => {});
}
