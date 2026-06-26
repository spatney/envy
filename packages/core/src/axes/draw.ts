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
import { crisp } from '../util/math';
import { TICK_SIZE, type Frame, type PositionedLegendItem } from '../layout';
import type { CartesianModel } from '../runtime/cartesian';
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

function addText(overlay: HTMLElement, font: string, o: TextOptions): HTMLDivElement {
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
  return el;
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

  // Horizontal y gridlines.
  if (yGridEnabled(model)) {
    ctx.strokeStyle = tokens.color.grid;
    ctx.beginPath();
    for (const t of model.yTicks) {
      const y = crisp(t.pos);
      ctx.moveTo(x0, y);
      ctx.lineTo(x1, y);
    }
    ctx.stroke();
  }

  // Vertical x gridlines.
  if (xGridEnabled(model)) {
    ctx.strokeStyle = tokens.color.grid;
    ctx.beginPath();
    for (const t of model.xTicks) {
      const x = crisp(t.pos);
      ctx.moveTo(x, y0);
      ctx.lineTo(x, y1);
    }
    ctx.stroke();
  }

  // Axis baselines. The y axis relies on horizontal gridlines + labels (no
  // vertical domain line) for a cleaner, more modern read; only the x baseline
  // is drawn to anchor the marks.
  if (model.spec.axes?.x?.show !== false) {
    ctx.strokeStyle = tokens.color.axis;
    ctx.beginPath();
    ctx.moveTo(x0, crisp(y1));
    ctx.lineTo(x1, crisp(y1));
    ctx.stroke();
  }

  // X tick marks (subtle), drawn only where labels sit.
  if (model.spec.axes?.x?.show !== false) {
    ctx.strokeStyle = tokens.color.axis;
    ctx.beginPath();
    for (const t of model.xTicks) {
      const x = crisp(t.pos);
      ctx.moveTo(x, y1);
      ctx.lineTo(x, y1 + TICK_SIZE);
    }
    ctx.stroke();
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
    return { text: t.label, left, transform, bl, br };
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

/** Draw all overlay text: tick labels, axis titles, chart title, legend. */
export function drawOverlay(surface: Surface, model: CartesianModel): void {
  const overlay = surface.overlay;
  const { plot, tokens, frame } = model;
  const f = tokens.font;
  const smallFont = fontString(f.size.small, f.family, f.weight.normal);

  // Y tick labels (right-aligned in the left gutter).
  if (model.spec.axes?.y?.labels !== false) {
    const gutterRight = plot.x - TICK_SIZE - 4;
    for (const t of model.yTicks) {
      addText(overlay, smallFont, {
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
    const thinned = thinXTicks(model, f.size.small * 0.58);
    for (const p of placeXLabels(thinned, frame.width, smallFont)) {
      addText(overlay, smallFont, {
        left: p.left,
        top,
        text: p.text,
        color: tokens.color.textMuted,
        size: f.size.small,
        transform: p.transform,
      });
    }
  }

  drawAxisTitles(overlay, model);
  drawTitle(overlay, frame, model.spec, tokens);
  if (frame.legendItems) drawLegend(overlay, frame.legendItems, model);
}

function drawAxisTitles(overlay: HTMLElement, model: CartesianModel): void {
  const { plot, tokens, frame } = model;
  const f = tokens.font;
  const baseFont = fontString(f.size.base, f.family, f.weight.medium);

  const xTitle = model.spec.axes?.x?.title ?? model.spec.encoding.x.title;
  if (xTitle) {
    addText(overlay, baseFont, {
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
    addText(overlay, baseFont, {
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
  overlay: HTMLElement,
  frame: Frame,
  spec: CartesianModel['spec'],
  tokens: ThemeTokens,
): void {
  if (!frame.titleRect) return;
  const f = tokens.font;
  const title = typeof spec.title === 'string' ? { text: spec.title } : spec.title ?? {};
  const align = (typeof spec.title === 'object' && spec.title?.align) || 'left';
  const titleFont = fontString(f.size.title, f.family, f.weight.bold);
  addText(overlay, titleFont, {
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
    addText(overlay, fontString(f.size.small, f.family, f.weight.normal), {
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
  overlay: HTMLElement,
  items: PositionedLegendItem[],
  model: CartesianModel,
): void {
  const f = model.tokens.font;
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
    label.style.font = fontString(f.size.small, f.family, f.weight.normal);
    label.style.fontSize = `${f.size.small}px`;
    label.style.color = model.tokens.color.text;
    label.style.whiteSpace = 'nowrap';

    row.appendChild(swatch);
    row.appendChild(label);
    overlay.appendChild(row);
  }
}
