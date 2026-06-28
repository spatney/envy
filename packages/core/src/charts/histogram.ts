/**
 * Histogram renderer.
 *
 * A custom renderer (it owns its layout): it resolves a {@link HistogramModel},
 * paints the shared axis chrome via the existing `drawAxesUnderlay` /
 * `drawOverlay`, then draws gapless frequency bars across the continuous x-axis.
 */

import type { Surface } from '../render/surface';
import type { Size } from '../types';
import type { ChartSpec, HistogramSpec } from '../spec/types';
import type { ThemeTokens } from '../theme';
import type { InteractionModel } from '../interaction/types';
import { roundedRect } from '../shape';
import { RoughPen } from '../rough';
import { drawAxesUnderlay, drawOverlay } from '../axes';
import { buildHistogramModel, type HistogramModel } from '../runtime/histogram';
import type { RenderContext } from './index';

/** Paint the per-bin frequency bars, edge-to-edge on the continuous x-axis. */
function drawBars(surface: Surface, model: HistogramModel): void {
  if (model.bins.length === 0) return;
  const ctx = surface.marks.ctx;
  const { plot } = model;
  const pen = model.sketch ? new RoughPen(ctx, model.sketch) : null;

  ctx.save();
  ctx.beginPath();
  ctx.rect(plot.x, plot.y, plot.width, plot.height);
  ctx.clip();

  for (const bin of model.bins) {
    const left = Math.min(model.xPixel(bin.start), model.xPixel(bin.end));
    const span = Math.abs(model.xPixel(bin.end) - model.xPixel(bin.start));
    // A 1px separator keeps adjacent bars legible once they are wide enough.
    const gap = span > 4 ? 1 : 0;
    const width = Math.max(0, span - gap);
    const top = model.yPixel(bin.value);
    const height = model.yBaseline - top;
    if (width <= 0 || height <= 0) continue;

    const x = left + gap / 2;
    if (pen) {
      pen.rect(x, top, width, height, { stroke: model.color, fill: model.color });
      continue;
    }
    const r = Math.min(model.cornerRadius, width / 2, height / 2);
    ctx.beginPath();
    roundedRect(ctx, x, top, width, height, [r, r, 0, 0]);
    ctx.fillStyle = model.color;
    ctx.fill();
  }

  ctx.restore();
}

export function drawHistogram(
  surface: Surface,
  spec: ChartSpec,
  tokens: ThemeTokens,
  size: Size,
  _context?: RenderContext,
): InteractionModel | void {
  const model = buildHistogramModel(spec as HistogramSpec, tokens, size);
  drawAxesUnderlay(surface, model.base);
  drawBars(surface, model);
  drawOverlay(surface, model.base);
}
