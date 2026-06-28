/**
 * Combo / dual-axis renderer.
 *
 * A custom renderer (it owns its full layout): it resolves a {@link ComboModel},
 * paints the shared left/x axis chrome via the existing `drawAxesUnderlay` /
 * `drawOverlay`, draws each layer with its native mark renderer, then adds the
 * secondary (right) axis. Hover/selection reuse the primary layer's interaction.
 */

import type { Surface } from '../render/surface';
import type { Size } from '../types';
import type { ChartSpec, ComboSpec } from '../spec/types';
import type { ThemeTokens } from '../theme';
import type { InteractionModel } from '../interaction/types';
import { buildCartesianInteraction } from '../interaction/cartesian';
import { fontString } from '../render/text';
import { overlayTextToCanvasCmd, paintCanvasText } from '../render/overlayText';
import { crisp } from '../util/math';
import { TICK_SIZE } from '../layout';
import { drawAxesUnderlay, drawOverlay } from '../axes';
import { buildComboModel, type ComboLayerModel, type ComboModel } from '../runtime/combo';
import type { RenderContext } from './index';
import { drawLine } from './line';
import { drawArea } from './area';
import { drawBar } from './bar';
import { drawScatter } from './scatter';

const MARK_RENDERERS = {
  line: drawLine,
  area: drawArea,
  bar: drawBar,
  scatter: drawScatter,
} as const;

/** Subtle right-axis tick marks on the marks canvas. */
function drawRightAxisMarks(surface: Surface, model: ComboModel): void {
  if (!model.right) return;
  const ctx = surface.marks.ctx;
  const { plot, tokens } = model;
  const x = plot.x + plot.width;
  ctx.save();
  ctx.strokeStyle = tokens.color.axis;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (const t of model.right.ticks) {
    const y = crisp(t.pos);
    ctx.moveTo(x, y);
    ctx.lineTo(x + TICK_SIZE, y);
  }
  ctx.stroke();
  ctx.restore();
}

/** Right y-axis tick labels + axis title in the HTML overlay. */
function drawRightAxisLabels(surface: Surface, model: ComboModel): void {
  if (!model.right) return;
  const { plot, tokens, frame } = model;
  const f = tokens.font;
  const smallFont = fontString(f.size.small, f.family, f.weight.normal);
  const labelLeft = plot.x + plot.width + TICK_SIZE + 4;

  if (surface.headless) {
    const ctx = surface.marks.ctx;
    for (const t of model.right.ticks) {
      paintCanvasText(ctx, {
        x: labelLeft,
        y: t.pos,
        text: t.label,
        font: smallFont,
        color: tokens.color.textMuted,
        size: f.size.small,
        baseline: 'middle',
      });
    }
    if (model.right.title) {
      const titleFont = fontString(f.size.base, f.family, f.weight.medium);
      paintCanvasText(
        ctx,
        overlayTextToCanvasCmd(
          {
            left: frame.width - Math.round(f.size.base * 0.4),
            top: plot.y + plot.height / 2,
            text: model.right.title,
            color: tokens.color.text,
            size: f.size.base,
            transform: 'translate(-50%, -50%) rotate(90deg)',
          },
          titleFont,
        ),
      );
    }
    return;
  }

  const overlay = surface.overlay;
  for (const t of model.right.ticks) {
    const el = document.createElement('div');
    el.textContent = t.label;
    el.style.position = 'absolute';
    el.style.left = `${labelLeft}px`;
    el.style.top = `${t.pos}px`;
    el.style.font = smallFont;
    el.style.fontSize = `${f.size.small}px`;
    el.style.color = tokens.color.textMuted;
    el.style.whiteSpace = 'nowrap';
    el.style.transform = 'translateY(-50%)';
    el.style.pointerEvents = 'none';
    overlay.appendChild(el);
  }

  if (model.right.title) {
    const el = document.createElement('div');
    el.textContent = model.right.title;
    el.style.position = 'absolute';
    el.style.left = `${frame.width - Math.round(f.size.base * 0.4)}px`;
    el.style.top = `${plot.y + plot.height / 2}px`;
    el.style.font = fontString(f.size.base, f.family, f.weight.medium);
    el.style.fontSize = `${f.size.base}px`;
    el.style.fontWeight = String(f.weight.medium);
    el.style.color = tokens.color.text;
    el.style.whiteSpace = 'nowrap';
    el.style.transform = 'translate(-50%, -50%) rotate(90deg)';
    el.style.pointerEvents = 'none';
    overlay.appendChild(el);
  }
}

export function drawCombo(
  surface: Surface,
  spec: ChartSpec,
  tokens: ThemeTokens,
  size: Size,
  context?: RenderContext,
): InteractionModel | void {
  const model = buildComboModel(spec as ComboSpec, tokens, size);
  const emphasis = context?.emphasis ?? null;
  for (const lm of model.layers) lm.model.emphasis = emphasis;

  // Gridlines + x baseline/ticks (primary axis), then the secondary axis marks.
  drawAxesUnderlay(surface, model.base);
  drawRightAxisMarks(surface, model);

  // Layer marks, in declaration order (later layers paint on top).
  for (const lm of model.layers) renderLayer(surface, lm);

  // Axis/title/legend text (primary axis) + the secondary axis labels.
  drawOverlay(surface, model.base);
  drawRightAxisLabels(surface, model);

  // Hover/selection from the primary layer (shared-x crosshair).
  return buildCartesianInteraction(model.layers[0]?.model ?? model.base) ?? undefined;
}

function renderLayer(surface: Surface, lm: ComboLayerModel): void {
  MARK_RENDERERS[lm.mark](surface, lm.model);
}
