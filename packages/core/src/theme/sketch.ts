/**
 * Theme-side support for the hand-drawn ("sketch") style.
 *
 * Two responsibilities:
 *  1. `ensureSketchFont()` lazily loads the bundled handwriting font (Patrick
 *     Hand, SIL OFL) as a data URL — no network, works offline. The base64 blob
 *     lives in its own module that we `import()` dynamically so it is code-split
 *     out of the main bundle and only fetched when a chart actually sketches.
 *  2. `withSketchFont()` swaps a theme's font family to the handwriting stack so
 *     every bit of text (titles, axes, legends, KPI/table/matrix) reads as drawn.
 */

import type { ThemeTokens } from './tokens';

/** The font-family name the injected `@font-face` registers. */
export const SKETCH_FONT_NAME = 'Patrick Hand';

/** Handwriting stack with graceful fallbacks for SSR / pre-load / odd hosts. */
export const SKETCH_FONT_FAMILY = `'Patrick Hand', 'Segoe Print', 'Bradley Hand', 'Comic Sans MS', ui-rounded, cursive`;

let injected = false;

function injectViaStyle(dataUrl: string): void {
  const style = document.createElement('style');
  style.setAttribute('data-graphein-sketch-font', '');
  style.textContent =
    `@font-face{font-family:'${SKETCH_FONT_NAME}';font-style:normal;font-weight:400;` +
    `font-display:swap;src:url("${dataUrl}") format("woff2");}`;
  document.head.appendChild(style);
}

/**
 * Ensure the handwriting font is available. Resolves `true` only when it was
 * newly loaded this call (so the caller can trigger a single corrective redraw
 * once real glyph metrics exist); resolves `false` if already present or if the
 * environment can't load fonts (Node/SSR).
 */
export async function ensureSketchFont(): Promise<boolean> {
  if (injected) return false;
  if (typeof document === 'undefined') return false;
  injected = true;

  try {
    const { PATRICK_HAND_DATA_URL } = await import('./fonts/patrickHand');
    const docFonts = (document as Document & { fonts?: FontFaceSet }).fonts;

    if (typeof FontFace !== 'undefined' && docFonts?.add) {
      const face = new FontFace(
        SKETCH_FONT_NAME,
        `url("${PATRICK_HAND_DATA_URL}") format("woff2")`,
        { style: 'normal', weight: '400' },
      );
      await face.load();
      docFonts.add(face);
      return true;
    }

    injectViaStyle(PATRICK_HAND_DATA_URL);
    return true;
  } catch {
    injected = false;
    return false;
  }
}

/** Return a copy of `tokens` whose text uses the handwriting font. */
export function withSketchFont(tokens: ThemeTokens): ThemeTokens {
  return {
    ...tokens,
    font: {
      ...tokens.font,
      family: `${SKETCH_FONT_FAMILY}`,
    },
  };
}
