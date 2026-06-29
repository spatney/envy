/**
 * Canvas painting for chart "overlay" text (axis labels, titles, legends,
 * annotation labels). In the browser this text lives in a crisp, selectable
 * HTML overlay; headless (no DOM) there is no overlay, so the very same text is
 * painted onto the marks canvas with these helpers.
 *
 * The geometry is shared: call sites compute one set of positions and either
 * realise them as absolutely-positioned DOM nodes (browser) or feed them here
 * (headless). The transform/width vocabulary the DOM path uses
 * (`translateX(-50%)`, `translateY(-50%)`, `translate(-50%,-50%) rotate(±90deg)`,
 * box `width` + `align`) maps deterministically onto canvas
 * `textAlign`/`textBaseline`/rotation, so both paths land the same pixels.
 */

import { roundedRect } from '../shape';

export interface CanvasPillStyle {
  background: string;
  border?: string;
  radius?: number;
  padX?: number;
  padY?: number;
}

export interface CanvasTextCmd {
  /** Anchor x (interpreted per `align`). */
  x: number;
  /** Anchor y (interpreted per `baseline`). */
  y: number;
  text: string;
  /** CSS font shorthand (authoritative — already encodes size + weight). */
  font: string;
  color: string;
  /** Font pixel size, used to size the optional pill. */
  size: number;
  align?: CanvasTextAlign;
  baseline?: CanvasTextBaseline;
  /** Rotation about (x, y), in radians. */
  rotate?: number;
  opacity?: number;
  /** Draw a rounded "pill"/badge behind the text (solid fill + hairline border). */
  pill?: CanvasPillStyle;
}

/** Paint a single text command onto a 2D context. Self-contained (save/restore). */
export function paintCanvasText(ctx: CanvasRenderingContext2D, c: CanvasTextCmd): void {
  const align = c.align ?? 'left';
  const baseline = c.baseline ?? 'top';
  ctx.save();
  if (c.opacity != null) ctx.globalAlpha *= c.opacity;
  if (c.rotate) {
    ctx.translate(c.x, c.y);
    ctx.rotate(c.rotate);
    ctx.translate(-c.x, -c.y);
  }
  ctx.font = c.font;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  if (c.pill) {
    const padX = c.pill.padX ?? 7;
    const padY = c.pill.padY ?? 2;
    const tw = ctx.measureText(c.text).width;
    const th = c.size;
    let bx = c.x;
    if (align === 'center') bx = c.x - tw / 2;
    else if (align === 'right') bx = c.x - tw;
    let by = c.y;
    if (baseline === 'middle') by = c.y - th / 2;
    else if (baseline === 'alphabetic') by = c.y - th;
    ctx.beginPath();
    roundedRect(ctx, bx - padX, by - padY, tw + padX * 2, th + padY * 2, c.pill.radius ?? 999);
    ctx.fillStyle = c.pill.background;
    ctx.fill();
    if (c.pill.border) {
      ctx.lineWidth = 1;
      ctx.strokeStyle = c.pill.border;
      ctx.stroke();
    }
  }
  ctx.fillStyle = c.color;
  ctx.fillText(c.text, c.x, c.y);
  ctx.restore();
}

/** Option shape shared by the DOM text helpers (axes + chrome). */
export interface OverlayTextOpts {
  left: number;
  top: number;
  width?: number;
  text: string;
  color: string;
  size: number;
  align?: 'left' | 'center' | 'right';
  transform?: string;
  opacity?: number;
  pill?: CanvasPillStyle;
}

/**
 * Translate an absolutely-positioned overlay text node (left/top/width/align +
 * a CSS `transform` from the known vocabulary) into the equivalent canvas
 * command. Keeps the headless output pixel-aligned with the browser overlay.
 */
export function overlayTextToCanvasCmd(o: OverlayTextOpts, font: string): CanvasTextCmd {
  const t = o.transform ?? '';
  const rotate = t.includes('rotate(-90deg)')
    ? -Math.PI / 2
    : t.includes('rotate(90deg)')
      ? Math.PI / 2
      : (() => {
          const m = t.match(/rotate\((-?\d+(?:\.\d+)?)deg\)/);
          return m ? (parseFloat(m[1]) * Math.PI) / 180 : undefined;
        })();

  let align: CanvasTextAlign = 'left';
  let x = o.left;
  const y = o.top;
  if (o.width != null) {
    align = o.align ?? 'left';
    x = align === 'right' ? o.left + o.width : align === 'center' ? o.left + o.width / 2 : o.left;
  } else if (t.includes('translateX(-100%)')) {
    align = 'right';
  } else if (t.includes('translateX(-50%)') || t.includes('translate(-50%')) {
    align = 'center';
  }

  // A `-50%` y-component (translateY(-50%) or the y of a 2-axis translate)
  // centers the text vertically on its anchor.
  const baseline: CanvasTextBaseline =
    t.includes('translateY(-50%)') || t.includes(',-50%') || t.includes(', -50%')
      ? 'middle'
      : 'top';

  return {
    x,
    y,
    text: o.text,
    font,
    color: o.color,
    size: o.size,
    align,
    baseline,
    rotate,
    opacity: o.opacity,
    pill: o.pill,
  };
}

export type LegendSymbol = 'square' | 'circle' | 'line';

/** Total horizontal footprint of a legend swatch (square/circle = 11, line = 14). */
export function legendSwatchWidth(symbol: LegendSymbol | undefined, swatch = 11): number {
  return symbol === 'line' ? swatch + 3 : swatch;
}

/**
 * Paint a legend swatch onto canvas, vertically centered on `midY`. Mirrors the
 * DOM swatch (square/circle 11px, line 14×3px).
 */
export function paintLegendSwatch(
  ctx: CanvasRenderingContext2D,
  x: number,
  midY: number,
  symbol: LegendSymbol | undefined,
  color: string,
  swatch = 11,
): void {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  if (symbol === 'circle') {
    ctx.arc(x + swatch / 2, midY, swatch / 2, 0, Math.PI * 2);
  } else if (symbol === 'line') {
    roundedRect(ctx, x, midY - 1.5, swatch + 3, 3, 1.5);
  } else {
    roundedRect(ctx, x, midY - swatch / 2, swatch, swatch, 2);
  }
  ctx.fill();
  ctx.restore();
}
