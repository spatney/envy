/** Tiny DOM helpers (browser-only). */

export function setStyle(el: HTMLElement, style: Partial<CSSStyleDeclaration>): void {
  Object.assign(el.style, style);
}

export function createDiv(
  className?: string,
  style?: Partial<CSSStyleDeclaration>,
): HTMLDivElement {
  const el = document.createElement('div');
  if (className) el.className = className;
  if (style) setStyle(el, style);
  return el;
}

/** Absolute-position a layer to fill its positioned parent. */
export const fillParentStyle: Partial<CSSStyleDeclaration> = {
  position: 'absolute',
  top: '0',
  left: '0',
};
