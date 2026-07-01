/**
 * Reference annotations for cartesian charts — lines, bands, and threshold zones.
 *
 * A cross-cutting overlay primitive available to every cartesian chart via
 * `spec.annotations`. Marks (the rule strokes and band fills) are painted on the
 * marks canvas; labels live in the HTML overlay for crisp, selectable text,
 * mirroring how axes render. Geometry comes from the already-resolved
 * `CartesianModel` scales, so this module is pure presentation.
 */

import type { Surface } from '../render/surface';
import type { Annotation, ChartSpec } from '../spec/types';
import type { CartesianModel } from '../runtime/cartesian';
import { fontString } from '../render/text';
import { overlayTextToCanvasCmd, paintCanvasText } from '../render/overlayText';
import { autoInsightAnnotations } from '../analyze/autoInsights';
import { crisp } from '../util/math';

type Axis = 'x' | 'y';
type Kind = 'line' | 'band' | 'point';

const DEFAULT_DASH = [5, 4];
const DEFAULT_FILL_OPACITY = 0.12;
const DEFAULT_MARKER_RADIUS = 3.5;

/** Resolve whether an annotation is a single line, a filled span, or a point. */
function kindOf(ann: Annotation): Kind {
  if (ann.type === 'point') return 'point';
  if (ann.type === 'line') return 'line';
  if (ann.type === 'band' || ann.type === 'zone') return 'band';
  return ann.value !== undefined ? 'line' : 'band';
}

/** Project an annotation value to its pixel on the given axis (or undefined). */
function toPixel(model: CartesianModel, axis: Axis, value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined;
  const px = axis === 'x' ? model.x.pixel(value) : model.y.pixel(value);
  return px != null && Number.isFinite(px) ? px : undefined;
}

/** Resolve a `point` annotation's (x, y) data coords to plot pixels. */
function pointPixels(model: CartesianModel, ann: Annotation): { px: number; py: number } | undefined {
  const cat = toPixel(model, 'x', ann.x);
  const val = toPixel(model, 'y', ann.y);
  if (cat === undefined || val === undefined) return undefined;
  const { x, y } = model.project(cat, val);
  return { px: x, py: y };
}

/**
 * Whether an annotation on the given data axis draws as a horizontal rule on
 * screen. In vertical charts the value (`y`) axis is horizontal; in horizontal
 * bar charts the axes swap, so the category (`x`) axis becomes the horizontal one.
 */
function drawsHorizontalRule(model: CartesianModel, axis: Axis): boolean {
  return model.orientation === 'horizontal' ? axis === 'x' : axis === 'y';
}

/** Anchor pixel for an annotation's label (line value, or band midpoint). */
function anchorPixel(model: CartesianModel, ann: Annotation, axis: Axis, kind: Kind): number | undefined {
  if (kind === 'line') return toPixel(model, axis, ann.value);
  const a = toPixel(model, axis, ann.from);
  const b = toPixel(model, axis, ann.to);
  if (a === undefined || b === undefined) return undefined;
  return (a + b) / 2;
}

/** Explicit `spec.annotations` plus any auto-insight callouts (`spec.insights`). */
function annotationsOf(model: CartesianModel): Annotation[] {
  const spec = model.spec as { annotations?: Annotation[]; insights?: unknown };
  const explicit = Array.isArray(spec.annotations) ? spec.annotations : [];
  if (!spec.insights) return explicit;
  const auto = autoInsightAnnotations(model.spec as ChartSpec);
  return auto.length ? [...explicit, ...auto] : explicit;
}

/**
 * Paint reference lines and band/zone fills on the marks canvas, clipped to the
 * plot. Call after the chart's data marks so reference lines sit on top.
 */
export function drawAnnotations(surface: Surface, model: CartesianModel): void {
  const list = annotationsOf(model);
  if (list.length === 0) return;

  const ctx = surface.marks.ctx;
  const { plot, tokens } = model;
  const x1 = plot.x + plot.width;
  const y1 = plot.y + plot.height;

  ctx.save();
  ctx.beginPath();
  ctx.rect(plot.x, plot.y, plot.width, plot.height);
  ctx.clip();

  for (const ann of list) {
    if (kindOf(ann) === 'point') {
      const pt = pointPixels(model, ann);
      if (!pt) continue;
      const r = ann.markerRadius ?? DEFAULT_MARKER_RADIUS;
      const dot = ann.color ?? tokens.color.text;
      ctx.save();
      // A background halo keeps the marker legible over data marks.
      ctx.fillStyle = tokens.color.background;
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.arc(pt.px, pt.py, r + 1.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = dot;
      ctx.beginPath();
      ctx.arc(pt.px, pt.py, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      continue;
    }

    const axis: Axis = ann.axis === 'x' ? 'x' : 'y';
    const color = ann.color ?? tokens.color.textMuted;
    const ruleHorizontal = drawsHorizontalRule(model, axis);

    if (kindOf(ann) === 'line') {
      const p = toPixel(model, axis, ann.value);
      if (p === undefined) continue;
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = ann.strokeWidth ?? 1.5;
      ctx.setLineDash(ann.strokeDash ?? DEFAULT_DASH);
      ctx.beginPath();
      if (ruleHorizontal) {
        const y = crisp(p);
        ctx.moveTo(plot.x, y);
        ctx.lineTo(x1, y);
      } else {
        const x = crisp(p);
        ctx.moveTo(x, plot.y);
        ctx.lineTo(x, y1);
      }
      ctx.stroke();
      ctx.restore();
      continue;
    }

    // Band / zone: a filled span between `from` and `to`, with a faint border.
    const a = toPixel(model, axis, ann.from);
    const b = toPixel(model, axis, ann.to);
    if (a === undefined || b === undefined) continue;
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);

    ctx.save();
    ctx.globalAlpha = ann.fillOpacity ?? DEFAULT_FILL_OPACITY;
    ctx.fillStyle = color;
    if (ruleHorizontal) ctx.fillRect(plot.x, lo, plot.width, hi - lo);
    else ctx.fillRect(lo, plot.y, hi - lo, plot.height);
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 1;
    ctx.setLineDash(ann.strokeDash ?? [4, 4]);
    ctx.beginPath();
    if (ruleHorizontal) {
      ctx.moveTo(plot.x, crisp(lo));
      ctx.lineTo(x1, crisp(lo));
      ctx.moveTo(plot.x, crisp(hi));
      ctx.lineTo(x1, crisp(hi));
    } else {
      ctx.moveTo(crisp(lo), plot.y);
      ctx.lineTo(crisp(lo), y1);
      ctx.moveTo(crisp(hi), plot.y);
      ctx.lineTo(crisp(hi), y1);
    }
    ctx.stroke();
    ctx.restore();
  }

  ctx.restore();
}

interface LabelBox {
  left: number;
  top: number;
  width?: number;
  align: 'left' | 'center' | 'right';
  transform: string;
}

/** Resolve the overlay box for a label given whether its rule is horizontal on
 * screen, the anchor pixel, and the requested position. */
function labelBox(
  model: CartesianModel,
  horizontalRule: boolean,
  pos: 'start' | 'middle' | 'end',
  p: number,
): LabelBox {
  const { plot } = model;
  const inset = 6;
  if (horizontalRule) {
    // Horizontal line/band: label sits just above the rule, anchored horizontally.
    const top = p - 3;
    const transform = 'translateY(-100%)';
    if (pos === 'start') return { left: plot.x + inset, top, width: plot.width - inset, align: 'left', transform };
    if (pos === 'middle') return { left: plot.x, top, width: plot.width, align: 'center', transform };
    return { left: plot.x, top, width: plot.width - inset, align: 'right', transform };
  }
  // Vertical line/band: label anchored at top (end), bottom (start), or middle.
  const left = p;
  const transform = 'translateX(-50%)';
  if (pos === 'start') return { left, top: plot.y + plot.height - 16, align: 'center', transform };
  if (pos === 'middle') return { left, top: plot.y + plot.height / 2, align: 'center', transform };
  return { left, top: plot.y + 2, align: 'center', transform };
}

/**
 * Append annotation labels to the HTML overlay. Call after `drawOverlay` so the
 * labels layer on top of axis text. No-op when there are no labeled annotations.
 */
export function drawAnnotationLabels(surface: Surface, model: CartesianModel): void {
  const list = annotationsOf(model);
  if (list.length === 0) return;

  const overlay = surface.overlay;
  const { tokens } = model;
  const f = tokens.font;
  const font = fontString(f.size.small, f.family, f.weight.medium);

  for (const ann of list) {
    if (!ann.label) continue;

    let box: LabelBox;
    if (kindOf(ann) === 'point') {
      const pt = pointPixels(model, ann);
      if (!pt) continue;
      const r = ann.markerRadius ?? DEFAULT_MARKER_RADIUS;
      const gap = r + 4;
      const textH = f.size.small;
      // Sit above the marker; flip below when that would clip the plot top.
      const aboveTop = pt.py - gap - textH;
      const top = aboveTop < model.plot.y ? pt.py + gap : aboveTop;
      box = { left: pt.px, top, align: 'center', transform: 'translateX(-50%)' };
    } else {
      const axis: Axis = ann.axis === 'x' ? 'x' : 'y';
      const p = anchorPixel(model, ann, axis, kindOf(ann));
      if (p === undefined) continue;
      box = labelBox(model, drawsHorizontalRule(model, axis), ann.labelPosition ?? 'end', p);
    }

    const color = ann.color ?? tokens.color.text;
    const pill = { background: withAlpha(tokens.color.background, 0.72), radius: 3, padX: 3, padY: 1 };

    if (surface.headless) {
      paintCanvasText(
        surface.marks.ctx,
        overlayTextToCanvasCmd(
          {
            left: box.left,
            top: box.top,
            width: box.width ?? undefined,
            text: ann.label,
            color,
            size: f.size.small,
            align: box.align,
            transform: box.transform,
            pill,
          },
          font,
        ),
      );
      continue;
    }

    const el = document.createElement('div');
    el.textContent = ann.label;
    el.style.position = 'absolute';
    el.style.font = font;
    el.style.fontSize = `${f.size.small}px`;
    el.style.fontWeight = String(f.weight.medium);
    el.style.color = color;
    el.style.whiteSpace = 'nowrap';
    el.style.left = `${box.left}px`;
    el.style.top = `${box.top}px`;
    if (box.width != null) {
      el.style.width = `${box.width}px`;
      el.style.textAlign = box.align;
    }
    el.style.transform = box.transform;
    // A faint backing pill keeps the label legible over data marks.
    el.style.padding = '0 3px';
    el.style.borderRadius = '3px';
    el.style.background = pill.background;
    el.style.pointerEvents = 'none';
    overlay.appendChild(el);
  }
}

/** Best-effort translucent background (handles #rgb/#rrggbb; falls back to the color). */
function withAlpha(color: string, alpha: number): string {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color);
  if (!m) return color;
  let hex = m[1];
  if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
