/**
 * Shared "chrome" helpers for custom (non-cartesian) chart renderers
 * (pie, heatmap, kpi, …). These keep titles, padding, and legends visually
 * consistent with the cartesian charts (which use `axes/draw.ts`).
 *
 * All text lives in the HTML overlay (`surface.overlay`) for crisp typography;
 * helpers return the content rect left over after reserving chrome so the
 * caller can lay out its marks in the remaining space.
 */

import type { Surface } from '../render/surface';
import type { ThemeTokens } from '../theme';
import type { Rect, Size } from '../types';
import { fontString, measureText } from '../render/text';
import {
  overlayTextToCanvasCmd,
  paintCanvasText,
  paintLegendSwatch,
  legendSwatchWidth,
  type LegendSymbol,
} from '../render/overlayText';

export const CHROME_PAD = { top: 14, right: 16, bottom: 14, left: 16 } as const;

export interface ResolvedTitle {
  text?: string;
  subtitle?: string;
  align: 'left' | 'center' | 'right';
}

export function resolveTitle(title: unknown): ResolvedTitle {
  if (typeof title === 'string') return { text: title, align: 'left' };
  if (title && typeof title === 'object') {
    const t = title as { text?: string; subtitle?: string; align?: 'left' | 'center' | 'right' };
    return { text: t.text, subtitle: t.subtitle, align: t.align ?? 'left' };
  }
  return { align: 'left' };
}

interface TextSpec {
  left: number;
  top: number;
  width?: number;
  text: string;
  color: string;
  size: number;
  weight?: number;
  align?: 'left' | 'center' | 'right';
  transform?: string;
  whiteSpace?: 'nowrap' | 'normal';
  opacity?: number;
  /** Render the text inside a rounded "pill" badge (solid fill + hairline border). */
  pill?: { background: string; border?: string; radius?: number; padX?: number; padY?: number };
}

/** Append an absolutely-positioned text node to the overlay. Returns the node. */
export function addOverlayText(surface: Surface, tokens: ThemeTokens, o: TextSpec): HTMLDivElement {
  const font = fontString(o.size, tokens.font.family, o.weight ?? tokens.font.weight.normal);
  if (surface.headless) {
    paintCanvasText(
      surface.marks.ctx,
      overlayTextToCanvasCmd(
        {
          left: o.left,
          top: o.top,
          width: o.width,
          text: o.text,
          color: o.color,
          size: o.size,
          align: o.align,
          transform: o.transform,
          opacity: o.opacity,
          pill: o.pill,
        },
        font,
      ),
    );
    // Headless has no DOM; callers ignore the return (geometry is pre-computed).
    return null as unknown as HTMLDivElement;
  }
  const el = document.createElement('div');
  el.textContent = o.text;
  el.style.position = 'absolute';
  el.style.font = font;
  el.style.color = o.color;
  el.style.left = `${o.left}px`;
  el.style.top = `${o.top}px`;
  el.style.whiteSpace = o.whiteSpace ?? 'nowrap';
  if (o.width != null) {
    el.style.width = `${o.width}px`;
    el.style.textAlign = o.align ?? 'left';
  }
  if (o.pill) {
    // A shrink-to-fit badge: solid fill keeps the text readable on any colour
    // beneath it, so labels look identical across every segment/fill.
    el.style.display = 'inline-block';
    el.style.lineHeight = '1';
    el.style.boxSizing = 'border-box';
    el.style.background = o.pill.background;
    el.style.borderRadius = `${o.pill.radius ?? 999}px`;
    el.style.padding = `${o.pill.padY ?? 2}px ${o.pill.padX ?? 7}px`;
    if (o.pill.border) el.style.border = `1px solid ${o.pill.border}`;
  }
  if (o.transform) el.style.transform = o.transform;
  if (o.opacity != null) el.style.opacity = String(o.opacity);
  el.style.pointerEvents = 'none';
  surface.overlay.appendChild(el);
  return el;
}

/**
 * Render the chart title + subtitle (if any) at the top of the chart and return
 * the inner content rect below them, inset by CHROME_PAD.
 */
export function drawTitleBlock(surface: Surface, tokens: ThemeTokens, size: Size, title: unknown): Rect {
  const f = tokens.font;
  const t = resolveTitle(title);
  let top = CHROME_PAD.top;
  const innerWidth = size.width - CHROME_PAD.left - CHROME_PAD.right;

  if (t.text) {
    addOverlayText(surface, tokens, {
      left: CHROME_PAD.left,
      top,
      width: innerWidth,
      text: t.text,
      color: tokens.color.text,
      size: f.size.title,
      weight: f.weight.bold,
      align: t.align,
    });
    top += Math.round(f.size.title * 1.3);
    if (t.subtitle) {
      addOverlayText(surface, tokens, {
        left: CHROME_PAD.left,
        top,
        width: innerWidth,
        text: t.subtitle,
        color: tokens.color.textMuted,
        size: f.size.small,
        align: t.align,
      });
      top += Math.round(f.size.small * 1.5);
    } else {
      top += 4;
    }
  }

  return {
    x: CHROME_PAD.left,
    y: top,
    width: innerWidth,
    height: Math.max(0, size.height - top - CHROME_PAD.bottom),
  };
}

export interface LegendEntry {
  label: string;
  color: string;
  symbol?: 'square' | 'circle' | 'line';
}

/**
 * Render a categorical legend of swatch + label entries and return the content
 * rect remaining after reserving space for it.
 *
 * - position 'top' | 'bottom': a centered horizontal row (wraps if needed)
 * - position 'right': a vertical stack on the right
 */
export function drawCategoricalLegend(
  surface: Surface,
  tokens: ThemeTokens,
  area: Rect,
  entries: LegendEntry[],
  position: 'top' | 'bottom' | 'right' = 'right',
): Rect {
  if (entries.length === 0) return area;
  const f = tokens.font;
  const labelSize = f.size.small;
  const rowH = Math.round(labelSize * 1.7);
  const swatch = 11;
  const gap = 16;
  const font = fontString(labelSize, f.family, f.weight.normal);

  // Headless: paint swatch + label onto the marks canvas at the same positions
  // (and reserve the same content rect) the DOM path below would use.
  if (surface.headless) {
    const ctx = surface.marks.ctx;
    if (position === 'right') {
      let maxLabel = 0;
      for (const e of entries) maxLabel = Math.max(maxLabel, measureText(e.label, font).width);
      const colW = Math.ceil(swatch + 6 + maxLabel + 4);
      const x = area.x + area.width - colW;
      let y = area.y + Math.max(0, (area.height - entries.length * rowH) / 2);
      for (const e of entries) {
        const midY = y + rowH / 2;
        paintLegendSwatch(ctx, x, midY, e.symbol as LegendSymbol, e.color, swatch);
        paintCanvasText(ctx, {
          x: x + legendSwatchWidth(e.symbol as LegendSymbol, swatch) + 6,
          y: midY,
          text: e.label,
          font,
          color: tokens.color.text,
          size: labelSize,
          baseline: 'middle',
        });
        y += rowH;
      }
      return { x: area.x, y: area.y, width: Math.max(0, area.width - colW - gap), height: area.height };
    }
    const widths = entries.map(
      (e) => legendSwatchWidth(e.symbol as LegendSymbol, swatch) + 6 + measureText(e.label, font).width,
    );
    const total = widths.reduce((a, b) => a + b, 0) + gap * Math.max(0, entries.length - 1);
    let cx = area.x + Math.max(0, (area.width - total) / 2);
    const barH = rowH;
    const barTop = position === 'top' ? area.y : area.y + area.height - barH;
    const midY = barTop + barH / 2;
    entries.forEach((e, i) => {
      paintLegendSwatch(ctx, cx, midY, e.symbol as LegendSymbol, e.color, swatch);
      paintCanvasText(ctx, {
        x: cx + legendSwatchWidth(e.symbol as LegendSymbol, swatch) + 6,
        y: midY,
        text: e.label,
        font,
        color: tokens.color.text,
        size: labelSize,
        baseline: 'middle',
      });
      cx += widths[i] + gap;
    });
    return position === 'top'
      ? { x: area.x, y: area.y + barH + 6, width: area.width, height: Math.max(0, area.height - barH - 6) }
      : { x: area.x, y: area.y, width: area.width, height: Math.max(0, area.height - barH - 6) };
  }

  const makeSwatch = (e: LegendEntry): HTMLSpanElement => {
    const s = document.createElement('span');
    s.style.flex = '0 0 auto';
    s.style.background = e.color;
    if (e.symbol === 'line') {
      s.style.width = `${swatch + 3}px`;
      s.style.height = '3px';
      s.style.borderRadius = '2px';
    } else if (e.symbol === 'circle') {
      s.style.width = `${swatch}px`;
      s.style.height = `${swatch}px`;
      s.style.borderRadius = '50%';
    } else {
      s.style.width = `${swatch}px`;
      s.style.height = `${swatch}px`;
      s.style.borderRadius = '2px';
    }
    return s;
  };

  if (position === 'right') {
    let maxLabel = 0;
    for (const e of entries) maxLabel = Math.max(maxLabel, measureText(e.label, font).width);
    const colW = Math.ceil(swatch + 6 + maxLabel + 4);
    const x = area.x + area.width - colW;
    let y = area.y + Math.max(0, (area.height - entries.length * rowH) / 2);
    for (const e of entries) {
      const row = document.createElement('div');
      row.style.position = 'absolute';
      row.style.left = `${x}px`;
      row.style.top = `${y}px`;
      row.style.display = 'flex';
      row.style.alignItems = 'center';
      row.style.gap = '6px';
      row.style.pointerEvents = 'none';
      const label = document.createElement('span');
      label.textContent = e.label;
      label.style.font = font;
      label.style.color = tokens.color.text;
      label.style.whiteSpace = 'nowrap';
      row.appendChild(makeSwatch(e));
      row.appendChild(label);
      surface.overlay.appendChild(row);
      y += rowH;
    }
    return { x: area.x, y: area.y, width: Math.max(0, area.width - colW - gap), height: area.height };
  }

  // Horizontal (top/bottom): center a flex-wrap row.
  const bar = document.createElement('div');
  bar.style.position = 'absolute';
  bar.style.left = `${area.x}px`;
  bar.style.width = `${area.width}px`;
  bar.style.display = 'flex';
  bar.style.flexWrap = 'wrap';
  bar.style.justifyContent = 'center';
  bar.style.gap = `4px ${gap}px`;
  bar.style.pointerEvents = 'none';
  for (const e of entries) {
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.gap = '6px';
    const label = document.createElement('span');
    label.textContent = e.label;
    label.style.font = font;
    label.style.color = tokens.color.text;
    label.style.whiteSpace = 'nowrap';
    row.appendChild(makeSwatch(e));
    row.appendChild(label);
    bar.appendChild(row);
  }
  // Estimate one row; wrapping is tolerated visually.
  const barH = rowH;
  if (position === 'top') {
    bar.style.top = `${area.y}px`;
    surface.overlay.appendChild(bar);
    return { x: area.x, y: area.y + barH + 6, width: area.width, height: Math.max(0, area.height - barH - 6) };
  }
  bar.style.top = `${area.y + area.height - barH}px`;
  surface.overlay.appendChild(bar);
  return { x: area.x, y: area.y, width: area.width, height: Math.max(0, area.height - barH - 6) };
}
