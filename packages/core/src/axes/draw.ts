/**
 * Axis, gridline, legend, and title rendering for cartesian charts.
 *
 * Marks (gridlines, tick marks, axis baselines) are drawn on the canvas; text
 * (tick labels, axis titles, chart title, legend) lives in the HTML overlay for
 * crisp, accessible, selectable typography. Geometry comes from the already
 * computed `CartesianModel` / `Frame`, so this module is pure presentation.
 */

import type { Surface } from '../render/surface';
import { fontString, measureText } from '../render/text';
import {
  overlayTextToCanvasCmd,
  paintCanvasText,
  paintLegendSwatch,
  legendSwatchWidth,
} from '../render/overlayText';
import { crisp } from '../util/math';
import { TICK_SIZE, type Frame, type PositionedLegendItem } from '../layout';
import type { CartesianModel } from '../runtime/cartesian';
import { RoughPen } from '../rough';
import type { ThemeTokens } from '../theme';

interface TextOptions {
  left?: number;
  top?: number;
  width?: number;
  text: string;
  color: string;
  size: number;
  weight?: number;
  align?: 'left' | 'center' | 'right';
  transform?: string;
  whiteSpace?: 'nowrap' | 'normal';
}

function addText(surface: Surface, font: string, o: TextOptions): void {
  if (surface.headless) {
    paintCanvasText(
      surface.marks.ctx,
      overlayTextToCanvasCmd(
        { left: o.left ?? 0, top: o.top ?? 0, width: o.width, text: o.text, color: o.color, size: o.size, align: o.align, transform: o.transform },
        font,
      ),
    );
    return;
  }
  const overlay = surface.overlay;
  const el = document.createElement('div');
  el.textContent = o.text;
  el.style.position = 'absolute';
  el.style.font = font;
  el.style.fontSize = `${o.size}px`;
  if (o.weight) el.style.fontWeight = String(o.weight);
  el.style.color = o.color;
  el.style.whiteSpace = o.whiteSpace ?? 'nowrap';
  if (o.left != null) el.style.left = `${o.left}px`;
  if (o.top != null) el.style.top = `${o.top}px`;
  if (o.width != null) {
    el.style.width = `${o.width}px`;
    el.style.textAlign = o.align ?? 'left';
  }
  if (o.transform) el.style.transform = o.transform;
  el.style.pointerEvents = 'none';
  overlay.appendChild(el);
}

function xGridEnabled(model: CartesianModel): boolean {
  const cfg = model.spec.axes?.x;
  if (cfg?.grid !== undefined) return cfg.grid;
  return model.x.kind === 'linear' || model.x.kind === 'time' || model.spec.type === 'scatter';
}

function yGridEnabled(model: CartesianModel): boolean {
  return model.spec.axes?.y?.grid !== false;
}

/** Draw gridlines + axis baselines + tick marks on the marks canvas (behind marks). */
export function drawAxesUnderlay(surface: Surface, model: CartesianModel): void {
  const ctx = surface.marks.ctx;
  const { plot, tokens } = model;
  const x0 = plot.x;
  const x1 = plot.x + plot.width;
  const y0 = plot.y;
  const y1 = plot.y + plot.height;

  ctx.save();
  ctx.lineWidth = 1;

  // The labelled x-tick subset drives gridlines, tick marks and labels alike so
  // a dense axis never shows more gridlines than it has room to label.
  const xPlaced = resolveXLabels(model);

  // When sketching, gridlines/ticks are drawn as gently wavy hand-drawn segments
  // (reduced roughness keeps them subtle behind the bolder data marks).
  const pen = model.sketch ? new RoughPen(ctx, model.sketch) : null;
  const seg = (sx0: number, sy0: number, sx1: number, sy1: number, stroke: string): void => {
    pen!.polyline([{ x: sx0, y: sy0 }, { x: sx1, y: sy1 }], {
      stroke,
      strokeWidth: 1,
      roughness: model.sketch!.roughness * 0.5,
      bowing: model.sketch!.bowing * 0.55,
    });
  };

  // Horizontal y gridlines.
  if (yGridEnabled(model)) {
    if (pen) {
      for (const t of model.yTicks) seg(x0, t.pos, x1, t.pos, tokens.color.grid);
    } else {
      ctx.strokeStyle = tokens.color.grid;
      ctx.beginPath();
      for (const t of model.yTicks) {
        const y = crisp(t.pos);
        ctx.moveTo(x0, y);
        ctx.lineTo(x1, y);
      }
      ctx.stroke();
    }
  }

  // Vertical x gridlines (aligned to the labelled ticks for a clean read).
  if (xGridEnabled(model)) {
    if (pen) {
      for (const p of xPlaced) seg(p.pos, y0, p.pos, y1, tokens.color.grid);
    } else {
      ctx.strokeStyle = tokens.color.grid;
      ctx.beginPath();
      for (const p of xPlaced) {
        const x = crisp(p.pos);
        ctx.moveTo(x, y0);
        ctx.lineTo(x, y1);
      }
      ctx.stroke();
    }
  }

  // Axis baselines. The y axis relies on horizontal gridlines + labels (no
  // vertical domain line) for a cleaner, more modern read; only the x baseline
  // is drawn to anchor the marks.
  if (model.spec.axes?.x?.show !== false) {
    if (pen) {
      seg(x0, y1, x1, y1, tokens.color.axis);
    } else {
      ctx.strokeStyle = tokens.color.axis;
      ctx.beginPath();
      ctx.moveTo(x0, crisp(y1));
      ctx.lineTo(x1, crisp(y1));
      ctx.stroke();
    }
  }

  // X tick marks (subtle), drawn only where labels sit.
  if (model.spec.axes?.x?.show !== false) {
    if (pen) {
      for (const p of xPlaced) seg(p.pos, y1, p.pos, y1 + TICK_SIZE, tokens.color.axis);
    } else {
      ctx.strokeStyle = tokens.color.axis;
      ctx.beginPath();
      for (const p of xPlaced) {
        const x = crisp(p.pos);
        ctx.moveTo(x, y1);
        ctx.lineTo(x, y1 + TICK_SIZE);
      }
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** Thin out x tick labels that would overlap, keeping a readable subset. */
function thinXTicks(model: CartesianModel, avgCharPx: number): typeof model.xTicks {
  const ticks = model.xTicks;
  if (ticks.length <= 1) return ticks;
  const longest = ticks.reduce((m, t) => Math.max(m, t.label.length), 0);
  const needed = longest * avgCharPx + 10;
  const available = model.plot.width / ticks.length;
  if (available >= needed) return ticks;
  const stride = Math.ceil(needed / available);
  return ticks.filter((_, i) => i % stride === 0);
}

interface PlacedLabel {
  text: string;
  pos: number;
  left: number;
  transform: string;
}

/**
 * Resolve thinned x ticks into non-overlapping label boxes. Each label is
 * centered on its tick, except the first/last which are clamped to the surface
 * edges. A left→right sweep then drops any label whose box would collide with
 * the previous kept label or with the final label, so the right-edge label is
 * always preserved without overlap (fixes "Aug 2023Sep 2023" style run-ons).
 */
function placeXLabels(
  ticks: CartesianModel['xTicks'],
  frameWidth: number,
  font: string,
): PlacedLabel[] {
  const edgePad = 2;
  const minGap = 6;
  const boxes = ticks.map((t) => {
    const w = measureText(t.label, font).width;
    const half = w / 2;
    let left = t.pos;
    let transform = 'translateX(-50%)';
    let bl = t.pos - half;
    let br = t.pos + half;
    if (bl < edgePad) {
      left = edgePad;
      transform = 'none';
      bl = edgePad;
      br = edgePad + w;
    } else if (br > frameWidth - edgePad) {
      left = frameWidth - edgePad;
      transform = 'translateX(-100%)';
      br = frameWidth - edgePad;
      bl = br - w;
    }
    return { text: t.label, pos: t.pos, left, transform, bl, br };
  });
  if (boxes.length <= 1) return boxes;

  const n = boxes.length;
  const last = boxes[n - 1];
  const keep = new Array<boolean>(n).fill(false);
  keep[n - 1] = true;
  let prevBr = -Infinity;
  for (let i = 0; i < n - 1; i += 1) {
    const b = boxes[i];
    if (b.bl < prevBr + minGap) continue; // overlaps the previous kept label
    if (b.br + minGap > last.bl) break; // would overlap the final label
    keep[i] = true;
    prevBr = b.br;
  }
  return boxes.filter((_, i) => keep[i]);
}

/** Compute the placed (thinned, non-overlapping) x labels for a model. Shared by
 * the gridline/tick underlay and the label overlay so they stay perfectly aligned. */
function resolveXLabels(model: CartesianModel): PlacedLabel[] {
  const f = model.tokens.font;
  const smallFont = fontString(f.size.small, f.family, f.weight.normal);
  const thinned = thinXTicks(model, f.size.small * 0.58);
  return placeXLabels(thinned, model.frame.width, smallFont);
}

/** Draw all overlay text: tick labels, axis titles, chart title, legend. */
export function drawOverlay(surface: Surface, model: CartesianModel): void {
  const { plot, tokens, frame } = model;
  const f = tokens.font;
  const smallFont = fontString(f.size.small, f.family, f.weight.normal);

  // Y tick labels (right-aligned in the left gutter).
  if (model.spec.axes?.y?.labels !== false) {
    const gutterRight = plot.x - TICK_SIZE - 4;
    for (const t of model.yTicks) {
      addText(surface, smallFont, {
        left: 0,
        top: t.pos,
        width: Math.max(0, gutterRight),
        text: t.label,
        color: tokens.color.textMuted,
        size: f.size.small,
        align: 'right',
        transform: 'translateY(-50%)',
      });
    }
  }

  // X tick labels. Resolve each thinned tick to a measured box, clamp the
  // first/last so they never overflow the surface, then drop any that still
  // collide — always preserving the final (right-edge) label, which is the most
  // informative on a time/linear axis.
  if (model.spec.axes?.x?.labels !== false) {
    const top = plot.y + plot.height + TICK_SIZE + 3;
    for (const p of resolveXLabels(model)) {
      addText(surface, smallFont, {
        left: p.left,
        top,
        text: p.text,
        color: tokens.color.textMuted,
        size: f.size.small,
        transform: p.transform,
      });
    }
  }

  drawAxisTitles(surface, model);
  drawTitle(surface, frame, model.spec, tokens);
  if (frame.legendItems) drawLegend(surface, frame.legendItems, model);
}

function drawAxisTitles(surface: Surface, model: CartesianModel): void {
  const { plot, tokens, frame } = model;
  const f = tokens.font;
  const baseFont = fontString(f.size.base, f.family, f.weight.medium);

  const xTitle = model.spec.axes?.x?.title ?? model.spec.encoding.x.title;
  if (xTitle) {
    addText(surface, baseFont, {
      left: plot.x + plot.width / 2,
      top: frame.height - Math.round(f.size.base * 1.35),
      text: xTitle,
      color: tokens.color.text,
      size: f.size.base,
      weight: f.weight.medium,
      transform: 'translateX(-50%)',
    });
  }
  const yTitle = model.spec.axes?.y?.title ?? model.spec.encoding.y.title;
  if (yTitle) {
    addText(surface, baseFont, {
      left: Math.round(f.size.base * 0.4),
      top: plot.y + plot.height / 2,
      text: yTitle,
      color: tokens.color.text,
      size: f.size.base,
      weight: f.weight.medium,
      transform: 'translate(-50%, -50%) rotate(-90deg)',
    });
  }
}

function drawTitle(
  surface: Surface,
  frame: Frame,
  spec: CartesianModel['spec'],
  tokens: ThemeTokens,
): void {
  if (!frame.titleRect) return;
  const f = tokens.font;
  const title = typeof spec.title === 'string' ? { text: spec.title } : spec.title ?? {};
  const align = (typeof spec.title === 'object' && spec.title?.align) || 'left';
  const titleFont = fontString(f.size.title, f.family, f.weight.bold);
  addText(surface, titleFont, {
    left: frame.titleRect.x,
    top: frame.titleRect.y,
    width: frame.titleRect.width,
    text: title.text ?? '',
    color: tokens.color.text,
    size: f.size.title,
    weight: f.weight.bold,
    align,
  });
  if (frame.subtitleRect && title.subtitle) {
    addText(surface, fontString(f.size.small, f.family, f.weight.normal), {
      left: frame.subtitleRect.x,
      top: frame.subtitleRect.y,
      width: frame.subtitleRect.width,
      text: title.subtitle,
      color: tokens.color.textMuted,
      size: f.size.small,
      align,
    });
  }
}

function drawLegend(
  surface: Surface,
  items: PositionedLegendItem[],
  model: CartesianModel,
): void {
  const f = model.tokens.font;
  const legendFont = fontString(f.size.small, f.family, f.weight.normal);

  if (surface.headless) {
    const ctx = surface.marks.ctx;
    const swatch = 11;
    for (const item of items) {
      const midY = item.y + swatch / 2;
      paintLegendSwatch(ctx, item.x, midY, item.symbol, item.color, swatch);
      paintCanvasText(ctx, {
        x: item.x + legendSwatchWidth(item.symbol, swatch) + 6,
        y: midY,
        text: item.label,
        font: legendFont,
        color: model.tokens.color.text,
        size: f.size.small,
        baseline: 'middle',
      });
    }
    return;
  }

  const overlay = surface.overlay;
  for (const item of items) {
    const row = document.createElement('div');
    row.style.position = 'absolute';
    row.style.left = `${item.x}px`;
    row.style.top = `${item.y}px`;
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.gap = '6px';
    row.style.pointerEvents = 'none';

    const swatch = document.createElement('span');
    const size = 11;
    swatch.style.flex = '0 0 auto';
    swatch.style.background = item.color;
    if (item.symbol === 'circle') {
      swatch.style.width = `${size}px`;
      swatch.style.height = `${size}px`;
      swatch.style.borderRadius = '50%';
    } else if (item.symbol === 'line') {
      swatch.style.width = `${size + 3}px`;
      swatch.style.height = '3px';
      swatch.style.borderRadius = '2px';
    } else {
      swatch.style.width = `${size}px`;
      swatch.style.height = `${size}px`;
      swatch.style.borderRadius = '2px';
    }

    const label = document.createElement('span');
    label.textContent = item.label;
    label.style.font = legendFont;
    label.style.fontSize = `${f.size.small}px`;
    label.style.color = model.tokens.color.text;
    label.style.whiteSpace = 'nowrap';

    row.appendChild(swatch);
    row.appendChild(label);
    overlay.appendChild(row);
  }
}
